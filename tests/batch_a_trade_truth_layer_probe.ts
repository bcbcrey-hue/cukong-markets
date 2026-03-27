import assert from 'node:assert/strict';

import type { BotSettings, DiscoverySettings, MarketSnapshot, SignalCandidate } from '../src/core/types';
import { createDefaultSettings } from '../src/services/persistenceService';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type {
  IndodaxOrderbook,
  IndodaxRecentTrade,
  IndodaxTickerEntry,
} from '../src/integrations/indodax/publicApi';
import { FeaturePipeline } from '../src/domain/intelligence/featurePipeline';
import { ProbabilityEngine } from '../src/domain/intelligence/probabilityEngine';
import { evaluateOpportunityPolicyV1 } from '../src/domain/decision/decisionPolicyEngine';

const discoverySettings: DiscoverySettings = {
  anomalySlots: 2,
  rotationSlots: 1,
  stealthSlots: 1,
  liquidLeaderSlots: 1,
  minVolumeIdr: 200_000_000,
  maxSpreadPct: 1.2,
  minDepthScore: 15,
  majorPairMaxShare: 0.5,
};

class TruthAndFallbackClient {
  private callCount = 0;

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    this.callCount += 1;
    const multiplier = this.callCount;

    return {
      truth_idr: {
        name: 'truth_idr', high: 220, low: 120, vol_btc: 8, vol_idr: 900_000_000 + multiplier * 20_000, last: 200, buy: 199.8, sell: 200, server_time: Date.now(),
      },
      proxy_idr: {
        name: 'proxy_idr', high: 140, low: 80, vol_btc: 6, vol_idr: 820_000_000 + multiplier * 20_000, last: 100, buy: 99.6, sell: 100, server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'truth_idr') {
      return { buy: [[199.8, 130], [199.5, 120], [199, 110]], sell: [[200, 60], [200.5, 55], [201, 50]] };
    }

    return { buy: [[99.6, 100], [99.5, 95], [99.4, 92]], sell: [[100, 88], [100.2, 86], [100.4, 84]] };
  }

  async getRecentTrades(pair: string): Promise<IndodaxRecentTrade[] | null> {
    if (pair === 'truth_idr') {
      const now = Math.floor(Date.now() / 1000);
      return [
        { tid: '11', date: now - 3, price: 199.9, amount: 1.4, type: 'buy' },
        { tid: '12', date: now - 2, price: 200, amount: 1.1, type: 'buy' },
        { tid: '13', date: now - 1, price: 200.1, amount: 0.9, type: 'sell' },
        { tid: '14', date: now, price: 200.2, amount: 1.3, type: 'buy' },
      ];
    }

    return null;
  }
}

function buildSignal(snapshot: MarketSnapshot): SignalCandidate {
  return {
    pair: snapshot.pair,
    score: 78,
    confidence: 0.66,
    reasons: ['batch-a-probe'],
    warnings: [],
    regime: 'EXPANSION',
    breakoutPressure: 72,
    quoteFlowAccelerationScore: 64,
    orderbookImbalance: 58,
    spreadPct: 0.35,
    marketPrice: snapshot.ticker.lastPrice,
    bestBid: snapshot.ticker.bid,
    bestAsk: snapshot.ticker.ask,
    spreadBps: 20,
    bidDepthTop10: 420_000,
    askDepthTop10: 360_000,
    depthScore: 75,
    orderbookTimestamp: snapshot.timestamp,
    liquidityScore: 74,
    change1m: 0.9,
    change5m: 1.9,
    contributions: [],
    timestamp: snapshot.timestamp,
    discoveryBucket: snapshot.discoveryBucket,
    pairClass: snapshot.pairClass,
  };
}

function buildPolicySettings(minConfidence: number): BotSettings {
  const base = createDefaultSettings();
  return {
    ...base,
    tradingMode: 'FULL_AUTO',
    strategy: {
      ...base.strategy,
      minScoreToAlert: 50,
      minScoreToBuy: 60,
      minPumpProbability: 0.55,
      minConfidence,
    },
  };
}

