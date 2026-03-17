import { randomUUID } from 'node:crypto';
import type {
  BacktestRunConfig,
  BacktestRunResult,
  BotSettings,
  HistoricalContext,
  MarketSnapshot,
  MicrostructureFeatures,
  OpportunityAssessment,
  PatternMatchResult,
  PositionRecord,
  SignalCandidate,
} from '../../core/types';
import { PersistenceService } from '../../services/persistenceService';
import { PairHistoryStore } from '../history/pairHistoryStore';
import { PatternMatcher } from '../history/patternMatcher';
import { RegimeClassifier } from '../history/regimeClassifier';
import { PairUniverse } from '../market/pairUniverse';
import { SignalEngine } from '../signals/signalEngine';
import { RiskEngine } from '../trading/riskEngine';
import { OpportunityEngine } from '../intelligence/opportunityEngine';
import { calculateBacktestMetrics, type BacktestTradeOutcome } from './metrics';
import { ReplayLoader } from './replayLoader';
import type { WorkerPoolService } from '../../services/workerPoolService';

class MemoryBacktestHistory {
  private readonly snapshots = new Map<string, MarketSnapshot[]>();
  private readonly signals = new Map<string, SignalCandidate[]>();
  private readonly opportunities = new Map<string, OpportunityAssessment[]>();
  private readonly anomalies = new Map<string, Array<{ type: string }>>();
  private readonly regimeClassifier = new RegimeClassifier();
  private readonly patternMatcher = new PatternMatcher();

  private pushLimited<T>(target: Map<string, T[]>, pair: string, item: T): void {
    const current = target.get(pair) ?? [];
    current.push(item);
    while (current.length > 300) {
      current.shift();
    }
    target.set(pair, current);
  }

  async recordSnapshot(snapshot: MarketSnapshot): Promise<void> {
    this.pushLimited(this.snapshots, snapshot.pair, snapshot);
  }

  async recordSignal(signal: SignalCandidate): Promise<void> {
    this.pushLimited(this.signals, signal.pair, signal);
  }

  async recordOpportunity(opportunity: OpportunityAssessment): Promise<void> {
    this.pushLimited(this.opportunities, opportunity.pair, opportunity);
  }

  async recordAnomaly(pair: string, type: string): Promise<void> {
    const current = this.anomalies.get(pair) ?? [];
    current.push({ type });
    this.anomalies.set(pair, current);
  }

  getRecentSnapshots(pair: string, limit = 20): MarketSnapshot[] {
    return [...(this.snapshots.get(pair) ?? [])].slice(-limit);
  }

  async buildContext(
    pair: string,
    signal: SignalCandidate,
    microstructure: MicrostructureFeatures,
  ): Promise<HistoricalContext> {
    const snapshots = [...(this.snapshots.get(pair) ?? [])];
    const signals = [...(this.signals.get(pair) ?? [])];
    const opportunities = [...(this.opportunities.get(pair) ?? [])];
    const anomalies = this.anomalies.get(pair) ?? [];
    const regime = this.regimeClassifier.classify({ snapshots, signals: [...signals, signal] });

    const patternMatches: PatternMatchResult[] = this.patternMatcher.match({
      pair,
      signal,
      microstructure,
      probability: {
        pumpProbability: Math.min(1, signal.score / 100),
        continuationProbability: Math.min(1, signal.score / 100),
        trapProbability: Math.min(1, microstructure.spoofRiskScore / 100),
        confidence: signal.confidence,
      },
      regime,
    });

    return {
      pair,
      snapshotCount: snapshots.length,
      anomalyCount: anomalies.length,
      recentWinRate:
        opportunities.length > 0
          ? opportunities.filter((item) => item.edgeValid).length / opportunities.length
          : 0,
      recentFalseBreakRate:
        opportunities.length > 0
          ? opportunities.filter((item) => item.trapProbability >= 0.55).length /
            opportunities.length
          : 0,
      regime,
      patternMatches,
      contextNotes:
        patternMatches.length > 0
          ? [`pattern terdekat: ${patternMatches[0].patternName}`]
          : [],
      timestamp: Date.now(),
    };
  }
}

export interface SimulateBacktestInput {
  config: BacktestRunConfig;
  settings: BotSettings;
  snapshots: MarketSnapshot[];
}

