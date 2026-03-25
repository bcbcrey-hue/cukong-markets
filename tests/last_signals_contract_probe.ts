import assert from 'node:assert/strict';

import { createApp } from '../src/app';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { OpportunityEngine } from '../src/domain/intelligence/opportunityEngine';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PumpCandidateWatch } from '../src/domain/market/pumpCandidateWatch';
import { SignalEngine } from '../src/domain/signals/signalEngine';
import { TelegramBot } from '../src/integrations/telegram/bot';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import type { MarketOverview, MarketSnapshot, OpportunityAssessment, SignalCandidate } from '../src/core/types';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';
import { PollingService } from '../src/services/pollingService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';
import { SettingsService } from '../src/domain/settings/settingsService';

class FakeIndodaxClient {
  forAccount() {
    return {
      trade: async () => ({ success: 1 }),
    };
  }
}

function makeSnapshot(pair: string, price: number): MarketSnapshot {
  const now = Date.now();

  return {
    pair,
    ticker: {
      pair,
      lastPrice: price,
      bid: price * 0.999,
      ask: price * 1.001,
      high24h: price * 1.01,
      low24h: price * 0.99,
      volume24hBase: 100,
      volume24hQuote: 500_000_000,
      change24hPct: 0.8,
      timestamp: now,
    },
    orderbook: {
      pair,
      bids: [{ price: price * 0.999, volume: 1000 }],
      asks: [{ price: price * 1.001, volume: 1000 }],
      bestBid: price * 0.999,
      bestAsk: price * 1.001,
      spread: price * 0.002,
      spreadPct: 0.2,
      midPrice: price,
      timestamp: now,
    },
    recentTrades: [],
    recentTradesSource: 'NONE',
    timestamp: now,
  };
}

function makeSignal(pair: string, score: number): SignalCandidate {
  const now = Date.now();
  return {
    pair,
    score,
    confidence: 0.8,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 70,
    quoteFlowAccelerationScore: 66,
    orderbookImbalance: 0.25,
    spreadPct: 0.2,
    marketPrice: 1000,
    bestBid: 999,
    bestAsk: 1001,
    spreadBps: 20,
    bidDepthTop10: 10000,
    askDepthTop10: 9000,
    depthScore: 77,
    orderbookTimestamp: now,
    liquidityScore: 80,
    change1m: 0.5,
    change5m: 1.5,
    contributions: [],
    timestamp: now,
  };
}

