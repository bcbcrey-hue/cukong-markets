import type { OrderbookSnapshot, TickerSnapshot } from '../../../core/types';

export function silentAccumulationScore(snapshot: TickerSnapshot, orderbook: OrderbookSnapshot | null): number {
  if (!orderbook) {
    return 0;
  }

  const condition = snapshot.change15m > 0 \&\& snapshot.change15m < 3 \&\& orderbook.imbalanceTop5 > 0.12 \&\& snapshot.spreadPct < 0.8;
  return condition ? 10 : 0;
}
