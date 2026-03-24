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
import { HotlistService } from '../src/domain/market/hotlistService';
import { ReportService } from '../src/services/reportService';
import type { OpportunityAssessment } from '../src/core/types';
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

function collectInlineButtonTexts(markup: unknown): string[] {
  const keyboard = (markup as { reply_markup?: { inline_keyboard?: Array<Array<{ text?: string }>> } })
    .reply_markup?.inline_keyboard;

  if (!keyboard) {
    return [];
  }

  return keyboard.flatMap((row) => row.map((button) => button.text ?? '').filter(Boolean));
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
      spreadBps: 20.2,
      bidDepthTop10: 120.4567,
      askDepthTop10: 110.3456,
      depthScore: 85.2,
      orderbookTimestamp: Date.now() - 3_000,
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
    {
      rank: 2,
      pair: 'eth_idr',
      score: 72,
      confidence: 0.7,
      reasons: ['wait confirmation'],
      warnings: ['timing masih early'],
      regime: 'ACCUMULATION' as const,
      breakoutPressure: 60,
      volumeAcceleration: 58,
      orderbookImbalance: 0.2,
      spreadPct: 0.3,
      marketPrice: 50_000_000,
      bestBid: 49_900_000,
      bestAsk: 50_100_000,
      spreadBps: 40.1,
      bidDepthTop10: 60.45,
      askDepthTop10: 59.87,
      depthScore: 70.1,
      orderbookTimestamp: Date.now() - 5_000,
      liquidityScore: 70,
      change1m: 0.2,
      change5m: 0.5,
      contributions: [],
      timestamp: Date.now(),
      recommendedAction: 'CONFIRM_ENTRY' as const,
      edgeValid: true,
      entryTiming: {
        state: 'EARLY' as const,
        quality: 55,
        reason: 'menunggu konfirmasi',
        leadScore: 54,
      },
      pumpProbability: 0.55,
      trapProbability: 0.2,
      historicalMatchSummary: 'needs confirmation',
    },
    {
      rank: 3,
      pair: 'xrp_idr',
      score: 44,
      confidence: 0.42,
      reasons: ['risk tinggi'],
      warnings: ['spread terlalu lebar'],
      regime: 'TRAP_RISK' as const,
      breakoutPressure: 30,
      volumeAcceleration: 25,
      orderbookImbalance: 0.1,
      spreadPct: 1.8,
      marketPrice: 15_000,
      bestBid: 14_850,
      bestAsk: 15_150,
      spreadBps: 199.9,
      bidDepthTop10: 10.2,
      askDepthTop10: 12.7,
      depthScore: 41.4,
      orderbookTimestamp: Date.now() - 9_000,
      liquidityScore: 40,
      change1m: -0.8,
      change5m: -1.9,
      contributions: [],
      timestamp: Date.now(),
      recommendedAction: 'AVOID' as const,
      edgeValid: false,
      entryTiming: {
        state: 'AVOID' as const,
        quality: 20,
        reason: 'hindari entry',
        leadScore: 18,
      },
      pumpProbability: 0.18,
      trapProbability: 0.66,
      historicalMatchSummary: 'high trap risk',
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
  const hotlistButtons = collectInlineButtonTexts(hotlistKeyboard(sampleHotlist, 'MON'));
  const hotlistCallbacks = collectInlineCallbacks(hotlistKeyboard(sampleHotlist, 'MON')).join('|');

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
  assert.ok(
    hotlistButtons.some((text) => text.includes('[WATCH]') || text.includes('[CAUTION]') || text.includes('[BLOCKED]')),
    'Hotlist keyboard must expose WATCH/CAUTION/BLOCKED labels for Telegram UI gating visibility',
  );
  assert.match(hotlistCallbacks, /BUY\|PICK\|MON\|btc_idr/, 'Actionable hotlist pair should expose BUY callback');
  assert.doesNotMatch(hotlistCallbacks, /BUY\|PICK\|MON\|eth_idr/, 'Non-actionable caution pair must not expose BUY callback');
  assert.doesNotMatch(hotlistCallbacks, /BUY\|PICK\|MON\|xrp_idr/, 'Blocked pair must not expose BUY callback');

  const hotlistService = new HotlistService();
  const report = new ReportService();
  const sampleOpportunity: OpportunityAssessment = {
    pair: 'btc_idr',
    rawScore: 88,
    finalScore: 93,
    confidence: 0.9,
    pumpProbability: 0.84,
    continuationProbability: 0.76,
    trapProbability: 0.12,
    spoofRisk: 0.15,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: 80,
    volumeAcceleration: 75,
    orderbookImbalance: 0.4,
    change1m: 1,
    change5m: 2,
    entryTiming: {
      state: 'READY',
      quality: 82,
      reason: 'ready',
      leadScore: 77,
    },
    reasons: ['test'],
    warnings: [],
    featureBreakdown: [],
    historicalContext: {
      pair: 'btc_idr',
      snapshotCount: 10,
      anomalyCount: 0,
      recentWinRate: 0.66,
      recentFalseBreakRate: 0.2,
      regime: 'BREAKOUT_SETUP',
      patternMatches: [],
      contextNotes: [],
      timestamp: Date.now(),
    },
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'pattern match strong',
    referencePrice: 1_000_000_000,
    bestBid: 999_000_000,
    bestAsk: 1_001_000_000,
    spreadBps: 20.2,
    bidDepthTop10: 120.4567,
    askDepthTop10: 110.3456,
    depthScore: 85.2,
    orderbookTimestamp: Date.now() - 3_000,
    spreadPct: 0.2,
    liquidityScore: 85,
    timestamp: Date.now(),
  };

  const runtimeHotlist = hotlistService.update([sampleOpportunity]);
  assert.equal(runtimeHotlist.length, 1, 'Hotlist runtime should contain mapped entry');
  assert.equal('finalScore' in runtimeHotlist[0], false, 'Hotlist runtime entry must not leak finalScore');

  const detail = report.signalBreakdownText(runtimeHotlist[0]);
  const marketWatch = report.marketWatchText(runtimeHotlist);
  assert.match(marketWatch, /👁️ MARKET WATCH/, 'Market watch header should be present');
  assert.match(marketWatch, /p=1000000000\.00000000/, 'Market watch should keep compact price field');
  assert.match(marketWatch, /Δ1m=1\.00%/, 'Market watch should keep short delta field');
  assert.doesNotMatch(marketWatch, /price=/, 'Market watch should use compact format');
  assert.match(detail, /Action: ENTER/, 'Hotlist detail must show action from HotlistEntry');
  assert.match(detail, /Edge valid: YA/, 'Hotlist detail must show edgeValid from HotlistEntry');
  assert.match(detail, /Status: READY/, 'Hotlist detail must show UI status derived from action and edge gate');
  assert.match(detail, /Timing: READY \(ready\)/, 'Hotlist detail must show entry timing from HotlistEntry');
  assert.match(detail, /Pump probability: 84\.0%/, 'Hotlist detail must show pump probability from HotlistEntry');
  assert.match(detail, /Trap probability: 12\.0%/, 'Hotlist detail must show trap probability from HotlistEntry');
  assert.match(detail, /History: pattern match strong/, 'Hotlist detail must show history summary from HotlistEntry');
  assert.match(detail, /bestBid=999000000\.00000000/, 'Hotlist detail should surface bestBid runtime debug');
  assert.match(detail, /bestAsk=1001000000\.00000000/, 'Hotlist detail should surface bestAsk runtime debug');
  assert.match(detail, /spreadBps=20\.2bps/, 'Hotlist detail should surface spreadBps runtime debug');
  assert.match(detail, /bidDepthTop10=120\.4567/, 'Hotlist detail should surface bid depth runtime debug');
  assert.match(detail, /askDepthTop10=110\.3456/, 'Hotlist detail should surface ask depth runtime debug');
  assert.match(detail, /depthScore=85\.2/, 'Hotlist detail should surface depthScore runtime debug');
  assert.match(detail, /Orderbook ts:/, 'Hotlist detail should surface orderbook timestamp + age');
  assert.doesNotMatch(detail, /Final score:/, 'Hotlist detail must not use opportunity finalScore formatter branch');

  const sparseDetail = report.signalBreakdownText({
    ...runtimeHotlist[0],
    spreadBps: 0,
    bidDepthTop10: 0,
    askDepthTop10: 0,
    depthScore: 0,
    orderbookTimestamp: undefined,
  });
  assert.doesNotMatch(sparseDetail, /spreadBps=0\.0bps/, 'Zero spreadBps should not be spammed');
  assert.doesNotMatch(sparseDetail, /depthScore=0\.0/, 'Zero depth score should not be spammed');

  console.log('PASS telegram_menu_navigation_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_menu_navigation_probe');
  console.error(error);
  process.exit(1);
});
