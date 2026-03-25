import assert from 'node:assert/strict';

import { buildCallback } from '../src/integrations/telegram/callbackRouter';
import { registerHandlers } from '../src/integrations/telegram/handlers';

type Handler = (ctx: any) => Promise<void> | void;

class FakeBot {
  public actionHandler: Handler | null = null;

  start(_handler: Handler) {}
  hears(_trigger: unknown, _handler: Handler) {}
  on(_event: string, _handler: Handler) {}

  action(_pattern: unknown, handler: Handler) {
    this.actionHandler = handler;
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

async function main() {
  process.env.TELEGRAM_ALLOWED_USER_IDS = '1';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'probe-token';

  const now = Date.now();
  const canonicalHotlist = [
    {
      rank: 1,
      pair: 'btc_idr',
      score: 92,
      confidence: 0.88,
      reasons: ['state-canonical'],
      warnings: [],
      regime: 'BREAKOUT_SETUP' as const,
      breakoutPressure: 82,
      quoteFlowAccelerationScore: 76,
      orderbookImbalance: 0.4,
      spreadPct: 0.2,
      marketPrice: 1_000_000_000,
      bestBid: 999_000_000,
      bestAsk: 1_001_000_000,
      liquidityScore: 86,
      change1m: 1.1,
      change5m: 2.2,
      contributions: [],
      timestamp: now,
      recommendedAction: 'ENTER' as const,
      edgeValid: true,
      entryTiming: { state: 'READY' as const, quality: 80, reason: 'ready', leadScore: 75 },
      pumpProbability: 0.81,
      trapProbability: 0.1,
      historicalMatchSummary: 'state-match',
    },
  ];

  const canonicalOpportunities = [
    {
      pair: 'btc_idr',
      finalScore: 92,
      confidence: 0.88,
      pumpProbability: 0.81,
      trapProbability: 0.1,
      spoofRisk: 0.2,
      recommendedAction: 'ENTER' as const,
      edgeValid: true,
      marketRegime: 'BREAKOUT_SETUP' as const,
      entryTiming: { state: 'READY' as const, quality: 80, reason: 'ready', leadScore: 75 },
      referencePrice: 1_000_000_000,
      bestBid: 999_000_000,
      bestAsk: 1_001_000_000,
      spreadPct: 0.2,
      liquidityScore: 86,
      breakoutPressure: 82,
      quoteFlowAccelerationScore: 76,
      orderbookImbalance: 0.4,
      change1m: 1.1,
      change5m: 2.2,
      reasons: ['state-canonical'],
      warnings: [],
      featureBreakdown: [],
      riskContext: [],
      historicalMatchSummary: 'state-match',
      timestamp: now,
      rawScore: 90,
      continuationProbability: 0.7,
      historicalContext: {
        pair: 'btc_idr',
        snapshotCount: 10,
        anomalyCount: 0,
        recentWinRate: 0.6,
        recentFalseBreakRate: 0.1,
        regime: 'BREAKOUT_SETUP' as const,
        patternMatches: [],
        contextNotes: [],
        timestamp: now,
      },
    },
  ];

  const observed = {
    statusTopSignalPair: '' as string | undefined,
    statusTopOpportunityPair: '' as string | undefined,
    hotlistPairs: [] as string[],
    intelligencePairs: [] as string[],
    spoofPairs: [] as string[],
    patternPairs: [] as string[],
    detailPair: '' as string | undefined,
  };

  const noopAsync = async () => undefined;
  const noopText = () => '';
  const bot = new FakeBot();
  const replies: string[] = [];

  registerHandlers(bot as never, {
    report: {
      statusText: (params: any) => {
        observed.statusTopSignalPair = params.topSignal?.pair;
        observed.statusTopOpportunityPair = params.topOpportunity?.pair;
        return 'status-ok';
      },
      hotlistText: (items: any[]) => {
        observed.hotlistPairs = items.map((item) => item.pair);
        return 'hotlist-ok';
      },
      intelligenceReportText: (items: any[]) => {
        observed.intelligencePairs = items.map((item) => item.pair);
        return 'intel-ok';
      },
      spoofRadarText: (items: any[]) => {
        observed.spoofPairs = items.map((item) => item.pair);
        return 'spoof-ok';
      },
      patternMatchText: (items: any[]) => {
        observed.patternPairs = items.map((item) => item.pair);
        return 'pattern-ok';
      },
      signalBreakdownText: (item: any) => {
        observed.detailPair = item?.pair;
        return 'detail-ok';
      },
      marketWatchText: noopText,
      positionsText: noopText,
      ordersText: noopText,
      backtestSummaryText: noopText,
      accountsText: noopText,
      shadowRunStatusText: noopText,
    },
    health: { get: () => ({ callbackServerRunning: true }), build: async () => ({}) },
    state: {
      get: () => ({
        status: 'STOPPED',
        emergencyStop: false,
        lastMarketOverview: null,
        lastHotlist: canonicalHotlist,
        lastOpportunities: canonicalOpportunities,
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
      getStoragePath: () => '-',
      getDefault: () => ({ id: 'acc-1' }),
      deleteById: async () => false,
      addManual: async () => null,
    },
    settings: {
      get: () => ({
        tradingMode: 'OFF',
        dryRun: true,
        paperTrade: true,
        uiOnly: false,
        strategy: { buySlippageBps: 60, maxBuySlippageBps: 150, minPumpProbability: 0.6, minConfidence: 0.6 },
        risk: { takeProfitPct: 15 },
      }),
      getExecutionMode: () => 'SIMULATED',
      setTradingMode: noopAsync,
      setExecutionMode: noopAsync,
      patchRisk: noopAsync,
      patchStrategy: noopAsync,
    },
    execution: {
      manualSell: async () => '',
      cancelAllOrders: async () => '',
      sellAllPositions: async () => '',
      buy: async () => '',
      statusShadowRun: async () => ({ summary: '' }),
      startShadowRun: async () => ({ summary: '' }),
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => '' },
    backtest: { run: async () => ({}), latestResult: async () => null },
    runtimeControl: { start: noopAsync, stop: noopAsync },
    getTelegramSignal: () => ({
      configured: true,
      launched: true,
      running: true,
      connected: true,
      lastConnectionStatus: 'connected' as const,
      allowedUsersCount: 1,
      botId: 1,
      botUsername: 'probe',
      botFirstName: 'probe',
      botIsBot: true,
      lastLaunchAt: null,
      lastConnectedAt: null,
      lastLaunchSuccessAt: null,
      lastLaunchError: null,
      lastLaunchErrorType: 'none' as const,
    }),
  } as never);

  assert.ok(bot.actionHandler, 'Action handler must be registered');

  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'NAV', action: 'OPEN', value: 'HOT' }), replies));
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'RUN', action: 'STATUS' }), replies));
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'NAV', action: 'OPEN', value: 'INTEL' }), replies));
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'NAV', action: 'OPEN', value: 'SPOOF' }), replies));
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'NAV', action: 'OPEN', value: 'PAT' }), replies));
  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'SIG', action: 'DETAIL', value: 'MON', pair: 'btc_idr' }), replies),
  );

  assert.deepEqual(observed.hotlistPairs, ['btc_idr'], 'Hotlist panel must read canonical state hotlist snapshot');
  assert.equal(observed.statusTopSignalPair, 'btc_idr', 'Status topSignal must match state hotlist top');
  assert.equal(observed.statusTopOpportunityPair, 'btc_idr', 'Status topOpportunity must match state opportunities top');
  assert.deepEqual(observed.intelligencePairs, ['btc_idr'], 'Intelligence panel must read state opportunities');
  assert.deepEqual(observed.spoofPairs, ['btc_idr'], 'Spoof panel must read state opportunities');
  assert.deepEqual(observed.patternPairs, ['btc_idr'], 'Pattern panel must read state opportunities');
  assert.equal(observed.detailPair, 'btc_idr', 'Signal detail must resolve pair from state hotlist');

  console.log('PASS telegram_monitoring_state_sync_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_monitoring_state_sync_probe');
  console.error(error);
  process.exit(1);
});
