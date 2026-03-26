import assert from 'node:assert/strict';

import { OpportunityEngine } from '../src/domain/intelligence/opportunityEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';
import type {
  HistoricalContext,
  MarketSnapshot,
  OpportunityAssessment,
  PositionRecord,
  SignalCandidate,
  StoredAccount,
} from '../src/core/types';

function makeSignal(pair: string): SignalCandidate {
  const now = Date.now();
  return {
    pair,
    score: 80,
    confidence: 0.86,
    reasons: ['probe'],
    warnings: [],
    regime: 'EXPANSION',
    breakoutPressure: 7,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    spreadPct: 0.3,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 30,
    bidDepthTop10: 260,
    askDepthTop10: 200,
    depthScore: 82,
    orderbookTimestamp: now,
    liquidityScore: 75,
    change1m: 0.9,
    change5m: 2.9,
    contributions: [],
    timestamp: now,
  };
}

function makeSnapshot(pair: string): MarketSnapshot {
  const now = Date.now();
  return {
    pair,
    ticker: {
      pair,
      lastPrice: 100,
      bid: 99.8,
      ask: 100,
      high24h: 108,
      low24h: 92,
      volume24hBase: 1_000,
      volume24hQuote: 280_000_000,
      change24hPct: 1,
      timestamp: now,
    },
    orderbook: {
      pair,
      bids: [{ price: 99.8, volume: 260 }],
      asks: [{ price: 100, volume: 200 }],
      bestBid: 99.8,
      bestAsk: 100,
      spread: 0.2,
      spreadPct: 0.2,
      midPrice: 99.9,
      timestamp: now,
    },
    recentTrades: [],
    recentTradesSource: 'NONE',
    timestamp: now,
  };
}

function makeAccount(): StoredAccount {
  return {
    id: 'acc-1',
    name: 'main',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };
}

async function main() {
  const pair = 'confirm_idr';
  const context: HistoricalContext = {
    pair,
    snapshotCount: 20,
    anomalyCount: 0,
    recentWinRate: 0.68,
    recentFalseBreakRate: 0.08,
    regime: 'EXPANSION',
    patternMatches: [],
    contextNotes: [],
    timestamp: Date.now(),
  };

  const engine = new OpportunityEngine(
    {
      getRecentSnapshots: () => [],
      buildContext: async () => context,
      recordAnomaly: async () => undefined,
    } as never,
    {
      build: () => ({
        pair,
        accumulationScore: 64,
        spoofRiskScore: 18,
        icebergScore: 0,
        clusterScore: 36,
        aggressionBias: 0,
        sweepScore: 0,
        breakoutPressureScore: 65,
        quoteFlowAccelerationScore: 30,
        liquidityQualityScore: 80,
        spreadScore: 85,
        exhaustionRiskScore: 30,
        timestamp: Date.now(),
        evidence: ['probe'],
        tradeFlowSource: 'NONE' as const,
        tradeFlowQuality: 'PROXY' as const,
      }),
    } as never,
    {
      assess: () => ({
        pumpProbability: 0.71,
        continuationProbability: 0.66,
        trapProbability: 0.14,
        confidence: 0.85,
      }),
    } as never,
    {
      validate: () => ({
        valid: true,
        reasons: [],
        warnings: [],
        blockedBySpoof: false,
        blockedBySpread: false,
        blockedByLiquidity: false,
        blockedByTiming: false,
      }),
    } as never,
    {
      build: () => ({
        reasons: ['ok'],
        warnings: [],
        featureBreakdown: [],
        riskContext: ['ok'],
        historicalMatchSummary: 'ok',
      }),
    } as never,
    {
      assess: () => ({
        state: 'CONFIRM_WINDOW' as const,
        quality: 82,
        reason: 'confirm',
        leadScore: 76,
        entryStyle: 'CONFIRM' as const,
      }),
    } as never,
  );

  const assessed = await engine.assess(makeSnapshot(pair), makeSignal(pair));
  assert.equal(assessed.recommendedAction, 'ADD_ON_CONFIRM', 'ADD_ON_CONFIRM harus keluar saat continuation kuat');

  const risk = new RiskEngine();
  const settings = createDefaultSettings();
  const openPosition: PositionRecord = {
    id: 'p1',
    pair,
    accountId: 'acc-1',
    status: 'OPEN' as const,
    side: 'long' as const,
    quantity: 1,
    entryPrice: 100,
    averageEntryPrice: 100,
    averageExitPrice: null,
    currentPrice: 101,
    peakPrice: 101,
    unrealizedPnl: 1,
    realizedPnl: 0,
    totalEntryFeesPaid: 0,
    totalBoughtQuantity: 1,
    totalSoldQuantity: 0,
    stopLossPrice: 95,
    takeProfitPrice: 110,
    entryStyle: 'CONFIRM',
    pumpState: 'ACTIVE',
    lastContinuationScore: 0.63,
    lastDumpRisk: 0.2,
    lastScaleOutAt: null,
    emergencyExitArmed: false,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  };

  const brokenContinuation: OpportunityAssessment = {
    ...assessed,
    continuationProbability: 0.41,
    quoteFlowAccelerationScore: 12,
    recommendedAction: 'ADD_ON_CONFIRM',
  };

  const rejected = risk.checkCanEnter({
    account: makeAccount(),
    settings,
    signal: brokenContinuation,
    openPositions: [openPosition],
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  assert.equal(rejected.allowed, false, 'Add-on confirm wajib gagal saat continuation rusak');
  assert.ok(
    rejected.reasons.some((reason) => reason.includes('Continuation tidak cukup kuat')),
    'Alasan penolakan continuation harus muncul',
  );

  console.log('add_on_confirm_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
