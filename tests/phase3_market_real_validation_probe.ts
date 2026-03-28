import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  OpportunityAssessment,
  Phase3MarketRealManualEvidence,
  Phase3RuntimeValidationEvidence,
  PositionRecord,
} from '../src/core/types';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { SettingsService } from '../src/domain/settings/settingsService';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { JournalService } from '../src/services/journalService';
import { createDefaultSettings, PersistenceService } from '../src/services/persistenceService';
import { writePhase3ValidationArtifacts } from '../src/services/phase3ValidationReportService';
import { Phase3ValidationService } from '../src/services/phase3ValidationService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

class ProbePrivateApi {
  canceledOrders = 0;

  async cancelOrder() {
    this.canceledOrders += 1;
    return { success: 1, return: { status: 'canceled' } };
  }

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

class ProbeIndodaxClient {
  constructor(private readonly api: ProbePrivateApi) {}

  forAccount() {
    return this.api;
  }
}

function sampleOpportunity(): OpportunityAssessment {
  return {
    pair: 'phase3_micro_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 91,
    finalScore: 93,
    confidence: 0.9,
    pumpProbability: 0.84,
    continuationProbability: 0.74,
    trapProbability: 0.12,
    spoofRisk: 0.06,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 22,
    quoteFlowAccelerationScore: 32,
    orderbookImbalance: 0.33,
    change1m: 0.8,
    change5m: 2,
    entryTiming: { state: 'READY', quality: 85, reason: 'ok', leadScore: 78 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'probe',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.1,
    liquidityScore: 85,
    depthScore: 44,
    timestamp: Date.now(),
  };
}

function openPosition(input: Partial<PositionRecord>): PositionRecord {
  return {
    id: input.id ?? 'pos',
    pair: input.pair ?? 'legacy_idr',
    accountId: input.accountId ?? 'acc',
    status: input.status ?? 'OPEN',
    side: 'long',
    quantity: input.quantity ?? 2_000,
    entryPrice: input.entryPrice ?? 30,
    averageEntryPrice: input.averageEntryPrice ?? input.entryPrice ?? 30,
    averageExitPrice: input.averageExitPrice ?? null,
    currentPrice: input.currentPrice ?? input.entryPrice ?? 30,
    peakPrice: input.peakPrice ?? input.currentPrice ?? 30,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalEntryFeesPaid: 0,
    totalBoughtQuantity: input.quantity ?? 2_000,
    totalSoldQuantity: 0,
    stopLossPrice: input.stopLossPrice ?? null,
    takeProfitPrice: input.takeProfitPrice ?? null,
    entryStyle: input.entryStyle ?? 'CONFIRM',
    pumpState: input.pumpState ?? 'ACTIVE',
    lastContinuationScore: 0,
    lastDumpRisk: 0,
    lastScaleOutAt: null,
    emergencyExitArmed: input.emergencyExitArmed ?? false,
    exposurePairClass: input.exposurePairClass ?? 'MICRO',
    exposureDiscoveryBucket: input.exposureDiscoveryBucket ?? 'ANOMALY',
    exposureSource: 'POSITION_METADATA',
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  };
}

async function setupDataDir(): Promise<string> {
  const tempDataDir = process.env.DATA_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'cukong-phase3-probe-'));
  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });
  return tempDataDir;
}

