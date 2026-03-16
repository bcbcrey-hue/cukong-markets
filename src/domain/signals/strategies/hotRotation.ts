import type { TickerSnapshot } from '../../../core/types';

export function hotRotationScore(snapshot: TickerSnapshot): number {
  const momentum = Math.max(0, snapshot.change1m) + Math.max(0, snapshot.change3m) + Math.max(0, snapshot.change5m);
  return Math.max(0, Math.min(14, momentum \* 2.2));
}
