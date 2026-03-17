import type { Context, Telegraf } from 'telegraf';
import type {
  HotlistEntry,
  PositionRecord,
  SignalCandidate,
  TradingMode,
} from '../../core/types';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { BacktestEngine } from '../../domain/backtest/backtestEngine';
import { HotlistService } from '../../domain/market/hotlistService';
import { ExecutionEngine } from '../../domain/trading/executionEngine';
import { OrderManager } from '../../domain/trading/orderManager';
import { PositionManager } from '../../domain/trading/positionManager';
import { SettingsService } from '../../domain/settings/settingsService';
import { HealthService } from '../../services/healthService';
import { JournalService } from '../../services/journalService';
import { ReportService } from '../../services/reportService';
import { StateService } from '../../services/stateService';
import { denyTelegramAccess } from './auth';
import { parseCallback } from './callbackRouter';
import {
  TELEGRAM_MENU,
  accountsKeyboard,
  backtestKeyboard,
  emergencyKeyboard,
  hotlistKeyboard,
  mainMenuKeyboard,
  positionsKeyboard,
  riskSettingsKeyboard,
  strategySettingsKeyboard,
  tradingModeKeyboard,
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
}

interface UserFlowState {
  awaitingUpload: boolean;
  pendingBuyPair?: string;
  pendingConfig?: 'BUY_SLIPPAGE_BPS' | 'TAKE_PROFIT_PCT';
}

const userFlows = new Map<number, UserFlowState>();

