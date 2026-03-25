import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  HistoricalContext,
  MicrostructureFeatures,
  SignalCandidate,
  TradeOutcomeSummary,
} from '../src/core/types';
import { PairHistoryStore } from '../src/domain/history/pairHistoryStore';
import { ProbabilityEngine } from '../src/domain/intelligence/probabilityEngine';
import { PersistenceService } from '../src/services/persistenceService';

function makeSignal(pair: string): SignalCandidate {
  return {
    pair,
    score: 76,
    confidence: 0.72,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 65,
    quoteFlowAccelerationScore: 58,
    orderbookImbalance: 0.24,
    spreadPct: 0.15,
    marketPrice: 1_000,
    bestBid: 999,
    bestAsk: 1_001,
    spreadBps: 20,
    bidDepthTop10: 100_000,
    askDepthTop10: 95_000,
    depthScore: 75,
    orderbookTimestamp: Date.now(),
    liquidityScore: 70,
    change1m: 1.2,
    change5m: 2.5,
    contributions: [],
    timestamp: Date.now(),
  };
}

function makeMicrostructure(pair: string): MicrostructureFeatures {
  return {
    pair,
    accumulationScore: 67,
    spoofRiskScore: 18,
    icebergScore: 34,
    clusterScore: 61,
    aggressionBias: 0.2,
    sweepScore: 44,
    breakoutPressureScore: 63,
    quoteFlowAccelerationScore: 58,
    liquidityQualityScore: 73,
    spreadScore: 70,
    exhaustionRiskScore: 22,
    timestamp: Date.now(),
    evidence: ['probe'],
    tradeFlowSource: 'EXCHANGE_TRADE_FEED',
    tradeFlowQuality: 'TAPE',
  };
}

