import { env } from './config/env';
import { LightScheduler } from './core/scheduler';
import { registerShutdown } from './core/shutdown';
import { logger } from './core/logger';
import { AccountRegistry } from './domain/accounts/accountRegistry';
import { AccountStore } from './domain/accounts/accountStore';
import { SettingsService } from './domain/settings/settingsService';
import { IndodaxClient } from './integrations/indodax/client';
import { PersistenceService } from './services/persistenceService';
import { PollingService } from './services/pollingService';
import { StateService } from './services/stateService';
import { JournalService } from './services/journalService';

export async function createApp(): Promise<{ start: () => Promise<void>; stop: () => Promise<void> }> {
  const scheduler = new LightScheduler();
  const polling = new PollingService(scheduler);
  const persistence = new PersistenceService();
  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);
  const indodax = new IndodaxClient();

  await Promise.all(\[state.load(), settings.load(), journal.load(), accountRegistry.reload()]);

  polling.register('heartbeat', env.STATE\_FLUSH\_INTERVAL\_MS, async () => {
    const current = state.get();
    await state.patch({
      uptimeMs: current.startedAt ? Math.max(0, Date.now() - new Date(current.startedAt).getTime()) : current.uptimeMs,
      pollingStats: {
        ...current.pollingStats,
        tickCount: current.pollingStats.tickCount + 1,
        lastTickAt: new Date().toISOString(),
      },
    });
  });

  const start = async (): Promise<void> => {
    await state.setStarted(true);
    polling.start();
    logger.info({ accounts: accountRegistry.listEnabled().length }, 'mafiamarkets app started');
  };

  const stop = async (): Promise<void> => {
    polling.stop();
    await state.patch({ started: false, marketWatcherRunning: false });
    logger.info('mafiamarkets app stopped');
  };

  registerShutdown(\[stop]);

  void indodax;

  return { start, stop };
}
