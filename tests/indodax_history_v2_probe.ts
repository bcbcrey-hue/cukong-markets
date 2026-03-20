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
import { JournalService } from '../src/services/journalService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

class TrackingHistoryApi {
  public orderHistoryCalls: Array<Record<string, unknown>> = [];
  public myTradesCalls: Array<Record<string, unknown>> = [];
  public counters = {
    legacyOrders: 0,
    legacyTrades: 0,
  };

  constructor(
    private readonly config: {
      onOrderHistoriesV2?: (options: Record<string, unknown>) => Record<string, unknown> | Error;
      onMyTradesV2?: (options: Record<string, unknown>) => Record<string, unknown> | Error;
    },
  ) {}

  async openOrders() {
    return {
      success: 1,
      return: { orders: {} },
    };
  }

  async getOrder() {
    throw new Error('getOrder unavailable for history mode probe');
  }

  async orderHistoriesV2(options: Record<string, unknown> = {}) {
    this.orderHistoryCalls.push(options);
    const response = this.config.onOrderHistoriesV2?.(options);
    if (response instanceof Error) {
      throw response;
    }
    return response ?? { success: 1, return: { orders: [] } };
  }

  async myTradesV2(options: Record<string, unknown> = {}) {
    this.myTradesCalls.push(options);
    const response = this.config.onMyTradesV2?.(options);
    if (response instanceof Error) {
      throw response;
    }
    return response ?? { success: 1, return: { trades: [] } };
  }

  async orderHistory() {
    this.counters.legacyOrders += 1;
    return { success: 1, return: { orders: [] } };
  }

  async tradeHistory() {
    this.counters.legacyTrades += 1;
    return { success: 1, return: { trades: [] } };
  }
}

class FakeIndodaxClient {
  constructor(private readonly api: TrackingHistoryApi) {}

  forAccount() {
    return this.api;
  }
}

