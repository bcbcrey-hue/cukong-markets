import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { SettingsService } from '../src/domain/settings/settingsService';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import type { OpportunityAssessment, SignalCandidate } from '../src/core/types';
import { JournalService } from '../src/services/journalService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

class FakeIndodaxClient {
  forAccount() {
    throw new Error('Exchange trade must not be called for invalid BUY entry');
  }
}

function makeOpportunity(pair: string, askPrice: number): OpportunityAssessment {
  const now = Date.now();
  const signalLike: SignalCandidate = {
    pair,
    score: 90,
    confidence: 0.9,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 90,
    quoteFlowAccelerationScore: 80,
    orderbookImbalance: 0.2,
    spreadPct: 0.2,
    marketPrice: askPrice,
    bestBid: askPrice * 0.999,
    bestAsk: askPrice,
    liquidityScore: 90,
    change1m: 1,
    change5m: 2,
    contributions: [],
    timestamp: now,
  };

  return {
    pair,
    rawScore: signalLike.score,
    finalScore: 90,
    confidence: signalLike.confidence,
    pumpProbability: 0.9,
    continuationProbability: 0.8,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: signalLike.regime,
    breakoutPressure: signalLike.breakoutPressure,
    quoteFlowAccelerationScore: signalLike.quoteFlowAccelerationScore,
    orderbookImbalance: signalLike.orderbookImbalance,
    change1m: signalLike.change1m,
    change5m: signalLike.change5m,
    entryTiming: {
      state: 'READY',
      quality: 90,
      reason: 'ready',
      leadScore: 90,
    },
    reasons: ['ready'],
    warnings: [],
    featureBreakdown: [],
    historicalContext: {
      pair,
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
    referencePrice: askPrice,
    bestBid: askPrice * 0.999,
    bestAsk: askPrice,
    spreadPct: 0.2,
    liquidityScore: 90,
    timestamp: now,
  };
}

async function expectBuyRejectedWithoutOrder(
  execution: ExecutionEngine,
  orderManager: OrderManager,
  accountId: string,
  opportunity: OpportunityAssessment,
  amountIdr: number,
): Promise<void> {
  const beforeCount = orderManager.list().length;

  await assert.rejects(
    () => execution.buy(accountId, opportunity, amountIdr, 'AUTO'),
    /tidak valid/i,
    'BUY invalid input must be rejected',
  );

  const afterCount = orderManager.list().length;
  assert.equal(afterCount, beforeCount, 'BUY rejection must happen before order is created');
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const report = new ReportService();
  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);
  const summary = new SummaryService(persistence, journal, report, accountRegistry);

  await Promise.all([
    state.load(),
    settings.load(),
    journal.load(),
    orderManager.load(),
    positionManager.load(),
  ]);

  await accountRegistry.saveLegacyUpload([{ name: 'TEST_MAIN', apiKey: 'k', apiSecret: 's' }]);
  const defaultAccount = accountRegistry.getDefault();
  assert.ok(defaultAccount, 'Default account should exist');

  await settings.replace({
    ...createDefaultSettings(),
    tradingMode: 'FULL_AUTO',
    dryRun: false,
    paperTrade: false,
    uiOnly: false,
    strategy: {
      ...createDefaultSettings().strategy,
      buySlippageBps: 150,
      maxBuySlippageBps: 150,
    },
  });

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

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', 0),
    100_000,
  );

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', -10),
    100_000,
  );

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', Number.NaN),
    100_000,
  );

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', Number.POSITIVE_INFINITY),
    100_000,
  );

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', Number.MAX_VALUE),
    100_000,
  );

  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    makeOpportunity('btc_idr', 1_000_000_000),
    Number.POSITIVE_INFINITY,
  );

  const missingReference = makeOpportunity('btc_idr', 0);
  missingReference.referencePrice = Number.NaN;
  await expectBuyRejectedWithoutOrder(
    execution,
    orderManager,
    defaultAccount.id,
    missingReference,
    100_000,
  );

  console.log('PASS buy_entry_price_guard_probe');
}

main().catch((error) => {
  console.error('FAIL buy_entry_price_guard_probe');
  console.error(error);
  process.exit(1);
});
