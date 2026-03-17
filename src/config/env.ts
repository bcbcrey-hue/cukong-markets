import path from 'node:path';

export type TradingMode = 'OFF' | 'ALERT_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface EnvConfig {
  nodeEnv: string;
  appName: string;

  telegramToken: string;
  telegramAllowedUserIds: number[];

  logLevel: LogLevel;

  dataDir: string;
  logDir: string;
  tempDir: string;

  accountsDir: string;
  accountsFile: string;

  stateDir: string;
  stateFile: string;
  ordersFile: string;
  positionsFile: string;
  tradesFile: string;
  healthFile: string;
  journalFile: string;
  settingsFile: string;

  historyDir: string;
  pairHistoryFile: string;
  anomalyEventsFile: string;
  patternOutcomesFile: string;
  executionSummaryFile: string;
  tradeOutcomeFile: string;

  backtestDir: string;

  indodaxPublicBaseUrl: string;
  indodaxPrivateBaseUrl: string;
  indodaxTimeoutMs: number;

  pollingIntervalMs: number;
  marketWatchIntervalMs: number;
  hotlistLimit: number;
  maxPairsTracked: number;

  defaultTradingMode: TradingMode;
  defaultQuoteAsset: string;

  riskMaxOpenPositions: number;
  riskMaxPositionSizeIdr: number;
  riskMaxPairSpreadPct: number;
  riskCooldownMs: number;

  workerEnabled: boolean;
  workerPoolSize: number;

  scannerHistoryLimit: number;
  orderbookDepthLevels: number;
  tradeClusterWindowMs: number;

  probabilityThresholdAuto: number;
  confidenceThresholdAuto: number;
  spoofRiskBlockThreshold: number;
  buySlippageBps: number;
  maxBuySlippageBps: number;
  buyOrderTimeoutMs: number;
}

function readString(name: string, fallback = ''): string {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
}

function readRequiredString(name: string): string {
  const value = readString(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
  const raw = readString(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in environment variable ${name}: "${raw}"`);
  }

  return parsed;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean in environment variable ${name}: "${raw}"`);
}

function readStringEnum<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readString(name);
  if (!raw) {
    return fallback;
  }

  if ((allowed as readonly string[]).includes(raw)) {
    return raw as T;
  }

  throw new Error(
    `Invalid value for ${name}: "${raw}". Allowed: ${allowed.join(', ')}`,
  );
}

function readNumberList(name: string): number[] {
  const raw = readString(name);
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const parsed = Number(item);
      if (!Number.isInteger(parsed)) {
        throw new Error(
          `Invalid TELEGRAM user id in ${name}: "${item}" is not an integer`,
        );
      }
      return parsed;
    });
}

const tradingModes = ['OFF', 'ALERT_ONLY', 'SEMI_AUTO', 'FULL_AUTO'] as const;
const logLevels = ['debug', 'info', 'warn', 'error'] as const;

const rootDataDir = readString('DATA_DIR', path.resolve(process.cwd(), 'data'));
const rootLogDir = readString('LOG_DIR', path.resolve(process.cwd(), 'logs'));
const rootTempDir = readString('TEMP_DIR', path.resolve(process.cwd(), 'tmp'));

const accountsDir = path.resolve(rootDataDir, 'accounts');
const stateDir = path.resolve(rootDataDir, 'state');
const historyDir = path.resolve(rootDataDir, 'history');
const backtestDir = path.resolve(rootDataDir, 'backtest');

