import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HotlistEntry } from '../src/core/types';

type Handler = (ctx: any) => Promise<void> | void;

interface MemAccount {
  id: string;
  name: string;
  apiKey: string;
  apiSecret: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

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

class MemoryAccounts {
  private rows: MemAccount[] = [
    {
      id: 'acc-alpha',
      name: 'Alpha',
      apiKey: 'key-alpha',
      apiSecret: 'secret-alpha',
      enabled: true,
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  listAll() {
    return [...this.rows];
  }

  listEnabled() {
    return this.rows.filter((row) => row.enabled);
  }

  getById(accountId: string) {
    return this.rows.find((row) => row.id === accountId);
  }

  getDefault() {
    return this.rows.find((row) => row.isDefault) ?? this.rows[0];
  }

  getStoragePath() {
    return '/tmp/probe/accounts.json';
  }

  async reload() {
    return this.listAll();
  }

  async addManualAccount(input: { name: string; apiKey: string; apiSecret: string }) {
    const key = input.name.trim().toLowerCase();
    if (!key || !input.apiKey.trim() || !input.apiSecret.trim()) {
      throw new Error('Field wajib kosong.');
    }
    if (this.rows.some((row) => row.name.trim().toLowerCase() === key)) {
      throw new Error(`Nama account "${input.name.trim()}" sudah ada.`);
    }

    this.rows.push({
      id: `acc-${Date.now()}`,
      name: input.name.trim(),
      apiKey: input.apiKey.trim(),
      apiSecret: input.apiSecret.trim(),
      enabled: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return this.listAll();
  }

  async delete(accountId: string) {
    const index = this.rows.findIndex((row) => row.id === accountId);
    if (index < 0) {
      throw new Error(`Account dengan id "${accountId}" tidak ditemukan.`);
    }
    this.rows.splice(index, 1);
    return this.listAll();
  }
}

function createDeps(
  accounts: MemoryAccounts,
  options?: {
    hotlist?: HotlistEntry[];
    buyCalls?: { count: number };
  },
) {
  const noopAsync = async () => undefined;
  const hotlistRows = options?.hotlist ?? [];
  const buyCalls = options?.buyCalls;
  const report = {
    statusText: () => '',
    marketWatchText: () => '',
    hotlistText: () => '',
    intelligenceReportText: () => '',
    spoofRadarText: () => '',
    patternMatchText: () => '',
    positionsText: () => '',
    ordersText: () => '',
    signalBreakdownText: () => '',
    backtestSummaryText: () => '',
    shadowRunStatusText: () => '',
    accountsText: (items: MemAccount[]) => {
      if (items.length === 0) {
        return '👤 Belum ada account tersimpan.';
      }
      return ['👤 ACCOUNTS', ...items.map((item, index) => `${index + 1}. ${item.name} | id=${item.id}`)].join('\n');
    },
  };

  return {
    report,
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
      list: () => [...hotlistRows],
      get: (pair: string) => hotlistRows.find((item) => item.pair === pair),
    },
    positions: { list: () => [], listOpen: () => [], getById: () => undefined },
    orders: { list: () => [] },
    accounts,
    settings: {
      get: () => ({
        tradingMode: 'ALERT_ONLY',
        dryRun: true,
        paperTrade: true,
        uiOnly: false,
        strategy: {
          buySlippageBps: 60,
          maxBuySlippageBps: 150,
          buyOrderTimeoutMs: 8000,
          minPumpProbability: 0.7,
          minConfidence: 0.65,
        },
        risk: { takeProfitPct: 15 },
      }),
      getExecutionMode: () => 'SIMULATED',
      setTradingMode: noopAsync,
      setExecutionMode: noopAsync,
      patchStrategy: noopAsync,
      patchRisk: noopAsync,
    },
    execution: {
      manualSell: async () => 'ok',
      cancelAllOrders: async () => 'ok',
      sellAllPositions: async () => 'ok',
      buy: async () => {
        if (buyCalls) {
          buyCalls.count += 1;
        }
        return 'ok';
      },
      triggerShadowRunFromTelegram: () => ({}),
      getShadowRunTelegramSummary: () => ({}),
    },
    journal: { recent: () => [] },
    uploadHandler: { handleDocument: async () => 'ok' },
    backtest: { run: async () => ({}), latestResult: async () => ({}) },
  };
}

function createActionContext(callbackData: string, replies: string[]) {
  return {
    from: { id: 11 },
    callbackQuery: { data: callbackData },
    reply: async (text: string) => {
      replies.push(text);
    },
    answerCbQuery: async () => undefined,
  };
}

function createTextContext(messageText: string, replies: string[]) {
  return {
    from: { id: 11 },
    message: { text: messageText },
    reply: async (text: string) => {
      replies.push(text);
    },
  };
}

let probeDataDir: string | null = null;

async function ensureProbeRuntimeEnv(): Promise<string> {
  if (!probeDataDir) {
    probeDataDir = await mkdtemp(path.join(os.tmpdir(), 'cukong-accounts-manual-probe-'));
  }

  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'manual-probe-token';
  process.env.TELEGRAM_ALLOWED_USER_IDS = '11';
  process.env.DATA_DIR = probeDataDir;
  process.env.LOG_DIR = path.join(probeDataDir, 'logs');
  process.env.TEMP_DIR = path.join(probeDataDir, 'tmp');

  return probeDataDir;
}

async function probeTelegramManualFlows() {
  await ensureProbeRuntimeEnv();
  const [{ buildCallback }, { registerHandlers }] = await Promise.all([
    import('../src/integrations/telegram/callbackRouter'),
    import('../src/integrations/telegram/handlers'),
  ]);

  const bot = new FakeBot();
  const accounts = new MemoryAccounts();
  registerHandlers(bot as never, createDeps(accounts) as never);

  assert.ok(bot.actionHandler, 'Action handler harus terpasang');
  assert.ok(bot.textHandler, 'Text handler harus terpasang');

  const replies: string[] = [];

  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'ACC', action: 'LIST' }), replies));
  const initialPanel = replies.at(-1) ?? '';
  assert.ok(initialPanel.includes('Storage policy:'), 'Panel account harus menampilkan policy storage');
  assert.ok(!initialPanel.includes('secret-alpha'), 'Panel account tidak boleh membocorkan apiSecret');
  assert.ok(!initialPanel.includes('key-alpha'), 'Panel account tidak boleh membocorkan apiKey');

  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'ACC', action: 'ADD_MANUAL' }), replies));
  await bot.textHandler!(createTextContext('Beta', replies));
  await bot.textHandler!(createTextContext('beta-key', replies));
  await bot.textHandler!(createTextContext('beta-secret', replies));
  assert.ok(
    replies.some((text) => text.includes('Account manual berhasil ditambahkan.')),
    'Add manual sukses harus dikonfirmasi',
  );

  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'ACC', action: 'ADD_MANUAL' }), replies));
  await bot.textHandler!(createTextContext('Beta', replies));
  await bot.textHandler!(createTextContext('beta-key-2', replies));
  await bot.textHandler!(createTextContext('beta-secret-2', replies));
  assert.ok(
    replies.some(
      (text) => text.includes('Gagal menambah account manual.') && text.includes('sudah ada'),
    ),
    'Duplicate manual add harus dibalas rapi',
  );

  const replyCountAfterDuplicate = replies.length;
  await bot.textHandler!(createTextContext('teks bebas setelah error', replies));
  assert.equal(
    replies.length,
    replyCountAfterDuplicate,
    'State flow add manual harus dibersihkan setelah error agar teks berikutnya tidak diproses sebagai sisa flow',
  );

  const beta = accounts.listAll().find((item) => item.name === 'Beta');
  assert.ok(beta, 'Account Beta harus ada sebelum delete sukses');
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'ACC', action: 'DEL_PICK', value: beta.id }), replies));
  await bot.textHandler!(createTextContext(`HAPUS ${beta.id}`, replies));
  assert.ok(
    replies.some((text) => text.includes('Account berhasil dihapus.')),
    'Delete manual sukses harus dikonfirmasi',
  );

  await accounts.addManualAccount({ name: 'Gamma', apiKey: 'gamma-key', apiSecret: 'gamma-secret' });
  const gamma = accounts.listAll().find((item) => item.name === 'Gamma');
  assert.ok(gamma, 'Account Gamma harus ada');
  await bot.actionHandler!(createActionContext(buildCallback({ namespace: 'ACC', action: 'DEL_PICK', value: gamma.id }), replies));
  await accounts.delete(gamma.id);
  await bot.textHandler!(createTextContext(`HAPUS ${gamma.id}`, replies));
  assert.ok(
    replies.some((text) => text.includes('Gagal menghapus account.') && text.includes('tidak ditemukan')),
    'Delete target hilang harus dibalas error yang jelas',
  );
}

