import { env } from '../../config/env';
import type { MarketSnapshot, OpportunityAssessment, SignalCandidate } from '../../core/types';
import { clamp } from '../../utils/math';
import { PairHistoryStore } from '../history/pairHistoryStore';
import { EdgeValidator } from './edgeValidator';
import { EntryTimingEngine } from './entryTimingEngine';
import { FeaturePipeline } from './featurePipeline';
import { ProbabilityEngine } from './probabilityEngine';
import { ScoreExplainer } from './scoreExplainer';

export class OpportunityEngine {
  constructor(
    private readonly history: PairHistoryStore,
    private readonly featurePipeline = new FeaturePipeline(),
    private readonly probabilityEngine = new ProbabilityEngine(),
    private readonly edgeValidator = new EdgeValidator(),
    private readonly scoreExplainer = new ScoreExplainer(),
    private readonly entryTimingEngine = new EntryTimingEngine(),
  ) {}

  async assess(
    snapshot: MarketSnapshot,
    signal: SignalCandidate,
  ): Promise<OpportunityAssessment> {
    const recentSnapshots = this.history.getRecentSnapshots(snapshot.pair, 20);
    const microstructure = this.featurePipeline.build(snapshot, signal, recentSnapshots);
    const historicalContext = await this.history.buildContext(
      snapshot.pair,
      signal,
      microstructure,
    );
    const probability = this.probabilityEngine.assess({
      signal,
      microstructure,
      historicalContext,
    });
    const timing = this.entryTimingEngine.assess({
      signal,
      microstructure,
      probability,
      historicalContext,
    });
    const validation = this.edgeValidator.validate({
      signal,
      microstructure,
      probability,
      historicalContext,
      timingState: timing.state,
    });
    const explanation = this.scoreExplainer.build({
      signal,
      microstructure,
      probability,
      historicalContext,
      validation,
      timing,
    });

    const finalScore = clamp(
      signal.score * 0.72 +
        probability.pumpProbability * 20 +
        probability.continuationProbability * 12 -
        probability.trapProbability * 24 -
        microstructure.spoofRiskScore * 0.12 +
        (validation.valid ? 6 : -6) +
        timing.quality * 0.1,
      0,
      100,
    );

    let recommendedAction: OpportunityAssessment['recommendedAction'] = 'WATCH';

    if (!validation.valid || timing.state === 'AVOID') {
      recommendedAction = 'AVOID';
    } else if (
      probability.pumpProbability >= env.probabilityThresholdAuto &&
      probability.confidence >= env.confidenceThresholdAuto &&
      ['EARLY', 'READY'].includes(timing.state)
    ) {
      recommendedAction = 'ENTER';
    } else if (probability.pumpProbability >= 0.62) {
      recommendedAction = 'CONFIRM_ENTRY';
    } else if (signal.score >= 60) {
      recommendedAction = 'PREPARE_ENTRY';
    }

    if (microstructure.spoofRiskScore >= 60) {
      await this.history.recordAnomaly(snapshot.pair, 'SPOOF_RISK', {
        spoofRiskScore: microstructure.spoofRiskScore,
      });
    }

    if (timing.state === 'LATE') {
      await this.history.recordAnomaly(snapshot.pair, 'LATE_ENTRY', {
        change1m: signal.change1m,
        change5m: signal.change5m,
      });
    }

    if (!validation.valid) {
      await this.history.recordAnomaly(snapshot.pair, 'EDGE_REJECTED', {
        reasons: validation.reasons,
      });
    }

    return {
      pair: snapshot.pair,
      rawScore: signal.score,
      finalScore,
      confidence: probability.confidence,
      pumpProbability: probability.pumpProbability,
      continuationProbability: probability.continuationProbability,
      trapProbability: probability.trapProbability,
      spoofRisk: microstructure.spoofRiskScore / 100,
      edgeValid: validation.valid,
      marketRegime: historicalContext.regime,
      breakoutPressure: signal.breakoutPressure,
      volumeAcceleration: signal.volumeAcceleration,
      orderbookImbalance: signal.orderbookImbalance,
      change1m: signal.change1m,
      change5m: signal.change5m,
      entryTiming: timing,
      reasons: explanation.reasons,
      warnings: explanation.warnings,
      featureBreakdown: explanation.featureBreakdown,
      historicalContext,
      recommendedAction,
      riskContext: explanation.riskContext,
      historicalMatchSummary: explanation.historicalMatchSummary,
      referencePrice: signal.marketPrice,
      bestBid: signal.bestBid,
      bestAsk: signal.bestAsk,
      spreadPct: signal.spreadPct,
      liquidityScore: signal.liquidityScore,
      timestamp: snapshot.timestamp,
    };
  }

  async assessMany(
    snapshots: MarketSnapshot[],
    signals: SignalCandidate[],
  ): Promise<OpportunityAssessment[]> {
    const byPair = new Map(signals.map((signal) => [signal.pair, signal] as const));
    const opportunities: OpportunityAssessment[] = [];

    for (const snapshot of snapshots) {
      const signal = byPair.get(snapshot.pair);
      if (!signal) {
        continue;
      }

      opportunities.push(await this.assess(snapshot, signal));
    }

    return opportunities.sort((a, b) => b.finalScore - a.finalScore);
  }
}