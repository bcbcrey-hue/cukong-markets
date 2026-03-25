import type { DiscoveryBucket, DiscoveryCandidate, DiscoverySettings } from '../../core/types';
import type { IndodaxOrderbook } from '../../integrations/indodax/publicApi';
import { classifyPair } from './pairClassifier';
import type { PairMetricSnapshot } from './pairUniverse';

export interface DiscoveryHistoryPoint {
  price: number;
  volumeQuote: number;
  capturedAt: number;
}

export interface DiscoveryScoringInput {
  metric: PairMetricSnapshot;
  observedAt: number;
  settings: DiscoverySettings;
  previous?: DiscoveryHistoryPoint;
  orderbook?: IndodaxOrderbook;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sumTopN(side: Array<[number, number]>, n = 5): number {
  return side.slice(0, n).reduce((sum, [, size]) => sum + size, 0);
}

function toSpreadPct(bestBid: number, bestAsk: number): number {
  if (bestAsk <= 0 || bestBid <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, ((bestAsk - bestBid) / bestAsk) * 100);
}

function scoreDepth(orderbook: IndodaxOrderbook | undefined): number {
  if (!orderbook) {
    return 0;
  }

  const depth = sumTopN(orderbook.buy, 5) + sumTopN(orderbook.sell, 5);
  return clamp(depth, 0, 100);
}

function scoreImbalance(orderbook: IndodaxOrderbook | undefined): number {
  if (!orderbook) {
    return 0;
  }

  const bid = sumTopN(orderbook.buy, 5);
  const ask = sumTopN(orderbook.sell, 5);
  const total = bid + ask;
  if (total <= 0) {
    return 0;
  }

  return clamp((bid - ask) / total, -1, 1);
}

function scoreBreakoutPressure(metric: PairMetricSnapshot): number {
  const range = Math.max(0, metric.high24h - metric.low24h);
  if (range <= 0) {
    return 0;
  }

  const normalized = (metric.lastPrice - metric.low24h) / range;
  return clamp((normalized - 0.5) * 2, -1, 1);
}

function assignBucket(params: {
  majorPair: boolean;
  volumeAcceleration: number;
  priceExpansionPct: number;
  breakoutPressure: number;
}): DiscoveryBucket {
  const { majorPair, volumeAcceleration, priceExpansionPct, breakoutPressure } = params;

  if (majorPair) {
    return 'LIQUID_LEADER';
  }

  if (
    volumeAcceleration >= 0.08 &&
    priceExpansionPct >= 0.3 &&
    breakoutPressure >= 0.25
  ) {
    return 'ANOMALY';
  }

  if (priceExpansionPct >= 0.2 || breakoutPressure >= 0.15) {
    return 'ROTATION';
  }

  return 'STEALTH';
}

export function scoreDiscoveryCandidate(input: DiscoveryScoringInput): DiscoveryCandidate | null {
  const { metric, observedAt, settings, previous, orderbook } = input;
  if (metric.volumeIdr < settings.minVolumeIdr) {
    return null;
  }

  const spreadPct = orderbook
    ? toSpreadPct(orderbook.buy[0]?.[0] ?? metric.bestBid, orderbook.sell[0]?.[0] ?? metric.bestAsk)
    : toSpreadPct(metric.bestBid, metric.bestAsk);
  if (spreadPct > settings.maxSpreadPct) {
    return null;
  }

  const depthScore = scoreDepth(orderbook);
  if (orderbook && depthScore < settings.minDepthScore) {
    return null;
  }

  const volumeAcceleration = previous && previous.volumeQuote > 0
    ? Math.max(0, (metric.volumeIdr - previous.volumeQuote) / previous.volumeQuote)
    : 0;
  const priceExpansionPct = previous && previous.price > 0
    ? ((metric.lastPrice - previous.price) / previous.price) * 100
    : 0;
  const breakoutPressure = scoreBreakoutPressure(metric);
  const orderbookImbalance = scoreImbalance(orderbook);
  const pairInfo = classifyPair(metric.pair);
  const majorPair = pairInfo.pairClass === 'MAJOR';

  const bucket = assignBucket({
    majorPair,
    volumeAcceleration,
    priceExpansionPct,
    breakoutPressure,
  });

  const score = (
    clamp(volumeAcceleration * 60, 0, 35) +
    clamp(priceExpansionPct * 6, -8, 22) +
    ((breakoutPressure + 1) / 2) * 20 +
    ((orderbookImbalance + 1) / 2) * 13 +
    clamp((settings.maxSpreadPct - spreadPct) * 8, -5, 10) +
    clamp(depthScore / 5, 0, 20)
  );

  return {
    pair: metric.pair,
    bucket,
    discoveryScore: clamp(score, 0, 100),
    volumeIdr: metric.volumeIdr,
    volumeAcceleration,
    priceExpansionPct,
    breakoutPressure,
    orderbookImbalance,
    spreadPct,
    depthScore,
    majorPair,
    observedAt,
  };
}
