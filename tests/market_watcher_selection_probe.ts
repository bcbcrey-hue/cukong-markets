import assert from 'node:assert/strict';

import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return {
      btc_idr: {
        name: 'btc_idr', high: 100, low: 80, vol_btc: 10, vol_idr: 950_000_000, last: 90, buy: 89, sell: 91, server_time: Date.now(),
      },
      anomaly_idr: {
        name: 'anomaly_idr', high: 210, low: 110, vol_btc: 2, vol_idr: 400_000_000, last: 205, buy: 204, sell: 205, server_time: Date.now(),
      },
      stealth_idr: {
        name: 'stealth_idr', high: 150, low: 120, vol_btc: 1, vol_idr: 300_000_000, last: 148, buy: 147.8, sell: 148, server_time: Date.now(),
      },
      volume_giant_badspread_idr: {
        name: 'volume_giant_badspread_idr', high: 100, low: 80, vol_btc: 20, vol_idr: 1_500_000_000, last: 90, buy: 70, sell: 90, server_time: Date.now(),
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
}

async function seedHistory(watcher: MarketWatcher) {
  await watcher.batchSnapshot(4);
}

async function main() {
  const watcher = new MarketWatcher(new FakeIndodaxClient() as unknown as IndodaxClient, new PairUniverse());
  await seedHistory(watcher);
  const snapshots = await watcher.batchSnapshot(3);
  const selectedPairs = snapshots.map((item) => item.pair);

  assert(selectedPairs.includes('anomaly_idr'), 'anomaly pair should be selected by discovery ranking');
  assert(selectedPairs.includes('stealth_idr'), 'stealth pair should be selected by discovery ranking');
  assert(!selectedPairs.includes('volume_giant_badspread_idr'), 'top volume with bad spread must be filtered out');

  console.log('PASS market_watcher_selection_probe');
}

main().catch((error) => {
  console.error('FAIL market_watcher_selection_probe');
  console.error(error);
  process.exit(1);
});
