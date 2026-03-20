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

class FakeLiveOrderApi {
  private readonly tradeQueue: Array<Record<string, unknown>> = [];
  private readonly orderQueue = new Map<string, Array<Record<string, unknown>>>();
  private readonly openOrdersQueue: Array<Record<string, unknown>> = [];
  private readonly orderHistoriesV2Queue: Array<Record<string, unknown>> = [];
  private readonly myTradesV2Queue: Array<Record<string, unknown>> = [];

  queueTrade(response: Record<string, unknown>) {
    this.tradeQueue.push(response);
  }

  queueOpenOrders(response: Record<string, unknown>) {
    this.openOrdersQueue.push(response);
  }

  queueOrderHistoriesV2(response: Record<string, unknown>) {
    this.orderHistoriesV2Queue.push(response);
  }

  queueMyTradesV2(response: Record<string, unknown>) {
    this.myTradesV2Queue.push(response);
  }

  queueOrder(orderId: string, ...responses: Array<Record<string, unknown>>) {
    this.orderQueue.set(orderId, responses);
  }

  async trade() {
    const next = this.tradeQueue.shift();
    if (!next) {
      throw new Error('No queued live trade response');
    }
    return next;
  }

  async getOrder(_pair: string, orderId: string) {
    const queue = this.orderQueue.get(orderId);
    if (!queue || queue.length === 0) {
      throw new Error(`No queued getOrder response for ${orderId}`);
    }

    if (queue.length === 1) {
      return queue[0];
    }

    return queue.shift() as Record<string, unknown>;
  }

  async openOrders() {
    const next = this.openOrdersQueue.shift();
    if (!next) {
      return {
        success: 1,
        return: {
          orders: {},
        },
      };
    }

    return next;
  }

  async myTradesV2() {
    const next = this.myTradesV2Queue.shift();
    if (!next) {
      return {
        success: 1,
        return: {
          trades: [],
        },
      };
    }

    return next;
  }

  async orderHistoriesV2() {
    const next = this.orderHistoriesV2Queue.shift();
    if (!next) {
      return {
        success: 1,
        return: {
          orders: [],
        },
      };
    }

    return next;
  }

  async tradeHistory() {
    return {
      success: 1,
      return: {
        trades: [],
      },
    };
  }

  async orderHistory() {
    return {
      success: 1,
      return: {
        orders: [],
      },
    };
  }