export async function simulateBacktestReplay(
  input: SimulateBacktestInput,
): Promise<BacktestRunResult> {
  const signalEngine = new SignalEngine(new PairUniverse());
  const history = new MemoryBacktestHistory() as unknown as PairHistoryStore;
  const opportunityEngine = new OpportunityEngine(history);
  const riskEngine = new RiskEngine();

  const openPositions = new Map<string, PositionRecord>();
  const outcomes: BacktestTradeOutcome[] = [];
  let signalsGenerated = 0;

  for (const snapshot of input.snapshots) {
    const backtestHistory = history as unknown as MemoryBacktestHistory;
    await backtestHistory.recordSnapshot(snapshot);

    const signal = signalEngine.score(snapshot);
    signalsGenerated += 1;
    await backtestHistory.recordSignal(signal);

    const open = openPositions.get(snapshot.pair);
    if (open) {
      open.currentPrice = snapshot.ticker.lastPrice;
      open.peakPrice = Math.max(open.peakPrice, snapshot.ticker.lastPrice);
      open.unrealizedPnl = (snapshot.ticker.lastPrice - open.averageEntryPrice) * open.quantity;

      const exitDecision = riskEngine.evaluateExit(open, input.settings);
      if (exitDecision.shouldExit) {
        outcomes.push({
          pair: open.pair,
          entryPrice: open.averageEntryPrice,
          exitPrice: snapshot.ticker.lastPrice,
          quantity: open.quantity,
          pnl: (snapshot.ticker.lastPrice - open.averageEntryPrice) * open.quantity,
          openedAt: new Date(open.openedAt).getTime(),
          closedAt: snapshot.timestamp,
        });
        openPositions.delete(snapshot.pair);
      }
    }

    const opportunity = await opportunityEngine.assess(snapshot, signal);
    await backtestHistory.recordOpportunity(opportunity);

    if (openPositions.has(snapshot.pair)) {
      continue;
    }

    if (
      !opportunity.edgeValid ||
      opportunity.pumpProbability < input.settings.strategy.minPumpProbability ||
      opportunity.confidence < input.settings.strategy.minConfidence ||
      !['EARLY', 'READY'].includes(opportunity.entryTiming.state)
    ) {
      continue;
    }

    const entryPrice = opportunity.bestAsk > 0 ? opportunity.bestAsk : opportunity.referencePrice;
    const quantity =
      entryPrice > 0 ? input.settings.risk.maxPositionSizeIdr / entryPrice : 0;
    const stops = riskEngine.buildStops(entryPrice, input.settings);

    openPositions.set(snapshot.pair, {
      id: `${snapshot.pair}-${snapshot.timestamp}`,
      pair: snapshot.pair,
      accountId: 'BACKTEST',
      status: 'OPEN',
      side: 'long',
      quantity,
      entryPrice,
      averageEntryPrice: entryPrice,
      currentPrice: entryPrice,
      peakPrice: entryPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      stopLossPrice: stops.stopLossPrice,
      takeProfitPrice: stops.takeProfitPrice,
      openedAt: new Date(snapshot.timestamp).toISOString(),
      updatedAt: new Date(snapshot.timestamp).toISOString(),
      closedAt: null,
      sourceOrderId: undefined,
    });
  }

  const lastSnapshotByPair = new Map<string, MarketSnapshot>();
  for (const snapshot of input.snapshots) {
    lastSnapshotByPair.set(snapshot.pair, snapshot);
  }

  for (const [pair, open] of openPositions.entries()) {
    const last = lastSnapshotByPair.get(pair);
    if (!last) {
      continue;
    }

    outcomes.push({
      pair,
      entryPrice: open.averageEntryPrice,
      exitPrice: last.ticker.lastPrice,
      quantity: open.quantity,
      pnl: (last.ticker.lastPrice - open.averageEntryPrice) * open.quantity,
      openedAt: new Date(open.openedAt).getTime(),
      closedAt: last.timestamp,
    });
  }

  const metrics = calculateBacktestMetrics(outcomes);

  return {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    pairsTested: [...new Set(input.snapshots.map((snapshot) => snapshot.pair))],
    signalsGenerated,
    entriesTaken: metrics.entriesTaken,
    exitsTaken: metrics.exitsTaken,
    wins: metrics.wins,
    losses: metrics.losses,
    netPnl: metrics.netPnl,
    notes: [
      `maxEvents=${input.config.maxEvents ?? 'all'}`,
      `strategy.minPumpProbability=${input.settings.strategy.minPumpProbability}`,
      `strategy.minConfidence=${input.settings.strategy.minConfidence}`,
    ],
  };
}

export class BacktestEngine {
  private readonly loader: ReplayLoader;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly workerPool?: WorkerPoolService,
  ) {
    this.loader = new ReplayLoader(persistence);
  }

  async run(
    config: BacktestRunConfig,
    settings: BotSettings,
  ): Promise<BacktestRunResult> {
    const snapshots = await this.loader.loadSnapshots(config);

    const result =
      this.workerPool && settings.workers.enabled
        ? await this.workerPool.runBacktestTask({ config, settings, snapshots })
        : await simulateBacktestReplay({ config, settings, snapshots });

    await this.persistence.saveBacktestResult(result);
    return result;
  }
}