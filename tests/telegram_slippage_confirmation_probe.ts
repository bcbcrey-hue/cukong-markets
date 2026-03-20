import assert from 'node:assert/strict';

import { buildCallback } from '../src/integrations/telegram/callbackRouter';
import { registerHandlers } from '../src/integrations/telegram/handlers';
import { createDefaultSettings } from '../src/services/persistenceService';

type Handler = (ctx: any) => Promise<void> | void;

class FakeBot {
  public actionHandler: Handler | null = null;
  public textHandler: Handler | null = null;

  start(_handler: Handler) {
    // Not needed for this probe.
  }

  hears(_trigger: unknown, _handler: Handler) {
    // Not needed for this probe.
  }

  action(_pattern: unknown, handler: Handler) {
    this.actionHandler = handler;
  }

  on(event: string, handler: Handler) {
    if (event === 'text') {
      this.textHandler = handler;
    }
  }
}

class FakeSettingsService {
  private settings = createDefaultSettings();

  get() {
    return this.settings;
  }

  getExecutionMode() {
    return this.settings.uiOnly || this.settings.dryRun || this.settings.paperTrade
      ? 'SIMULATED'
      : 'LIVE';
  }

  async patchStrategy(partial: Partial<typeof this.settings.strategy>) {
    this.settings = {
      ...this.settings,
      strategy: {
        ...this.settings.strategy,
        ...partial,
      },
    };
    return this.settings;
  }

  async setTradingMode() {
    return this.settings;
  }

  async setExecutionMode(mode: 'SIMULATED' | 'LIVE') {
    this.settings = {
      ...this.settings,
      dryRun: mode === 'SIMULATED',
      paperTrade: mode === 'SIMULATED',
      uiOnly: false,
    };
    return this.settings;
  }

  async patchRisk() {
    return this.settings;
  }
}

function createDeps(settings: FakeSettingsService) {
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
    },
    health: { build: async () => ({}) },
    state: {
      get: () => ({
        status: 'STOPPED',
        emergencyStop: false,
        lastOpportunities: [],
      }),
      setStatus: noopAsync,
      setTradingMode: noopAsync,
    },
    hotlist: {
      list: () => [],
      get: () => undefined,
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
      listEnabled: () => [],
      listAll: () => [],
      reload: noopAsync,
      getDefault: () => ({ id: 'acc-1' }),
    },
    settings,
    execution: {
      manualSell: async () => 'ok',
      cancelAllOrders: async () => 'ok',
      sellAllPositions: async () => 'ok',
      buy: async () => 'ok',
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => 'ok' },
    backtest: {
      run: async () => ({}),
      latestResult: async () => ({}),
    },
  };
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

async function main() {
  const settings = new FakeSettingsService();
  const deps = createDeps(settings);
  const bot = new FakeBot();
  registerHandlers(bot as never, deps as never);

  assert.ok(bot.actionHandler, 'Action handler must be registered');
  assert.ok(bot.textHandler, 'Text handler must be registered');

  const replies: string[] = [];
  const openBuySlippage = buildCallback({ namespace: 'SET', action: 'BUY_SLIPPAGE' });

  await bot.actionHandler!(createActionContext(openBuySlippage, replies));
  assert.ok(
    replies.some((text) => text.includes('Kirim buy slippage dalam bps')),
    'SET|BUY_SLIPPAGE should open input mode',
  );

  await bot.textHandler!(createTextContext('200', replies));
  assert.ok(
    replies.some((text) => text.includes('melebihi batas aman 150 bps')),
    'Input above max must trigger warning with cap confirmation',
  );

  await bot.textHandler!(createTextContext('LANJUT', replies));
  assert.equal(
    settings.get().strategy.buySlippageBps,
    150,
    'LANJUT confirmation should cap slippage at maxBuySlippageBps',
  );

  await bot.actionHandler!(createActionContext(openBuySlippage, replies));
  await bot.textHandler!(createTextContext('200', replies));
  await bot.textHandler!(createTextContext('120', replies));

  assert.equal(
    settings.get().strategy.buySlippageBps,
    120,
    'After warning, entering another valid number should set that number',
  );

  const setLive = buildCallback({ namespace: 'SET', action: 'EXECUTION_MODE', value: 'LIVE' });
  await bot.actionHandler!(createActionContext(setLive, replies));
  assert.equal(settings.getExecutionMode(), 'LIVE', 'Execution mode LIVE must disable simulation flags');
  assert.ok(
    replies.some((text) => text.includes('Execution mode diubah ke LIVE.')),
    'SET|EXECUTION_MODE LIVE should confirm execution mode change',
  );

  console.log('PASS telegram_slippage_confirmation_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_slippage_confirmation_probe');
  console.error(error);
  process.exit(1);
});
