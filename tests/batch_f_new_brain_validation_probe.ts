import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRuntimeEntryCandidates,
  buildRuntimePolicyDecisionEvidence,
  selectRuntimeEntryCandidate,
} from '../src/app';
import type { OpportunityAssessment, RuntimePolicyReadModel, StoredAccount } from '../src/core/types';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { SettingsService } from '../src/domain/settings/settingsService';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';
import { createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

function makeOpportunity(
  pair: string,
  overrides: Partial<OpportunityAssessment> = {},
): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 88,
    finalScore: 88,
    confidence: 0.92,
    pumpProbability: 0.85,
    continuationProbability: 0.72,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 12,
    quoteFlowAccelerationScore: 34,
    orderbookImbalance: 0.2,
    change1m: 0.8,
    change5m: 2.1,
    entryTiming: { state: 'READY', quality: 88, reason: 'ok', leadScore: 74 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.05,
    liquidityScore: 78,
    prediction: {
      target: 'TREND_DIRECTIONAL_MOVE',
      horizonLabel: 'H5_15M',
      horizonMinutes: 15,
      direction: 'UP',
      expectedMovePct: 1.2,
      confidence: 0.81,
      strength: 'STRONG',
      calibrationTag: 'OUTCOME_AND_TRADE_TRUTH',
      reasons: ['strong trend'],
      caveats: [],
      tradeFlowSource: 'EXCHANGE_TRADE_FEED',
      tradeFlowQuality: 'TAPE',
      generatedAt: now,
    },
    timestamp: now,
    ...overrides,
  };
}

