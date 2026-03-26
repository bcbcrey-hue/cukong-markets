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
  quoteFlowAccelerationScore: number;
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
    quoteFlow1m: ticker.quoteFlow1m,
    quoteFlow5m: ticker.quoteFlow5m,
    quoteFlow15mAvgPerMin: ticker.quoteFlow15mAvgPerMin,
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
    quoteFlowAccelerationScore: ticker.quoteFlowAccelerationScore,
    orderbookImbalance: orderbook.orderbookImbalance,
    spreadBps: orderbook.spreadBps,
  });

  const rotation = hotRotationScore({
    change5m: ticker.change5m,
    change15m: ticker.change15m,
    quoteFlowAccelerationScore: ticker.quoteFlowAccelerationScore,
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
  const tradeBurst = clamp(ticker.quoteFlowAccelerationScore * 0.12, 0, 10);
  const quoteBaseline = Math.max(1, ticker.quoteFlow15mAvgPerMin);
  const quoteJerkScore = clamp(((ticker.quoteFlow1m - quoteBaseline) / quoteBaseline) * 8 + ticker.quoteFlowAccelerationScore * 0.08, 0, 12);
  const askVacuumScore = clamp(
    ((orderbook.bestBidSize + 1) / (orderbook.bestAskSize + 1)) * 4 +
      Math.max(0, ticker.change1m) * 1.8 +
      Math.max(0, orderbook.orderbookImbalance) * 6,
    0,
    10,
  );
  const bidPersistenceScore = clamp(
    Math.max(0, ticker.change1m) * 2 +
      Math.max(0, ticker.change3m) * 1.4 +
      Math.max(0, orderbook.orderbookImbalance) * 8,
    0,
    10,
  );
  const thinBookOpportunityScore = clamp(
    orderbook.depthScore >= 4 && orderbook.depthScore <= 18
      ? 10
      : orderbook.depthScore >= 19 && orderbook.depthScore <= 30
        ? 5
        : orderbook.depthScore > 30
          ? 2
          : 0,
    0,
    10,
  );
  const microPairBias = classification.pairClass === 'MICRO' ? 4 : classification.pairClass === 'MID' ? 2 : 0;
  const earlyMoveScore = clamp(
    Math.max(0, ticker.change1m) * 2.1 +
      Math.max(0, ticker.change3m) * 1.1 -
      Math.max(0, ticker.change15m - 18) * 0.6,
    0,
    10,
  );

  const slippagePenalty = clamp((orderbook.spreadBps - 45) / 10, 0, 10);
  const overextensionPenalty = clamp((ticker.change15m - 18) / 2.5, 0, 8);
  const deadBookPenalty = orderbook.depthScore < 3 ? 18 : 0;
  const spoofPenalty =
    orderbook.orderbookImbalance > 0.95 && orderbook.bestAskSize > 0
      ? 4
      : 0;

  const total = clamp(
    volumeAnomaly +
      breakoutReadiness +
      accumulation +
      rotation +
      imbalance +
      spreadTightening +
      priceAcceleration +
      tradeBurst +
      thinBookOpportunityScore +
      askVacuumScore +
      bidPersistenceScore +
      microPairBias +
      earlyMoveScore +
      quoteJerkScore -
      slippagePenalty -
      overextensionPenalty -
      deadBookPenalty -
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

  if (volumeAnomaly >= 8) reasons.push('anomali quote-flow proxy meningkat');
  if (imbalance >= 7) reasons.push('bid-side orderbook dominan');
  if (breakoutReadiness >= 7) reasons.push('breakout setup mulai matang');
  if (accumulation >= 5) reasons.push('indikasi silent accumulation');
  if (rotation >= 5) reasons.push('rotation flow mendukung');
  if (orderbook.spreadBps < 40) reasons.push('spread cukup rapat');
  if (thinBookOpportunityScore >= 8) reasons.push('thin-book hidup jadi peluang');
  if (askVacuumScore >= 6) reasons.push('ask vacuum mulai terbentuk');
  if (bidPersistenceScore >= 6) reasons.push('bid persistence terjaga');
  if (earlyMoveScore >= 5) reasons.push('early move sehat');
  if (microPairBias > 0) reasons.push('bias micro/mid pair aktif');

  if (slippagePenalty >= 5) warnings.push('spread/slippage risk meninggi');
  if (deadBookPenalty > 0) warnings.push('dead thin-book: depth tidak layak');
  if (overextensionPenalty >= 5) warnings.push('harga mulai overextended');
  if (spoofPenalty > 0) warnings.push('imbalance terlalu ekstrem, rawan spoof/trap');

  const contributions: ScoreContribution[] = [
    {
      feature: 'volumeAnomaly',
      weight: 18,
      contribution: volumeAnomaly,
      note: 'quote-flow spike vs baseline',
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
      note: 'quote-flow acceleration proxy',
    },
    {
      feature: 'thinBookOpportunityScore',
      weight: 10,
      contribution: thinBookOpportunityScore,
      note: 'depth 4-18 diprioritaskan sebagai peluang',
    },
    {
      feature: 'askVacuumScore',
      weight: 10,
      contribution: askVacuumScore,
      note: 'dominasi bid + ask tipis',
    },
    {
      feature: 'bidPersistenceScore',
      weight: 10,
      contribution: bidPersistenceScore,
      note: 'ketahanan bid saat early lift',
    },
    {
      feature: 'microPairBias',
      weight: 4,
      contribution: microPairBias,
      note: 'bias pairClass MICRO/MID',
    },
    {
      feature: 'earlyMoveScore',
      weight: 10,
      contribution: earlyMoveScore,
      note: 'early move sehat belum overextended',
    },
    {
      feature: 'quoteJerkScore',
      weight: 12,
      contribution: quoteJerkScore,
      note: 'jerk quote-flow vs baseline',
    },
    {
      feature: 'slippagePenalty',
      weight: -10,
      contribution: -slippagePenalty,
      note: 'wider spread penalty',
    },
    {
      feature: 'overextensionPenalty',
      weight: -12,
      contribution: -overextensionPenalty,
      note: 'late-move penalty',
    },
    {
      feature: 'deadBookPenalty',
      weight: -18,
      contribution: -deadBookPenalty,
      note: 'dead thin book must be rejected',
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
    quoteFlowAccelerationScore: ticker.quoteFlowAccelerationScore,
    orderbookImbalance: orderbook.orderbookImbalance,
    spreadPct: orderbook.current.spreadPct,
    reasons,
    warnings,
    contributions,
  };
}
