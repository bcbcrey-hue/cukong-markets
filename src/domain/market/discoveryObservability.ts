import type { DiscoveryObservabilitySummary, DiscoverySettings } from '../../core/types';

export function buildDiscoveryObservabilityNotes(
  summary: DiscoveryObservabilitySummary | null,
  settings: DiscoverySettings,
): string[] {
  if (!summary) {
    return ['discoverySummary=unavailable'];
  }

  return [
    `discoverySlots=anomaly:${summary.slotPlan.anomaly},rotation:${summary.slotPlan.rotation},stealth:${summary.slotPlan.stealth},liquidLeader:${summary.slotPlan.liquidLeader}`,
    `discoveryPassedMajor=${summary.passed.majorPair}`,
    `discoveryPassedAnomaly=${summary.passed.anomaly}`,
    `discoveryRejectedSpread=${summary.rejected.spread}`,
    `discoveryRejectedDepth=${summary.rejected.depth}`,
    `discoveryMajorPairMaxShare=${settings.majorPairMaxShare}`,
  ];
}
