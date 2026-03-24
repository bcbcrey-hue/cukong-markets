import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseCallback } from '../src/integrations/telegram/callbackRouter';
import { isSupportedTelegramCallback } from '../src/integrations/telegram/handlers';
import {
  TELEGRAM_MAIN_MENU,
  accountsCategoryKeyboard,
  accountsKeyboard,
  backtestCategoryKeyboard,
  backtestKeyboard,
  emergencyKeyboard,
  executeTradeKeyboard,
  hotlistKeyboard,
  mainMenuKeyboard,
  monitoringKeyboard,
  positionsKeyboard,
  positionsMenuKeyboard,
  riskSettingsKeyboard,
  shadowRunKeyboard,
  settingsKeyboard,
  strategySettingsKeyboard,
} from '../src/integrations/telegram/keyboards';
import { PersistenceService } from '../src/services/persistenceService';
import { SettingsService } from '../src/domain/settings/settingsService';

function collectInlineCallbacks(markup: unknown): string[] {
  const keyboard = (markup as { reply_markup?: { inline_keyboard?: Array<Array<{ callback_data?: string }>> } })
    .reply_markup?.inline_keyboard;

  if (!keyboard) {
    return [];
  }

  return keyboard.flatMap((row) => row.map((button) => button.callback_data).filter(Boolean) as string[]);
}

function collectReplyKeyboardLabels(markup: unknown): string[] {
  const keyboard = (markup as { reply_markup?: { keyboard?: Array<Array<string | { text?: string }>> } })
    .reply_markup?.keyboard;

  if (!keyboard) {
    return [];
  }

  return keyboard.flatMap((row) =>
    row.map((button) => (typeof button === 'string' ? button : button.text ?? '')),
  );
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const settingsService = new SettingsService(persistence);
  const defaults = await settingsService.load();

  assert.equal(defaults.strategy.buySlippageBps, 60, 'Default buy slippage must be 60 bps');
  assert.equal(defaults.strategy.maxBuySlippageBps, 150, 'Default max buy slippage must be 150 bps');

  await persistence.saveSettings({
    ...defaults,
    strategy: {
      ...defaults.strategy,
      buySlippageBps: 25,
      maxBuySlippageBps: 80,
    },
  });

  const migrated = await settingsService.load();
  assert.equal(migrated.strategy.buySlippageBps, 60, 'Legacy slippage default should migrate to 60 bps');
  assert.equal(migrated.strategy.maxBuySlippageBps, 150, 'Legacy slippage ceiling should migrate to 150 bps');

  const rootLabels = collectReplyKeyboardLabels(mainMenuKeyboard);
  assert.deepEqual(
    rootLabels,
    [
      TELEGRAM_MAIN_MENU.EXECUTE,
      TELEGRAM_MAIN_MENU.EMERGENCY,
      TELEGRAM_MAIN_MENU.MONITORING,
      TELEGRAM_MAIN_MENU.TRADE,
      TELEGRAM_MAIN_MENU.SETTINGS,
      TELEGRAM_MAIN_MENU.ACCOUNTS,
      TELEGRAM_MAIN_MENU.BACKTEST,
      TELEGRAM_MAIN_MENU.SHADOW,
    ],
    'Main menu must include shadow-run as top-level category',
  );

  const sampleHotlist = [
    {
      rank: 1,
      pair: 'btc_idr',
      score: 90,
      confidence: 0.9,
      reasons: ['test'],
      warnings: [],
      regime: 'BREAKOUT_SETUP' as const,
      breakoutPressure: 80,
      volumeAcceleration: 75,
      orderbookImbalance: 0.4,
      spreadPct: 0.2,
      marketPrice: 1_000_000_000,
      bestBid: 999_000_000,
      bestAsk: 1_001_000_000,
      liquidityScore: 85,
      change1m: 1,
      change5m: 2,
      contributions: [],
      timestamp: Date.now(),
      recommendedAction: 'ENTER' as const,
      edgeValid: true,
      entryTiming: {
        state: 'READY' as const,
        quality: 82,
        reason: 'ready',
        leadScore: 77,
      },
      pumpProbability: 0.8,
      trapProbability: 0.1,
      historicalMatchSummary: 'pattern match strong',
    },
  ];

  const samplePositions = [
    {
      id: 'pos-1',
      pair: 'btc_idr',
      accountId: 'acc-1',
      status: 'OPEN' as const,
      side: 'long' as const,
      quantity: 0.01,
      entryPrice: 1_000_000_000,
      averageEntryPrice: 1_000_000_000,
      averageExitPrice: null,
      currentPrice: 1_010_000_000,
      peakPrice: 1_012_000_000,
      unrealizedPnl: 100_000,
      realizedPnl: 0,
      entryFeesPaid: 10_000,
      totalEntryFeesPaid: 10_000,
      exitFeesPaid: 0,
      totalBoughtQuantity: 0.01,
      totalSoldQuantity: 0,
      stopLossPrice: 990_000_000,
      takeProfitPrice: 1_150_000_000,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      sourceOrderId: 'ord-1',
    },
  ];

  const keyboardsToCheck = [
    executeTradeKeyboard,
    emergencyKeyboard,
    monitoringKeyboard,
    positionsMenuKeyboard(migrated),
    settingsKeyboard,
    strategySettingsKeyboard(migrated),
    riskSettingsKeyboard(migrated),
    accountsCategoryKeyboard,
    accountsKeyboard,
    backtestCategoryKeyboard,
    backtestKeyboard('btc_idr'),
    shadowRunKeyboard,
    hotlistKeyboard(sampleHotlist, 'MON'),
    positionsKeyboard(samplePositions, 'TRADE'),
  ];

  for (const keyboard of keyboardsToCheck) {
    const callbacks = collectInlineCallbacks(keyboard);
    assert.ok(callbacks.length > 0, 'Keyboard inline callback list must not be empty');

    for (const callback of callbacks) {
      const parsed = parseCallback(callback);
      assert.ok(parsed, `Callback must be parseable: ${callback}`);
      assert.equal(isSupportedTelegramCallback(parsed!), true, `Callback must have a real handler: ${callback}`);
    }
  }

  const positionsMenuCallbacks = collectInlineCallbacks(positionsMenuKeyboard(migrated)).join('|');
  const strategyCallbacks = collectInlineCallbacks(strategySettingsKeyboard(migrated)).join('|');

  assert.match(
    positionsMenuCallbacks,
    /BUY_SLIPPAGE/,
    'Buy Slippage button must live inside Positions / Orders / Manual Trade submenu',
  );
  assert.match(
    strategyCallbacks,
    /EXECUTION_MODE/,
    'Strategy Settings submenu must expose official execution mode control',
  );
  assert.doesNotMatch(
    strategyCallbacks,
    /BUY_SLIPPAGE/,
    'Buy Slippage button must be removed from Strategy Settings submenu',
  );

  console.log('PASS telegram_menu_navigation_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_menu_navigation_probe');
  console.error(error);
  process.exit(1);
});
