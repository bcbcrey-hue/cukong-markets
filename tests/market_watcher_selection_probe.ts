import assert from 'node:assert/strict';

import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return {
      aaa_idr: {
        name: 'aaa_idr',
        high: 100,
        low: 80,
        vol_btc: 1,
        vol_idr: 100,
        last: 90,
        buy: 89,
        sell: 91,
        server_time: Date.now(),
      },
      mmm_idr: {
        name: 'mmm_idr',
        high: 100,
        low: 80,
        vol_btc: 1,
        vol_idr: 200,
        last: 90,
        buy: 89,
        sell: 91,
        server_time: Date.now(),
      },
      zzz_idr: {
        name: 'zzz_idr',
        high: 100,
        low: 80,
        vol_btc: 1,
        vol_idr: 300,
        last: 90,
        buy: 89,
        sell: 91,
        server_time: Date.now(),
      },
    };
  }

  async getDepth(): Promise<IndodaxOrderbook> {
    return {
      buy: [[89, 10]],
      sell: [[91, 10]],
    };
  }
}

async function main() {
  const watcher = new MarketWatcher(new FakeIndodaxClient() as unknown as IndodaxClient, new PairUniverse());
  const snapshots = await watcher.batchSnapshot(2);
  const selectedPairs = snapshots.map((item) => item.pair);

  assert.deepEqual(
    selectedPairs,
    ['zzz_idr', 'mmm_idr'],
    'MarketWatcher limit must prioritize top volumeIdr pairs, not alphabetical pairs',
  );

  console.log('PASS market_watcher_selection_probe');
}

main().catch((error) => {
  console.error('FAIL market_watcher_selection_probe');
  console.error(error);
  process.exit(1);
});
