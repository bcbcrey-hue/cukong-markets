import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { PairHistoryStore } from '../src/domain/history/pairHistoryStore';
import { OpportunityEngine } from '../src/domain/intelligence/opportunityEngine';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import { SignalEngine } from '../src/domain/signals/signalEngine';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { SettingsService } from '../src/domain/settings/settingsService';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import type { MarketSnapshot, OpportunityAssessment, SignalCandidate } from '../src/core/types';
import { JournalService } from '../src/services/journalService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { HotlistService } from '../src/domain/market/hotlistService';
import { WorkerPoolService } from '../src/services/workerPoolService';
import { BacktestEngine } from '../src/domain/backtest/backtestEngine';
import { buildCallback, parseCallback } from '../src/integrations/telegram/callbackRouter';

class FakeIndodaxClient {
  forAccount() {
    return {
      trade: async () => ({ success: 1 }),
    };
  }
}

function makeSnapshot(pair: string, price: number, bid = price * 0.999, ask = price * 1.001): MarketSnapshot {
  const now = Date.now();
  return {
    pair,
    ticker: {
      pair,
      lastPrice: price,
      bid,
      ask,
      high24h: price * 1.02,
      low24h: price * 0.98,
      volume24hBase: 1000,
      volume24hQuote: 1_000_000_000,
      change24hPct: 1,
      timestamp: now,
    },
    orderbook: {
      pair,
      bids: [
        { price: bid, volume: 500 },
        { price: bid * 0.999, volume: 700 },
      ],
      asks: [
        { price: ask, volume: 450 },
        { price: ask * 1.001, volume: 650 },
      ],
      bestBid: bid,
      bestAsk: ask,
      spread: Math.max(0, ask - bid),
      spreadPct: ask > 0 ? ((ask - bid) / ask) * 100 : 0,
      midPrice: (bid + ask) / 2,
      timestamp: now,
    },
    recentTrades: [
      { pair, price, quantity: 6.2, side: 'buy', timestamp: now - 2000 },
      { pair, price: price * 1.001, quantity: 5.1, side: 'buy', timestamp: now - 1000 },
    ],
    timestamp: now,
  };
}