  async cancelOrder(_pair: string, orderId: string) {
    return {
      success: 1,
      return: {
        order_id: orderId,
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
    volumeAcceleration: 80,
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
    volumeAcceleration: signalLike.volumeAcceleration,
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

  const strictSettings = {
    ...createDefaultSettings(),
    tradingMode: 'FULL_AUTO' as const,
    dryRun: false,
    paperTrade: false,
    uiOnly: false,
    risk: {
      ...createDefaultSettings().risk,
      maxOpenPositions: 10,
    },
  };
  await settings.replace(strictSettings);
  assert.equal(
    settings.get().risk.takeProfitPct,
    15,
    'Default take profit baseline should be 15%',
  );

  // Startup recovery should sync persisted live order via openOrders.
  const recoveredOrder = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'matic_idr',
    side: 'buy',
    type: 'limit',
    price: 2500,
    quantity: 40,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'RECOVER-OPEN-1',
    exchangeStatus: 'submitted',
    exchangeUpdatedAt: new Date().toISOString(),
    notes: 'persisted before restart',
  });

  liveApi.queueOpenOrders({
    success: 1,
    return: {
      orders: {
        matic_idr: [
          {
            order_id: 'RECOVER-OPEN-1',
            type: 'buy',
            price: '2500',
            order_matic: '40',
            remain_matic: '15',
            status: 'open',
          },
        ],
      },
    },
  });

  const recoveryMessages = await execution.recoverLiveOrdersOnStartup();
  assert.ok(
    recoveryMessages.some((message) => message.includes('RECOVER-OPEN-1')),
    'recoverLiveOrdersOnStartup should report synced persisted live order',
  );

  const recoveredAfterStartup = orderManager.getById(recoveredOrder.id);
  assert.equal(
    recoveredAfterStartup?.status,
    'PARTIALLY_FILLED',
    'Startup recovery should derive partial fill state from openOrders',
  );
  assert.equal(
    recoveredAfterStartup?.filledQuantity,
    25,
    'Startup recovery should derive filled quantity from openOrders remain amount',
  );

  const recoveredPositionQty = positionManager
    .listOpen()
    .filter((position) => position.pair === 'matic_idr')
    .reduce((sum, position) => sum + position.quantity, 0);
  assert.equal(
    recoveredPositionQty,
    25,
    'Startup recovery should materialize recovered filled quantity into runtime positions',
  );
  const recoverySummaries = await persistence.readExecutionSummaries();
  assert.ok(
    recoverySummaries.some(
      (summaryItem) =>
        summaryItem.orderId === recoveredOrder.id && summaryItem.status === 'PARTIALLY_FILLED',
    ),
    'Startup recovery should persist execution summary for recovered partial fill',
  );

  // Live buy partial->filled sync should persist exchange order id and apply fill deltas.
  const partialOpportunity = makeOpportunity('doge_idr', 1000);
  const aggressiveBuyPrice = partialOpportunity.bestAsk * (1 + settings.get().strategy.buySlippageBps / 10_000);
  const orderQuantity = 100_000 / aggressiveBuyPrice;
  const firstFilled = orderQuantity * 0.4;

  liveApi.queueTrade({ success: 1, return: { order_id: 'BUY-PARTIAL-1' } });
  liveApi.queueMyTradesV2({
    success: 1,
    return: {
      trades: [
        {
          order_id: 'BUY-PARTIAL-1',
          price: '1000',
          doge: String(firstFilled),
          fee_idr: '10',
          timestamp: String(Date.now()),
        },
      ],
    },
  });
  liveApi.queueOpenOrders({
    success: 1,
    return: {
      orders: {
        matic_idr: [
          {
            order_id: 'RECOVER-OPEN-1',
            type: 'buy',
            price: '2500',
            order_matic: '40',
            remain_matic: '15',
            status: 'open',
          },
        ],
        doge_idr: [
          {
            order_id: 'BUY-PARTIAL-1',
            type: 'buy',
            price: String(partialOpportunity.bestAsk),
            order_doge: String(orderQuantity),
            remain_doge: String(orderQuantity - firstFilled),
            status: 'open',
          },
        ],
      },
    },
  });
  liveApi.queueOrder(
    'BUY-PARTIAL-1',
    {
      success: 1,
      return: {
        order: {
          order_id: 'BUY-PARTIAL-1',
          price: String(partialOpportunity.bestAsk),
          status: 'open',
          order_doge: String(orderQuantity),
          remain_doge: String(orderQuantity - firstFilled),
        },
      },
    },
    {
      success: 1,
      return: {
        order: {
          order_id: 'BUY-PARTIAL-1',
          price: String(partialOpportunity.bestAsk),
          status: 'filled',
          order_doge: String(orderQuantity),
          remain_doge: '0',
        },
      },
    },
  );

  const partialMessage = await execution.buy(defaultAccount.id, partialOpportunity, 100_000, 'AUTO');
  assert.ok(partialMessage.includes('status=PARTIALLY_FILLED') || partialMessage.includes('status=OPEN'));

  const partialOrder = orderManager.list().find((o) => o.exchangeOrderId === 'BUY-PARTIAL-1');
  assert.ok(partialOrder, 'Live buy should persist exchange order id');
  assert.ok((partialOrder?.filledQuantity ?? 0) > 0, 'Initial live sync should capture partial fill quantity');
  assert.equal(partialOrder?.price, aggressiveBuyPrice, 'Buy should use aggressive limit price from best ask + slippage');
  assert.equal(partialOrder?.feeAmount, 10, 'Initial reconciliation should capture exchange fee');

  const beforeSyncTotal = positionManager
    .listOpen()
    .filter((p) => p.pair === 'doge_idr')
    .reduce((sum, p) => sum + p.quantity, 0);

  await execution.syncActiveOrders();

  const afterOpenOrdersSync = orderManager.list().find((o) => o.exchangeOrderId === 'BUY-PARTIAL-1');
  assert.equal(
    afterOpenOrdersSync?.status,
    'PARTIALLY_FILLED',
    'openOrders sync should preserve partial state while order is still open',
  );

  liveApi.queueOpenOrders({
    success: 1,
    return: {
      orders: {},
    },
  });
  liveApi.queueMyTradesV2({
    success: 1,
    return: {
      trades: [
        {
          order_id: 'BUY-PARTIAL-1',
          price: '1000',
          doge: String(firstFilled),
          fee_idr: '10',
          timestamp: String(Date.now() - 1000),
        },
        {
          order_id: 'BUY-PARTIAL-1',
          price: '1010',
          doge: String(orderQuantity - firstFilled),
          fee_idr: '15',
          timestamp: String(Date.now()),
        },
      ],
    },
  });

  liveApi.queueOrder('RECOVER-OPEN-1', {
    success: 1,
    return: {
      order: {
        order_id: 'RECOVER-OPEN-1',
        price: '2500',
        status: 'open',
        order_matic: '40',
        remain_matic: '15',
      },
    },
  });

  await execution.syncActiveOrders();

  const afterSyncOrder = orderManager.list().find((o) => o.exchangeOrderId === 'BUY-PARTIAL-1');
  assert.equal(afterSyncOrder?.status, 'FILLED', 'syncActiveOrders should move order to FILLED after exchange fill');
  assert.equal(afterSyncOrder?.feeAmount, 25, 'Fee cumulative should be captured from exchange trades');
  assert.equal(afterSyncOrder?.executedTradeCount, 2, 'Executed trade detail count should be captured');
  assert.equal(afterSyncOrder?.averageFillPrice, 1006, 'Average fill should follow weighted exchange trades');

  const afterSyncTotal = positionManager
    .listOpen()
    .filter((p) => p.pair === 'doge_idr')
    .reduce((sum, p) => sum + p.quantity, 0);
  assert.ok(afterSyncTotal > beforeSyncTotal, 'syncActiveOrders should apply additional fill delta to positions');

  const dogePositions = positionManager
    .listOpen()
    .filter((position) => position.pair === 'doge_idr' && position.accountId === defaultAccount.id);
  assert.equal(dogePositions.length, 1, 'Repeated partial fills should remain one logical position per pair/account');
  assert.equal(dogePositions[0]?.quantity, orderQuantity, 'Merged logical position should hold total executed quantity');
  assert.equal(dogePositions[0]?.averageEntryPrice, 1006, 'Merged logical position should carry weighted average entry');
  assert.equal(dogePositions[0]?.entryFeesPaid, 25, 'Merged logical position should accumulate entry fees');
  const buySummaries = await persistence.readExecutionSummaries();
  assert.ok(
    buySummaries.some(
      (summaryItem) =>
        summaryItem.exchangeOrderId === 'BUY-PARTIAL-1' && summaryItem.status === 'SUBMITTED',
    ),
    'Live buy should persist submitted execution summary',
  );
  assert.ok(
    buySummaries.some(
      (summaryItem) =>
        summaryItem.exchangeOrderId === 'BUY-PARTIAL-1' && summaryItem.status === 'PARTIALLY_FILLED',
    ),
    'Live buy should persist partial execution summary',
  );
  assert.ok(
    buySummaries.some(
      (summaryItem) =>
        summaryItem.exchangeOrderId === 'BUY-PARTIAL-1' && summaryItem.status === 'FILLED',
    ),
    'Live buy should persist filled execution summary',
  );

  // Duplicate active buy guard should block same pair/account live submission.
  const dupBuyOpportunity = makeOpportunity('trx_idr', 5000);
  const dupBuyQty = 100_000 / dupBuyOpportunity.bestAsk;
  liveApi.queueTrade({ success: 1, return: { order_id: 'BUY-DUP-1' } });
  liveApi.queueOrder('BUY-DUP-1', {
    success: 1,
    return: {
      order: {
        order_id: 'BUY-DUP-1',
        price: String(dupBuyOpportunity.bestAsk),
        status: 'open',
        order_trx: String(dupBuyQty),
        remain_trx: String(dupBuyQty),
      },
    },
  });
  await execution.buy(defaultAccount.id, dupBuyOpportunity, 100_000, 'AUTO');

  const skippedAutoBuy = await execution.attemptAutoBuy(dupBuyOpportunity);
  assert.match(
    skippedAutoBuy,
    /skip auto-buy/,
    'attemptAutoBuy should skip deterministically when active BUY order already exists',
  );

  await assert.rejects(
    () => execution.buy(defaultAccount.id, dupBuyOpportunity, 100_000, 'AUTO'),
    /Masih ada order BUY aktif/,
    'Duplicate active BUY should be rejected before sending live order',
  );

  // Duplicate active sell guard should block same position while prior sell still open.
  const seededPosition = await positionManager.open({
    accountId: defaultAccount.id,
    pair: 'ada_idr',
    quantity: 50,
    entryPrice: 10_000,
    stopLossPrice: null,
    takeProfitPrice: 10_050,
  });
  liveApi.queueTrade({ success: 1, return: { order_id: 'SELL-DUP-1' } });
  liveApi.queueOrder('SELL-DUP-1', {
    success: 1,
    return: {
      order: {
        order_id: 'SELL-DUP-1',
        price: '10000',
        status: 'open',
        order_ada: '20',
        remain_ada: '20',
      },
    },
  });
  await execution.manualSell(seededPosition.id, 20, 'AUTO');

  await assert.rejects(
    () => execution.manualSell(seededPosition.id, 5, 'AUTO'),
    /Masih ada order SELL aktif/,
    'Duplicate active SELL should be rejected before sending live order',
  );

  await positionManager.updateMark('ada_idr', 10_100);
  const beforeEvaluateSellOrderCount = orderManager
    .list()
    .filter((order) => order.side === 'sell' && order.relatedPositionId === seededPosition.id).length;
  const evaluateMessages = await execution.evaluateOpenPositions();
  const afterEvaluateSellOrderCount = orderManager
    .list()
    .filter((order) => order.side === 'sell' && order.relatedPositionId === seededPosition.id).length;
  assert.ok(
    evaluateMessages.some((message) => message.includes('exit skipped')),
    'evaluateOpenPositions should skip deterministic auto-sell when active SELL order already exists',
  );
  assert.equal(
    afterEvaluateSellOrderCount,
    beforeEvaluateSellOrderCount,
    'evaluateOpenPositions should not submit duplicate SELL order during recovery-safe auto exit',
  );

  // cancelAllOrders should cancel all active live orders locally.
  const cancelSummary = await execution.cancelAllOrders();
  assert.ok(cancelSummary.includes('Canceled'), 'cancelAllOrders should return summary');

  const canceledBuy = orderManager.list().find((o) => o.exchangeOrderId === 'BUY-DUP-1');
  const canceledSell = orderManager.list().find((o) => o.exchangeOrderId === 'SELL-DUP-1');
  assert.equal(canceledBuy?.status, 'CANCELED', 'Active buy should be marked CANCELED after cancelAllOrders');
  assert.equal(canceledSell?.status, 'CANCELED', 'Active sell should be marked CANCELED after cancelAllOrders');

  // Stale aggressive buy should cancel remainder instead of hanging.
  const staleOrder = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'pepe_idr',
    side: 'buy',
    type: 'limit',
    price: 100,
    quantity: 1000,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'STALE-BUY-1',
    exchangeStatus: 'open',
    exchangeUpdatedAt: new Date().toISOString(),
    notes: 'stale buy order',
  });
  await orderManager.update(staleOrder.id, {
    createdAt: new Date(Date.now() - settings.get().strategy.buyOrderTimeoutMs - 1_000).toISOString(),
  });

  liveApi.queueOpenOrders({
    success: 1,
    return: {
      orders: {
        pepe_idr: [
          {
            order_id: 'STALE-BUY-1',
            type: 'buy',
            price: '100',
            order_pepe: '1000',
            remain_pepe: '1000',
            status: 'open',
          },
        ],
      },
    },
  });

  await execution.syncActiveOrders();
  const staleAfterSync = orderManager.getById(staleOrder.id);
  assert.equal(staleAfterSync?.status, 'CANCELED', 'Stale buy remainder should be canceled after timeout');
  assert.equal(
    staleAfterSync?.exchangeStatus,
    'canceled_after_timeout',
    'Timeout cancellation should be reflected in exchange status field',
  );

  const historyRecoveredOrder = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'xlm_idr',
    side: 'buy',
    type: 'limit',
    price: 100,
    quantity: 200,
    source: 'AUTO',
    status: 'OPEN',
    referencePrice: 100,
    exchangeOrderId: 'RECOVER-HISTORY-1',
    exchangeStatus: 'submitted',
    exchangeUpdatedAt: new Date().toISOString(),
    notes: 'persisted for orderHistoriesV2 recovery test',
  });

  liveApi.queueOpenOrders({
    success: 1,
    return: {
      orders: {},
    },
  });
  liveApi.queueMyTradesV2({
    success: 1,
    return: {
      trades: [
        {
          order_id: 'RECOVER-HISTORY-1',
          price: '101',
          xlm: '200',
          fee_idr: '5',
          timestamp: String(Date.now()),
        },
      ],
    },
  });
  liveApi.queueOrderHistoriesV2({
    success: 1,
    return: {
      orders: [
        {
          order_id: 'RECOVER-HISTORY-1',
          price: '101',
          order_xlm: '200',
          remain_xlm: '0',
          status: 'filled',
        },
      ],
    },
  });

  const historyRecoveryMessages = await execution.recoverLiveOrdersOnStartup();
  assert.ok(
    historyRecoveryMessages.some((message) => message.includes('RECOVER-HISTORY-1')),
    'Recovery should reconcile terminal order via orderHistoriesV2 when getOrder is unavailable',
  );

  const historyRecoveredAfter = orderManager.getById(historyRecoveredOrder.id);
  assert.equal(
    historyRecoveredAfter?.status,
    'FILLED',
    'orderHistoriesV2 should move persisted live order to FILLED when exchange history is terminal',
  );
  assert.equal(
    historyRecoveredAfter?.feeAmount,
    5,
    'orderHistoriesV2 recovery should still merge fee from myTradesV2 when available',
  );
  const historyRecoveredPosition = positionManager
    .listOpen()
    .find((position) => position.pair === 'xlm_idr' && position.accountId === defaultAccount.id);
  assert.ok(
    historyRecoveredPosition,
    'orderHistoriesV2 recovery should materialize filled quantity into runtime position state after restart',
  );

  console.log('PASS live_execution_hardening_probe');
}

main().catch((error) => {
  console.error('FAIL live_execution_hardening_probe');
  console.error(error);
  process.exit(1);
});
