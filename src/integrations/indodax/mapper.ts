import type { OrderbookSnapshot, TickerSnapshot } from '../../core/types';

export function buildTickerFromHistory(
  pair: string,
  input: {
    lastPrice: number;
    bestBid: number;
    bestAsk: number;
    volume24h: number;
    capturedAt: string;
  },
  history: TickerSnapshot\[],
  orderbook?: OrderbookSnapshot | null,
): TickerSnapshot {
  const previous = history\[history.length - 1];
  const pick = (steps: number): TickerSnapshot | undefined => history\[Math.max(0, history.length - steps)];
  const pct = (past?: TickerSnapshot): number => {
    if (!past || past.lastPrice <= 0) return 0;
    return ((input.lastPrice - past.lastPrice) / past.lastPrice) \* 100;
  };

  const spreadPct = input.bestAsk > 0 ? ((input.bestAsk - input.bestBid) / input.bestAsk) \* 100 : 0;
  const velocity1m = previous ? Math.abs(input.lastPrice - previous.lastPrice) : 0;
  const velocity5m = Math.abs(pct(pick(5)));
  const baseVolume = Math.max(0, input.volume24h);
  const topDepth = (orderbook?.bidDepthTop5 ?? 0) + (orderbook?.askDepthTop5 ?? 0);
  const imbalance = Math.abs(orderbook?.imbalanceTop5 ?? 0);

  return {
    pair,
    lastPrice: input.lastPrice,
    bestBid: input.bestBid,
    bestAsk: input.bestAsk,
    spreadPct,
    baseVolume24h: baseVolume,
    quoteVolume24h: baseVolume,
    priceChange24hPct: 0,
    change1m: pct(pick(1)),
    change3m: pct(pick(3)),
    change5m: pct(pick(5)),
    change15m: pct(pick(15)),
    velocity1m,
    velocity5m,
    volume1m: baseVolume / 1440,
    volume3m: baseVolume / 480,
    volume5m: baseVolume / 288,
    volume15m: baseVolume / 96,
    tradeBurstScore: Math.max(0, Math.min(100, Math.abs(pct(pick(1))) \* 18 + Math.abs(pct(pick(3))) \* 10)),
    breakoutDistancePct: Math.max(0, Math.min(100, 100 - Math.abs(pct(pick(15))) \* 10)),
    liquidityScore: Math.max(0, Math.min(100, topDepth / 100 + baseVolume / 1\_000\_000 + (1 - imbalance) \* 15)),
    capturedAt: input.capturedAt,
  };
}
