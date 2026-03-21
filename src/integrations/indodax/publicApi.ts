import { logger } from '../../core/logger';

export interface IndodaxTickerEntry {
  high: number;
  low: number;
  vol_btc: number;
  vol_idr: number;
  last: number;
  buy: number;
  sell: number;
  server_time: number;
  name: string;
}

export interface IndodaxOrderbook {
  buy: Array<[number, number]>;
  sell: Array<[number, number]>;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isRetriableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function shouldRetryTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    'abort',
    'timeout',
    'timed out',
    'network',
    'fetch failed',
    'socket hang up',
    'econnreset',
    'etimedout',
    'eai_again',
    'enotfound',
  ].some((marker) => message.includes(marker));
}

function mapTickerEntry(name: string, raw: Record<string, unknown>): IndodaxTickerEntry {
  return {
    name,
    high: toNumber(raw.high),
    low: toNumber(raw.low),
    vol_btc: toNumber(raw.vol_btc),
    vol_idr: toNumber(raw.vol_idr),
    last: toNumber(raw.last),
    buy: toNumber(raw.buy),
    sell: toNumber(raw.sell),
    server_time: toNumber(raw.server_time),
  };
}

export class PublicApi {
  private rateLimitQueue: Promise<void> = Promise.resolve();
  private nextAllowedAtMs = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
    private readonly minIntervalMs = 250,
  ) {}

  private async waitForRateLimitSlot(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      return;
    }

    const schedule = async (): Promise<void> => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedAtMs - now);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      this.nextAllowedAtMs = Date.now() + this.minIntervalMs;
    };

    const next = this.rateLimitQueue.then(schedule, schedule);
    this.rateLimitQueue = next.catch(() => undefined);
    await next;
  }

  private async requestJson<T>(url: string, label: string, attempt = 1): Promise<T> {
    let response: Response;

    await this.waitForRateLimitSlot();

    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (attempt < 2 && shouldRetryTransportError(error)) {
        logger.warn({ label, attempt, error }, 'retrying public api request after transport failure');
        return this.requestJson<T>(url, label, attempt + 1);
      }

      throw new Error(`Public API ${label} request failed`, {
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }

    if (!response.ok) {
      if (attempt < 2 && isRetriableStatus(response.status)) {
        logger.warn({ label, attempt, status: response.status }, 'retrying public api request after retriable status');
        return this.requestJson<T>(url, label, attempt + 1);
      }

      throw new Error(`Public API ${label} failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    const json = await this.requestJson<{
      tickers?: Record<string, Record<string, unknown>>;
    }>(`${this.baseUrl}/tickers`, 'tickers');

    const entries = json.tickers ?? {};
    const result: Record<string, IndodaxTickerEntry> = {};

    for (const [pair, value] of Object.entries(entries)) {
      result[pair] = mapTickerEntry(pair, value);
    }

    return result;
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    const json = await this.requestJson<{
      buy?: Array<[string | number, string | number]>;
      sell?: Array<[string | number, string | number]>;
    }>(`${this.baseUrl}/${pair}/depth`, `depth:${pair}`);

    return {
      buy: (json.buy ?? []).map(([price, amount]) => [toNumber(price), toNumber(amount)]),
      sell: (json.sell ?? []).map(([price, amount]) => [toNumber(price), toNumber(amount)]),
    };
  }

  async safeGetDepth(pair: string): Promise<IndodaxOrderbook> {
    try {
      return await this.getDepth(pair);
    } catch (error) {
      logger.warn({ pair, error }, 'failed to fetch orderbook depth');
      return { buy: [], sell: [] };
    }
  }
}
