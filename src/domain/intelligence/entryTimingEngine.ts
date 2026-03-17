import type {
  EntryTimingAssessment,
  HistoricalContext,
  MicrostructureFeatures,
  ProbabilityAssessment,
  SignalCandidate,
} from '../../core/types';
import { clamp } from '../../utils/math';

export class EntryTimingEngine {
  assess(input: {
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    probability: ProbabilityAssessment;
    historicalContext: HistoricalContext;
  }): EntryTimingAssessment {
    const { signal, microstructure, probability, historicalContext } = input;

    if (microstructure.spoofRiskScore >= 60 || signal.spreadPct > 1.5) {
      return {
        state: 'AVOID',
        quality: 10,
        reason: 'spoof risk/spread tidak mendukung entry',
        leadScore: 0,
      };
    }

    if (microstructure.exhaustionRiskScore >= 60 || signal.change5m >= 4.5) {
      return {
        state: 'LATE',
        quality: 28,
        reason: 'move sudah terlalu lanjut dan rawan exhaustion',
        leadScore: 18,
      };
    }

    const leadScore = clamp(
      microstructure.accumulationScore * 0.35 +
        microstructure.clusterScore * 0.25 +
        signal.breakoutPressure * 3 +
        probability.pumpProbability * 20 +
        historicalContext.recentWinRate * 20,
      0,
      100,
    );

    if (leadScore >= 64 && signal.change1m <= 1.2) {
      return {
        state: 'EARLY',
        quality: 78,
        reason: 'akumulasi dan cluster kuat, entry masih relatif dini',
        leadScore,
      };
    }

    if (leadScore >= 55) {
      return {
        state: 'READY',
        quality: 70,
        reason: 'konfirmasi cukup matang untuk entry terukur',
        leadScore,
      };
    }

    return {
      state: 'AVOID',
      quality: 24,
      reason: 'timing belum cukup matang dan belum ada lead jelas',
      leadScore,
    };
  }
}