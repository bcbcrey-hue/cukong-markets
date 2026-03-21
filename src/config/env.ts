import path from 'node:path';

export type TradingMode = 'OFF' | 'ALERT_ONLY' | 'SEMI_AUTO' | 'FULL_AUTO';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type IndodaxHistoryMode = 'v2_only' | 'legacy';
export type IndodaxCallbackAuthMode = 'required' | 'disabled';

export interface EnvConfig {
  nodeEnv: string;
  appName: string;
  publicBaseUrl: string;
  appPort: number;
  appBindHost: string;

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
  callbackEventsFile: string;
  callbackStateFile: string;

  backtestDir: string;

  indodaxPublicBaseUrl: string;
  indodaxPrivateBaseUrl: string;
  indodaxTradeApiV2BaseUrl: string;
  indodaxTimeoutMs: number;
  indodaxPublicMinIntervalMs: number;
  indodaxPrivateMinIntervalMs: number;
  indodaxPrivateLiveMinIntervalMs: number;
  indodaxPrivateReconcileMinIntervalMs: number;
  indodaxPrivateBackgroundMinIntervalMs: number;
  indodaxHistoryMode: IndodaxHistoryMode;
  indodaxCallbackPath: string;
  indodaxCallbackPort: number;
  indodaxCallbackBindHost: string;
  indodaxCallbackAllowedHost: string;
  indodaxEnableCallbackServer: boolean;
  indodaxCallbackUrl: string | null;
  indodaxCallbackAuthMode: IndodaxCallbackAuthMode;
  indodaxCallbackSignatureSecret: string;
  indodaxCallbackSignatureHeader: string;
  indodaxCallbackTimestampHeader: string;
  indodaxCallbackNonceHeader: string;
  indodaxCallbackReplayWindowMs: number;
  indodaxCallbackMaxSkewMs: number;

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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePath(value: string, fallback: string): string {
  const candidate = value.trim() || fallback;
  const withLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

function readStablePath(name: string, stablePath: string): string {
  const normalized = normalizePath(readString(name, stablePath), stablePath);
  if (normalized !== stablePath) {
    throw new Error(`${name} must remain ${stablePath} to keep internal route stable`);
  }
  return normalized;
}

function deriveHostFromUrl(value: string): string {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function deriveCallbackUrl(publicBaseUrl: string, callbackPath: string): string | null {
  if (!publicBaseUrl) {
    return null;
  }

  try {
    return new URL(callbackPath, `${normalizeBaseUrl(publicBaseUrl)}/`).toString();
  } catch {
    return null;
  }
}

function readRequiredString(name: string): string {
  const value = readString(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertProductionRoutingEnv(config: Pick<EnvConfig, 'nodeEnv' | 'indodaxEnableCallbackServer'>): void {
  if (config.nodeEnv !== 'production') {
    return;
  }

  const required = ['PUBLIC_BASE_URL', 'APP_PORT', 'APP_BIND_HOST'] as const;
  for (const name of required) {
    if (!readString(name)) {
      throw new Error(`Missing required environment variable in production: ${name}`);
    }
  }

  if (config.indodaxEnableCallbackServer) {
    const callbackRequired = [
      'INDODAX_CALLBACK_PATH',
      'INDODAX_CALLBACK_PORT',
      'INDODAX_CALLBACK_BIND_HOST',
      'INDODAX_CALLBACK_ALLOWED_HOST',
    ] as const;
    for (const name of callbackRequired) {
      if (!readString(name)) {
        throw new Error(`Missing required environment variable in production: ${name}`);
      }
    }
  }
}

function assertProductionCallbackSecurityEnv(
  config: Pick<
    EnvConfig,
    'nodeEnv' | 'indodaxEnableCallbackServer' | 'indodaxCallbackAuthMode' | 'indodaxCallbackSignatureSecret'
  >,
): void {
  if (config.nodeEnv !== 'production' || !config.indodaxEnableCallbackServer) {
    return;
  }

  if (config.indodaxCallbackAuthMode !== 'required') {
    throw new Error('INDODAX_CALLBACK_AUTH_MODE must be "required" in production when callback server is enabled');
  }

  if (!config.indodaxCallbackSignatureSecret) {
    throw new Error('INDODAX_CALLBACK_SIGNATURE_SECRET is required in production when callback server is enabled');
  }
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
const historyModes = ['v2_only', 'legacy'] as const;
const callbackAuthModes = ['required', 'disabled'] as const;

function normalizeIndodaxHistoryMode(raw: string, fallback: IndodaxHistoryMode): IndodaxHistoryMode {
  if (!raw) {
    return fallback;
  }

  if (raw === 'v2_only' || raw === 'v2_prefer') {
    return 'v2_only';
  }

  if (raw === 'legacy') {
    return 'legacy';
  }

  throw new Error(`Invalid value for INDODAX_HISTORY_MODE: "${raw}". Allowed: v2_only, legacy`);
}

const rootDataDir = readString('DATA_DIR', path.resolve(process.cwd(), 'data'));
const rootLogDir = readString('LOG_DIR', path.resolve(process.cwd(), 'logs'));
const rootTempDir = readString('TEMP_DIR', path.resolve(process.cwd(), 'tmp'));
const publicBaseUrl = normalizeBaseUrl(readString('PUBLIC_BASE_URL', ''));
const indodaxCallbackPath = readStablePath('INDODAX_CALLBACK_PATH', '/indodax/callback');

const accountsDir = path.resolve(rootDataDir, 'accounts');
const stateDir = path.resolve(rootDataDir, 'state');
const historyDir = path.resolve(rootDataDir, 'history');
const backtestDir = path.resolve(rootDataDir, 'backtest');

export const env: EnvConfig = {
  nodeEnv: readString('NODE_ENV', 'development'),
  appName: readString('APP_NAME', 'cukong-markets'),
  publicBaseUrl,
  appPort: readNumber('APP_PORT', 3000),
  appBindHost: readString('APP_BIND_HOST', '0.0.0.0'),

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
  callbackEventsFile: path.resolve(historyDir, 'indodax-callback-events.jsonl'),
  callbackStateFile: path.resolve(stateDir, 'indodax-callback-state.json'),

  backtestDir,

  indodaxPublicBaseUrl: readString(
    'INDODAX_PUBLIC_BASE_URL',
    'https://indodax.com/api',
  ),
  indodaxPrivateBaseUrl: readString(
    'INDODAX_PRIVATE_BASE_URL',
    'https://indodax.com/tapi',
  ),
  indodaxTradeApiV2BaseUrl: readString(
    'INDODAX_TRADE_API_V2_BASE_URL',
    'https://tapi.indodax.com',
  ),
  indodaxTimeoutMs: readNumber('INDODAX_TIMEOUT_MS', 15_000),
  indodaxPublicMinIntervalMs: readNumber('INDODAX_PUBLIC_MIN_INTERVAL_MS', 250),
  indodaxPrivateMinIntervalMs: readNumber('INDODAX_PRIVATE_MIN_INTERVAL_MS', 300),
  indodaxPrivateLiveMinIntervalMs: readNumber(
    'INDODAX_PRIVATE_LIVE_MIN_INTERVAL_MS',
    readNumber('INDODAX_PRIVATE_MIN_INTERVAL_MS', 300),
  ),
  indodaxPrivateReconcileMinIntervalMs: readNumber(
    'INDODAX_PRIVATE_RECONCILE_MIN_INTERVAL_MS',
    Math.max(300, readNumber('INDODAX_PRIVATE_MIN_INTERVAL_MS', 300)),
  ),
  indodaxPrivateBackgroundMinIntervalMs: readNumber(
    'INDODAX_PRIVATE_BACKGROUND_MIN_INTERVAL_MS',
    Math.max(450, readNumber('INDODAX_PRIVATE_MIN_INTERVAL_MS', 300) + 150),
  ),
  indodaxHistoryMode: normalizeIndodaxHistoryMode(readString('INDODAX_HISTORY_MODE'), 'v2_only'),
  indodaxCallbackPath,
  indodaxCallbackPort: readNumber('INDODAX_CALLBACK_PORT', 3001),
  indodaxCallbackBindHost: readString('INDODAX_CALLBACK_BIND_HOST', '0.0.0.0'),
  indodaxCallbackAllowedHost: readString(
    'INDODAX_CALLBACK_ALLOWED_HOST',
    deriveHostFromUrl(publicBaseUrl),
  ),
  indodaxEnableCallbackServer: readBoolean('INDODAX_ENABLE_CALLBACK_SERVER', false),
  indodaxCallbackUrl: deriveCallbackUrl(publicBaseUrl, indodaxCallbackPath),
  indodaxCallbackAuthMode: readStringEnum(
    'INDODAX_CALLBACK_AUTH_MODE',
    callbackAuthModes,
    'required',
  ),
  indodaxCallbackSignatureSecret: readString('INDODAX_CALLBACK_SIGNATURE_SECRET', ''),
  indodaxCallbackSignatureHeader: readString(
    'INDODAX_CALLBACK_SIGNATURE_HEADER',
    'x-indodax-signature',
  ).toLowerCase(),
  indodaxCallbackTimestampHeader: readString(
    'INDODAX_CALLBACK_TIMESTAMP_HEADER',
    'x-indodax-timestamp',
  ).toLowerCase(),
  indodaxCallbackNonceHeader: readString(
    'INDODAX_CALLBACK_NONCE_HEADER',
    'x-indodax-nonce',
  ).toLowerCase(),
  indodaxCallbackReplayWindowMs: readNumber('INDODAX_CALLBACK_REPLAY_WINDOW_MS', 5 * 60 * 1000),
  indodaxCallbackMaxSkewMs: readNumber('INDODAX_CALLBACK_MAX_SKEW_MS', 60 * 1000),

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
  buySlippageBps: readNumber('BUY_SLIPPAGE_BPS', 60),
  maxBuySlippageBps: readNumber('MAX_BUY_SLIPPAGE_BPS', 150),
  buyOrderTimeoutMs: readNumber('BUY_ORDER_TIMEOUT_MS', 8_000),
};

assertProductionRoutingEnv(env);
assertProductionCallbackSecurityEnv(env);

export function isProductionEnv(): boolean {
  return env.nodeEnv === 'production';
}

export function getIndodaxHistoryMode(): IndodaxHistoryMode {
  return normalizeIndodaxHistoryMode(readString('INDODAX_HISTORY_MODE'), env.indodaxHistoryMode);
}
