import type {
  MarketRegime,
  MicrostructureFeatures,
  PatternMatchResult,
  ProbabilityAssessment,
  SignalCandidate,
} from '../../core/types';
import { clamp } from '../../utils/math';
import { PATTERN_LIBRARY } from './patternLibrary';

export class PatternMatcher {
  match(input: {
    pair: string;
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    probability: ProbabilityAssessment;
    regime: MarketRegime;
  }): PatternMatchResult[] {
    return PATTERN_LIBRARY.map((pattern) => {
      const scoreFit = 1 - Math.min(1, Math.abs(input.signal.score - pattern.minScore) / 100);
      const accumulationFit = Math.min(
        1,
        input.microstructure.accumulationScore / Math.max(1, pattern.minAccumulation || 1),
      );
      const clusterFit = Math.min(
        1,
        input.microstructure.clusterScore / Math.max(1, pattern.minCluster || 1),
      );
      const spoofFit =
        pattern.maxSpoofRisk <= 0
          ? 1
          : Math.max(0, 1 - input.microstructure.spoofRiskScore / pattern.maxSpoofRisk);
      const probabilityFit = pattern.regime === 'TRAP_RISK' || pattern.regime === 'DISTRIBUTION'
        ? Math.min(1, input.probability.trapProbability / Math.max(0.1, pattern.maxTrapProbability))
        : Math.min(1, input.probability.pumpProbability / Math.max(0.1, pattern.minPumpProbability));
      const regimeFit = input.regime === pattern.regime ? 1 : 0.45;

      const similarity = clamp(
        (scoreFit * 0.2 +
          accumulationFit * 0.2 +
          clusterFit * 0.15 +
          spoofFit * 0.15 +
          probabilityFit * 0.15 +
          regimeFit * 0.15) * 100,
        0,
        100,
      );

      return {
        patternId: pattern.id,
        patternName: pattern.name,
        similarity,
        regime: pattern.regime,
        summary: `scoreFit=${scoreFit.toFixed(2)} accumulationFit=${accumulationFit.toFixed(2)} clusterFit=${clusterFit.toFixed(2)}`,
      };
    })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }
}