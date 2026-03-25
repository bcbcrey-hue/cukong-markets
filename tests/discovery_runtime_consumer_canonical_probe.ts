import assert from 'node:assert/strict';

import { SettingsService } from '../src/domain/settings/settingsService';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';
import { PersistenceService } from '../src/services/persistenceService';

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
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'btc_idr') {
      return { buy: [[91.8, 70], [91.7, 40]], sell: [[92, 65], [92.1, 35]] };
    }
    return { buy: [[149.4, 5], [149.3, 3]], sell: [[149.5, 5], [149.6, 3]] };
  }
}

async function scanPairs(watcher: MarketWatcher): Promise<string[]> {
  await watcher.batchSnapshot(4);
  return (await watcher.batchSnapshot(4)).map((snapshot) => snapshot.pair);
}

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const settings = new SettingsService(persistence);
  await settings.load();

  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => settings.get().scanner.discovery,
  );

  await settings.patchScanner({
    discovery: {
      majorPairMaxShare: 0,
      minDepthScore: 30,
    },
  });

  const strictPairs = await scanPairs(watcher);
  assert(!strictPairs.includes('btc_idr'), 'scanner.discovery.majorPairMaxShare=0 must block major pair at runtime');
  assert(!strictPairs.includes('anomaly_idr'), 'scanner.discovery.minDepthScore=30 must block thin anomaly depth at runtime');

  await settings.patchScanner({
    discovery: {
      majorPairMaxShare: 0.5,
      minDepthScore: 10,
    },
  });
  const relaxedPairs = await scanPairs(watcher);
  assert(relaxedPairs.includes('btc_idr'), 'runtime consumer must pick updated scanner.discovery majorPairMaxShare');
  assert(relaxedPairs.includes('anomaly_idr'), 'runtime consumer must pick updated scanner.discovery minDepthScore');

  console.log('PASS discovery_runtime_consumer_canonical_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_runtime_consumer_canonical_probe');
  console.error(error);
  process.exit(1);
});
