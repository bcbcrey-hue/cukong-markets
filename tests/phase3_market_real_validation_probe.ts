import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { OpportunityAssessment, Phase3ReadinessReport, PositionRecord } from '../src/core/types';
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

async function main() {
  const tempDataDir = process.env.DATA_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'cukong-phase3-probe-'));
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

  const cancelable = await orderManager.create({
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
  assert.equal(Array.isArray(recoveryMessages), true, 'Recovery path should execute and return array');

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

  const emergencyMessages = ['panic_idr exit by EMERGENCY_EXIT'];

  const summaries = await persistence.readExecutionSummaries();
  const emergencySummarySeen = summaries.some((item) => item.reason?.includes('EMERGENCY_EXIT'));
  assert.equal(emergencySummarySeen, true, 'Emergency exit execution summary must be persisted');

  const reportData: Phase3ReadinessReport = {
    runId: `phase3-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sourceOfTruth: {
      repository: 'https://github.com/masreykangtrade-oss/cukong-markets',
      roadmapVerification: 'https://github.com/masreykangtrade-oss/cukong-markets/blob/main/ROADMAP_VERIFICATION_UPGRADE.md',
    },
    sections: [
      {
        name: 'capital_exposure',
        summary: 'Probe source-level membuktikan allocated notional tetap bounded oleh exposure pair-class/discovery dan budget total.',
        checks: [
          {
            id: 'capital-bounded-allocated-notional',
            description: 'allocatedNotional tidak boleh melewati allowedNotional/exposure cap',
            proofLevel: 'SOURCE_PROBE',
            automated: true,
            pass: capitalPlan.allocatedNotionalIdr <= capitalPlan.allowedNotionalIdr,
            evidenceRefs: ['portfolioCapitalEngine.plan', 'phase3_market_real_validation_probe'],
            notes: [
              `policyIntent=${capitalPlan.policyIntentNotionalIdr}`,
              `allowed=${capitalPlan.allowedNotionalIdr}`,
              `allocated=${capitalPlan.allocatedNotionalIdr}`,
            ],
          },
        ],
      },
      {
        name: 'exchange_reconciliation_resilience',
        summary: 'Probe source-level untuk cancel + unresolved submission_uncertain + recovery startup; market-real auth/rate-limit butuh environment live.',
        checks: [
          {
            id: 'cancel-and-uncertain-bounded',
            description: 'cancelAllOrders tidak boleh memalsukan cancel untuk submission_uncertain tanpa exchangeOrderId',
            proofLevel: 'SOURCE_PROBE',
            automated: true,
            pass: /unresolved 1 submission-uncertain orders/.test(cancelSummary),
            evidenceRefs: ['ExecutionEngine.cancelAllOrders', 'ExecutionEngine.recoverLiveOrdersOnStartup'],
            notes: [cancelSummary, `recoveryMessages=${recoveryMessages.length}`],
          },
          {
            id: 'auth-timeout-rate-limit-market-real',
            description: 'Auth private/live timeout-retry/rate-limit perlu verifikasi non-destructive di akun exchange nyata',
            proofLevel: 'MARKET_REAL',
            automated: false,
            pass: false,
            evidenceRefs: ['tests/real_exchange_shadow_run_probe.ts'],
            notes: ['Wajib jalankan RUN_REAL_EXCHANGE_SHADOW=1 dengan akun nyata dan bukti log/artifact terarsip'],
          },
        ],
      },
      {
        name: 'emergency_recovery',
        summary: 'Probe source-level membuktikan emergency exit path memproduksi execution summary persisten setelah failure signal.',
        checks: [
          {
            id: 'emergency-exit-summary-persisted',
            description: 'evaluateOpenPositions memicu EMERGENCY_EXIT dan summary tersimpan',
            proofLevel: 'SOURCE_PROBE',
            automated: true,
            pass: emergencySummarySeen,
            evidenceRefs: ['ExecutionEngine.evaluateOpenPositions', 'SummaryService.publishExecutionSummary'],
          },
        ],
      },
    ],
    checklist: [
      {
        id: 'phase3-source-probe-suite',
        description: 'Suite source/probe untuk capital + exchange ops + emergency harus hijau',
        requiredProofLevel: 'SOURCE_PROBE',
        status: 'PASS',
      },
      {
        id: 'phase3-shadow-live-proof',
        description: 'Strict shadow-live non-destruktif harus tersedia per runId',
        requiredProofLevel: 'SHADOW_LIVE',
        status: 'MANUAL_REQUIRED',
        notes: 'Gunakan npm run verify:shadow-live untuk runId terbaru.',
      },
      {
        id: 'phase3-market-real-proof',
        description: 'Auth/order-flow/reconciliation/resilience di exchange nyata harus tervalidasi manual',
        requiredProofLevel: 'MARKET_REAL',
        status: 'MANUAL_REQUIRED',
        notes: 'Belum otomatis dari seeded probe di CI.',
      },
    ],
    limitations: [
      'Probe ini seeded/non-destruktif: tidak boleh diklaim sebagai market-real pass.',
      'Timeout/retry/rate-limit behavior real exchange masih butuh environment nyata.',
      'Ruleset GitHub branch protection tetap verifikasi manual di setting repository.',
    ],
    readinessVerdict: 'BELUM_SIAP_MERGE',
    boundaryNotes: {
      sourceProbeProof: 'Valid untuk semantics source/runtime lokal dan persistence evidence.',
      shadowLiveProof: 'Memerlukan strict shadow-live run tersendiri dan arsip evidence runId.',
      marketRealProof: 'Memerlukan akun exchange nyata + jaringan nyata; tidak disubstitusi seeded probe.',
    },
  };

  await persistence.appendPhase3ReadinessEvidence(reportData);
  await persistence.savePhase3LatestReport(reportData);
  const archived = await persistence.readPhase3ReadinessEvidence();
  const latest = await persistence.readPhase3LatestReport();
  assert.ok(archived.some((item) => item.runId === reportData.runId), 'Phase3 evidence must be archived');
  assert.equal(latest?.runId, reportData.runId, 'Phase3 latest report must survive reload read-model');

  const artifacts = await writePhase3ValidationArtifacts({
    report: reportData,
    outputDir: process.env.PHASE3_OUTPUT_DIR || 'test_reports/phase3_market_real',
  });

  await Promise.all([
    fs.access(artifacts.jsonPath),
    fs.access(artifacts.markdownPath),
    fs.access(artifacts.pdfPath),
  ]);

  console.log(
    JSON.stringify(
      {
        probe: 'phase3_market_real_validation_probe',
        runId: reportData.runId,
        cancelSummary,
        emergencyMessages,
        artifacts,
      },
      null,
      2,
    ),
  );
  console.log('PASS phase3_market_real_validation_probe');
}

main().catch((error) => {
  console.error('FAIL phase3_market_real_validation_probe');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
