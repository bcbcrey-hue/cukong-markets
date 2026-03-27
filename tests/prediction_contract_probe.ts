import assert from 'node:assert/strict';

import type { HistoricalContext, MicrostructureFeatures, SignalCandidate } from '../src/core/types';
import { FutureTrendingPredictionEngine } from '../src/domain/intelligence/futureTrendingPredictionEngine';

function makeSignal(): SignalCandidate {
  return {
    pair: 'pred_contract_idr',
    score: 82,
    confidence: 0.74,
    reasons: ['probe'],
    warnings: [],
    regime: 'EXPANSION',
    breakoutPressure: 76,
    quoteFlowAccelerationScore: 68,
    orderbookImbalance: 0.38,
    spreadPct: 0.2,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 20,
    bidDepthTop10: 200_000,
    askDepthTop10: 170_000,
    depthScore: 78,
    orderbookTimestamp: Date.now(),
    liquidityScore: 79,
    change1m: 0.9,
    change5m: 2.1,
    contributions: [],
    timestamp: Date.now(),
  };
}

function makeMicro(overrides: Partial<MicrostructureFeatures> = {}): MicrostructureFeatures {
  return {
    pair: 'pred_contract_idr',
    accumulationScore: 72,
    spoofRiskScore: 18,
    icebergScore: 25,
    clusterScore: 70,
    aggressionBias: 0.3,
    sweepScore: 52,
    breakoutPressureScore: 75,
    quoteFlowAccelerationScore: 68,
    liquidityQualityScore: 80,
    spreadScore: 74,
    exhaustionRiskScore: 24,
    timestamp: Date.now(),
    evidence: ['probe'],
    tradeFlowSource: 'EXCHANGE_TRADE_FEED',
    tradeFlowQuality: 'TAPE',
    ...overrides,
  };
}

function makeContext(overrides: Partial<HistoricalContext> = {}): HistoricalContext {
  return {
    pair: 'pred_contract_idr',
    snapshotCount: 12,
    anomalyCount: 1,
    recentWinRate: 0.62,
    recentFalseBreakRate: 0.18,
    outcomeGrounding: 'OUTCOME_GROUNDED',
    outcomeSampleSize: 8,
    regime: 'EXPANSION',
    patternMatches: [],
    contextNotes: ['probe'],
    timestamp: Date.now(),
    ...overrides,
  };
}

async function main() {
  const engine = new FutureTrendingPredictionEngine();

  const strong = engine.predict({
    signal: makeSignal(),
    microstructure: makeMicro(),
    historicalContext: makeContext(),
  });

  assert.equal(strong.target, 'TREND_DIRECTIONAL_MOVE');
  assert.equal(strong.horizonLabel, 'H5_15M');
  assert.equal(strong.horizonMinutes, 15);
  assert.ok(['UP', 'SIDEWAYS', 'DOWN'].includes(strong.direction));
  assert.ok(['WEAK', 'MODERATE', 'STRONG'].includes(strong.strength));
  assert.ok(strong.confidence >= 0 && strong.confidence <= 1);
  assert.ok(Array.isArray(strong.reasons) && strong.reasons.length > 0);

  const weak = engine.predict({
    signal: makeSignal(),
    microstructure: makeMicro({
      spoofRiskScore: 70,
      exhaustionRiskScore: 68,
      tradeFlowSource: 'INFERRED_PROXY',
      tradeFlowQuality: 'PROXY',
      liquidityQualityScore: 35,
      breakoutPressureScore: 30,
      clusterScore: 20,
      accumulationScore: 22,
    }),
    historicalContext: makeContext({
      recentWinRate: 0.22,
      recentFalseBreakRate: 0.55,
      outcomeGrounding: 'PROXY_FALLBACK',
      outcomeSampleSize: 0,
    }),
  });

  assert.notEqual(strong.strength, weak.strength, 'strong vs weak prediction harus bisa dibedakan');
  assert.ok(strong.confidence > weak.confidence, 'confidence strong harus lebih tinggi dari weak');

  console.log('prediction_contract_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