async function main() {
  const snapshots = [makeSnapshot('btc_idr', 1_000_000_000), makeSnapshot('eth_idr', 50_000_000)];
  const scored = [makeSignal('btc_idr', 91), makeSignal('eth_idr', 86)];
  const pumpCandidates = [scored[0]];
  const opportunities: OpportunityAssessment[] = [
    {
      pair: pumpCandidates[0].pair,
      rawScore: pumpCandidates[0].score,
      finalScore: 89,
      confidence: 0.85,
      pumpProbability: 0.8,
      continuationProbability: 0.7,
      trapProbability: 0.1,
      spoofRisk: 0.2,
      edgeValid: true,
      marketRegime: 'BREAKOUT_SETUP',
      breakoutPressure: pumpCandidates[0].breakoutPressure,
      quoteFlowAccelerationScore: pumpCandidates[0].quoteFlowAccelerationScore,
      orderbookImbalance: pumpCandidates[0].orderbookImbalance,
      change1m: pumpCandidates[0].change1m,
      change5m: pumpCandidates[0].change5m,
      entryTiming: { state: 'READY', quality: 80, reason: 'ready', leadScore: 75 },
      reasons: ['probe'],
      warnings: [],
      featureBreakdown: pumpCandidates[0].contributions,
      historicalContext: {
        pair: pumpCandidates[0].pair,
        snapshotCount: 10,
        anomalyCount: 0,
        recentWinRate: 0.5,
        recentFalseBreakRate: 0.1,
        regime: 'BREAKOUT_SETUP',
        patternMatches: [],
        contextNotes: [],
        timestamp: Date.now(),
      },
      recommendedAction: 'ENTER',
      riskContext: ['ok'],
      historicalMatchSummary: 'ok',
      referencePrice: pumpCandidates[0].marketPrice,
      bestBid: pumpCandidates[0].bestBid,
      bestAsk: pumpCandidates[0].bestAsk,
      spreadPct: pumpCandidates[0].spreadPct,
      liquidityScore: pumpCandidates[0].liquidityScore,
      timestamp: Date.now(),
    },
  ];

  let marketScanHandler: (() => Promise<void>) | null = null;

  const originalRegister = PollingService.prototype.register;
  const originalStart = PollingService.prototype.start;
  const originalStop = PollingService.prototype.stop;
  const originalBatchSnapshot = MarketWatcher.prototype.batchSnapshot;
  const originalScoreMany = SignalEngine.prototype.scoreMany;
  const originalBuildCandidateFeed = PumpCandidateWatch.prototype.buildCandidateFeed;
  const originalBuildMarketOverview = PumpCandidateWatch.prototype.buildMarketOverview;
  const originalAssessMany = OpportunityEngine.prototype.assessMany;
  const originalTelegramStop = TelegramBot.prototype.stop;

  PollingService.prototype.register = function patchedRegister(name, _intervalMs, handler) {
    if (name === 'market-scan') {
      marketScanHandler = handler;
    }
  };

  PollingService.prototype.start = function patchedStart() {
    return;
  };

  PollingService.prototype.stop = function patchedStop() {
    return;
  };

  MarketWatcher.prototype.batchSnapshot = async function patchedBatchSnapshot() {
    return snapshots;
  };

  SignalEngine.prototype.scoreMany = function patchedScoreMany() {
    return scored;
  };

  PumpCandidateWatch.prototype.buildCandidateFeed = function patchedBuildCandidateFeed() {
    return pumpCandidates;
  };

  PumpCandidateWatch.prototype.buildMarketOverview = function patchedBuildMarketOverview(): MarketOverview {
    return {
      timestamp: Date.now(),
      breadth: {
        totalPairs: scored.length,
        gainers1m: scored.length,
        losers1m: 0,
        gainers5m: scored.length,
        losers5m: 0,
      },
      liquidLeaders: scored,
      rotationLeaders: scored,
      watchlist: scored,
    };
  };


  TelegramBot.prototype.stop = async function patchedTelegramStop() {
    return;
  };

  OpportunityEngine.prototype.assessMany = async function patchedAssessMany(candidateSnapshots, candidates) {
    assert.deepEqual(candidateSnapshots.map((snapshot) => snapshot.pair), pumpCandidates.map((item) => item.pair));
    assert.deepEqual(candidates, pumpCandidates);
    return opportunities;
  };

  try {
    const app = await createApp();
    await app.startRuntimeFromControl();
    assert.ok(marketScanHandler, 'market-scan handler must be registered');
    const runMarketScan = marketScanHandler as () => Promise<void>;

    await runMarketScan();

    const persistence = new PersistenceService();
    const persistedState = await persistence.readState();

    assert.equal(persistedState.lastSignals.length, scored.length, 'lastSignals must persist full scored universe');
    assert.deepEqual(persistedState.lastSignals, scored, 'lastSignals must persist scored content, not candidate subset');
    assert.deepEqual(persistedState.lastPumpCandidates, pumpCandidates, 'lastPumpCandidates must persist subset candidates');
    assert.ok(
      persistedState.lastSignals.length > persistedState.lastPumpCandidates.length,
      'Guard: full lastSignals must be able to diverge from candidate subset',
    );

    await app.stop();
  } finally {
    PollingService.prototype.register = originalRegister;
    PollingService.prototype.start = originalStart;
    PollingService.prototype.stop = originalStop;
    MarketWatcher.prototype.batchSnapshot = originalBatchSnapshot;
    SignalEngine.prototype.scoreMany = originalScoreMany;
    PumpCandidateWatch.prototype.buildCandidateFeed = originalBuildCandidateFeed;
    PumpCandidateWatch.prototype.buildMarketOverview = originalBuildMarketOverview;
    OpportunityEngine.prototype.assessMany = originalAssessMany;
    TelegramBot.prototype.stop = originalTelegramStop;
  }

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);
  const summary = new SummaryService(persistence, journal, new ReportService(), accountRegistry);

  await Promise.all([state.load(), settings.load(), journal.load(), orderManager.load(), positionManager.load()]);

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new FakeIndodaxClient() as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const shadowSummary = execution.getShadowRunTelegramSummary();
  assert.equal(
    shadowSummary.hotlistSignalOpportunity,
    'TERSEDIA',
    'Consumer summary must stay synchronized when lastSignals stores full scored universe',
  );

  console.log('PASS last_signals_contract_probe');
}

main().catch((error) => {
  console.error('FAIL last_signals_contract_probe');
  console.error(error);
  process.exit(1);
});
