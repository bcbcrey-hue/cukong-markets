import type { Context, Telegraf } from 'telegraf';
import type {
  ExecutionMode,
  HotlistEntry,
  PositionRecord,
  SignalCandidate,
  TradingMode,
} from '../../core/types';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { BacktestEngine } from '../../domain/backtest/backtestEngine';
import { HotlistService } from '../../domain/market/hotlistService';
import { SettingsService } from '../../domain/settings/settingsService';
import { ExecutionEngine } from '../../domain/trading/executionEngine';
import { OrderManager } from '../../domain/trading/orderManager';
import { PositionManager } from '../../domain/trading/positionManager';
import { HealthService } from '../../services/healthService';
import { JournalService } from '../../services/journalService';
import { ReportService } from '../../services/reportService';
import { StateService } from '../../services/stateService';
import { denyTelegramAccess } from './auth';
import type { TelegramCallbackPayload } from './callbackRouter';
import { parseCallback } from './callbackRouter';
import {
  TELEGRAM_ACTION,
  TELEGRAM_MAIN_MENU,
  accountsCategoryKeyboard,
  accountsKeyboard,
  backtestCategoryKeyboard,
  backtestKeyboard,
  emergencyKeyboard,
  executeTradeKeyboard,
  hotlistKeyboard,
  isTelegramMenuId,
  mainMenuKeyboard,
  monitoringKeyboard,
  positionsKeyboard,
  positionsMenuKeyboard,
  riskSettingsKeyboard,
  settingsKeyboard,
  strategySettingsKeyboard,
  type TelegramMenuId,
} from './keyboards';
import { UploadHandler } from './uploadHandler';

