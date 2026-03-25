import assert from 'node:assert/strict';

import { SettingsService } from '../src/domain/settings/settingsService';
import { PersistenceService } from '../src/services/persistenceService';

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const settings = new SettingsService(persistence);
  await settings.load();

  const afterScannerPatch = await settings.patchScanner({
    discovery: {
      maxSpreadPct: 0.42,
      minDepthScore: 28,
    },
  });

  assert.equal(
    afterScannerPatch.scanner.discovery.maxSpreadPct,
    0.42,
    'patchScanner must update scanner.discovery.maxSpreadPct',
  );
  assert.equal(
    afterScannerPatch.scanner.discovery.minDepthScore,
    28,
    'patchScanner must update scanner.discovery.minDepthScore',
  );

  const afterDiscoveryPatch = await settings.patchDiscovery({
    majorPairMaxShare: 0.15,
  });

  assert.equal(
    afterDiscoveryPatch.scanner.discovery.majorPairMaxShare,
    0.15,
    'patchDiscovery compatibility wrapper must route to scanner.discovery.majorPairMaxShare',
  );

  const persisted = await persistence.readSettings();
  assert.equal(
    persisted.scanner.discovery.majorPairMaxShare,
    0.15,
    'persisted settings must keep canonical scanner.discovery values',
  );
  assert.equal(
    'discovery' in persisted,
    false,
    'persisted settings must not contain legacy top-level discovery key',
  );

  console.log('PASS discovery_scanner_settings_probe');
}

main().catch((error) => {
  console.error('FAIL discovery_scanner_settings_probe');
  console.error(error);
  process.exit(1);
});
