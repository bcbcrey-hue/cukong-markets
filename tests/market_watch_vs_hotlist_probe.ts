import assert from 'node:assert/strict';
import { HotlistService } from '../src/domain/market/hotlistService';
import { PumpCandidateWatch } from '../src/domain/market/pumpCandidateWatch';
import type { OpportunityAssessment, SignalCandidate } from '../src/core/types';

function makeSignal(
  pair: string,
  score: number,
  liquidityScore: number,
  change1m: number,
  change5m: number,
): SignalCandidate {
  return {
    pair,
    score,
    confidence: 0.8,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 70,
    volumeAcceleration: 65,
    orderbookImbalance: 55,
    spreadPct: 0.2,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100.2,
    spreadBps: 20,
    bidDepthTop10: 500_000,
    askDepthTop10: 450_000,
    depthScore: 80,
    orderbookTimestamp: Date.now(),
    liquidityScore,
    change1m,
    change5m,
    contributions: [],
    timestamp: Date.now(),
  };
}

function toOpportunity(signal: SignalCandidate): OpportunityAssessment {
  return {
    pair: signal.pair,
    rawScore: signal.score,
    finalScore: signal.score,
    confidence: signal.confidence,
    pumpProbability: 0.72,
    continuationProbability: 0.61,
    trapProbability: 0.12,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: signal.regime,
    breakoutPressure: signal.breakoutPressure,
    volumeAcceleration: signal.volumeAcceleration,
    orderbookImbalance: signal.orderbookImbalance,
    change1m: signal.change1m,
    change5m: signal.change5m,
    entryTiming: {
      state: 'READY',
      quality: 0.8,
      reason: 'probe',
      leadScore: 0.7,
    },
    reasons: signal.reasons,
    warnings: signal.warnings,
    featureBreakdown: signal.contributions,
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'n/a',
    referencePrice: signal.marketPrice,
    bestBid: signal.bestBid,
    bestAsk: signal.bestAsk,
    spreadBps: signal.spreadBps,
    bidDepthTop10: signal.bidDepthTop10,
    askDepthTop10: signal.askDepthTop10,
    depthScore: signal.depthScore,
    orderbookTimestamp: signal.orderbookTimestamp,
    spreadPct: signal.spreadPct,
    liquidityScore: signal.liquidityScore,
    timestamp: signal.timestamp,
  };
}

async function main(): Promise<void> {
  const service = new PumpCandidateWatch();
  const hotlist = new HotlistService();

  const signals: SignalCandidate[] = [
    makeSignal('btc_idr', 97, 99, 0.2, 0.4),
    makeSignal('eth_idr', 95, 98, 0.1, 0.2),
    makeSignal('sol_idr', 94, 97, 0.15, 0.3),
    makeSignal('pepe_idr', 92, 70, 1.2, 2.7),
    makeSignal('doge_idr', 90, 72, 1.1, 2.5),
    makeSignal('xrp_idr', 89, 75, 0.9, 2.2),
  ];

  const overview = service.buildMarketOverview(signals);
  assert.equal(overview.liquidLeaders[0]?.pair, 'btc_idr', 'Market overview should keep liquid majors.');
  assert.ok(
    overview.liquidLeaders.some((item) => item.pair === 'eth_idr'),
    'Market overview liquid leaders should include major pairs.',
  );

  const candidates = service.buildCandidateFeed(signals, 4, 0.25);
  const candidatePairs = candidates.map((item) => item.pair);

  assert.deepEqual(
    candidatePairs,
    ['btc_idr', 'pepe_idr', 'doge_idr', 'xrp_idr'],
    'Pump candidate feed should cap major dominance and keep room for non-majors.',
  );

  const finalHotlist = hotlist.update(candidates.map(toOpportunity));
  assert.equal(finalHotlist.length, 4, 'Hotlist should be generated from candidate feed size.');
  assert.ok(
    finalHotlist.every((item) => candidatePairs.includes(item.pair)),
    'Hotlist must only contain pairs from pump candidate watch.',
  );
  assert.ok(
    !finalHotlist.some((item) => item.pair === 'eth_idr' || item.pair === 'sol_idr'),
    'High-liquidity majors excluded by candidate cap must not leak into final hotlist.',
  );

  const strictZeroShareCandidates = service.buildCandidateFeed(signals, 4, 0);
  assert.ok(
    strictZeroShareCandidates.every((item) => !['btc_idr', 'eth_idr', 'sol_idr'].includes(item.pair)),
    'majorPairMaxShare=0 must block major pairs from final candidate feed.',
  );

  const lowNonMajorSignals: SignalCandidate[] = [
    makeSignal('btc_idr', 99, 99, 0.1, 0.2),
    makeSignal('eth_idr', 98, 98, 0.1, 0.2),
    makeSignal('sol_idr', 97, 97, 0.1, 0.2),
    makeSignal('bnb_idr', 96, 96, 0.1, 0.2),
    makeSignal('xrp_idr', 95, 85, 0.8, 1.5),
    makeSignal('doge_idr', 94, 84, 0.7, 1.4),
  ];
  const cappedWhenNonMajorLow = service.buildCandidateFeed(lowNonMajorSignals, 6, 0.25);
  const cappedMajors = cappedWhenNonMajorLow.filter(
    (item) => ['btc_idr', 'eth_idr', 'sol_idr'].includes(item.pair),
  );

  assert.ok(
    cappedMajors.length <= 1,
    'When non-major candidates are limited, major pairs must still stay within cap.',
  );

  const cappedHotlist = hotlist.update(cappedWhenNonMajorLow.map(toOpportunity));
  assert.ok(
    cappedHotlist.filter((item) => ['btc_idr', 'eth_idr', 'sol_idr'].includes(item.pair)).length <= 1,
    'Hotlist must not contain major pairs above candidate cap, even under low non-major supply.',
  );

  console.log('market_watch_vs_hotlist_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
