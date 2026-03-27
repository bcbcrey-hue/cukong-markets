import assert from 'node:assert/strict';

import type { HistoricalContext, MicrostructureFeatures, SignalCandidate } from '../src/core/types';
import { FutureTrendingPredictionEngine } from '../src/domain/intelligence/futureTrendingPredictionEngine';

const signal: SignalCandidate = {
  pair: 'pred_cal_idr',
  score: 78,
  confidence: 0.7,
  reasons: ['probe'],
  warnings: [],
  regime: 'BREAKOUT_SETUP',
  breakoutPressure: 66,
  quoteFlowAccelerationScore: 61,
  orderbookImbalance: 0.28,
  spreadPct: 0.24,
  marketPrice: 100,
  bestBid: 99.8,
  bestAsk: 100,
  spreadBps: 20,
  bidDepthTop10: 160_000,
  askDepthTop10: 145_000,
  depthScore: 73,
  orderbookTimestamp: Date.now(),
  liquidityScore: 76,
  change1m: 0.7,
  change5m: 1.8,
  contributions: [],
  timestamp: Date.now(),
};

function context(outcomeGrounding: HistoricalContext['outcomeGrounding']): HistoricalContext {
  return {
    pair: 'pred_cal_idr',
    snapshotCount: 9,
    anomalyCount: 1,
    recentWinRate: 0.57,
    recentFalseBreakRate: 0.22,
    outcomeGrounding,
    outcomeSampleSize: outcomeGrounding === 'OUTCOME_GROUNDED' ? 5 : 0,
    regime: 'BREAKOUT_SETUP',
    patternMatches: [],
    contextNotes: ['probe'],
    timestamp: Date.now(),
  };
}

function micro(tradeFlowSource: MicrostructureFeatures['tradeFlowSource'], tradeFlowQuality: MicrostructureFeatures['tradeFlowQuality']): MicrostructureFeatures {
  return {
    pair: 'pred_cal_idr',
    accumulationScore: 63,
    spoofRiskScore: 20,
    icebergScore: 31,
    clusterScore: 59,
    aggressionBias: 0.2,
    sweepScore: 42,
    breakoutPressureScore: 64,
    quoteFlowAccelerationScore: 61,
    liquidityQualityScore: 74,
    spreadScore: 70,
    exhaustionRiskScore: 21,
    timestamp: Date.now(),
    evidence: ['probe'],
    tradeFlowSource,
    tradeFlowQuality,
  };
}

async function main() {
  const engine = new FutureTrendingPredictionEngine();

  const groundedTruth = engine.predict({
    signal,
    microstructure: micro('EXCHANGE_TRADE_FEED', 'TAPE'),
    historicalContext: context('OUTCOME_GROUNDED'),
  });

  const proxyFallback = engine.predict({
    signal,
    microstructure: micro('INFERRED_PROXY', 'PROXY'),
    historicalContext: context('PROXY_FALLBACK'),
  });

  assert.equal(groundedTruth.horizonLabel, 'H5_15M');
  assert.equal(groundedTruth.horizonMinutes, 15);
  assert.equal(groundedTruth.calibrationTag, 'OUTCOME_AND_TRADE_TRUTH');
  assert.equal(proxyFallback.calibrationTag, 'PROXY_FALLBACK');
  assert.ok(
    groundedTruth.confidence > proxyFallback.confidence,
    'source truth + outcome grounded harus memberi confidence lebih tinggi dari proxy fallback',
  );
  assert.ok(
    proxyFallback.caveats.some((note) => note.includes('confidence diturunkan konservatif')),
    'proxy fallback harus memberi caveat calibration yang jujur',
  );

  console.log('prediction_horizon_calibration_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
