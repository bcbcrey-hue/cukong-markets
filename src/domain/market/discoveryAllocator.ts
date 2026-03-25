import type { DiscoveryBucket, DiscoveryCandidate, DiscoverySettings } from '../../core/types';

const BUCKET_ORDER: DiscoveryBucket[] = ['ANOMALY', 'ROTATION', 'STEALTH', 'LIQUID_LEADER'];

function getBucketSlots(settings: DiscoverySettings): Record<DiscoveryBucket, number> {
  return {
    ANOMALY: Math.max(0, settings.slots.anomaly),
    ROTATION: Math.max(0, settings.slots.rotation),
    STEALTH: Math.max(0, settings.slots.stealth),
    LIQUID_LEADER: Math.max(0, settings.slots.liquidLeader),
  };
}

export function allocateDiscoveryCandidates(
  candidates: DiscoveryCandidate[],
  settings: DiscoverySettings,
  limit: number,
): DiscoveryCandidate[] {
  if (limit <= 0 || candidates.length === 0) {
    return [];
  }

  const sorted = [...candidates].sort((a, b) => b.discoveryScore - a.discoveryScore);
  const slotPlan = getBucketSlots(settings);
  const configuredSlots = BUCKET_ORDER.reduce((sum, bucket) => sum + slotPlan[bucket], 0);
  const targetCount = Math.min(limit, configuredSlots > 0 ? configuredSlots : limit);
  const majorCap = Math.max(0, Math.floor(targetCount * settings.majorPairMaxShare));
  const grouped = {
    ANOMALY: sorted.filter((item) => item.bucket === 'ANOMALY'),
    ROTATION: sorted.filter((item) => item.bucket === 'ROTATION'),
    STEALTH: sorted.filter((item) => item.bucket === 'STEALTH'),
    LIQUID_LEADER: sorted.filter((item) => item.bucket === 'LIQUID_LEADER'),
  };

  const selected: DiscoveryCandidate[] = [];
  const selectedPairs = new Set<string>();
  let majorCount = 0;

  const pushCandidate = (candidate: DiscoveryCandidate): boolean => {
    if (selectedPairs.has(candidate.pair)) {
      return false;
    }

    if (candidate.majorPair && majorCount >= majorCap) {
      return false;
    }

    selected.push(candidate);
    selectedPairs.add(candidate.pair);
    if (candidate.majorPair) {
      majorCount += 1;
    }

    return true;
  };

  for (const bucket of BUCKET_ORDER) {
    const bucketSlots = slotPlan[bucket];
    if (bucketSlots <= 0) {
      continue;
    }

    for (const candidate of grouped[bucket]) {
      if (selected.length >= targetCount) {
        break;
      }
      if (selected.filter((item) => item.bucket === bucket).length >= bucketSlots) {
        break;
      }
      pushCandidate(candidate);
    }
  }

  if (selected.length < targetCount) {
    for (const candidate of sorted) {
      if (selected.length >= targetCount) {
        break;
      }
      pushCandidate(candidate);
    }
  }

  return selected;
}
