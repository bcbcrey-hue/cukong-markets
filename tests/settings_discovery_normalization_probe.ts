import assert from 'node:assert/strict';

import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import type { BotSettings } from '../src/core/types';

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const legacyDiscovery = {
    anomalySlots: 5,
    rotationSlots: 6,
    stealthSlots: 3,
    liquidLeaderSlots: 4,
    minVolumeIdr: 200_000_000,
    maxSpreadPct: 0.95,
    minDepthScore: 25,
    majorPairMaxShare: 0.35,
  };
  const legacySettings = { ...createDefaultSettings() } as Partial<BotSettings> & {
    discovery?: BotSettings['scanner']['discovery'];
  };
  legacySettings.discovery = legacyDiscovery;
  if (legacySettings.scanner) {
    const scannerLegacy = legacySettings.scanner as { discovery?: unknown };
    delete scannerLegacy.discovery;
  }

  await persistence.saveSettings(legacySettings as BotSettings);

  const settings = new SettingsService(persistence);
  const normalized = await settings.load();

  assert.deepEqual(
    normalized.scanner.discovery,
    legacyDiscovery,
    'Legacy top-level discovery must be normalized into scanner.discovery',
  );

  const persisted = await persistence.readSettings();
  assert.deepEqual(
    persisted.scanner.discovery,
    legacyDiscovery,
    'Normalized scanner.discovery must be persisted back to storage',
  );
  assert.equal('discovery' in persisted, false, 'Persisted settings must not keep legacy top-level discovery key');

  console.log('PASS settings_discovery_normalization_probe');
}

main().catch((error) => {
  console.error('FAIL settings_discovery_normalization_probe');
  console.error(error);
  process.exit(1);
});
