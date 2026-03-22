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
import { PairUniverse } from './domain/market/pairUniverse';
import { SignalEngine } from './domain/signals/signalEngine';
import { SettingsService } from './domain/settings/settingsService';
import { ExecutionEngine } from './domain/trading/executionEngine';
import { OrderManager } from './domain/trading/orderManager';
import { PositionManager } from './domain/trading/positionManager';
import { RiskEngine } from './domain/trading/riskEngine';

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

export interface AppRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

const startupLog = createChildLogger({ module: 'app-runtime' });

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
  const marketWatcher = new MarketWatcher(indodax, pairUniverse);
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

  const telegram = new TelegramBot({
    report,
    health,
    state,
    hotlist: hotlistService,
    positions: positionManager,
    orders: orderManager,
    accounts: accountRegistry,
    accountStore,
    settings,
    execution: executionEngine,
    journal,
    backtest,
    runtimeControl: {
      start: async () => {
        if (settings.get().workers.enabled) {
          await workerPool.start();
        }

        polling.start();
        await executionEngine.syncActiveOrders();
        await executionEngine.evaluateOpenPositions();
        await state.setStatus('RUNNING');

        await journal.info('RUNTIME_STARTED_FROM_TELEGRAM', 'runtime resumed from telegram control');
      },
      stop: async () => {
        polling.stop();
        await state.setStatus('STOPPED');
        await journal.info('RUNTIME_STOPPED_FROM_TELEGRAM', 'runtime paused from telegram control');
      },
    },
  });
  summary.attachNotifier(telegram);

  const buildTelegramNotes = (signal: TelegramConnectionSignal): string[] => [
    `telegramLaunched=${signal.launched}`,
    `telegramRuntime=${signal.running ? 'running' : 'stopped'}`,
    `telegramConnected=${signal.connected}`,
    `telegramLastLaunchAt=${signal.lastLaunchAt ?? '-'}`,
    `telegramLastLaunchSuccessAt=${signal.lastLaunchSuccessAt ?? '-'}`,
    `telegramLastLaunchError=${signal.lastLaunchError ?? '-'}`,
  ];

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

    const opportunities = await opportunityEngine.assessMany(snapshots, scored);
    for (const opportunity of opportunities) {
      await history.recordOpportunity(opportunity);
    }

    const hotlist = hotlistService.update(opportunities);

    await state.setSignals(scored);
    await state.setOpportunities(opportunities);
    await state.setHotlist(hotlist);
    await persistence.saveHotlistSnapshot(hotlist);
    await persistence.saveOpportunitySnapshot(opportunities);

    for (const snapshot of snapshots) {
      await positionManager.updateMark(snapshot.pair, snapshot.ticker.lastPrice);
      await state.markPairSeen(snapshot.pair);
    }

    const top = opportunities[0];

    if (top) {
      await state.markSignal(top.pair);
    }

    if (
      top &&
      currentSettings.tradingMode === 'FULL_AUTO' &&
      top.edgeValid &&
      top.recommendedAction === 'ENTER' &&
      top.pumpProbability >= currentSettings.strategy.minPumpProbability &&
      top.confidence >= currentSettings.strategy.minConfidence
    ) {
      try {
        await executionEngine.attemptAutoBuy(top);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown auto-buy failure';

        await journal.error('AUTO_BUY_FAILED', message, {
          pair: top.pair,
          action: top.recommendedAction,
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
      telegramRunning: telegramSignal.running && telegramSignal.connected,
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
      ],
    });
  });

  const start = async (): Promise<void> => {
    await state.setTradingMode(settings.get().tradingMode);
    await state.setStatus('STARTING');
    await health.build({
      scannerRunning: false,
      telegramRunning: false,
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
        telegramRunning:
          runningTelegramSignal.launched &&
          runningTelegramSignal.running &&
          runningTelegramSignal.connected,
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
        telegramRunning:
          failedTelegramSignal.launched &&
          failedTelegramSignal.running &&
          failedTelegramSignal.connected,
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
      telegramRunning:
        stoppingTelegramSignal.launched &&
        stoppingTelegramSignal.running &&
        stoppingTelegramSignal.connected,
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
      telegramRunning: telegramSignal.running && telegramSignal.connected,
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

  return { start, stop };
}
