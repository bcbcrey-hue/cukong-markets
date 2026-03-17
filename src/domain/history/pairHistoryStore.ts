import { env } from '../../config/env';
import type {
  HistoricalContext,
  MarketSnapshot,
  MicrostructureFeatures,
  OpportunityAssessment,
  SignalCandidate,
} from '../../core/types';
import { PersistenceService } from '../../services/persistenceService';
import { PatternMatcher } from './patternMatcher';
import { RegimeClassifier } from './regimeClassifier';

type AnomalyEntry = {
  pair: string;
  type: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export class PairHistoryStore {
  private readonly snapshots = new Map<string, MarketSnapshot[]>();
  private readonly signals = new Map<string, SignalCandidate[]>();
  private readonly opportunities = new Map<string, OpportunityAssessment[]>();
  private readonly anomalies = new Map<string, AnomalyEntry[]>();

  constructor(
    private readonly persistence: PersistenceService,
    private readonly regimeClassifier = new RegimeClassifier(),
    private readonly patternMatcher = new PatternMatcher(),
  ) {}

  private pushLimited<T>(target: Map<string, T[]>, pair: string, value: T): void {
    const current = target.get(pair) ?? [];
    current.push(value);
    while (current.length > env.scannerHistoryLimit) {
      current.shift();
    }
    target.set(pair, current);
  }

  async recordSnapshot(snapshot: MarketSnapshot): Promise<void> {
    this.pushLimited(this.snapshots, snapshot.pair, snapshot);
    await this.persistence.appendPairHistory({
      type: 'snapshot',
      pair: snapshot.pair,
      snapshot,
      recordedAt: new Date().toISOString(),
    });
  }

  async recordSignal(signal: SignalCandidate): Promise<void> {
    this.pushLimited(this.signals, signal.pair, signal);
    await this.persistence.appendPairHistory({
      type: 'signal',
      pair: signal.pair,
      signal,
      recordedAt: new Date().toISOString(),
    });
  }

  async recordOpportunity(opportunity: OpportunityAssessment): Promise<void> {
    this.pushLimited(this.opportunities, opportunity.pair, opportunity);
    await this.persistence.appendPairHistory({
      type: 'opportunity',
      pair: opportunity.pair,
      opportunity,
      recordedAt: new Date().toISOString(),
    });
  }

  async recordAnomaly(
    pair: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const entry: AnomalyEntry = {
      pair,
      type,
      createdAt: new Date().toISOString(),
      payload,
    };

    this.pushLimited(this.anomalies, pair, entry);
    await this.persistence.appendAnomalyEvent(entry);
  }

  async recordPatternOutcome(
    pair: string,
    outcome: Record<string, unknown>,
  ): Promise<void> {
    await this.persistence.appendPatternOutcome({
      pair,
      recordedAt: new Date().toISOString(),
      ...outcome,
    });
  }

  getRecentSnapshots(pair: string, limit = 20): MarketSnapshot[] {
    return [...(this.snapshots.get(pair) ?? [])].slice(-limit);
  }

  getRecentSignals(pair: string, limit = 20): SignalCandidate[] {
    return [...(this.signals.get(pair) ?? [])].slice(-limit);
  }

  getRecentOpportunities(pair: string, limit = 20): OpportunityAssessment[] {
    return [...(this.opportunities.get(pair) ?? [])].slice(-limit);
  }

  async buildContext(
    pair: string,
    signal: SignalCandidate,
    microstructure: MicrostructureFeatures,
  ): Promise<HistoricalContext> {
    const snapshots = this.getRecentSnapshots(pair, 25);
    const signals = this.getRecentSignals(pair, 25);
    const opportunities = this.getRecentOpportunities(pair, 25);
    const anomalies = this.anomalies.get(pair) ?? [];

    const regime = this.regimeClassifier.classify({ snapshots, signals: [...signals, signal] });

    const estimatedPumpProbability = Math.min(1, signal.score / 100);
    const estimatedTrapProbability = Math.min(1, microstructure.spoofRiskScore / 100);

    const patternMatches = this.patternMatcher.match({
      pair,
      signal,
      microstructure,
      probability: {
        pumpProbability: estimatedPumpProbability,
        continuationProbability: estimatedPumpProbability * 0.8,
        trapProbability: estimatedTrapProbability,
        confidence: signal.confidence,
      },
      regime,
    });

    const contextNotes: string[] = [];
    if (snapshots.length < 5) {
      contextNotes.push('history pair masih dangkal, confidence perlu dijaga');
    }
    if (anomalies.length > 0) {
      contextNotes.push(`ada ${anomalies.length} anomaly event recent`);
    }
    if (patternMatches[0]) {
      contextNotes.push(`pattern terdekat: ${patternMatches[0].patternName}`);
    }

    const recentWinRate =
      opportunities.length > 0
        ? opportunities.filter((item) => item.edgeValid).length / opportunities.length
        : 0;

    const recentFalseBreakRate =
      opportunities.length > 0
        ? opportunities.filter((item) => item.trapProbability >= 0.55).length /
          opportunities.length
        : 0;

    return {
      pair,
      snapshotCount: snapshots.length,
      anomalyCount: anomalies.length,
      recentWinRate,
      recentFalseBreakRate,
      regime,
      patternMatches,
      contextNotes,
      timestamp: Date.now(),
    };
  }
}