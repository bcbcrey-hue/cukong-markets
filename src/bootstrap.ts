import { mkdir } from 'node:fs/promises';
import 'dotenv/config';

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './core/logger';

async function ensureRuntimeDirs(): Promise<void> {
  await mkdir(env.dataDir, { recursive: true });
  await mkdir(env.accountsDir, { recursive: true });
  await mkdir(env.stateDir, { recursive: true });
  await mkdir(env.historyDir, { recursive: true });
  await mkdir(env.backtestDir, { recursive: true });
  await mkdir(env.logDir, { recursive: true });
}

async function main(): Promise<void> {
  await ensureRuntimeDirs();

  const app = await createApp();
  await app.start();
}

main().catch((error: unknown) => {
  logger.error({ error }, 'bootstrap failed');
  process.exit(1);
});
