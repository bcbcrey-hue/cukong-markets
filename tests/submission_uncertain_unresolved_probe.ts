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

class NoopApi {
  async openOrders() {
    return { success: 1, return: { orders: {} } };
  }

  async orderHistoriesV2() {
    return { success: 1, return: { orders: [] } };
  }

  async myTradesV2() {
    return { success: 1, return: { trades: [] } };
  }
}

class FakeIndodaxClient {
  constructor(private readonly api: NoopApi) {}

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

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new FakeIndodaxClient(new NoopApi()) as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const staleOrder = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'doge_idr',
    side: 'buy',
    type: 'limit',
    price: 1000,
    quantity: 100,
    source: 'AUTO',
    status: 'OPEN',
    exchangeStatus: 'submission_uncertain',
    notes: 'probe stale uncertain order without exchange id',
  });

  await orderManager.update(staleOrder.id, {
    createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
  });

  const messages = await execution.syncActiveOrders();
  assert.ok(messages.length > 0, 'syncActiveOrders should emit update for stale unresolved order');

  const afterSync = orderManager.getById(staleOrder.id);
  assert.ok(afterSync, 'Order should still exist');
  assert.equal(afterSync?.status, 'REJECTED');
  assert.equal(afterSync?.exchangeStatus, 'submission_uncertain_unresolved');

  const summaries = await persistence.readExecutionSummaries();
  assert.equal(
    summaries.some(
      (item) =>
        item.orderId === staleOrder.id &&
        item.status === 'FAILED' &&
        item.accuracy === 'UNRESOLVED_LIVE',
    ),
    true,
    'stale unresolved submission_uncertain must emit FAILED summary with UNRESOLVED_LIVE accuracy',
  );

  console.log('PASS submission_uncertain_unresolved_probe');
}

main().catch((error) => {
  console.error('FAIL submission_uncertain_unresolved_probe');
  console.error(error);
  process.exit(1);
});