async function runSeededValidationMode(): Promise<void> {
  await setupDataDir();
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
  const phase3 = new Phase3ValidationService(persistence);

  await Promise.all([
    state.load(),
    settings.load(),
    journal.load(),
    orderManager.load(),
    positionManager.load(),
    accountRegistry.initialize(),
  ]);

  await accountRegistry.saveLegacyUpload([{ name: 'PHASE3_ACC', apiKey: 'k', apiSecret: 's' }]);
  const defaultAccount = accountRegistry.getDefault();
  assert.ok(defaultAccount, 'Default account should exist');

  const seededSettings = createDefaultSettings();
  seededSettings.portfolio.baseEntryCapitalIdr = 120_000;
  seededSettings.portfolio.maxTotalDeployedCapitalIdr = 300_000;
  seededSettings.portfolio.maxExposurePerPairClassPct.MICRO = 0.2;
  seededSettings.portfolio.maxExposurePerDiscoveryBucketPct.ANOMALY = 0.2;

  const capitalEngine = new PortfolioCapitalEngine();
  const capitalPlan = capitalEngine.plan({
    settings: seededSettings,
    opportunity: sampleOpportunity(),
    policyDecision: { action: 'ENTER', sizeMultiplier: 1.5 },
    openPositions: [openPosition({ id: 'pos-bound', pair: 'legacy_micro_idr' })],
  }).capitalPlan;

  assert.ok(capitalPlan.policyIntentNotionalIdr > capitalPlan.allowedNotionalIdr, 'Capital layer must cap requested notional');
  assert.equal(capitalPlan.allocatedNotionalIdr, 0, 'Allocation must be blocked when exposure fully used');

  await settings.replace({
    ...seededSettings,
    tradingMode: 'FULL_AUTO',
    dryRun: false,
    paperTrade: false,
    uiOnly: false,
  });

  const exchangeApi = new ProbePrivateApi();
  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    new ProbeIndodaxClient(exchangeApi) as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'btc_idr',
    side: 'buy',
    type: 'limit',
    price: 100,
    quantity: 1,
    source: 'AUTO',
    status: 'OPEN',
    exchangeOrderId: 'oid-1',
    exchangeStatus: 'open',
  });

  const uncertain = await orderManager.create({
    accountId: defaultAccount.id,
    pair: 'doge_idr',
    side: 'buy',
    type: 'limit',
    price: 100,
    quantity: 1,
    source: 'AUTO',
    status: 'OPEN',
    exchangeStatus: 'submission_uncertain',
  });

  const cancelSummary = await execution.cancelAllOrders();
  assert.match(cancelSummary, /Canceled 1 active orders; unresolved 1 submission-uncertain orders/);
  assert.equal(exchangeApi.canceledOrders, 1, 'Live cancel should hit exchange API once');

  const uncertainAfterCancel = orderManager.getById(uncertain.id);
  assert.equal(uncertainAfterCancel?.status, 'OPEN');
  assert.match(uncertainAfterCancel?.exchangeStatus ?? '', /submission_uncertain/);

  const recoveryMessages = await execution.recoverLiveOrdersOnStartup();

  await settings.replace({
    ...seededSettings,
    tradingMode: 'FULL_AUTO',
    dryRun: true,
    paperTrade: true,
    uiOnly: false,
  });

  await positionManager.open({
    accountId: defaultAccount.id,
    pair: 'panic_idr',
    quantity: 1,
    entryPrice: 100,
    stopLossPrice: 99,
    takeProfitPrice: 130,
    entryStyle: 'CONFIRM',
    exposurePairClass: 'MID',
    exposureDiscoveryBucket: 'ROTATION',
    exposureSource: 'POSITION_METADATA',
  });
  await positionManager.updateMark('panic_idr', 95, { emergencyExitArmed: true, dumpRisk: 0.8 });
  const panicPosition = positionManager.getOpenByPairAndAccount('panic_idr', defaultAccount.id);
  assert.ok(panicPosition, 'panic position must exist');
  await execution.manualSell(panicPosition.id, panicPosition.quantity, 'AUTO', 'EMERGENCY_EXIT');

  const summaries = await persistence.readExecutionSummaries();
  const emergencySummarySeen = summaries.some((item) => item.reason?.includes('EMERGENCY_EXIT'));
  assert.equal(emergencySummarySeen, true, 'Emergency exit execution summary must be persisted');

  const runtimeEvidence: Phase3RuntimeValidationEvidence = {
    capital: {
      policyIntentNotionalIdr: capitalPlan.policyIntentNotionalIdr,
      allowedNotionalIdr: capitalPlan.allowedNotionalIdr,
      allocatedNotionalIdr: capitalPlan.allocatedNotionalIdr,
      pairClassLimitRespected: capitalPlan.exposure.pairClass.remainingNotionalIdr <= 1e-8,
      discoveryBucketLimitRespected: capitalPlan.exposure.discoveryBucket.remainingNotionalIdr <= 1e-8,
    },
    exchangeOps: {
      cancelSummary,
      unresolvedSubmissionUncertain: (uncertainAfterCancel?.exchangeStatus ?? '').includes('submission_uncertain'),
      recoveryMessagesCount: recoveryMessages.length,
    },
    emergencyRecovery: {
      emergencySummarySeen,
    },
  };

  const reportData = await phase3.buildReadinessReport({ runtimeEvidence });
  const expectedVerdict = reportData.checklist.every((item) => item.status === 'PASS')
    ? 'SIAP_MERGE'
    : 'BELUM_SIAP_MERGE';

  assert.equal(
    reportData.readinessVerdict,
    expectedVerdict,
    'readinessVerdict harus dihitung dari checklist status, bukan hardcoded literal',
  );
  assert.ok(
    reportData.sections.some((section) => section.checks.some((check) => check.id === 'capital-allocated-bounded')),
    'Report harus dibentuk dari service validasi Fase 3 dengan checks hasil agregasi evidence',
  );

  await persistence.appendPhase3ReadinessEvidence(reportData);
  await persistence.savePhase3LatestReport(reportData);

  const artifacts = await writePhase3ValidationArtifacts({
    report: reportData,
    outputDir: process.env.PHASE3_OUTPUT_DIR || 'test_reports/phase3_market_real',
  });

  const jsonReport = JSON.parse(await fs.readFile(artifacts.jsonPath, 'utf8')) as { report: typeof reportData };
  assert.equal(jsonReport.report.runId, reportData.runId, 'JSON artifact harus sinkron dengan report dari service');

  console.log(
    JSON.stringify(
      {
        probe: 'phase3_market_real_validation_probe',
        mode: 'seeded',
        runId: reportData.runId,
        readinessVerdict: reportData.readinessVerdict,
        checklist: reportData.checklist,
        artifacts,
      },
      null,
      2,
    ),
  );
  console.log('PASS phase3_market_real_validation_probe');
}

