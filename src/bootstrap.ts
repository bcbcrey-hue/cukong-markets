import { mkdir } from 'node:fs/promises';
import { env } from './config/env';
import { createApp } from './app';
import { logger } from './core/logger';

async function main(): Promise<void> {
  await mkdir(env.DATA\_DIR, { recursive: true });
  await mkdir(env.LOG\_DIR, { recursive: true });

  const app = await createApp();
  await app.start();
}

main().catch((error: unknown) => {
  logger.error({ error }, 'bootstrap failed');
  process.exit(1);
});
