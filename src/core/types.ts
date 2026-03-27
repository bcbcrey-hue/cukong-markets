export type TradingMode = 'OFF' | 'ALERT_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';
export type ExecutionMode = 'SIMULATED' | 'LIVE';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type PositionStatus = 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';
export type PositionEntryStyle = 'SCOUT' | 'CONFIRM';
export type PositionPumpState = 'ACTIVE' | 'WEAKENING' | 'DISTRIBUTING' | 'COLLAPSING';
export type ExitAction = 'HOLD' | 'SCALE_OUT' | 'TAKE_PROFIT_EXIT' | 'DUMP_EXIT' | 'EMERGENCY_EXIT';
export type PositionCloseReason =
  | 'AUTO_EXIT'
  | 'MANUAL_SELL'
  | 'SELL_ALL_POSITIONS'
  | 'SCALE_OUT'
  | 'TAKE_PROFIT_EXIT'
  | 'DUMP_EXIT'
  | 'EMERGENCY_EXIT'
  | 'TAKE_PROFIT'
  | 'STOP_LOSS'
  | 'TRAILING_STOP';
export type RuntimeStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type PairClass = 'MAJOR' | 'MID' | 'MICRO';
export type EntryTimingState =
  | 'EARLY'
  | 'READY'
  | 'LATE'
  | 'AVOID'
  | 'SCOUT_WINDOW'
  | 'CONFIRM_WINDOW'
  | 'CHASING'
  | 'DEAD';
export type OpportunityAction =
  | 'WATCH'
  | 'PREPARE_ENTRY'
  | 'CONFIRM_ENTRY'
  | 'AVOID'
  | 'ENTER'
  | 'SCOUT_ENTER'
  | 'ADD_ON_CONFIRM'
  | 'EMERGENCY_EXIT'
  | 'DUMP_EXIT'
  | 'TAKE_PROFIT_EXIT';
export type DecisionPolicyAction = 'ENTER' | 'SKIP' | 'WAIT';
export type DecisionPolicyAggressiveness = 'LOW' | 'NORMAL' | 'HIGH';
export type DecisionPolicyEntryLane = 'DEFAULT' | 'SCOUT' | 'ADD_ON_CONFIRM';
export type ExecutionStressMode = 'NORMAL' | 'THIN_BOOK_STRESS';
export type ExecutionOrderStyle = 'LIMIT_MARKETABLE';
export type SummaryAccuracy =
  | 'SIMULATED'
  | 'OPTIMISTIC_LIVE'
  | 'PARTIAL_LIVE'
  | 'CONFIRMED_LIVE'
  | 'UNCERTAIN_LIVE'
  | 'UNRESOLVED_LIVE';
export type MarketRegime =
  | 'QUIET'
  | 'ACCUMULATION'
  | 'BREAKOUT_SETUP'
  | 'EXPANSION'
  | 'EXHAUSTION'
  | 'DISTRIBUTION'
  | 'TRAP_RISK';

export interface LegacyUploadedAccount {
  name: string;
  apiKey: string;
  apiSecret: string;
}

export interface RuntimeAccountsFile {
  format: 'runtime_accounts_v1';
  secretStorage: 'plaintext_local';
  accounts: StoredAccount[];
}

