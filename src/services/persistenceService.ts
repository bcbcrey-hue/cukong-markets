import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import type {
  BacktestRunResult,
  BotSettings,
  ExecutionSummary,
  HealthSnapshot,
  HotlistEntry,
  IndodaxCallbackEvent,
  IndodaxCallbackState,
  JournalEntry,
  OpportunityAssessment,
  OrderRecord,
  BatchBPhase2CalibrationReport,
  BatchBPhase2PredictionTrackingRecord,
  PolicyEvaluationRecord,
  PositionRecord,
  RuntimeState,
  ShadowRunEvidence,
  Phase3MarketRealManualEvidence,
  Phase3ReadinessReport,
  TradeOutcomeSummary,
  TradeRecord,
} from '../core/types';
import { JsonLinesStore, JsonStore } from '../storage/jsonStore';

export interface PersistenceSnapshot {
  state: RuntimeState;
  settings: BotSettings;
  health: HealthSnapshot;
  orders: OrderRecord[];
  positions: PositionRecord[];
  trades: TradeRecord[];
}

export function createDefaultRuntimeState(): RuntimeState {
  return {
    status: 'IDLE',
    startedAt: null,
    stoppedAt: null,
    lastUpdatedAt: new Date().toISOString(),
    uptimeMs: 0,
    activeTradingMode: env.defaultTradingMode,
    pairCooldowns: {},
    pairs: {},
    lastMarketOverview: null,
    lastPumpCandidates: [],
    lastHotlist: [],
    lastSignals: [],
    lastOpportunities: [],
    lastRuntimePolicyDecision: null,
    lastPolicyLearning: null,
    tradeCount: 0,
    lastTradeAt: null,
    pollingStats: {
      activeJobs: 0,
      tickCount: 0,
      lastTickAt: null,
    },
    emergencyStop: false,
  };
}

