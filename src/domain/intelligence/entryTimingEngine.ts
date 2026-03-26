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

    if (
      microstructure.spoofRiskScore >= 68 ||
      signal.spreadPct > 1.8 ||
      probability.trapProbability >= 0.62
    ) {
      return {
        state: 'DEAD',
        quality: 8,
        reason: 'setup rusak: spoof/trap/spread terlalu berat',
        leadScore: 0,
        entryStyle: 'DEAD',
      };
    }

    if (
      microstructure.exhaustionRiskScore >= 60 ||
      signal.change5m >= 4.5 ||
      signal.change1m >= 1.8
    ) {
      return {
        state: 'CHASING',
        quality: 28,
        reason: 'harga sudah terlalu lanjut, rawan entry chasing',
        leadScore: 18,
        entryStyle: 'CHASING',
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

    if (
      leadScore >= 62 &&
      probability.pumpProbability >= 0.6 &&
      signal.change1m <= 1.1 &&
      microstructure.accumulationScore >= 52
    ) {
      return {
        state: 'SCOUT_WINDOW',
        quality: 78,
        reason: 'pre-pump pressure sehat, cocok untuk scout entry kecil',
        leadScore,
        entryStyle: 'SCOUT',
      };
    }

    if (
      leadScore >= 56 &&
      probability.continuationProbability >= 0.56 &&
      signal.change1m <= 1.5
    ) {
      return {
        state: 'CONFIRM_WINDOW',
        quality: 70,
        reason: 'continuation cukup kuat untuk add-on confirm',
        leadScore,
        entryStyle: 'CONFIRM',
      };
    }

    if (leadScore >= 50) {
      return {
        state: 'READY',
        quality: 58,
        reason: 'sinyal layak pantau, tetapi belum cukup kuat untuk scout/confirm',
        leadScore,
      };
    }

    return {
      state: 'DEAD',
      quality: 24,
      reason: 'timing belum punya lead yang bisa dieksekusi',
      leadScore,
      entryStyle: 'DEAD',
    };
  }
}
