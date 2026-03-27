import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildRuntimeEntryCandidates,
  buildRuntimePolicyDecisionEvidence,
  selectRuntimeEntryCandidate,
} from '../src/app';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
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
    pairClass: 'MID',
    rawScore: 88,
    finalScore: 88,
    confidence: 0.9,
    pumpProbability: 0.85,
    continuationProbability: 0.72,
    trapProbability: 0.1,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 12,
    quoteFlowAccelerationScore: 34,
    orderbookImbalance: 0.22,
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
    timestamp: now,
    ...overrides,
  };
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-policy-observability-'));
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
  runtimeSettings.risk.maxPositionSizeIdr = 500_000;

  await settings.replace(runtimeSettings);

  const opportunities = [
    makeOpportunity('enter_idr', { finalScore: 92, recommendedAction: 'ENTER', marketRegime: 'ACCUMULATION' }),
    makeOpportunity('wait_idr', { finalScore: 72, recommendedAction: 'WATCH', marketRegime: 'QUIET' }),
    makeOpportunity('skip_idr', { finalScore: 95, recommendedAction: 'ENTER', marketRegime: 'TRAP_RISK' }),
  ];

  const runtimeCandidates = buildRuntimeEntryCandidates(
    opportunities,
    runtimeSettings,
    new RiskEngine(),
    defaultAccount,
    [],
    {},
  );

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  const defaultWaitCandidate = runtimeCandidates.find((item) => item.pair === 'wait_idr');
  assert.ok(defaultWaitCandidate, 'candidate wait_idr harus tersedia');
  const forcedWaitCandidate = {
    ...defaultWaitCandidate,
    policyDecision: {
      ...defaultWaitCandidate.policyDecision,
      action: 'WAIT' as const,
      reasons: ['policy wait probe'],
      sizeMultiplier: 0,
      aggressiveness: 'LOW' as const,
    },
    policyReasons: ['policy wait probe'],
    sizeMultiplier: 0,
    aggressiveness: 'LOW' as const,
  };
  const evidence = buildRuntimePolicyDecisionEvidence(
    [...runtimeCandidates, forcedWaitCandidate],
    selected?.pair,
  );

  assert.equal(evidence.length, 4, 'evidence policy runtime harus tersedia untuk semua kandidat');

  const waitEvidence = evidence.find((item) => item.pair === 'wait_idr' && item.action === 'WAIT');
  assert.ok(waitEvidence, 'pair WAIT harus tercatat di evidence runtime policy');
  assert.ok((waitEvidence?.reasons.length ?? 0) > 0, 'pair WAIT wajib memiliki reasons');

  const skipEvidence = evidence.find((item) => item.pair === 'skip_idr');
  assert.equal(skipEvidence?.action, 'SKIP', 'pair SKIP harus tercatat di evidence runtime policy');
  assert.ok(
    skipEvidence?.reasons.some((reason) =>
      reason.includes('TRAP_RISK') || reason.includes('RiskEngine memblokir'),
    ),
    'pair SKIP wajib membawa alasan block yang eksplisit',
  );

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

  const enterCandidate = runtimeCandidates.find((item) => item.pair === 'enter_idr');
  const waitCandidate = forcedWaitCandidate;
  const skipCandidate = runtimeCandidates.find((item) => item.pair === 'skip_idr');

  assert.ok(enterCandidate && waitCandidate && skipCandidate, 'semua kandidat runtime harus tersedia');

  const enterMessage = await execution.attemptAutoBuy(enterCandidate);
  const waitMessage = await execution.attemptAutoBuy(waitCandidate);
  const skipMessage = await execution.attemptAutoBuy(skipCandidate);

  assert.match(enterMessage, /BUY simulated/, 'ENTER harus lanjut ke eksekusi');
  assert.match(waitMessage, /skip auto-buy wait_idr/, 'WAIT harus diblok sebelum eksekusi');
  assert.match(skipMessage, /skip auto-buy skip_idr/, 'SKIP harus diblok sebelum eksekusi');

  const policyJournal = journal
    .list()
    .filter((entry) => entry.title === 'AUTO_ENTRY_POLICY_DECISION');

  assert(policyJournal.length >= 3, 'journal runtime harus mencatat keputusan policy ENTER/WAIT/SKIP');

  const observedActions = new Set(policyJournal.map((entry) => String(entry.payload?.action ?? '')));
  assert(observedActions.has('ENTER'), 'journal runtime harus punya bukti action ENTER');
  assert(observedActions.has('WAIT'), 'journal runtime harus punya bukti action WAIT');
  assert(observedActions.has('SKIP'), 'journal runtime harus punya bukti action SKIP');

  const allPayloadHaveReasons = policyJournal.every((entry) => {
    const reasons = entry.payload?.reasons;
    return Array.isArray(reasons) && reasons.length > 0;
  });
  assert(allPayloadHaveReasons, 'journal runtime policy wajib membawa policy reasons eksplisit');

  console.log('runtime_policy_observability_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
