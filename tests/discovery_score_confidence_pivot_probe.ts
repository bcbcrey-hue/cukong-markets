import assert from 'node:assert/strict';

import { calculateScore } from '../src/domain/signals/scoreCalculator';
import type { OrderbookFeatureSnapshot } from '../src/domain/market/orderbookSnapshot';
import type { PairClassification } from '../src/domain/market/pairClassifier';
import type { TickerFeatureSnapshot } from '../src/domain/market/tickerSnapshot';

const classification: PairClassification = {
  pair: 'micro_idr',
  tier: 'A',
  pairClass: 'MICRO',
  quoteAsset: 'idr',
  baseAsset: 'micro',
  regimeHint: 'BREAKOUT_SETUP',
};

const ticker: TickerFeatureSnapshot = {
  pair: 'micro_idr',
  current: {
    pair: 'micro_idr',
    lastPrice: 102,
    bid: 101.9,
    ask: 102,
    high24h: 120,
    low24h: 80,
    volume24hBase: 10,
    volume24hQuote: 900_000_000,
    change24hPct: 27.5,
    timestamp: Date.now(),
  },
  change1m: 1.4,
  change3m: 2.2,
  change5m: 3.3,
  change15m: 7.8,
  quoteFlow1m: 1_500_000,
  quoteFlow3m: 2_400_000,
  quoteFlow5m: 3_200_000,
  quoteFlow15mAvgPerMin: 120_000,
  quoteFlowAccelerationScore: 80,
  volatilityScore: 35,
  momentumScore: 55,
};

function makeOrderbook(depthScore: number): OrderbookFeatureSnapshot {
  return {
    pair: 'micro_idr',
    current: {
      pair: 'micro_idr',
      bids: [{ price: 101.9, volume: 40 }],
      asks: [{ price: 102, volume: 20 }],
      bestBid: 101.9,
      bestAsk: 102,
      spread: 0.1,
      spreadPct: 0.098,
      midPrice: 101.95,
      timestamp: Date.now(),
    },
    bestBidSize: 40,
    bestAskSize: 20,
    bidDepthTop5: 90,
    askDepthTop5: 70,
    bidDepthTop10: 150,
    askDepthTop10: 120,
    orderbookImbalance: 0.2,
    depthScore,
    spreadBps: 9.8,
    wallPressureScore: 62,
  };
}

async function main(): Promise<void> {
  const deadThin = calculateScore({ classification, ticker, orderbook: makeOrderbook(2) });
  const thinAlive = calculateScore({ classification, ticker, orderbook: makeOrderbook(10) });
  const neutral = calculateScore({ classification, ticker, orderbook: makeOrderbook(24) });
  const thick = calculateScore({ classification, ticker, orderbook: makeOrderbook(60) });

  assert(thinAlive.confidence > neutral.confidence, 'depth 4-18 should have higher confidence than depth 19-30 for same signal quality');
  assert(thinAlive.confidence > thick.confidence, 'thick book should not receive dominant confidence bonus over thin-book opportunity profile');
  assert(deadThin.confidence < 0.35, 'dead thin book (depth <3) must remain low-confidence');
  assert(
    deadThin.warnings.includes('dead thin-book: depth tidak layak'),
    'dead thin book warning must remain explicit in score output',
  );

  console.log('PASS discovery_score_confidence_pivot_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_score_confidence_pivot_probe');
  console.error(error);
  process.exit(1);
});