function makeOpportunity(signal: SignalCandidate): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: signal.pair,
    rawScore: signal.score,
    finalScore: 90,
    confidence: 0.88,
    pumpProbability: 0.82,
    continuationProbability: 0.76,
    trapProbability: 0.12,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: signal.breakoutPressure,
    volumeAcceleration: signal.volumeAcceleration,
    orderbookImbalance: signal.orderbookImbalance,
    change1m: signal.change1m,
    change5m: signal.change5m,
    entryTiming: {
      state: 'READY',
      quality: 80,
      reason: 'ready',
      leadScore: 75,
    },
    reasons: ['test-ready'],
    warnings: [],
    featureBreakdown: signal.contributions,
    historicalContext: {
      pair: signal.pair,
      snapshotCount: 10,
      anomalyCount: 0,
      recentWinRate: 0.7,
      recentFalseBreakRate: 0.1,
      regime: 'BREAKOUT_SETUP',
      patternMatches: [],
      contextNotes: [],
      timestamp: now,
    },
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: signal.marketPrice,
    bestBid: signal.bestBid,
    bestAsk: signal.bestAsk,
    spreadPct: signal.spreadPct,
    liquidityScore: signal.liquidityScore,
    timestamp: now,
  };
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);

  await Promise.all([
    state.load(),
    settings.load(),
    journal.load(),
    orderManager.load(),
    positionManager.load(),
  ]);

  await accountRegistry.saveLegacyUpload([
    { name: 'TEST_MAIN', apiKey: 'k', apiSecret: 's' },
  ]);
  const defaultAccount = accountRegistry.getDefault();
  assert.ok(defaultAccount, 'Default account should exist');

  // Module: market->signal->opportunity pipeline consistency.
  const history = new PairHistoryStore(persistence);
  const signalEngine = new SignalEngine(new PairUniverse());
  const opportunityEngine = new OpportunityEngine(history);

  const snapshots = [
    makeSnapshot('btc_idr', 1_000_000_000),
    makeSnapshot('eth_idr', 50_000_000),
  ];

  for (const snapshot of snapshots) {
    await history.recordSnapshot(snapshot);
  }

  const signals = signalEngine.scoreMany(snapshots);
  assert.equal(signals.length, snapshots.length, 'Signals count should match snapshots count');
  assert.ok(signals.every((s) => Number.isFinite(s.score) && s.score >= 0), 'Signal scores must be finite');

  for (const signal of signals) {
    await history.recordSignal(signal);
  }

  const opportunities = await opportunityEngine.assessMany(snapshots, signals);
  assert.equal(opportunities.length, snapshots.length, 'Opportunities count should match snapshots count');
  assert.ok(
    opportunities.every((o) => o.pair && Number.isFinite(o.finalScore) && o.entryTiming.state),
    'OpportunityAssessment fields should be consistent',
  );

  for (const opp of opportunities) {
    await history.recordOpportunity(opp);
  }

  // Module: telegram/report/hotlist contract smoke.
  const hotlistService = new HotlistService();
  const report = new ReportService();
  const hotlist = hotlistService.update(opportunities);
  assert.ok(hotlist.length > 0, 'Hotlist should accept opportunity input');
  const reportText = report.hotlistText(hotlist);
  assert.ok(reportText.includes('HOTLIST'), 'Report service should format hotlist output');
  const callback = buildCallback({ namespace: 'SIG', action: 'DETAIL', pair: hotlist[0].pair });
  const parsed = parseCallback(callback);
  assert.equal(parsed?.namespace, 'SIG', 'Telegram callback parse/build must stay aligned');
  assert.equal(parsed?.action, 'DETAIL', 'Telegram callback action should roundtrip');

  await history.recordAnomaly('btc_idr', 'TEST_ANOMALY', { source: 'runtime_test' });

  // Module: persistence/history event durability.
  const pairHistory = await persistence.readPairHistory();
  const anomalyEvents = await persistence.readAnomalyEvents();
  assert.ok(pairHistory.some((e) => e.type === 'snapshot'), 'Snapshot event should be persisted');
  assert.ok(pairHistory.some((e) => e.type === 'signal'), 'Signal event should be persisted');
  assert.ok(pairHistory.some((e) => e.type === 'opportunity'), 'Opportunity event should be persisted');
  assert.ok(anomalyEvents.some((e) => e.type === 'TEST_ANOMALY'), 'Anomaly event should be persisted');

  // Module: risk engine invalid/valid contract checks.
  const risk = new RiskEngine();
  const strictSettings = {
    ...createDefaultSettings(),
    strategy: {
      ...createDefaultSettings().strategy,
      minScoreToBuy: 75,
      minConfidence: 0.68,
      minPumpProbability: 0.7,
      spoofRiskBlockThreshold: 0.55,
      useAntiSpoof: true,
    },
    risk: {
      ...createDefaultSettings().risk,
      maxOpenPositions: 3,
      maxPositionSizeIdr: 300_000,
      maxPairSpreadPct: 1.5,
      cooldownMs: 1000,
    },
  };

  const invalidRisk = risk.checkCanEnter({
    account: defaultAccount,
    settings: strictSettings,
    signal: {
      ...signals[0],
      score: 40,
      confidence: 0.3,
      spreadPct: 2,
    },
    openPositions: [],
    amountIdr: 500_000,
  });
  assert.equal(invalidRisk.allowed, false, 'Risk should reject invalid entry');
  assert.ok(invalidRisk.reasons.length >= 3, 'Invalid entry should include rejection reasons');

  const validOpportunity = makeOpportunity(signals[0]);
  const validRisk = risk.checkCanEnter({
    account: defaultAccount,
    settings: strictSettings,
    signal: validOpportunity,
    openPositions: [],
    amountIdr: 250_000,
  });
  assert.equal(validRisk.allowed, true, 'Risk should allow valid opportunity entry');

  // Module: simulated buy should fill order, open position, increment tradeCount and cooldown.
  await settings.replace({
    ...strictSettings,
    tradingMode: 'FULL_AUTO',
    dryRun: true,
    paperTrade: true,
    uiOnly: false,
  });

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    risk,
    new FakeIndodaxClient() as never,
    positionManager,
    orderManager,
    journal,
  );

  const beforeTradeCount = state.get().tradeCount;
  const beforeCooldown = state.get().pairCooldowns[validOpportunity.pair] ?? 0;
  const buyResult = await execution.buy(defaultAccount.id, validOpportunity, 200_000, 'AUTO');
  assert.ok(buyResult.includes('simulated'), 'Execution should run in simulated mode');

  const latestOrder = orderManager.list()[0];
  assert.ok(latestOrder, 'Order should be created');
  assert.equal(latestOrder.status, 'FILLED', 'Order should be FILLED in simulation');

  const openPosition = positionManager.listOpen().find((p) => p.pair === validOpportunity.pair);
  assert.ok(openPosition, 'Open position should be created after simulated fill');
  assert.equal(state.get().tradeCount, beforeTradeCount + 1, 'tradeCount should increase by 1');
  const afterCooldown = state.get().pairCooldowns[validOpportunity.pair] ?? 0;
  assert.ok(afterCooldown > beforeCooldown, 'pair cooldown should be updated');

  // Module: worker pool + backtest replay.
  const workerPool = new WorkerPoolService(1, true);
  await workerPool.start();

  const resolvedFeatureWorkerPath = (
    workerPool as unknown as { resolveWorkerPath: (type: 'feature' | 'pattern' | 'backtest') => string }
  ).resolveWorkerPath('feature');
  assert.ok(
    resolvedFeatureWorkerPath.includes(path.join('dist', 'workers', 'featureWorker.js')),
    'WorkerPool should prefer dist/workers path when build output exists',
  );

  const featureTask = await workerPool.runFeatureTask({
    snapshot: snapshots[0],
    signal: signals[0],
    recentSnapshots: [snapshots[0]],
  });
  assert.ok(
    Number.isFinite(featureTask.accumulationScore),
    'Feature worker should return valid microstructure features',
  );

  const patternTask = await workerPool.runPatternTask({
    pair: snapshots[0].pair,
    signal: signals[0],
    microstructure: featureTask,
    probability: {
      pumpProbability: 0.7,
      continuationProbability: 0.62,
      trapProbability: 0.15,
      confidence: 0.8,
    },
    regime: 'BREAKOUT_SETUP',
  });
  assert.ok(Array.isArray(patternTask), 'Pattern worker should return array payload');

  const backtestSettings = {
    ...strictSettings,
    workers: {
      ...strictSettings.workers,
      enabled: true,
    },
    strategy: {
      ...strictSettings.strategy,
      minScoreToBuy: 40,
      minPumpProbability: 0.4,
      minConfidence: 0.4,
    },
  };

  const backtest = new BacktestEngine(persistence, workerPool);
  const backtestResult = await backtest.run(
    { pair: 'btc_idr', maxEvents: 100 },
    backtestSettings,
  );
  assert.ok(backtestResult.signalsGenerated > 0, 'Backtest should replay at least one signal');
  assert.deepEqual(
    backtestResult.pairsTested,
    ['btc_idr'],
    'Backtest replay loader should filter snapshots by config.pair',
  );

  const backtestFiles = await fs.readdir(path.resolve(tempDataDir, 'backtest'));
  assert.ok(
    backtestFiles.includes(`${backtestResult.runId}.json`),
    'Backtest result file should be persisted',
  );

  const workerStats = workerPool.snapshot();
  assert.ok(
    workerStats.some((worker) => worker.name === 'feature' && worker.jobsProcessed >= 1),
    'Feature worker should process at least one task',
  );
  assert.ok(
    workerStats.some((worker) => worker.name === 'pattern' && worker.jobsProcessed >= 1),
    'Pattern worker should process at least one task',
  );
  assert.ok(
    workerStats.some((worker) => worker.name === 'backtest' && worker.jobsProcessed >= 1),
    'Backtest worker should process at least one task',
  );

  await workerPool.stop();

  console.log('PASS runtime_backend_regression');
}

main().catch((error) => {
  console.error('FAIL runtime_backend_regression');
  console.error(error);
  process.exit(1);
});