export function createDefaultSettings(): BotSettings {
  return {
    tradingMode: env.defaultTradingMode,
    dryRun: true,
    paperTrade: true,
    uiOnly: false,
    defaultQuoteAsset: env.defaultQuoteAsset,
    risk: {
      maxOpenPositions: env.riskMaxOpenPositions,
      maxPositionSizeIdr: env.riskMaxPositionSizeIdr,
      maxPairSpreadPct: env.riskMaxPairSpreadPct,
      cooldownMs: env.riskCooldownMs,
      maxDailyLossIdr: 500_000,
      takeProfitPct: 15,
      stopLossPct: 1.5,
      trailingStopPct: 1,
    },
    portfolio: {
      baseEntryCapitalIdr: env.portfolioBaseEntryCapitalIdr,
      maxTotalDeployedCapitalIdr: env.portfolioMaxTotalDeployedCapitalIdr,
      riskBudgetPerPositionPct: env.portfolioRiskBudgetPerPositionPct,
      maxExposurePerPairClassPct: {
        MAJOR: env.portfolioMaxExposureMajorPct,
        MID: env.portfolioMaxExposureMidPct,
        MICRO: env.portfolioMaxExposureMicroPct,
      },
      maxExposurePerDiscoveryBucketPct: {
        ANOMALY: env.portfolioMaxExposureAnomalyPct,
        ROTATION: env.portfolioMaxExposureRotationPct,
        STEALTH: env.portfolioMaxExposureStealthPct,
        LIQUID_LEADER: env.portfolioMaxExposureLiquidLeaderPct,
      },
      thinBookDepthScoreThreshold: env.portfolioThinBookDepthScoreThreshold,
      thinBookCapMultiplier: env.portfolioThinBookCapMultiplier,
    },
    strategy: {
      minScoreToAlert: 60,
      minScoreToBuy: 75,
      minPumpProbability: env.probabilityThresholdAuto,
      minConfidence: env.confidenceThresholdAuto,
      buySlippageBps: env.buySlippageBps,
      maxBuySlippageBps: env.maxBuySlippageBps,
      buyOrderTimeoutMs: env.buyOrderTimeoutMs,
      spoofRiskBlockThreshold: env.spoofRiskBlockThreshold,
      useAntiSpoof: true,
      useHistoricalContext: true,
      usePatternMatching: true,
      useEntryTiming: true,
    },
    scanner: {
      enabled: true,
      pollingIntervalMs: env.pollingIntervalMs,
      marketWatchIntervalMs: env.marketWatchIntervalMs,
      hotlistLimit: env.hotlistLimit,
      maxPairsTracked: env.maxPairsTracked,
      orderbookDepthLevels: env.orderbookDepthLevels,
      scannerHistoryLimit: env.scannerHistoryLimit,
      discovery: {
        anomalySlots: env.discoveryAnomalySlots,
        rotationSlots: env.discoveryRotationSlots,
        stealthSlots: env.discoveryStealthSlots,
        liquidLeaderSlots: env.discoveryLiquidLeaderSlots,
        minVolumeIdr: env.discoveryMinVolumeIdr,
        maxSpreadPct: env.discoveryMaxSpreadPct,
        minDepthScore: env.discoveryMinDepthScore,
        majorPairMaxShare: env.discoveryMajorPairMaxShare,
      },
    },
    workers: {
      enabled: env.workerEnabled,
      poolSize: env.workerPoolSize,
    },
    backtest: {
      enabled: true,
      maxReplayItems: 20_000,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultHealth(): HealthSnapshot {
  return {
    status: 'degraded',
    updatedAt: new Date().toISOString(),
    runtimeStatus: 'IDLE',
    scannerRunning: false,
    telegramConfigured: false,
    telegramRunning: false,
    telegramConnection: {
      configured: false,
      launched: false,
      running: false,
      connected: false,
      lastConnectionStatus: 'never_started',
      allowedUsersCount: env.telegramAllowedUserIds.length,
      botId: null,
      botUsername: null,
      botFirstName: null,
      botIsBot: null,
      lastLaunchAt: null,
      lastConnectedAt: null,
      lastLaunchSuccessAt: null,
      lastLaunchError: null,
      lastLaunchErrorType: 'none',
    },
    callbackServerRunning: false,
    tradingEnabled: false,
    executionMode: 'SIMULATED',
    activePairsTracked: 0,
    workers: [],
    notes: [],
  };
}

export function createDefaultIndodaxCallbackState(): IndodaxCallbackState {
  return {
    enabled: env.indodaxEnableCallbackServer,
    callbackPath: env.indodaxCallbackPath,
    callbackUrl: env.indodaxCallbackUrl,
    allowedHost: env.indodaxCallbackAllowedHost || null,
    lastReceivedAt: null,
    lastResponse: null,
    acceptedCount: 0,
    rejectedCount: 0,
    lastEventId: null,
    lastSourceHost: null,
    lastVerificationAt: null,
    nonceHistory: [],
  };
}

export class PersistenceService {
  private readonly stateStore = new JsonStore<RuntimeState>({
    filePath: env.stateFile,
    fallback: createDefaultRuntimeState(),
  });

  private readonly settingsStore = new JsonStore<BotSettings>({
    filePath: env.settingsFile,
    fallback: createDefaultSettings(),
  });

  private readonly healthStore = new JsonStore<HealthSnapshot>({
    filePath: env.healthFile,
    fallback: createDefaultHealth(),
  });
  private readonly callbackStateStore = new JsonStore<IndodaxCallbackState>({
    filePath: env.callbackStateFile,
    fallback: createDefaultIndodaxCallbackState(),
  });

  private readonly ordersStore = new JsonStore<OrderRecord[]>({
    filePath: env.ordersFile,
    fallback: [],
  });

  private readonly positionsStore = new JsonStore<PositionRecord[]>({
    filePath: env.positionsFile,
    fallback: [],
  });

  private readonly tradesStore = new JsonStore<TradeRecord[]>({
    filePath: env.tradesFile,
    fallback: [],
  });

  private readonly journalStore = new JsonLinesStore<JournalEntry>(env.journalFile);
  private readonly pairHistoryStore = new JsonLinesStore<Record<string, unknown>>(
    env.pairHistoryFile,
  );
  private readonly anomalyEventsStore = new JsonLinesStore<Record<string, unknown>>(
    env.anomalyEventsFile,
  );
  private readonly patternOutcomesStore = new JsonLinesStore<Record<string, unknown>>(
    env.patternOutcomesFile,
  );
  private readonly executionSummaryStore = new JsonLinesStore<ExecutionSummary>(
    env.executionSummaryFile,
  );
  private readonly tradeOutcomeStore = new JsonLinesStore<TradeOutcomeSummary>(
    env.tradeOutcomeFile,
  );
  private readonly policyEvaluationStore = new JsonStore<PolicyEvaluationRecord[]>({
    filePath: env.policyEvaluationFile,
    fallback: [],
  });
  private readonly callbackEventsStore = new JsonLinesStore<IndodaxCallbackEvent>(
    env.callbackEventsFile,
  );
  private readonly shadowRunEvidenceStore = new JsonLinesStore<ShadowRunEvidence>(
    env.shadowRunEvidenceFile,
  );
  private readonly batchBPhase2TrackingStore = new JsonLinesStore<BatchBPhase2PredictionTrackingRecord>(
    path.resolve(env.historyDir, 'batch-b-phase2-tracking.jsonl'),
  );

  private readonly phase3EvidenceStore = new JsonLinesStore<Phase3ReadinessReport>(
    path.resolve(env.historyDir, 'phase3-market-real-evidence.jsonl'),
  );
  private readonly phase3ManualEvidenceStore = new JsonLinesStore<Phase3MarketRealManualEvidence>(
    path.resolve(env.historyDir, 'phase3-market-real-manual-evidence.jsonl'),
  );
  private readonly phase3LatestReportStore = new JsonStore<Phase3ReadinessReport | null>({
    filePath: path.resolve(env.historyDir, 'phase3-market-real-latest-report.json'),
    fallback: null,
  });

  private readonly batchBPhase2LatestReportStore = new JsonStore<BatchBPhase2CalibrationReport | null>({
    filePath: path.resolve(env.historyDir, 'batch-b-phase2-latest-report.json'),
    fallback: null,
  });

  async bootstrap(): Promise<void> {
    await Promise.all([
      this.stateStore.read(),
      this.settingsStore.read(),
      this.healthStore.read(),
      this.callbackStateStore.read(),
      this.ordersStore.read(),
      this.positionsStore.read(),
      this.tradesStore.read(),
      this.journalStore.ensureDir(),
      this.pairHistoryStore.ensureDir(),
      this.anomalyEventsStore.ensureDir(),
      this.patternOutcomesStore.ensureDir(),
      this.executionSummaryStore.ensureDir(),
      this.tradeOutcomeStore.ensureDir(),
      this.policyEvaluationStore.read(),
      this.callbackEventsStore.ensureDir(),
      this.shadowRunEvidenceStore.ensureDir(),
      this.batchBPhase2TrackingStore.ensureDir(),
      this.batchBPhase2LatestReportStore.read(),
      this.phase3EvidenceStore.ensureDir(),
      this.phase3ManualEvidenceStore.ensureDir(),
      this.phase3LatestReportStore.read(),
    ]);
  }

  async loadAll(): Promise<PersistenceSnapshot> {
    const [state, settings, health, orders, positions, trades] = await Promise.all([
      this.stateStore.read(),
      this.settingsStore.read(),
      this.healthStore.read(),
      this.ordersStore.read(),
      this.positionsStore.read(),
      this.tradesStore.read(),
    ]);

    return {
      state,
      settings,
      health,
      orders,
      positions,
      trades,
    };
  }

  readState(): Promise<RuntimeState> {
    return this.stateStore.read();
  }

  saveState(state: RuntimeState): Promise<void> {
    return this.stateStore.write(state);
  }

  readSettings(): Promise<BotSettings> {
    return this.settingsStore.read();
  }

  saveSettings(settings: BotSettings): Promise<void> {
    return this.settingsStore.write({
      ...settings,
      updatedAt: new Date().toISOString(),
    });
  }

  readHealth(): Promise<HealthSnapshot> {
    return this.healthStore.read();
  }

  saveHealth(health: HealthSnapshot): Promise<void> {
    return this.healthStore.write({
      ...health,
      updatedAt: new Date().toISOString(),
    });
  }

  readIndodaxCallbackState(): Promise<IndodaxCallbackState> {
    return this.callbackStateStore.read();
  }

  saveIndodaxCallbackState(state: IndodaxCallbackState): Promise<void> {
    return this.callbackStateStore.write(state);
  }

  readOrders(): Promise<OrderRecord[]> {
    return this.ordersStore.read();
  }

  saveOrders(orders: OrderRecord[]): Promise<void> {
    return this.ordersStore.write(orders);
  }

  readPositions(): Promise<PositionRecord[]> {
    return this.positionsStore.read();
  }

  savePositions(positions: PositionRecord[]): Promise<void> {
    return this.positionsStore.write(positions);
  }

  readTrades(): Promise<TradeRecord[]> {
    return this.tradesStore.read();
  }

  saveTrades(trades: TradeRecord[]): Promise<void> {
    return this.tradesStore.write(trades);
  }

  appendJournal(entry: JournalEntry): Promise<void> {
    return this.journalStore.append(entry);
  }

  readJournal(): Promise<JournalEntry[]> {
    return this.journalStore.readAll();
  }

  appendPairHistory(entry: Record<string, unknown>): Promise<void> {
    return this.pairHistoryStore.append(entry);
  }

  readPairHistory(): Promise<Record<string, unknown>[]> {
    return this.pairHistoryStore.readAll();
  }

  appendAnomalyEvent(entry: Record<string, unknown>): Promise<void> {
    return this.anomalyEventsStore.append(entry);
  }

  readAnomalyEvents(): Promise<Record<string, unknown>[]> {
    return this.anomalyEventsStore.readAll();
  }

  appendPatternOutcome(entry: Record<string, unknown>): Promise<void> {
    return this.patternOutcomesStore.append(entry);
  }

  readPatternOutcomes(): Promise<Record<string, unknown>[]> {
    return this.patternOutcomesStore.readAll();
  }

  appendExecutionSummary(entry: ExecutionSummary): Promise<void> {
    return this.executionSummaryStore.append(entry);
  }

  readExecutionSummaries(): Promise<ExecutionSummary[]> {
    return this.executionSummaryStore.readAll();
  }

  appendTradeOutcome(entry: TradeOutcomeSummary): Promise<void> {
    return this.tradeOutcomeStore.append(entry);
  }

  readTradeOutcomes(): Promise<TradeOutcomeSummary[]> {
    return this.tradeOutcomeStore.readAll();
  }

  readPolicyEvaluations(): Promise<PolicyEvaluationRecord[]> {
    return this.policyEvaluationStore.read();
  }

  savePolicyEvaluations(records: PolicyEvaluationRecord[]): Promise<void> {
    return this.policyEvaluationStore.write(records);
  }

  appendIndodaxCallbackEvent(entry: IndodaxCallbackEvent): Promise<void> {
    return this.callbackEventsStore.append(entry);
  }

  readIndodaxCallbackEvents(): Promise<IndodaxCallbackEvent[]> {
    return this.callbackEventsStore.readAll();
  }

  appendShadowRunEvidence(entry: ShadowRunEvidence): Promise<void> {
    return this.shadowRunEvidenceStore.append(entry);
  }

  readShadowRunEvidence(): Promise<ShadowRunEvidence[]> {
    return this.shadowRunEvidenceStore.readAll();
  }

  appendBatchBPhase2Tracking(entry: BatchBPhase2PredictionTrackingRecord): Promise<void> {
    return this.batchBPhase2TrackingStore.append(entry);
  }

  readBatchBPhase2Tracking(): Promise<BatchBPhase2PredictionTrackingRecord[]> {
    return this.batchBPhase2TrackingStore.readAll();
  }

  saveBatchBPhase2LatestReport(report: BatchBPhase2CalibrationReport): Promise<void> {
    return this.batchBPhase2LatestReportStore.write(report);
  }

  readBatchBPhase2LatestReport(): Promise<BatchBPhase2CalibrationReport | null> {
    return this.batchBPhase2LatestReportStore.read();
  }


  appendPhase3ReadinessEvidence(entry: Phase3ReadinessReport): Promise<void> {
    return this.phase3EvidenceStore.append(entry);
  }

  readPhase3ReadinessEvidence(): Promise<Phase3ReadinessReport[]> {
    return this.phase3EvidenceStore.readAll();
  }

  appendPhase3ManualMarketRealEvidence(entry: Phase3MarketRealManualEvidence): Promise<void> {
    return this.phase3ManualEvidenceStore.append(entry);
  }

  readPhase3ManualMarketRealEvidence(): Promise<Phase3MarketRealManualEvidence[]> {
    return this.phase3ManualEvidenceStore.readAll();
  }

  savePhase3LatestReport(report: Phase3ReadinessReport): Promise<void> {
    return this.phase3LatestReportStore.write(report);
  }

  readPhase3LatestReport(): Promise<Phase3ReadinessReport | null> {
    return this.phase3LatestReportStore.read();
  }

  async saveHotlistSnapshot(hotlist: HotlistEntry[]): Promise<void> {
    const state = await this.readState();
    await this.saveState({
      ...state,
      lastHotlist: hotlist,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  async saveOpportunitySnapshot(opportunities: OpportunityAssessment[]): Promise<void> {
    const state = await this.readState();
    await this.saveState({
      ...state,
      lastOpportunities: opportunities,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  async saveBacktestResult(result: BacktestRunResult): Promise<void> {
    await mkdir(env.backtestDir, { recursive: true });
    const outputFile = path.resolve(env.backtestDir, `${result.runId}.json`);

    await writeFile(outputFile, JSON.stringify(result, null, 2), 'utf8');

    await this.appendJournal({
      id: result.runId,
      type: 'BACKTEST',
      title: 'Backtest completed',
      message: `Backtest selesai untuk ${result.pairsTested.join(', ') || 'multiple pairs'}`,
      payload: result as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    });
  }

  async listBacktestResults(): Promise<BacktestRunResult[]> {
    try {
      await mkdir(env.backtestDir, { recursive: true });
      const files = (await readdir(env.backtestDir))
        .filter((file) => file.endsWith('.json'))
        .map((file) => path.resolve(env.backtestDir, file));

      const results = await Promise.all(
        files.map(async (filePath) => {
          const raw = await readFile(filePath, 'utf8');
          return JSON.parse(raw) as BacktestRunResult;
        }),
      );

      return results.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    } catch {
      return [];
    }
  }

  async readLatestBacktestResult(): Promise<BacktestRunResult | null> {
    const results = await this.listBacktestResults();
    return results[0] ?? null;
  }
}