export interface StoredAccount extends LegacyUploadedAccount {
  id: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

export type DiscoveryBucketType =
  | 'ANOMALY'
  | 'ROTATION'
  | 'STEALTH'
  | 'LIQUID_LEADER';

export interface DiscoveryCandidate {
  pair: string;
  bucket: DiscoveryBucketType;
  volumeIdr: number;
  spreadPct: number;
  depthScore: number;
  majorPair: boolean;
  tags: string[];
  snapshotAt: number;
}

export interface DiscoveryBucket {
  type: DiscoveryBucketType;
  slots: number;
  candidates: DiscoveryCandidate[];
}

export interface DiscoverySettings {
  anomalySlots: number;
  rotationSlots: number;
  stealthSlots: number;
  liquidLeaderSlots: number;
  minVolumeIdr: number;
  maxSpreadPct: number;
  minDepthScore: number;
  majorPairMaxShare: number;
}

export interface DiscoveryObservabilitySummary {
  slotPlan: {
    anomaly: number;
    rotation: number;
    stealth: number;
    liquidLeader: number;
  };
  passed: {
    majorPair: number;
    anomaly: number;
  };
  rejected: {
    spread: number;
    depth: number;
  };
}

export interface RiskSettings {
  maxOpenPositions: number;
  maxPositionSizeIdr: number;
  maxPairSpreadPct: number;
  cooldownMs: number;
  maxDailyLossIdr: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
}

export interface PortfolioCapitalSettings {
  baseEntryCapitalIdr: number;
  maxTotalDeployedCapitalIdr: number;
  riskBudgetPerPositionPct: number;
  maxExposurePerPairClassPct: Record<PairClass, number>;
  maxExposurePerDiscoveryBucketPct: Record<DiscoveryBucketType, number>;
  thinBookDepthScoreThreshold: number;
  thinBookCapMultiplier: number;
}

export interface StrategySettings {
  minScoreToAlert: number;
  minScoreToBuy: number;
  minPumpProbability: number;
  minConfidence: number;
  buySlippageBps: number;
  maxBuySlippageBps: number;
  buyOrderTimeoutMs: number;
  spoofRiskBlockThreshold: number;
  useAntiSpoof: boolean;
  useHistoricalContext: boolean;
  usePatternMatching: boolean;
  useEntryTiming: boolean;
}

export interface ScannerSettings {
  enabled: boolean;
  pollingIntervalMs: number;
  marketWatchIntervalMs: number;
  hotlistLimit: number;
  maxPairsTracked: number;
  orderbookDepthLevels: number;
  scannerHistoryLimit: number;
  discovery: DiscoverySettings;
}

export interface WorkerSettings {
  enabled: boolean;
  poolSize: number;
}

export interface BacktestSettings {
  enabled: boolean;
  maxReplayItems: number;
}

export interface BotSettings {
  tradingMode: TradingMode;
  dryRun: boolean;
  paperTrade: boolean;
  uiOnly: boolean;
  defaultQuoteAsset: string;
  risk: RiskSettings;
  portfolio: PortfolioCapitalSettings;
  strategy: StrategySettings;
  scanner: ScannerSettings;
  workers: WorkerSettings;
  backtest: BacktestSettings;
  updatedAt: string;
}

export interface PairTickerSnapshot {
  pair: string;
  lastPrice: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24hBase: number;
  volume24hQuote: number;
  change24hPct: number;
  timestamp: number;
}

export interface OrderbookLevel {
  price: number;
  volume: number;
}

export interface OrderbookSnapshot {
  pair: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  spreadPct: number;
  midPrice: number;
  timestamp: number;
}

export type TradePrintSource = 'EXCHANGE_TRADE_FEED' | 'INFERRED_SNAPSHOT_DELTA';
export type TradePrintQuality = 'TAPE' | 'PROXY';

export interface TradePrint {
  pair: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell' | 'unknown';
  timestamp: number;
  source: TradePrintSource;
  quality: TradePrintQuality;
  inferenceBasis?: 'volume24hQuote_delta_and_price_direction';
}

export interface MarketSnapshot {
  pair: string;
  discoveryBucket?: DiscoveryBucketType;
  pairClass?: PairClass;
  ticker: PairTickerSnapshot;
  orderbook: OrderbookSnapshot | null;
  recentTrades: TradePrint[];
  recentTradesSource: 'EXCHANGE_TRADE_FEED' | 'INFERRED_PROXY' | 'MIXED' | 'NONE';
  timestamp: number;
}

export interface ScoreContribution {
  feature: string;
  weight: number;
  contribution: number;
  note: string;
}

export interface SignalCandidate {
  pair: string;
  discoveryBucket?: DiscoveryBucketType;
  pairClass?: PairClass;
  score: number;
  confidence: number;
  reasons: string[];
  warnings: string[];
  regime: MarketRegime;
  breakoutPressure: number;
  quoteFlowAccelerationScore: number;
  orderbookImbalance: number;
  spreadPct: number;
  marketPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadBps?: number;
  bidDepthTop10?: number;
  askDepthTop10?: number;
  depthScore?: number;
  orderbookTimestamp?: number;
  liquidityScore: number;
  change1m: number;
  change5m: number;
  contributions: ScoreContribution[];
  timestamp: number;
}

export interface MarketOverview {
  timestamp: number;
  breadth: {
    totalPairs: number;
    gainers1m: number;
    losers1m: number;
    gainers5m: number;
    losers5m: number;
  };
  liquidLeaders: SignalCandidate[];
  rotationLeaders: SignalCandidate[];
  watchlist: SignalCandidate[];
}

export interface HotlistEntry extends SignalCandidate {
  rank: number;
  recommendedAction: OpportunityAssessment['recommendedAction'];
  edgeValid: boolean;
  entryTiming: EntryTimingAssessment;
  pumpProbability: number;
  trapProbability: number;
  historicalMatchSummary: string;
}

export interface MicrostructureFeatures {
  pair: string;
  accumulationScore: number;
  spoofRiskScore: number;
  icebergScore: number;
  clusterScore: number;
  aggressionBias: number;
  sweepScore: number;
  breakoutPressureScore: number;
  quoteFlowAccelerationScore: number;
  liquidityQualityScore: number;
  spreadScore: number;
  exhaustionRiskScore: number;
  timestamp: number;
  evidence: string[];
  tradeFlowSource: MarketSnapshot['recentTradesSource'];
  tradeFlowQuality: TradePrintQuality;
}

export interface PatternMatchResult {
  patternId: string;
  patternName: string;
  similarity: number;
  regime: MarketRegime;
  summary: string;
}

export interface HistoricalContext {
  pair: string;
  snapshotCount: number;
  anomalyCount: number;
  recentWinRate: number;
  recentFalseBreakRate: number;
  outcomeGrounding?: 'OUTCOME_GROUNDED' | 'MIXED' | 'PROXY_FALLBACK';
  outcomeSampleSize?: number;
  regime: MarketRegime;
  patternMatches: PatternMatchResult[];
  contextNotes: string[];
  timestamp: number;
}

export interface ProbabilityAssessment {
  pumpProbability: number;
  continuationProbability: number;
  trapProbability: number;
  confidence: number;
}

export interface FutureTrendingPrediction {
  target: 'TREND_DIRECTIONAL_MOVE';
  horizonLabel: 'H5_15M';
  horizonMinutes: number;
  direction: 'UP' | 'SIDEWAYS' | 'DOWN';
  expectedMovePct: number;
  confidence: number;
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  calibrationTag:
    | 'OUTCOME_AND_TRADE_TRUTH'
    | 'OUTCOME_GROUNDED_WITH_FLOW_CAVEAT'
    | 'TRADE_TRUTH_WITH_PROXY_OUTCOME'
    | 'PROXY_FALLBACK';
  reasons: string[];
  caveats: string[];
  tradeFlowSource: MarketSnapshot['recentTradesSource'];
  tradeFlowQuality: TradePrintQuality;
  generatedAt: number;
}

export interface EdgeValidationResult {
  valid: boolean;
  reasons: string[];
  warnings: string[];
  blockedBySpoof: boolean;
  blockedBySpread: boolean;
  blockedByLiquidity: boolean;
  blockedByTiming: boolean;
}

export interface EntryTimingAssessment {
  state: EntryTimingState;
  quality: number;
  reason: string;
  leadScore: number;
  entryStyle?: 'SCOUT' | 'CONFIRM' | 'CHASING' | 'DEAD';
}

export interface OpportunityAssessment {
  pair: string;
  discoveryBucket?: DiscoveryBucketType;
  pairClass?: PairClass;
  rawScore: number;
  finalScore: number;
  confidence: number;
  pumpProbability: number;
  continuationProbability: number;
  trapProbability: number;
  spoofRisk: number;
  edgeValid: boolean;
  marketRegime: MarketRegime;
  breakoutPressure: number;
  quoteFlowAccelerationScore: number;
  orderbookImbalance: number;
  change1m: number;
  change5m: number;
  entryTiming: EntryTimingAssessment;
  reasons: string[];
  warnings: string[];
  featureBreakdown: ScoreContribution[];
  historicalContext?: HistoricalContext;
  /**
   * Pre-decision hint from OpportunityEngine (context-only).
   * BUKAN keputusan final entry bisnis. Keputusan final tetap dari DecisionPolicyEngine.
   */
  recommendedAction: OpportunityAction;
  entryStyle?: 'SCOUT' | 'CONFIRM' | 'LATE' | 'DEAD';
  pumpState?: 'PRE_PUMP' | 'CONTINUATION' | 'OVEREXTENDED' | 'DUMP_RISK';
  lastContinuationScore?: number;
  lastDumpRisk?: number;
  riskContext: string[];
  historicalMatchSummary: string;
  referencePrice: number;
  bestBid: number;
  bestAsk: number;
  spreadBps?: number;
  bidDepthTop10?: number;
  askDepthTop10?: number;
  depthScore?: number;
  orderbookTimestamp?: number;
  spreadPct: number;
  liquidityScore: number;
  prediction?: FutureTrendingPrediction;
  timestamp: number;
}

export interface DecisionPolicyInput {
  pair: string;
  source: 'OPPORTUNITY' | 'SIGNAL';
  score: number;
  confidence: number;
  recommendedAction?: OpportunityAction;
  edgeValid?: boolean;
  marketRegime?: MarketRegime;
  discoveryBucket?: DiscoveryBucketType;
  pumpProbability?: number;
  trapProbability?: number;
  spoofRisk?: number;
  entryTimingState?: EntryTimingState;
  minScoreToAlert: number;
  minScoreToBuy: number;
  minConfidence: number;
  minPumpProbability?: number;
  spoofRiskBlockThreshold?: number;
  tradingMode: TradingMode;
  riskCheckResult?: RiskCheckResult;
  prediction?: FutureTrendingPrediction;
}

export interface DecisionPolicyOutput {
  action: DecisionPolicyAction;
  sizeMultiplier: number;
  aggressiveness: DecisionPolicyAggressiveness;
  reasons: string[];
  entryLane: DecisionPolicyEntryLane;
}

export interface ExposureBucketSnapshot {
  key: string;
  usedNotionalIdr: number;
  capNotionalIdr: number;
  remainingNotionalIdr: number;
}

export interface PortfolioExposureSnapshot {
  totalDeployedCapitalIdr: number;
  totalRemainingCapitalIdr: number;
  pairClass: ExposureBucketSnapshot;
  discoveryBucket: ExposureBucketSnapshot;
}

export interface PortfolioCapitalPlan {
  policySizeIntentMultiplier: number;
  baseEntryCapitalIdr: number;
  policyIntentNotionalIdr: number;
  riskBudgetCapIdr: number;
  thinBookCapIdr: number | null;
  allowedNotionalIdr: number;
  cappedNotionalIdr: number;
  allocatedNotionalIdr: number;
  blocked: boolean;
  reasons: string[];
  exposure: PortfolioExposureSnapshot;
}

export interface RuntimeCandidateCapitalContext {
  policyIntentNotionalIdr: number;
  allocatedNotionalIdr: number;
  cappedNotionalIdr: number;
  blocked: boolean;
  reasons: string[];
  pairClassBucket: string;
  discoveryBucket: string;
}

export interface RuntimeEntryCandidate {
  pair: string;
  opportunity: OpportunityAssessment;
  riskCheckResult: RiskCheckResult;
  /**
   * Final decision dari DecisionPolicyEngine yang sudah mempertimbangkan risk guardrail.
   * ExecutionEngine wajib mengeksekusi kontrak ini apa adanya.
   */
  policyDecision: DecisionPolicyOutput;
  capitalPlan: PortfolioCapitalPlan;
  capitalContext: RuntimeCandidateCapitalContext;
  policyReasons: string[];
  sizeMultiplier: number;
  aggressiveness: DecisionPolicyAggressiveness;
}

export interface ExecutionPlanReadModel {
  pair: string;
  policyAction: DecisionPolicyAction;
  policyAggressiveness: DecisionPolicyAggressiveness;
  entryLane: DecisionPolicyEntryLane;
  allocatedNotionalIdr: number;
  orderStyle: ExecutionOrderStyle;
  stressMode: ExecutionStressMode;
  baselineSlippageBps: number;
  finalSlippageBps: number;
  slippageReasons: string[];
  partialFillExpected: boolean;
  partialFillRatio: number;
  keepRemainderOpen: boolean;
  cancelAfterTimeoutMs: number;
  marketContext: {
    spreadPct: number | null;
    depthScore: number | null;
    liquidityScore: number | null;
    quoteFlowAccelerationScore: number | null;
  };
}

export interface RuntimePolicyReadModel {
  pair: string;
  action: DecisionPolicyAction;
  reasons: string[];
  entryLane: DecisionPolicyEntryLane;
  sizeMultiplier: number;
  aggressiveness: DecisionPolicyAggressiveness;
  riskAllowed: boolean;
  riskReasons: string[];
  capital?: {
    policyIntentNotionalIdr: number;
    allocatedNotionalIdr: number;
    cappedNotionalIdr: number;
    blocked: boolean;
    reasons: string[];
    pairClassBucket: string;
    discoveryBucket: string;
  };
  predictionContext?: {
    target: FutureTrendingPrediction['target'];
    horizonLabel: FutureTrendingPrediction['horizonLabel'];
    strength: FutureTrendingPrediction['strength'];
    confidence: number;
    calibrationTag: FutureTrendingPrediction['calibrationTag'];
    direction: FutureTrendingPrediction['direction'];
  };
  updatedAt: string;
}

export interface PolicyEvaluationContextSnapshot {
  score: number;
  confidence: number;
  marketRegime?: MarketRegime;
  discoveryBucket?: DiscoveryBucketType;
  recommendedAction?: OpportunityAction;
  entryTimingState?: EntryTimingState;
  pumpProbability?: number;
  trapProbability?: number;
  spoofRisk?: number;
  riskAllowed: boolean;
  riskReasonCount: number;
}

export interface PolicyEvaluationRecord {
  id: string;
  pair: string;
  accountId: string;
  entryDecisionAt: string;
  context: PolicyEvaluationContextSnapshot;
  finalDecision: DecisionPolicyOutput;
  policyParams: Pick<
    StrategySettings,
    'minScoreToBuy' | 'minConfidence' | 'minPumpProbability' | 'spoofRiskBlockThreshold'
  >;
  executionAnchor?: {
    orderId: string;
    positionId?: string;
    source: 'AUTO_RUNTIME_POLICY';
  };
  status: 'PENDING_EXECUTION' | 'EXECUTION_SKIPPED' | 'EXECUTION_FAILED' | 'PENDING_OUTCOME' | 'RESOLVED';
  statusReason?: string;
  resolution?: {
    outcomeId: string;
    positionId: string;
    outcomeAccuracy: SummaryAccuracy;
    outcomeNetPnl: number | null;
    outcomeReturnPct: number | null;
    closeReason: string;
    resolvedAt: string;
    eligibleForTuning: boolean;
    ineligibleReason?: string;
    sharedPositionLifecycle: boolean;
  };
}

export interface PolicyLearningTuningChange {
  key: 'minScoreToBuy' | 'minConfidence' | 'minPumpProbability';
  before: number;
  after: number;
  delta: number;
}

export interface PolicyLearningReadModel {
  lastEvaluatedAt: string;
  eligibleSamples: number;
  resolvedSamples: number;
  totalRecords: number;
  tuned: boolean;
  noOpReason?: string;
  reasons: string[];
  changes: PolicyLearningTuningChange[];
  laneSample: Record<DecisionPolicyEntryLane, number>;
  eligibleOutcomeIdsFingerprint: string;
  lastAppliedLearningSignature?: string;
  appliedEligibleOutcomeIds: string[];
}

export interface OrderRecord {
  id: string;
  pair: string;
  accountId: string;
  side: OrderSide;
  type: OrderType;
  status: 'NEW' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  price: number;
  quantity: number;
  filledQuantity: number;
  averageFillPrice: number | null;
  notionalIdr: number;
  referencePrice?: number | null;
  createdAt: string;
  updatedAt: string;
  source: 'MANUAL' | 'SEMI_AUTO' | 'AUTO';
  exchangeOrderId?: string;
  exchangeStatus?: string;
  exchangeUpdatedAt?: string;
  feeAmount?: number;
  feeAsset?: string;
  executedTradeCount?: number;
  lastExecutedAt?: string;
  relatedPositionId?: string;
  closeReason?: PositionCloseReason;
  entryStyle?: PositionEntryStyle;
  executionPlan?: ExecutionPlanReadModel;
  notes?: string;
}

export interface PositionRecord {
  id: string;
  pair: string;
  accountId: string;
  status: PositionStatus;
  side: 'long';
  quantity: number;
  entryPrice: number;
  averageEntryPrice: number;
  averageExitPrice: number | null;
  currentPrice: number;
  peakPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  entryFeesPaid?: number;
  totalEntryFeesPaid: number;
  exitFeesPaid?: number;
  totalBoughtQuantity: number;
  totalSoldQuantity: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  entryStyle: PositionEntryStyle;
  pumpState: PositionPumpState;
  lastContinuationScore: number;
  lastDumpRisk: number;
  lastScaleOutAt: string | null;
  emergencyExitArmed: boolean;
  exposurePairClass?: PairClass;
  exposureDiscoveryBucket?: DiscoveryBucketType;
  exposureSource?: 'POSITION_METADATA' | 'LEGACY_FALLBACK';
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  sourceOrderId?: string;
}

export interface ExitDecisionInput {
  pnlPct: number;
  peakPnlPct: number;
  spreadPct: number;
  retraceFromPeakPct: number;
  continuationScore: number;
  quoteFlowScore: number;
  imbalance: number;
  dumpRisk: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  emergencyExitArmed: boolean;
}

export interface ExitDecisionResult {
  action: ExitAction;
  shouldExit: boolean;
  shouldScaleOut: boolean;
  closeFraction: number;
  closeReason?: PositionCloseReason;
  rationale: string[];
}

export interface TradeRecord {
  id: string;
  pair: string;
  accountId: string;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
  realizedPnl: number;
  executedAt: string;
  sourceOrderId?: string;
  notes?: string;
}

export interface ExecutionSummary {
  id: string;
  orderId: string;
  accountId: string;
  account: string;
  pair: string;
  side: OrderSide;
  status: 'SUBMITTED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'FAILED';
  accuracy: SummaryAccuracy;
  referencePrice: number | null;
  intendedOrderPrice: number;
  averageFillPrice: number | null;
  filledQuantity: number;
  filledNotional: number;
  fee: number | null;
  feeAsset?: string | null;
  exchangeOrderId?: string;
  slippageVsReferencePricePct: number | null;
  executionPlan?: ExecutionPlanReadModel;
  timestamp: string;
  reason?: string;
}

export interface TradeOutcomeSummary {
  id: string;
  positionId: string;
  accountId: string;
  account: string;
  pair: string;
  accuracy: SummaryAccuracy;
  entryAverage: number | null;
  exitAverage: number | null;
  totalQuantity: number;
  totalFee: number | null;
  grossPnl: number | null;
  netPnl: number | null;
  returnPercentage: number | null;
  holdDurationMs: number | null;
  closeReason: string;
  timestamp: string;
  notes: string[];
}

export interface IndodaxCallbackEvent {
  id: string;
  path: string;
  method: string;
  host: string | null;
  allowedHost: string | null;
  accepted: boolean;
  response: 'ok' | 'fail';
  reason?: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  bodyText: string;
  parsedBody: Record<string, unknown> | null;
  verification: {
    mode: 'required' | 'disabled';
    verified: boolean;
    signatureHeaderPresent: boolean;
    timestampHeaderPresent: boolean;
    nonceHeaderPresent: boolean;
    timestampAgeMs: number | null;
    nonceReused: boolean;
  };
  receivedAt: string;
}

export interface IndodaxCallbackState {
  enabled: boolean;
  callbackPath: string;
  callbackUrl: string | null;
  allowedHost: string | null;
  lastReceivedAt: string | null;
  lastResponse: 'ok' | 'fail' | null;
  acceptedCount: number;
  rejectedCount: number;
  lastEventId: string | null;
  lastSourceHost: string | null;
  lastVerificationAt: string | null;
  nonceHistory: Array<{
    nonce: string;
    seenAt: string;
  }>;
}

export interface ShadowRunCheckResult {
  check: 'private_auth' | 'public_market' | 'reconciliation_read_model';
  endpoint: string;
  pass: boolean;
  account: string;
  summary: Record<string, unknown>;
  error?: {
    message: string;
    cause?: string;
  };
}

export interface ShadowRunEvidence {
  runId: string;
  timestamp: string;
  exchange: 'indodax';
  account: string;
  checks: ShadowRunCheckResult[];
  allPassed: boolean;
}

export type ShadowRunStatus = 'IDLE' | 'BERJALAN' | 'DIBLOK' | 'SELESAI' | 'GAGAL';
export type ShadowCheckStatus = 'LULUS' | 'GAGAL' | 'TIDAK DIUJI' | 'TIDAK TERSEDIA' | 'DIBLOK';
export type ShadowVerdict = 'SIAP CEK OBSERVASI' | 'SIAP SHADOW-RUN AMAN' | 'BELUM SIAP' | 'DIBLOK';

export interface ShadowRunTelegramSummary {
  runtimeStatus: 'RUNNING' | 'STOPPED';
  runtimeDetail: RuntimeStatus;
  shadowStatus: ShadowRunStatus;
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  blockReason: string | null;
  failureReason: string | null;
  publicMarket: ShadowCheckStatus;
  privateAuth: ShadowCheckStatus;
  reconciliation: ShadowCheckStatus;
  hotlistSignalOpportunity: 'TERSEDIA' | 'TIDAK TERSEDIA';
  intelligenceSpoofPattern: 'TERSEDIA' | 'TIDAK TERSEDIA';
  evidenceArchive: 'TERSIMPAN' | 'GAGAL TERSIMPAN' | 'TIDAK DIUJI';
  verdict: ShadowVerdict;
  nextSteps: string[];
}

export interface PairRuntimeState {
  pair: string;
  lastSeenAt: number;
  lastSignalAt: number | null;
  cooldownUntil: number | null;
  lastOpportunity: OpportunityAssessment | null;
}

export interface RuntimeState {
  status: RuntimeStatus;
  startedAt: string | null;
  stoppedAt: string | null;
  lastUpdatedAt: string;
  uptimeMs: number;
  activeTradingMode: TradingMode;
  pairCooldowns: Record<string, number>;
  pairs: Record<string, PairRuntimeState>;
  lastMarketOverview: MarketOverview | null;
  lastPumpCandidates: SignalCandidate[];
  lastHotlist: HotlistEntry[];
  lastSignals: SignalCandidate[];
  lastOpportunities: OpportunityAssessment[];
  lastRuntimePolicyDecision: RuntimePolicyReadModel | null;
  lastPolicyLearning?: PolicyLearningReadModel | null;
  tradeCount: number;
  lastTradeAt: string | null;
  pollingStats: {
    activeJobs: number;
    tickCount: number;
    lastTickAt: string | null;
  };
  emergencyStop: boolean;
}

export interface WorkerHealth {
  workerId: string;
  name: string;
  busy: boolean;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
}

export interface TelegramRuntimeHealth {
  configured: boolean;
  launched: boolean;
  running: boolean;
  connected: boolean;
  lastConnectionStatus: 'never_started' | 'connected' | 'failed' | 'stopped';
  allowedUsersCount: number;
  botId: number | null;
  botUsername: string | null;
  botFirstName: string | null;
  botIsBot: boolean | null;
  lastLaunchAt: string | null;
  lastConnectedAt: string | null;
  lastLaunchSuccessAt: string | null;
  lastLaunchError: string | null;
  lastLaunchErrorType: 'none' | 'missing_token' | 'invalid_token' | 'proxy_blocked' | 'network' | 'unknown';
}

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'down';
  updatedAt: string;
  runtimeStatus: RuntimeStatus;
  scannerRunning: boolean;
  telegramConfigured: boolean;
  telegramRunning: boolean;
  telegramConnection: TelegramRuntimeHealth;
  callbackServerRunning: boolean;
  tradingEnabled: boolean;
  executionMode: ExecutionMode;
  activePairsTracked: number;
  workers: WorkerHealth[];
  notes: string[];
}

