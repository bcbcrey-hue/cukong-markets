import assert from 'node:assert/strict';

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

async function main() {
  process.env.TELEGRAM_ALLOWED_USER_IDS = '1';
  const { buildCallback } = await import('../src/integrations/telegram/callbackRouter');
  const { registerHandlers } = await import('../src/integrations/telegram/handlers');
  const bot = new FakeBot();
  const longText = Array.from({ length: 250 }, (_, idx) => `${idx + 1}. ${'x'.repeat(40)}`).join('\n');
  const replies: string[] = [];

  registerHandlers(bot as never, {
    report: {
      hotlistText: () => longText,
      marketWatchText: () => '',
      intelligenceReportText: () => '',
      spoofRadarText: () => '',
      patternMatchText: () => '',
      positionsText: () => '',
      ordersText: () => '',
      statusText: () => '',
      signalBreakdownText: () => '',
      backtestSummaryText: () => '',
      accountsText: () => '',
      shadowRunStatusText: () => '',
    },
    health: { get: () => ({ callbackServerRunning: true }), build: async () => ({}) },
    state: {
      get: () => ({
        lastSignals: [],
        lastHotlist: [],
        lastOpportunities: [],
        status: 'STOPPED',
        emergencyStop: false,
      }),
      setStatus: async () => undefined,
      setTradingMode: async () => undefined,
    },
    positions: { list: () => [], listOpen: () => [], getById: () => undefined },
    orders: { list: () => [] },
    accounts: {
      listEnabled: () => [],
      listAll: () => [],
      reload: async () => undefined,
      getStoragePath: () => '-',
      getDefault: () => null,
      deleteById: async () => false,
      addManual: async () => null,
    },
    settings: {
      get: () => ({
        strategy: { buySlippageBps: 60, maxBuySlippageBps: 150 },
        risk: { takeProfitPct: 15 },
        tradingMode: 'OFF',
        dryRun: true,
        paperTrade: true,
        uiOnly: false,
      }),
      getExecutionMode: () => 'SIMULATED',
      setTradingMode: async () => ({}),
      setExecutionMode: async () => ({}),
      patchRisk: async () => ({}),
      patchStrategy: async () => ({}),
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
    runtimeControl: { start: async () => undefined, stop: async () => undefined },
    getTelegramSignal: () => ({
      configured: false,
      launched: false,
      running: false,
      connected: false,
      lastConnectionStatus: 'never_started' as const,
      allowedUsersCount: 0,
      botId: null,
      botUsername: null,
      botFirstName: null,
      botIsBot: null,
      lastLaunchAt: null,
      lastConnectedAt: null,
      lastLaunchSuccessAt: null,
      lastLaunchError: null,
      lastLaunchErrorType: 'none' as const,
    }),
  } as never);

  assert.ok(bot.actionHandler, 'Action handler must be registered');

  await bot.actionHandler!({
    from: { id: 1 },
    callbackQuery: { data: buildCallback({ namespace: 'NAV', action: 'OPEN', value: 'HOT' }) },
    reply: async (text: string) => {
      replies.push(text);
    },
    answerCbQuery: async () => undefined,
  });

  assert.ok(replies.length > 1, 'Long telegram output must be chunked into multiple messages');
  assert.ok(replies.every((msg) => msg.length <= 3500), 'Each telegram chunk must be under safe length');

  console.log('PASS telegram_message_chunking_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_message_chunking_probe');
  console.error(error);
  process.exit(1);
});
