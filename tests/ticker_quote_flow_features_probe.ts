import assert from 'node:assert/strict';

import type { MarketSnapshot, PairTickerSnapshot } from '../src/core/types';
import { TickerSnapshotStore } from '../src/domain/market/tickerSnapshot';
import type { PairUniverse } from '../src/domain/market/pairUniverse';
import { SignalEngine } from '../src/domain/signals/signalEngine';

function ticker(partial: Partial<PairTickerSnapshot> & Pick<PairTickerSnapshot, 'timestamp'>): PairTickerSnapshot {
  return {
    pair: 'abc_idr',
    lastPrice: 100,
    bid: 99,
    ask: 101,
    high24h: 120,
    low24h: 80,
    volume24hBase: 1,
    volume24hQuote: 0,
    change24hPct: 0,
    ...partial,
  };
}

async function main(): Promise<void> {
  const store = new TickerSnapshotStore();
  const baseTs = 1_700_000_000_000;

  store.buildFeatures(ticker({ timestamp: baseTs, volume24hQuote: 1_000 }));
  store.buildFeatures(ticker({ timestamp: baseTs + 30_000, volume24hQuote: 1_300 }));
  const oneMinute = store.buildFeatures(ticker({ timestamp: baseTs + 60_000, volume24hQuote: 1_600 }));

  assert.equal(oneMinute.quoteFlow1m, 600, 'quoteFlow1m must use positive delta between snapshots');
  assert.equal(oneMinute.quoteFlow3m, 600, 'quoteFlow3m should match observed cumulative delta in early history');
  assert.equal(oneMinute.quoteFlow5m, 600, 'quoteFlow5m should match observed cumulative delta in early history');
  assert.equal(oneMinute.quoteFlow15mAvgPerMin, 40, '15m average proxy must be normalized to per-minute baseline');
  assert.equal(oneMinute.quoteFlowAccelerationScore, 100, 'acceleration score should clamp to 100 on strong 1m proxy flow');

  store.buildFeatures(ticker({ timestamp: baseTs + 90_000, volume24hQuote: 100 }));
  const afterReset = store.buildFeatures(ticker({ timestamp: baseTs + 120_000, volume24hQuote: 400 }));

  assert.equal(
    afterReset.quoteFlow1m,
    600,
    'quote-flow must ignore negative reset delta and continue counting positive deltas only',
  );

  const coldStartStore = new TickerSnapshotStore();
  const coldStart = coldStartStore.buildFeatures(ticker({ timestamp: baseTs, volume24hQuote: 50 }));
  assert.equal(coldStart.quoteFlow1m, 0, 'first snapshot after restart must not fabricate interval flow');
  assert.equal(coldStart.quoteFlowAccelerationScore, 0, 'first snapshot after restart must have zero acceleration proxy');

  const signalEngine = new SignalEngine({} as PairUniverse);
  const marketSnapshot: MarketSnapshot = {
    pair: 'abc_idr',
    ticker: ticker({ timestamp: baseTs, volume24hQuote: 1_000 }),
    orderbook: null,
    recentTrades: [],
    timestamp: baseTs,
  };

  signalEngine.score(marketSnapshot);
  const scored = signalEngine.score({
    ...marketSnapshot,
    ticker: ticker({ timestamp: baseTs + 30_000, volume24hQuote: 1_500 }),
    timestamp: baseTs + 30_000,
  });

  assert.equal(
    typeof scored.quoteFlowAccelerationScore,
    'number',
    'signal output must stay wired to quote-flow acceleration contract',
  );

  console.log('PASS ticker_quote_flow_features_probe');
}

main().catch((error) => {
  console.error('FAIL ticker_quote_flow_features_probe');
  console.error(error);
  process.exit(1);
});
