import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { isMajorPair } from '../src/domain/market/majorPairContract';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  private calls = 0;

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    this.calls += 1;
    if (this.calls <= 8) {
      return {
        btc_idr: {
          name: 'btc_idr', high: 1_050_000_000, low: 950_000_000, vol_btc: 120, vol_idr: 60_000_000_000,
          last: 1_000_000_000, buy: 999_000_000, sell: 1_000_000_000, server_time: Date.now(),
        },
        eth_idr: {
          name: 'eth_idr', high: 52_000_000, low: 47_000_000, vol_btc: 70, vol_idr: 18_000_000_000,
          last: 50_000_000, buy: 49_950_000, sell: 50_000_000, server_time: Date.now(),
        },
        usdt_idr: {
          name: 'usdt_idr', high: 16_600, low: 16_300, vol_btc: 35, vol_idr: 12_000_000_000,
          last: 16_500, buy: 16_490, sell: 16_500, server_time: Date.now(),
        },
        anomaly_idr: {
          name: 'anomaly_idr', high: 130, low: 90, vol_btc: 2, vol_idr: 600_000_000,
          last: 100, buy: 99.8, sell: 100, server_time: Date.now(),
        },
        beta_idr: {
          name: 'beta_idr', high: 125, low: 95, vol_btc: 1, vol_idr: 450_000_000,
          last: 103, buy: 102.9, sell: 103, server_time: Date.now(),
        },
      };
    }

    return {
      btc_idr: {
        name: 'btc_idr', high: 1_080_000_000, low: 950_000_000, vol_btc: 140, vol_idr: 62_000_000_000,
        last: 1_040_000_000, buy: 1_039_500_000, sell: 1_040_000_000, server_time: Date.now(),
      },
      eth_idr: {
        name: 'eth_idr', high: 52_000_000, low: 47_000_000, vol_btc: 72, vol_idr: 18_300_000_000,
        last: 50_600_000, buy: 50_550_000, sell: 50_600_000, server_time: Date.now(),
      },
      usdt_idr: {
        name: 'usdt_idr', high: 16_620, low: 16_300, vol_btc: 38, vol_idr: 12_500_000_000,
        last: 16_560, buy: 16_550, sell: 16_560, server_time: Date.now(),
      },
      anomaly_idr: {
        name: 'anomaly_idr', high: 220, low: 90, vol_btc: 6, vol_idr: 2_400_000_000,
        last: 185, buy: 184.5, sell: 185, server_time: Date.now(),
      },
      beta_idr: {
        name: 'beta_idr', high: 125, low: 95, vol_btc: 1.2, vol_idr: 500_000_000,
        last: 104, buy: 103.9, sell: 104, server_time: Date.now(),
      },
    };
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    if (isMajorPair(pair)) {
      return { buy: [[1_039_500_000, 500], [1_039_000_000, 300]], sell: [[1_040_000_000, 520], [1_040_500_000, 250]] };
    }

    if (pair === 'anomaly_idr') {
      return { buy: [[184.5, 220], [184.2, 140]], sell: [[185, 230], [185.3, 120]] };
    }

    return { buy: [[103.9, 80], [103.8, 50]], sell: [[104, 85], [104.1, 45]] };
  }
}

async function main(): Promise<void> {
  const settings: DiscoverySettings = {
    anomalySlots: 1,
    rotationSlots: 0,
    stealthSlots: 0,
    liquidLeaderSlots: 3,
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

  const originalNow = Date.now;
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;

  let selected: Awaited<ReturnType<MarketWatcher['batchSnapshot']>> = [];
  try {
    for (let index = 0; index < 8; index += 1) {
      await watcher.batchSnapshot(1);
      fakeNow += 60_000;
    }
    selected = await watcher.batchSnapshot(1);
  } finally {
    Date.now = originalNow;
  }

  const pairs = selected.map((item) => item.pair);

  assert.equal(selected.length, 1, 'limit=1 must force direct competition between anomaly and major candidates');
  assert.deepEqual(
    pairs,
    ['anomaly_idr'],
    'runtime discovery must prioritize valid anomaly candidate over larger-volume major pairs when anomaly slot is available',
  );

  console.log('PASS discovery_anomaly_priority_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_anomaly_priority_probe');
  console.error(error);
  process.exit(1);
});
