import type { Context, Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import type { SignalCandidate } from '../../core/types';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { HotlistService } from '../../domain/market/hotlistService';
import { ExecutionEngine } from '../../domain/trading/executionEngine';
import { OrderManager } from '../../domain/trading/orderManager';
import { PositionManager } from '../../domain/trading/positionManager';
import { SettingsService } from '../../domain/settings/settingsService';
import { HealthService } from '../../services/healthService';
import { JournalService } from '../../services/journalService';
import { ReportService } from '../../services/reportService';
import { StateService } from '../../services/stateService';
import { isAllowedUser } from './auth';
import { buildCallback, parseCallback } from './callbackRouter';
import { accountsKeyboard, emergencyKeyboard, hotlistKeyboard, mainMenuKeyboard, positionsKeyboard, tradingModeKeyboard } from './keyboards';
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
}

interface UserFlowState {
  awaitingUpload: boolean;
  pendingBuyPair?: string;
  pendingSellPositionId?: string;
}

const flow = new Map<number, UserFlowState>();

function getFlow(userId: number): UserFlowState {
  const current = flow.get(userId) ?? { awaitingUpload: false };
  flow.set(userId, current);
  return current;
}

async function deny(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (userId \&\& isAllowedUser(userId)) {
    return false;
  }
  await ctx.reply('Access denied');
  return true;
}

function getTopSignal(hotlist: HotlistService, pair?: string): SignalCandidate | undefined {
  if (!pair) {
    return hotlist.list()\[0];
  }
  return hotlist.get(pair) ?? hotlist.list().find((item) => item.pair === pair);
}

