import type { HealthSnapshot, RuntimePosition, SignalCandidate } from '../core/types';

function asPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export class ReportService {
  hotlistText(hotlist: SignalCandidate\[]): string {
    if (!hotlist.length) {
      return 'Hotlist kosong.';
    }

    return hotlist.slice(0, 10).map((item, index) => {
      const topStrategies = item.strategies
        .filter((strategy) => strategy.passed)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map((strategy) => strategy.name)
        .join(', ') || 'belum ada strategi dominan';

      return \[
        `${index + 1}. ${item.pair} | score=${item.score.toFixed(1)}`,
        `   chg1=${asPct(item.ticker.change1m)} chg5=${asPct(item.ticker.change5m)} spread=${asPct(item.ticker.spreadPct)}`,
        `   vol=${item.breakdown.volumeAnomaly.toFixed(1)} accel=${item.breakdown.priceAcceleration.toFixed(1)} ob=${item.breakdown.orderbookImbalance.toFixed(1)} burst=${item.breakdown.tradeBurst.toFixed(1)}`,
        `   strategi=${topStrategies}`,
        `   notes=${item.breakdown.notes.join('; ') || '-'}`,
      ].join('
');
    }).join('

');
  }

  marketWatchText(items: SignalCandidate\[]): string {
    if (!items.length) {
      return 'Market watch belum memiliki snapshot.';
    }

    return items.slice(0, 8).map((item, index) => (
      `${index + 1}. ${item.pair} | px=${item.ticker.lastPrice} | bid=${item.ticker.bestBid} | ask=${item.ticker.bestAsk} | score=${item.score.toFixed(1)}`
    )).join('
');
  }

  positionsText(positions: RuntimePosition\[]): string {
    const openPositions = positions.filter((item) => item.status === 'open');
    if (!openPositions.length) {
      return 'Belum ada posisi aktif.';
    }

    return openPositions.map((item, index) => \[
      `${index + 1}. ${item.pair} | qty=${item.remainingQuantity} | entry=${item.entryPrice} | mark=${item.lastMarkPrice}`,
      `   pnl\_real=${item.realizedPnl.toFixed(2)} pnl\_unreal=${item.unrealizedPnl.toFixed(2)} | score=${item.scoreAtEntry}`,
      `   tp=${item.takeProfitPct}% sl=${item.stopLossPct}% trail=${item.trailingStopPct}%`,
    ].join('
')).join('

');
  }

  signalBreakdownText(item: SignalCandidate): string {
    const b = item.breakdown;
    return \[
      `${item.pair} | score=${item.score.toFixed(1)}`,
      `price=${item.ticker.lastPrice} spread=${asPct(item.ticker.spreadPct)} liquidity=${item.ticker.liquidityScore.toFixed(1)}`,
      `+ volume=${b.volumeAnomaly.toFixed(1)} accel=${b.priceAcceleration.toFixed(1)} spread=${b.spreadTightening.toFixed(1)} ob=${b.orderbookImbalance.toFixed(1)} burst=${b.tradeBurst.toFixed(1)} breakout=${b.breakoutReadiness.toFixed(1)} persist=${b.momentumPersistence.toFixed(1)}`,
      `- slip=${b.slippagePenalty.toFixed(1)} liq=${b.liquidityPenalty.toFixed(1)} overext=${b.overextensionPenalty.toFixed(1)} spoof=${b.spoofPenalty.toFixed(1)}`,
      `notes: ${b.notes.join('; ') || '-'}`,
    ].join('
');
  }

  statusText(input: {
    health: HealthSnapshot;
    activeAccounts: number;
    topSignal?: SignalCandidate;
  }): string {
    return \[
      `Bot: ${input.health.started ? 'RUNNING' : 'STOPPED'}`,
      `Mode: ${input.health.mode}`,
      `Active Accounts: ${input.activeAccounts}`,
      `Open Positions: ${input.health.positionsOpen}`,
      `Pending Orders: ${input.health.pendingOrders}`,
      `Hotlist Count: ${input.health.hotlistCount}`,
      `Active Jobs: ${input.health.activeJobs}`,
      `Tick Count: ${input.health.tickCount}`,
      `Last Signal: ${input.topSignal ? `${input.topSignal.pair} (${input.topSignal.score.toFixed(1)})` : '-'}`,
      `Last Trade At: ${input.health.lastTradeAt ?? '-'}`,
      `Last Error: ${input.health.lastErrorMessage ?? '-'}`,
    ].join('
');
  }
}
