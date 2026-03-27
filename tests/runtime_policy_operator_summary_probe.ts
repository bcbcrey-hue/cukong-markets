import assert from 'node:assert/strict';

import type { HealthSnapshot, OpportunityAssessment, RuntimePolicyReadModel } from '../src/core/types';
import { ReportService } from '../src/services/reportService';

function makeOpportunity(overrides: Partial<OpportunityAssessment> = {}): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'btc_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MAJOR',
    rawScore: 88,
    finalScore: 90,
    confidence: 0.86,
    pumpProbability: 0.72,
    continuationProbability: 0.62,
    trapProbability: 0.12,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.6,
    change5m: 1.8,
    entryTiming: { state: 'READY', quality: 81, reason: 'ok', leadScore: 72 },
    reasons: ['opportunity reason'],
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

function makeHealth(): HealthSnapshot {
  return {
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
    activePairsTracked: 3,
    workers: [],
    notes: ['probe'],
  };
}

async function main() {
  const report = new ReportService();
  const opportunity = makeOpportunity();
  const runtimePolicyDecision: RuntimePolicyReadModel = {
    pair: opportunity.pair,
    action: 'ENTER',
    reasons: ['policy final enter meski hint avoid'],
    entryLane: 'SCOUT',
    sizeMultiplier: 0.35,
    aggressiveness: 'NORMAL',
    riskAllowed: true,
    riskReasons: [],
    updatedAt: new Date().toISOString(),
  };

  const status = report.statusText({
    health: makeHealth(),
    activeAccounts: 1,
    topOpportunity: opportunity,
    runtimePolicyDecision,
  });

  assert.match(status, /topOpportunity=btc_idr.*hintAction=AVOID/, 'status harus menandai recommendedAction sebagai hint');
  assert.match(status, /runtimePolicy pair=btc_idr action=ENTER lane=SCOUT/, 'status harus menampilkan final policy runtime');
  assert.match(status, /runtimePolicyReasons=policy final enter meski hint avoid/, 'status harus menampilkan policy reasons');

  const detail = report.signalBreakdownText(opportunity);
  assert.match(detail, /Hint action: AVOID/, 'breakdown opportunity harus menandai action sebagai hint');

  const intelligence = report.intelligenceReportText([opportunity]);
  assert.match(intelligence, /hintAction=AVOID/, 'intelligence report harus menandai action sebagai hint');

  console.log('runtime_policy_operator_summary_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
