import { Markup } from 'telegraf';
import type {
  BotSettings,
  ExecutionMode,
  HotlistEntry,
  PositionRecord,
  StoredAccount,
  TradingMode,
} from '../../core/types';
import { buildCallback } from './callbackRouter';

export type TelegramMenuId =
  | 'ROOT'
  | 'EXEC'
  | 'EMG'
  | 'MON'
  | 'TRADE'
  | 'SET'
  | 'SET_STRAT'
  | 'SET_RISK'
  | 'ACC'
  | 'ACC_PANEL'
  | 'BKT'
  | 'BKT_PANEL'
  | 'STATUS'
  | 'MW'
  | 'HOT'
  | 'INTEL'
  | 'SPOOF'
  | 'PAT'
  | 'LOGS'
  | 'POS_LIST'
  | 'ORD_LIST'
  | 'BUY_MENU'
  | 'SELL_MENU'
  | 'SHADOW';

const telegramMenuIds: TelegramMenuId[] = [
  'ROOT',
  'EXEC',
  'EMG',
  'MON',
  'TRADE',
  'SET',
  'SET_STRAT',
  'SET_RISK',
  'ACC',
  'ACC_PANEL',
  'BKT',
  'BKT_PANEL',
  'STATUS',
  'MW',
  'HOT',
  'INTEL',
  'SPOOF',
  'PAT',
  'LOGS',
  'POS_LIST',
  'ORD_LIST',
  'BUY_MENU',
  'SELL_MENU',
  'SHADOW',
];

export function isTelegramMenuId(value?: string): value is TelegramMenuId {
  return Boolean(value) && telegramMenuIds.includes(value as TelegramMenuId);
}

export const TELEGRAM_MAIN_MENU = {
  EXECUTE: '⚡ Execute Trade',
  EMERGENCY: '🚨 Emergency Controls',
  MONITORING: '📡 Monitoring',
  TRADE: '📦 Positions',
  SETTINGS: '⚙️ Settings',
  ACCOUNTS: '👤 Accounts',
  BACKTEST: '🧪 Backtest',
  SHADOW: '🌘 Shadow Run',
} as const;

export const TELEGRAM_ACTION = {
  BACK: '↩️ Kembali',
  START: '▶️ Start Bot',
  STOP: '⏹️ Stop Bot',
  STATUS: '📊 Status',
  MARKET_WATCH: '👁️ Market Watch',
  HOTLIST: '🔥 Hotlist',
  INTELLIGENCE: '🧠 Intelligence Report',
  SPOOF: '🕳️ Spoof Radar',
  PATTERN: '🧬 Pattern Match',
  LOGS: '📜 Logs',
  POSITIONS: '📦 Positions',
  ORDERS: '🧾 Orders',
  MANUAL_BUY: '🟢 Manual Buy',
  MANUAL_SELL: '🔴 Manual Sell',
  BUY_SLIPPAGE: '🎯 Buy Slippage',
  EXECUTION_SIMULATED: '🧪 Execution Simulated',
  EXECUTION_LIVE: '💸 Execution Live',
  STRATEGY: '⚙️ Strategy Settings',
  RISK: '🛡️ Risk Settings',
  ACCOUNTS: '👤 Accounts',
  LIST_ACCOUNTS: '📋 List Accounts',
  ADD_MANUAL: '➕ Add Manual',
  DELETE_MANUAL: '🗑️ Delete Manual',
  UPLOAD_JSON: '📤 Upload JSON',
  RELOAD_ACCOUNTS: '♻️ Reload Accounts',
  BACKTEST: '🧪 Backtest',
  RUN_TOP: '🏁 Run Top Pair',
  RUN_ALL: '🧪 Run All Recent',
  LAST_RESULT: '🧾 Last Result',
  PAUSE_AUTO: '⏸️ Pause Auto → ALERT_ONLY',
  PAUSE_ALL: '🛑 Pause All → OFF',
  CANCEL_ALL: '🧹 Cancel All Orders',
  SELL_ALL: '💥 Sell All Positions',
  SHADOW_CATEGORY: '🌘 Shadow Run',
  SHADOW_RUN: '▶️ Jalankan Shadow',
  SHADOW_STATUS: '📌 Status Shadow',
} as const;

