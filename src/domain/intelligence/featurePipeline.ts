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

    const tradeFlowSource = snapshot.recentTradesSource;
    const tradeFlowQuality =
      tradeFlowSource === 'EXCHANGE_TRADE_FEED'
        ? 'TAPE'
        : 'PROXY';

    const tradeFlowEvidence: string[] = [];
    if (tradeFlowSource === 'EXCHANGE_TRADE_FEED') {
      tradeFlowEvidence.push('trade-flow microstructure berbasis tape trade exchange (truth)');
    } else if (tradeFlowSource === 'MIXED') {
      tradeFlowEvidence.push(
        'trade-flow microstructure MIXED: tape exchange coverage tipis ditambah fallback proxy inferred',
      );
    } else if (tradeFlowSource === 'INFERRED_PROXY') {
      tradeFlowEvidence.push(
        'trade-flow microstructure berbasis proxy inferred dari delta snapshot, bukan tape riil',
      );
    } else {
      tradeFlowEvidence.push(
        'trade-flow microstructure tidak memiliki tape exchange; quality diturunkan konservatif',
      );
    }

    return {
      pair: snapshot.pair,
      accumulationScore: accumulation.accumulationScore,
      spoofRiskScore: spoof.spoofRiskScore,
      icebergScore: iceberg.icebergScore,
      clusterScore: clusters.clusterScore,
      aggressionBias: clusters.aggressionBias,
      sweepScore: clusters.sweepDetected ? clusters.clusterScore : clusters.clusterScore * 0.55,
      breakoutPressureScore: signal.breakoutPressure,
      quoteFlowAccelerationScore: signal.quoteFlowAccelerationScore,
      liquidityQualityScore,
      spreadScore: clamp(Math.max(0, 1.2 - signal.spreadPct) * 60, 0, 100),
      exhaustionRiskScore,
      timestamp: snapshot.timestamp,
      evidence: [
        ...accumulation.absorptionEvidence,
        ...spoof.evidence,
        ...iceberg.evidence,
        ...clusters.evidence,
        ...tradeFlowEvidence,
      ],
      tradeFlowSource,
      tradeFlowQuality,
    };
  }
}
