import type { DiscoveryBucketType } from '../../core/types';
import type { OrderbookFeatureSnapshot } from './orderbookSnapshot';
import type { PairMetricSnapshot } from './pairUniverse';
import type { TickerFeatureSnapshot } from './tickerSnapshot';
import { isMajorPair } from './majorPairContract';

export interface DiscoveryScoreInput {
  snapshot: PairMetricSnapshot;
  ticker: TickerFeatureSnapshot;
}

export interface DiscoveryRankedCandidate {
  pair: string;
  bucket: DiscoveryBucketType;
  majorPair: boolean;
  volumeIdr: number;
  spreadPct: number;
  snapshot: PairMetricSnapshot;
  ticker: TickerFeatureSnapshot;
  discoveryScore: number;
  quoteFlowAccelerationScore: number;
  priceExpansion: number;
  breakoutPressure: number;
  orderbookImbalance: number;
  depthScore: number;
  stage: 'pre_depth' | 'post_depth';
  reasons: string[];
  warnings: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


function classifyBucket(candidate: {
  majorPair: boolean;
  quoteFlowAccelerationScore: number;
  priceExpansion: number;
  breakoutPressure: number;
}): DiscoveryBucketType {
  if (candidate.majorPair) {
    return 'LIQUID_LEADER';
  }

  if (candidate.quoteFlowAccelerationScore >= 55 && candidate.priceExpansion >= 35) {
    return 'ANOMALY';
  }

  if (candidate.priceExpansion >= 25 && candidate.breakoutPressure >= 30) {
    return 'ROTATION';
  }

  return 'STEALTH';
}

export class DiscoveryScorer {
  scorePreDepth(input: DiscoveryScoreInput): DiscoveryRankedCandidate {
    const spreadPct =
      input.snapshot.bestAsk > 0
        ? ((input.snapshot.bestAsk - input.snapshot.bestBid) / input.snapshot.bestAsk) * 100
        : 0;

    const quoteFlowAccelerationScore = clamp(input.ticker.quoteFlowAccelerationScore, 0, 100);
    const priceExpansion = clamp(Math.max(0, input.ticker.change1m) * 12, 0, 100);
    const breakoutPressure = clamp(
      Math.max(0, input.ticker.change1m) * 6 + Math.max(0, input.ticker.change5m) * 4,
      0,
      100,
    );
    const spreadQuality = clamp(100 - spreadPct * 140, 0, 100);

    const majorPair = isMajorPair(input.snapshot.pair);
    const bucket = classifyBucket({
      majorPair,
      quoteFlowAccelerationScore,
      priceExpansion,
      breakoutPressure,
    });

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (quoteFlowAccelerationScore >= 45) reasons.push('quote_flow_acceleration');
    if (priceExpansion >= 30) reasons.push('price_expansion');
    if (breakoutPressure >= 30) reasons.push('breakout_pressure');
    if (spreadQuality >= 55) reasons.push('spread_still_reasonable');
    if (spreadPct > 1.2) warnings.push('spread_too_wide_pre_depth');

    const discoveryScore =
      quoteFlowAccelerationScore * 0.34 +
      priceExpansion * 0.3 +
      breakoutPressure * 0.24 +
      spreadQuality * 0.12;

    return {
      pair: input.snapshot.pair,
      bucket,
      majorPair,
      volumeIdr: input.snapshot.volumeIdr,
      spreadPct,
      snapshot: input.snapshot,
      ticker: input.ticker,
      discoveryScore,
      quoteFlowAccelerationScore,
      priceExpansion,
      breakoutPressure,
      orderbookImbalance: 0,
      depthScore: 0,
      stage: 'pre_depth',
      reasons,
      warnings,
    };
  }

  enrichWithDepth(
    candidate: DiscoveryRankedCandidate,
    orderbook: OrderbookFeatureSnapshot,
  ): DiscoveryRankedCandidate {
    const depthBonus = clamp(orderbook.depthScore, 0, 100);
    const imbalance = orderbook.orderbookImbalance;
    const imbalanceBonus = clamp((imbalance + 1) * 50, 0, 100);

    const warnings = [...candidate.warnings];
    const reasons = [...candidate.reasons];

    if (depthBonus < 20) {
      warnings.push('thin_depth_post_depth');
    } else {
      reasons.push('depth_not_thin');
    }

    if (imbalance > 0.05) {
      reasons.push('orderbook_imbalance_supportive');
    }

    const discoveryScore =
      candidate.discoveryScore * 0.75 + depthBonus * 0.15 + imbalanceBonus * 0.1;

    return {
      ...candidate,
      discoveryScore,
      orderbookImbalance: imbalance,
      depthScore: depthBonus,
      stage: 'post_depth',
      reasons,
      warnings,
    };
  }
}
