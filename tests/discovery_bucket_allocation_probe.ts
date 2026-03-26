import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { DiscoveryAllocator } from '../src/domain/market/discoveryAllocator';
import type { DiscoveryRankedCandidate } from '../src/domain/market/discoveryScorer';

function candidate(
  pair: string,
  score: number,
  bucket: DiscoveryRankedCandidate['bucket'],
  majorPair = false,
): DiscoveryRankedCandidate {
  return {
    pair,
    bucket,
    majorPair,
    volumeIdr: 700_000_000,
    spreadPct: 0.2,
    snapshot: {
      pair,
      lastPrice: 100,
      bestBid: 99.8,
      bestAsk: 100,
      high24h: 120,
      low24h: 80,
      volumeIdr: 700_000_000,
      volumeBtc: 1,
      serverTime: Date.now(),
    },
    ticker: {
      pair,
      current: {
        pair,
        lastPrice: 100,
        bid: 99.8,
        ask: 100,
        high24h: 120,
        low24h: 80,
        volume24hBase: 1,
        volume24hQuote: 700_000_000,
        change24hPct: 10,
        timestamp: Date.now(),
      },
      change1m: 1,
      change3m: 1,
      change5m: 1,
      change15m: 1,
      quoteFlow1m: 1,
      quoteFlow3m: 1,
      quoteFlow5m: 1,
      quoteFlow15mAvgPerMin: 1,
      quoteFlowAccelerationScore: 80,
      volatilityScore: 40,
      momentumScore: 45,
    },
    discoveryScore: score,
    quoteFlowAccelerationScore: 80,
    priceExpansion: 40,
    breakoutPressure: 40,
    orderbookImbalance: 0.2,
    depthScore: 45,
    stage: 'post_depth',
    reasons: [],
    warnings: [],
  };
}

const settings: DiscoverySettings = {
  anomalySlots: 2,
  rotationSlots: 1,
  stealthSlots: 1,
  liquidLeaderSlots: 2,
  minVolumeIdr: 150_000_000,
  maxSpreadPct: 1.2,
  minDepthScore: 15,
  majorPairMaxShare: 1,
};

function countBucket(selected: DiscoveryRankedCandidate[], bucket: DiscoveryRankedCandidate['bucket']): number {
  return selected.filter((item) => item.bucket === bucket).length;
}

async function main(): Promise<void> {
  const allocator = new DiscoveryAllocator();

  const balanced = allocator.allocate(
    [
      candidate('anom_1_idr', 95, 'ANOMALY'),
      candidate('anom_2_idr', 94, 'ANOMALY'),
      candidate('rot_1_idr', 93, 'ROTATION'),
      candidate('stealth_1_idr', 92, 'STEALTH'),
      candidate('btc_idr', 99, 'LIQUID_LEADER', true),
      candidate('eth_idr', 98, 'LIQUID_LEADER', true),
    ],
    6,
    settings,
  );

  assert.equal(balanced.length, 6, 'allocator must fill full limit when supply is sufficient');
  assert.equal(countBucket(balanced, 'ANOMALY'), 2, 'ANOMALY allocation must match config exactly');
  assert.equal(countBucket(balanced, 'ROTATION'), 1, 'ROTATION allocation must match config exactly');
  assert.equal(countBucket(balanced, 'STEALTH'), 1, 'STEALTH allocation must match config exactly');
  assert.equal(countBucket(balanced, 'LIQUID_LEADER'), 2, 'LIQUID_LEADER allocation must match config exactly');

  const fallback = allocator.allocate(
    [
      candidate('anom_only_idr', 97, 'ANOMALY'),
      candidate('rot_1_idr', 96, 'ROTATION'),
      candidate('stealth_1_idr', 95, 'STEALTH'),
      candidate('btc_idr', 99, 'LIQUID_LEADER', true),
      candidate('eth_idr', 98, 'LIQUID_LEADER', true),
      candidate('usdt_idr', 94, 'LIQUID_LEADER', true),
    ],
    6,
    settings,
  );

  assert.equal(fallback.length, 6, 'allocator must backfill remaining slots when a bucket lacks candidates');
  assert.equal(countBucket(fallback, 'ANOMALY'), 1, 'ANOMALY count should reflect real available candidates');
  assert.equal(countBucket(fallback, 'ROTATION'), 1, 'ROTATION slot must still be honored');
  assert.equal(countBucket(fallback, 'STEALTH'), 1, 'STEALTH slot must still be honored');
  assert.equal(
    countBucket(fallback, 'LIQUID_LEADER'),
    3,
    'missing ANOMALY slot should be backfilled by next best candidate regardless of bucket',
  );

  const lowShareSettings: DiscoverySettings = {
    ...settings,
    anomalySlots: 2,
    stealthSlots: 1,
    rotationSlots: 1,
    liquidLeaderSlots: 1,
    majorPairMaxShare: 0.12,
  };

  const lowShareSelected = allocator.allocate(
    [
      candidate('anom_1_idr', 95, 'ANOMALY'),
      candidate('anom_2_idr', 94, 'ANOMALY'),
      candidate('stealth_1_idr', 93, 'STEALTH'),
      candidate('rot_1_idr', 92, 'ROTATION'),
      candidate('btc_idr', 99, 'LIQUID_LEADER', true),
    ],
    5,
    lowShareSettings,
  );

  assert(
    lowShareSelected.some((item) => item.pair === 'btc_idr'),
    'when liquidLeaderSlots>0 and share>0, allocator must still allow one major fallback even if floor(limit*share)=0',
  );
  assert.equal(
    lowShareSelected.filter((item) => item.majorPair).length,
    1,
    'major fallback path must stay hard-capped to one pair in low-share small-limit scenario',
  );

  const zeroShareSelected = allocator.allocate(
    [
      candidate('anom_1_idr', 95, 'ANOMALY'),
      candidate('anom_2_idr', 94, 'ANOMALY'),
      candidate('stealth_1_idr', 93, 'STEALTH'),
      candidate('rot_1_idr', 92, 'ROTATION'),
      candidate('btc_idr', 99, 'LIQUID_LEADER', true),
    ],
    5,
    { ...lowShareSettings, majorPairMaxShare: 0 },
  );
  assert(
    zeroShareSelected.every((item) => !item.majorPair),
    'majorPairMaxShare=0 must continue to block all major pairs, including liquid leader fallback',
  );

  console.log('PASS discovery_bucket_allocation_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_bucket_allocation_probe');
  console.error(error);
  process.exit(1);
});
