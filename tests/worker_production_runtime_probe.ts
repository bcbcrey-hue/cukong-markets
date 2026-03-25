import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const outsideCwd = await mkdtemp(path.join(os.tmpdir(), 'cukong-worker-prod-'));

  const script = `
const { WorkerPoolService } = require(${JSON.stringify(path.resolve(repoRoot, 'dist/services/workerPoolService.js'))});

const snapshot = {
  pair: 'btc_idr',
  ticker: {
    pair: 'btc_idr',
    lastPrice: 1000000000,
    bid: 999000000,
    ask: 1001000000,
    high24h: 1020000000,
    low24h: 980000000,
    volume24hBase: 1000,
    volume24hQuote: 1000000000,
    change24hPct: 1,
    timestamp: Date.now(),
  },
  orderbook: {
    pair: 'btc_idr',
    bids: [{ price: 999000000, volume: 100 }],
    asks: [{ price: 1001000000, volume: 100 }],
    bestBid: 999000000,
    bestAsk: 1001000000,
    spread: 2000000,
    spreadPct: 0.2,
    midPrice: 1000000000,
    timestamp: Date.now(),
  },
  recentTrades: [{ pair: 'btc_idr', price: 1000000000, quantity: 1, side: 'buy', timestamp: Date.now() - 1000 }],
  timestamp: Date.now(),
};

const signal = {
  pair: 'btc_idr',
  score: 80,
  confidence: 0.9,
  reasons: ['probe'],
  warnings: [],
  regime: 'BREAKOUT_SETUP',
  breakoutPressure: 60,
  quoteFlowAccelerationScore: 50,
  orderbookImbalance: 0.1,
  spreadPct: 0.2,
  marketPrice: 1000000000,
  bestBid: 999000000,
  bestAsk: 1001000000,
  liquidityScore: 80,
  change1m: 0.1,
  change5m: 0.2,
  contributions: [],
  timestamp: Date.now(),
};

(async () => {
  const pool = new WorkerPoolService(1, true);
  const featureRuntime = pool.getWorkerRuntimeMetadata('feature');
  await pool.start();

  const feature = await pool.runFeatureTask({ snapshot, signal, recentSnapshots: [snapshot] });

  await pool.stop();

  console.log(JSON.stringify({
    workerPath: featureRuntime.workerPath,
    usedTsxCli: featureRuntime.useTsxCli,
    accumulationScore: feature.accumulationScore,
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  const { stdout, stderr } = await execFileAsync(process.execPath, ['-e', script], {
    cwd: outsideCwd,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'probe-token',
      TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS || '1',
      DATA_DIR: process.env.DATA_DIR || path.join(outsideCwd, 'data'),
      LOG_DIR: process.env.LOG_DIR || path.join(outsideCwd, 'logs'),
      TEMP_DIR: process.env.TEMP_DIR || path.join(outsideCwd, 'tmp'),
    },
  });

  if (stderr.trim()) {
    throw new Error(stderr);
  }

  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const resultLine = lines.at(-1);
  assert.ok(resultLine, 'Probe output is empty');

  const result = JSON.parse(resultLine) as {
    workerPath: string;
    usedTsxCli: boolean;
    accumulationScore: number;
  };

  assert.ok(
    result.workerPath.endsWith(path.join('dist', 'workers', 'featureWorker.js')),
    `Expected dist worker path, got ${result.workerPath}`,
  );
  assert.equal(
    result.usedTsxCli,
    false,
    'Production build worker must run as .js worker, not tsx cli',
  );
  assert.ok(Number.isFinite(result.accumulationScore), 'Feature worker result should be finite');

  console.log('PASS worker_production_runtime_probe');
}

main().catch((error) => {
  console.error('FAIL worker_production_runtime_probe');
  console.error(error);
  process.exit(1);
});