function openMenuCallback(menuId: TelegramMenuId): string {
  return buildCallback({ namespace: 'NAV', action: 'OPEN', value: menuId });
}

function backMenuCallback(menuId: TelegramMenuId): string {
  return buildCallback({ namespace: 'NAV', action: 'BACK', value: menuId });
}

function backButton(menuId: TelegramMenuId) {
  return Markup.button.callback(TELEGRAM_ACTION.BACK, backMenuCallback(menuId));
}

function bindPositionValue(backMenu: TelegramMenuId, positionId: string): string {
  return `${backMenu}:${positionId}`;
}


function canBuyFromHotlist(item: HotlistEntry): boolean {
  return item.edgeValid && ['ENTER', 'CONFIRM_ENTRY'].includes(item.recommendedAction);
}

function hotlistStatusLabel(item: HotlistEntry): 'WATCH' | 'CAUTION' | 'BLOCKED' {
  if (!item.edgeValid || item.recommendedAction === 'AVOID') {
    return 'BLOCKED';
  }

  if (item.recommendedAction === 'WATCH') {
    return 'WATCH';
  }

  return 'CAUTION';
}

export function resolveHotlistGate(item: HotlistEntry): {
  canBuy: boolean;
  label: 'WATCH' | 'CAUTION' | 'BLOCKED';
} {
  return {
    canBuy: canBuyFromHotlist(item),
    label: hotlistStatusLabel(item),
  };
}

export const mainMenuKeyboard = Markup.keyboard([
  [TELEGRAM_MAIN_MENU.EXECUTE, TELEGRAM_MAIN_MENU.EMERGENCY],
  [TELEGRAM_MAIN_MENU.MONITORING, TELEGRAM_MAIN_MENU.TRADE],
  [TELEGRAM_MAIN_MENU.SETTINGS, TELEGRAM_MAIN_MENU.ACCOUNTS],
  [TELEGRAM_MAIN_MENU.BACKTEST, TELEGRAM_MAIN_MENU.SHADOW],
]).resize();

export const executeTradeKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.START, buildCallback({ namespace: 'RUN', action: 'START' }))],
  [Markup.button.callback(TELEGRAM_ACTION.STOP, buildCallback({ namespace: 'RUN', action: 'STOP' }))],
  [Markup.button.callback(TELEGRAM_ACTION.STATUS, buildCallback({ namespace: 'RUN', action: 'STATUS' }))],
  [backButton('ROOT')],
]);

export const emergencyKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.PAUSE_AUTO, buildCallback({ namespace: 'EMG', action: 'MODE', value: 'ALERT_ONLY' }))],
  [Markup.button.callback(TELEGRAM_ACTION.PAUSE_ALL, buildCallback({ namespace: 'EMG', action: 'MODE', value: 'OFF' }))],
  [Markup.button.callback(TELEGRAM_ACTION.CANCEL_ALL, buildCallback({ namespace: 'EMG', action: 'CANCEL_ALL' }))],
  [Markup.button.callback(TELEGRAM_ACTION.SELL_ALL, buildCallback({ namespace: 'EMG', action: 'SELL_ALL' }))],
  [backButton('ROOT')],
]);

export const monitoringKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.MARKET_WATCH, openMenuCallback('MW'))],
  [Markup.button.callback(TELEGRAM_ACTION.HOTLIST, openMenuCallback('HOT'))],
  [Markup.button.callback(TELEGRAM_ACTION.INTELLIGENCE, openMenuCallback('INTEL'))],
  [Markup.button.callback(TELEGRAM_ACTION.SPOOF, openMenuCallback('SPOOF'))],
  [Markup.button.callback(TELEGRAM_ACTION.PATTERN, openMenuCallback('PAT'))],
  [Markup.button.callback(TELEGRAM_ACTION.LOGS, openMenuCallback('LOGS'))],
  [backButton('ROOT')],
]);

