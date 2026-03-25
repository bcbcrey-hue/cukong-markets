import assert from 'node:assert/strict';

import type { DiscoveryCandidate, DiscoverySettings } from '../src/core/types';
import { allocateDiscoveryCandidates } from '../src/domain/market/discoveryAllocator';

function candidate(
  pair: string,
  bucket: DiscoveryCandidate['bucket'],
  score: number,
  majorPair: boolean,
  volumeIdr: number,
): DiscoveryCandidate {
  return {
    pair,
    bucket,
    discoveryScore: score,
    volumeIdr,
    volumeAcceleration: 0.2,
    priceExpansionPct: 0.5,
    breakoutPressure: 0.4,
    orderbookImbalance: 0.3,
    spreadPct: 0.3,
    depthScore: 60,
    majorPair,
    observedAt: Date.now(),
  };
}

async function main() {
  const settings: DiscoverySettings = {
    slots: {
      anomaly: 2,
      rotation: 1,
      stealth: 1,
      liquidLeader: 1,
    },
    minVolumeIdr: 0,
    maxSpreadPct: 2,
    minDepthScore: 0,
    majorPairMaxShare: 0.2,
  };

  const selected = allocateDiscoveryCandidates([
    candidate('major_a', 'LIQUID_LEADER', 95, true, 900_000_000),
    candidate('major_b', 'LIQUID_LEADER', 91, true, 850_000_000),
    candidate('anom_a', 'ANOMALY', 88, false, 70_000_000),
    candidate('anom_b', 'ANOMALY', 84, false, 60_000_000),
    candidate('anom_c', 'ANOMALY', 82, false, 55_000_000),
    candidate('stealth_a', 'STEALTH', 77, false, 25_000_000),
  ], settings, 10);

  assert.equal(selected.length, 5, 'Allocator should honor configured total slots');
  assert.ok(selected.some((item) => item.bucket === 'STEALTH'), 'Stealth slot must be represented');
  assert.ok(selected.filter((item) => item.bucket === 'ANOMALY').length >= 2, 'Anomaly slots must be filled');

  const majorCount = selected.filter((item) => item.majorPair).length;
  assert.equal(majorCount, 1, 'Major pair cap must be enforced');
  assert.ok(
    selected.some((item) => item.pair === 'anom_c'),
    'Fallback redistribution should choose best non-major candidate when capped majors are blocked',
  );

  console.log('PASS discovery_bucket_allocation_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_bucket_allocation_probe');
  console.error(error);
  process.exit(1);
});
