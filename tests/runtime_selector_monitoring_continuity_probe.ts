import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function main() {
  const appSource = await fs.readFile('src/app.ts', 'utf8');

  assert.match(appSource, /await executionEngine\.syncActiveOrders\(\);/, 'syncActiveOrders loop tidak boleh putus');
  assert.match(appSource, /await executionEngine\.evaluateOpenPositions\(\);/, 'evaluateOpenPositions loop tidak boleh putus');

  console.log('runtime_selector_monitoring_continuity_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
