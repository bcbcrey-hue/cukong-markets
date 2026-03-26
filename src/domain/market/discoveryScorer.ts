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
  quoteJerkScore: number;
  askVacuumScore: number;
  bidPersistenceScore: number;
  breakoutCompressionScore: number;
  earlyPriceLiftScore: number;
  depthScoreHint: number;
}): DiscoveryBucketType {
  const anomalyPulse =
    candidate.quoteJerkScore * 0.32 +
    candidate.askVacuumScore * 0.24 +
    candidate.bidPersistenceScore * 0.18 +
    candidate.earlyPriceLiftScore * 0.16 +
    candidate.breakoutCompressionScore * 0.1;

  if (
    anomalyPulse >= 60 &&
    candidate.askVacuumScore >= 45 &&
    candidate.bidPersistenceScore >= 40
  ) {
    return 'ANOMALY';
  }

  if (anomalyPulse >= 42 && candidate.breakoutCompressionScore >= 30) {
    return 'STEALTH';
  }

  if (candidate.earlyPriceLiftScore >= 35 || candidate.bidPersistenceScore >= 45) {
    return 'ROTATION';
  }

  if (
    candidate.majorPair &&
    candidate.depthScoreHint >= 45 &&
    candidate.quoteJerkScore < 45 &&
    candidate.breakoutCompressionScore < 35
  ) {
    return 'LIQUID_LEADER';
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
    const quoteFlow15mBaseline = Math.max(1, input.ticker.quoteFlow15mAvgPerMin);
    const quoteFlowJerk = clamp(((input.ticker.quoteFlow1m - quoteFlow15mBaseline) / quoteFlow15mBaseline) * 60, 0, 100);
    const quoteJerkScore = clamp(quoteFlowAccelerationScore * 0.55 + quoteFlowJerk * 0.45, 0, 100);
    const priceExpansion = clamp(Math.max(0, input.ticker.change1m) * 12, 0, 100);
    const breakoutPressure = clamp(
      Math.max(0, input.ticker.change1m) * 6 + Math.max(0, input.ticker.change5m) * 4,
      0,
      100,
    );
    const breakoutCompressionScore = clamp(100 - input.ticker.volatilityScore + Math.max(0, input.ticker.change3m) * 5, 0, 100);
    const earlyPriceLiftScore = clamp(
      Math.max(0, input.ticker.change1m) * 10 + Math.max(0, input.ticker.change3m) * 5 - Math.max(0, input.ticker.change15m - 18) * 2,
      0,
      100,
    );
    const bidPersistenceScore = clamp(
      Math.max(0, input.ticker.change1m) * 12 +
        Math.max(0, input.ticker.change3m) * 8 +
        Math.max(0, input.ticker.change5m) * 4,
      0,
      100,
    );
    const askVacuumScore = clamp(
      quoteJerkScore * 0.45 + earlyPriceLiftScore * 0.35 + Math.max(0, 1.5 - spreadPct) * 12,
      0,
      100,
    );
    const spreadQuality = clamp(100 - spreadPct * 140, 0, 100);
    const depthScoreHint = input.snapshot.volumeIdr <= 0 ? 0 : clamp((Math.log10(input.snapshot.volumeIdr + 1) - 6) * 12, 0, 100);

    const majorPair = isMajorPair(input.snapshot.pair);
    const bucket = classifyBucket({
      majorPair,
      quoteJerkScore,
      askVacuumScore,
      bidPersistenceScore,
      breakoutCompressionScore,
      earlyPriceLiftScore,
      depthScoreHint,
    });

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (quoteJerkScore >= 45) reasons.push('quote_flow_jerk');
    if (askVacuumScore >= 45) reasons.push('ask_vacuum_pressure');
    if (bidPersistenceScore >= 40) reasons.push('bid_persistence');
    if (priceExpansion >= 30) reasons.push('price_expansion');
    if (breakoutPressure >= 30) reasons.push('breakout_pressure');
    if (breakoutCompressionScore >= 35) reasons.push('breakout_compression');
    if (earlyPriceLiftScore >= 35) reasons.push('early_price_lift');
    if (spreadQuality >= 55) reasons.push('spread_still_reasonable');
    if (spreadPct > 2.4) warnings.push('spread_too_wide_pre_depth');
    if (majorPair && bucket !== 'LIQUID_LEADER') reasons.push('major_pair_not_auto_leader');

    const discoveryScore =
      quoteJerkScore * 0.23 +
      askVacuumScore * 0.2 +
      bidPersistenceScore * 0.18 +
      breakoutCompressionScore * 0.14 +
      earlyPriceLiftScore * 0.15 +
      spreadQuality * 0.1;

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

    if (depthBonus < 3) warnings.push('dead_thin_book');
    if (depthBonus >= 4 && depthBonus <= 18) reasons.push('thin_book_alive_opportunity');
    if (depthBonus >= 19 && depthBonus <= 30) reasons.push('depth_profile_neutral');
    if (depthBonus > 30) warnings.push('book_too_thick_lower_priority');

    if (imbalance > 0.05) {
      reasons.push('orderbook_imbalance_supportive');
    }

    const discoveryScore =
      candidate.discoveryScore * 0.65 +
      (depthBonus >= 4 && depthBonus <= 18 ? 22 : depthBonus >= 19 && depthBonus <= 30 ? 8 : 0) +
      imbalanceBonus * 0.13 -
      (depthBonus < 3 ? 24 : 0) -
      (depthBonus > 30 ? 6 : 0);

    return {
      ...candidate,
      discoveryScore: clamp(discoveryScore, 0, 100),
      orderbookImbalance: imbalance,
      depthScore: depthBonus,
      stage: 'post_depth',
      reasons,
      warnings,
    };
  }
}
