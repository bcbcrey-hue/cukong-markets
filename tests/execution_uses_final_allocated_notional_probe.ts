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
import { PersistenceService } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';
import { StateService } from '../src/services/stateService';
import { SummaryService } from '../src/services/summaryService';

function opportunity(): OpportunityAssessment {
  return {
    pair: 'exec_final_idr', discoveryBucket: 'ANOMALY', pairClass: 'MID', rawScore: 90, finalScore: 92, confidence: 0.9,
    pumpProbability: 0.8, continuationProbability: 0.7, trapProbability: 0.1, spoofRisk: 0.1, edgeValid: true,
    marketRegime: 'EXPANSION', breakoutPressure: 20, quoteFlowAccelerationScore: 30, orderbookImbalance: 0.2,
    change1m: 0.7, change5m: 1.8, entryTiming: { state: 'READY', quality: 82, reason: 'ok', leadScore: 75 },
    reasons: ['ok'], warnings: [], featureBreakdown: [], recommendedAction: 'ENTER', riskContext: [], historicalMatchSummary: 'ok',
    referencePrice: 1000, bestBid: 999, bestAsk: 1000, spreadPct: 0.1, liquidityScore: 85, depthScore: 30, timestamp: Date.now(),
  };
}

async function main() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'execution-final-notional-'));
  process.env.DATA_DIR = dataDir;
  process.env.LOG_DIR = path.join(dataDir, 'logs');
  process.env.TEMP_DIR = path.join(dataDir, 'tmp');

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  const settings = new SettingsService(persistence);
  const journal = new JournalService(persistence);
  const orderManager = new OrderManager(persistence);
  const positionManager = new PositionManager(persistence);
  const accountStore = new AccountStore();
  const accountRegistry = new AccountRegistry(accountStore);
  const summary = new SummaryService(persistence, journal, new ReportService(), accountRegistry);

  await Promise.all([state.load(), settings.load(), journal.load(), orderManager.load(), positionManager.load()]);
  await accountRegistry.saveLegacyUpload([{ name: 'TEST_MAIN', apiKey: 'k', apiSecret: 's' }]);
  await settings.patch({ tradingMode: 'FULL_AUTO', dryRun: true, paperTrade: true, uiOnly: false });

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

  const signal = opportunity();
  const candidate: RuntimeEntryCandidate = {
    pair: signal.pair,
    opportunity: signal,
    riskCheckResult: { allowed: true, reasons: [], warnings: [], entryLane: 'DEFAULT', baseAmountIdr: 500_000, adjustedAmountIdr: 80_000 },
    policyDecision: { action: 'ENTER', sizeMultiplier: 1, aggressiveness: 'NORMAL', reasons: ['ok'], entryLane: 'DEFAULT' },
    capitalPlan: {
      policySizeIntentMultiplier: 1,
      baseEntryCapitalIdr: 500_000,
      policyIntentNotionalIdr: 500_000,
      riskBudgetCapIdr: 200_000,
      thinBookCapIdr: null,
      allowedNotionalIdr: 80_000,
      cappedNotionalIdr: 420_000,
      allocatedNotionalIdr: 80_000,
      blocked: false,
      reasons: ['cap'],
      exposure: {
        totalDeployedCapitalIdr: 0,
        totalRemainingCapitalIdr: 500_000,
        pairClass: { key: 'MID', usedNotionalIdr: 0, capNotionalIdr: 300_000, remainingNotionalIdr: 300_000 },
        discoveryBucket: { key: 'ANOMALY', usedNotionalIdr: 0, capNotionalIdr: 250_000, remainingNotionalIdr: 250_000 },
      },
    },
    capitalContext: {
      policyIntentNotionalIdr: 500_000,
      allocatedNotionalIdr: 80_000,
      cappedNotionalIdr: 420_000,
      blocked: false,
      reasons: ['cap'],
      pairClassBucket: 'MID',
      discoveryBucket: 'ANOMALY',
    },
    policyReasons: ['ok'],
    sizeMultiplier: 1,
    aggressiveness: 'NORMAL',
  };

  await execution.attemptAutoBuy(candidate);

  const created = orderManager.list()[0];
  assert.ok(created, 'order auto harus tercipta');
  assert.ok(created.notionalIdr <= 85_000, 'execution harus memakai final allocated notional, bukan base flat');
  assert.ok(created.notionalIdr >= 79_000, 'execution notional harus dekat allocated notional');

  console.log('execution_uses_final_allocated_notional_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
