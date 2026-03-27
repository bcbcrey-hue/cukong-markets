import { createChildLogger, logger } from './core/logger';
import { LightScheduler } from './core/scheduler';
import { registerShutdown } from './core/shutdown';
import { env, getIndodaxHistoryMode } from './config/env';
import { toError } from './core/error-utils';

import { AccountRegistry } from './domain/accounts/accountRegistry';
import { PairHistoryStore } from './domain/history/pairHistoryStore';
import { OpportunityEngine } from './domain/intelligence/opportunityEngine';
import { BacktestEngine } from './domain/backtest/backtestEngine';
import { WorkerPoolService } from './services/workerPoolService';
import { AccountStore } from './domain/accounts/accountStore';
import { HotlistService } from './domain/market/hotlistService';
import { MarketWatcher } from './domain/market/marketWatcher';
import { buildDiscoveryObservabilityNotes } from './domain/market/discoveryObservability';
import { PairUniverse } from './domain/market/pairUniverse';
import { PumpCandidateWatch } from './domain/market/pumpCandidateWatch';
import { SignalEngine } from './domain/signals/signalEngine';
import { SettingsService } from './domain/settings/settingsService';
import { ExecutionEngine } from './domain/trading/executionEngine';
import { OrderManager } from './domain/trading/orderManager';
import { PositionManager } from './domain/trading/positionManager';
import { RiskEngine } from './domain/trading/riskEngine';
import { evaluateOpportunityPolicyV1 } from './domain/decision/decisionPolicyEngine';

import { IndodaxClient } from './integrations/indodax/client';
import { IndodaxCallbackServer } from './integrations/indodax/callbackServer';
import { TelegramBot, type TelegramConnectionSignal } from './integrations/telegram/bot';

import { HealthService } from './services/healthService';
import { JournalService } from './services/journalService';
import { PersistenceService } from './services/persistenceService';
import { PollingService } from './services/pollingService';
import { ReportService } from './services/reportService';
import { StateService } from './services/stateService';
import { SummaryService } from './services/summaryService';
import { AppServer } from './server/appServer';
import type {
  BotSettings,
  OpportunityAssessment,
  PairClass,
  PositionRecord,
  RuntimeEntryCandidate,
  StoredAccount,
} from './core/types';

export interface AppRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  startRuntimeFromControl(): Promise<void>;
  stopRuntimeFromControl(): Promise<void>;
}

const startupLog = createChildLogger({ module: 'app-runtime' });

const pairClassPriority: Record<PairClass, number> = {
  MICRO: 0,
  MID: 1,
  MAJOR: 2,
};

function sortByPairClassThenScore(
  a: OpportunityAssessment,
  b: OpportunityAssessment,
): number {
  const aClassPriority = pairClassPriority[a.pairClass ?? 'MAJOR'] ?? 3;
  const bClassPriority = pairClassPriority[b.pairClass ?? 'MAJOR'] ?? 3;

  if (aClassPriority !== bClassPriority) {
    return aClassPriority - bClassPriority;
  }

  return b.finalScore - a.finalScore;
}

function runtimeLanePriority(candidate: RuntimeEntryCandidate): number {
  if (candidate.policyDecision.entryLane === 'SCOUT' && candidate.opportunity.discoveryBucket === 'ANOMALY') {
    return 0;
  }
  if (candidate.policyDecision.entryLane === 'SCOUT' && candidate.opportunity.discoveryBucket === 'STEALTH') {
    return 1;
  }
  if (candidate.policyDecision.entryLane === 'ADD_ON_CONFIRM') {
    return 2;
  }
  return 3;
}

function sortRuntimeCandidates(
  a: RuntimeEntryCandidate,
  b: RuntimeEntryCandidate,
): number {
  const laneDelta = runtimeLanePriority(a) - runtimeLanePriority(b);
  if (laneDelta !== 0) {
    return laneDelta;
  }

  return sortByPairClassThenScore(a.opportunity, b.opportunity);
}

