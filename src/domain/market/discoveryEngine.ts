import type { DiscoveryCandidate, DiscoverySettings } from '../../core/types';
import type { IndodaxOrderbook } from '../../integrations/indodax/publicApi';
import type { PairMetricSnapshot } from './pairUniverse';
import { allocateDiscoveryCandidates } from './discoveryAllocator';
import { scoreDiscoveryCandidate, type DiscoveryHistoryPoint } from './discoveryScorer';

export interface DiscoverySelectionResult {
  selected: DiscoveryCandidate[];
  depthByPair: Map<string, IndodaxOrderbook>;
}

interface DiscoveryEngineInput {
  metrics: PairMetricSnapshot[];
  settings: DiscoverySettings;
  limit: number;
  getPreviousPoint: (pair: string) => DiscoveryHistoryPoint | undefined;
  getDepth: (pair: string) => Promise<IndodaxOrderbook>;
}

function computePrefetchLimit(totalSlots: number, marketCount: number): number {
  const desired = Math.max(totalSlots * 3, totalSlots + 6);
  return Math.min(marketCount, desired);
}

export class DiscoveryEngine {
  async select(input: DiscoveryEngineInput): Promise<DiscoverySelectionResult> {
    const { metrics, settings, limit, getPreviousPoint, getDepth } = input;
    if (metrics.length === 0 || limit <= 0) {
      return { selected: [], depthByPair: new Map() };
    }

    const observedAt = Date.now();
    const initial = metrics
      .map((metric) => scoreDiscoveryCandidate({
        metric,
        observedAt,
        settings,
        previous: getPreviousPoint(metric.pair),
      }))
      .filter((item): item is DiscoveryCandidate => item !== null)
      .sort((a, b) => b.discoveryScore - a.discoveryScore);

    const configuredSlots = settings.slots.anomaly
      + settings.slots.rotation
      + settings.slots.stealth
      + settings.slots.liquidLeader;
    const targetSlots = Math.min(limit, configuredSlots > 0 ? configuredSlots : limit);
    const shortlist = initial.slice(0, computePrefetchLimit(targetSlots, initial.length));

    const depthByPair = new Map<string, IndodaxOrderbook>();
    await Promise.all(shortlist.map(async (candidate) => {
      const depth = await getDepth(candidate.pair);
      depthByPair.set(candidate.pair, depth);
    }));

    const metricsByPair = new Map(metrics.map((metric) => [metric.pair, metric]));
    const rescored = shortlist
      .map((candidate) => {
        const metric = metricsByPair.get(candidate.pair);
        if (!metric) {
          return null;
        }

        return scoreDiscoveryCandidate({
          metric,
          observedAt,
          settings,
          previous: getPreviousPoint(metric.pair),
          orderbook: depthByPair.get(metric.pair),
        });
      })
      .filter((item): item is DiscoveryCandidate => item !== null);

    const selected = allocateDiscoveryCandidates(rescored, settings, limit);
    const selectedDepth = new Map<string, IndodaxOrderbook>();
    for (const candidate of selected) {
      const depth = depthByPair.get(candidate.pair);
      if (depth) {
        selectedDepth.set(candidate.pair, depth);
      }
    }

    return {
      selected,
      depthByPair: selectedDepth,
    };
  }
}
