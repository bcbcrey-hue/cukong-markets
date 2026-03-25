import assert from 'node:assert/strict';

import { PairUniverse } from '../src/domain/market/pairUniverse';
import { SignalEngine } from '../src/domain/signals/signalEngine';
import { WorkerPoolService } from '../src/services/workerPoolService';
import type { MarketSnapshot } from '../src/core/types';

function makeSnapshot(pair: string, price: number): MarketSnapshot {
  const now = Date.now();
  return {
    pair,
    ticker: {
      pair,
      lastPrice: price,
      bid: price * 0.999,
      ask: price * 1.001,
      high24h: price * 1.02,
      low24h: price * 0.98,
      volume24hBase: 1000,
      volume24hQuote: 1_000_000,
      change24hPct: 1,
      timestamp: now,
    },
    orderbook: {
      pair,
      bids: [{ price: price * 0.999, volume: 100 }],
      asks: [{ price: price * 1.001, volume: 100 }],
      bestBid: price * 0.999,
      bestAsk: price * 1.001,
      spread: price * 0.002,
      spreadPct: 0.2,
      midPrice: price,
      timestamp: now,
    },
    recentTrades: [{ pair, price, quantity: 1, side: 'buy', timestamp: now - 1000, source: 'INFERRED_SNAPSHOT_DELTA', quality: 'PROXY', inferenceBasis: 'volume24hQuote_delta_and_price_direction' }],
    recentTradesSource: 'INFERRED_PROXY',
    timestamp: now,
  };
}

async function main() {
  const workerPool = new WorkerPoolService(1, true);
  await workerPool.start();

  const snapshot = makeSnapshot('btc_idr', 1_000_000_000);
  const signal = new SignalEngine(new PairUniverse()).score(snapshot);

  try {
    await (workerPool as unknown as {
      enqueue: (type: 'feature', payload: unknown, timeoutMs: number) => Promise<unknown>;
    }).enqueue(
      'feature',
      { snapshot, signal, recentSnapshots: [snapshot] },
      1,
    );
  } catch {
    // Expected timeout path for probe.
  }

  await new Promise((resolve) => setTimeout(resolve, 25));
  const workers = workerPool.snapshot();

  const featureWorker = workers.find((worker) => worker.name === 'feature');
  assert.ok(featureWorker, 'Feature worker must exist');
  assert.equal(
    featureWorker.busy,
    false,
    'Feature worker should recover to idle after timed-out task',
  );

  await workerPool.stop();
  console.log('PASS worker_timeout_probe');
}

main().catch((error) => {
  console.error('FAIL worker_timeout_probe');
  console.error(error);
  process.exit(1);
});
