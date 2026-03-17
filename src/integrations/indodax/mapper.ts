import type { OrderbookSnapshot, PairTickerSnapshot } from '../../core/types';
import { clamp, pct } from '../../utils/math';

export function buildPairTickerSnapshot(
  pair: string,
  input: {
    lastPrice: number;
    bestBid: number;
    bestAsk: number;
    high24h: number;
    low24h: number;
    volume24hBase: number;
    volume24hQuote: number;
    timestamp: number;
  },
  _history: PairTickerSnapshot[] = [],
  orderbook?: OrderbookSnapshot | null,
): PairTickerSnapshot {
  const spreadPct =
    input.bestAsk > 0 ? ((input.bestAsk - input.bestBid) / input.bestAsk) * 100 : 0;

  const change24hPct =
    input.low24h > 0 ? pct(input.low24h, input.lastPrice) : 0;

  const liquidityHint = clamp(
    (orderbook ? orderbook.bids.slice(0, 5).reduce((sum, level) => sum + level.volume, 0) : 0) +
      (orderbook ? orderbook.asks.slice(0, 5).reduce((sum, level) => sum + level.volume, 0) : 0),
    0,
    Number.MAX_SAFE_INTEGER,
  );

  return {
    pair,
    lastPrice: input.lastPrice,
    bid: input.bestBid,
    ask: input.bestAsk,
    high24h: input.high24h,
    low24h: input.low24h,
    volume24hBase: input.volume24hBase,
    volume24hQuote: Math.max(input.volume24hQuote, liquidityHint),
    change24hPct,
    timestamp: input.timestamp,
  };
}
