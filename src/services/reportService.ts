import type {
  HealthSnapshot,
  HotlistEntry,
  OrderRecord,
  PositionRecord,
  SignalCandidate,
  StoredAccount,
  TradeRecord,
} from '../core/types';

function asNum(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

function asPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function truncate(text: string, max = 180): string {
  if (!text) {
    return '-';
  }

  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export class ReportService {
  hotlistText(hotlist: Array<HotlistEntry | SignalCandidate>): string {
    if (!hotlist.length) {
      return '🔥 Hotlist kosong.';
    }

    const lines = hotlist.slice(0, 10).map((item, index) => {
      const reasons = Array.isArray(item.reasons) && item.reasons.length
        ? item.reasons.join('; ')
        : 'belum ada alasan';

      const warnings = Array.isArray(item.warnings) && item.warnings.length
        ? ` | warnings=${truncate(item.warnings.join('; '), 100)}`
        : '';

      return [
        `${index + 1}. ${item.pair}`,
        `score=${asNum(item.score, 1)}`,
        `confidence=${asNum(item.confidence, 2)}`,
        `regime=${item.regime}`,
        `spread=${asPct(item.spreadPct)}`,
        `reasons=${truncate(reasons, 120)}${warnings}`,
      ].join(' | ');
    });

    return ['🔥 HOTLIST', ...lines].join('\n');
  }

  positionsText(positions: PositionRecord[]): string {
    if (!positions.length) {
      return '📦 Belum ada posisi.';
    }

    const lines = positions.map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `status=${item.status}`,
        `qty=${asNum(item.quantity, 8)}`,
        `entry=${asNum(item.entryPrice, 8)}`,
        `mark=${asNum(item.currentPrice, 8)}`,
        `unreal=${asNum(item.unrealizedPnl, 2)}`,
        `real=${asNum(item.realizedPnl, 2)}`,
      ].join(' | '),
    );

    return ['📦 POSITIONS', ...lines].join('\n');
  }

  ordersText(orders: OrderRecord[]): string {
    if (!orders.length) {
      return '🧾 Tidak ada order.';
    }

    const lines = orders.slice(0, 15).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `${item.side.toUpperCase()} ${item.status}`,
        `qty=${asNum(item.quantity, 8)}`,
        `price=${asNum(item.price, 8)}`,
        `filled=${asNum(item.filledQuantity, 8)}`,
      ].join(' | '),
    );

    return ['🧾 ORDERS', ...lines].join('\n');
  }

  tradesText(trades: TradeRecord[]): string {
    if (!trades.length) {
      return '📝 Belum ada trade.';
    }

    const lines = trades.slice(-10).reverse().map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        item.side.toUpperCase(),
        `qty=${asNum(item.quantity, 8)}`,
        `price=${asNum(item.price, 8)}`,
        `pnl=${asNum(item.realizedPnl, 2)}`,
        `at=${item.executedAt}`,
      ].join(' | '),
    );

    return ['📝 RECENT TRADES', ...lines].join('\n');
  }

  accountsText(accounts: StoredAccount[]): string {
    if (!accounts.length) {
      return '👤 Belum ada account tersimpan.';
    }

    const lines = accounts.map((item, index) =>
      [
        `${index + 1}. ${item.name}`,
        item.enabled ? 'enabled' : 'disabled',
        item.isDefault ? 'default' : 'secondary',
        `id=${item.id}`,
      ].join(' | '),
    );

    return ['👤 ACCOUNTS', ...lines].join('\n');
  }

  healthText(health: HealthSnapshot): string {
    return [
      '🤖 BOT STATUS',
      `status=${health.status}`,
      `runtime=${health.runtimeStatus}`,
      `scanner=${health.scannerRunning ? 'on' : 'off'}`,
      `telegram=${health.telegramRunning ? 'on' : 'off'}`,
      `trading=${health.tradingEnabled ? 'on' : 'off'}`,
      `pairs=${health.activePairsTracked}`,
      `notes=${truncate((health.notes ?? []).join('; ') || '-', 220)}`,
      `updated=${health.updatedAt}`,
    ].join('\n');
  }

  simpleOk(message: string): string {
    return `✅ ${message}`;
  }

  simpleWarn(message: string): string {
    return `⚠️ ${message}`;
  }

  simpleError(message: string): string {
    return `❌ ${message}`;
  }
}
