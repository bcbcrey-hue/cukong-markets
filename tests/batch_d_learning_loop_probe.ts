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
        pairClass: { key: 'MAJOR', usedNotionalIdr: 0, capNotionalIdr: 100_000, remainingNotionalIdr: 100_000 },
        discoveryBucket: { key: 'ANOMALY', usedNotionalIdr: 0, capNotionalIdr: 100_000, remainingNotionalIdr: 100_000 },
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
  positionId: string;
  accuracy: TradeOutcomeSummary['accuracy'];
  netPnl: number;
  returnPercentage: number;
}): TradeOutcomeSummary {
  return {
    id: input.id,
    positionId: input.positionId,
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

  // 1) Record dibuat setelah anchor eksekusi (orderId) terbentuk.
  const sharedScout = await learning.recordAutoEntryExecution(
    makeCandidate('btc_idr', 'SCOUT'),
    settingsService.get(),
    ACCOUNT_ID,
    'order-shared-1',
  );
  const sharedAddOn = await learning.recordAutoEntryExecution(
    makeCandidate('btc_idr', 'ADD_ON_CONFIRM'),
    settingsService.get(),
    ACCOUNT_ID,
    'order-shared-2',
  );
  assert.equal(sharedScout.status, 'PENDING_EXECUTION');
  assert.equal(sharedAddOn.status, 'PENDING_EXECUTION');

  // 2) Multi-entry same pair: dua entry di-anchor ke position lifecycle yang sama.
  await learning.markExecutionAnchoredByOrder('order-shared-1', 'pos-shared-btc');
  await learning.markExecutionAnchoredByOrder('order-shared-2', 'pos-shared-btc');

  await persistence.appendTradeOutcome(
    makeOutcome({
      id: 'outcome-shared-btc',
      pair: 'btc_idr',
      positionId: 'pos-shared-btc',
      accuracy: 'CONFIRMED_LIVE',
      netPnl: -2000,
      returnPercentage: -1.2,
    }),
  );

  // 3) Entry yang lifecycle eksekusinya gagal harus punya status jelas dan tidak ikut tuning.
  await learning.recordAutoEntryExecution(
    makeCandidate('eth_idr', 'DEFAULT'),
    settingsService.get(),
    ACCOUNT_ID,
    'order-failed-1',
  );
  await learning.markExecutionFailedByOrder('order-failed-1', 'exchange rejected');

  // Tambah sample eligible agar gate sample lolos.
  for (let i = 0; i < 6; i += 1) {
    const orderId = `order-live-${i}`;
    const positionId = `pos-live-${i}`;
    const pair = `pair_${i}_idr`;
    const lane: DecisionPolicyEntryLane = i < 4 ? 'SCOUT' : 'DEFAULT';

    await learning.recordAutoEntryExecution(makeCandidate(pair, lane), settingsService.get(), ACCOUNT_ID, orderId);
    await learning.markExecutionAnchoredByOrder(orderId, positionId);
    await persistence.appendTradeOutcome(
      makeOutcome({
        id: `outcome-live-${i}`,
        pair,
        positionId,
        accuracy: i % 2 === 0 ? 'CONFIRMED_LIVE' : 'PARTIAL_LIVE',
        netPnl: -1000 - i * 10,
        returnPercentage: -0.8,
      }),
    );
  }

  const linkage = await learning.resolveOutcomesWithEvaluations();
  assert.ok(linkage.linked >= 8);

  const records = await persistence.readPolicyEvaluations();
  const sharedResolved = records.filter((item) => item.executionAnchor?.positionId === 'pos-shared-btc');
  assert.equal(sharedResolved.length, 2);
  assert.ok(sharedResolved.every((item) => item.status === 'RESOLVED'));
  assert.ok(sharedResolved.every((item) => item.resolution?.outcomeId === 'outcome-shared-btc'));
  assert.ok(sharedResolved.every((item) => item.resolution?.sharedPositionLifecycle === true));

  const failedRecord = records.find((item) => item.executionAnchor?.orderId === 'order-failed-1');
  assert.equal(failedRecord?.status, 'EXECUTION_FAILED');

  // 4) Run learning pertama boleh tune.
  const learningResult1 = await learning.runConservativeLearningCycle(settingsService.get(), null);
  assert.equal(learningResult1.tuned, true);
  const tunedKeys = learningResult1.changes.map((item) => item.key);
  assert(tunedKeys.every((key) => ['minScoreToBuy', 'minConfidence', 'minPumpProbability'].includes(key)));

  const patch: Partial<typeof baseSettings.strategy> = {};
  for (const change of learningResult1.changes) {
    patch[change.key] = change.after;
  }
  await settingsService.patchStrategy(patch);

  // 5) Run learning kedua dataset identik wajib NO_OP (idempotent).
  const learningResult2 = await learning.runConservativeLearningCycle(settingsService.get(), learningResult1);
  assert.equal(learningResult2.tuned, false);
  assert.match(learningResult2.noOpReason ?? '', /idempotent no-op/i);

  // 6) Guardrail tidak boleh tersentuh.
  const afterTune = settingsService.get();
  assert.deepEqual(afterTune.risk, originalRisk);
  assert.equal(afterTune.tradingMode, originalTradingMode);

  // 7) Tuning persist setelah reload.
  const reloadedSettingsService = new SettingsService(persistence);
  const reloaded = await reloadedSettingsService.load();
  for (const change of learningResult1.changes) {
    assert.equal(reloaded.strategy[change.key], change.after);
  }

  // 8) Observability operator menampilkan learning status/no-op.
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
    runtimePolicyLearning: learningResult2,
  });

  assert.match(statusText, /policyLearning status=NO_OP/);
  assert.match(statusText, /policyLearningNoOp=/);

  console.log('batch_d_learning_loop_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
