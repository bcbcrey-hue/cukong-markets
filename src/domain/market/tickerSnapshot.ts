import type { PairTickerSnapshot } from '../../core/types';
import { clamp, pct } from '../../utils/math';

interface TickerPoint {
  price: number;
  cumulativeVolume24hQuote: number;
  capturedAt: number;
}

export interface TickerFeatureSnapshot {
  pair: string;
  current: PairTickerSnapshot;
  change1m: number;
  change3m: number;
  change5m: number;
  change15m: number;
  quoteFlow1m: number;
  quoteFlow3m: number;
  quoteFlow5m: number;
  quoteFlow15mAvgPerMin: number;
  quoteFlowAccelerationScore: number;
  volatilityScore: number;
  momentumScore: number;
}

function sumPositiveDelta(points: TickerPoint[], since: number): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    if (current.capturedAt < since) {
      continue;
    }

    const previous = points[index - 1];
    total += Math.max(0, current.cumulativeVolume24hQuote - previous.cumulativeVolume24hQuote);
  }

  return total;
}

function observedCoverageMinutes(points: TickerPoint[], since: number, now: number): number {
  if (points.length === 0) {
    return 0;
  }

  const firstObserved = points.find((point) => point.capturedAt >= since)?.capturedAt ?? now;
  const coverageMs = Math.max(0, now - Math.max(since, firstObserved));
  return coverageMs / 60_000;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function latestPriceBefore(points: TickerPoint[], threshold: number): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].capturedAt <= threshold) {
      return points[index].price;
    }
  }

  return points[0]?.price ?? null;
}

export class TickerSnapshotStore {
  private readonly history = new Map<string, TickerPoint[]>();

  constructor(private readonly maxPoints = 300) {}

  push(snapshot: PairTickerSnapshot): void {
    const current = this.history.get(snapshot.pair) ?? [];

    current.push({
      price: snapshot.lastPrice,
      cumulativeVolume24hQuote: snapshot.volume24hQuote,
      capturedAt: snapshot.timestamp,
    });

    while (current.length > this.maxPoints) {
      current.shift();
    }

    this.history.set(snapshot.pair, current);
  }

  getHistory(pair: string): TickerPoint[] {
    return [...(this.history.get(pair) ?? [])];
  }

  buildFeatures(snapshot: PairTickerSnapshot): TickerFeatureSnapshot {
    this.push(snapshot);

    const points = this.history.get(snapshot.pair) ?? [];
    const now = snapshot.timestamp;

    const price1m = latestPriceBefore(points, now - 60_000);
    const price3m = latestPriceBefore(points, now - 180_000);
    const price5m = latestPriceBefore(points, now - 300_000);
    const price15m = latestPriceBefore(points, now - 900_000);

    const quoteFlow1m = sumPositiveDelta(points, now - 60_000);
    const quoteFlow3m = sumPositiveDelta(points, now - 180_000);
    const quoteFlow5m = sumPositiveDelta(points, now - 300_000);
    const lookback15mStart = now - 900_000;
    const quoteFlow15m = sumPositiveDelta(points, lookback15mStart);
    const observedCoverageMin15m = observedCoverageMinutes(points, lookback15mStart, now);
    const quoteFlow15mAvgPerMin =
      observedCoverageMin15m > 0 ? quoteFlow15m / observedCoverageMin15m : 0;

    const returns = points.slice(-20).map((item, index, arr) => {
      if (index === 0) {
        return 0;
      }

      return Math.abs(pct(arr[index - 1].price, item.price));
    });

    const volatilityScore = clamp(avg(returns) * 10, 0, 100);
    const momentumScore = clamp(
      Math.max(0, pct(price1m ?? snapshot.lastPrice, snapshot.lastPrice)) * 8 +
        Math.max(0, pct(price5m ?? snapshot.lastPrice, snapshot.lastPrice)) * 4,
      0,
      100,
    );

    return {
      pair: snapshot.pair,
      current: snapshot,
      change1m: pct(price1m ?? snapshot.lastPrice, snapshot.lastPrice),
      change3m: pct(price3m ?? snapshot.lastPrice, snapshot.lastPrice),
      change5m: pct(price5m ?? snapshot.lastPrice, snapshot.lastPrice),
      change15m: pct(price15m ?? snapshot.lastPrice, snapshot.lastPrice),
      quoteFlow1m,
      quoteFlow3m,
      quoteFlow5m,
      quoteFlow15mAvgPerMin,
      quoteFlowAccelerationScore:
        quoteFlow15mAvgPerMin > 0 ? clamp((quoteFlow1m / quoteFlow15mAvgPerMin) * 10, 0, 100) : 0,
      volatilityScore,
      momentumScore,
    };
  }
}