function buildOpportunityConfidenceDriven(confidence: number) {
  return {
    pair: 'truth_idr',
    rawScore: 80,
    finalScore: 83,
    confidence,
    pumpProbability: 0.72,
    continuationProbability: 0.65,
    trapProbability: 0.22,
    spoofRisk: 0.12,
    edgeValid: true,
    marketRegime: 'EXPANSION' as const,
    breakoutPressure: 71,
    quoteFlowAccelerationScore: 65,
    orderbookImbalance: 57,
    change1m: 0.9,
    change5m: 1.9,
    entryTiming: {
      state: 'READY' as const,
      quality: 72,
      reason: 'probe',
      leadScore: 66,
    },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    historicalContext: {
      pair: 'truth_idr',
      snapshotCount: 10,
      anomalyCount: 0,
      recentWinRate: 0.6,
      recentFalseBreakRate: 0.25,
      regime: 'EXPANSION' as const,
      patternMatches: [],
      contextNotes: ['probe'],
      timestamp: Date.now(),
    },
    recommendedAction: 'ENTER' as const,
    pumpState: 'CONTINUATION' as const,
    lastContinuationScore: 0.65,
    lastDumpRisk: 0.22,
    riskContext: [],
    historicalMatchSummary: 'probe',
    referencePrice: 200,
    bestBid: 199.8,
    bestAsk: 200,
    spreadBps: 20,
    bidDepthTop10: 420_000,
    askDepthTop10: 360_000,
    depthScore: 75,
    orderbookTimestamp: Date.now(),
    spreadPct: 0.35,
    liquidityScore: 74,
    timestamp: Date.now(),
  };
}

async function main() {
  const watcher = new MarketWatcher(
    new TruthAndFallbackClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => discoverySettings,
  );

  // Seed once so fallback pair has previous ticker state and can infer proxy delta.
  await watcher.batchSnapshot(4);
  const snapshots = await watcher.batchSnapshot(4);

  const truthSnapshot = snapshots.find((item) => item.pair === 'truth_idr');
  const proxySnapshot = snapshots.find((item) => item.pair === 'proxy_idr');

  assert.equal(truthSnapshot?.recentTradesSource, 'EXCHANGE_TRADE_FEED', 'truth pair must consume exchange trade feed');
  assert.ok(
    truthSnapshot?.recentTrades.every((trade) => trade.source === 'EXCHANGE_TRADE_FEED' && trade.quality === 'TAPE'),
    'truth pair trades must stay labeled as EXCHANGE_TRADE_FEED + TAPE',
  );

  assert.equal(proxySnapshot?.recentTradesSource, 'INFERRED_PROXY', 'fallback pair must stay explicit as inferred proxy');
  assert.ok(
    proxySnapshot?.recentTrades.every((trade) => trade.source === 'INFERRED_SNAPSHOT_DELTA' && trade.quality === 'PROXY'),
    'fallback pair must never be mislabeled as tape truth',
  );

  assert.ok(truthSnapshot && proxySnapshot, 'required snapshots must exist');

  const pipeline = new FeaturePipeline();
  const signalTruth = buildSignal(truthSnapshot);
  const signalProxy = buildSignal(proxySnapshot);

  const truthFeatures = pipeline.build(truthSnapshot, signalTruth, []);
  const proxyFeatures = pipeline.build(proxySnapshot, signalProxy, []);

  assert.equal(truthFeatures.tradeFlowQuality, 'TAPE', 'truth snapshot must produce TAPE trade-flow quality');
  assert.equal(proxyFeatures.tradeFlowQuality, 'PROXY', 'proxy snapshot must produce PROXY trade-flow quality');

  const probability = new ProbabilityEngine();
  const baseContext = {
    pair: 'probe_idr',
    snapshotCount: 8,
    anomalyCount: 0,
    recentWinRate: 0.58,
    recentFalseBreakRate: 0.2,
    regime: 'EXPANSION' as const,
    patternMatches: [],
    contextNotes: [],
    timestamp: Date.now(),
  };

  const truthProbability = probability.assess({
    signal: signalTruth,
    microstructure: truthFeatures,
    historicalContext: baseContext,
  });

  const proxyProbability = probability.assess({
    signal: signalProxy,
    microstructure: proxyFeatures,
    historicalContext: baseContext,
  });

  assert.ok(
    truthProbability.confidence > proxyProbability.confidence,
    'truth trade-flow must increase probability confidence versus proxy fallback',
  );

  const policySettings = buildPolicySettings((truthProbability.confidence + proxyProbability.confidence) / 2);
  const truthDecision = evaluateOpportunityPolicyV1(
    buildOpportunityConfidenceDriven(truthProbability.confidence),
    policySettings,
  );
  const proxyDecision = evaluateOpportunityPolicyV1(
    buildOpportunityConfidenceDriven(proxyProbability.confidence),
    policySettings,
  );

  assert.equal(truthDecision.action, 'ENTER', 'higher confidence from truth feed must pass policy confidence gate');
  assert.equal(proxyDecision.action, 'SKIP', 'proxy confidence below threshold must be rejected by policy gate');

  console.log('PASS batch_a_trade_truth_layer_probe');
}

main().catch((error) => {
  console.error('FAIL batch_a_trade_truth_layer_probe');
  console.error(error);
  process.exit(1);
});