async function probeTelegramBuyDecisionGating() {
  await ensureProbeRuntimeEnv();
  const [{ buildCallback }, { registerHandlers }] = await Promise.all([
    import('../src/integrations/telegram/callbackRouter'),
    import('../src/integrations/telegram/handlers'),
  ]);

  const buyCalls = { count: 0 };
  const hotlist: HotlistEntry[] = [
    {
      rank: 1,
      pair: 'btc_idr',
      score: 90,
      confidence: 0.91,
      reasons: ['entry ready'],
      warnings: [],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 81,
      volumeAcceleration: 78,
      orderbookImbalance: 0.4,
      spreadPct: 0.2,
      marketPrice: 1_000_000_000,
      bestBid: 999_500_000,
      bestAsk: 1_000_500_000,
      liquidityScore: 80,
      change1m: 1.2,
      change5m: 2.6,
      contributions: [],
      edgeValid: true,
      recommendedAction: 'ENTER',
      timestamp: Date.now(),
    },
    {
      rank: 2,
      pair: 'xrp_idr',
      score: 70,
      confidence: 0.7,
      reasons: ['edge invalid'],
      warnings: ['avoid'],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 48,
      volumeAcceleration: 44,
      orderbookImbalance: 0.15,
      spreadPct: 0.9,
      marketPrice: 10_000,
      bestBid: 9_900,
      bestAsk: 10_100,
      liquidityScore: 35,
      change1m: 0.1,
      change5m: 0.2,
      contributions: [],
      edgeValid: false,
      recommendedAction: 'AVOID',
      timestamp: Date.now(),
    },
  ];

  const bot = new FakeBot();
  const accounts = new MemoryAccounts();
  registerHandlers(bot as never, createDeps(accounts, { hotlist, buyCalls }) as never);
  assert.ok(bot.actionHandler, 'Action handler harus terpasang untuk buy gating');
  assert.ok(bot.textHandler, 'Text handler harus terpasang untuk buy gating');

  const replies: string[] = [];

  await bot.actionHandler!(
    createActionContext(
      buildCallback({ namespace: 'BUY', action: 'PICK', value: 'TRADE', pair: 'xrp_idr' }),
      replies,
    ),
  );
  assert.ok(
    replies.at(-1)?.includes('Buy ditolak: status BLOCKED'),
    'BUY callback untuk pair blocked harus ditolak dengan status jelas',
  );

  const blockedReplyCount = replies.length;
  await bot.textHandler!(createTextContext('250000', replies));
  assert.equal(
    replies.length,
    blockedReplyCount,
    'Pair blocked tidak boleh melanjutkan ke flow nominal',
  );
  assert.equal(buyCalls.count, 0, 'BUY blocked tidak boleh memanggil execution.buy');
}