export const env: EnvConfig = {
  nodeEnv: readString('NODE_ENV', 'development'),
  appName: readString('APP_NAME', 'mafiamarkets'),

  telegramToken: readRequiredString('TELEGRAM_BOT_TOKEN'),
  telegramAllowedUserIds: readNumberList('TELEGRAM_ALLOWED_USER_IDS'),

  logLevel: readStringEnum('LOG_LEVEL', logLevels, 'info'),

  dataDir: rootDataDir,
  logDir: rootLogDir,
  tempDir: rootTempDir,

  accountsDir,
  accountsFile: path.resolve(accountsDir, 'accounts.json'),

  stateDir,
  stateFile: path.resolve(stateDir, 'runtime-state.json'),
  ordersFile: path.resolve(stateDir, 'orders.json'),
  positionsFile: path.resolve(stateDir, 'positions.json'),
  tradesFile: path.resolve(stateDir, 'trades.json'),
  healthFile: path.resolve(stateDir, 'health.json'),
  journalFile: path.resolve(stateDir, 'journal.jsonl'),
  settingsFile: path.resolve(stateDir, 'settings.json'),

  historyDir,
  pairHistoryFile: path.resolve(historyDir, 'pair-history.jsonl'),
  anomalyEventsFile: path.resolve(historyDir, 'anomaly-events.jsonl'),
  patternOutcomesFile: path.resolve(historyDir, 'pattern-outcomes.jsonl'),
  executionSummaryFile: path.resolve(historyDir, 'execution-summaries.jsonl'),
  tradeOutcomeFile: path.resolve(historyDir, 'trade-outcomes.jsonl'),

  backtestDir,

  indodaxPublicBaseUrl: readString(
    'INDODAX_PUBLIC_BASE_URL',
    'https://indodax.com/api',
  ),
  indodaxPrivateBaseUrl: readString(
    'INDODAX_PRIVATE_BASE_URL',
    'https://indodax.com/tapi',
  ),
  indodaxTimeoutMs: readNumber('INDODAX_TIMEOUT_MS', 15_000),

  pollingIntervalMs: readNumber('POLLING_INTERVAL_MS', 5_000),
  marketWatchIntervalMs: readNumber('MARKET_WATCH_INTERVAL_MS', 10_000),
  hotlistLimit: readNumber('HOTLIST_LIMIT', 15),
  maxPairsTracked: readNumber('MAX_PAIRS_TRACKED', 250),

  defaultTradingMode: readStringEnum(
    'DEFAULT_TRADING_MODE',
    tradingModes,
    'ALERT_ONLY',
  ),
  defaultQuoteAsset: readString('DEFAULT_QUOTE_ASSET', 'idr').toLowerCase(),

  riskMaxOpenPositions: readNumber('RISK_MAX_OPEN_POSITIONS', 3),
  riskMaxPositionSizeIdr: readNumber('RISK_MAX_POSITION_SIZE_IDR', 100_000),
  riskMaxPairSpreadPct: readNumber('RISK_MAX_PAIR_SPREAD_PCT', 1.25),
  riskCooldownMs: readNumber('RISK_COOLDOWN_MS', 15 * 60 * 1000),

  workerEnabled: readBoolean('WORKER_ENABLED', true),
  workerPoolSize: readNumber('WORKER_POOL_SIZE', 2),

  scannerHistoryLimit: readNumber('SCANNER_HISTORY_LIMIT', 300),
  orderbookDepthLevels: readNumber('ORDERBOOK_DEPTH_LEVELS', 20),
  tradeClusterWindowMs: readNumber('TRADE_CLUSTER_WINDOW_MS', 15_000),

  probabilityThresholdAuto: readNumber('PROBABILITY_THRESHOLD_AUTO', 0.72),
  confidenceThresholdAuto: readNumber('CONFIDENCE_THRESHOLD_AUTO', 0.68),
  spoofRiskBlockThreshold: readNumber('SPOOF_RISK_BLOCK_THRESHOLD', 0.55),
  buySlippageBps: readNumber('BUY_SLIPPAGE_BPS', 25),
  maxBuySlippageBps: readNumber('MAX_BUY_SLIPPAGE_BPS', 80),
  buyOrderTimeoutMs: readNumber('BUY_ORDER_TIMEOUT_MS', 8_000),
};

export function isProductionEnv(): boolean {
  return env.nodeEnv === 'production';
}
