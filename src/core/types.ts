export type TradingMode = 'OFF' | 'ALERT\_ONLY' | 'SEMI\_AUTO' | 'FULL\_AUTO';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'open' | 'partial' | 'filled' | 'canceled' | 'rejected' | 'expired';
export type PositionStatus = 'open' | 'closed';
export type ExitReason =
  | 'manual'
  | 'take\_profit'
  | 'stop\_loss'
  | 'trailing\_stop'
  | 'max\_hold'
  | 'volume\_collapse'
  | 'momentum\_failure'
  | 'emergency'
  | 'force\_close';
export type PairTier = 'HOT' | 'A' | 'B' | 'C';

export interface AccountCredential {
  id: string;
  name: string;
  apiKey: string;
  apiSecret: string;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyAccountInput {
  name: string;
  apiKey: string;
  apiSecret: string;
}

export interface AccountsMeta {
  lastUpdatedAt: string | null;
  defaultAccountId: string | null;
  source: 'telegram\_upload' | 'manual' | 'migration';
  totalAccounts: number;
}

export interface BidAskLevel {
  price: number;
  volume: number;
}

export interface OrderbookSnapshot {
  pair: string;
  bids: BidAskLevel\[];
  asks: BidAskLevel\[];
  bestBid: number;
  bestAsk: number;
  bidDepthTop5: number;
  askDepthTop5: number;
  imbalanceTop5: number;
  spreadPct: number;
  capturedAt: string;
}

export interface TickerSnapshot {
  pair: string;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadPct: number;
  baseVolume24h: number;
  quoteVolume24h: number;
  priceChange24hPct: number;
  change1m: number;
  change3m: number;
  change5m: number;
  change15m: number;
  velocity1m: number;
  velocity5m: number;
  volume1m: number;
  volume3m: number;
  volume5m: number;
  volume15m: number;
  tradeBurstScore: number;
  breakoutDistancePct: number;
  liquidityScore: number;
  capturedAt: string;
}

export interface PairMetrics {
  pair: string;
  tier: PairTier;
  hotness: number;
  lastScore: number;
  lastSignalAt: string | null;
  lastPolledAt: string | null;
  pollIntervalMs: number;
  snapshots: TickerSnapshot\[];
}

export interface ScoreBreakdown {
  total: number;
  volumeAnomaly: number;
  priceAcceleration: number;
  spreadTightening: number;
  orderbookImbalance: number;
  tradeBurst: number;
  breakoutReadiness: number;
  momentumPersistence: number;
  slippagePenalty: number;
  liquidityPenalty: number;
  overextensionPenalty: number;
  spoofPenalty: number;
  notes: string\[];
}

export interface StrategyResult {
  name: string;
  passed: boolean;
  weight: number;
  note: string;
}

export interface SignalCandidate {
  pair: string;
  score: number;
  breakdown: ScoreBreakdown;
  strategies: StrategyResult\[];
  ticker: TickerSnapshot;
  orderbook: OrderbookSnapshot | null;
  createdAt: string;
}

export interface RuntimeOrder {
  id: string;
  accountId: string;
  pair: string;
  side: OrderSide;
  type: 'market' | 'limit';
  price: number;
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  externalOrderId?: string;
  reason?: string;
}

export interface RuntimePosition {
  id: string;
  accountId: string;
  pair: string;
  status: PositionStatus;
  entryPrice: number;
  quantity: number;
  remainingQuantity: number;
  openedAt: string;
  updatedAt: string;
  closedAt: string | null;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  maxHoldMinutes: number;
  scoreAtEntry: number;
  entryReason: string;
  lastMarkPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  exitReason: ExitReason | null;
}

export interface TradeJournalEntry {
  id: string;
  accountId: string;
  pair: string;
  side: OrderSide;
  quantity: number;
  price: number;
  fee: number;
  pnl: number;
  scoreSnapshot: number;
  reason: string;
  createdAt: string;
}

export interface RiskSettings {
  maxModalPerTrade: number;
  maxActivePositionsTotal: number;
  maxActivePositionsPerAccount: number;
  maxExposurePerPair: number;
  cooldownMinutesPerPair: number;
  maxSlippagePct: number;
  maxSpreadPct: number;
  minLiquidityScore: number;
  orderFillTimeoutMs: number;
  cancelStaleOrderMs: number;
  maxConsecutiveLosses: number;
}

export interface StrategySettings {
  scoreWatchlistThreshold: number;
  scoreAlertThreshold: number;
  scoreAutoEntryThreshold: number;
  enableVolumeSpike: boolean;
  enableOrderbookImbalance: boolean;
  enableSilentAccumulation: boolean;
  enableBreakoutRetest: boolean;
  enableHotRotation: boolean;
}

export interface BotSettings {
  tradingMode: TradingMode;
  dryRun: boolean;
  paperTrade: boolean;
  uiOnly: boolean;
  strategy: StrategySettings;
  risk: RiskSettings;
}

export interface RuntimeState {
  started: boolean;
  startedAt: string | null;
  updatedAt: string;
  uptimeMs: number;
  lastSignalAt: string | null;
  lastTradeAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  marketWatcherRunning: boolean;
  tradingMode: TradingMode;
  pairCooldowns: Record<string, string>;
  cacheStats: {
    hit: number;
    miss: number;
  };
  pollingStats: {
    activeJobs: number;
    tickCount: number;
    lastTickAt: string | null;
  };
}

export interface PersistenceSnapshot {
  state: RuntimeState;
  positions: RuntimePosition\[];
  orders: RuntimeOrder\[];
  trades: TradeJournalEntry\[];
  pairMetrics: PairMetrics\[];
  hotlist: SignalCandidate\[];
  accountsMeta: AccountsMeta;
  settings: BotSettings;
}

export interface HealthSnapshot {
  uptimeMs: number;
  started: boolean;
  mode: TradingMode;
  positionsOpen: number;
  pendingOrders: number;
  hotlistCount: number;
  lastSignalAt: string | null;
  lastTradeAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  activeJobs: number;
  tickCount: number;
}
