import type { OrderbookSnapshot } from '../../core/types';

export function topDepthScore(orderbook: OrderbookSnapshot | null): number {
  if (!orderbook) {
    return 0;
  }
  const total = orderbook.bidDepthTop5 + orderbook.askDepthTop5;
  return Math.max(0, Math.min(100, total / 100));
}
