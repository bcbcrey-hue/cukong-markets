import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { HotlistService } from '../src/domain/market/hotlistService';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { TelegramBot } from '../src/integrations/telegram/bot';
import type { HotlistEntry } from '../src/core/types';
import { env } from '../src/config/env';
import { StateService } from '../src/services/stateService';

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistedHotlist: HotlistEntry[] = [
    {
      rank: 4,
      pair: 'eth_idr',
      score: 88,
      confidence: 0.82,
      reasons: ['persisted-eth'],
      warnings: [],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 70,
      quoteFlowAccelerationScore: 68,
      orderbookImbalance: 0.32,
      spreadPct: 0.24,
      marketPrice: 55_000_000,
      bestBid: 54_900_000,
      bestAsk: 55_100_000,
      spreadBps: 36.3,
      bidDepthTop10: 1_200_000,
      askDepthTop10: 1_100_000,
      depthScore: 75,
      orderbookTimestamp: Date.now(),
      liquidityScore: 80,
      change1m: 0.8,
      change5m: 1.6,
      contributions: [],
      timestamp: Date.now(),
      recommendedAction: 'ENTER',
      edgeValid: true,
      entryTiming: { state: 'READY', quality: 78, reason: 'ready', leadScore: 71 },
      pumpProbability: 0.74,
      trapProbability: 0.12,
      historicalMatchSummary: 'persisted-eth',
    },
    {
      rank: 1,
      pair: 'btc_idr',
      score: 92,
      confidence: 0.9,
      reasons: ['persisted-btc'],
      warnings: [],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 84,
      quoteFlowAccelerationScore: 79,
      orderbookImbalance: 0.39,
      spreadPct: 0.18,
      marketPrice: 1_000_000_000,
      bestBid: 999_000_000,
      bestAsk: 1_001_000_000,
      spreadBps: 20.0,
      bidDepthTop10: 4_100_000,
      askDepthTop10: 3_900_000,
      depthScore: 84,
      orderbookTimestamp: Date.now(),
      liquidityScore: 90,
      change1m: 1.2,
      change5m: 2.5,
      contributions: [],
      timestamp: Date.now(),
      recommendedAction: 'ENTER',
      edgeValid: true,
      entryTiming: { state: 'READY', quality: 83, reason: 'ready', leadScore: 77 },
      pumpProbability: 0.81,
      trapProbability: 0.1,
      historicalMatchSummary: 'persisted-btc',
    },
  ];

  const nowIso = new Date().toISOString();
  await fs.mkdir(path.dirname(env.stateFile), { recursive: true });
  await fs.writeFile(
    env.stateFile,
    JSON.stringify(
      {
        status: 'STOPPED',
        startedAt: null,
        stoppedAt: nowIso,
        lastUpdatedAt: nowIso,
        uptimeMs: 0,
        activeTradingMode: 'OFF',
        pairCooldowns: {},
        pairs: {},
        lastMarketOverview: null,
        lastPumpCandidates: [],
        lastHotlist: persistedHotlist,
        lastSignals: [],
        lastOpportunities: [],
        tradeCount: 0,
        lastTradeAt: null,
        pollingStats: { activeJobs: 0, tickCount: 0, lastTickAt: null },
        emergencyStop: false,
      },
      null,
      2,
    ),
    'utf8',
  );

  const originalRehydrate = HotlistService.prototype.rehydrate;
  const originalStateLoad = StateService.prototype.load;
  const originalMarketWatcherBatchSnapshot = MarketWatcher.prototype.batchSnapshot;
  const originalTelegramStart = TelegramBot.prototype.start;
  const originalTelegramStop = TelegramBot.prototype.stop;

  let stateLoaded = false;
  let rehydrateCalled = 0;
  let rehydrateInput: HotlistEntry[] = [];
  let normalizedAfterRehydrate: HotlistEntry[] = [];

  StateService.prototype.load = async function patchedLoad() {
    const result = await originalStateLoad.call(this);
    stateLoaded = true;
    return result;
  };

  HotlistService.prototype.rehydrate = function patchedRehydrate(entries: HotlistEntry[]) {
    assert.equal(stateLoaded, true, 'HotlistService.rehydrate must run after state.load() completes');
    rehydrateCalled += 1;
    rehydrateInput = entries;
    originalRehydrate.call(this, entries);
    normalizedAfterRehydrate = this.list();
  };

  MarketWatcher.prototype.batchSnapshot = async function patchedBatchSnapshot() {
    return [];
  };

  TelegramBot.prototype.start = async function patchedStart() {
    const signalHolder = this as unknown as {
      signal: { launched: boolean; running: boolean; connected: boolean };
    };
    signalHolder.signal = {
      ...signalHolder.signal,
      launched: true,
      running: true,
      connected: true,
    };
  };

  TelegramBot.prototype.stop = async function patchedStop() {
    return;
  };

  const { createApp } = await import('../src/app');

  try {
    const app = await createApp();

    assert.equal(rehydrateCalled, 1, 'createApp must rehydrate hotlist exactly once during startup wiring');
    assert.deepEqual(
      rehydrateInput,
      persistedHotlist,
      'HotlistService.rehydrate input must come from canonical state.lastHotlist snapshot',
    );
    assert.deepEqual(
      normalizedAfterRehydrate.map((item) => item.pair),
      ['btc_idr', 'eth_idr'],
      'Rehydrated hotlist must keep deterministic ranking order by stored rank',
    );
    assert.deepEqual(
      normalizedAfterRehydrate.map((item) => item.rank),
      [1, 2],
      'Rehydrated hotlist must normalize rank sequence to avoid stale or sparse ranks after restart',
    );

    await app.stop();
  } finally {
    HotlistService.prototype.rehydrate = originalRehydrate;
    StateService.prototype.load = originalStateLoad;
    MarketWatcher.prototype.batchSnapshot = originalMarketWatcherBatchSnapshot;
    TelegramBot.prototype.start = originalTelegramStart;
    TelegramBot.prototype.stop = originalTelegramStop;
  }

  console.log('PASS startup_hotlist_rehydrate_probe');
}

main().catch((error) => {
  console.error('FAIL startup_hotlist_rehydrate_probe');
  console.error(error);
  process.exit(1);
});
