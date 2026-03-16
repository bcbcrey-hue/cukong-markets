import type { TickerSnapshot } from '../../core/types';

export interface TickerWindowSummary {
  latest: TickerSnapshot;
  averagePrice: number;
  highPrice: number;
  lowPrice: number;
  averageVolume: number;
}

export function summarizeTickerWindow(items: TickerSnapshot\[]): TickerWindowSummary | null {
  if (!items.length) {
    return null;
  }

  const latest = items\[items.length - 1];
  const averagePrice = items.reduce((sum, item) => sum + item.lastPrice, 0) / items.length;
  const highPrice = Math.max(...items.map((item) => item.lastPrice));
  const lowPrice = Math.min(...items.map((item) => item.lastPrice));
  const averageVolume = items.reduce((sum, item) => sum + item.volume1m, 0) / items.length;

  return { latest, averagePrice, highPrice, lowPrice, averageVolume };
}
