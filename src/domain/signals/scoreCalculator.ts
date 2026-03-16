import type {
  MarketRegime,
  ScoreContribution,
} from '../../core/types';
import { clamp } from '../../utils/math';
import type { OrderbookFeatureSnapshot } from '../market/orderbookSnapshot';
import type { PairClassification } from '../market/pairClassifier';
import type { TickerFeatureSnapshot } from '../market/tickerSnapshot';
import {
  breakoutRetestScore,
} from './strategies/breakoutRetest';
import {
  hotRotationScore,
} from './strategies/hotRotation';
import {
  orderbookImbalanceScore,
} from './strategies/orderbookImbalance';
import {
  silentAccumulationScore,
} from './strategies/silentAccumulation';
import {
  volumeSpikeScore,
} from './strategies/volumeSpike';

export interface ScoreCalculationResult {
  total: number;
  regime: MarketRegime;
  confidence: number;
  breakoutPressure: number;
  volumeAcceleration: number;
  orderbookImbalance: number;
  spreadPct: number;
  reasons: string[];
  warnings: string[];
  contributions: ScoreContribution[];
}

export interface ScoreCalculationInput {
  classification: PairClassification;
  ticker: TickerFeatureSnapshot;
  orderbook: OrderbookFeatureSnapshot;
}

export function calculateScore(input: ScoreCalculationInput): ScoreCalculationResult {
  const { classification, ticker, orderbook } = input;

  const volumeAnomaly = volumeSpikeScore({
    volume1m: ticker.volume1m,
    volume5m: ticker.volume5m,
    volume15mAvg: ticker.volume15mAvg,
    change1m: ticker.change1m,
  });

  const breakoutReadiness = breakoutRetestScore({
    change1m: ticker.change1m,
    change3m: ticker.change3m,
    change5m: ticker.change5m,
    spreadBps: orderbook.spreadBps,
    orderbookImbalance: orderbook.orderbookImbalance,
  });

  const accumulation = silentAccumulationScore({
    change1m: ticker.change1m,
    change5m: ticker.change5m,
    volumeAcceleration: ticker.volumeAcceleration,
    orderbookImbalance: orderbook.orderbookImbalance,
    spreadBps: orderbook.spreadBps,
  });

  const rotation = hotRotationScore({
    change5m: ticker.change5m,
    change15m: ticker.change15m,
    volumeAcceleration: ticker.volumeAcceleration,
    volatilityScore: ticker.volatilityScore,
  });

  const imbalance = orderbookImbalanceScore({
    orderbookImbalance: orderbook.orderbookImbalance,
    bestBidSize: orderbook.bestBidSize,
    bestAskSize: orderbook.bestAskSize,
    wallPressureScore: orderbook.wallPressureScore,
  });

  const spreadTightening = clamp(10 - orderbook.spreadBps / 8, 0, 10);
  const priceAcceleration = clamp(Math.max(0, ticker.change3m) * 2.2, 0, 14);
  const tradeBurst = clamp(ticker.volumeAcceleration * 0.12, 0, 10);

  const slippagePenalty = clamp((orderbook.spreadBps - 45) / 10, 0, 10);
  const liquidityPenalty = clamp(8 - orderbook.depthScore * 0.08, 0, 8);
  const overextensionPenalty = clamp((ticker.change15m - 9) / 1.5, 0, 12);
  const spoofPenalty =
    orderbook.orderbookImbalance > 0.95 && orderbook.bestAskSize > 0
      ? 4
      : 0;

  const tierBonus =
    classification.tier === 'A' ? 2 : classification.tier === 'B' ? 1 : 0;

  const total = clamp(
    volumeAnomaly +
      breakoutReadiness +
      accumulation +
      rotation +
      imbalance +
      spreadTightening +
      priceAcceleration +
      tradeBurst +
      tierBonus -
      slippagePenalty -
      liquidityPenalty -
      overextensionPenalty -
      spoofPenalty,
    0,
    100,
  );

  let regime: MarketRegime = classification.regimeHint;
  if (breakoutReadiness >= 8 && imbalance >= 8) {
    regime = 'BREAKOUT_SETUP';
  } else if (accumulation >= 6) {
    regime = 'ACCUMULATION';
  } else if (overextensionPenalty >= 8) {
    regime = 'EXHAUSTION';
  } else if (total >= 70) {
    regime = 'EXPANSION';
  }

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (volumeAnomaly >= 8) reasons.push('volume anomaly meningkat');
  if (imbalance >= 7) reasons.push('bid-side orderbook dominan');
  if (breakoutReadiness >= 7) reasons.push('breakout setup mulai matang');
  if (accumulation >= 5) reasons.push('indikasi silent accumulation');
  if (rotation >= 5) reasons.push('rotation flow mendukung');
  if (orderbook.spreadBps < 40) reasons.push('spread cukup rapat');

  if (slippagePenalty >= 5) warnings.push('spread/slippage risk meninggi');
  if (liquidityPenalty >= 4) warnings.push('depth orderbook masih tipis');
  if (overextensionPenalty >= 5) warnings.push('harga mulai overextended');
  if (spoofPenalty > 0) warnings.push('imbalance terlalu ekstrem, rawan spoof/trap');

  const contributions: ScoreContribution[] = [
    {
      feature: 'volumeAnomaly',
      weight: 18,
      contribution: volumeAnomaly,
      note: 'volume spike vs baseline',
    },
    {
      feature: 'breakoutReadiness',
      weight: 12,
      contribution: breakoutReadiness,
      note: 'price + retest + imbalance',
    },
    {
      feature: 'silentAccumulation',
      weight: 10,
      contribution: accumulation,
      note: 'tight range with hidden pressure',
    },
    {
      feature: 'hotRotation',
      weight: 10,
      contribution: rotation,
      note: 'short-term rotation support',
    },
    {
      feature: 'orderbookImbalance',
      weight: 14,
      contribution: imbalance,
      note: 'depth dominance near top of book',
    },
    {
      feature: 'spreadTightening',
      weight: 10,
      contribution: spreadTightening,
      note: 'tighter spread is better',
    },
    {
      feature: 'priceAcceleration',
      weight: 14,
      contribution: priceAcceleration,
      note: '3m acceleration',
    },
    {
      feature: 'tradeBurst',
      weight: 10,
      contribution: tradeBurst,
      note: 'volume acceleration proxy',
    },
    {
      feature: 'slippagePenalty',
      weight: -10,
      contribution: -slippagePenalty,
      note: 'wider spread penalty',
    },
    {
      feature: 'liquidityPenalty',
      weight: -8,
      contribution: -liquidityPenalty,
      note: 'thin orderbook penalty',
    },
    {
      feature: 'overextensionPenalty',
      weight: -12,
      contribution: -overextensionPenalty,
      note: 'late-move penalty',
    },
    {
      feature: 'spoofPenalty',
      weight: -4,
      contribution: -spoofPenalty,
      note: 'extreme imbalance penalty',
    },
  ];

  const confidence = clamp(
    total * 0.6 +
      Math.max(0, orderbook.depthScore - 40) * 0.25 +
      Math.max(0, ticker.momentumScore - 20) * 0.15,
    0,
    100,
  ) / 100;

  return {
    total,
    regime,
    confidence,
    breakoutPressure: breakoutReadiness,
    volumeAcceleration: ticker.volumeAcceleration,
    orderbookImbalance: orderbook.orderbookImbalance,
    spreadPct: orderbook.current.spreadPct,
    reasons,
    warnings,
    contributions,
  };
}
