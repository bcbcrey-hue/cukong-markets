import assert from 'node:assert/strict';

import type { OpportunityAssessment, SignalCandidate } from '../src/core/types';
import { HotlistService } from '../src/domain/market/hotlistService';
import { PumpCandidateWatch } from '../src/domain/market/pumpCandidateWatch';

function signal(pair: string, score: number): SignalCandidate {
  return {
    pair,
    score,
    confidence: 0.8,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 60,
    volumeAcceleration: 65,
    orderbookImbalance: 50,
    spreadPct: 0.2,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 20,
    bidDepthTop10: 300_000,
    askDepthTop10: 250_000,
    depthScore: 75,
    orderbookTimestamp: Date.now(),
    liquidityScore: pair.includes('btc') || pair.includes('eth') || pair.includes('usdt') ? 98 : 75,
    change1m: 0.7,
    change5m: 1.8,
    contributions: [],
    timestamp: Date.now(),
  };
}

function toOpportunity(item: SignalCandidate): OpportunityAssessment {
  return {
    pair: item.pair,
    rawScore: item.score,
    finalScore: item.score,
    confidence: item.confidence,
    pumpProbability: 0.7,
    continuationProbability: 0.6,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: item.regime,
    breakoutPressure: item.breakoutPressure,
    volumeAcceleration: item.volumeAcceleration,
    orderbookImbalance: item.orderbookImbalance,
    change1m: item.change1m,
    change5m: item.change5m,
    entryTiming: { state: 'READY', quality: 0.8, reason: 'probe', leadScore: 0.7 },
    reasons: item.reasons,
    warnings: item.warnings,
    featureBreakdown: item.contributions,
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'n/a',
    referencePrice: item.marketPrice,
    bestBid: item.bestBid,
    bestAsk: item.bestAsk,
    spreadBps: item.spreadBps,
    bidDepthTop10: item.bidDepthTop10,
    askDepthTop10: item.askDepthTop10,
    depthScore: item.depthScore,
    orderbookTimestamp: item.orderbookTimestamp,
    spreadPct: item.spreadPct,
    liquidityScore: item.liquidityScore,
    timestamp: item.timestamp,
  };
}

function majorCount(pairs: string[]): number {
  return pairs.filter((pair) => ['btc_idr', 'eth_idr', 'sol_idr'].includes(pair)).length;
}

async function main(): Promise<void> {
  const watch = new PumpCandidateWatch();
  const hotlist = new HotlistService();

  const richSignals = [
    signal('btc_idr', 99),
    signal('eth_idr', 98),
    signal('sol_idr', 97),
    signal('alpha_idr', 96),
    signal('beta_idr', 95),
    signal('gamma_idr', 94),
    signal('delta_idr', 93),
    signal('epsilon_idr', 92),
  ];

  const shareZero = watch.buildCandidateFeed(richSignals, 4, 0).map((item) => item.pair);
  assert.equal(majorCount(shareZero), 0, 'majorPairMaxShare=0 must block every major pair from candidate feed');

  const shareQuarter = watch.buildCandidateFeed(richSignals, 4, 0.25).map((item) => item.pair);
  assert(
    majorCount(shareQuarter) <= 1,
    'majorPairMaxShare=0.25 with limit=4 must enforce at most one major slot',
  );

  const shareHalf = watch.buildCandidateFeed(richSignals, 6, 0.5).map((item) => item.pair);
  assert(majorCount(shareHalf) <= 3, 'majorPairMaxShare=0.5 with limit=6 must cap majors at three slots');

  const lowNonMajor = [
    signal('btc_idr', 99),
    signal('eth_idr', 98),
    signal('sol_idr', 97),
    signal('alpha_idr', 96),
  ];
  const lowSupplyPairs = watch.buildCandidateFeed(lowNonMajor, 6, 0.5).map((item) => item.pair);
  assert.equal(lowSupplyPairs.length, 4, 'candidate feed should remain honest when non-major supply is insufficient');
  assert.equal(majorCount(lowSupplyPairs), 3, 'major count must still follow cap even when total output is under limit');

  const finalHotlist = hotlist.update(watch.buildCandidateFeed(richSignals, 4, 0.25).map(toOpportunity));
  assert(
    majorCount(finalHotlist.map((item) => item.pair)) <= 1,
    'hotlist must preserve major pair cap from candidate feed without leakage',
  );

  console.log('PASS discovery_major_pair_cap_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_major_pair_cap_probe');
  console.error(error);
  process.exit(1);
});