function buildV2OrderPayload(pair: string, orderId: string, quantity: number, price: number) {
  const [asset] = pair.split('_');
  return {
    success: 1,
    return: {
      orders: [
        {
          order_id: orderId,
          pair,
          status: 'filled',
          price,
          [`order_${asset}`]: quantity,
          remaining: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    },
  };
}

function buildV2TradePayload(pair: string, orderId: string, quantity: number, price: number, fee = 5) {
  const [asset] = pair.split('_');
  return {
    success: 1,
    return: {
      trades: [
        {
          order_id: orderId,
          pair,
          price,
          [asset]: quantity,
          fee_idr: fee,
          timestamp: Date.now(),
        },
      ],
    },
  };
}

function buildLegacyOrderPayload(pair: string, orderId: string, quantity: number, price: number) {
  const [asset] = pair.split('_');
  return {
    success: 1,
    return: {
      orders: [
        {
          order_id: orderId,
          pair,
          status: 'filled',
          price,
          [`order_${asset}`]: quantity,
          [`remain_${asset}`]: 0,
          submit_time: Date.now(),
          finish_time: Date.now(),
        },
      ],
    },
  };
}

function buildLegacyTradePayload(pair: string, orderId: string, quantity: number, price: number, fee = 5) {
  const [asset] = pair.split('_');
  return {
    success: 1,
    return: {
      trades: [
        {
          order_id: orderId,
          price,
          [asset]: quantity,
          fee_idr: fee,
          timestamp: Date.now(),
        },
      ],
    },
  };
}

async function createHarness(tempDataDir: string, api: TrackingHistoryApi) {
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
  const account = accountRegistry.getDefault();
  assert.ok(account, 'Default account should exist');

  await settings.replace({
    ...createDefaultSettings(),
    tradingMode: 'FULL_AUTO',
    dryRun: false,
    paperTrade: false,
    uiOnly: false,
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

  return {
    execution,
    orderManager,
    positionManager,
    persistence,
    account,
  };
}

function emptyV2OrderPayload() {
  return {
    success: 1,
    return: {
      orders: [],
    },
  };
}

function emptyV2TradePayload() {
  return {
    success: 1,
    return: {
      trades: [],
    },
  };
}

async function seedActiveOrder(
  orderManager: OrderManager,
  accountId: string,
  pair: string,
  orderId: string,
  quantity: number,
  price: number,
  createdAt: string,
) {
  const order = await orderManager.create({
    accountId,
    pair,
    side: 'buy',
    type: 'limit',
    price,
    quantity,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: orderId,
    exchangeStatus: 'submitted',
    exchangeUpdatedAt: new Date().toISOString(),
    referencePrice: price,
    notes: 'history probe',
  });

  await orderManager.update(order.id, { createdAt });
  return orderManager.getById(order.id) ?? order;
}

async function main() {
  const baseTempDir = process.env.DATA_DIR;
  assert.ok(baseTempDir, 'DATA_DIR must be provided for isolated test run');
  const previousMode = process.env.INDODAX_HISTORY_MODE;

  try {
    process.env.INDODAX_HISTORY_MODE = 'v2_prefer';
    {
      const targetTime = Date.now() - 36 * 60 * 60 * 1000;
      const api = new TrackingHistoryApi({
        onOrderHistoriesV2: (options) => {
          const startTime = Number(options.startTime);
          const endTime = Number(options.endTime);
          if (startTime <= targetTime && targetTime <= endTime) {
            return buildV2OrderPayload('xlm_idr', 'V2-ORDER-1', 200, 101);
          }

          return emptyV2OrderPayload();
        },
        onMyTradesV2: (options) =>
          options.orderId === 'V2-ORDER-1'
            ? buildV2TradePayload('xlm_idr', 'V2-ORDER-1', 200, 101, 5)
            : emptyV2TradePayload(),
      });
      const harness = await createHarness(path.resolve(baseTempDir, 'v2-prefer-success'), api);
      await seedActiveOrder(
        harness.orderManager,
        harness.account!.id,
        'xlm_idr',
        'V2-ORDER-1',
        200,
        100,
        new Date(targetTime).toISOString(),
      );

      await harness.execution.recoverLiveOrdersOnStartup();

      const order = harness.orderManager.list()[0];
      const position = harness.positionManager.listOpen()[0];
      assert.equal(order?.status, 'FILLED', 'v2_prefer alias must reconcile order via canonical v2 payload');
      assert.equal(order?.feeAmount, 5, 'myTrades v2 must preserve fee accounting for >24h recovery');
      assert.equal(position?.quantity, 200, 'v2 recovery must materialize filled quantity into position state');
      assert.equal(api.orderHistoryCalls.length > 0, true, 'v2 order history should be queried during recovery');
      assert.equal(api.myTradesCalls.length > 0, true, 'myTrades v2 should be queried during recovery');
      assert.equal(
        api.orderHistoryCalls.every(
          (call) => typeof call.startTime === 'number' && typeof call.endTime === 'number',
        ),
        true,
        'order history v2 recovery must send explicit startTime/endTime instead of relying on 24h default',
      );
      assert.equal(
        api.orderHistoryCalls.some(
          (call) => Number(call.startTime) <= targetTime && targetTime <= Number(call.endTime),
        ),
        true,
        'one explicit v2 order history window must cover the >24h target order time',
      );
      assert.equal(api.myTradesCalls[0]?.orderId, 'V2-ORDER-1', 'myTrades v2 must send orderId filter');
      assert.equal(api.counters.legacyOrders, 0, 'startup recovery must not use legacy orderHistory');
      assert.equal(api.counters.legacyTrades, 0, 'startup recovery must not use legacy tradeHistory');
    }

    process.env.INDODAX_HISTORY_MODE = 'v2_only';
    {
      const actualTargetTime = Date.now() - 28 * 24 * 60 * 60 * 1000;
      const localCreatedAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
      const api = new TrackingHistoryApi({
        onOrderHistoriesV2: (options) => {
          const startTime = Number(options.startTime);
          const endTime = Number(options.endTime);
          if (startTime <= actualTargetTime && actualTargetTime <= endTime) {
            return buildV2OrderPayload('ada_idr', 'CHUNK-LOOKUP-1', 50, 10000);
          }

          return emptyV2OrderPayload();
        },
        onMyTradesV2: (options) =>
          options.orderId === 'CHUNK-LOOKUP-1'
            ? buildV2TradePayload('ada_idr', 'CHUNK-LOOKUP-1', 50, 10000, 8)
            : emptyV2TradePayload(),
      });
      const harness = await createHarness(path.resolve(baseTempDir, 'chunked-windowed-search'), api);
      await seedActiveOrder(
        harness.orderManager,
        harness.account!.id,
        'ada_idr',
        'CHUNK-LOOKUP-1',
        50,
        10000,
        localCreatedAt,
      );

      await harness.execution.recoverLiveOrdersOnStartup();

      const order = harness.orderManager.list()[0];
      assert.equal(order?.status, 'FILLED', 'chunked windowed v2 lookup should reconcile orders older than 7 days');
      assert.equal(order?.feeAmount, 8, 'chunked v2 recovery should preserve fee accounting');
      assert.equal(api.orderHistoryCalls.length > 1, true, 'older order recovery should require multiple bounded v2 windows');
      assert.equal(
        api.orderHistoryCalls.every(
          (call) => Number(call.endTime) - Number(call.startTime) <= 7 * 24 * 60 * 60 * 1000,
        ),
        true,
        'each order history v2 request must stay within the 7 day maximum range',
      );
      assert.equal(
        api.orderHistoryCalls.some(
          (call) => Number(call.startTime) <= actualTargetTime && actualTargetTime <= Number(call.endTime),
        ),
        true,
        'chunked lookup must eventually hit the historical window that contains the target order',
      );
      assert.equal(api.counters.legacyOrders, 0, 'chunked v2 lookup must not fallback to legacy orderHistory');
      assert.equal(api.counters.legacyTrades, 0, 'chunked v2 lookup must not fallback to legacy tradeHistory');
    }

    process.env.INDODAX_HISTORY_MODE = 'v2_only';
    {
      const api = new TrackingHistoryApi({
        onOrderHistoriesV2: () => new Error('v2 order history unavailable'),
        onMyTradesV2: () => new Error('v2 myTrades unavailable'),
      });
      const harness = await createHarness(path.resolve(baseTempDir, 'v2-unavailable-no-legacy-fallback'), api);
      await seedActiveOrder(
        harness.orderManager,
        harness.account!.id,
        'doge_idr',
        'NO-FALLBACK-1',
        100,
        1000,
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      );

      const messages = await harness.execution.recoverLiveOrdersOnStartup();

      const order = harness.orderManager.list()[0];
      assert.equal(messages.length, 0, 'runtime must not silently fallback to legacy when v2 is unavailable');
      assert.equal(order?.status, 'OPEN', 'order should stay unresolved when canonical v2 data is unavailable');
      assert.equal(api.orderHistoryCalls.length > 0, true, 'v2 order history should still be attempted');
      assert.equal(api.myTradesCalls.length > 0, true, 'myTrades v2 should still be attempted');
      assert.equal(api.counters.legacyOrders, 0, 'canonical runtime must not call legacy orderHistory on v2 failure');
      assert.equal(api.counters.legacyTrades, 0, 'canonical runtime must not call legacy tradeHistory on v2 failure');
    }

    console.log('PASS indodax_history_v2_probe');
  } finally {
    if (previousMode === undefined) {
      delete process.env.INDODAX_HISTORY_MODE;
    } else {
      process.env.INDODAX_HISTORY_MODE = previousMode;
    }
  }
}

main().catch((error) => {
  console.error('FAIL indodax_history_v2_probe');
  console.error(error);
  process.exit(1);
});