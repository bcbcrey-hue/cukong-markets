import 'dotenv/config';
import { createApp } from './app';

async function main(): Promise<void> {
  const app = await createApp();
  await app.start();

  const shutdown = async (signal: NodeJS.Signals) => {
    try {
      await app.stop();
      process.exit(0);
    } catch (error) {
      console.error(`Failed to shutdown on ${signal}:`, error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.once('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
  });

  process.once('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });
}

void main().catch((error) => {
  console.error('Fatal bootstrap error:', error);
  process.exit(1);
});
