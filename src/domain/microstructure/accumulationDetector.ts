import type { MarketSnapshot } from '../../core/types';
import { clamp, pct, sum } from '../../utils/math';

export interface AccumulationDetectionResult {
  accumulationScore: number;
  absorptionEvidence: string[];
  stealthSupportDetected: boolean;
}

export function detectAccumulation(
  snapshot: MarketSnapshot,
  recentSnapshots: MarketSnapshot[],
): AccumulationDetectionResult {
  const orderbook = snapshot.orderbook;
  const evidence: string[] = [];
  const proxyTradeFlow = snapshot.recentTradesSource !== 'EXCHANGE_TRADE_FEED';

  if (!orderbook) {
    return {
      accumulationScore: 0,
      absorptionEvidence: ['orderbook tidak tersedia'],
      stealthSupportDetected: false,
    };
  }

  const bidDepth = sum(orderbook.bids.slice(0, 5).map((level) => level.volume));
  const askDepth = sum(orderbook.asks.slice(0, 5).map((level) => level.volume));
  const bidSupport = askDepth > 0 ? bidDepth / askDepth : 0;

  const recentPrices = recentSnapshots.slice(-6).map((item) => item.ticker.lastPrice);
  const oldestRecentPrice = recentPrices[0] ?? snapshot.ticker.lastPrice;
  const compression = Math.abs(pct(oldestRecentPrice, snapshot.ticker.lastPrice));

  const buyVolume = sum(
    snapshot.recentTrades
      .filter((trade) => trade.side === 'buy')
      .map((trade) => trade.quantity),
  );
  const sellVolume = sum(
    snapshot.recentTrades
      .filter((trade) => trade.side === 'sell')
      .map((trade) => trade.quantity),
  );
  const tradeBias = buyVolume + sellVolume > 0 ? (buyVolume - sellVolume) / (buyVolume + sellVolume) : 0;

  if (bidSupport > 1.08) {
    evidence.push('bid depth top-5 lebih tebal dari ask');
  }

  if (compression <= 1.2) {
    evidence.push('harga masih relatif rapat saat tekanan beli muncul');
  }

  if (tradeBias > 0.1) {
    evidence.push('bias beli pada proxy flow lebih dominan');
  }

  if (proxyTradeFlow) {
    evidence.push('sinyal akumulasi trade-flow memakai proxy inferred snapshot, bukan tape riil');
  }

  const accumulationScore = clamp(
    Math.max(0, bidSupport - 1) * 42 +
      Math.max(0, 1.5 - compression) * 18 +
      Math.max(0, tradeBias) * 28 +
      Math.max(0, 0.8 - orderbook.spreadPct) * 18,
    0,
    100,
  );

  return {
    accumulationScore,
    absorptionEvidence: evidence,
    stealthSupportDetected: accumulationScore >= 55,
  };
}