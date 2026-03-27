import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type {
  IndodaxOrderbook,
  IndodaxRecentTrade,
  IndodaxTickerEntry,
} from '../src/integrations/indodax/publicApi';


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

class FakeIndodaxClient {
  private callCount = 0;

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    this.callCount += 1;
    const multiplier = this.callCount;

    return {
      btc_idr: {
        name: 'btc_idr', high: 100, low: 80, vol_btc: 10, vol_idr: 950_000_000 + multiplier * 10_000, last: 90, buy: 89, sell: 91, server_time: Date.now(),
      },
      anomaly_idr: {
        name: 'anomaly_idr', high: 210, low: 110, vol_btc: 2, vol_idr: 400_000_000 + multiplier * 25_000, last: 205, buy: 204, sell: 205, server_time: Date.now(),
      },
      stealth_idr: {
        name: 'stealth_idr', high: 150, low: 120, vol_btc: 1, vol_idr: 300_000_000 + multiplier * 15_000, last: 148, buy: 147.8, sell: 148, server_time: Date.now(),
      },
      volume_giant_badspread_idr: {
        name: 'volume_giant_badspread_idr', high: 100, low: 80, vol_btc: 20, vol_idr: 1_500_000_000 + multiplier * 30_000, last: 90, buy: 70, sell: 90, server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'anomaly_idr') {
      return { buy: [[204, 150], [203, 120], [202, 100]], sell: [[205, 80], [206, 60], [207, 55]] };
    }

    if (pair === 'stealth_idr') {
      return { buy: [[147.8, 70], [147.7, 60], [147.6, 55]], sell: [[148, 52], [148.1, 50], [148.2, 49]] };
    }

    return { buy: [[89, 20], [88, 20], [87, 20]], sell: [[91, 20], [92, 20], [93, 20]] };
  }

  async getRecentTrades(pair: string): Promise<IndodaxRecentTrade[] | null> {
    if (pair === 'anomaly_idr') {
      return [
        { tid: '1', date: Math.floor(Date.now() / 1000), price: 205, amount: 1.2, type: 'buy' },
        { tid: '2', date: Math.floor(Date.now() / 1000) - 1, price: 204.9, amount: 0.7, type: 'sell' },
      ];
    }

    return null;
  }
}

async function seedHistory(watcher: MarketWatcher) {
  await watcher.batchSnapshot(4);
}

async function main() {
  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => discoverySettings,
  );
  await seedHistory(watcher);
  const snapshots = await watcher.batchSnapshot(3);
  const selectedPairs = snapshots.map((item) => item.pair);

  assert(selectedPairs.includes('anomaly_idr'), 'anomaly pair should be selected by discovery ranking');
  assert(selectedPairs.includes('stealth_idr'), 'stealth pair should be selected by discovery ranking');
  assert(!selectedPairs.includes('volume_giant_badspread_idr'), 'top volume with bad spread must be filtered out');

  const anomalySnapshot = snapshots.find((item) => item.pair === 'anomaly_idr');
  assert.equal(
    anomalySnapshot?.recentTradesSource,
    'MIXED',
    'MarketWatcher must mark low-coverage truth feed plus inferred delta as MIXED',
  );
  assert.ok(
    anomalySnapshot?.recentTrades.some((trade) => trade.source === 'EXCHANGE_TRADE_FEED' && trade.quality === 'TAPE'),
    'MarketWatcher must preserve truth trade feed labels when exchange feed available',
  );

  const fallbackSnapshot = snapshots.find((item) => item.pair !== 'anomaly_idr');
  assert.equal(
    fallbackSnapshot?.recentTradesSource,
    'INFERRED_PROXY',
    'MarketWatcher must fallback to inferred proxy when exchange trades unavailable',
  );
  assert.ok(
    (fallbackSnapshot?.recentTrades ?? []).every(
      (trade) => trade.source === 'INFERRED_SNAPSHOT_DELTA' && trade.quality === 'PROXY',
    ),
    'Fallback inferred trades must be explicitly labeled as proxy and inferred',
  );

  console.log('PASS market_watcher_selection_probe');
}

main().catch((error) => {
  console.error('FAIL market_watcher_selection_probe');
  console.error(error);
  process.exit(1);
});
