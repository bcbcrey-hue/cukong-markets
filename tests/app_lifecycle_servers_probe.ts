import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { TelegramBot } from '../src/integrations/telegram/bot';

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const originalStart = TelegramBot.prototype.start;
  const originalStop = TelegramBot.prototype.stop;

  TelegramBot.prototype.start = async function patchedStart() {
    const signalHolder = this as unknown as {
      signal: {
        launched: boolean;
        running: boolean;
        connected: boolean;
        lastLaunchAt: string | null;
        lastLaunchSuccessAt: string | null;
        lastLaunchError: string | null;
      };
    };
    signalHolder.signal = {
      ...signalHolder.signal,
      launched: true,
      running: true,
      connected: true,
    };
    return;
  };
  TelegramBot.prototype.stop = async function patchedStop() {
    return;
  };

  const { createApp } = await import('../src/app');
  const app = await createApp();

  try {
    await app.start();

    const appPort = Number(process.env.APP_PORT);
    const callbackPort = Number(process.env.INDODAX_CALLBACK_PORT);

    const appHealthResponse = await fetch(`http://127.0.0.1:${appPort}/healthz`);
    assert.equal(appHealthResponse.status, 200, 'App server should respond after createApp().start()');

    const appHealth = (await appHealthResponse.json()) as {
      ok: boolean;
      executionMode: string;
      callback: { enabled: boolean; path: string; port: number };
      health: { executionMode: string };
    };
    assert.equal(appHealth.ok, true, 'App health response should be ok=true');
    assert.equal(appHealth.executionMode, 'SIMULATED', 'App health must expose execution mode at top level');
    assert.equal(appHealth.health.executionMode, 'SIMULATED', 'Nested health snapshot must expose execution mode');
    assert.equal(appHealth.callback.enabled, true, 'App health should reflect callback enabled env');
    assert.equal(
      appHealth.callback.path,
      process.env.INDODAX_CALLBACK_PATH,
      'App health should expose callback path from env',
    );
    assert.equal(
      appHealth.callback.port,
      callbackPort,
      'App health should expose callback port from env',
    );

    const callbackHealthResponse = await fetch(`http://127.0.0.1:${callbackPort}/healthz`);
    assert.equal(
      callbackHealthResponse.status,
      200,
      'Callback server should respond after createApp().start()',
    );

    const callbackHealth = (await callbackHealthResponse.json()) as {
      ok: boolean;
      enabled: boolean;
      callbackPath: string;
    };
    assert.equal(callbackHealth.ok, true, 'Callback health should be ok=true');
    assert.equal(callbackHealth.enabled, true, 'Callback health should reflect enabled env');
    assert.equal(
      callbackHealth.callbackPath,
      process.env.INDODAX_CALLBACK_PATH,
      'Callback health should reflect callback path from env',
    );

    await app.stopRuntimeFromControl();

    const stoppedHealthResponse = await fetch(`http://127.0.0.1:${appPort}/healthz`);
    assert.equal(
      stoppedHealthResponse.status,
      503,
      'App health must become not-ready immediately after runtimeControl.stop()',
    );
    const stoppedHealth = (await stoppedHealthResponse.json()) as {
      ok: boolean;
      ready: boolean;
      health: { runtimeStatus: string; scannerRunning: boolean; notes: string[] };
    };
    assert.equal(stoppedHealth.ok, false, 'Stopped runtime must expose ok=false');
    assert.equal(stoppedHealth.ready, false, 'Stopped runtime must expose ready=false');
    assert.equal(stoppedHealth.health.runtimeStatus, 'STOPPED', 'Stopped runtime must expose STOPPED status');
    assert.equal(stoppedHealth.health.scannerRunning, false, 'Stopped runtime must disable scanner readiness signal');
    assert.ok(
      stoppedHealth.health.notes.includes('runtime-control-stop'),
      'Stopped runtime must persist runtime-control stop marker in health notes',
    );

    const stoppedLivezResponse = await fetch(`http://127.0.0.1:${appPort}/livez`);
    assert.equal(stoppedLivezResponse.status, 503, 'Livez must report not-live while runtime status is STOPPED');

    await app.startRuntimeFromControl();

    const resumedHealthResponse = await fetch(`http://127.0.0.1:${appPort}/healthz`);
    assert.equal(
      resumedHealthResponse.status,
      200,
      'App health must return ready again after runtimeControl.start()',
    );
    const resumedHealth = (await resumedHealthResponse.json()) as {
      ok: boolean;
      ready: boolean;
      health: { runtimeStatus: string; scannerRunning: boolean; notes: string[] };
    };
    assert.equal(resumedHealth.ok, true, 'Resumed runtime must expose ok=true');
    assert.equal(resumedHealth.ready, true, 'Resumed runtime must expose ready=true');
    assert.equal(resumedHealth.health.runtimeStatus, 'RUNNING', 'Resumed runtime must expose RUNNING status');
    assert.equal(resumedHealth.health.scannerRunning, true, 'Resumed runtime must set scanner readiness signal true');
    assert.ok(
      resumedHealth.health.notes.includes('runtime-control-start'),
      'Resumed runtime must persist runtime-control start marker in health notes',
    );
  } finally {
    await app.stop();
    TelegramBot.prototype.start = originalStart;
    TelegramBot.prototype.stop = originalStop;
  }

  console.log('PASS app_lifecycle_servers_probe');
}

main().catch((error) => {
  console.error('FAIL app_lifecycle_servers_probe');
  console.error(error);
  process.exit(1);
});
