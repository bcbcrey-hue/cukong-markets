import assert from 'node:assert/strict';

import type { SignalCandidate } from '../src/core/types';
import { PumpCandidateWatch } from '../src/domain/market/pumpCandidateWatch';

function signal(
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
    quoteFlowAccelerationScore: 75,
    orderbookImbalance: 55,
    spreadPct: 0.2,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 20,
    bidDepthTop10: 400_000,
    askDepthTop10: 360_000,
    depthScore: 78,
    orderbookTimestamp: Date.now(),
    liquidityScore,
    change1m,
    change5m,
    contributions: [],
    timestamp: Date.now(),
  };
}

async function main(): Promise<void> {
  const watch = new PumpCandidateWatch();

  const signals: SignalCandidate[] = [
    signal('btc_idr', 97, 99, 0.2, 0.4),
    signal('eth_idr', 96, 98, 0.1, 0.2),
    signal('sol_idr', 95, 97, 0.2, 0.3),
    signal('pepe_idr', 94, 76, 1.4, 3.1),
    signal('doge_idr', 93, 74, 1.2, 2.8),
    signal('xrp_idr', 92, 73, 1.1, 2.4),
  ];

  const overview = watch.buildMarketOverview(signals);
  const overviewPairs = overview.liquidLeaders.map((item) => item.pair);
  assert(overviewPairs.includes('btc_idr') && overviewPairs.includes('eth_idr'), 'market overview should retain liquid major leaders');

  const candidatePairs = watch.buildCandidateFeed(signals, 4, 0.25).map((item) => item.pair);
  assert.deepEqual(
    candidatePairs,
    ['btc_idr', 'pepe_idr', 'doge_idr', 'xrp_idr'],
    'candidate feed must split from market overview and reserve most slots for non-major opportunities',
  );

  assert.notDeepEqual(
    candidatePairs,
    overviewPairs.slice(0, 4),
    'candidate feed must not be a direct copy of market overview liquid leaders',
  );

  console.log('PASS discovery_market_watch_split_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_market_watch_split_probe');
  console.error(error);
  process.exit(1);
});