async function runShadowProofMode(): Promise<void> {
  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const phase3 = new Phase3ValidationService(persistence);
  const status = await phase3.evaluateShadowProofStatus();

  console.log(JSON.stringify({ probe: 'phase3_market_real_validation_probe', mode: 'shadow-proof', status }, null, 2));
  assert.ok(['PASS', 'FAIL', 'MANUAL_REQUIRED'].includes(status.status), 'shadow proof status must be explicit');
  console.log('PASS phase3_shadow_proof_check');
}

async function runManualMarketRealMode(): Promise<void> {
  const evidenceFile = process.argv[2] || process.env.PHASE3_MANUAL_EVIDENCE_FILE;
  assert.ok(evidenceFile, 'Provide manual evidence json path via arg or PHASE3_MANUAL_EVIDENCE_FILE');

  const raw = await fs.readFile(path.resolve(evidenceFile), 'utf8');
  const parsed = JSON.parse(raw) as Phase3MarketRealManualEvidence;
  assert.equal(parsed.source, 'MANUAL_EXCHANGE_RUN', 'manual evidence source must be MANUAL_EXCHANGE_RUN');

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const phase3 = new Phase3ValidationService(persistence);

  await phase3.ingestManualMarketRealEvidence(parsed);
  const status = await phase3.evaluateMarketRealManualStatus();

  console.log(JSON.stringify({ probe: 'phase3_market_real_validation_probe', mode: 'market-real-check', status }, null, 2));
  assert.ok(status.status !== 'MANUAL_REQUIRED', 'manual evidence ingestion should move status out of MANUAL_REQUIRED');
  console.log('PASS phase3_market_real_manual_check');
}

async function main() {
  const mode = process.env.RUN_PHASE3_MODE || 'seeded';

  if (mode === 'shadow-proof') {
    await runShadowProofMode();
    return;
  }

  if (mode === 'market-real-check') {
    await runManualMarketRealMode();
    return;
  }

  await runSeededValidationMode();
}

main().catch((error) => {
  console.error('FAIL phase3_market_real_validation_probe');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