export function registerHandlers(bot: Telegraf, deps: HandlerDeps): void {
  bot.start(async (ctx) => {
    if (await deny(ctx)) return;
    await ctx.reply('Bot aktif. Gunakan tombol menu utama.', mainMenuKeyboard);
  });

  bot.hears('▶️ Start Bot', async (ctx) => {
    if (await deny(ctx)) return;
    await deps.state.setStarted(true);
    await ctx.reply('Engine started.', mainMenuKeyboard);
  });

  bot.hears('⏹️ Stop Bot', async (ctx) => {
    if (await deny(ctx)) return;
    await deps.state.setStarted(false);
    await ctx.reply('Engine stopped.', mainMenuKeyboard);
  });

  bot.hears('📊 Status', async (ctx) => {
    if (await deny(ctx)) return;
    const health = deps.health.snapshot({
      positions: deps.positions.list(),
      orders: deps.orders.list(),
      hotlist: deps.hotlist.list(),
    });
    await ctx.reply(deps.report.statusText({
      health,
      activeAccounts: deps.accounts.listEnabled().length,
      topSignal: deps.hotlist.list()\[0],
    }), mainMenuKeyboard);
  });

  bot.hears('🔥 Hotlist', async (ctx) => {
    if (await deny(ctx)) return;
    const list = deps.hotlist.list();
    await ctx.reply(deps.report.hotlistText(list), hotlistKeyboard(list));
  });

  bot.hears('👀 Market Watch', async (ctx) => {
    if (await deny(ctx)) return;
    await ctx.reply(deps.report.marketWatchText(deps.hotlist.list()), mainMenuKeyboard);
  });

  bot.hears('📦 Positions', async (ctx) => {
    if (await deny(ctx)) return;
    const open = deps.positions.listOpen();
    if (!open.length) {
      await ctx.reply('Belum ada posisi aktif.', mainMenuKeyboard);
      return;
    }
    await ctx.reply(deps.report.positionsText(open), positionsKeyboard(open));
  });

  bot.hears('🧾 Orders', async (ctx) => {
    if (await deny(ctx)) return;
    const lines = deps.orders.list().slice(0, 10).map((item) => `${item.pair} ${item.side} ${item.status} qty=${item.quantity.toFixed(8)} px=${item.price}`);
    await ctx.reply(lines.length ? lines.join('
') : 'Belum ada order.', mainMenuKeyboard);
  });

  bot.hears('🟢 Manual Buy', async (ctx) => {
    if (await deny(ctx)) return;
    const list = deps.hotlist.list();
    if (!list.length) {
      await ctx.reply('Hotlist kosong. Tunggu market watcher mengisi kandidat.', mainMenuKeyboard);
      return;
    }
    await ctx.reply('Pilih pair dari hotlist untuk manual buy.', hotlistKeyboard(list));
  });

  bot.hears('🔴 Manual Sell', async (ctx) => {
    if (await deny(ctx)) return;
    const open = deps.positions.listOpen();
    if (!open.length) {
      await ctx.reply('Belum ada posisi aktif.', mainMenuKeyboard);
      return;
    }
    await ctx.reply('Pilih posisi untuk dijual.', positionsKeyboard(open));
  });

  bot.hears('⚙️ Strategy Settings', async (ctx) => {
    if (await deny(ctx)) return;
    await ctx.reply(`Mode saat ini: ${deps.settings.get().tradingMode}`, tradingModeKeyboard(deps.settings.get().tradingMode));
  });

  bot.hears('🛡️ Risk Settings', async (ctx) => {
    if (await deny(ctx)) return;
    const risk = deps.settings.get().risk;
    await ctx.reply(\[
      `maxModalPerTrade=${risk.maxModalPerTrade}`,
      `maxActivePositionsTotal=${risk.maxActivePositionsTotal}`,
      `maxActivePositionsPerAccount=${risk.maxActivePositionsPerAccount}`,
      `maxExposurePerPair=${risk.maxExposurePerPair}`,
      `maxSpreadPct=${risk.maxSpreadPct}`,
      `maxSlippagePct=${risk.maxSlippagePct}`,
      `minLiquidityScore=${risk.minLiquidityScore}`,
    ].join('
'), mainMenuKeyboard);
  });

  bot.hears('👤 Accounts', async (ctx) => {
    if (await deny(ctx)) return;
    const lines = deps.accounts.listAll().map((item) => `• ${item.name} | ${item.enabled ? 'enabled' : 'disabled'}${item.isDefault ? ' | default' : ''}`);
    await ctx.reply(`Accounts:
${lines.join('
') || '-'}`, accountsKeyboard);
  });

  bot.hears('🪵 Logs', async (ctx) => {
    if (await deny(ctx)) return;
    const lines = deps.journal.list().slice(0, 10).map((item) => `${item.createdAt} | ${item.pair} | ${item.side} | qty=${item.quantity.toFixed(8)} | pnl=${item.pnl.toFixed(2)}`);
    await ctx.reply(lines.length ? lines.join('
') : 'Belum ada journal trade.', mainMenuKeyboard);
  });

  bot.hears('🚨 Emergency Controls', async (ctx) => {
    if (await deny(ctx)) return;
    await ctx.reply('Emergency controls:', emergencyKeyboard);
  });

  bot.action(/.\*/, async (ctx) => {
    if (await deny(ctx)) return;
    const parsed = parseCallback(ctx.callbackQuery \&\& 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '');
    if (!parsed) {
      await ctx.answerCbQuery('Callback tidak valid');
      return;
    }

    const userId = ctx.from?.id;
    const userFlow = userId ? getFlow(userId) : undefined;

    if (parsed.namespace === 'ACC' \&\& parsed.action === 'UPLOAD') {
      if (userFlow) {
        userFlow.awaitingUpload = true;
      }
      await ctx.reply('Silakan kirim file JSON legacy account sekarang.');
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' \&\& parsed.action === 'LIST') {
      const lines = deps.accounts.listAll().map((item) => `• ${item.name} | ${item.enabled ? 'enabled' : 'disabled'}${item.isDefault ? ' | default' : ''}`);
      await ctx.reply(lines.join('
') || 'Belum ada account.');
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'ACC' \&\& parsed.action === 'RELOAD') {
      await deps.accounts.reload();
      await ctx.reply('Accounts reloaded.');
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SET' \&\& parsed.action === 'MODE' \&\& parsed.accountId) {
      await deps.settings.setTradingMode(parsed.accountId as any);
      await deps.state.setTradingMode(parsed.accountId as any);
      await ctx.reply(`Trading mode diubah ke ${parsed.accountId}`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'SIG' \&\& parsed.action === 'DETAIL' \&\& parsed.pair) {
      const signal = getTopSignal(deps.hotlist, parsed.pair);
      if (!signal) {
        await ctx.reply('Signal tidak ditemukan.');
      } else {
        await ctx.reply(deps.report.signalBreakdownText(signal));
      }
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'BUY' \&\& parsed.action === 'PICK' \&\& parsed.pair) {
      if (userFlow) {
        userFlow.pendingBuyPair = parsed.pair;
      }
      await ctx.reply(`Kirim nominal IDR untuk buy ${parsed.pair}. Contoh: 250000`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' \&\& parsed.action.startsWith('SELL') \&\& parsed.accountId) {
      const fractionMap: Record<string, number> = { SELL25: 0.25, SELL50: 0.5, SELL75: 0.75, SELL100: 1 };
      const fraction = fractionMap\[parsed.action] ?? 1;
      const result = await deps.execution.manualSell(parsed.accountId, fraction, 'manual');
      await ctx.reply(result);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'POS' \&\& parsed.action === 'DETAIL' \&\& parsed.accountId) {
      const position = deps.positions.getById(parsed.accountId);
      if (position) {
        await ctx.reply(`Position ${position.pair}
qty=${position.remainingQuantity}
entry=${position.entryPrice}
mark=${position.lastMarkPrice}`);
      }
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' \&\& parsed.action === 'MODE' \&\& parsed.accountId) {
      await deps.settings.setTradingMode(parsed.accountId as any);
      await deps.state.setTradingMode(parsed.accountId as any);
      await ctx.reply(`Emergency mode: ${parsed.accountId}`);
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' \&\& parsed.action === 'CANCEL\_ALL') {
      await ctx.reply(await deps.execution.cancelAllOrders());
      await ctx.answerCbQuery();
      return;
    }

    if (parsed.namespace === 'EMG' \&\& parsed.action === 'SELL\_ALL') {
      await ctx.reply(await deps.execution.sellAllPositions());
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery('Aksi belum dikenali');
  });

  bot.on('document', async (ctx) => {
    if (await deny(ctx)) return;
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('User tidak dikenali.');
      return;
    }
    const userFlow = getFlow(userId);
    if (!userFlow.awaitingUpload) {
      await ctx.reply('Pilih menu Accounts -> Upload JSON terlebih dahulu.');
      return;
    }
    try {
      const message = await deps.uploadHandler.handleDocument(ctx);
      userFlow.awaitingUpload = false;
      await ctx.reply(message, mainMenuKeyboard);
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : 'Upload gagal');
    }
  });

  bot.on('text', async (ctx) => {
    if (await deny(ctx)) return;
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }
    const userFlow = getFlow(userId);
    const text = (ctx.message as { text?: string }).text?.trim() ?? '';

    if (userFlow.pendingBuyPair) {
      const amountIdr = Number(text.replace(/\[^0-9.]/g, ''));
      if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
        await ctx.reply('Nominal buy tidak valid. Kirim angka murni, misalnya 250000');
        return;
      }
      const signal = getTopSignal(deps.hotlist, userFlow.pendingBuyPair);
      const account = deps.accounts.getDefault();
      if (!signal || !account) {
        userFlow.pendingBuyPair = undefined;
        await ctx.reply('Signal atau default account tidak tersedia.');
        return;
      }
      const result = await deps.execution.buy(account.id, signal, amountIdr, 'manual-buy');
      userFlow.pendingBuyPair = undefined;
      await ctx.reply(result, mainMenuKeyboard);
    }
  });
}
