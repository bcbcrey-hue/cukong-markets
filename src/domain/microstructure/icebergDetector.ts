import type { MarketSnapshot } from '../../core/types';
import { clamp } from '../../utils/math';

export interface IcebergDetectionResult {
  icebergScore: number;
  hiddenLiquiditySide: 'BUY' | 'SELL' | 'NONE';
  evidence: string[];
}

export function detectIceberg(
  snapshot: MarketSnapshot,
  recentSnapshots: MarketSnapshot[],
): IcebergDetectionResult {
  const orderbook = snapshot.orderbook;
  const evidence: string[] = [];

  if (!orderbook) {
    return {
      icebergScore: 0,
      hiddenLiquiditySide: 'NONE',
      evidence: ['orderbook tidak tersedia'],
    };
  }

  const comparable = recentSnapshots.filter((item) => item.orderbook);
  const repeatedBidRefill = comparable.filter((item) => {
    const price = item.orderbook?.bestBid ?? 0;
    return Math.abs(price - orderbook.bestBid) <= Math.max(1e-8, orderbook.bestBid * 0.001);
  }).length;

  const repeatedAskRefill = comparable.filter((item) => {
    const price = item.orderbook?.bestAsk ?? 0;
    return Math.abs(price - orderbook.bestAsk) <= Math.max(1e-8, orderbook.bestAsk * 0.001);
  }).length;

  let hiddenLiquiditySide: IcebergDetectionResult['hiddenLiquiditySide'] = 'NONE';

  if (repeatedBidRefill >= 3) {
    hiddenLiquiditySide = 'BUY';
    evidence.push('best bid berulang kali refill di level hampir sama');
  }

  if (repeatedAskRefill >= 3 && repeatedAskRefill >= repeatedBidRefill) {
    hiddenLiquiditySide = 'SELL';
    evidence.push('best ask berulang kali refill di level hampir sama');
  }

  const icebergScore = clamp(
    Math.max(repeatedBidRefill, repeatedAskRefill) * 18 +
      (snapshot.recentTrades.length >= 4 ? 12 : 0),
    0,
    100,
  );

  return {
    icebergScore,
    hiddenLiquiditySide,
    evidence,
  };
}