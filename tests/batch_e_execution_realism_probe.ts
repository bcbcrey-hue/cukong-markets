import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { OpportunityAssessment, RuntimeEntryCandidate, StoredAccount } from '../src/core/types';
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

function makeOpportunity(overrides: Partial<OpportunityAssessment> = {}): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'doge_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 86,
    finalScore: 86,
    confidence: 0.88,
    pumpProbability: 0.76,
    continuationProbability: 0.65,
    trapProbability: 0.15,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 32,
    orderbookImbalance: 0.24,
    change1m: 0.9,
    change5m: 2.2,
    entryTiming: { state: 'READY', quality: 80, reason: 'ok', leadScore: 73 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 1000,
    bestBid: 999,
    bestAsk: 1000,
    spreadPct: 0.28,
    liquidityScore: 78,
    depthScore: 76,
    timestamp: now,
    ...overrides,
  };
}

function makeRuntimeCandidate(
  opportunity: OpportunityAssessment,
  overrides: Partial<RuntimeEntryCandidate> = {},
): RuntimeEntryCandidate {
  return {
    pair: opportunity.pair,
    opportunity,
    riskCheckResult: {
      allowed: true,
      reasons: [],
      warnings: [],
      entryLane: 'DEFAULT',
      baseAmountIdr: 200_000,
      adjustedAmountIdr: 200_000,
    },
    policyDecision: {
      action: 'ENTER',
      sizeMultiplier: 1,
      aggressiveness: 'NORMAL',
      reasons: ['policy enter'],
      entryLane: 'DEFAULT',
    },
    capitalPlan: {
      policySizeIntentMultiplier: 1,
      baseEntryCapitalIdr: 200_000,
      policyIntentNotionalIdr: 200_000,
      riskBudgetCapIdr: 200_000,
      thinBookCapIdr: null,
      allowedNotionalIdr: 200_000,
      cappedNotionalIdr: 0,
      allocatedNotionalIdr: 200_000,
      blocked: false,
      reasons: [],
      exposure: {
        totalDeployedCapitalIdr: 0,
        totalRemainingCapitalIdr: 200_000,
        pairClass: { key: opportunity.pairClass ?? 'MAJOR', usedNotionalIdr: 0, capNotionalIdr: 200_000, remainingNotionalIdr: 200_000 },
        discoveryBucket: { key: opportunity.discoveryBucket ?? 'LIQUID_LEADER', usedNotionalIdr: 0, capNotionalIdr: 200_000, remainingNotionalIdr: 200_000 },
      },
    },
    capitalContext: {
      policyIntentNotionalIdr: 200_000,
      allocatedNotionalIdr: 200_000,
      cappedNotionalIdr: 0,
      blocked: false,
      reasons: [],
      pairClassBucket: opportunity.pairClass ?? 'MAJOR',
      discoveryBucket: opportunity.discoveryBucket ?? 'LIQUID_LEADER',
    },
    policyReasons: ['policy enter'],
    sizeMultiplier: 1,
    aggressiveness: 'NORMAL',
    ...overrides,
  };
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-e-execution-realism-'));
  process.env.DATA_DIR = dataDir;
  process.env.LOG_DIR = path.join(dataDir, 'logs');
  process.env.TEMP_DIR = path.join(dataDir, 'tmp');

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
  const defaultAccount = accountRegistry.getDefault() as StoredAccount;
  assert.ok(defaultAccount, 'default account wajib tersedia');

  const baseSettings = createDefaultSettings();
  await settings.replace({
    ...baseSettings,
    tradingMode: 'FULL_AUTO',
    dryRun: true,
    paperTrade: true,
    uiOnly: false,
    strategy: {
      ...baseSettings.strategy,
      buySlippageBps: 25,
      maxBuySlippageBps: 45,
      buyOrderTimeoutMs: 1,
    },
  });
  const runtimeSettings = settings.get();

  const execution = new ExecutionEngine(
    accountRegistry,
    settings,
    state,
    new RiskEngine(),
    {} as never,
    positionManager,
    orderManager,
    journal,
    summary,
  );

  const waitCandidate = makeRuntimeCandidate(makeOpportunity({ pair: 'eth_idr' }), {
    policyDecision: {
      action: 'WAIT',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['wait by policy'],
      entryLane: 'SCOUT',
    },
    sizeMultiplier: 0,
    aggressiveness: 'LOW',
  });
  const waitResult = await execution.attemptAutoBuy(waitCandidate);
  assert.match(waitResult, /skip auto-buy eth_idr/, 'execution tidak boleh override WAIT/SKIP final policy');

  const normalCandidate = makeRuntimeCandidate(makeOpportunity({ pair: 'xrp_idr', quoteFlowAccelerationScore: 10 }));
  await execution.attemptAutoBuy(normalCandidate);
  const normalOrder = orderManager.list().find((item) => item.pair === 'xrp_idr');
  assert.ok(normalOrder?.executionPlan, 'execution plan harus tersimpan di order runtime');
  assert.equal(
    normalOrder.executionPlan?.baselineSlippageBps,
    runtimeSettings.strategy.buySlippageBps,
    'baseline slippage harus hormati setting operator',
  );

  const stressCandidate = makeRuntimeCandidate(
    makeOpportunity({ pair: 'shib_idr', depthScore: 20, liquidityScore: 40, spreadPct: 0.7, quoteFlowAccelerationScore: 34 }),
    {
      policyDecision: {
        action: 'ENTER',
        sizeMultiplier: 1,
        aggressiveness: 'HIGH',
        reasons: ['high urgency'],
        entryLane: 'SCOUT',
      },
      sizeMultiplier: 1,
      aggressiveness: 'HIGH',
    },
  );
  const stressResult = await execution.attemptAutoBuy(stressCandidate);
  assert.match(stressResult, /partial=/, 'thin-book stress harus bisa partial fill (simulated realism)');

  const stressOrder = orderManager.list().find((item) => item.pair === 'shib_idr');
  assert.ok(stressOrder?.executionPlan, 'order stress wajib menyimpan execution plan');
  assert.equal(stressOrder?.status, 'PARTIALLY_FILLED', 'stress buy awalnya partial sebelum timeout/cancel');
  assert.equal(stressOrder?.executionPlan?.stressMode, 'THIN_BOOK_STRESS', 'stress mode harus aktif saat depth/liquidity drop');
  assert.ok(
    (stressOrder?.executionPlan?.finalSlippageBps ?? 0) > (normalOrder?.executionPlan?.finalSlippageBps ?? 0),
    'aggressiveness + stress harus memengaruhi taktik execution (slippage lebih tinggi)',
  );
  assert.ok(
    (stressOrder?.executionPlan?.finalSlippageBps ?? 0) <= runtimeSettings.strategy.maxBuySlippageBps,
    'dynamic slippage wajib tetap bounded maxBuySlippageBps',
  );
  assert.ok(
    (stressOrder?.executionPlan?.finalSlippageBps ?? 0) <= 150,
    'dynamic slippage wajib tetap bounded hard cap 150 bps',
  );

  const syncMessages = await execution.syncActiveOrders();
  assert.ok(syncMessages.some((item) => item.includes('status=CANCELED')), 'remainder partial buy harus diproses loop timeout/cancel');

  const summaries = await persistence.readExecutionSummaries();
  const stressSummary = summaries.find((item) => item.pair === 'shib_idr' && item.status === 'PARTIALLY_FILLED');
  assert.ok(stressSummary?.executionPlan, 'execution summary harus memuat observability execution plan');
  const summaryText = report.executionSummaryText(stressSummary as NonNullable<typeof stressSummary>);
  assert.match(summaryText, /slippagePlan=/, 'report summary wajib menampilkan baseline vs final slippage');
  assert.match(summaryText, /execStress=THIN_BOOK_STRESS/, 'report summary wajib menampilkan status stress mode');

  console.log('batch_e_execution_realism_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
