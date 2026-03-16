import { logger } from './core/logger';
import { LightScheduler } from './core/scheduler';
import { registerShutdown } from './core/shutdown';
import { AccountRegistry } from './domain/accounts/accountRegistry';
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

export async function createApp(): Promise<{ start: () => Promise<void>; stop: () => Promise<void> }> {
  const scheduler = new LightScheduler();
  const polling = new PollingService(scheduler);
  const persistence = new PersistenceService();
  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);

  await Promise.all(\[
    state.load(),
    settings.load(),
    journal.load(),
    orderManager.load(),
    positionManager.load(),
    accountRegistry.reload(),
  ]);

  const report = new ReportService();
  const health = new HealthService(state);
  const universe = new PairUniverse();
  const indodax = new IndodaxClient();
  const watcher = new MarketWatcher(indodax, universe);
  const signals = new SignalEngine(universe);
  const hotlist = new HotlistService();
  const risk = new RiskEngine();
  const execution = new ExecutionEngine(accountRegistry, settings, state, risk, indodax, positionManager, orderManager, journal);

  const telegram = new TelegramBot({
    report,
    health,
    state,
    hotlist,
    positions: positionManager,
    orders: orderManager,
    accounts: accountRegistry,
    accountStore,
    settings,
    execution,
    journal,
  });

  polling.register('market-watch', 2500, async () => {
    if (!state.get().started) {
      return;
    }
    const bundles = await watcher.batchSnapshot(4);
    for (const bundle of bundles) {
      await positionManager.updateMark(bundle.pair, bundle.ticker.lastPrice);
    }
    const scored = signals.scoreMany(bundles);
    const list = hotlist.update(scored);
    await persistence.saveHotlist(list);
    await persistence.savePairMetrics(universe.exportMetrics(watcher.exportHistory()));
    if (list\[0]) {
      await state.markSignal();
    }
    if (list\[0] \&\& settings.get().tradingMode === 'FULL\_AUTO' \&\& list\[0].score >= settings.get().strategy.scoreAutoEntryThreshold) {
      try {
        const result = await execution.attemptAutoBuy(list\[0]);
        logger.info({ result, pair: list\[0].pair }, 'auto-buy evaluated');
      } catch (error) {
        await state.markError(error instanceof Error ? error.message : 'auto-buy error');
      }
    }
  });

  polling.register('position-exit-check', 5000, async () => {
    if (!state.get().started) {
      return;
    }
    const exits = await execution.evaluateOpenPositions();
    if (exits.length) {
      logger.info({ exits }, 'position exits executed');
    }
  });

  polling.register('heartbeat', 5000, async () => {
    const current = state.get();
    await state.patch({
      uptimeMs: current.startedAt ? Math.max(0, Date.now() - new Date(current.startedAt).getTime()) : current.uptimeMs,
      pollingStats: {
        activeJobs: polling.stats().activeJobs,
        jobs: undefined as never,
        tickCount: current.pollingStats.tickCount + 1,
        lastTickAt: new Date().toISOString(),
      } as any,
    });
  });

  const start = async (): Promise<void> => {
    await state.setStarted(true);
    polling.start();
    await telegram.start();
    logger.info({ accounts: accountRegistry.listEnabled().length }, 'mafiamarkets app started');
  };

  const stop = async (): Promise<void> => {
    polling.stop();
    await telegram.stop();
    await state.patch({ started: false, marketWatcherRunning: false });
    logger.info('mafiamarkets app stopped');
  };

  registerShutdown(\[stop]);

  return { start, stop };
}
