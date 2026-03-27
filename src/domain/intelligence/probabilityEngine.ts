import type {
  HistoricalContext,
  MicrostructureFeatures,
  ProbabilityAssessment,
  SignalCandidate,
} from '../../core/types';
import { clamp } from '../../utils/math';

export class ProbabilityEngine {
  assess(input: {
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    historicalContext: HistoricalContext;
  }): ProbabilityAssessment {
    const { signal, microstructure, historicalContext } = input;

    const rawPump =
      signal.score * 0.42 +
      signal.confidence * 100 * 0.2 +
      microstructure.accumulationScore * 0.12 +
      microstructure.clusterScore * 0.1 +
      microstructure.breakoutPressureScore * 0.08 +
      historicalContext.recentWinRate * 100 * 0.08;

    const rawTrap =
      microstructure.spoofRiskScore * 0.4 +
      microstructure.exhaustionRiskScore * 0.2 +
      historicalContext.recentFalseBreakRate * 100 * 0.2 +
      Math.max(0, signal.spreadPct - 0.5) * 25;

    const pumpProbability = clamp((rawPump - rawTrap * 0.3) / 100, 0, 1);
    const trapProbability = clamp(rawTrap / 100, 0, 1);
    const continuationProbability = clamp(
      pumpProbability * 0.65 +
        (microstructure.clusterScore / 100) * 0.2 +
        historicalContext.recentWinRate * 0.15,
      0,
      1,
    );

    const confidencePenalty =
      microstructure.tradeFlowSource === 'EXCHANGE_TRADE_FEED'
        ? 0
        : microstructure.tradeFlowSource === 'MIXED'
          ? 5
          : 8;

    const confidence =
      clamp(
        signal.confidence * 100 * 0.5 +
          microstructure.liquidityQualityScore * 0.2 +
          (1 - trapProbability) * 100 * 0.15 +
          (historicalContext.patternMatches[0]?.similarity ?? 0) * 0.15 -
          confidencePenalty,
        0,
        100,
      ) / 100;

    return {
      pumpProbability,
      continuationProbability,
      trapProbability,
      confidence,
    };
  }
}
