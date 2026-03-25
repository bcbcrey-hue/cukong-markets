import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { buildDiscoveryObservabilityNotes } from '../src/domain/market/discoveryObservability';
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
      wide_spread_idr: {
        name: 'wide_spread_idr', high: 130, low: 100, vol_btc: 2, vol_idr: 700_000_000, last: 110, buy: 100, sell: 110,
        server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (pair === 'btc_idr') {
      return { buy: [[91.8, 80], [91.7, 50]], sell: [[92, 85], [92.1, 45]] };
    }
    if (pair === 'anomaly_idr') {
      return { buy: [[149.4, 4], [149.3, 2]], sell: [[149.5, 4], [149.6, 2]] };
    }
    return { buy: [[100, 100]], sell: [[110, 100]] };
  }
}

async function main() {
  const discovery: DiscoverySettings = {
    anomalySlots: 2,
    rotationSlots: 1,
    stealthSlots: 1,
    liquidLeaderSlots: 2,
    minVolumeIdr: 150_000_000,
    maxSpreadPct: 1.2,
    minDepthScore: 20,
    majorPairMaxShare: 0.5,
  };

  const watcher = new MarketWatcher(
    new FakeIndodaxClient() as unknown as IndodaxClient,
    new PairUniverse(),
    () => discovery,
  );

  await watcher.batchSnapshot(4);
  await watcher.batchSnapshot(4);
  const notes = buildDiscoveryObservabilityNotes(watcher.getLastDiscoverySummary(), discovery);

  assert(notes.some((note) => note.startsWith('discoverySlots=')), 'health notes must include discoverySlots summary');
  assert(notes.some((note) => note.startsWith('discoveryPassedMajor=')), 'health notes must include major pair pass count');
  assert(notes.some((note) => note.startsWith('discoveryPassedAnomaly=')), 'health notes must include anomaly pass count');
  assert(notes.some((note) => note.startsWith('discoveryRejectedSpread=')), 'health notes must include spread rejection count');
  assert(notes.some((note) => note.startsWith('discoveryRejectedDepth=')), 'health notes must include depth rejection count');

  console.log('PASS discovery_health_observability_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_health_observability_probe');
  console.error(error);
  process.exit(1);
});
