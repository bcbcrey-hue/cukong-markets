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

class WindowedHistoryApi {
  orderHistoryCalls = 0;
  openOrdersOptions: Array<Record<string, unknown> | undefined> = [];
  orderHistoriesOptions: Array<Record<string, unknown> | undefined> = [];
  myTradesOptions: Array<Record<string, unknown> | undefined> = [];

  async openOrders(_pair?: string, options?: Record<string, unknown>) {
    this.openOrdersOptions.push(options);
    return { success: 1, return: { orders: {} } };
  }

  async orderHistoriesV2(_params?: Record<string, unknown>, options?: Record<string, unknown>) {
    this.orderHistoryCalls += 1;
    this.orderHistoriesOptions.push(options);

    if (this.orderHistoryCalls < 3) {
      return { success: 1, return: { orders: [] } };
    }

    return {
      success: 1,
      return: {
        orders: [
          {
            order_id: 'AMB-HISTORY-3',
            type: 'buy',
            price: '1000',
            order_doge: '100',
            remain_doge: '100',
            status: 'open',
          },
        ],
      },
    };
  }

  async myTradesV2(_params?: Record<string, unknown>, options?: Record<string, unknown>) {
    this.myTradesOptions.push(options);
    return { success: 1, return: { trades: [] } };
  }
}

class FakeIndodaxClient {
  constructor(private readonly api: WindowedHistoryApi) {}

  forAccount() {
    return this.api;
  }
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

  const api = new WindowedHistoryApi();
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

  const uncertainOrder = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'doge_idr',
    side: 'buy',
    type: 'limit',
    price: 1000,
    quantity: 100,
    source: 'AUTO',
    status: 'OPEN',
    exchangeStatus: 'submission_uncertain',
    notes: 'probe bounded history window for submission_uncertain',
  });

  const syncMessages = await execution.syncActiveOrders();
  assert.ok(
    syncMessages.some((item) => item.includes('AMB-HISTORY-3')),
    'submission_uncertain should attach exchange order id from deeper bounded history window',
  );
  assert.ok(
    api.orderHistoryCalls >= 3,
    'submission_uncertain reconciliation should not stop at first two orderHistoriesV2 windows',
  );
  assert.ok(
    api.openOrdersOptions.some((options) => options?.lane === 'background_recovery'),
    'openOrders lookup for ambiguous recovery must use background_recovery lane',
  );
  assert.ok(
    api.orderHistoriesOptions.some((options) => options?.lane === 'background_recovery'),
    'orderHistoriesV2 lookup for ambiguous recovery must inherit background_recovery lane',
  );
  assert.ok(
    api.myTradesOptions.some((options) => options?.lane === 'background_recovery'),
    'myTradesV2 trade-stats lookup after history match must inherit background_recovery lane',
  );
  assert.ok(
    api.myTradesOptions.some((options) => options?.requestPriority === -2),
    'myTradesV2 trade-stats lookup should preserve recovery requestPriority from syncActiveOrders lane',
  );

  const afterSync = orderManager.getById(uncertainOrder.id);
  assert.equal(
    afterSync?.exchangeOrderId,
    'AMB-HISTORY-3',
    'submission_uncertain should bind to history match found after multiple bounded windows',
  );
  assert.equal(afterSync?.status, 'OPEN', 'history-resolved order with remain=full should stay OPEN');

  console.log('PASS submission_uncertain_bounded_history_probe');
}

main().catch((error) => {
  console.error('FAIL submission_uncertain_bounded_history_probe');
  console.error(error);
  process.exit(1);
});
