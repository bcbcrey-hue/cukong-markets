import assert from 'node:assert/strict';

async function main() {
  if (process.env.RUN_REAL_EXCHANGE_SHADOW !== '1') {
    console.log('SKIP real_exchange_shadow_run_probe (set RUN_REAL_EXCHANGE_SHADOW=1 to execute)');
    return;
  }

  process.env.TELEGRAM_BOT_TOKEN ||= 'shadow-live-probe-token';
  process.env.TELEGRAM_ALLOWED_USER_IDS ||= '1';

  const [
    { AccountRegistry },
    { AccountStore },
    { SettingsService },
    { ExecutionEngine },
    { OrderManager },
    { PositionManager },
    { RiskEngine },
    { IndodaxClient },
    { JournalService },
    { PersistenceService },
    { ReportService },
    { StateService },
    { SummaryService },
  ] = await Promise.all([
    import('../src/domain/accounts/accountRegistry'),
    import('../src/domain/accounts/accountStore'),
    import('../src/domain/settings/settingsService'),
    import('../src/domain/trading/executionEngine'),
    import('../src/domain/trading/orderManager'),
    import('../src/domain/trading/positionManager'),
    import('../src/domain/trading/riskEngine'),
    import('../src/integrations/indodax/client'),
    import('../src/services/journalService'),
    import('../src/services/persistenceService'),
    import('../src/services/reportService'),
    import('../src/services/stateService'),
    import('../src/services/summaryService'),
  ]);

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

  if (accountRegistry.listEnabled().length === 0) {
    const apiKey = process.env.API_KEY ?? process.env.INDODAX_API_KEY;
    const apiSecret = process.env.API_SECRET ?? process.env.INDODAX_API_SECRET;
    if (apiKey && apiSecret) {
      await accountRegistry.saveLegacyUpload([
        {
          name: process.env.SHADOW_RUN_ACCOUNT_NAME ?? 'SHADOW_RUNTIME_ACCOUNT',
          apiKey,
          apiSecret,
        },
      ]);
    }
  }

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
  const requiredPolicyChecks: Array<
    'policy_runtime_decision' | 'policy_vs_hint_consistency' | 'policy_guardrail_enforced'
  > = ['policy_runtime_decision', 'policy_vs_hint_consistency', 'policy_guardrail_enforced'];
  const hasEnabledAccountEvidence = evidences.every((item) => item.account !== 'no-enabled-account');
  if (hasEnabledAccountEvidence) {
    for (const checkName of requiredPolicyChecks) {
      assert.ok(
        evidences.every((item) => item.checks.some((check) => check.check === checkName)),
        `Shadow-run evidence must include ${checkName}`,
      );
    }
  }
  const allowFailedChecks = process.env.SHADOW_RUN_ALLOW_FAILED_CHECKS === '1';
  console.log(
    JSON.stringify(
      {
        probe: 'real_exchange_shadow_run_probe',
        pair,
        runId,
        accountCount: evidences.length,
        archivedEntries: matching.length,
        allowFailedChecks,
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

  if (!allowFailedChecks) {
    assert.equal(
      failed.length,
      0,
      `Shadow-run must have zero failed checks before go-live. Failed checks: ${failed
        .map((item) => `${item.check}@${item.account}`)
        .join(', ')}`,
    );
  }

  console.log('PASS real_exchange_shadow_run_probe');
}

main().catch((error) => {
  console.error('FAIL real_exchange_shadow_run_probe');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
