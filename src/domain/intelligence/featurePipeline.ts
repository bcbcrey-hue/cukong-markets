import type {
  MarketSnapshot,
  MicrostructureFeatures,
  SignalCandidate,
} from '../../core/types';
import { clamp } from '../../utils/math';
import {
  detectAccumulation,
} from '../microstructure/accumulationDetector';
import { detectIceberg } from '../microstructure/icebergDetector';
import { detectSpoofing } from '../microstructure/spoofDetector';
import { detectTradeClusters } from '../microstructure/tradeClusterDetector';

export class FeaturePipeline {
  build(
    snapshot: MarketSnapshot,
    signal: SignalCandidate,
    recentSnapshots: MarketSnapshot[],
  ): MicrostructureFeatures {
    const accumulation = detectAccumulation(snapshot, recentSnapshots);
    const spoof = detectSpoofing(snapshot, recentSnapshots);
    const iceberg = detectIceberg(snapshot, recentSnapshots);
    const clusters = detectTradeClusters(snapshot);

    const liquidityQualityScore = clamp(
      signal.liquidityScore * 0.65 + Math.max(0, 1.25 - signal.spreadPct) * 24,
      0,
      100,
    );

    const exhaustionRiskScore = clamp(
      Math.max(0, signal.change5m - 3.5) * 14 + Math.max(0, signal.change1m - 1.2) * 12,
      0,
      100,
    );

    return {
      pair: snapshot.pair,
      accumulationScore: accumulation.accumulationScore,
      spoofRiskScore: spoof.spoofRiskScore,
      icebergScore: iceberg.icebergScore,
      clusterScore: clusters.clusterScore,
      aggressionBias: clusters.aggressionBias,
      sweepScore: clusters.sweepDetected ? clusters.clusterScore : clusters.clusterScore * 0.55,
      breakoutPressureScore: signal.breakoutPressure,
      volumeAccelerationScore: signal.volumeAcceleration,
      liquidityQualityScore,
      spreadScore: clamp(Math.max(0, 1.2 - signal.spreadPct) * 60, 0, 100),
      exhaustionRiskScore,
      timestamp: snapshot.timestamp,
      evidence: [
        ...accumulation.absorptionEvidence,
        ...spoof.evidence,
        ...iceberg.evidence,
        ...clusters.evidence,
      ],
    };
  }
}