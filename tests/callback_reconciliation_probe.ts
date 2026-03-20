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
import { IndodaxCallbackServer } from '../src/integrations/indodax/callbackServer';
import { JournalService } from '../src/services/journalService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

class FakeCallbackApi {
  private readonly orders = new Map<string, Record<string, unknown>>();

  queueFilled(orderId: string, baseAsset: string, price: number, quantity: number) {
    this.orders.set(orderId, {
      success: 1,
      return: {
        order: {
          order_id: orderId,
          price: String(price),
          status: 'filled',
          [`order_${baseAsset}`]: String(quantity),
          [`remain_${baseAsset}`]: '0',
        },
      },
    });
  }

  async getOrder(_pair: string, orderId: string) {
    const response = this.orders.get(orderId);
    if (!response) {
      throw new Error(`No queued getOrder response for ${orderId}`);
    }
    return response;
  }

  async openOrders() {
    return { success: 1, return: { orders: {} } };
  }

  async tradeHistory() {
    return { success: 1, return: { trades: [] } };
  }

  async orderHistory() {
    return { success: 1, return: { orders: [] } };
  }
}

class FakeIndodaxClient {
  constructor(private readonly api: FakeCallbackApi) {}

  forAccount() {
    return this.api;
  }
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
  const summary = new SummaryService(persistence, journal, new ReportService(), accountRegistry);

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

  const fakeApi = new FakeCallbackApi();
  fakeApi.queueFilled('CB-ORDER-ID', 'matic', 2500, 10);
  fakeApi.queueFilled('CB-ORDERID', 'xrp', 500, 20);
  fakeApi.queueFilled('CB-ID', 'doge', 1000, 30);

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new FakeIndodaxClient(fakeApi) as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'matic_idr',
    side: 'buy',
    type: 'limit',
    price: 2500,
    quantity: 10,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'CB-ORDER-ID',
  });
  await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'xrp_idr',
    side: 'buy',
    type: 'limit',
    price: 500,
    quantity: 20,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'CB-ORDERID',
  });
  await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'doge_idr',
    side: 'buy',
    type: 'limit',
    price: 1000,
    quantity: 30,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'CB-ID',
  });

  const callbackServer = new IndodaxCallbackServer(
    persistence,
    journal,
    async (payload) => {
      const exchangeOrderId = payload?.order_id ?? payload?.orderId ?? payload?.id;
      if (!exchangeOrderId) {
        return;
      }

      await execution.reconcileFromCallback({
        exchangeOrderId: String(exchangeOrderId),
        pair: typeof payload?.pair === 'string' ? payload.pair : null,
        status: typeof payload?.status === 'string' ? payload.status : null,
      });
    },
  );

  try {
    await callbackServer.start();

    const payloads = [
      { order_id: 'CB-ORDER-ID', pair: 'matic_idr', status: 'filled' },
      { orderId: 'CB-ORDERID', pair: 'xrp_idr', status: 'filled' },
      { id: 'CB-ID', pair: 'doge_idr', status: 'filled' },
    ];

    for (const payload of payloads) {
      const response = await fetch(
        `http://127.0.0.1:${callbackServer.getPort()}${process.env.INDODAX_CALLBACK_PATH}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-host': process.env.INDODAX_CALLBACK_ALLOWED_HOST ?? 'kangtrade.top',
          },
          body: JSON.stringify(payload),
        },
      );

      assert.equal(response.status, 200, 'Accepted callback must return 200');
      assert.equal(await response.text(), 'ok', 'Accepted callback must return ok');
    }

    const reconciled = orderManager.list();
    assert.equal(
      reconciled.filter((item) => item.status === 'FILLED').length,
      3,
      'All callback payload variants must reconcile active orders to FILLED',
    );

    const positions = positionManager.listOpen();
    assert.equal(positions.length, 3, 'Callback reconciliation must materialize filled positions');

    const callbackEvents = await persistence.readIndodaxCallbackEvents();
    assert.equal(callbackEvents.length, 3, 'Callback events must be persisted for all payload variants');

    console.log('PASS callback_reconciliation_probe');
  } finally {
    await callbackServer.stop();
  }
}

main().catch((error) => {
  console.error('FAIL callback_reconciliation_probe');
  console.error(error);
  process.exit(1);
});