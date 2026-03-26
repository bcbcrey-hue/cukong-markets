import type {
  EdgeValidationResult,
  EntryTimingAssessment,
  HistoricalContext,
  MicrostructureFeatures,
  ProbabilityAssessment,
  ScoreContribution,
  SignalCandidate,
} from '../../core/types';

export interface ScoreExplanation {
  reasons: string[];
  warnings: string[];
  featureBreakdown: ScoreContribution[];
  riskContext: string[];
  historicalMatchSummary: string;
}

export class ScoreExplainer {
  build(input: {
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    probability: ProbabilityAssessment;
    historicalContext: HistoricalContext;
    validation: EdgeValidationResult;
    timing: EntryTimingAssessment;
  }): ScoreExplanation {
    const { signal, microstructure, probability, historicalContext, validation, timing } = input;

    const featureBreakdown: ScoreContribution[] = [
      ...signal.contributions,
      {
        feature: 'accumulationScore',
        weight: 14,
        contribution: microstructure.accumulationScore / 5,
        note: 'absorpsi bid dan kompresi harga',
      },
      {
        feature: 'clusterScore',
        weight: 10,
        contribution: microstructure.clusterScore / 6,
        note:
          microstructure.tradeFlowQuality === 'PROXY'
            ? 'trade burst/aggression berbasis proxy inferred snapshot'
            : 'trade burst dan directional aggression dari tape',
      },
      {
        feature: 'spoofRiskPenalty',
        weight: -16,
        contribution: -(microstructure.spoofRiskScore / 6),
        note: 'penalti anti-spoof dan fake wall',
      },
      {
        feature: 'pumpProbability',
        weight: 18,
        contribution: probability.pumpProbability * 18,
        note: 'probabilitas continuation/pump',
      },
      {
        feature: 'entryTiming',
        weight: 8,
        contribution: timing.quality / 12.5,
        note: timing.reason,
      },
    ];

    const reasons = [
      ...signal.reasons,
      ...(microstructure.accumulationScore >= 55 ? ['absorpsi dan support tersembunyi terdeteksi'] : []),
      ...(microstructure.clusterScore >= 35
        ? [
            microstructure.tradeFlowQuality === 'PROXY'
              ? 'proxy trade clustering mendukung continuation (akurasi terbatas)'
              : 'trade clustering mendukung continuation',
          ]
        : []),
      ...(probability.pumpProbability >= 0.65 ? ['pump probability sudah di atas baseline auto'] : []),
      ...(historicalContext.patternMatches[0]
        ? [`mirip pola ${historicalContext.patternMatches[0].patternName}`]
        : []),
    ];

    const warnings = [
      ...signal.warnings,
      ...(microstructure.spoofRiskScore >= 45
        ? [
            microstructure.tradeFlowQuality === 'PROXY'
              ? 'spoof/fake wall risk meningkat (follow-through berbasis proxy)'
              : 'spoof/fake wall risk mulai meningkat',
          ]
        : []),
      ...validation.warnings,
      ...(timing.state === 'LATE' ? ['timing sudah mulai terlambat'] : []),
      ...(timing.state === 'AVOID' ? ['timing sebaiknya dihindari'] : []),
      ...(timing.state === 'CHASING' ? ['setup sudah masuk area chasing'] : []),
      ...(timing.state === 'DEAD' ? ['setup dianggap mati untuk entry batch ini'] : []),
    ];

    const riskContext = [
      `spread=${signal.spreadPct.toFixed(3)}%`,
      `liquidityScore=${signal.liquidityScore.toFixed(1)}`,
      `spoofRisk=${microstructure.spoofRiskScore.toFixed(1)}`,
      `trapProbability=${(probability.trapProbability * 100).toFixed(1)}%`,
      `tradeFlowSource=${microstructure.tradeFlowSource}`,
      ...validation.reasons,
    ];

    const historicalMatchSummary = historicalContext.patternMatches.length > 0
      ? historicalContext.patternMatches
          .map((item) => `${item.patternName}(${item.similarity.toFixed(0)}%)`)
          .join(', ')
      : 'belum ada pola historis kuat';

    return {
      reasons,
      warnings,
      featureBreakdown,
      riskContext,
      historicalMatchSummary,
    };
  }
}