function makeOutcome(input: {
  id: string;
  pair: string;
  accuracy: TradeOutcomeSummary['accuracy'];
  netPnl: number;
  returnPercentage: number;
  closeReason: string;
  timestamp: string;
}): TradeOutcomeSummary {
  return {
    id: input.id,
    positionId: `pos-${input.id}`,
    accountId: 'acc-1',
    account: 'acc-1',
    pair: input.pair,
    accuracy: input.accuracy,
    entryAverage: 1_000,
    exitAverage: 1_010,
    totalQuantity: 1,
    totalFee: 0,
    grossPnl: input.netPnl,
    netPnl: input.netPnl,
    returnPercentage: input.returnPercentage,
    holdDurationMs: 60_000,
    closeReason: input.closeReason,
    timestamp: input.timestamp,
    notes: [],
  };
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const history = new PairHistoryStore(persistence);

  const pair = 'btc_idr';
  const signal = makeSignal(pair);
  const microstructure = makeMicrostructure(pair);

  await history.recordOpportunity({
    pair,
    rawScore: 70,
    finalScore: 72,
    confidence: 0.7,
    pumpProbability: 0.74,
    continuationProbability: 0.6,
    trapProbability: 0.7,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: signal.breakoutPressure,
    quoteFlowAccelerationScore: signal.quoteFlowAccelerationScore,
    orderbookImbalance: signal.orderbookImbalance,
    change1m: signal.change1m,
    change5m: signal.change5m,
    entryTiming: { state: 'READY', quality: 70, reason: 'probe', leadScore: 65 },
    reasons: [],
    warnings: [],
    featureBreakdown: [],
    historicalContext: undefined,
    recommendedAction: 'WATCH',
    riskContext: [],
    historicalMatchSummary: '',
    referencePrice: signal.marketPrice,
    bestBid: signal.bestBid,
    bestAsk: signal.bestAsk,
    spreadPct: signal.spreadPct,
    liquidityScore: signal.liquidityScore,
    timestamp: Date.now(),
  });

  await history.recordOpportunity({
    pair,
    rawScore: 68,
    finalScore: 69,
    confidence: 0.65,
    pumpProbability: 0.69,
    continuationProbability: 0.54,
    trapProbability: 0.1,
    spoofRisk: 0.18,
    edgeValid: false,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: signal.breakoutPressure,
    quoteFlowAccelerationScore: signal.quoteFlowAccelerationScore,
    orderbookImbalance: signal.orderbookImbalance,
    change1m: signal.change1m,
    change5m: signal.change5m,
    entryTiming: { state: 'READY', quality: 70, reason: 'probe', leadScore: 65 },
    reasons: [],
    warnings: [],
    featureBreakdown: [],
    historicalContext: undefined,
    recommendedAction: 'WATCH',
    riskContext: [],
    historicalMatchSummary: '',
    referencePrice: signal.marketPrice,
    bestBid: signal.bestBid,
    bestAsk: signal.bestAsk,
    spreadPct: signal.spreadPct,
    liquidityScore: signal.liquidityScore,
    timestamp: Date.now(),
  });

  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'o1',
      pair,
      accuracy: 'CONFIRMED_LIVE',
      netPnl: 100,
      returnPercentage: 10,
      closeReason: 'take_profit',
      timestamp: '2026-03-25T10:00:00.000Z',
    }),
  );
  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'o2',
      pair,
      accuracy: 'PARTIAL_LIVE',
      netPnl: -30,
      returnPercentage: -3,
      closeReason: 'stop_loss',
      timestamp: '2026-03-25T11:00:00.000Z',
    }),
  );
  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'o3',
      pair,
      accuracy: 'CONFIRMED_LIVE',
      netPnl: 50,
      returnPercentage: 5,
      closeReason: 'take_profit',
      timestamp: '2026-03-25T12:00:00.000Z',
    }),
  );

  const groundedContext = await history.buildContext(pair, signal, microstructure);
  assert.equal(groundedContext.recentWinRate, 2 / 3, 'win-rate harus dari closed outcomes eligible');
  assert.equal(
    groundedContext.recentFalseBreakRate,
    1 / 3,
    'false-break/loss-context rate harus dari closed outcomes eligible',
  );
  assert.ok(
    groundedContext.contextNotes.some((note) => note.includes('historical outcome grounded')),
    'context harus menandai data outcome-grounded',
  );

  const fallbackPair = 'eth_idr';
  const fallbackSignal = makeSignal(fallbackPair);
  const fallbackMicro = makeMicrostructure(fallbackPair);
  await history.recordOpportunity({
    pair: fallbackPair,
    rawScore: 70,
    finalScore: 72,
    confidence: 0.7,
    pumpProbability: 0.74,
    continuationProbability: 0.6,
    trapProbability: 0.8,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: fallbackSignal.breakoutPressure,
    quoteFlowAccelerationScore: fallbackSignal.quoteFlowAccelerationScore,
    orderbookImbalance: fallbackSignal.orderbookImbalance,
    change1m: fallbackSignal.change1m,
    change5m: fallbackSignal.change5m,
    entryTiming: { state: 'READY', quality: 70, reason: 'probe', leadScore: 65 },
    reasons: [],
    warnings: [],
    featureBreakdown: [],
    historicalContext: undefined,
    recommendedAction: 'WATCH',
    riskContext: [],
    historicalMatchSummary: '',
    referencePrice: fallbackSignal.marketPrice,
    bestBid: fallbackSignal.bestBid,
    bestAsk: fallbackSignal.bestAsk,
    spreadPct: fallbackSignal.spreadPct,
    liquidityScore: fallbackSignal.liquidityScore,
    timestamp: Date.now(),
  });
  await history.recordOpportunity({
    pair: fallbackPair,
    rawScore: 68,
    finalScore: 69,
    confidence: 0.65,
    pumpProbability: 0.69,
    continuationProbability: 0.54,
    trapProbability: 0.1,
    spoofRisk: 0.18,
    edgeValid: false,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: fallbackSignal.breakoutPressure,
    quoteFlowAccelerationScore: fallbackSignal.quoteFlowAccelerationScore,
    orderbookImbalance: fallbackSignal.orderbookImbalance,
    change1m: fallbackSignal.change1m,
    change5m: fallbackSignal.change5m,
    entryTiming: { state: 'READY', quality: 70, reason: 'probe', leadScore: 65 },
    reasons: [],
    warnings: [],
    featureBreakdown: [],
    historicalContext: undefined,
    recommendedAction: 'WATCH',
    riskContext: [],
    historicalMatchSummary: '',
    referencePrice: fallbackSignal.marketPrice,
    bestBid: fallbackSignal.bestBid,
    bestAsk: fallbackSignal.bestAsk,
    spreadPct: fallbackSignal.spreadPct,
    liquidityScore: fallbackSignal.liquidityScore,
    timestamp: Date.now(),
  });
  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'sim1',
      pair: fallbackPair,
      accuracy: 'SIMULATED',
      netPnl: 120,
      returnPercentage: 12,
      closeReason: 'take_profit',
      timestamp: '2026-03-25T10:10:00.000Z',
    }),
  );

  const fallbackContext = await history.buildContext(fallbackPair, fallbackSignal, fallbackMicro);
  assert.equal(fallbackContext.recentWinRate, 0.5, 'fallback win-rate harus dari proxy opportunity saat outcome eligible kosong');
  assert.equal(
    fallbackContext.recentFalseBreakRate,
    0.5,
    'fallback false-break rate harus dari proxy opportunity saat outcome eligible kosong',
  );
  assert.ok(
    fallbackContext.contextNotes.some((note) => note.includes('fallback ke proxy opportunity')),
    'context note harus jujur saat fallback proxy aktif',
  );

  const probabilityEngine = new ProbabilityEngine();
  const higherQualityHistory: HistoricalContext = {
    ...groundedContext,
    recentWinRate: 0.9,
    recentFalseBreakRate: 0.1,
  };
  const lowerQualityHistory: HistoricalContext = {
    ...groundedContext,
    recentWinRate: 0.1,
    recentFalseBreakRate: 0.7,
  };

  const probabilityWithGoodHistory = probabilityEngine.assess({
    signal,
    microstructure,
    historicalContext: higherQualityHistory,
  });
  const probabilityWithBadHistory = probabilityEngine.assess({
    signal,
    microstructure,
    historicalContext: lowerQualityHistory,
  });

  assert.ok(
    probabilityWithGoodHistory.pumpProbability > probabilityWithBadHistory.pumpProbability,
    'ProbabilityEngine harus benar-benar memakai recentWinRate outcome-grounded',
  );
  assert.ok(
    probabilityWithGoodHistory.trapProbability < probabilityWithBadHistory.trapProbability,
    'ProbabilityEngine harus benar-benar memakai recentFalseBreakRate outcome-grounded',
  );

  console.log('history_outcome_grounding_probe: ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
