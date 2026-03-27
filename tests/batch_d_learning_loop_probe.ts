import assert from 'node:assert/strict';

import type {
  DecisionPolicyEntryLane,
  RuntimeEntryCandidate,
  TradeOutcomeSummary,
} from '../src/core/types';
import { PolicyLearningService } from '../src/domain/learning/policyLearningService';
import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';

const ACCOUNT_ID = 'acct-1';

function makeCandidate(pair: string, lane: DecisionPolicyEntryLane): RuntimeEntryCandidate {
  return {
    pair,
    opportunity: {
      pair,
      rawScore: 80,
      finalScore: 82,
      confidence: 0.74,
      pumpProbability: 0.79,
      continuationProbability: 0.61,
      trapProbability: 0.12,
      spoofRisk: 0.09,
      edgeValid: true,
      marketRegime: 'EXPANSION',
      breakoutPressure: 16,
      quoteFlowAccelerationScore: 22,
      orderbookImbalance: 0.2,
      change1m: 0.6,
      change5m: 1.4,
      entryTiming: {
        state: 'READY',
        quality: 0.88,
        reason: 'probe',
        leadScore: 0.87,
        entryStyle: 'CONFIRM',
      },
      reasons: ['probe'],
      warnings: [],
      featureBreakdown: [],
      recommendedAction: lane === 'SCOUT' ? 'SCOUT_ENTER' : lane === 'ADD_ON_CONFIRM' ? 'ADD_ON_CONFIRM' : 'ENTER',
      riskContext: [],
      historicalMatchSummary: 'probe',
      referencePrice: 100,
      bestBid: 99,
      bestAsk: 100,
      spreadPct: 0.1,
      liquidityScore: 50,
      timestamp: Date.now(),
    },
    riskCheckResult: {
      allowed: true,
      reasons: [],
      warnings: [],
      entryLane: lane,
      baseAmountIdr: 100_000,
      adjustedAmountIdr: 100_000,
    },
    policyDecision: {
      action: 'ENTER',
      sizeMultiplier: lane === 'SCOUT' ? 0.3 : 1,
      aggressiveness: lane === 'SCOUT' ? 'LOW' : 'NORMAL',
      reasons: ['final policy enter'],
      entryLane: lane,
    },
    capitalPlan: {
      policySizeIntentMultiplier: 1,
      baseEntryCapitalIdr: 100_000,
      policyIntentNotionalIdr: 100_000,
      riskBudgetCapIdr: 100_000,
      thinBookCapIdr: null,
      allowedNotionalIdr: 100_000,
      cappedNotionalIdr: 0,
      allocatedNotionalIdr: 100_000,
      blocked: false,
      reasons: [],
      exposure: {
        totalDeployedCapitalIdr: 0,
        totalRemainingCapitalIdr: 100_000,
        pairClass: {
          key: 'MAJOR',
          usedNotionalIdr: 0,
          capNotionalIdr: 100_000,
          remainingNotionalIdr: 100_000,
        },
        discoveryBucket: {
          key: 'ANOMALY',
          usedNotionalIdr: 0,
          capNotionalIdr: 100_000,
          remainingNotionalIdr: 100_000,
        },
      },
    },
    capitalContext: {
      policyIntentNotionalIdr: 100_000,
      allocatedNotionalIdr: 100_000,
      cappedNotionalIdr: 0,
      blocked: false,
      reasons: [],
      pairClassBucket: 'MAJOR',
      discoveryBucket: 'ANOMALY',
    },
    policyReasons: ['final policy enter'],
    sizeMultiplier: lane === 'SCOUT' ? 0.3 : 1,
    aggressiveness: lane === 'SCOUT' ? 'LOW' : 'NORMAL',
  };
}

