import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return {
      btc_idr: {
        name: 'btc_idr', high: 110, low: 90, vol_btc: 12, vol_idr: 2_000_000_000,
        last: 100, buy: 99.9, sell: 100, server_time: Date.now(),
      },
      wide_spread_idr: {
        name: 'wide_spread_idr', high: 115, low: 90, vol_btc: 4, vol_idr: 1_400_000_000,
        last: 100, buy: 95, sell: 100, server_time: Date.now(),
      },
      thin_depth_idr: {
        name: 'thin_depth_idr', high: 120, low: 90, vol_btc: 5, vol_idr: 1_200_000_000,
        last: 100, buy: 99.8, sell: 100, server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'thin_depth_idr') {
      return { buy: [[99.8, 1]], sell: [[100, 1]] };
    }

    if (pair === 'btc_idr') {
      return { buy: [[99.9, 90], [99.8, 40]], sell: [[100, 100], [100.1, 45]] };
    }

    return { buy: [[95, 80]], sell: [[100, 80]] };
  }
}

async function main(): Promise<void> {
  const settings: DiscoverySettings = {
    anomalySlots: 1,
    rotationSlots: 1,
    stealthSlots: 1,
    liquidLeaderSlots: 1,
    minVolumeIdr: 150_000_000,
    maxSpreadPct: 1.2,
    minDepthScore: 30,
    majorPairMaxShare: 1,
  };

  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => settings,
  );

  const selected = await watcher.batchSnapshot(5);
  const pairs = selected.map((item) => item.pair);

  assert(!pairs.includes('wide_spread_idr'), 'pair with spread above maxSpreadPct must be rejected before depth stage');
  assert(!pairs.includes('thin_depth_idr'), 'pair with depth below minDepthScore must be rejected at depth gate');
  assert(pairs.includes('btc_idr'), 'control pair with healthy spread/depth should survive discovery');

  const summary = watcher.getLastDiscoverySummary();
  assert(summary, 'discovery summary should be available after batch snapshot');
  assert((summary?.rejected.spread ?? 0) >= 1, 'summary rejected.spread should count spread-gated pair');
  assert((summary?.rejected.depth ?? 0) >= 1, 'summary rejected.depth should count depth-gated pair');

  console.log('PASS discovery_rejection_gate_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_rejection_gate_probe');
  console.error(error);
  process.exit(1);
});
