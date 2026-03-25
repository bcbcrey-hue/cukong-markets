import assert from 'node:assert/strict';

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

function createDeps(mode: 'success' | 'failure') {
  let buyCalls = 0;
  const hotlistItem = {
    rank: 1,
    pair: 'btc_idr',
    score: 90,
    confidence: 0.91,
    reasons: ['ok'],
    warnings: [],
    regime: 'BREAKOUT_SETUP' as const,
    breakoutPressure: 75,
    volumeAcceleration: 70,
    orderbookImbalance: 0.3,
    spreadPct: 0.2,
    marketPrice: 1_000_000_000,
    bestBid: 999_000_000,
    bestAsk: 1_001_000_000,
    spreadBps: 20,
    bidDepthTop10: 100,
    askDepthTop10: 90,
    depthScore: 80,
    orderbookTimestamp: Date.now(),
    liquidityScore: 80,
    change1m: 1,
    change5m: 2,
    contributions: [],
    timestamp: Date.now(),
    recommendedAction: 'ENTER' as const,
    edgeValid: true,
    entryTiming: {
      state: 'READY' as const,
      quality: 80,
      reason: 'ready',
      leadScore: 70,
    },
    pumpProbability: 0.8,
    trapProbability: 0.1,
    historicalMatchSummary: 'ok',
  };

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
    health: { build: async () => ({}) },
    state: {
      get: () => ({
        status: 'STOPPED',
        emergencyStop: false,
        pairCooldowns: {},
        lastOpportunities: [],
      }),
      setStatus: noopAsync,
      setTradingMode: noopAsync,
    },
    hotlist: {
      list: () => [hotlistItem],
      get: (pair: string) => (pair === hotlistItem.pair ? hotlistItem : undefined),
    },
    positions: {
      list: () => [],
      listOpen: () => [],
      getById: () => undefined,
    },
    orders: {
      list: () => [],
    },
    accounts: {
      listEnabled: () => [{ id: 'acc-1' }],
      listAll: () => [{ id: 'acc-1' }],
      reload: noopAsync,
      getDefault: () => ({ id: 'acc-1' }),
      getStoragePath: () => '/tmp/probe',
    },
    settings: {
      get: () => ({
        tradingMode: 'ALERT_ONLY',
        dryRun: true,
        paperTrade: true,
        uiOnly: false,
        strategy: { buySlippageBps: 60, maxBuySlippageBps: 150, minPumpProbability: 0.6, minConfidence: 0.6 },
        risk: { takeProfitPct: 15 },
      }),
      getExecutionMode: () => 'SIMULATED',
      setTradingMode: noopAsync,
      setExecutionMode: noopAsync,
      patchStrategy: noopAsync,
      patchRisk: noopAsync,
    },
    execution: {
      triggerShadowRunFromTelegram: () => ({}),
      getShadowRunTelegramSummary: () => ({}),
      manualSell: async () => 'unused',
      cancelAllOrders: async () => 'ok',
      sellAllPositions: async () => 'ok',
      buy: async () => {
        buyCalls += 1;
        if (mode === 'failure') {
          throw new Error('Pair masih cooldown');
        }
        return 'BUY simulated btc_idr qty=0.00100000';
      },
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => 'ok' },
    backtest: { run: async () => ({}), latestResult: async () => ({}) },
    __probe: {
      buyCalls: () => buyCalls,
    },
  };
}

async function runScenario(mode: 'success' | 'failure') {
  const [{ buildCallback }, { registerHandlers }] = await Promise.all([
    import('../src/integrations/telegram/callbackRouter'),
    import('../src/integrations/telegram/handlers'),
  ]);

  const bot = new FakeBot();
  const deps = createDeps(mode);
  registerHandlers(bot as never, deps as never);

  assert.ok(bot.actionHandler, 'Action handler must be registered');
  assert.ok(bot.textHandler, 'Text handler must be registered');

  const replies: string[] = [];

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'BUY', action: 'PICK', value: 'TRADE', pair: 'btc_idr' }), replies),
  );
  assert.ok(
    replies.some((text) => text.includes('Kirim nominal IDR untuk buy btc_idr')),
    'Pair actionable harus masuk flow input nominal',
  );

  await bot.textHandler!(createTextContext('nominal-salah', replies));
  assert.ok(
    replies.some((text) => text.includes('Nominal buy tidak valid')),
    'Input nominal invalid harus dibalas validasi',
  );

  const replyCountBeforeSubmit = replies.length;
  await bot.textHandler!(createTextContext('250000', replies));
  assert.equal(deps.__probe.buyCalls(), 1, 'Nominal valid harus submit execution.buy tepat sekali');

  if (mode === 'success') {
    assert.ok(
      replies.slice(replyCountBeforeSubmit).some((text) => text.includes('BUY simulated btc_idr')),
      'BUY sukses harus menampilkan status order/simulasi',
    );
  } else {
    assert.ok(
      replies.slice(replyCountBeforeSubmit).some((text) => text.includes('Manual BUY btc_idr ditolak karena pair masih cooldown')),
      'BUY gagal harus menampilkan error jelas ke user',
    );
  }

  const replyCountAfterSettlement = replies.length;
  await bot.textHandler!(createTextContext('300000', replies));
  assert.equal(
    replies.length,
    replyCountAfterSettlement,
    'Pending manual buy harus dibersihkan setelah submit agar input berikutnya tidak diproses ulang',
  );
}

async function main() {
  process.env.TELEGRAM_ALLOWED_USER_IDS = '1';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'probe-token';
  await runScenario('success');
  await runScenario('failure');
  console.log('PASS telegram_manual_buy_flow_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_manual_buy_flow_probe');
  console.error(error);
  process.exit(1);
});
