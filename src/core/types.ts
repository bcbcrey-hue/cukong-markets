export type TradingMode = 'OFF' | 'ALERT_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';
export type ExecutionMode = 'SIMULATED' | 'LIVE';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type PositionStatus = 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';
export type RuntimeStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type EntryTimingState = 'EARLY' | 'READY' | 'LATE' | 'AVOID';
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

export interface TradePrint {
  pair: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell' | 'unknown';
  timestamp: number;
}

export interface MarketSnapshot {
  pair: string;
  ticker: PairTickerSnapshot;
  orderbook: OrderbookSnapshot | null;
  recentTrades: TradePrint[];
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
  score: number;
  confidence: number;
  reasons: string[];
  warnings: string[];
  regime: MarketRegime;
  breakoutPressure: number;
  volumeAcceleration: number;
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
  volumeAccelerationScore: number;
  liquidityQualityScore: number;
  spreadScore: number;
  exhaustionRiskScore: number;
  timestamp: number;
  evidence: string[];
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
}

export interface OpportunityAssessment {
  pair: string;
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
  volumeAcceleration: number;
  orderbookImbalance: number;
  change1m: number;
  change5m: number;
  entryTiming: EntryTimingAssessment;
  reasons: string[];
  warnings: string[];
  featureBreakdown: ScoreContribution[];
  historicalContext?: HistoricalContext;
  recommendedAction: 'WATCH' | 'PREPARE_ENTRY' | 'CONFIRM_ENTRY' | 'AVOID' | 'ENTER';
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
  timestamp: number;
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
  closeReason?: string;
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
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  sourceOrderId?: string;
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
}

export interface ManualOrderRequest {
  accountId: string;
  pair: string;
  side: OrderSide;
  price?: number;
  quantity: number;
  type: OrderType;
}

export interface AutoExecutionDecision {
  shouldEnter: boolean;
  shouldExit: boolean;
  action:
    | 'NONE'
    | 'WATCH'
    | 'PREPARE_ENTRY'
    | 'CONFIRM_ENTRY'
    | 'ENTER'
    | 'EXIT'
    | 'AVOID';
  reasons: string[];
}

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
