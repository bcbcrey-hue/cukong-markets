import type {
  EdgeValidationResult,
  EntryTimingState,
  HistoricalContext,
  MicrostructureFeatures,
  ProbabilityAssessment,
  SignalCandidate,
} from '../../core/types';

export class EdgeValidator {
  validate(input: {
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    probability: ProbabilityAssessment;
    historicalContext: HistoricalContext;
    timingState: EntryTimingState;
  }): EdgeValidationResult {
    const { signal, microstructure, probability, historicalContext, timingState } = input;
    const reasons: string[] = [];
    const warnings: string[] = [];

    const blockedBySpoof = microstructure.spoofRiskScore >= 55;
    const blockedBySpread = signal.spreadPct > 1.25;
    const blockedByLiquidity = signal.liquidityScore < 20;
    const blockedByTiming = timingState === 'LATE' || timingState === 'AVOID';

    const confirmations = [
      signal.score >= 70,
      microstructure.accumulationScore >= 50,
      microstructure.clusterScore >= 30,
      signal.breakoutPressure >= 6,
      signal.quoteFlowAccelerationScore >= 25,
      probability.pumpProbability >= 0.65,
      historicalContext.patternMatches[0]?.similarity >= 65,
    ].filter(Boolean).length;

    if (blockedBySpoof) {
      reasons.push('spoof risk melampaui batas aman');
    }

    if (blockedBySpread) {
      reasons.push('spread pair masih terlalu lebar');
    }

    if (blockedByLiquidity) {
      reasons.push('likuiditas pair masih terlalu tipis');
    }

    if (blockedByTiming) {
      reasons.push('timing entry belum layak dieksekusi');
    }

    if (confirmations < 3) {
      reasons.push('konfirmasi edge belum cukup beragam');
    }

    if (historicalContext.recentFalseBreakRate >= 0.4) {
      warnings.push('pair punya false-break tendency cukup tinggi');
    }

    if (probability.trapProbability >= 0.5) {
      warnings.push('trap probability meningkat');
    }
    if (microstructure.tradeFlowQuality === 'PROXY') {
      warnings.push('validasi edge memakai proxy trade-flow inferred, bukan tape trade riil');
    }


    return {
      valid:
        !blockedBySpoof &&
        !blockedBySpread &&
        !blockedByLiquidity &&
        !blockedByTiming &&
        confirmations >= 3,
      reasons,
      warnings,
      blockedBySpoof,
      blockedBySpread,
      blockedByLiquidity,
      blockedByTiming,
    };
  }
}