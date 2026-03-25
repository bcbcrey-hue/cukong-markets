import assert from 'node:assert/strict';

import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import type { BotSettings } from '../src/core/types';

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const legacySettings = { ...createDefaultSettings() } as Partial<BotSettings>;
  delete legacySettings.discovery;

  await persistence.saveSettings(legacySettings as BotSettings);

  const settings = new SettingsService(persistence);
  const normalized = await settings.load();
  const defaults = createDefaultSettings();

  assert.deepEqual(
    normalized.discovery,
    defaults.discovery,
    'Legacy settings without discovery must be normalized with default discovery settings',
  );

  const persisted = await persistence.readSettings();
  assert.deepEqual(
    persisted.discovery,
    defaults.discovery,
    'Normalized discovery settings must be persisted back to storage',
  );

  console.log('PASS settings_discovery_normalization_probe');
}

main().catch((error) => {
  console.error('FAIL settings_discovery_normalization_probe');
  console.error(error);
  process.exit(1);
});
