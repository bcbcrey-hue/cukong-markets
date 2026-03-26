import type { DiscoveryBucketType, DiscoverySettings } from '../../core/types';
import type { DiscoveryRankedCandidate } from './discoveryScorer';

const BUCKETS: DiscoveryBucketType[] = ['ANOMALY', 'STEALTH', 'ROTATION', 'LIQUID_LEADER'];

export class DiscoveryAllocator {
  allocate(
    candidates: DiscoveryRankedCandidate[],
    limit: number,
    settings: DiscoverySettings,
  ): DiscoveryRankedCandidate[] {
    const safeLimit = Math.max(0, limit);
    if (safeLimit === 0 || candidates.length === 0) {
      return [];
    }

    const slotsByBucket: Record<DiscoveryBucketType, number> = {
      ANOMALY: settings.anomalySlots,
      ROTATION: settings.rotationSlots,
      STEALTH: settings.stealthSlots,
      LIQUID_LEADER: settings.liquidLeaderSlots,
    };

    const majorCap = Math.max(0, Math.min(safeLimit, Math.floor(safeLimit * settings.majorPairMaxShare)));
    let majorUsed = 0;

    const byBucket = new Map<DiscoveryBucketType, DiscoveryRankedCandidate[]>();
    for (const bucket of BUCKETS) {
      byBucket.set(
        bucket,
        candidates
          .filter((item) => item.bucket === bucket)
          .sort((a, b) => {
            if (a.majorPair !== b.majorPair) {
              return Number(a.majorPair) - Number(b.majorPair);
            }
            return b.discoveryScore - a.discoveryScore;
          }),
      );
    }

    const selected: DiscoveryRankedCandidate[] = [];
    const selectedPairs = new Set<string>();

    const pushCandidate = (candidate: DiscoveryRankedCandidate): boolean => {
      if (selectedPairs.has(candidate.pair)) {
        return false;
      }

      if (candidate.majorPair && majorUsed >= majorCap) {
        return false;
      }

      selected.push(candidate);
      selectedPairs.add(candidate.pair);
      if (candidate.majorPair) {
        majorUsed += 1;
      }
      return true;
    };

    for (const bucket of BUCKETS) {
      const bucketSlots = Math.min(slotsByBucket[bucket], safeLimit);
      const candidatesInBucket = byBucket.get(bucket) ?? [];
      let taken = 0;

      for (const candidate of candidatesInBucket) {
        if (selected.length >= safeLimit || taken >= bucketSlots) {
          break;
        }

        if (pushCandidate(candidate)) {
          taken += 1;
        }
      }
    }

    const remaining = [...candidates].sort((a, b) => {
      if (a.majorPair !== b.majorPair) {
        return Number(a.majorPair) - Number(b.majorPair);
      }
      return b.discoveryScore - a.discoveryScore;
    });
    for (const candidate of remaining) {
      if (selected.length >= safeLimit) {
        break;
      }
      pushCandidate(candidate);
    }

    return selected;
  }
}