export interface JournalEntry {
  id: string;
  type:
    | 'INFO'
    | 'WARN'
    | 'ERROR'
    | 'SIGNAL'
    | 'TRADE'
    | 'POSITION'
    | 'SYSTEM'
    | 'BACKTEST';
  title: string;
  message: string;
  pair?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface RiskCheckResult {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
  entryLane?: 'DEFAULT' | 'SCOUT' | 'ADD_ON_CONFIRM';
  baseAmountIdr?: number;
  adjustedAmountIdr?: number;
}

export interface OperatorCapitalReadModel {
  pair: string;
  policyAction: DecisionPolicyAction;
  policySizeIntentMultiplier: number;
  allocatedNotionalIdr: number;
  cappedNotionalIdr: number;
  blocked: boolean;
  pairClassBucket: string;
  discoveryBucket: string;
  reasons: string[];
}

export interface ManualOrderRequest {
  accountId: string;
  pair: string;
  side: OrderSide;
  price?: number;
  quantity: number;
  type: OrderType;
}

export type AutoExecutionDecision = DecisionPolicyOutput;

export interface BacktestRunConfig {
  pair?: string;
  startTime?: number;
  endTime?: number;
  maxEvents?: number;
}

export interface BacktestRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  pairsTested: string[];
  signalsGenerated: number;
  entriesTaken: number;
  exitsTaken: number;
  wins: number;
  losses: number;
  netPnl: number;
  notes: string[];
}

export interface StartStopApp {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}