interface HandlerDeps {
  report: ReportService;
  health: HealthService;
  state: StateService;
  hotlist: HotlistService;
  positions: PositionManager;
  orders: OrderManager;
  accounts: AccountRegistry;
  settings: SettingsService;
  execution: ExecutionEngine;
  journal: JournalService;
  uploadHandler: UploadHandler;
  backtest: BacktestEngine;
  runtimeControl?: {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
}

interface UserFlowState {
  awaitingUpload: boolean;
  pendingBuyPair?: string;
  pendingBuyBackMenu?: TelegramMenuId;
  pendingConfig?: 'BUY_SLIPPAGE_BPS' | 'TAKE_PROFIT_PCT';
  pendingSlippageConfirmation?: {
    requestedBps: number;
    cappedBps: number;
  };
}

const userFlows = new Map<number, UserFlowState>();

function getUserFlow(userId: number): UserFlowState {
  const current = userFlows.get(userId) ?? { awaitingUpload: false };
  userFlows.set(userId, current);
  return current;
}

function clearPendingFlow(flow: UserFlowState): void {
  flow.awaitingUpload = false;
  flow.pendingBuyPair = undefined;
  flow.pendingBuyBackMenu = undefined;
  flow.pendingConfig = undefined;
  flow.pendingSlippageConfirmation = undefined;
}

function getTopSignal(
  hotlist: HotlistService,
  pair?: string,
): SignalCandidate | HotlistEntry | undefined {
  const list = hotlist.list();
  if (!pair) {
    return list[0];
  }
  return hotlist.get(pair) ?? list.find((item) => item.pair === pair);
}

function getSellFraction(action: string): number {
  switch (action) {
    case 'SELL25':
      return 0.25;
    case 'SELL50':
      return 0.5;
    case 'SELL75':
      return 0.75;
    case 'SELL100':
      return 1;
    default:
      return 1;
  }
}

function renderRiskText(settings: SettingsService): string {
  const risk = settings.get().risk;
  return [
    '🛡️ RISK SETTINGS',
    `maxOpenPositions=${risk.maxOpenPositions}`,
    `maxPositionSizeIdr=${risk.maxPositionSizeIdr}`,
    `maxPairSpreadPct=${risk.maxPairSpreadPct}`,
    `cooldownMs=${risk.cooldownMs}`,
    `maxDailyLossIdr=${risk.maxDailyLossIdr}`,
    `takeProfitPct=${risk.takeProfitPct}`,
    `stopLossPct=${risk.stopLossPct}`,
    `trailingStopPct=${risk.trailingStopPct}`,
  ].join('\n');
}

function renderStrategyText(settings: SettingsService): string {
  const currentSettings = settings.get();
  const strategy = currentSettings.strategy;
  return [
    '⚙️ STRATEGY SETTINGS',
    `tradingMode=${currentSettings.tradingMode}`,
    `executionMode=${settings.getExecutionMode()}`,
    `dryRun=${currentSettings.dryRun}`,
    `paperTrade=${currentSettings.paperTrade}`,
    `uiOnly=${currentSettings.uiOnly}`,
    `buySlippageBps=${strategy.buySlippageBps}`,
    `maxBuySlippageBps=${strategy.maxBuySlippageBps}`,
    `buyOrderTimeoutMs=${strategy.buyOrderTimeoutMs}`,
    `minPumpProbability=${strategy.minPumpProbability}`,
    `minConfidence=${strategy.minConfidence}`,
  ].join('\n');
}

function renderAccountsText(report: ReportService, accounts: AccountRegistry): string {
  return report.accountsText(accounts.listAll());
}

function renderLogsText(journal: JournalService): string {
  const lines = journal.recent(10).map((item) => {
    const prefix = item.pair ? `${item.pair} | ` : '';
    return `${item.createdAt} | ${item.type} | ${prefix}${item.title}`;
  });

  return lines.length > 0 ? ['📜 LOGS', ...lines].join('\n') : '📜 Belum ada log.';
}

function renderPositionDetail(position: PositionRecord): string {
  return [
    `Pair: ${position.pair}`,
    `Status: ${position.status}`,
    `Qty: ${position.quantity.toFixed(8)}`,
    `Entry: ${position.entryPrice}`,
    `Mark: ${position.currentPrice}`,
    `UPnL: ${position.unrealizedPnl.toFixed(2)}`,
    `RPnL: ${position.realizedPnl.toFixed(2)}`,
  ].join('\n');
}

function isTradingModeValue(value?: string): value is TradingMode {
  return ['OFF', 'ALERT_ONLY', 'SEMI_AUTO', 'FULL_AUTO'].includes(value ?? '');
}

function parsePositionCallbackValue(value?: string): {
  backMenu: TelegramMenuId;
  positionId: string | null;
} {
  if (!value) {
    return { backMenu: 'TRADE', positionId: null };
  }

  const [menuCandidate, ...rest] = value.split(':');
  if (isTelegramMenuId(menuCandidate) && rest.length > 0) {
    return {
      backMenu: menuCandidate,
      positionId: rest.join(':'),
    };
  }

  return {
    backMenu: 'TRADE',
    positionId: value,
  };
}

function resolveHotlistBackMenu(value?: string): TelegramMenuId {
  return isTelegramMenuId(value) ? value : 'MON';
}

function callbackIsSupported(parsed: TelegramCallbackPayload): boolean {
  switch (parsed.namespace) {
    case 'NAV':
      return (
        (parsed.action === 'OPEN' || parsed.action === 'BACK') &&
        isTelegramMenuId(parsed.value)
      );
    case 'RUN':
      return ['START', 'STOP', 'STATUS'].includes(parsed.action);
    case 'ACC':
      return ['LIST', 'UPLOAD', 'RELOAD'].includes(parsed.action);
    case 'SET':
      return (
        parsed.action === 'BUY_SLIPPAGE' ||
        parsed.action === 'TAKE_PROFIT' ||
        (parsed.action === 'EXECUTION_MODE' && ['SIMULATED', 'LIVE'].includes(parsed.value ?? '')) ||
        (parsed.action === 'MODE' && isTradingModeValue(parsed.value))
      );
    case 'SIG':
      return parsed.action === 'DETAIL' && Boolean(parsed.pair);
    case 'BUY':
      return parsed.action === 'PICK' && Boolean(parsed.pair);
    case 'POS':
      return (
        (parsed.action === 'DETAIL' || /^SELL(25|50|75|100)$/.test(parsed.action)) &&
        Boolean(parsed.value)
      );
    case 'EMG':
      return (
        parsed.action === 'CANCEL_ALL' ||
        parsed.action === 'SELL_ALL' ||
        (parsed.action === 'MODE' && isTradingModeValue(parsed.value))
      );
    case 'BKT':
      return ['RUN_TOP', 'RUN_ALL', 'LAST'].includes(parsed.action);
    default:
      return false;
  }
}

export function isSupportedTelegramCallback(parsed: TelegramCallbackPayload): boolean {
  return callbackIsSupported(parsed);
}

async function replyText(
  ctx: Context,
  text: string,
  extra?: Parameters<Context['reply']>[1],
): Promise<void> {
  if (extra) {
    await ctx.reply(text, extra);
    return;
  }

  await ctx.reply(text);
}

async function replyMainMenu(ctx: Context, text: string): Promise<void> {
  await ctx.reply(text, mainMenuKeyboard);
}

async function replyStatus(ctx: Context, deps: HandlerDeps): Promise<void> {
  const health = await deps.health.build({
    scannerRunning: deps.state.get().status === 'RUNNING',
    telegramRunning: true,
    tradingEnabled: deps.settings.get().tradingMode !== 'OFF' && !deps.state.get().emergencyStop,
    executionMode: deps.settings.getExecutionMode(),
    positions: deps.positions.list(),
    orders: deps.orders.list(),
  });

  await replyText(
    ctx,
    deps.report.statusText({
      health,
      activeAccounts: deps.accounts.listEnabled().length,
      topSignal: deps.hotlist.list()[0],
      topOpportunity: deps.state.get().lastOpportunities[0],
    }),
    executeTradeKeyboard,
  );
}

async function openMenu(
  ctx: Context,
  deps: HandlerDeps,
  menuId: TelegramMenuId,
): Promise<void> {
  switch (menuId) {
    case 'ROOT':
      await replyMainMenu(
        ctx,
        [
          'Main Menu aktif.',
          'Pilih 1 dari 7 kategori utama untuk masuk ke submenu yang rapi.',
          'Semua aksi tetap terhubung tanpa dashboard flat lama.',
        ].join('\n'),
      );
      return;
    case 'EXEC':
      await replyText(
        ctx,
        [
          '⚡ EXECUTE TRADE',
          'Kontrol runtime utama bot tanpa mengubah wiring otomasi inti.',
          'Gunakan Start, Stop, atau cek Status kapan saja.',
        ].join('\n'),
        executeTradeKeyboard,
      );
      return;
    case 'EMG':
      await replyText(
        ctx,
        [
          '🚨 EMERGENCY CONTROLS',
          'Akses cepat untuk mode darurat dan aksi eksekusi massal.',
          'Kontrol ini dipisahkan jelas agar mudah dijangkau.',
        ].join('\n'),
        emergencyKeyboard,
      );
      return;
    case 'MON':
      await replyText(
        ctx,
        [
          '📡 MONITORING / LAPORAN',
          'Masuk ke observasi market, hotlist, intelligence, spoof, pattern, dan logs.',
          'Monitoring hanya untuk observasi; otomasi inti tetap berjalan sesuai runtime app.',
        ].join('\n'),
        monitoringKeyboard,
      );
      return;
    case 'TRADE':
      await replyText(
        ctx,
        [
          '📦 POSITIONS / ORDERS / MANUAL TRADE',
          'Pantau posisi dan order, jalankan manual trade, dan atur buy slippage.',
          `Buy slippage saat ini: ${deps.settings.get().strategy.buySlippageBps} bps (maks ${deps.settings.get().strategy.maxBuySlippageBps} bps).`,
        ].join('\n'),
        positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    case 'SET':
      await replyText(
        ctx,
        [
          '⚙️ SETTINGS',
          'Pisahkan Strategy Settings dan Risk Settings agar navigasi lebih jelas.',
          'Perubahan di sini tidak menghapus flow otomasi yang sudah ada.',
        ].join('\n'),
        settingsKeyboard,
      );
      return;
    case 'SET_STRAT':
      await replyText(ctx, renderStrategyText(deps.settings), strategySettingsKeyboard(deps.settings.get()));
      return;
    case 'SET_RISK':
      await replyText(ctx, renderRiskText(deps.settings), riskSettingsKeyboard(deps.settings.get()));
      return;
    case 'ACC':
      await replyText(
        ctx,
        [
          '👤 ACCOUNTS',
          'Kelola jalur akun dari submenu khusus.',
          'Legacy upload account JSON dan storage data/accounts/accounts.json tetap dipertahankan.',
        ].join('\n'),
        accountsCategoryKeyboard,
      );
      return;
    case 'ACC_PANEL':
      await replyText(ctx, renderAccountsText(deps.report, deps.accounts), accountsKeyboard);
      return;
    case 'BKT':
      await replyText(
        ctx,
        [
          '🧪 BACKTEST',
          'Masuk ke kontrol replay/backtest dari submenu terpisah.',
          'Navigasinya konsisten dan tetap punya tombol kembali yang jelas.',
        ].join('\n'),
        backtestCategoryKeyboard,
      );
      return;
    case 'BKT_PANEL': {
      const topPair = deps.state.get().lastOpportunities[0]?.pair;
      await replyText(
        ctx,
        [
          '🧪 BACKTEST',
          'Pilih skenario replay yang ingin dijalankan.',
          `Top pair saat ini: ${topPair ?? '-'}`,
        ].join('\n'),
        backtestKeyboard(topPair),
      );
      return;
    }
    case 'STATUS':
      await replyStatus(ctx, deps);
      return;
    case 'MW':
      await replyText(ctx, deps.report.marketWatchText(deps.hotlist.list()), monitoringKeyboard);
      return;
    case 'HOT': {
      const list = deps.hotlist.list();
      await replyText(
        ctx,
        deps.report.hotlistText(list),
        list.length > 0 ? hotlistKeyboard(list, 'MON') : monitoringKeyboard,
      );
      return;
    }
    case 'INTEL':
      await replyText(
        ctx,
        deps.report.intelligenceReportText(deps.state.get().lastOpportunities),
        monitoringKeyboard,
      );
      return;
    case 'SPOOF':
      await replyText(
        ctx,
        deps.report.spoofRadarText(deps.state.get().lastOpportunities),
        monitoringKeyboard,
      );
      return;
    case 'PAT':
      await replyText(
        ctx,
        deps.report.patternMatchText(deps.state.get().lastOpportunities),
        monitoringKeyboard,
      );
      return;
    case 'LOGS':
      await replyText(ctx, renderLogsText(deps.journal), monitoringKeyboard);
      return;
    case 'POS_LIST': {
      const open = deps.positions.listOpen();
      await replyText(
        ctx,
        open.length > 0 ? deps.report.positionsText(open) : '📦 Belum ada posisi aktif.',
        open.length > 0 ? positionsKeyboard(open, 'TRADE') : positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    }
    case 'ORD_LIST':
      await replyText(
        ctx,
        deps.report.ordersText(deps.orders.list()),
        positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    case 'BUY_MENU': {
      const list = deps.hotlist.list();
      await replyText(
        ctx,
        list.length > 0
          ? '🟢 MANUAL BUY\nPilih pair dari hotlist, lalu kirim nominal IDR.'
          : 'Hotlist kosong. Tunggu market watcher mengisi kandidat terlebih dahulu.',
        list.length > 0 ? hotlistKeyboard(list, 'TRADE') : positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    }
    case 'SELL_MENU': {
      const open = deps.positions.listOpen();
      await replyText(
        ctx,
        open.length > 0
          ? '🔴 MANUAL SELL\nPilih posisi untuk jual sebagian atau penuh.'
          : 'Belum ada posisi aktif untuk dijual.',
        open.length > 0 ? positionsKeyboard(open, 'TRADE') : positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    }
  }
}

async function startRuntime(ctx: Context, deps: HandlerDeps): Promise<void> {
  if (deps.runtimeControl) {
    await deps.runtimeControl.start();
  } else {
    await deps.state.setStatus('RUNNING');
  }
  await replyText(
    ctx,
    deps.runtimeControl
      ? 'Runtime bot diaktifkan. Polling runtime, evaluasi posisi, dan sinkronisasi order aktif dijalankan kembali.'
      : 'Runtime bot diaktifkan. Loop otomatis akan berjalan sesuai state dan konfigurasi saat ini.',
    executeTradeKeyboard,
  );
}

async function stopRuntime(ctx: Context, deps: HandlerDeps): Promise<void> {
  if (deps.runtimeControl) {
    await deps.runtimeControl.stop();
  } else {
    await deps.state.setStatus('STOPPED');
  }
  await replyText(
    ctx,
    deps.runtimeControl
      ? 'Runtime bot dihentikan. Polling runtime dihentikan tanpa mematikan bot Telegram atau server HTTP.'
      : 'Runtime bot dihentikan. Wiring aplikasi tetap utuh, tetapi loop runtime tidak berjalan sampai diaktifkan lagi.',
    executeTradeKeyboard,
  );
}

export function registerHandlers(bot: Telegraf, deps: HandlerDeps): void {
  bot.start(async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const userId = ctx.from?.id;
    if (userId) {
      clearPendingFlow(getUserFlow(userId));
    }

    await openMenu(ctx, deps, 'ROOT');
  });

  bot.hears(TELEGRAM_MAIN_MENU.EXECUTE, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'EXEC');
  });

  bot.hears(TELEGRAM_MAIN_MENU.EMERGENCY, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'EMG');
  });

  bot.hears(TELEGRAM_MAIN_MENU.MONITORING, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'MON');
  });

  bot.hears(TELEGRAM_MAIN_MENU.TRADE, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'TRADE');
  });

  bot.hears(TELEGRAM_MAIN_MENU.SETTINGS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'SET');
  });

  bot.hears(TELEGRAM_MAIN_MENU.ACCOUNTS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'ACC');
  });

  bot.hears(TELEGRAM_MAIN_MENU.BACKTEST, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await openMenu(ctx, deps, 'BKT');
  });

  bot.hears(TELEGRAM_ACTION.START, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await startRuntime(ctx, deps);
  });

  bot.hears(TELEGRAM_ACTION.STOP, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await stopRuntime(ctx, deps);
  });

  bot.hears(TELEGRAM_ACTION.STATUS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await replyStatus(ctx, deps);
  });

  bot.action(/.*/, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const raw =
      ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : '';

    const parsed = parseCallback(raw);
    if (!parsed || !callbackIsSupported(parsed)) {
      await ctx.answerCbQuery('Callback tidak valid');
      return;
    }

    const userId = ctx.from?.id;
    const userFlow = userId ? getUserFlow(userId) : undefined;

    if (
      parsed.namespace === 'NAV' &&
      (parsed.action === 'OPEN' || parsed.action === 'BACK') &&
      parsed.value &&
      isTelegramMenuId(parsed.value)
    ) {
      if (userFlow) {
        clearPendingFlow(userFlow);
      }
      await openMenu(ctx, deps, parsed.value);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'RUN' && parsed.action === 'START') {
      if (userFlow) {
        clearPendingFlow(userFlow);
      }
      await startRuntime(ctx, deps);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'RUN' && parsed.action === 'STOP') {
      if (userFlow) {
        clearPendingFlow(userFlow);
      }
      await stopRuntime(ctx, deps);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'RUN' && parsed.action === 'STATUS') {
      await replyStatus(ctx, deps);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' && parsed.action === 'UPLOAD') {
      if (userFlow) {
        clearPendingFlow(userFlow);
        userFlow.awaitingUpload = true;
      }
      await replyText(
        ctx,
        'Silakan kirim file JSON legacy account sekarang. Upload ini tetap memakai format lama dan akan disimpan ke data/accounts/accounts.json.',
        accountsKeyboard,
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' && parsed.action === 'LIST') {
      await replyText(ctx, renderAccountsText(deps.report, deps.accounts), accountsKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' && parsed.action === 'RELOAD') {
      await deps.accounts.reload();
      await replyText(
        ctx,
        `Accounts berhasil dimuat ulang.\n\n${renderAccountsText(deps.report, deps.accounts)}`,
        accountsKeyboard,
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'MODE' && parsed.value) {
      const mode = parsed.value as TradingMode;
      await deps.settings.setTradingMode(mode);
      await deps.state.setTradingMode(mode);
      await replyText(
        ctx,
        `${renderStrategyText(deps.settings)}\n\nTrading mode diubah ke ${mode}.`,
        strategySettingsKeyboard(deps.settings.get()),
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'EXECUTION_MODE' && parsed.value) {
      const mode = parsed.value as ExecutionMode;
      await deps.settings.setExecutionMode(mode);

      const modeHint =
        mode === 'LIVE' && ['OFF', 'ALERT_ONLY'].includes(deps.settings.get().tradingMode)
          ? '\n\nCatatan: eksekusi LIVE sudah di-arm, tetapi trading mode saat ini masih belum mengizinkan eksekusi order nyata.'
          : '';

      await replyText(
        ctx,
        `${renderStrategyText(deps.settings)}\n\nExecution mode diubah ke ${mode}.${modeHint}`,
        strategySettingsKeyboard(deps.settings.get()),
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'BUY_SLIPPAGE') {
      if (userFlow) {
        userFlow.awaitingUpload = false;
        userFlow.pendingBuyPair = undefined;
        userFlow.pendingBuyBackMenu = undefined;
        userFlow.pendingConfig = 'BUY_SLIPPAGE_BPS';
        userFlow.pendingSlippageConfirmation = undefined;
      }
      await replyText(
        ctx,
        [
          'Kirim buy slippage dalam bps.',
          `Saat ini: ${deps.settings.get().strategy.buySlippageBps} bps`,
          `Batas aman: ${deps.settings.get().strategy.maxBuySlippageBps} bps`,
          'Jika nilai di atas batas aman, bot akan memberi warning dan meminta konfirmasi untuk mengunci ke batas maksimum.',
        ].join('\n'),
        positionsMenuKeyboard(deps.settings.get()),
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'TAKE_PROFIT') {
      if (userFlow) {
        userFlow.awaitingUpload = false;
        userFlow.pendingBuyPair = undefined;
        userFlow.pendingBuyBackMenu = undefined;
        userFlow.pendingConfig = 'TAKE_PROFIT_PCT';
        userFlow.pendingSlippageConfirmation = undefined;
      }
      await replyText(
        ctx,
        `Kirim nilai take profit persen.\nSaat ini: ${deps.settings.get().risk.takeProfitPct}%`,
        riskSettingsKeyboard(deps.settings.get()),
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SIG' && parsed.action === 'DETAIL' && parsed.pair) {
      const signal = getTopSignal(deps.hotlist, parsed.pair);
      const backMenu = resolveHotlistBackMenu(parsed.value);

      if (!signal) {
        await replyText(ctx, 'Signal tidak ditemukan.', monitoringKeyboard);
      } else {
        await replyText(
          ctx,
          deps.report.signalBreakdownText(signal),
          hotlistKeyboard(deps.hotlist.list(), backMenu),
        );
      }

      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BUY' && parsed.action === 'PICK' && parsed.pair) {
      if (userFlow) {
        userFlow.awaitingUpload = false;
        userFlow.pendingBuyPair = parsed.pair;
        userFlow.pendingBuyBackMenu = isTelegramMenuId(parsed.value) ? parsed.value : 'TRADE';
        userFlow.pendingConfig = undefined;
        userFlow.pendingSlippageConfirmation = undefined;
      }
      await replyText(ctx, `Kirim nominal IDR untuk buy ${parsed.pair}.\nContoh: 250000`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' && parsed.action.startsWith('SELL') && parsed.value) {
      const fraction = getSellFraction(parsed.action);
      const { backMenu, positionId } = parsePositionCallbackValue(parsed.value);
      const position = positionId ? deps.positions.getById(positionId) : undefined;

      if (!position) {
        await replyText(ctx, 'Posisi tidak ditemukan.', positionsMenuKeyboard(deps.settings.get()));
        await ctx.answerCbQuery();
        return;
      }

      const result = await deps.execution.manualSell(
        position.id,
        position.quantity * fraction,
        'MANUAL',
      );
      const openPositions = deps.positions.listOpen();

      await replyText(
        ctx,
        result,
        openPositions.length > 0
          ? positionsKeyboard(openPositions, backMenu)
          : positionsMenuKeyboard(deps.settings.get()),
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' && parsed.action === 'DETAIL' && parsed.value) {
      const { backMenu, positionId } = parsePositionCallbackValue(parsed.value);
      const position = positionId ? deps.positions.getById(positionId) : undefined;

      if (position) {
        const openPositions = deps.positions.listOpen();
        await replyText(
          ctx,
          renderPositionDetail(position),
          openPositions.length > 0
            ? positionsKeyboard(openPositions, backMenu)
            : positionsMenuKeyboard(deps.settings.get()),
        );
      } else {
        await replyText(ctx, 'Posisi tidak ditemukan.', positionsMenuKeyboard(deps.settings.get()));
      }

      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'MODE' && parsed.value) {
      const mode = parsed.value as TradingMode;
      await deps.settings.setTradingMode(mode);
      await deps.state.setTradingMode(mode);
      await replyText(ctx, `Emergency mode aktif: ${mode}`, emergencyKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'CANCEL_ALL') {
      await replyText(ctx, await deps.execution.cancelAllOrders(), emergencyKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'SELL_ALL') {
      await replyText(ctx, await deps.execution.sellAllPositions(), emergencyKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BKT' && parsed.action === 'RUN_TOP') {
      const topPair = parsed.pair ?? deps.state.get().lastOpportunities[0]?.pair;
      const result = await deps.backtest.run(
        {
          pair: topPair,
          maxEvents: 300,
        },
        deps.settings.get(),
      );
      await replyText(ctx, deps.report.backtestSummaryText(result), backtestKeyboard(topPair));
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BKT' && parsed.action === 'RUN_ALL') {
      const result = await deps.backtest.run(
        {
          maxEvents: 500,
        },
        deps.settings.get(),
      );
      await replyText(ctx, deps.report.backtestSummaryText(result), backtestKeyboard());
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BKT' && parsed.action === 'LAST') {
      const latest = await deps.backtest.latestResult();
      const topPair = deps.state.get().lastOpportunities[0]?.pair;
      await replyText(ctx, deps.report.backtestSummaryText(latest), backtestKeyboard(topPair));
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery('Aksi belum dikenali');
  });

  bot.on('document', async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const userId = ctx.from?.id;
    if (!userId) {
      await replyText(ctx, 'User tidak dikenali.');
      return;
    }

    const userFlow = getUserFlow(userId);
    if (!userFlow.awaitingUpload) {
      await replyText(ctx, 'Pilih menu Accounts → Upload JSON terlebih dahulu.', accountsKeyboard);
      return;
    }

    try {
      const message = await deps.uploadHandler.handleDocument(ctx);
      clearPendingFlow(userFlow);
      await replyText(ctx, message, accountsKeyboard);
    } catch (error) {
      await replyText(
        ctx,
        error instanceof Error ? error.message : 'Upload gagal.',
        accountsKeyboard,
      );
    }
  });

  bot.on('text', async (ctx: Context) => {
    if (await denyTelegramAccess(ctx)) return;

    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const userFlow = getUserFlow(userId);
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (userFlow.pendingSlippageConfirmation) {
      if (/^(ya|yes|lanjut)$/i.test(text)) {
        await deps.settings.patchStrategy({
          buySlippageBps: userFlow.pendingSlippageConfirmation.cappedBps,
        });
        userFlow.pendingConfig = undefined;
        userFlow.pendingSlippageConfirmation = undefined;
        await replyText(
          ctx,
          `Buy slippage dikunci ke ${deps.settings.get().strategy.buySlippageBps} bps setelah melewati batas aman.`,
          positionsMenuKeyboard(deps.settings.get()),
        );
        return;
      }

      if (/^batal$/i.test(text)) {
        userFlow.pendingConfig = undefined;
        userFlow.pendingSlippageConfirmation = undefined;
        await replyText(ctx, 'Perubahan buy slippage dibatalkan.', positionsMenuKeyboard(deps.settings.get()));
        return;
      }

      userFlow.pendingSlippageConfirmation = undefined;
    }

    if (userFlow.pendingConfig === 'BUY_SLIPPAGE_BPS') {
      const slippageBps = Math.round(Number(text.replace(/[^0-9.]/g, '')));
      if (!Number.isFinite(slippageBps) || slippageBps < 0) {
        await replyText(ctx, 'Nilai slippage tidak valid. Kirim angka bps, misalnya 60');
        return;
      }

      const maxBuySlippageBps = deps.settings.get().strategy.maxBuySlippageBps;
      if (slippageBps > maxBuySlippageBps) {
        userFlow.pendingSlippageConfirmation = {
          requestedBps: slippageBps,
          cappedBps: maxBuySlippageBps,
        };
        await replyText(
          ctx,
          [
            `⚠️ ${slippageBps} bps melebihi batas aman ${maxBuySlippageBps} bps.`,
            `Balas LANJUT untuk tetap set ke ${maxBuySlippageBps} bps, atau kirim angka lain untuk mengganti nilai.`,
            'Balas BATAL jika ingin membatalkan perubahan.',
          ].join('\n'),
        );
        return;
      }

      await deps.settings.patchStrategy({ buySlippageBps: slippageBps });
      userFlow.pendingConfig = undefined;
      userFlow.pendingSlippageConfirmation = undefined;
      await replyText(
        ctx,
        `Buy slippage diubah ke ${slippageBps} bps.`,
        positionsMenuKeyboard(deps.settings.get()),
      );
      return;
    }

    if (userFlow.pendingConfig === 'TAKE_PROFIT_PCT') {
      const takeProfitPct = Number(text.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(takeProfitPct) || takeProfitPct <= 0 || takeProfitPct > 100) {
        await replyText(ctx, 'Take profit tidak valid. Kirim angka persen, misalnya 15');
        return;
      }

      await deps.settings.patchRisk({ takeProfitPct });
      userFlow.pendingConfig = undefined;
      userFlow.pendingSlippageConfirmation = undefined;
      await replyText(
        ctx,
        `Take profit diubah ke ${takeProfitPct}%.`,
        riskSettingsKeyboard(deps.settings.get()),
      );
      return;
    }

    if (!userFlow.pendingBuyPair) {
      return;
    }

    const amountIdr = Number(text.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      await replyText(ctx, 'Nominal buy tidak valid.\nKirim angka murni, misalnya 250000');
      return;
    }

    const signal = getTopSignal(deps.hotlist, userFlow.pendingBuyPair);
    const account = deps.accounts.getDefault();

    if (!signal || !account) {
      userFlow.pendingBuyPair = undefined;
      userFlow.pendingBuyBackMenu = undefined;
      await replyText(ctx, 'Signal atau default account tidak tersedia.');
      return;
    }

    const result = await deps.execution.buy(account.id, signal, amountIdr, 'MANUAL');
    const backMenu = userFlow.pendingBuyBackMenu ?? 'TRADE';
    userFlow.pendingBuyPair = undefined;
    userFlow.pendingBuyBackMenu = undefined;
    await replyText(
      ctx,
      result,
      backMenu === 'MON' ? monitoringKeyboard : positionsMenuKeyboard(deps.settings.get()),
    );
  });
}
