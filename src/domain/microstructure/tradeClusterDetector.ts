import { env } from '../../config/env';
import type { MarketSnapshot } from '../../core/types';
import { clamp, sum } from '../../utils/math';

export interface TradeClusterDetectionResult {
  clusterScore: number;
  aggressionBias: number;
  sweepDetected: boolean;
  evidence: string[];
}

export function detectTradeClusters(snapshot: MarketSnapshot): TradeClusterDetectionResult {
  const threshold = snapshot.timestamp - env.tradeClusterWindowMs;
  const trades = snapshot.recentTrades.filter((trade) => trade.timestamp >= threshold);
  const evidence: string[] = [];

  const buyQty = sum(trades.filter((trade) => trade.side === 'buy').map((trade) => trade.quantity));
  const sellQty = sum(trades.filter((trade) => trade.side === 'sell').map((trade) => trade.quantity));
  const totalQty = buyQty + sellQty;
  const aggressionBias = totalQty > 0 ? (buyQty - sellQty) / totalQty : 0;
  const sweepDetected = trades.length >= 3 && Math.abs(aggressionBias) >= 0.6;

  if (trades.length >= 4) {
    evidence.push('burst transaksi inferred dalam rolling window');
  }

  if (Math.abs(aggressionBias) >= 0.4) {
    evidence.push('dominasi agresi satu sisi cukup jelas');
  }

  if (sweepDetected) {
    evidence.push('indikasi micro-sweep dari konsentrasi arah transaksi');
  }

  const clusterScore = clamp(
    trades.length * 10 + Math.abs(aggressionBias) * 36 + (sweepDetected ? 18 : 0),
    0,
    100,
  );

  return {
    clusterScore,
    aggressionBias,
    sweepDetected,
    evidence,
  };
}