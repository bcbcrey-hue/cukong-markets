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

class AmbiguousTradeApi {
  private readonly openOrdersQueue: Array<Record<string, unknown>> = [];

  queueOpenOrders(response: Record<string, unknown>) {
    this.openOrdersQueue.push(response);
  }

  async trade() {
    const error = new Error('fetch failed: timeout while waiting exchange response');
    error.name = 'TimeoutError';
    throw error;
  }

  async openOrders() {
    const next = this.openOrdersQueue.shift();
    if (!next) {
      return { success: 1, return: { orders: {} } };
    }
    return next;
  }

  async getOrder() {
    return {
      success: 1,
      return: {
        order: {
          order_id: 'AMB-BUY-1',
          price: '1006',
          status: 'open',
          order_doge: '99.40357852882704',
          remain_doge: '99.40357852882704',
        },
      },
    };
  }

  async myTradesV2() {
    return { success: 1, return: { trades: [] } };
  }

  async orderHistoriesV2() {
    return { success: 1, return: { orders: [] } };
  }

  async cancelOrder() {
    return { success: 1, return: { status: 'canceled' } };
  }
}

class FakeIndodaxClient {
  constructor(private readonly api: AmbiguousTradeApi) {}

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
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 90,
    volumeAcceleration: 80,
    orderbookImbalance: 0.2,
    spreadPct: 0.2,
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
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: signalLike.regime,
    breakoutPressure: signalLike.breakoutPressure,
    volumeAcceleration: signalLike.volumeAcceleration,
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
    referencePrice: ask,
    bestBid: ask * 0.999,
    bestAsk: ask,
    spreadPct: 0.2,
    liquidityScore: 90,
    timestamp: now,
  };
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
  });

  const api = new AmbiguousTradeApi();
  api.queueOpenOrders({
    success: 1,
    return: {
      orders: {
        doge_idr: [
          {
            order_id: 'AMB-BUY-1',
            type: 'buy',
            price: '1006',
            order_doge: '99.40357852882704',
            remain_doge: '99.40357852882704',
            status: 'open',
          },
        ],
      },
    },
  });

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new FakeIndodaxClient(api) as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const message = await execution.buy(
    defaultAccount.id,
    makeOpportunity('doge_idr', 1000),
    100_000,
    'AUTO',
  );
  assert.match(message, /AMB-BUY-1/, 'Ambiguous live submission should reconcile to concrete exchange order id');

  const order = orderManager.list()[0];
  assert.ok(order, 'Order should exist after ambiguous submission');
  assert.equal(order.exchangeOrderId, 'AMB-BUY-1', 'Ambiguous submission should attach exchange order id from openOrders');
  assert.equal(order.status, 'OPEN', 'Ambiguous submission should remain active after reconciliation');

  const summaries = await persistence.readExecutionSummaries();
  assert.ok(
    summaries.some((item) => item.reason?.includes('submission uncertain after transport error')),
    'Submission uncertain summary should be persisted for operator visibility',
  );

  console.log('PASS live_submission_uncertain_probe');
}

main().catch((error) => {
  console.error('FAIL live_submission_uncertain_probe');
  console.error(error);
  process.exit(1);
});