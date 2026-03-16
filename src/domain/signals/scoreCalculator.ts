import type { OrderbookSnapshot, ScoreBreakdown, StrategyResult, TickerSnapshot } from '../../core/types';
import { breakoutRetestScore } from './strategies/breakoutRetest';
import { hotRotationScore } from './strategies/hotRotation';
import { orderbookImbalanceScore } from './strategies/orderbookImbalance';
import { silentAccumulationScore } from './strategies/silentAccumulation';
import { volumeSpikeScore } from './strategies/volumeSpike';

export function calculateScore(snapshot: TickerSnapshot, orderbook: OrderbookSnapshot | null): { breakdown: ScoreBreakdown; strategies: StrategyResult\[] } {
  const volumeAnomaly = volumeSpikeScore(snapshot);
  const priceAcceleration = Math.max(0, Math.min(14, snapshot.velocity5m \* 1.6 + Math.max(0, snapshot.change3m) \* 2));
  const spreadTightening = Math.max(0, Math.min(10, 10 - snapshot.spreadPct \* 10));
  const orderbookImbalance = orderbookImbalanceScore(orderbook);
  const tradeBurst = Math.max(0, Math.min(10, snapshot.tradeBurstScore / 10));
  const breakoutReadiness = breakoutRetestScore(snapshot);
  const momentumPersistence = Math.max(0, Math.min(14, hotRotationScore(snapshot) + silentAccumulationScore(snapshot, orderbook)));
  const slippagePenalty = Math.max(0, Math.min(10, snapshot.spreadPct \* 6));
  const liquidityPenalty = Math.max(0, Math.min(12, (50 - snapshot.liquidityScore) / 5));
  const overextensionPenalty = Math.max(0, Math.min(12, Math.max(0, snapshot.change15m - 8) \* 1.5));
  const spoofPenalty = orderbook \&\& Math.abs(orderbook.imbalanceTop5) > 0.92 \&\& (orderbook.bidDepthTop5 < 20 || orderbook.askDepthTop5 < 20) ? 6 : 0;

  const notes: string\[] = \[];
  if (volumeAnomaly >= 12) notes.push('volume anomaly kuat');
  if (priceAcceleration >= 8) notes.push('akselerasi harga meningkat');
  if (spreadTightening >= 7) notes.push('spread relatif rapat');
  if (orderbookImbalance >= 8) notes.push('imbalance orderbook kuat');
  if (tradeBurst >= 7) notes.push('trade burst tinggi');
  if (breakoutReadiness >= 10) notes.push('potensi breakout + retest');
  if (momentumPersistence >= 8) notes.push('momentum bertahan');
  if (slippagePenalty >= 6) notes.push('slippage risk tinggi');
  if (liquidityPenalty >= 6) notes.push('likuiditas kurang');
  if (overextensionPenalty >= 6) notes.push('sudah overextended');
  if (spoofPenalty > 0) notes.push('indikasi fake move / spoof');

  const total = Math.max(
    0,
    Math.min(
      100,
      volumeAnomaly +
        priceAcceleration +
        spreadTightening +
        orderbookImbalance +
        tradeBurst +
        breakoutReadiness +
        momentumPersistence -
        slippagePenalty -
        liquidityPenalty -
        overextensionPenalty -
        spoofPenalty,
    ),
  );

  const strategies: StrategyResult\[] = \[
    { name: 'Volume Spike Early', passed: volumeAnomaly >= 10, weight: volumeAnomaly, note: notes.includes('volume anomaly kuat') ? 'volume terdeteksi meningkat' : 'belum dominan' },
    { name: 'Orderbook Imbalance', passed: orderbookImbalance >= 8, weight: orderbookImbalance, note: orderbook ? `imbalance=${orderbook.imbalanceTop5.toFixed(3)}` : 'orderbook tidak tersedia' },
    { name: 'Silent Accumulation', passed: silentAccumulationScore(snapshot, orderbook) > 0, weight: silentAccumulationScore(snapshot, orderbook), note: 'kenaikan halus dengan depth mendukung' },
    { name: 'Breakout + Quick Retest', passed: breakoutReadiness >= 10, weight: breakoutReadiness, note: 'breakout readiness aktif' },
    { name: 'Hot Rotation Scanner', passed: hotRotationScore(snapshot) >= 8, weight: hotRotationScore(snapshot), note: 'rotasi pair menguat' },
  ];

  return {
    breakdown: {
      total,
      volumeAnomaly,
      priceAcceleration,
      spreadTightening,
      orderbookImbalance,
      tradeBurst,
      breakoutReadiness,
      momentumPersistence,
      slippagePenalty,
      liquidityPenalty,
      overextensionPenalty,
      spoofPenalty,
      notes,
    },
    strategies,
  };
}
