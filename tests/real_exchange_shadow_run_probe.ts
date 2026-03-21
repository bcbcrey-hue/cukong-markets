import assert from 'node:assert/strict';

import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { SettingsService } from '../src/domain/settings/settingsService';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { IndodaxClient } from '../src/integrations/indodax/client';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

async function main() {
  if (process.env.RUN_REAL_EXCHANGE_SHADOW !== '1') {
    console.log('SKIP real_exchange_shadow_run_probe (set RUN_REAL_EXCHANGE_SHADOW=1 to execute)');
    return;
  }

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
    accountRegistry.initialize(),
  ]);

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new IndodaxClient(),
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const pair = (process.env.SHADOW_RUN_PAIR ?? 'btc_idr').toLowerCase();
  const evidences = await execution.runLiveShadowRun({ pair });
  assert.ok(evidences.length > 0, 'Shadow-run must produce at least one evidence entry');

  const archived = await journal.listShadowRunEvidence();
  const runId = evidences[0]?.runId;
  assert.ok(runId, 'runId must exist');

  const matching = archived.filter((item) => item.runId === runId);
  assert.equal(
    matching.length,
    evidences.length,
    'All account evidence entries must be archived and readable after append',
  );

  const failed = evidences.flatMap((item) => item.checks.filter((check) => !check.pass));
  console.log(
    JSON.stringify(
      {
        probe: 'real_exchange_shadow_run_probe',
        pair,
        runId,
        accountCount: evidences.length,
        archivedEntries: matching.length,
        failedChecks: failed.map((item) => ({
          check: item.check,
          endpoint: item.endpoint,
          account: item.account,
          error: item.error?.message ?? null,
        })),
      },
      null,
      2,
    ),
  );

  console.log('PASS real_exchange_shadow_run_probe');
}

main().catch((error) => {
  console.error('FAIL real_exchange_shadow_run_probe');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
