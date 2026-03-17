export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxDelayMs = options.maxDelayMs ?? options.baseDelayMs * 10;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryAllowed =
        attempt <= options.retries &&
        (options.shouldRetry?.(error, attempt) ?? true);

      if (!retryAllowed) {
        break;
      }

      const backoff = Math.min(maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(
        Math.random() * Math.max(25, Math.floor(backoff * 0.2)),
      );

      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }

  throw lastError;
}
