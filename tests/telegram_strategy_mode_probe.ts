import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildCallback } from '../src/integrations/telegram/callbackRouter';
import { registerHandlers } from '../src/integrations/telegram/handlers';
import type { TradingMode } from '../src/core/types';
import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService } from '../src/services/persistenceService';

type Handler = (ctx: any) => Promise<void> | void;

class FakeBot {
  public actionHandler: Handler | null = null;

  start(_handler: Handler) {}
  hears(_trigger: unknown, _handler: Handler) {}

  action(_pattern: unknown, handler: Handler) {
    this.actionHandler = handler;
  }

  on(_event: string, _handler: Handler) {}
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

function createDeps(settings: SettingsService) {
  const noopAsync = async () => undefined;
  const noopText = () => '';
  const modeChanges: TradingMode[] = [];

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
      setTradingMode: async (mode: TradingMode) => {
        modeChanges.push(mode);
      },
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
    __probe: {
      modeChanges,
    },
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

  const replies: string[] = [];

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'SET', action: 'MODE', value: 'FULL_AUTO' }), replies),
  );

  assert.equal(settings.get().tradingMode, 'FULL_AUTO', 'SET|MODE must update tradingMode on settings service');
  assert.deepEqual(deps.__probe.modeChanges, ['FULL_AUTO'], 'SET|MODE must propagate to runtime state service');

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'SET', action: 'EXECUTION_MODE', value: 'LIVE' }), replies),
  );

  assert.equal(settings.getExecutionMode(), 'LIVE', 'SET|EXECUTION_MODE LIVE must arm live execution mode');

  const reloaded = new SettingsService(new PersistenceService());
  await reloaded.load();
  assert.equal(reloaded.get().tradingMode, 'FULL_AUTO', 'tradingMode must persist after settings service reload');
  assert.equal(reloaded.getExecutionMode(), 'LIVE', 'execution mode must persist after settings service reload');

  console.log('PASS telegram_strategy_mode_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_strategy_mode_probe');
  console.error(error);
  process.exit(1);
});