function makeOutcome(input: {
  id: string;
  pair: string;
  accuracy: TradeOutcomeSummary['accuracy'];
  netPnl: number;
  returnPercentage: number;
}): TradeOutcomeSummary {
  return {
    id: input.id,
    positionId: `pos-${input.id}`,
    accountId: ACCOUNT_ID,
    account: 'Probe',
    pair: input.pair,
    accuracy: input.accuracy,
    entryAverage: 100,
    exitAverage: 98,
    totalQuantity: 10,
    totalFee: 0,
    grossPnl: input.netPnl,
    netPnl: input.netPnl,
    returnPercentage: input.returnPercentage,
    holdDurationMs: 10_000,
    closeReason: 'STOP_LOSS',
    timestamp: new Date(Date.now() + 30_000).toISOString(),
    notes: [],
  };
}

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const settingsService = new SettingsService(persistence);
  const baseSettings = await settingsService.load();
  const originalRisk = structuredClone(baseSettings.risk);
  const originalTradingMode = baseSettings.tradingMode;

  const learning = new PolicyLearningService(persistence);

  // 1) evaluation record tercipta dari final policy entry runtime nyata.
  const firstRecord = await learning.recordPolicyEntry(makeCandidate('btc_idr', 'SCOUT'), settingsService.get(), ACCOUNT_ID);
  assert.equal(firstRecord.finalDecision.action, 'ENTER');
  assert.equal(firstRecord.finalDecision.entryLane, 'SCOUT');

  // 2) outcome linkage + simulated outcome tidak boleh jadi dasar tuning aktif.
  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'outcome-sim-1',
      pair: 'btc_idr',
      accuracy: 'SIMULATED',
      netPnl: -1200,
      returnPercentage: -1.2,
    }),
  );
  const firstLink = await learning.resolveOutcomesWithEvaluations();
  assert.equal(firstLink.linked, 1);
  const storedAfterSim = await persistence.readPolicyEvaluations();
  const simResolved = storedAfterSim.find((item) => item.id === firstRecord.id);
  assert.equal(simResolved?.status, 'RESOLVED');
  assert.equal(simResolved?.resolution?.eligibleForTuning, false);
  const noOpResult = await learning.runConservativeLearningCycle(settingsService.get());
  assert.equal(noOpResult.tuned, false);
  assert.match(noOpResult.noOpReason ?? '', /sample belum cukup/i);

  // Tambah sample CONFIRMED/PARTIAL agar gating lolos dan tuning terjadi.
  for (let i = 0; i < 6; i += 1) {
    const lane: DecisionPolicyEntryLane = i < 4 ? 'SCOUT' : 'DEFAULT';
    const pair = `pair_${i}_idr`;
    await learning.recordPolicyEntry(makeCandidate(pair, lane), settingsService.get(), ACCOUNT_ID);
    await persistence.appendTradeOutcome(
      makeOutcome({
        id: `outcome-live-${i}`,
        pair,
        accuracy: i % 2 === 0 ? 'CONFIRMED_LIVE' : 'PARTIAL_LIVE',
        netPnl: -1000 - i * 10,
        returnPercentage: -0.8,
      }),
    );
  }

  const linkResult = await learning.resolveOutcomesWithEvaluations();
  assert.ok(linkResult.linked >= 6);

  const learningResult = await learning.runConservativeLearningCycle(settingsService.get());

  assert.equal(learningResult.tuned, true);

  // 3) tuning hanya whitelist parameter policy.
  const tunedKeys = learningResult.changes.map((item) => item.key);
  assert(tunedKeys.every((key) => ['minScoreToBuy', 'minConfidence', 'minPumpProbability'].includes(key)));

  const patch: Partial<typeof baseSettings.strategy> = {};
  for (const change of learningResult.changes) {
    patch[change.key] = change.after;
  }
  await settingsService.patchStrategy(patch);
  const afterTune = settingsService.get();

  // 4) tuning tidak menembus guardrail.
  assert.deepEqual(afterTune.risk, originalRisk);
  assert.equal(afterTune.tradingMode, originalTradingMode);

  // 6) tuning persist + terbaca setelah reload service baru.
  const reloadedSettingsService = new SettingsService(persistence);
  const reloaded = await reloadedSettingsService.load();
  for (const change of learningResult.changes) {
    assert.equal(reloaded.strategy[change.key], change.after);
  }

  // 7) observability operator menampilkan status learning.
  const statusText = new ReportService().statusText({
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
        botId: null,
        botUsername: null,
        botFirstName: null,
        botIsBot: null,
        lastLaunchAt: null,
        lastConnectedAt: null,
        lastLaunchSuccessAt: null,
        lastLaunchError: null,
        lastLaunchErrorType: 'none',
      },
      callbackServerRunning: true,
      tradingEnabled: true,
      executionMode: 'SIMULATED',
      activePairsTracked: 1,
      workers: [],
      notes: [],
    },
    activeAccounts: 1,
    runtimePolicyLearning: learningResult,
  });

  assert.match(statusText, /policyLearning status=/);
  assert.match(statusText, /policyLearningReasons=/);

  console.log('batch_d_learning_loop_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
