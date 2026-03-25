import assert from 'node:assert/strict';

import { PairUniverse } from '../src/domain/market/pairUniverse';
import { SettingsService } from '../src/domain/settings/settingsService';
import { createDefaultSettings } from '../src/services/persistenceService';
import { env } from '../src/config/env';
import type { BotSettings } from '../src/core/types';

class MemoryPersistence {
  constructor(private settings: BotSettings) {}

  async readSettings(): Promise<BotSettings> {
    return this.settings;
  }

  async saveSettings(settings: BotSettings): Promise<void> {
    this.settings = settings;
  }
}

async function main() {
  const defaults = createDefaultSettings();
  assert.equal(defaults.scanner.discovery.slots.anomaly, env.discoveryAnomalySlots);
  assert.equal(defaults.scanner.discovery.slots.rotation, env.discoveryRotationSlots);
  assert.equal(defaults.scanner.discovery.slots.stealth, env.discoveryStealthSlots);
  assert.equal(defaults.scanner.discovery.slots.liquidLeader, env.discoveryLiquidLeaderSlots);
  assert.equal(defaults.scanner.discovery.minVolumeIdr, env.discoveryMinVolumeIdr);
  assert.equal(defaults.scanner.discovery.maxSpreadPct, env.discoveryMaxSpreadPct);
  assert.equal(defaults.scanner.discovery.minDepthScore, env.discoveryMinDepthScore);
  assert.equal(defaults.scanner.discovery.majorPairMaxShare, env.discoveryMajorPairMaxShare);

  const legacySettings = {
    ...defaults,
    scanner: {
      ...defaults.scanner,
    },
  } as unknown as BotSettings;
  delete (legacySettings.scanner as { discovery?: unknown }).discovery;

  const memory = new MemoryPersistence(legacySettings);
  const settingsService = new SettingsService(memory as never);
  const normalized = await settingsService.load();
  assert.ok(normalized.scanner.discovery, 'Legacy settings must be normalized with discovery defaults');

  const patched = await settingsService.patchScanner({
    hotlistLimit: normalized.scanner.hotlistLimit + 1,
  });
  assert.deepEqual(
    patched.scanner.discovery,
    normalized.scanner.discovery,
    'patchScanner should keep discovery config when partial scanner patch omits discovery',
  );

  const universe = new PairUniverse();
  universe.updateFromTickers({
    lowfirst_idr: {
      name: 'lowfirst_idr',
      high: 15,
      low: 10,
      last: 11,
      buy: 10,
      sell: 12,
      vol_btc: 1,
      vol_idr: 10,
      server_time: 1,
    },
    highsecond_idr: {
      name: 'highsecond_idr',
      high: 30,
      low: 20,
      last: 25,
      buy: 24,
      sell: 26,
      vol_btc: 99,
      vol_idr: 999_999_999,
      server_time: 1,
    },
  });

  assert.deepEqual(
    universe.top(2),
    ['lowfirst_idr', 'highsecond_idr'],
    'PairUniverse order should remain raw listing order, not implicit volume ranking',
  );

  console.log('PASS discovery_contract_batch1_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_contract_batch1_probe');
  console.error(error);
  process.exit(1);
});
