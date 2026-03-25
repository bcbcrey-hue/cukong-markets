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
        name: 'btc_idr', high: 100, low: 80, vol_btc: 8, vol_idr: 950_000_000, last: 92, buy: 91.8, sell: 92,
        server_time: Date.now(),
      },
      anomaly_idr: {
        name: 'anomaly_idr', high: 150, low: 90, vol_btc: 1.2, vol_idr: 350_000_000, last: 149.5, buy: 149.4, sell: 149.5,
        server_time: Date.now(),
      },
      stealth_idr: {
        name: 'stealth_idr', high: 150, low: 120, vol_btc: 1.1, vol_idr: 320_000_000, last: 148, buy: 147.9, sell: 148,
        server_time: Date.now(),
      },
      wide_spread_idr: {
        name: 'wide_spread_idr', high: 130, low: 100, vol_btc: 2, vol_idr: 700_000_000, last: 110, buy: 100, sell: 110,
        server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'btc_idr') {
      return { buy: [[91.8, 70], [91.7, 40]], sell: [[92, 65], [92.1, 35]] };
    }

    if (pair === 'stealth_idr') {
      return { buy: [[147.9, 80], [147.8, 30]], sell: [[148, 75], [148.1, 35]] };
    }

    if (pair === 'anomaly_idr') {
      return { buy: [[149.4, 6], [149.3, 4]], sell: [[149.5, 6], [149.6, 4]] };
    }

    return { buy: [[100, 100]], sell: [[110, 100]] };
  }
}

async function runWithSettings(settings: DiscoverySettings): Promise<string[]> {
  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => settings,
  );

  await watcher.batchSnapshot(4);
  const snapshots = await watcher.batchSnapshot(4);
  return snapshots.map((item) => item.pair);
}

async function main() {
  const strictSettings: DiscoverySettings = {
    anomalySlots: 0,
    rotationSlots: 0,
    stealthSlots: 2,
    liquidLeaderSlots: 2,
    minVolumeIdr: 300_000_000,
    maxSpreadPct: 0.5,
    minDepthScore: 40,
    majorPairMaxShare: 0,
  };

  const relaxedSettings: DiscoverySettings = {
    anomalySlots: 2,
    rotationSlots: 1,
    stealthSlots: 2,
    liquidLeaderSlots: 2,
    minVolumeIdr: 150_000_000,
    maxSpreadPct: 1.2,
    minDepthScore: 10,
    majorPairMaxShare: 0.5,
  };

  const strictSelected = await runWithSettings(strictSettings);
  const relaxedSelected = await runWithSettings(relaxedSettings);

  assert(!strictSelected.includes('btc_idr'), 'majorPairMaxShare=0 must block major pair selection');
  assert(strictSelected.includes('stealth_idr'), 'stealth should survive strict filters and slots');
  assert(!strictSelected.includes('anomaly_idr'), 'minDepthScore=40 should filter thin anomaly depth');
  assert(!strictSelected.includes('wide_spread_idr'), 'maxSpreadPct strict must filter wide spread pair');

  assert(relaxedSelected.includes('btc_idr'), 'relaxed majorPairMaxShare should allow major pair');
  assert(relaxedSelected.includes('anomaly_idr'), 'relaxed minDepthScore should allow anomaly pair');
  assert(!relaxedSelected.includes('wide_spread_idr'), 'spread filter must still apply when above maxSpreadPct');

  console.log('PASS discovery_settings_runtime_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_settings_runtime_probe');
  console.error(error);
  process.exit(1);
});
