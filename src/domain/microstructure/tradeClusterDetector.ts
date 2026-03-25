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
  const proxyTradeFlow = snapshot.recentTradesSource !== 'EXCHANGE_TRADE_FEED';

  const buyQty = sum(trades.filter((trade) => trade.side === 'buy').map((trade) => trade.quantity));
  const sellQty = sum(trades.filter((trade) => trade.side === 'sell').map((trade) => trade.quantity));
  const totalQty = buyQty + sellQty;
  const aggressionBias = totalQty > 0 ? (buyQty - sellQty) / totalQty : 0;
  const sweepDetected = trades.length >= 3 && Math.abs(aggressionBias) >= 0.6;

  if (proxyTradeFlow) {
    evidence.push('trade cluster dihitung dari proxy inferred snapshot delta (bukan tape trade riil)');
  }

  if (trades.length >= 4) {
    evidence.push('burst transaksi proxy dalam rolling window');
  }

  if (Math.abs(aggressionBias) >= 0.4) {
    evidence.push('bias agresi satu sisi terindikasi dari proxy transaksi');
  }

  if (sweepDetected) {
    evidence.push('indikasi proxy micro-sweep dari konsentrasi arah transaksi');
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