async function probeRuntimeContract() {
  const dataDir = await ensureProbeRuntimeEnv();

  const [{ AccountStore }, { AccountRegistry }, { env }, { ReportService: RuntimeReportService }] =
    await Promise.all([
      import('../src/domain/accounts/accountStore'),
      import('../src/domain/accounts/accountRegistry'),
      import('../src/config/env'),
      import('../src/services/reportService'),
    ]);

  const store = new AccountStore();
  const registry = new AccountRegistry(store);
  await registry.initialize();
  await registry.addManualAccount({
    name: 'Probe Runtime',
    apiKey: 'runtime-key',
    apiSecret: 'runtime-secret',
  });
  assert.equal(
    env.accountsFile,
    path.join(dataDir, 'accounts', 'accounts.json'),
    'Contract env.accountsFile harus resolve ke <DATA_DIR>/accounts/accounts.json',
  );

  const raw = JSON.parse(await readFile(env.accountsFile, 'utf8')) as {
    format: string;
    secretStorage: string;
    accounts: Array<{ apiKey: string; apiSecret: string }>;
  };
  assert.equal(raw.format, 'runtime_accounts_v1', 'Runtime file harus memakai format runtime_accounts_v1');
  assert.equal(raw.secretStorage, 'plaintext_local', 'Runtime file harus menyatakan secretStorage plaintext_local');
  assert.ok(Array.isArray(raw.accounts) && raw.accounts.length === 1, 'Runtime file harus menyimpan accounts array');

  const reportText = new RuntimeReportService().accountsText(registry.listAll());
  assert.ok(!reportText.includes('runtime-secret'), 'accountsText tidak boleh membocorkan apiSecret');
  assert.ok(!reportText.includes('runtime-key'), 'accountsText tidak boleh membocorkan apiKey');
}

async function main() {
  await probeTelegramManualFlows();
  await probeTelegramBuyDecisionGating();
  await probeRuntimeContract();
  console.log('PASS telegram_manual_accounts_probe');
}

main().catch((error) => {
  console.error('FAIL telegram_manual_accounts_probe');
  console.error(error);
  process.exit(1);
});
