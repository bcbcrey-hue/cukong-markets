import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { OpportunityAssessment, RuntimeEntryCandidate, StoredAccount } from '../src/core/types';
import { AccountRegistry } from '../src/domain/accounts/accountRegistry';
import { AccountStore } from '../src/domain/accounts/accountStore';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';
import { createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { SettingsService } from '../src/domain/settings/settingsService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { OrderManager } from '../src/domain/trading/orderManager';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';

function makeOpportunity(overrides: Partial<OpportunityAssessment> = {}): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'doge_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 84,
    finalScore: 84,
    confidence: 0.86,
    pumpProbability: 0.72,
    continuationProbability: 0.62,
    trapProbability: 0.1,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.6,
    change5m: 1.8,
    entryTiming: { state: 'READY', quality: 81, reason: 'ok', leadScore: 72 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'AVOID',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 1000,
    bestBid: 999,
    bestAsk: 1000,
    spreadPct: 0.2,
    liquidityScore: 80,
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
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'execution-runtime-final-decision-'));
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

  await settings.replace({
    ...createDefaultSettings(),
    tradingMode: 'FULL_AUTO',
    dryRun: true,
    paperTrade: true,
    uiOnly: false,
  });

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

  const opportunityAvoidHint = makeOpportunity({ recommendedAction: 'AVOID' });
  const enterCandidate = makeRuntimeCandidate(opportunityAvoidHint, {
    policyDecision: {
      action: 'ENTER',
      sizeMultiplier: 0.5,
      aggressiveness: 'LOW',
      reasons: ['policy final enter meski hint avoid'],
      entryLane: 'DEFAULT',
    },
    sizeMultiplier: 0.5,
    aggressiveness: 'LOW',
  });
  const enterMessage = await execution.attemptAutoBuy(enterCandidate);
  assert.match(
    enterMessage,
    /BUY simulated/,
    'attemptAutoBuy wajib mengeksekusi keputusan final policy, bukan hint recommendedAction mentah',
  );

  const waitCandidate = makeRuntimeCandidate(makeOpportunity({ pair: 'eth_idr', recommendedAction: 'SCOUT_ENTER' }), {
    policyDecision: {
      action: 'WAIT',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['policy wait'],
      entryLane: 'SCOUT',
    },
    sizeMultiplier: 0,
    aggressiveness: 'LOW',
  });
  const waitMessage = await execution.attemptAutoBuy(waitCandidate);
  assert.match(waitMessage, /skip auto-buy eth_idr/, 'policy WAIT wajib skip meski hint opportunity terlihat bullish');

  const riskBlockedCandidate = makeRuntimeCandidate(makeOpportunity({ pair: 'link_idr', recommendedAction: 'SCOUT_ENTER' }), {
    riskCheckResult: {
      allowed: false,
      reasons: ['risk blocked'],
      warnings: [],
      entryLane: 'SCOUT',
      baseAmountIdr: 200_000,
      adjustedAmountIdr: 60_000,
    },
  });
  const riskBlockedMessage = await execution.attemptAutoBuy(riskBlockedCandidate);
  assert.match(riskBlockedMessage, /skip auto-buy link_idr: risk blocked/, 'risk guardrail wajib tetap hard block');

  console.log('execution_runtime_final_decision_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
