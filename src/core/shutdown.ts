export function registerShutdown(handlers: Array<() => Promise<void>>): void {
  let closing = false;

  const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) {
      return;
    }
    closing = true;

    try {
      for (const handler of handlers) {
        await handler();
      }
    } finally {
      process.exit(signal === 'SIGINT' ? 130 : 0);
    }
  };

  process.on('SIGINT', () => void onSignal('SIGINT'));
  process.on('SIGTERM', () => void onSignal('SIGTERM'));
}
