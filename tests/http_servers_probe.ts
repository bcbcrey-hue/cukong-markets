import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import { IndodaxCallbackServer } from '../src/integrations/indodax/callbackServer';
import { AppServer } from '../src/server/appServer';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';
import { StateService } from '../src/services/stateService';
import { HealthService } from '../src/services/healthService';

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  const health = new HealthService(persistence, state);
  const journal = new JournalService(persistence);

  await Promise.all([state.load(), health.load(), journal.load()]);
  await state.setStatus('RUNNING');
  await health.build({
    scannerRunning: true,
    telegramRunning: false,
    callbackServerRunning: true,
    tradingEnabled: true,
    executionMode: 'SIMULATED',
    positions: [],
    orders: [],
    notes: ['probe=telegram-required-for-readiness'],
  });

  const appServer = new AppServer(health);
  const callbackServer = new IndodaxCallbackServer(persistence, journal);

  try {
    await appServer.start();
    await callbackServer.start();

    const degradedHealthResponse = await fetch(`http://127.0.0.1:${appServer.getPort()}/healthz`);
    assert.equal(
      degradedHealthResponse.status,
      503,
      'App server /healthz must respond 503 when runtime RUNNING but telegram dependency is down',
    );
    const degradedHealth = (await degradedHealthResponse.json()) as {
      ok: boolean;
      ready: boolean;
      health: { status: string; telegramRunning: boolean };
    };
    assert.equal(degradedHealth.ok, false, 'Degraded readiness response must expose ok=false');
    assert.equal(degradedHealth.ready, false, 'Degraded readiness response must expose ready=false');
    assert.equal(
      degradedHealth.health.status,
      'degraded',
      'Health snapshot status must remain degraded until dependencies are fully ready',
    );
    assert.equal(
      degradedHealth.health.telegramRunning,
      false,
      'Health snapshot must reflect telegram dependency down',
    );

    await health.build({
      scannerRunning: true,
      telegramRunning: true,
      callbackServerRunning: true,
      tradingEnabled: true,
      executionMode: 'SIMULATED',
      positions: [],
      orders: [],
      notes: ['probe=ready-after-telegram-up'],
    });

    const appHealthResponse = await fetch(`http://127.0.0.1:${appServer.getPort()}/healthz`);
    assert.equal(appHealthResponse.status, 200, 'App server /healthz must respond 200 when all readiness deps are up');
    const appHealth = (await appHealthResponse.json()) as {
      callback: { path: string; port: number; allowedHost: string | null };
      health: { status: string; callbackServerRunning: boolean };
    };
    assert.equal(appHealth.callback.path, process.env.INDODAX_CALLBACK_PATH, 'App server must expose callback path from env');
    assert.equal(appHealth.health.status, 'healthy', 'Health snapshot must become healthy after dependencies are ready');
    assert.equal(appHealth.health.callbackServerRunning, true, 'Health snapshot must expose callback dependency state');

    const callbackHealthResponse = await fetch(`http://127.0.0.1:${callbackServer.getPort()}/healthz`);
    assert.equal(callbackHealthResponse.status, 200, 'Callback server /healthz must respond 200');
    const callbackHealth = (await callbackHealthResponse.json()) as { callbackPath: string; enabled: boolean };
    assert.equal(callbackHealth.callbackPath, process.env.INDODAX_CALLBACK_PATH, 'Callback health must reflect env path');
    assert.equal(callbackHealth.enabled, true, 'Callback health must reflect enabled env');

    const callbackOkResponse = await fetch(
      `http://127.0.0.1:${callbackServer.getPort()}${process.env.INDODAX_CALLBACK_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': process.env.INDODAX_CALLBACK_ALLOWED_HOST ?? '',
        },
        body: JSON.stringify({ event: 'withdraw_update', status: 'ok' }),
      },
    );
    assert.equal(await callbackOkResponse.text(), 'ok', 'Callback server must reply ok for accepted callback');

    const callbackFailResponse = await fetch(
      `http://127.0.0.1:${callbackServer.getPort()}${process.env.INDODAX_CALLBACK_PATH}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-host': 'evil.example.com',
        },
        body: JSON.stringify({ event: 'withdraw_update', status: 'ok' }),
      },
    );
    assert.equal(callbackFailResponse.status, 403, 'Callback server must reject host not in env allow-list');
    assert.equal(await callbackFailResponse.text(), 'fail', 'Rejected callback must reply fail');

    const spoofedForwardedHostResult = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: callbackServer.getPort(),
          path: process.env.INDODAX_CALLBACK_PATH,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            host: process.env.INDODAX_CALLBACK_ALLOWED_HOST ?? '',
            'x-forwarded-host': 'evil.example.com',
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      request.on('error', reject);
      request.write(JSON.stringify({ event: 'withdraw_update', status: 'ok', trace: 'spoof-check' }));
      request.end();
    });
    assert.equal(spoofedForwardedHostResult.statusCode, 200, 'Direct allowed host must win over spoofed forwarded host');
    assert.equal(spoofedForwardedHostResult.body, 'ok', 'Spoofed forwarded host must not force rejection when direct host is allowed');

    const callbackEvents = await persistence.readIndodaxCallbackEvents();
    const callbackState = await persistence.readIndodaxCallbackState();

    assert.equal(callbackEvents.length, 3, 'Callback events must be persisted to JSONL');
    assert.equal(callbackEvents[0]?.path, process.env.INDODAX_CALLBACK_PATH, 'Callback event path must come from env');
    assert.equal(callbackState.acceptedCount, 2, 'Accepted callbacks must be counted in persisted state');
    assert.equal(callbackState.rejectedCount, 1, 'Rejected callbacks must be counted in persisted state');
    assert.ok(callbackState.lastReceivedAt, 'Callback state must persist last received timestamp');

    console.log('PASS http_servers_probe');
  } finally {
    await callbackServer.stop();
    await appServer.stop();
  }
}

main().catch((error) => {
  console.error('FAIL http_servers_probe');
  console.error(error);
  process.exit(1);
});
