import { env } from '../../config/env';
import type { MarketSnapshot, OpportunityAssessment, SignalCandidate } from '../../core/types';
import { clamp } from '../../utils/math';
import { PairHistoryStore } from '../history/pairHistoryStore';
import type { WorkerPoolService } from '../../services/workerPoolService';
import { EdgeValidator } from './edgeValidator';
import { EntryTimingEngine } from './entryTimingEngine';
import { FeaturePipeline } from './featurePipeline';
import { FutureTrendingPredictionEngine } from './futureTrendingPredictionEngine';
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
    private readonly workerPool?: WorkerPoolService,
    private readonly predictionEngine = new FutureTrendingPredictionEngine(),
  ) {}

  async assess(
    snapshot: MarketSnapshot,
    signal: SignalCandidate,
  ): Promise<OpportunityAssessment> {
    const recentSnapshots = this.history.getRecentSnapshots(snapshot.pair, 20);
    const microstructure = this.workerPool
      ? await this.workerPool.runFeatureTask({
          snapshot,
          signal,
          recentSnapshots,
        })
      : this.featurePipeline.build(snapshot, signal, recentSnapshots);
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
    const prediction = this.predictionEngine.predict({
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
      signal.score * 0.58 +
        probability.pumpProbability * 24 +
        probability.continuationProbability * 20 -
        probability.trapProbability * 30 -
        microstructure.spoofRiskScore * 0.08 +
        microstructure.accumulationScore * 0.1 +
        microstructure.clusterScore * 0.06 +
        signal.breakoutPressure * 1.8 +
        signal.quoteFlowAccelerationScore * 0.22 +
        (validation.valid ? 6 : -6) +
        (prediction.strength === 'STRONG' ? (prediction.direction === 'UP' ? 2.8 : -2.8) : 0) +
        (prediction.strength === 'WEAK' ? -0.8 : 0) +
        timing.quality * 0.14,
      0,
      100,
    );

    // Tahap 0E: ini hanya hint context (pre-decision), bukan final business decision entry.
    let recommendedAction: OpportunityAssessment['recommendedAction'] = 'WATCH';
    let entryStyle: OpportunityAssessment['entryStyle'];
    let pumpState: OpportunityAssessment['pumpState'] = 'PRE_PUMP';

    const lowTimeToTrigger =
      signal.breakoutPressure >= 6 && signal.quoteFlowAccelerationScore >= 28 && signal.change1m < 1.2;
    const microThinHealthy =
      signal.spreadPct <= 0.75 &&
      (signal.bidDepthTop10 ?? 0) > 0 &&
      (signal.askDepthTop10 ?? 0) > 0 &&
      (signal.bidDepthTop10 ?? 0) >= (signal.askDepthTop10 ?? 0) * 1.08;
    const prePumpPressureValid =
      probability.pumpProbability >= 0.61 &&
      signal.breakoutPressure >= 6 &&
      signal.quoteFlowAccelerationScore >= 24;
    const notOverextended =
      signal.change1m <= 1.4 && signal.change5m <= 3.8 && microstructure.exhaustionRiskScore < 55;
    const continuationStrong =
      probability.continuationProbability >= 0.58 &&
      signal.quoteFlowAccelerationScore >= 22 &&
      microstructure.clusterScore >= 28;
    const continuationBroken =
      probability.continuationProbability < 0.5 ||
      signal.quoteFlowAccelerationScore < 18 ||
      microstructure.clusterScore < 22;

    if (probability.trapProbability >= 0.52 || microstructure.spoofRiskScore >= 65) {
      pumpState = 'DUMP_RISK';
    } else if (!notOverextended) {
      pumpState = 'OVEREXTENDED';
    } else if (continuationStrong) {
      pumpState = 'CONTINUATION';
    }

    if (!validation.valid || ['DEAD', 'AVOID'].includes(timing.state)) {
      recommendedAction = 'AVOID';
      entryStyle = 'DEAD';
    } else if (timing.state === 'CHASING') {
      recommendedAction = signal.score >= 62 ? 'WATCH' : 'AVOID';
      entryStyle = 'LATE';
    } else if (
      timing.state === 'SCOUT_WINDOW' &&
      microThinHealthy &&
      prePumpPressureValid &&
      lowTimeToTrigger &&
      notOverextended &&
      probability.confidence >= env.confidenceThresholdAuto * 0.9
    ) {
      recommendedAction = 'SCOUT_ENTER';
      entryStyle = 'SCOUT';
    } else if (
      timing.state === 'CONFIRM_WINDOW' &&
      continuationStrong &&
      notOverextended &&
      !continuationBroken &&
      probability.confidence >= env.confidenceThresholdAuto * 0.95
    ) {
      recommendedAction = 'ADD_ON_CONFIRM';
      entryStyle = 'CONFIRM';
    } else if (continuationStrong && notOverextended) {
      recommendedAction = 'CONFIRM_ENTRY';
    } else if (signal.score >= 60) {
      recommendedAction = 'PREPARE_ENTRY';
    }

    if (microstructure.spoofRiskScore >= 60) {
      await this.history.recordAnomaly(snapshot.pair, 'SPOOF_RISK', {
        spoofRiskScore: microstructure.spoofRiskScore,
        tradeFlowSource: microstructure.tradeFlowSource,
        tradeFlowQuality: microstructure.tradeFlowQuality,
      });
    }

    if (timing.state === 'CHASING' || timing.state === 'LATE') {
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
      discoveryBucket: signal.discoveryBucket,
      pairClass: signal.pairClass,
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
      quoteFlowAccelerationScore: signal.quoteFlowAccelerationScore,
      orderbookImbalance: signal.orderbookImbalance,
      change1m: signal.change1m,
      change5m: signal.change5m,
      entryTiming: timing,
      reasons: explanation.reasons,
      warnings: explanation.warnings,
      featureBreakdown: explanation.featureBreakdown,
      historicalContext,
      recommendedAction,
      entryStyle,
      pumpState,
      lastContinuationScore: probability.continuationProbability,
      lastDumpRisk: probability.trapProbability,
      riskContext: explanation.riskContext,
      historicalMatchSummary: explanation.historicalMatchSummary,
      referencePrice: signal.marketPrice,
      bestBid: signal.bestBid,
      bestAsk: signal.bestAsk,
      spreadBps: signal.spreadBps,
      bidDepthTop10: signal.bidDepthTop10,
      askDepthTop10: signal.askDepthTop10,
      depthScore: signal.depthScore,
      orderbookTimestamp: signal.orderbookTimestamp,
      spreadPct: signal.spreadPct,
      liquidityScore: signal.liquidityScore,
      prediction,
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
