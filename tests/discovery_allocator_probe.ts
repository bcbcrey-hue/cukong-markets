import assert from 'node:assert/strict';

import { DiscoveryAllocator } from '../src/domain/market/discoveryAllocator';
import type { DiscoveryRankedCandidate } from '../src/domain/market/discoveryScorer';

function candidate(
  pair: string,
  score: number,
  bucket: DiscoveryRankedCandidate['bucket'],
  majorPair: boolean,
): DiscoveryRankedCandidate {
  return {
    pair,
    bucket,
    majorPair,
    volumeIdr: 500_000_000,
    spreadPct: 0.2,
    snapshot: {
      pair,
      lastPrice: 100,
      bestBid: 99,
      bestAsk: 100,
      high24h: 110,
      low24h: 80,
      volumeIdr: 500_000_000,
      volumeBtc: 2,
      serverTime: Date.now(),
    },
    ticker: {
      pair,
      current: {
        pair,
        lastPrice: 100,
        bid: 99,
        ask: 100,
        high24h: 110,
        low24h: 80,
        volume24hBase: 2,
        volume24hQuote: 500_000_000,
        change24hPct: 10,
        timestamp: Date.now(),
      },
      change1m: 1,
      change3m: 2,
      change5m: 3,
      change15m: 4,
      volume1m: 1,
      volume3m: 2,
      volume5m: 3,
      volume15mAvg: 1,
      volumeAcceleration: 80,
      volatilityScore: 50,
      momentumScore: 60,
    },
    discoveryScore: score,
    volumeAcceleration: 80,
    priceExpansion: 40,
    breakoutPressure: 40,
    orderbookImbalance: 0.2,
    depthScore: 40,
    stage: 'post_depth',
    reasons: [],
    warnings: [],
  };
}

async function main() {
  const allocator = new DiscoveryAllocator();
  const selected = allocator.allocate(
    [
      candidate('btc_idr', 95, 'LIQUID_LEADER', true),
      candidate('eth_idr', 94, 'LIQUID_LEADER', true),
      candidate('usdt_idr', 93, 'LIQUID_LEADER', true),
      candidate('anom_a_idr', 92, 'ANOMALY', false),
      candidate('rot_a_idr', 91, 'ROTATION', false),
      candidate('stealth_a_idr', 90, 'STEALTH', false),
    ],
    4,
  );

  assert.equal(selected.length, 4, 'allocator should fill up to requested limit');
  const majorCount = selected.filter((item) => item.majorPair).length;
  assert(majorCount <= 2, 'major pair cap must prevent liquid leaders from dominating final output');
  assert(selected.some((item) => item.bucket === 'ANOMALY'), 'ANOMALY bucket should be present');
  assert(selected.some((item) => item.bucket === 'ROTATION'), 'ROTATION bucket should be present');
  assert(selected.some((item) => item.bucket === 'STEALTH'), 'STEALTH bucket should be present');

  console.log('PASS discovery_allocator_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_allocator_probe');
  console.error(error);
  process.exit(1);
});
