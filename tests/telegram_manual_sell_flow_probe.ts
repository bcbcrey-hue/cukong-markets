import assert from 'node:assert/strict';

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

function createDeps(mode: 'success' | 'failure') {
  let sellCalls = 0;
  let lastQuantity = 0;

  const position = {
    id: 'pos-1',
    pair: 'btc_idr',
    accountId: 'acc-1',
    status: 'OPEN' as const,
    side: 'long' as const,
    quantity: 2,
    entryPrice: 1_000,
    averageEntryPrice: 1_000,
    averageExitPrice: null,
    currentPrice: 1_100,
    peakPrice: 1_120,
    unrealizedPnl: 200,
    realizedPnl: 0,
    entryFeesPaid: 1,
    totalEntryFeesPaid: 1,
    exitFeesPaid: 0,
    totalBoughtQuantity: 2,
    totalSoldQuantity: 0,
    stopLossPrice: 900,
    takeProfitPrice: 1200,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    sourceOrderId: 'ord-1',
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
        lastHotlist: [],
        lastOpportunities: [],
      }),
      setStatus: noopAsync,
      setTradingMode: noopAsync,
    },
    positions: {
      list: () => [position],
      listOpen: () => [position],
      getById: (positionId: string) => (positionId === position.id ? position : undefined),
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
      buy: async () => 'unused',
      cancelAllOrders: async () => 'ok',
      sellAllPositions: async () => 'ok',
      manualSell: async (_positionId: string, quantity: number) => {
        sellCalls += 1;
        lastQuantity = quantity;
        if (mode === 'failure') {
          throw new Error('Masih ada order SELL aktif untuk posisi ini');
        }
        return `SELL simulated btc_idr qty=${quantity.toFixed(8)} selesai`;
      },
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => 'ok' },
    backtest: { run: async () => ({}), latestResult: async () => ({}) },
    __probe: {
      sellCalls: () => sellCalls,
      lastQuantity: () => lastQuantity,
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

  const replies: string[] = [];

  await bot.actionHandler!(
    createActionContext(buildCallback({ namespace: 'POS', action: 'SELL50', value: 'TRADE:pos-1' }), replies),
  );

  assert.equal(deps.__probe.sellCalls(), 1, 'SELL50 harus memanggil execution.manualSell');
  assert.equal(deps.__probe.lastQuantity(), 1, 'SELL50 harus menjual 50% quantity posisi');

  if (mode === 'success') {
    assert.ok(
      replies.some((text) => text.includes('SELL simulated btc_idr qty=1.00000000 selesai')),
      'Sell sukses harus menampilkan status order/simulasi',
    );

    await bot.actionHandler!(
      createActionContext(buildCallback({ namespace: 'POS', action: 'SELL100', value: 'TRADE:pos-1' }), replies),
    );

    assert.equal(deps.__probe.sellCalls(), 2, 'SELL100 harus memanggil execution.manualSell untuk full sell');
    assert.equal(deps.__probe.lastQuantity(), 2, 'SELL100 harus menjual seluruh quantity posisi');
  } else {
    assert.ok(
      replies.some((text) => text.includes('Manual SELL btc_idr ditolak karena active order SELL sudah ada')),
      'Sell gagal harus menampilkan error jelas ke user',
    );
  }
}

async function main() {
  process.env.TELEGRAM_ALLOWED_USER_IDS = '1';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'probe-token';
  await runScenario('success');
  await runScenario('failure');
  console.log('PASS telegram_manual_sell_flow_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_manual_sell_flow_probe');
  console.error(error);
  process.exit(1);
});