export function buildRuntimeEntryCandidates(
  opportunities: OpportunityAssessment[],
  settings: BotSettings,
  riskEngine: RiskEngine,
  defaultAccount: StoredAccount,
  accountOpenPositions: PositionRecord[],
  pairCooldowns: Record<string, number>,
): RuntimeEntryCandidate[] {
  return opportunities.map((opportunity) => {
    const preRiskDecision = evaluateOpportunityPolicyV1(opportunity, settings);
    const riskCheckResult = riskEngine.checkCanEnter({
      account: defaultAccount,
      settings,
      signal: opportunity,
      openPositions: accountOpenPositions,
      amountIdr: settings.risk.maxPositionSizeIdr,
      cooldownUntil: pairCooldowns[opportunity.pair] ?? null,
      policyDecision: preRiskDecision,
    });
    const policyDecision = evaluateOpportunityPolicyV1(opportunity, settings, riskCheckResult);

    return {
      pair: opportunity.pair,
      opportunity,
      riskCheckResult,
      policyDecision,
      policyReasons: policyDecision.reasons,
      sizeMultiplier: policyDecision.sizeMultiplier,
      aggressiveness: policyDecision.aggressiveness,
    };
  });
}

export function selectRuntimeEntryCandidate(
  candidates: RuntimeEntryCandidate[],
): RuntimeEntryCandidate | undefined;
export function selectRuntimeEntryCandidate(
  opportunities: OpportunityAssessment[],
  settings: BotSettings,
): OpportunityAssessment | undefined;
export function selectRuntimeEntryCandidate(
  candidatesOrOpportunities: RuntimeEntryCandidate[] | OpportunityAssessment[],
  settings?: BotSettings,
): RuntimeEntryCandidate | OpportunityAssessment | undefined {
  const runtimeCandidates = settings
    ? (candidatesOrOpportunities as OpportunityAssessment[]).map((opportunity) => {
      const policyDecision = evaluateOpportunityPolicyV1(opportunity, settings);
      return {
        pair: opportunity.pair,
        opportunity,
        riskCheckResult: {
          allowed: true,
          reasons: [],
          warnings: [],
          entryLane: policyDecision.entryLane,
        },
        policyDecision,
        policyReasons: policyDecision.reasons,
        sizeMultiplier: policyDecision.sizeMultiplier,
        aggressiveness: policyDecision.aggressiveness,
      } satisfies RuntimeEntryCandidate;
    })
    : (candidatesOrOpportunities as RuntimeEntryCandidate[]);

  const selected = runtimeCandidates
    .filter((candidate) => candidate.policyDecision.action === 'ENTER' && candidate.riskCheckResult.allowed)
    .sort(sortRuntimeCandidates)[0];

  if (!selected) {
    return undefined;
  }

  return settings ? selected.opportunity : selected;
}

async function runStartupPhase<T>(phase: string, task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  startupLog.info({ phase }, 'app startup phase started');

  try {
    const result = await task();
    startupLog.info({ phase, durationMs: Date.now() - startedAt }, 'app startup phase completed');
    return result;
  } catch (error) {
    const wrappedError = new Error(`app startup phase failed: ${phase}`, {
      cause: toError(error),
    });

    startupLog.error(
      {
        phase,
        durationMs: Date.now() - startedAt,
        error: wrappedError,
      },
      'app startup phase failed',
    );

    throw wrappedError;
  }
}

