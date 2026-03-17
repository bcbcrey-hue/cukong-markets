export type TradingMode = 'OFF' | 'ALERT_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type PositionStatus = 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';
export type RuntimeStatus = 'IDLE' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR';
export type EntryTimingState = 'EARLY' | 'READY' | 'LATE' | 'AVOID';
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

export interface StoredAccount extends LegacyUploadedAccount {
  id: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
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
  liquidityScore: number;
  change1m: number;
  change5m: number;
  contributions: ScoreContribution[];
  timestamp: number;
}

export interface HotlistEntry extends SignalCandidate {
  rank: number;
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
  currentPrice: number;
  peakPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  entryFeesPaid?: number;
  exitFeesPaid?: number;
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

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'down';
  updatedAt: string;
  runtimeStatus: RuntimeStatus;
  scannerRunning: boolean;
  telegramRunning: boolean;
  tradingEnabled: boolean;
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
