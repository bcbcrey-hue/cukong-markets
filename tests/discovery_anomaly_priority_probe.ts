import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  private calls = 0;

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        btc_idr: {
          name: 'btc_idr', high: 1_050_000_000, low: 950_000_000, vol_btc: 120, vol_idr: 50_000_000_000,
          last: 1_000_000_000, buy: 999_000_000, sell: 1_000_000_000, server_time: Date.now(),
        },
        alpha_idr: {
          name: 'alpha_idr', high: 125, low: 95, vol_btc: 2, vol_idr: 500_000_000,
          last: 100, buy: 99.8, sell: 100, server_time: Date.now(),
        },
      };
    }

    return {
      btc_idr: {
        name: 'btc_idr', high: 1_080_000_000, low: 950_000_000, vol_btc: 140, vol_idr: 60_000_000_000,
        last: 1_040_000_000, buy: 1_039_500_000, sell: 1_040_000_000, server_time: Date.now(),
      },
      alpha_idr: {
        name: 'alpha_idr', high: 170, low: 95, vol_btc: 3, vol_idr: 1_200_000_000,
        last: 150, buy: 149.7, sell: 150, server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'btc_idr') {
      return { buy: [[1_039_500_000, 500], [1_039_000_000, 300]], sell: [[1_040_000_000, 520], [1_040_500_000, 250]] };
    }

    return { buy: [[149.7, 120], [149.5, 80]], sell: [[150, 130], [150.2, 70]] };
  }
}

async function main(): Promise<void> {
  const settings: DiscoverySettings = {
    anomalySlots: 1,
    rotationSlots: 0,
    stealthSlots: 0,
    liquidLeaderSlots: 1,
    minVolumeIdr: 150_000_000,
    maxSpreadPct: 1.2,
    minDepthScore: 10,
    majorPairMaxShare: 1,
  };

  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => settings,
  );

  await watcher.batchSnapshot(2);
  const selected = await watcher.batchSnapshot(2);
  const pairs = selected.map((item) => item.pair);

  assert.equal(selected.length, 2, 'limit=2 must produce exactly two selected pairs');
  assert(
    pairs.includes('btc_idr'),
    'control major pair should remain eligible because this probe validates priority coexistence, not major blocking',
  );
  assert(
    pairs.includes('alpha_idr'),
    'runtime discovery must include valid anomaly candidate even when higher-volume major pair also exists',
  );

  console.log('PASS discovery_anomaly_priority_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_anomaly_priority_probe');
  console.error(error);
  process.exit(1);
});
