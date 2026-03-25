import assert from 'node:assert/strict';

import type { DiscoverySettings } from '../src/core/types';
import { MarketWatcher } from '../src/domain/market/marketWatcher';
import { PairUniverse } from '../src/domain/market/pairUniverse';
import type { IndodaxClient } from '../src/integrations/indodax/client';
import type { IndodaxOrderbook, IndodaxTickerEntry } from '../src/integrations/indodax/publicApi';

class FakeIndodaxClient {
  private tickers: Record<string, IndodaxTickerEntry> = {};
  depthCalls: string[] = [];

  setTickers(next: Record<string, IndodaxTickerEntry>) {
    this.tickers = next;
  }

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return this.tickers;
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    this.depthCalls.push(pair);
    const isAnomaly = pair === 'alpha_idr';
    if (isAnomaly) {
      return {
        buy: [[114, 95], [113, 80], [112, 70]],
        sell: [[115, 70], [116, 50], [117, 40]],
      };
    }

    return {
      buy: [[100, 30], [99, 15], [98, 10]],
      sell: [[101, 38], [102, 18], [103, 12]],
    };
  }
}

function makeTicker(pair: string, options: {
  last: number;
  low: number;
  high: number;
  vol: number;
  buy?: number;
  sell?: number;
}): IndodaxTickerEntry {
  return {
    name: pair,
    high: options.high,
    low: options.low,
    vol_btc: Math.max(1, options.vol / 1_000_000_000),
    vol_idr: options.vol,
    last: options.last,
    buy: options.buy ?? options.last * 0.998,
    sell: options.sell ?? options.last * 1.002,
    server_time: Date.now(),
  };
}

function buildMarket(secondPass = false): Record<string, IndodaxTickerEntry> {
  const tickers: Record<string, IndodaxTickerEntry> = {
    btc_idr: makeTicker('btc_idr', { last: 1_000_000_000, low: 900_000_000, high: 1_010_000_000, vol: 9_000_000_000 }),
    eth_idr: makeTicker('eth_idr', { last: 60_000_000, low: 55_000_000, high: 61_000_000, vol: 7_000_000_000 }),
    sol_idr: makeTicker('sol_idr', { last: 3_000_000, low: 2_850_000, high: 3_050_000, vol: 4_000_000_000 }),
    alpha_idr: makeTicker('alpha_idr', {
      last: secondPass ? 115 : 100,
      low: 90,
      high: 116,
      vol: secondPass ? 2_400_000_000 : 1_200_000_000,
      buy: secondPass ? 114 : 99.8,
      sell: secondPass ? 115 : 100.2,
    }),
  };

  for (let index = 0; index < 12; index += 1) {
    const pair = `micro${index}_idr`;
    tickers[pair] = makeTicker(pair, {
      last: 50 + index,
      low: 45 + index,
      high: 62 + index,
      vol: 800_000_000 - (index * 10_000_000),
    });
  }

  return tickers;
}

async function main() {
  const discoverySettings: DiscoverySettings = {
    slots: {
      anomaly: 2,
      rotation: 1,
      stealth: 1,
      liquidLeader: 1,
    },
    minVolumeIdr: 100_000,
    maxSpreadPct: 1.5,
    minDepthScore: 20,
    majorPairMaxShare: 0.4,
  };

  const indodax = new FakeIndodaxClient();
  const watcher = new MarketWatcher(
    indodax as unknown as IndodaxClient,
    new PairUniverse(),
    () => discoverySettings,
  );

  indodax.setTickers(buildMarket(false));
  await watcher.batchSnapshot(12);

  indodax.depthCalls = [];
  indodax.setTickers(buildMarket(true));
  const snapshots = await watcher.batchSnapshot(12);
  const pairs = snapshots.map((item) => item.pair);

  assert.ok(pairs.includes('alpha_idr'), 'Anomaly candidate should be selected on second pass');
  assert.ok(
    indodax.depthCalls.length < Object.keys(buildMarket(true)).length,
    'Depth fetch should run on shortlist only, not all market pairs',
  );
  assert.ok(
    snapshots.length <= 5,
    'Selected snapshot count should follow discovery bucket slot plan',
  );

  console.log('PASS discovery_anomaly_priority_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_anomaly_priority_probe');
  console.error(error);
  process.exit(1);
});
