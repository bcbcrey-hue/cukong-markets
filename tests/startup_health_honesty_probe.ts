import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { TelegramBot } from '../src/integrations/telegram/bot';
import { PersistenceService } from '../src/services/persistenceService';

async function waitForHealthz(port: number, timeoutMs: number): Promise<Response> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw new Error('timed out waiting for /healthz to become reachable');
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  await persistence.saveHealth({
    status: 'healthy',
    updatedAt: '2020-01-01T00:00:00.000Z',
    runtimeStatus: 'RUNNING',
    scannerRunning: true,
    telegramRunning: true,
    callbackServerRunning: true,
    tradingEnabled: true,
    executionMode: 'SIMULATED',
    activePairsTracked: 99,
    workers: [],
    notes: ['stale-health-snapshot'],
  });

  const originalStart = TelegramBot.prototype.start;
  const originalStop = TelegramBot.prototype.stop;

  let releaseStartup: () => void = () => {
    throw new Error('startup gate is not set');
  };
  let startupGateSet = false;
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
    await new Promise<void>((resolve) => {
      releaseStartup = resolve;
      startupGateSet = true;
    });
  };
  TelegramBot.prototype.stop = async function patchedStop() {
    return;
  };

  const { createApp } = await import('../src/app');
  const app = await createApp();
  const appPort = Number(process.env.APP_PORT);

  try {
    const startPromise = app.start();

    const startupHealthResponse = await waitForHealthz(appPort, 10_000);
    assert.equal(
      startupHealthResponse.status,
      503,
      'Startup /healthz must return 503 while runtime is still STARTING',
    );

    const startupHealth = (await startupHealthResponse.json()) as {
      ok: boolean;
      ready: boolean;
      health: {
        status: string;
        runtimeStatus: string;
        notes: string[];
      };
    };

    assert.equal(startupHealth.ok, false, 'Startup /healthz must not claim ok=true');
    assert.equal(startupHealth.ready, false, 'Startup /healthz must expose ready=false');
    assert.equal(startupHealth.health.runtimeStatus, 'STARTING', 'Startup runtime must be STARTING');
    assert.notEqual(startupHealth.health.status, 'healthy', 'Startup health status must not be healthy');
    assert.ok(
      startupHealth.health.notes.includes('startup'),
      'Startup health notes must include startup marker instead of stale snapshot notes',
    );

    const gateWaitStartedAt = Date.now();
    while (!startupGateSet && Date.now() - gateWaitStartedAt < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    assert.equal(startupGateSet, true, 'patched telegram startup gate must be set before releasing startup');
    releaseStartup();
    await startPromise;

    const runningHealthResponse = await fetch(`http://127.0.0.1:${appPort}/healthz`);
    assert.equal(runningHealthResponse.status, 200, 'Running /healthz must return 200 after startup completes');

    const runningHealth = (await runningHealthResponse.json()) as {
      ok: boolean;
      ready: boolean;
      health: { runtimeStatus: string };
    };
    assert.equal(runningHealth.ok, true, 'Running /healthz must return ok=true after startup completes');
    assert.equal(runningHealth.ready, true, 'Running /healthz must return ready=true after startup completes');
    assert.equal(runningHealth.health.runtimeStatus, 'RUNNING', 'Running runtime must be RUNNING');

    console.log('PASS startup_health_honesty_probe');
  } finally {
    await app.stop();
    TelegramBot.prototype.start = originalStart;
    TelegramBot.prototype.stop = originalStop;
  }
}

main().catch((error) => {
  console.error('FAIL startup_health_honesty_probe');
  console.error(error);
  process.exit(1);
});
