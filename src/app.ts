import { logger } from './core/logger';
import { LightScheduler } from './core/scheduler';
import { registerShutdown } from './core/shutdown';
import { env } from './config/env';

import { AccountRegistry } from './domain/accounts/accountRegistry';
import { PairHistoryStore } from './domain/history/pairHistoryStore';
import { OpportunityEngine } from './domain/intelligence/opportunityEngine';
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
import { TelegramBot } from './integrations/telegram/bot';

import { HealthService } from './services/healthService';
import { JournalService } from './services/journalService';
import { PersistenceService } from './services/persistenceService';
import { PollingService } from './services/pollingService';
import { ReportService } from './services/reportService';
import { StateService } from './services/stateService';

export interface AppRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createApp(): Promise<AppRuntime> {
  const scheduler = new LightScheduler();
  const polling = new PollingService(scheduler);

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);

  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);

  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const health = new HealthService(persistence, state);
  const report = new ReportService();

  await Promise.all([
    state.load(),
    settings.load(),
    journal.load(),
    orderManager.load(),
    positionManager.load(),
    accountRegistry.initialize(),
    health.load(),
  ]);

  const pairUniverse = new PairUniverse();
  const indodax = new IndodaxClient();
  const marketWatcher = new MarketWatcher(indodax, pairUniverse);
  const history = new PairHistoryStore(persistence);
  const signalEngine = new SignalEngine(pairUniverse);
  const opportunityEngine = new OpportunityEngine(history);
  const hotlistService = new HotlistService();
  const riskEngine = new RiskEngine();

  const executionEngine = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    riskEngine,
    indodax,
    positionManager,
    orderManager,
    journal,
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
  });

  polling.register('market-scan', env.pollingIntervalMs, async () => {
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

  polling.register('position-monitor', 5_000, async () => {
    const runtime = state.get();

    if (runtime.status !== 'RUNNING' || runtime.emergencyStop) {
      return;
    }

    await executionEngine.evaluateOpenPositions();
  });

  polling.register('health-heartbeat', 5_000, async () => {
    const runtime = state.get();

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
      telegramRunning: true,
      tradingEnabled: settings.get().tradingMode !== 'OFF' && !runtime.emergencyStop,
      positions: positionManager.list(),
      orders: orderManager.list(),
      notes: [
        `mode=${settings.get().tradingMode}`,
        `accountsEnabled=${accountRegistry.countEnabled()}`,
        `hotlistCount=${state.get().lastHotlist.length}`,
        `tradeCount=${state.get().tradeCount}`,
      ],
    });
  });

  const start = async (): Promise<void> => {
    await state.setTradingMode(settings.get().tradingMode);
    await state.setStatus('STARTING');

    await telegram.start();
    polling.start();

    await state.setStatus('RUNNING');

    await journal.info('APP_STARTED', 'mafiamarkets app started', {
      mode: settings.get().tradingMode,
      activeAccounts: accountRegistry.countEnabled(),
    });

    logger.info(
      {
        mode: settings.get().tradingMode,
        activeAccounts: accountRegistry.countEnabled(),
      },
      'mafiamarkets app started',
    );
  };

  const stop = async (): Promise<void> => {
    await state.setStatus('STOPPING');

    polling.stop();
    await telegram.stop();

    await state.setStatus('STOPPED');

    await health.build({
      scannerRunning: false,
      telegramRunning: false,
      tradingEnabled: false,
      positions: positionManager.list(),
      orders: orderManager.list(),
      notes: ['shutdown'],
    });

    await journal.info('APP_STOPPED', 'mafiamarkets app stopped');
    logger.info('mafiamarkets app stopped');
  };

  registerShutdown([stop]);

  return { start, stop };
}
