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

// Module: failed execution summary contract for BUY/SELL live error paths.
class FakeLiveOrderApi {
  private readonly tradeQueue: Array<Record<string, unknown> | Error> = [];

  queueTrade(response: Record<string, unknown> | Error) {
    this.tradeQueue.push(response);
  }

  async trade() {
    const next = this.tradeQueue.shift();
    if (!next) {
      throw new Error('No queued live trade response');
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }

  async getOrder() {
    return {
      success: 1,
      return: {
        order: {
          status: 'open',
        },
      },
    };
  }

  async cancelOrder() {
    return {
      success: 1,
      return: {
        status: 'canceled',
      },
    };
  }
}

class FakeLiveIndodaxClient {
  constructor(private readonly api: FakeLiveOrderApi) {}

  forAccount() {
    return this.api;
  }
}

function makeOpportunity(pair: string, ask: number): OpportunityAssessment {
  const now = Date.now();
  const signalLike: SignalCandidate = {
    pair,
    score: 90,
    confidence: 0.9,
    reasons: ['test'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 90,
    quoteFlowAccelerationScore: 80,
    orderbookImbalance: 0.2,
    spreadPct: 0.3,
    marketPrice: ask,
    bestBid: ask * 0.999,
    bestAsk: ask,
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
    spoofRisk: 0.2,
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
      leadScore: 88,
    },
    reasons: ['ok'],
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
    referencePrice: ask,
    bestBid: ask * 0.999,
    bestAsk: ask,
    spreadPct: 0.3,
    liquidityScore: 90,
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
  });

  const liveApi = new FakeLiveOrderApi();
  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new FakeLiveIndodaxClient(liveApi) as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const failedBuyOpportunity = makeOpportunity('link_idr', 200000);
  liveApi.queueTrade(new Error('exchange buy outage'));
  await assert.rejects(
    () => execution.buy(defaultAccount.id, failedBuyOpportunity, 100_000, 'AUTO'),
    /exchange buy outage/,
  );

  const openedPosition = await positionManager.open({
    accountId: defaultAccount.id,
    pair: 'avax_idr',
    quantity: 5,
    entryPrice: 100000,
    stopLossPrice: null,
    takeProfitPrice: null,
  });

  liveApi.queueTrade(new Error('exchange sell outage'));
  await assert.rejects(
    () => execution.manualSell(openedPosition.id, 2, 'AUTO'),
    /exchange sell outage/,
  );

  const summaries = await persistence.readExecutionSummaries();
  const failedBuy = summaries.find((item) => item.pair === 'link_idr' && item.side === 'buy');
  const failedSell = summaries.find((item) => item.pair === 'avax_idr' && item.side === 'sell');

  assert.equal(failedBuy?.status, 'FAILED', 'BUY live failure should persist FAILED execution summary');
  assert.equal(failedBuy?.accuracy, 'CONFIRMED_LIVE', 'BUY failure summary should be CONFIRMED_LIVE');
  assert.equal(failedSell?.status, 'FAILED', 'SELL live failure should persist FAILED execution summary');
  assert.equal(failedSell?.accuracy, 'CONFIRMED_LIVE', 'SELL failure summary should be CONFIRMED_LIVE');

  const outcomes = await persistence.readTradeOutcomes();
  assert.ok(
    outcomes.every((item) => item.positionId !== openedPosition.id),
    'Trade outcome summary must not be written when SELL failed and position stays open',
  );

  console.log('PASS execution_summary_failed_probe');
}

main().catch((error) => {
  console.error('FAIL execution_summary_failed_probe');
  console.error(error);
  process.exit(1);
});