export function positionsMenuKeyboard(settings: BotSettings) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(TELEGRAM_ACTION.POSITIONS, openMenuCallback('POS_LIST'))],
    [Markup.button.callback(TELEGRAM_ACTION.ORDERS, openMenuCallback('ORD_LIST'))],
    [Markup.button.callback(TELEGRAM_ACTION.MANUAL_BUY, openMenuCallback('BUY_MENU'))],
    [Markup.button.callback(TELEGRAM_ACTION.MANUAL_SELL, openMenuCallback('SELL_MENU'))],
    [Markup.button.callback(`${TELEGRAM_ACTION.BUY_SLIPPAGE} ${settings.strategy.buySlippageBps} bps`, buildCallback({ namespace: 'SET', action: 'BUY_SLIPPAGE' }))],
    [backButton('ROOT')],
  ]);
}

export const settingsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.STRATEGY, openMenuCallback('SET_STRAT'))],
  [Markup.button.callback(TELEGRAM_ACTION.RISK, openMenuCallback('SET_RISK'))],
  [backButton('ROOT')],
]);

export function tradingModeKeyboard(current: TradingMode) {
  const modes: TradingMode[] = ['OFF', 'ALERT_ONLY', 'SEMI_AUTO', 'FULL_AUTO'];

  return Markup.inlineKeyboard(
    modes.map((mode) => [
      Markup.button.callback(
        `${current === mode ? '✅ ' : ''}${mode}`,
        buildCallback({ namespace: 'SET', action: 'MODE', value: mode }),
      ),
    ]),
  );
}

export function strategySettingsKeyboard(settings: BotSettings) {
  const modes: TradingMode[] = ['OFF', 'ALERT_ONLY', 'SEMI_AUTO', 'FULL_AUTO'];
  const executionMode: ExecutionMode =
    settings.uiOnly || settings.dryRun || settings.paperTrade ? 'SIMULATED' : 'LIVE';

  return Markup.inlineKeyboard([
    ...modes.map((mode) => [
      Markup.button.callback(
        `${settings.tradingMode === mode ? '✅ ' : ''}${mode}`,
        buildCallback({ namespace: 'SET', action: 'MODE', value: mode }),
      ),
    ]),
    [
      Markup.button.callback(
        `${executionMode === 'SIMULATED' ? '✅ ' : ''}${TELEGRAM_ACTION.EXECUTION_SIMULATED}`,
        buildCallback({ namespace: 'SET', action: 'EXECUTION_MODE', value: 'SIMULATED' }),
      ),
    ],
    [
      Markup.button.callback(
        `${executionMode === 'LIVE' ? '✅ ' : ''}${TELEGRAM_ACTION.EXECUTION_LIVE}`,
        buildCallback({ namespace: 'SET', action: 'EXECUTION_MODE', value: 'LIVE' }),
      ),
    ],
    [backButton('SET')],
  ]);
}

export function riskSettingsKeyboard(settings: BotSettings) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`Take Profit ${settings.risk.takeProfitPct}%`, buildCallback({ namespace: 'SET', action: 'TAKE_PROFIT' }))],
    [backButton('SET')],
  ]);
}

export const accountsCategoryKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.ACCOUNTS, openMenuCallback('ACC_PANEL'))],
  [backButton('ROOT')],
]);

export const accountsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.LIST_ACCOUNTS, buildCallback({ namespace: 'ACC', action: 'LIST' }))],
  [Markup.button.callback(TELEGRAM_ACTION.ADD_MANUAL, buildCallback({ namespace: 'ACC', action: 'ADD_MANUAL' }))],
  [Markup.button.callback(TELEGRAM_ACTION.DELETE_MANUAL, buildCallback({ namespace: 'ACC', action: 'DELETE_MANUAL' }))],
  [Markup.button.callback(TELEGRAM_ACTION.UPLOAD_JSON, buildCallback({ namespace: 'ACC', action: 'UPLOAD' }))],
  [Markup.button.callback(TELEGRAM_ACTION.RELOAD_ACCOUNTS, buildCallback({ namespace: 'ACC', action: 'RELOAD' }))],
  [backButton('ACC')],
]);

