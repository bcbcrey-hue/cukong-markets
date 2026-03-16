import { Markup } from 'telegraf';
import type { HotlistEntry, PositionRecord, TradingMode } from '../../core/types';
import { buildCallback } from './callbackRouter';

export const TELEGRAM_MENU = {
  START: '▶️ Start Bot',
  STOP: '⏹️ Stop Bot',
  STATUS: '📊 Status',
  MARKET_WATCH: '👁️ Market Watch',
  HOTLIST: '🔥 Hotlist',
  POSITIONS: '📦 Positions',
  ORDERS: '🧾 Orders',
  MANUAL_BUY: '🟢 Manual Buy',
  MANUAL_SELL: '🔴 Manual Sell',
  STRATEGY: '⚙️ Strategy Settings',
  RISK: '🛡️ Risk Settings',
  ACCOUNTS: '👤 Accounts',
  LOGS: '📜 Logs',
  EMERGENCY: '🚨 Emergency Controls',
} as const;

export const mainMenuKeyboard = Markup.keyboard([
  [TELEGRAM_MENU.START, TELEGRAM_MENU.STOP, TELEGRAM_MENU.STATUS],
  [TELEGRAM_MENU.MARKET_WATCH, TELEGRAM_MENU.HOTLIST, TELEGRAM_MENU.POSITIONS],
  [TELEGRAM_MENU.ORDERS, TELEGRAM_MENU.MANUAL_BUY, TELEGRAM_MENU.MANUAL_SELL],
  [TELEGRAM_MENU.STRATEGY, TELEGRAM_MENU.RISK, TELEGRAM_MENU.ACCOUNTS],
  [TELEGRAM_MENU.LOGS, TELEGRAM_MENU.EMERGENCY],
]).resize();

export const emergencyKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback(
      'Pause Auto → ALERT_ONLY',
      buildCallback({ namespace: 'EMG', action: 'MODE', value: 'ALERT_ONLY' }),
    ),
  ],
  [
    Markup.button.callback(
      'Pause All → OFF',
      buildCallback({ namespace: 'EMG', action: 'MODE', value: 'OFF' }),
    ),
  ],
  [Markup.button.callback('Cancel All Orders', buildCallback({ namespace: 'EMG', action: 'CANCEL_ALL' }))],
  [Markup.button.callback('Sell All Positions', buildCallback({ namespace: 'EMG', action: 'SELL_ALL' }))],
]);

export const accountsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('List Accounts', buildCallback({ namespace: 'ACC', action: 'LIST' }))],
  [Markup.button.callback('Upload JSON', buildCallback({ namespace: 'ACC', action: 'UPLOAD' }))],
  [Markup.button.callback('Reload Accounts', buildCallback({ namespace: 'ACC', action: 'RELOAD' }))],
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

export function hotlistKeyboard(hotlist: HotlistEntry[]) {
  return Markup.inlineKeyboard(
    hotlist.slice(0, 8).map((item) => [
      Markup.button.callback(
        `${item.rank}. ${item.pair} (${item.score.toFixed(0)})`,
        buildCallback({ namespace: 'SIG', action: 'DETAIL', pair: item.pair }),
      ),
      Markup.button.callback(
        `Buy ${item.pair}`,
        buildCallback({ namespace: 'BUY', action: 'PICK', pair: item.pair }),
      ),
    ]),
  );
}

export function positionsKeyboard(positions: PositionRecord[]) {
  return Markup.inlineKeyboard(
    positions.slice(0, 10).flatMap((item) => [
      [
        Markup.button.callback(
          `${item.pair} qty=${item.quantity.toFixed(8)}`,
          buildCallback({ namespace: 'POS', action: 'DETAIL', value: item.id }),
        ),
      ],
      [
        Markup.button.callback(
          'Sell 25%',
          buildCallback({ namespace: 'POS', action: 'SELL25', value: item.id }),
        ),
        Markup.button.callback(
          'Sell 50%',
          buildCallback({ namespace: 'POS', action: 'SELL50', value: item.id }),
        ),
      ],
      [
        Markup.button.callback(
          'Sell 75%',
          buildCallback({ namespace: 'POS', action: 'SELL75', value: item.id }),
        ),
        Markup.button.callback(
          'Sell 100%',
          buildCallback({ namespace: 'POS', action: 'SELL100', value: item.id }),
        ),
      ],
    ]),
  );
}