function getUserFlow(userId: number): UserFlowState {
  const current = userFlows.get(userId) ?? { awaitingUpload: false };
  userFlows.set(userId, current);
  return current;
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

function renderOrdersText(
  orders: Array<{
    pair: string;
    side: string;
    status: string;
    quantity: number;
    price: number;
  }>,
): string {
  const lines = orders.slice(0, 10).map((item) => {
    return `${item.pair} ${item.side} ${item.status} qty=${item.quantity.toFixed(8)} px=${item.price}`;
  });

  return lines.length > 0 ? lines.join('\n') : 'Belum ada order.';
}

function renderRiskText(settings: SettingsService): string {
  const risk = settings.get().risk;
  return [
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
  const strategy = settings.get().strategy;
  return [
    `tradingMode=${settings.get().tradingMode}`,
    `buySlippageBps=${strategy.buySlippageBps}`,
    `maxBuySlippageBps=${strategy.maxBuySlippageBps}`,
    `buyOrderTimeoutMs=${strategy.buyOrderTimeoutMs}`,
    `minPumpProbability=${strategy.minPumpProbability}`,
    `minConfidence=${strategy.minConfidence}`,
  ].join('\n');
}

function renderAccountsText(accounts: AccountRegistry): string {
  const lines = accounts.listAll().map((item) => {
    return `• ${item.name} | ${item.enabled ? 'enabled' : 'disabled'}${item.isDefault ? ' | default' : ''}`;
  });

  return `Accounts:\n${lines.join('\n') || '-'}`;
}

function renderLogsText(journal: JournalService): string {
  const lines = journal.recent(10).map((item) => {
    const prefix = item.pair ? `${item.pair} | ` : '';
    return `${item.createdAt} | ${item.type} | ${prefix}${item.title}`;
  });

  return lines.length > 0 ? lines.join('\n') : 'Belum ada log.';
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

export function registerHandlers(bot: Telegraf, deps: HandlerDeps): void {
  bot.start(async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply('Bot aktif.\nGunakan tombol menu utama.', mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.START, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await deps.state.setStatus('RUNNING');
    await ctx.reply('Engine started.', mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.STOP, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await deps.state.setStatus('STOPPED');
    await ctx.reply('Engine stopped.', mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.STATUS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const health = await deps.health.build({
      scannerRunning: deps.state.get().status === 'RUNNING',
      telegramRunning: true,
      tradingEnabled: deps.settings.get().tradingMode !== 'OFF',
      positions: deps.positions.list(),
      orders: deps.orders.list(),
    });

    await ctx.reply(
      deps.report.statusText({
        health,
        activeAccounts: deps.accounts.listEnabled().length,
        topSignal: deps.hotlist.list()[0],
        topOpportunity: deps.state.get().lastOpportunities[0],
      }),
      mainMenuKeyboard,
    );
  });

  bot.hears(TELEGRAM_MENU.HOTLIST, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    const list = deps.hotlist.list();
    await ctx.reply(deps.report.hotlistText(list), hotlistKeyboard(list));
  });

  bot.hears(TELEGRAM_MENU.MARKET_WATCH, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(deps.report.marketWatchText(deps.hotlist.list()), mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.INTELLIGENCE, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(
      deps.report.intelligenceReportText(deps.state.get().lastOpportunities),
      mainMenuKeyboard,
    );
  });

  bot.hears(TELEGRAM_MENU.SPOOF, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(
      deps.report.spoofRadarText(deps.state.get().lastOpportunities),
      mainMenuKeyboard,
    );
  });

  bot.hears(TELEGRAM_MENU.PATTERN, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(
      deps.report.patternMatchText(deps.state.get().lastOpportunities),
      mainMenuKeyboard,
    );
  });

  bot.hears(TELEGRAM_MENU.POSITIONS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    const open = deps.positions.listOpen();

    if (open.length === 0) {
      await ctx.reply('Belum ada posisi aktif.', mainMenuKeyboard);
      return;
    }

    await ctx.reply(deps.report.positionsText(open), positionsKeyboard(open));
  });

  bot.hears(TELEGRAM_MENU.ORDERS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(renderOrdersText(deps.orders.list()), mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.MANUAL_BUY, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    const list = deps.hotlist.list();

    if (list.length === 0) {
      await ctx.reply('Hotlist kosong.\nTunggu market watcher mengisi kandidat.', mainMenuKeyboard);
      return;
    }

    await ctx.reply('Pilih pair dari hotlist untuk manual buy.', hotlistKeyboard(list));
  });

  bot.hears(TELEGRAM_MENU.MANUAL_SELL, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    const open = deps.positions.listOpen();

    if (open.length === 0) {
      await ctx.reply('Belum ada posisi aktif.', mainMenuKeyboard);
      return;
    }

    await ctx.reply('Pilih posisi untuk dijual.', positionsKeyboard(open));
  });

  bot.hears(TELEGRAM_MENU.STRATEGY, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(
      renderStrategyText(deps.settings),
      strategySettingsKeyboard(deps.settings.get()),
    );
  });

  bot.hears(TELEGRAM_MENU.RISK, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(renderRiskText(deps.settings), riskSettingsKeyboard(deps.settings.get()));
  });

  bot.hears(TELEGRAM_MENU.ACCOUNTS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(renderAccountsText(deps.accounts), accountsKeyboard);
  });

  bot.hears(TELEGRAM_MENU.LOGS, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply(renderLogsText(deps.journal), mainMenuKeyboard);
  });

  bot.hears(TELEGRAM_MENU.BACKTEST, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    const topPair = deps.state.get().lastOpportunities[0]?.pair;
    await ctx.reply('Backtest controls:', backtestKeyboard(topPair));
  });

  bot.hears(TELEGRAM_MENU.EMERGENCY, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;
    await ctx.reply('Emergency controls:', emergencyKeyboard);
  });

  bot.action(/.*/, async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const raw =
      ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : '';

    const parsed = parseCallback(raw);
    if (!parsed) {
      await ctx.answerCbQuery('Callback tidak valid');
      return;
    }

    const userId = ctx.from?.id;
    const userFlow = userId ? getUserFlow(userId) : undefined;

    if (parsed.namespace === 'ACC' && parsed.action === 'UPLOAD') {
      if (userFlow) {
        userFlow.awaitingUpload = true;
      }
      await ctx.reply('Silakan kirim file JSON legacy account sekarang.');
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' && parsed.action === 'LIST') {
      await ctx.reply(renderAccountsText(deps.accounts));
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' && parsed.action === 'RELOAD') {
      await deps.accounts.reload();
      await ctx.reply('Accounts reloaded.');
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'MODE' && parsed.value) {
      const mode = parsed.value as TradingMode;
      await deps.settings.setTradingMode(mode);
      await deps.state.setTradingMode(mode);
      await ctx.reply(`Trading mode diubah ke ${mode}`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'BUY_SLIPPAGE') {
      if (userFlow) {
        userFlow.pendingConfig = 'BUY_SLIPPAGE_BPS';
      }
      await ctx.reply(
        `Kirim buy slippage dalam bps.\nSaat ini: ${deps.settings.get().strategy.buySlippageBps} bps\nMaks aman: ${deps.settings.get().strategy.maxBuySlippageBps} bps`,
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' && parsed.action === 'TAKE_PROFIT') {
      if (userFlow) {
        userFlow.pendingConfig = 'TAKE_PROFIT_PCT';
      }
      await ctx.reply(
        `Kirim nilai take profit persen.\nSaat ini: ${deps.settings.get().risk.takeProfitPct}%`,
      );
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SIG' && parsed.action === 'DETAIL' && parsed.pair) {
      const signal = getTopSignal(deps.hotlist, parsed.pair);
      if (!signal) {
        await ctx.reply('Signal tidak ditemukan.');
      } else {
        await ctx.reply(deps.report.signalBreakdownText(signal));
      }
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BUY' && parsed.action === 'PICK' && parsed.pair) {
      if (userFlow) {
        userFlow.pendingBuyPair = parsed.pair;
      }
      await ctx.reply(`Kirim nominal IDR untuk buy ${parsed.pair}.\nContoh: 250000`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' && parsed.action.startsWith('SELL') && parsed.value) {
      const fraction = getSellFraction(parsed.action);
      const position = deps.positions.getById(parsed.value);

      if (!position) {
        await ctx.reply('Posisi tidak ditemukan.');
        await ctx.answerCbQuery();
        return;
      }

      const result = await deps.execution.manualSell(
        parsed.value,
        position.quantity * fraction,
        'MANUAL',
      );
      await ctx.reply(result);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' && parsed.action === 'DETAIL' && parsed.value) {
      const position = deps.positions.getById(parsed.value);
      if (position) {
        await ctx.reply(renderPositionDetail(position));
      } else {
        await ctx.reply('Posisi tidak ditemukan.');
      }
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'MODE' && parsed.value) {
      const mode = parsed.value as TradingMode;
      await deps.settings.setTradingMode(mode);
      await deps.state.setTradingMode(mode);
      await ctx.reply(`Emergency mode: ${mode}`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'CANCEL_ALL') {
      await ctx.reply(await deps.execution.cancelAllOrders());
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' && parsed.action === 'SELL_ALL') {
      await ctx.reply(await deps.execution.sellAllPositions());
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
      await ctx.reply(deps.report.backtestSummaryText(result), mainMenuKeyboard);
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
      await ctx.reply(deps.report.backtestSummaryText(result), mainMenuKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BKT' && parsed.action === 'LAST') {
      const latest = await deps.backtest.latestResult();
      await ctx.reply(deps.report.backtestSummaryText(latest), mainMenuKeyboard);
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery('Aksi belum dikenali');
  });

  bot.on('document', async (ctx) => {
    if (await denyTelegramAccess(ctx)) return;

    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('User tidak dikenali.');
      return;
    }

    const userFlow = getUserFlow(userId);
    if (!userFlow.awaitingUpload) {
      await ctx.reply('Pilih menu Accounts -> Upload JSON terlebih dahulu.');
      return;
    }

    try {
      const message = await deps.uploadHandler.handleDocument(ctx);
      userFlow.awaitingUpload = false;
      await ctx.reply(message, mainMenuKeyboard);
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : 'Upload gagal.');
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

    if (userFlow.pendingConfig === 'BUY_SLIPPAGE_BPS') {
      const slippageBps = Math.round(Number(text.replace(/[^0-9.]/g, '')));
      if (!Number.isFinite(slippageBps) || slippageBps < 0) {
        await ctx.reply('Nilai slippage tidak valid. Kirim angka bps, misalnya 25');
        return;
      }

      const maxBuySlippageBps = deps.settings.get().strategy.maxBuySlippageBps;
      if (slippageBps > maxBuySlippageBps) {
        await ctx.reply(`Slippage melebihi pagar aman. Maksimum ${maxBuySlippageBps} bps.`);
        return;
      }

      await deps.settings.patchStrategy({ buySlippageBps: slippageBps });
      userFlow.pendingConfig = undefined;
      await ctx.reply(`Buy slippage diubah ke ${slippageBps} bps`, mainMenuKeyboard);
      return;
    }

    if (userFlow.pendingConfig === 'TAKE_PROFIT_PCT') {
      const takeProfitPct = Number(text.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(takeProfitPct) || takeProfitPct <= 0 || takeProfitPct > 100) {
        await ctx.reply('Take profit tidak valid. Kirim angka persen, misalnya 15');
        return;
      }

      await deps.settings.patchRisk({ takeProfitPct });
      userFlow.pendingConfig = undefined;
      await ctx.reply(`Take profit diubah ke ${takeProfitPct}%`, mainMenuKeyboard);
      return;
    }

    if (!userFlow.pendingBuyPair) {
      return;
    }

    const amountIdr = Number(text.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      await ctx.reply('Nominal buy tidak valid.\nKirim angka murni, misalnya 250000');
      return;
    }

    const signal = getTopSignal(deps.hotlist, userFlow.pendingBuyPair);
    const account = deps.accounts.getDefault();

    if (!signal || !account) {
      userFlow.pendingBuyPair = undefined;
      await ctx.reply('Signal atau default account tidak tersedia.');
      return;
    }

    const result = await deps.execution.buy(account.id, signal, amountIdr, 'MANUAL');
    userFlow.pendingBuyPair = undefined;
    await ctx.reply(result, mainMenuKeyboard);
  });
}