export function accountsDeleteKeyboard(accounts: StoredAccount[]) {
  return Markup.inlineKeyboard([
    ...accounts.slice(0, 10).map((account) => [
      Markup.button.callback(
        `Hapus ${account.name}`,
        buildCallback({ namespace: 'ACC', action: 'DEL_PICK', value: account.id }),
      ),
    ]),
    [backButton('ACC_PANEL')],
  ]);
}

export const backtestCategoryKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.BACKTEST, openMenuCallback('BKT_PANEL'))],
  [backButton('ROOT')],
]);

export function hotlistKeyboard(
  hotlist: HotlistEntry[],
  backMenu: TelegramMenuId = 'MON',
) {
  return Markup.inlineKeyboard([
    ...hotlist.slice(0, 8).map((item) => {
      const gate = resolveHotlistGate(item);
      const detailButton = Markup.button.callback(
        `${item.rank}. ${item.pair} (${item.score.toFixed(0)})`,
        buildCallback({ namespace: 'SIG', action: 'DETAIL', value: backMenu, pair: item.pair }),
      );

      const actionButton = gate.canBuy
        ? Markup.button.callback(
            `Buy ${item.pair}`,
            buildCallback({ namespace: 'BUY', action: 'PICK', value: backMenu, pair: item.pair }),
          )
        : Markup.button.callback(
            `Status ${gate.label}`,
            buildCallback({ namespace: 'SIG', action: 'DETAIL', value: backMenu, pair: item.pair }),
          );

      return [detailButton, actionButton];
    }),
    [backButton(backMenu)],
  ]);
}

export function positionsKeyboard(
  positions: PositionRecord[],
  backMenu: TelegramMenuId = 'TRADE',
) {
  return Markup.inlineKeyboard([
    ...positions.slice(0, 10).flatMap((item) => [
      [
        Markup.button.callback(
          `${item.pair} qty=${item.quantity.toFixed(8)}`,
          buildCallback({ namespace: 'POS', action: 'DETAIL', value: bindPositionValue(backMenu, item.id) }),
        ),
      ],
      [
        Markup.button.callback(
          'Sell 25%',
          buildCallback({ namespace: 'POS', action: 'SELL25', value: bindPositionValue(backMenu, item.id) }),
        ),
        Markup.button.callback(
          'Sell 50%',
          buildCallback({ namespace: 'POS', action: 'SELL50', value: bindPositionValue(backMenu, item.id) }),
        ),
      ],
      [
        Markup.button.callback(
          'Sell 75%',
          buildCallback({ namespace: 'POS', action: 'SELL75', value: bindPositionValue(backMenu, item.id) }),
        ),
        Markup.button.callback(
          'Sell 100%',
          buildCallback({ namespace: 'POS', action: 'SELL100', value: bindPositionValue(backMenu, item.id) }),
        ),
      ],
    ]),
    [backButton(backMenu)],
  ]);
}

export function backtestKeyboard(currentPair?: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(currentPair ? `${TELEGRAM_ACTION.RUN_TOP} (${currentPair})` : TELEGRAM_ACTION.RUN_TOP, buildCallback({ namespace: 'BKT', action: 'RUN_TOP', pair: currentPair }))],
    [Markup.button.callback(TELEGRAM_ACTION.RUN_ALL, buildCallback({ namespace: 'BKT', action: 'RUN_ALL' }))],
    [Markup.button.callback(TELEGRAM_ACTION.LAST_RESULT, buildCallback({ namespace: 'BKT', action: 'LAST' }))],
    [backButton('BKT')],
  ]);
}

export const shadowRunKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(TELEGRAM_ACTION.SHADOW_RUN, buildCallback({ namespace: 'RUN', action: 'SHADOW_START' }))],
  [Markup.button.callback(TELEGRAM_ACTION.SHADOW_STATUS, buildCallback({ namespace: 'RUN', action: 'SHADOW_STATUS' }))],
  [backButton('ROOT')],
]);
