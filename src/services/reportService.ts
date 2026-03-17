import type {
  HealthSnapshot,
  HotlistEntry,
  OpportunityAssessment,
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

  marketWatchText(hotlist: Array<HotlistEntry | SignalCandidate>): string {
    if (!hotlist.length) {
      return '👁️ Market watch belum berisi pair aktif.';
    }

    const lines = hotlist.slice(0, 8).map((item, index) => {
      return [
        `${index + 1}. ${item.pair}`,
        `price=${asNum(item.marketPrice, 8)}`,
        `spread=${asPct(item.spreadPct)}`,
        `liq=${asNum(item.liquidityScore, 1)}`,
        `chg1m=${asPct(item.change1m)}`,
        `chg5m=${asPct(item.change5m)}`,
      ].join(' | ');
    });

    return ['👁️ MARKET WATCH', ...lines].join('\n');
  }

  signalBreakdownText(
    signal: HotlistEntry | SignalCandidate | OpportunityAssessment,
  ): string {
    if ('finalScore' in signal) {
      return [
        `Pair: ${signal.pair}`,
        `Final score: ${asNum(signal.finalScore, 2)}`,
        `Pump probability: ${(signal.pumpProbability * 100).toFixed(1)}%`,
        `Trap probability: ${(signal.trapProbability * 100).toFixed(1)}%`,
        `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
        `Timing: ${signal.entryTiming.state} (${signal.entryTiming.reason})`,
        `Action: ${signal.recommendedAction}`,
        `Reasons: ${truncate(signal.reasons.join('; '), 240)}`,
        `Warnings: ${truncate(signal.warnings.join('; ') || '-', 220)}`,
        `History: ${truncate(signal.historicalMatchSummary, 180)}`,
      ].join('\n');
    }

    return [
      `Pair: ${signal.pair}`,
      `Score: ${asNum(signal.score, 2)}`,
      `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
      `Regime: ${signal.regime}`,
      `Price: ${asNum(signal.marketPrice, 8)}`,
      `Spread: ${asPct(signal.spreadPct)}`,
      `Reasons: ${truncate(signal.reasons.join('; '), 240)}`,
      `Warnings: ${truncate(signal.warnings.join('; ') || '-', 220)}`,
    ].join('\n');
  }

  statusText(params: {
    health: HealthSnapshot;
    activeAccounts: number;
    topSignal?: HotlistEntry | SignalCandidate;
    topOpportunity?: OpportunityAssessment;
  }): string {
    const lines = [
      '🤖 BOT STATUS',
      `status=${params.health.status}`,
      `runtime=${params.health.runtimeStatus}`,
      `scanner=${params.health.scannerRunning ? 'on' : 'off'}`,
      `telegram=${params.health.telegramRunning ? 'on' : 'off'}`,
      `trading=${params.health.tradingEnabled ? 'on' : 'off'}`,
      `accounts=${params.activeAccounts}`,
      `pairs=${params.health.activePairsTracked}`,
    ];

    if (params.topOpportunity) {
      lines.push(
        `topOpportunity=${params.topOpportunity.pair} score=${asNum(params.topOpportunity.finalScore, 1)} pump=${(params.topOpportunity.pumpProbability * 100).toFixed(1)}% action=${params.topOpportunity.recommendedAction}`,
      );
    } else if (params.topSignal) {
      lines.push(
        `topSignal=${params.topSignal.pair} score=${asNum(params.topSignal.score, 1)} confidence=${(params.topSignal.confidence * 100).toFixed(1)}%`,
      );
    }

    lines.push(`notes=${truncate((params.health.notes ?? []).join('; ') || '-', 220)}`);
    lines.push(`updated=${params.health.updatedAt}`);

    return lines.join('\n');
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
    return this.statusText({
      health,
      activeAccounts: 0,
    });
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
