import type {
  HealthSnapshot,
  HotlistEntry,
  PositionRecord,
  SignalCandidate,
  TradeRecord,
} from '../core/types';

function asPct(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

function asNum(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

function asMoney(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00';
}

function truncate(text: string, max = 220): string {
  if (!text) {
    return '-';
  }

  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export class ReportService {
  hotlistText(hotlist: HotlistEntry[] | SignalCandidate[]): string {
    if (!hotlist.length) {
      return '🔥 Hotlist kosong.';
    }

    const lines = hotlist.slice(0, 10).map((item, index) => {
      const signal = item as SignalCandidate;

      const dominantStrategies =
        Array.isArray(signal.strategies) && signal.strategies.length > 0
          ? signal.strategies
              .filter((strategy) => strategy.passed)
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 3)
              .map((strategy) => strategy.name)
              .join(', ')
          : '-';

      const notes =
        'breakdown' in signal && Array.isArray(signal.breakdown?.notes)
          ? signal.breakdown.notes.join('; ')
          : '-';

      const ticker = signal.ticker;
      const breakdown = signal.breakdown;

      return [
        `${index + 1}. ${signal.pair} | score=${signal.score.toFixed(1)}`,
        ticker
          ? `px=${asNum(ticker.lastPrice, 8)} bid=${asNum(ticker.bestBid, 8)} ask=${asNum(ticker.bestAsk, 8)} spread=${asPct(ticker.spreadPct)}`
          : null,
        breakdown
          ? `vol=${breakdown.volumeAnomaly.toFixed(1)} accel=${breakdown.priceAcceleration.toFixed(1)} ob=${breakdown.orderbookImbalance.toFixed(1)} burst=${breakdown.tradeBurst.toFixed(1)}`
          : null,
        `strategi=${dominantStrategies}`,
        `notes=${truncate(notes, 180)}`,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return ['🔥 HOTLIST', ...lines].join('\n\n');
  }

  marketWatchText(items: SignalCandidate[]): string {
    if (!items.length) {
      return '📡 Market watch belum memiliki snapshot.';
    }

    const lines = items.slice(0, 8).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `score=${item.score.toFixed(1)}`,
        `last=${asNum(item.ticker.lastPrice, 8)}`,
        `bid=${asNum(item.ticker.bestBid, 8)}`,
        `ask=${asNum(item.ticker.bestAsk, 8)}`,
        `chg1=${asPct(item.ticker.change1m)}`,
        `chg5=${asPct(item.ticker.change5m)}`,
      ].join(' | '),
    );

    return ['📡 MARKET WATCH', ...lines].join('\n');
  }

  positionsText(positions: PositionRecord[]): string {
    const openPositions = positions.filter((item) => item.status === 'open');

    if (!openPositions.length) {
      return '📦 Belum ada posisi aktif.';
    }

    const lines = openPositions.map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `qty=${asNum(item.quantity ?? item.remainingQuantity ?? 0, 8)}`,
        `entry=${asNum(item.entryPrice, 8)}`,
        `mark=${asNum(item.lastMarkPrice ?? 0, 8)}`,
        `real=${asMoney(item.realizedPnl ?? 0)}`,
        `unreal=${asMoney(item.unrealizedPnl ?? 0)}`,
      ].join(' | '),
    );

    return ['📦 POSITIONS', ...lines].join('\n');
  }

  ordersText(orders: Array<{ id: string; pair: string; side: string; status: string; price?: number; quantity?: number }>): string {
    if (!orders.length) {
      return '🧾 Tidak ada order aktif.';
    }

    const lines = orders.slice(0, 15).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `${item.side.toUpperCase()} ${item.status.toUpperCase()}`,
        `price=${asNum(item.price ?? 0, 8)}`,
        `qty=${asNum(item.quantity ?? 0, 8)}`,
        `id=${item.id}`,
      ].join(' | '),
    );

    return ['🧾 ORDERS', ...lines].join('\n');
  }

  recentTradesText(trades: TradeRecord[]): string {
    if (!trades.length) {
      return '📝 Belum ada trade tercatat.';
    }

    const lines = trades.slice(-10).reverse().map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `${item.side.toUpperCase()}`,
        `qty=${asNum(item.quantity, 8)}`,
        `price=${asNum(item.price, 8)}`,
        `pnl=${asMoney(item.realizedPnl ?? 0)}`,
        `at=${item.executedAt ?? item.createdAt ?? '-'}`,
      ].join(' | '),
    );

    return ['📝 RECENT TRADES', ...lines].join('\n');
  }

  signalBreakdownText(item: SignalCandidate): string {
    const b = item.breakdown;

    const topStrategies =
      item.strategies
        ?.filter((strategy) => strategy.passed)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map((strategy) => `${strategy.name}(${strategy.weight.toFixed(1)})`)
        .join(', ') || '-';

    return [
      `🎯 SIGNAL DETAIL`,
      `pair=${item.pair} | score=${item.score.toFixed(1)}`,
      `last=${asNum(item.ticker.lastPrice, 8)} | bid=${asNum(item.ticker.bestBid, 8)} | ask=${asNum(item.ticker.bestAsk, 8)}`,
      `spread=${asPct(item.ticker.spreadPct)} | liq=${item.ticker.liquidityScore.toFixed(1)} | chg1=${asPct(item.ticker.change1m)} | chg5=${asPct(item.ticker.change5m)}`,
      `+ volume=${b.volumeAnomaly.toFixed(1)} accel=${b.priceAcceleration.toFixed(1)} spreadTight=${b.spreadTightening.toFixed(1)} ob=${b.orderbookImbalance.toFixed(1)} burst=${b.tradeBurst.toFixed(1)} breakout=${b.breakoutReadiness.toFixed(1)} persist=${b.momentumPersistence.toFixed(1)}`,
      `- slippage=${b.slippagePenalty.toFixed(1)} liq=${b.liquidityPenalty.toFixed(1)} overext=${b.overextensionPenalty.toFixed(1)} spoof=${b.spoofPenalty.toFixed(1)}`,
      `strategi=${topStrategies}`,
      `notes=${truncate(b.notes.join('; ') || '-', 500)}`,
    ].join('\n');
  }

  accountsText(
    accounts: Array<{
      id: string;
      name: string;
      enabled: boolean;
      isDefault: boolean;
      updatedAt?: string;
    }>,
    meta?: {
      defaultAccountId?: string | null;
      lastUpdatedAt?: string | null;
      totalAccounts?: number;
      source?: string;
    },
  ): string {
    if (!accounts.length) {
      return '👤 Belum ada account tersimpan. Gunakan menu Accounts → Upload JSON.';
    }

    const lines = accounts.map((item, index) =>
      [
        `${index + 1}. ${item.name}`,
        item.enabled ? 'enabled' : 'disabled',
        item.isDefault ? 'default' : 'secondary',
        `id=${item.id}`,
      ].join(' | '),
    );

    const header = [
      '👤 ACCOUNTS',
      `total=${meta?.totalAccounts ?? accounts.length}`,
      `source=${meta?.source ?? '-'}`,
      `updated=${meta?.lastUpdatedAt ?? '-'}`,
    ].join(' | ');

    return [header, ...lines].join('\n');
  }

  statusText(input: {
    health: HealthSnapshot;
    activeAccounts: number;
    topSignal?: SignalCandidate;
  }): string {
    return [
      '🤖 BOT STATUS',
      `state=${input.health.started ? 'RUNNING' : 'STOPPED'}`,
      `mode=${input.health.mode}`,
      `activeAccounts=${input.activeAccounts}`,
      `positionsOpen=${input.health.positionsOpen}`,
      `pendingOrders=${input.health.pendingOrders}`,
      `hotlistCount=${input.health.hotlistCount}`,
      `activeJobs=${input.health.activeJobs}`,
      `tickCount=${input.health.tickCount}`,
      `topSignal=${input.topSignal ? `${input.topSignal.pair} (${input.topSignal.score.toFixed(1)})` : '-'}`,
      `lastTradeAt=${input.health.lastTradeAt ?? '-'}`,
      `lastError=${truncate(input.health.lastErrorMessage ?? '-', 240)}`,
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