export async function createApp(): Promise<AppRuntime> {
  const scheduler = new LightScheduler();
  const polling = new PollingService(scheduler);

  const persistence = new PersistenceService();
  await runStartupPhase('persistence.bootstrap', async () => persistence.bootstrap());

  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const workerPool = new WorkerPoolService();

  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);

  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const health = new HealthService(persistence, state);
  const report = new ReportService();
  const summary = new SummaryService(persistence, journal, report, accountRegistry);
  const appServer = new AppServer(health);

  await runStartupPhase('runtime.state.load', async () => {
    await Promise.all([
      state.load(),
      settings.load(),
      journal.load(),
      orderManager.load(),
      positionManager.load(),
      accountRegistry.initialize(),
      health.load(),
    ]);
  });

  const pairUniverse = new PairUniverse();
  const indodax = new IndodaxClient();
  const marketWatcher = new MarketWatcher(indodax, pairUniverse, () => settings.get().scanner.discovery);
  const history = new PairHistoryStore(persistence);
  const signalEngine = new SignalEngine(pairUniverse);
  const opportunityEngine = new OpportunityEngine(
    history,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    workerPool,
  );
  const hotlistService = new HotlistService();
  hotlistService.rehydrate(state.get().lastHotlist);
  const pumpCandidateWatch = new PumpCandidateWatch();
  const riskEngine = new RiskEngine();
  const backtest = new BacktestEngine(persistence, workerPool);

  const executionEngine = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    riskEngine,
    indodax,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const callbackServer = new IndodaxCallbackServer(
    persistence,
    journal,
    async (payload) => {
      const exchangeOrderId = payload?.order_id ?? payload?.orderId ?? payload?.id;
      if (!exchangeOrderId) {
        return;
      }

      await executionEngine.reconcileFromCallback({
        exchangeOrderId: String(exchangeOrderId),
        pair: typeof payload?.pair === 'string' ? payload.pair : null,
        status: typeof payload?.status === 'string' ? payload.status : null,
      });
    },
  );

  const startRuntimeFromControl = async (): Promise<void> => {
    if (settings.get().workers.enabled) {
      await workerPool.start();
    }

    polling.start();
    await executionEngine.syncActiveOrders();
    await executionEngine.evaluateOpenPositions();
    await state.setStatus('RUNNING');
    const resumedTelegramSignal = telegram.getConnectionSignal();
    await health.build({
      scannerRunning: true,
      telegramConfigured: resumedTelegramSignal.configured,
      telegramRunning: isTelegramOperational(resumedTelegramSignal),
      telegramConnection: toHealthTelegramConnection(resumedTelegramSignal),
      callbackServerRunning:
        appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
      tradingEnabled: settings.get().tradingMode !== 'OFF' && !state.get().emergencyStop,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: [...buildTelegramNotes(resumedTelegramSignal), 'runtime-control-start', 'readiness=ready'],
    });

    await journal.info('RUNTIME_STARTED_FROM_TELEGRAM', 'runtime resumed from telegram control');
  };

  const stopRuntimeFromControl = async (): Promise<void> => {
    polling.stop();
    await state.setStatus('STOPPED');
    const stoppedTelegramSignal = telegram.getConnectionSignal();
    await health.build({
      scannerRunning: false,
      telegramConfigured: stoppedTelegramSignal.configured,
      telegramRunning: isTelegramOperational(stoppedTelegramSignal),
      telegramConnection: toHealthTelegramConnection(stoppedTelegramSignal),
      callbackServerRunning:
        appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
      tradingEnabled: false,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: [...buildTelegramNotes(stoppedTelegramSignal), 'runtime-control-stop', 'readiness=not-ready'],
    });
    await journal.info('RUNTIME_STOPPED_FROM_TELEGRAM', 'runtime paused from telegram control');
  };

  const telegram = new TelegramBot({
    report,
    health,
    state,
    positions: positionManager,
    orders: orderManager,
    accounts: accountRegistry,
    accountStore,
    settings,
    execution: executionEngine,
    journal,
    backtest,
    runtimeControl: {
      start: startRuntimeFromControl,
      stop: stopRuntimeFromControl,
    },
  });
  summary.attachNotifier(telegram);

  const buildTelegramNotes = (signal: TelegramConnectionSignal): string[] => [
    `telegramConfigured=${signal.configured}`,
    `telegramLaunched=${signal.launched}`,
    `telegramRuntime=${signal.running ? 'running' : 'stopped'}`,
    `telegramConnected=${signal.connected}`,
    `telegramLastConnectionStatus=${signal.lastConnectionStatus}`,
    `telegramBotId=${signal.botId ?? '-'}`,
    `telegramBotUsername=${signal.botUsername ?? '-'}`,
    `telegramBotFirstName=${signal.botFirstName ?? '-'}`,
    `telegramBotIsBot=${signal.botIsBot === null ? '-' : signal.botIsBot}`,
    `telegramLastLaunchAt=${signal.lastLaunchAt ?? '-'}`,
    `telegramLastConnectedAt=${signal.lastConnectedAt ?? '-'}`,
    `telegramLastLaunchSuccessAt=${signal.lastLaunchSuccessAt ?? '-'}`,
    `telegramLastLaunchError=${signal.lastLaunchError ?? '-'}`,
    `telegramLastLaunchErrorType=${signal.lastLaunchErrorType}`,
    `telegramAllowedUsersCount=${signal.allowedUsersCount}`,
  ];

  const isTelegramOperational = (signal: TelegramConnectionSignal): boolean =>
    signal.configured &&
    signal.launched &&
    signal.running &&
    signal.connected;

  const toHealthTelegramConnection = (
    signal?: TelegramConnectionSignal,
  ): TelegramConnectionSignal => signal ?? {
    configured: Boolean(env.telegramToken),
    launched: false,
    running: false,
    connected: false,
    lastConnectionStatus: 'never_started',
    allowedUsersCount: env.telegramAllowedUserIds.length,
    botId: null,
    botUsername: null,
    botFirstName: null,
    botIsBot: null,
    lastLaunchAt: null,
    lastConnectedAt: null,
    lastLaunchSuccessAt: null,
    lastLaunchError: null,
    lastLaunchErrorType: 'none',
  };

  const toPositionPumpState = (
    opportunityPumpState?: OpportunityAssessment['pumpState'],
  ): 'ACTIVE' | 'WEAKENING' | 'DISTRIBUTING' | 'COLLAPSING' => {
    if (opportunityPumpState === 'DUMP_RISK') {
      return 'COLLAPSING';
    }
    if (opportunityPumpState === 'OVEREXTENDED') {
      return 'DISTRIBUTING';
    }
    if (opportunityPumpState === 'PRE_PUMP') {
      return 'WEAKENING';
    }
    return 'ACTIVE';
  };

  const runtimePollingIntervalMs = settings.get().scanner.pollingIntervalMs;
  const marketScanIntervalMs = settings.get().scanner.marketWatchIntervalMs;

  polling.register('market-scan', marketScanIntervalMs, async () => {
    const runtime = state.get();
    const currentSettings = settings.get();

    if (
      runtime.status !== 'RUNNING' ||
      runtime.emergencyStop ||
      !currentSettings.scanner.enabled
    ) {
      return;
    }

    const scanLimit = Math.min(
      currentSettings.scanner.maxPairsTracked,
      Math.max(currentSettings.scanner.hotlistLimit * 2, 12),
    );

    const snapshots = await marketWatcher.batchSnapshot(scanLimit);
    for (const snapshot of snapshots) {
      await history.recordSnapshot(snapshot);
    }

    const scored = signalEngine.scoreMany(snapshots);
    for (const signal of scored) {
      await history.recordSignal(signal);
    }

    const marketOverview = pumpCandidateWatch.buildMarketOverview(scored);
    const candidateLimit = Math.min(
      scanLimit,
      Math.max(currentSettings.scanner.hotlistLimit * 2, currentSettings.scanner.hotlistLimit),
    );
    const pumpCandidates = pumpCandidateWatch.buildCandidateFeed(
      scored,
      candidateLimit,
      currentSettings.scanner.discovery.majorPairMaxShare,
    );
    const candidatePairs = new Set(pumpCandidates.map((item) => item.pair));
    const candidateSnapshots = snapshots.filter((snapshot) => candidatePairs.has(snapshot.pair));

    const opportunities = await opportunityEngine.assessMany(candidateSnapshots, pumpCandidates);
    for (const opportunity of opportunities) {
      await history.recordOpportunity(opportunity);
    }

    const hotlist = hotlistService.update(opportunities);

    await state.setMarketOverview(marketOverview);
    await state.setPumpCandidates(pumpCandidates);
    await state.setSignals(scored);
    await state.setOpportunities(opportunities);
    await state.setHotlist(hotlist);
    await persistence.saveHotlistSnapshot(hotlist);
    await persistence.saveOpportunitySnapshot(opportunities);

    const opportunitiesByPair = new Map(opportunities.map((item) => [item.pair, item]));
    for (const snapshot of snapshots) {
      const pairOpportunity = opportunitiesByPair.get(snapshot.pair);
      await positionManager.updateMark(snapshot.pair, snapshot.ticker.lastPrice, {
        continuationScore: pairOpportunity?.continuationProbability,
        dumpRisk: pairOpportunity?.trapProbability,
        pumpState: toPositionPumpState(pairOpportunity?.pumpState),
        emergencyExitArmed: (pairOpportunity?.trapProbability ?? 0) >= 0.85,
      });
      await state.markPairSeen(snapshot.pair);
    }

    const defaultAccount = accountRegistry.getDefault();
    const runtimeCandidates = defaultAccount
      ? buildRuntimeEntryCandidates(
        opportunities,
        currentSettings,
        riskEngine,
        defaultAccount,
        positionManager.listOpen().filter((position) => position.accountId === defaultAccount.id),
        state.get().pairCooldowns,
      )
      : [];
    const selectedRuntimeCandidate = selectRuntimeEntryCandidate(runtimeCandidates);

    if (selectedRuntimeCandidate) {
      await state.markSignal(selectedRuntimeCandidate.pair);
    }

    if (
      selectedRuntimeCandidate &&
      currentSettings.tradingMode === 'FULL_AUTO'
    ) {
      try {
        await executionEngine.attemptAutoBuy(selectedRuntimeCandidate);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown auto-buy failure';

        await journal.error('AUTO_BUY_FAILED', message, {
          pair: selectedRuntimeCandidate.pair,
          action: selectedRuntimeCandidate.policyDecision.action,
          entryLane: selectedRuntimeCandidate.policyDecision.entryLane,
        });
      }
    }
  });

  polling.register('position-monitor', runtimePollingIntervalMs, async () => {
    const runtime = state.get();

    if (runtime.status !== 'RUNNING' || runtime.emergencyStop) {
      return;
    }

    await executionEngine.syncActiveOrders();
    await executionEngine.evaluateOpenPositions();
  });

  polling.register('health-heartbeat', runtimePollingIntervalMs, async () => {
    const runtime = state.get();
    const telegramSignal = telegram.getConnectionSignal();

    await state.patch({
      uptimeMs: runtime.startedAt
        ? Math.max(0, Date.now() - new Date(runtime.startedAt).getTime())
        : runtime.uptimeMs,
      pollingStats: {
        activeJobs: polling.stats().activeJobs,
        tickCount: runtime.pollingStats.tickCount + 1,
        lastTickAt: new Date().toISOString(),
      },
    });

    await health.build({
      scannerRunning: runtime.status === 'RUNNING',
      telegramConfigured: telegramSignal.configured,
      telegramRunning: isTelegramOperational(telegramSignal),
      telegramConnection: toHealthTelegramConnection(telegramSignal),
      callbackServerRunning: appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
      tradingEnabled: settings.get().tradingMode !== 'OFF' && !runtime.emergencyStop,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: [
        ...buildTelegramNotes(telegramSignal),
        `mode=${settings.get().tradingMode}`,
        `executionFlags=dryRun:${settings.get().dryRun},paperTrade:${settings.get().paperTrade},uiOnly:${settings.get().uiOnly}`,
        `accountsEnabled=${accountRegistry.countEnabled()}`,
        `hotlistCount=${state.get().lastHotlist.length}`,
        `tradeCount=${state.get().tradeCount}`,
        `historyMode=${getIndodaxHistoryMode()}`,
        `historyRuntime=${getIndodaxHistoryMode() === 'legacy' ? 'LEGACY_EXPLICIT' : 'V2_CANONICAL'}`,
        `workersEnabled=${settings.get().workers.enabled}`,
        `marketScanIntervalMs=${marketScanIntervalMs}`,
        `runtimePollingIntervalMs=${runtimePollingIntervalMs}`,
        ...buildDiscoveryObservabilityNotes(
          marketWatcher.getLastDiscoverySummary(),
          settings.get().scanner.discovery,
        ),
      ],
    });
  });

  const start = async (): Promise<void> => {
    await state.setTradingMode(settings.get().tradingMode);
    await state.setStatus('STARTING');
    await health.build({
      scannerRunning: false,
      telegramConfigured: Boolean(env.telegramToken),
      telegramRunning: false,
      telegramConnection: toHealthTelegramConnection(),
      callbackServerRunning: false,
      tradingEnabled: false,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: ['startup', 'runtime=STARTING', 'readiness=pending'],
    });

    try {
      if (settings.get().workers.enabled) {
        await runStartupPhase('worker-pool.start', async () => workerPool.start());
      } else {
        startupLog.info({ phase: 'worker-pool.start', enabled: false }, 'worker pool disabled by settings');
      }

      await runStartupPhase('app-server.start', async () => appServer.start());

      if (env.indodaxEnableCallbackServer) {
        await runStartupPhase('callback-server.start', async () => callbackServer.start());
      } else {
        startupLog.info({ phase: 'callback-server.start', enabled: false }, 'callback server disabled by env');
      }

      await runStartupPhase('execution.recover-live-orders', async () => {
        await executionEngine.recoverLiveOrdersOnStartup();
      });
      await runStartupPhase('execution.evaluate-open-positions', async () => {
        await executionEngine.evaluateOpenPositions();
      });
      await runStartupPhase('telegram.start', async () => telegram.start());

      startupLog.info({ phase: 'polling.start' }, 'app startup phase completed');
      polling.start();

      await state.setStatus('RUNNING');
      const runningTelegramSignal = telegram.getConnectionSignal();
      await health.build({
        scannerRunning: true,
        telegramConfigured: runningTelegramSignal.configured,
        telegramRunning: isTelegramOperational(runningTelegramSignal),
        telegramConnection: toHealthTelegramConnection(runningTelegramSignal),
        callbackServerRunning:
          appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
        tradingEnabled: settings.get().tradingMode !== 'OFF' && !state.get().emergencyStop,
        executionMode: settings.getExecutionMode(),
        positions: positionManager.list(),
        orders: orderManager.list(),
        workers: workerPool.snapshot(),
        notes: [...buildTelegramNotes(runningTelegramSignal), 'startup-complete', 'readiness=ready'],
      });

      await journal.info('APP_STARTED', 'cukong-markets app started', {
        mode: settings.get().tradingMode,
        executionMode: settings.getExecutionMode(),
        dryRun: settings.get().dryRun,
        paperTrade: settings.get().paperTrade,
        uiOnly: settings.get().uiOnly,
        activeAccounts: accountRegistry.countEnabled(),
        appPort: appServer.getPort(),
        callbackEnabled: env.indodaxEnableCallbackServer,
        callbackPort: env.indodaxEnableCallbackServer ? callbackServer.getPort() : null,
        historyMode: getIndodaxHistoryMode(),
        marketScanIntervalMs,
        runtimePollingIntervalMs,
      });

      logger.info(
        {
          mode: settings.get().tradingMode,
          executionMode: settings.getExecutionMode(),
          dryRun: settings.get().dryRun,
          paperTrade: settings.get().paperTrade,
          uiOnly: settings.get().uiOnly,
          activeAccounts: accountRegistry.countEnabled(),
          workers: workerPool.snapshot().length,
          appPort: appServer.getPort(),
          callbackEnabled: env.indodaxEnableCallbackServer,
          callbackPort: env.indodaxEnableCallbackServer ? callbackServer.getPort() : null,
          historyMode: getIndodaxHistoryMode(),
          marketScanIntervalMs,
          runtimePollingIntervalMs,
        },
        'cukong-markets app started',
      );
    } catch (error) {
      await state.setStatus('ERROR');
      const failedTelegramSignal = telegram.getConnectionSignal();
      await health.build({
        scannerRunning: false,
        telegramConfigured: failedTelegramSignal.configured,
        telegramRunning: isTelegramOperational(failedTelegramSignal),
        telegramConnection: toHealthTelegramConnection(failedTelegramSignal),
        callbackServerRunning:
          appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
        tradingEnabled: false,
        executionMode: settings.getExecutionMode(),
        positions: positionManager.list(),
        orders: orderManager.list(),
        workers: workerPool.snapshot(),
        notes: [...buildTelegramNotes(failedTelegramSignal), 'startup-failed', 'runtime=ERROR'],
      });
      startupLog.error({ error }, 'app start failed');
      throw error;
    }
  };

  const stop = async (): Promise<void> => {
    await state.setStatus('STOPPING');
    const stoppingTelegramSignal = telegram.getConnectionSignal();
    await health.build({
      scannerRunning: false,
      telegramConfigured: stoppingTelegramSignal.configured,
      telegramRunning: isTelegramOperational(stoppingTelegramSignal),
      telegramConnection: toHealthTelegramConnection(stoppingTelegramSignal),
      callbackServerRunning:
        appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
      tradingEnabled: false,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: [...buildTelegramNotes(stoppingTelegramSignal), 'shutdown-started', 'runtime=STOPPING'],
    });

    polling.stop();
    await telegram.stop();
    await callbackServer.stop();
    await appServer.stop();
    await workerPool.stop();

    await state.setStatus('STOPPED');

    const telegramSignal = telegram.getConnectionSignal();

    await health.build({
      scannerRunning: false,
      telegramConfigured: telegramSignal.configured,
      telegramRunning: isTelegramOperational(telegramSignal),
      telegramConnection: toHealthTelegramConnection(telegramSignal),
      callbackServerRunning:
        appServer.isRunning() && (!env.indodaxEnableCallbackServer || callbackServer.isRunning()),
      tradingEnabled: false,
      executionMode: settings.getExecutionMode(),
      positions: positionManager.list(),
      orders: orderManager.list(),
      workers: workerPool.snapshot(),
      notes: [...buildTelegramNotes(telegramSignal), 'shutdown'],
    });

    await journal.info('APP_STOPPED', 'cukong-markets app stopped');
    logger.info('cukong-markets app stopped');
  };

  registerShutdown([stop]);

  return { start, stop, startRuntimeFromControl, stopRuntimeFromControl };
}