function toRuntimePolicyReadModel(evidence: ReturnType<typeof buildRuntimePolicyDecisionEvidence>[number]): RuntimePolicyReadModel {
  return {
    pair: evidence.pair,
    action: evidence.action,
    reasons: evidence.reasons,
    entryLane: evidence.entryLane,
    sizeMultiplier: evidence.sizeMultiplier,
    aggressiveness: evidence.aggressiveness,
    riskAllowed: evidence.riskAllowed,
    riskReasons: evidence.riskReasons,
    capital: evidence.capitalContext,
    predictionContext: evidence.predictionContext,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'batch-f-new-brain-'));
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

  const runtimeSettings = createDefaultSettings();
  runtimeSettings.tradingMode = 'FULL_AUTO';
  runtimeSettings.dryRun = true;
  runtimeSettings.paperTrade = true;
  runtimeSettings.uiOnly = false;
  runtimeSettings.strategy.useAntiSpoof = false;
  runtimeSettings.strategy.minScoreToAlert = 1;
  runtimeSettings.strategy.minScoreToBuy = 50;
  runtimeSettings.strategy.minConfidence = 0;
  runtimeSettings.strategy.minPumpProbability = 0;
  runtimeSettings.risk.maxPairSpreadPct = 10;
  runtimeSettings.risk.maxOpenPositions = 10;
  runtimeSettings.risk.maxPositionSizeIdr = 400_000;
  runtimeSettings.portfolio.baseEntryCapitalIdr = 300_000;

  await settings.replace(runtimeSettings);

  const opportunities = [
    makeOpportunity('enter_policy_idr', { recommendedAction: 'AVOID', finalScore: 90 }),
    makeOpportunity('blocked_policy_idr', {
      recommendedAction: 'ENTER',
      finalScore: 92,
      marketRegime: 'TRAP_RISK',
    }),
  ];

  const runtimeCandidates = buildRuntimeEntryCandidates(
    opportunities,
    runtimeSettings,
    new RiskEngine(),
    new PortfolioCapitalEngine(),
    defaultAccount,
    [],
    { enter_policy_idr: Date.now() + runtimeSettings.risk.cooldownMs + 10_000 },
  );

  assert.equal(runtimeCandidates.length, 2, 'kandidat runtime harus terbentuk dari flow opportunity->risk->policy->capital');

  const enterCandidate = runtimeCandidates.find((item) => item.pair === 'enter_policy_idr');
  const blockedCandidate = runtimeCandidates.find((item) => item.pair === 'blocked_policy_idr');
  assert.ok(enterCandidate && blockedCandidate, 'dua kandidat harus tersedia');

  assert.equal(enterCandidate?.riskCheckResult.allowed, false, 'risk guardrail harus aktif sebelum keputusan final policy');
  assert.equal(enterCandidate?.policyDecision.action, 'SKIP', 'risk block tidak boleh bypass policy final');

  assert.equal(blockedCandidate?.policyDecision.action, 'SKIP', 'regime TRAP_RISK harus diblok policy final');

  const policyEvidence = buildRuntimePolicyDecisionEvidence(runtimeCandidates);
  const firstEvidence = policyEvidence[0];
  assert.ok(firstEvidence, 'evidence runtime policy harus tersedia');
  await state.setRuntimePolicyDecision(toRuntimePolicyReadModel(firstEvidence));

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  assert.equal(selected, undefined, 'tidak boleh auto-entry ketika semua kandidat tidak ENTER/atau risk-blocked');

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

  const forcedEnterWithHintAvoid = {
    ...enterCandidate,
    riskCheckResult: {
      ...enterCandidate.riskCheckResult,
      allowed: true,
      reasons: [],
      adjustedAmountIdr: 150_000,
    },
    policyDecision: {
      ...enterCandidate.policyDecision,
      action: 'ENTER' as const,
      reasons: ['policy final enter meski hint avoid'],
      sizeMultiplier: 0.4,
      entryLane: 'SCOUT' as const,
      aggressiveness: 'LOW' as const,
    },
    policyReasons: ['policy final enter meski hint avoid'],
    sizeMultiplier: 0.4,
    aggressiveness: 'LOW' as const,
  };

  const executeMsg = await execution.attemptAutoBuy(forcedEnterWithHintAvoid);
  assert.match(executeMsg, /BUY simulated/, 'execution harus mengikuti policy final ENTER, bukan hint recommendedAction');

  const blockedMsg = await execution.attemptAutoBuy(blockedCandidate);
  assert.match(blockedMsg, /skip auto-buy blocked_policy_idr/, 'execution harus menolak action non-ENTER dari policy final');

  const policyJournals = journal.list().filter((entry) => entry.title === 'AUTO_ENTRY_POLICY_DECISION');
  assert.ok(policyJournals.length >= 2, 'observability runtime/operator harus menyimpan evidence policy final');
  assert.ok(
    policyJournals.every((entry) => Array.isArray(entry.payload?.reasons) && (entry.payload?.reasons as unknown[]).length > 0),
    'evidence policy final harus membawa reasons',
  );

  const statusText = report.statusText({
    health: {
      status: 'healthy',
      updatedAt: new Date().toISOString(),
      runtimeStatus: 'RUNNING',
      scannerRunning: true,
      telegramConfigured: true,
      telegramRunning: true,
      telegramConnection: {
        configured: true,
        launched: true,
        running: true,
        connected: true,
        lastConnectionStatus: 'connected',
        allowedUsersCount: 1,
        botId: 1,
        botUsername: 'bot',
        botFirstName: 'bot',
        botIsBot: true,
        lastLaunchAt: null,
        lastConnectedAt: null,
        lastLaunchSuccessAt: null,
        lastLaunchError: null,
        lastLaunchErrorType: 'none',
      },
      callbackServerRunning: true,
      tradingEnabled: true,
      executionMode: 'SIMULATED',
      activePairsTracked: 2,
      workers: [],
      notes: ['probe'],
    },
    activeAccounts: 1,
    topOpportunity: opportunities[0],
    runtimePolicyDecision: toRuntimePolicyReadModel(firstEvidence),
  });

  assert.match(statusText, /hintAction=AVOID/, 'operator summary harus menampilkan recommendedAction sebagai hint');
  assert.match(statusText, /runtimePolicy pair=/, 'operator summary harus menampilkan final decision policy runtime');

  console.log('batch_f_new_brain_validation_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
