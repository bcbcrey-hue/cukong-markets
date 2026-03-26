import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildCallback } from '../src/integrations/telegram/callbackRouter';
import { registerHandlers } from '../src/integrations/telegram/handlers';
import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService } from '../src/services/persistenceService';

type Handler = (ctx: any) => Promise<void> | void;

class FakeBot {
  public actionHandler: Handler | null = null;
  public textHandler: Handler | null = null;

  start(_handler: Handler) {}
  hears(_trigger: unknown, _handler: Handler) {}

  action(_pattern: unknown, handler: Handler) {
    this.actionHandler = handler;
  }

  on(event: string, handler: Handler) {
    if (event === 'text') {
      this.textHandler = handler;
    }
  }
}

function createActionContext(callbackData: string, replies: string[]) {
  return {
    from: { id: 1 },
    callbackQuery: { data: callbackData },
    reply: async (text: string) => {
      replies.push(text);
    },
    answerCbQuery: async () => undefined,
  };
}

function createTextContext(messageText: string, replies: string[]) {
  return {
    from: { id: 1 },
    message: { text: messageText },
    reply: async (text: string) => {
      replies.push(text);
    },
  };
}

function createDeps(settings: SettingsService) {
  const noopAsync = async () => undefined;
  const noopText = () => '';
  return {
    report: {
      statusText: noopText,
      marketWatchText: noopText,
      hotlistText: noopText,
      intelligenceReportText: noopText,
      spoofRadarText: noopText,
      patternMatchText: noopText,
      positionsText: noopText,
      ordersText: noopText,
      signalBreakdownText: noopText,
      backtestSummaryText: noopText,
      accountsText: noopText,
      shadowRunStatusText: noopText,
    },
    health: { build: async () => ({}), get: () => ({ callbackServerRunning: true }) },
    state: {
      get: () => ({
        status: 'STOPPED',
        emergencyStop: false,
        lastMarketOverview: null,
        lastHotlist: [],
        lastOpportunities: [],
      }),
      setStatus: noopAsync,
      setTradingMode: noopAsync,
    },
    positions: { list: () => [], listOpen: () => [], getById: () => undefined },
    orders: { list: () => [] },
    accounts: {
      listEnabled: () => [],
      listAll: () => [],
      reload: noopAsync,
      getStoragePath: () => '/tmp/probe',
      getDefault: () => ({ id: 'acc-1' }),
    },
    settings,
    execution: {
      triggerShadowRunFromTelegram: () => ({}),
      getShadowRunTelegramSummary: () => ({}),
      manualSell: async () => 'ok',
      cancelAllOrders: async () => 'ok',
      sellAllPositions: async () => 'ok',
      buy: async () => 'ok',
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => 'ok' },
    backtest: { run: async () => ({}), latestResult: async () => ({}) },
    runtimeControl: { start: noopAsync, stop: noopAsync },
  };
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const settings = new SettingsService(persistence);
  await settings.load();

  const bot = new FakeBot();
  const deps = createDeps(settings);
  registerHandlers(bot as never, deps as never);

  assert.ok(bot.actionHandler, 'Action handler must be registered');
  assert.ok(bot.textHandler, 'Text handler must be registered');

  const replies: string[] = [];

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'SET', action: 'MIN_PUMP_PROBABILITY' }), replies),
  );
  await bot.textHandler!(createTextContext('65', replies));

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'SET', action: 'MIN_CONFIDENCE' }), replies),
  );
  await bot.textHandler!(createTextContext('0.72', replies));

  assert.equal(settings.get().strategy.minPumpProbability, 0.65);
  assert.equal(settings.get().strategy.minConfidence, 0.72);

  const persistedService = new SettingsService(new PersistenceService());
  await persistedService.load();
  assert.equal(
    persistedService.get().strategy.minPumpProbability,
    0.65,
    'minPumpProbability must stay persisted after SettingsService reload',
  );
  assert.equal(
    persistedService.get().strategy.minConfidence,
    0.72,
    'minConfidence must stay persisted after SettingsService reload',
  );

  console.log('PASS telegram_settings_persistence_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_settings_persistence_probe');
  console.error(error);
  process.exit(1);
});
