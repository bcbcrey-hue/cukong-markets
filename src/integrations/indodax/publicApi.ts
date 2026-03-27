import { logger } from '../../core/logger';
import { RequestPacer } from './requestPacer';

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

export interface IndodaxRecentTrade {
  tid: string;
  date: number;
  price: number;
  amount: number;
  type: 'buy' | 'sell' | 'unknown';
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

function normalizePair(pair: string): string {
  const normalized = pair.trim().toLowerCase().replace(/[\-/]/g, '_');
  if (normalized.includes('_')) {
    return normalized;
  }

  if (normalized.endsWith('idr') && normalized.length > 3) {
    return `${normalized.slice(0, -3)}_idr`;
  }

  return normalized;
}

function toPublicPairId(pair: string): string {
  return normalizePair(pair).replace(/_/g, '');
}

function normalizeTradeSide(value: unknown): IndodaxRecentTrade['type'] {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'buy' || normalized === 'sell') {
    return normalized;
  }

  return 'unknown';
}

export class PublicApi {
  private readonly pacer: RequestPacer;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
    private readonly minIntervalMs = 250,
  ) {
    this.pacer = new RequestPacer(
      {
        market_data_scan: {
          priority: 40,
          minIntervalMs: this.minIntervalMs,
        },
      },
      'indodax-public',
    );
  }

  private async requestJson<T>(url: string, label: string, attempt = 1): Promise<T> {
    let response: Response;

    try {
      response = await this.pacer.schedule(
        {
          lane: 'market_data_scan',
          label,
          requestPriority: 1,
          coalesceKey: label,
        },
        () =>
          fetch(url, {
            signal: AbortSignal.timeout(this.timeoutMs),
          }),
      );
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

  async getRecentTrades(pair: string): Promise<IndodaxRecentTrade[]> {
    const pairId = toPublicPairId(pair);
    const json = await this.requestJson<Array<Record<string, unknown>> | { trades?: Array<Record<string, unknown>> }>(
      `${this.baseUrl}/trades/${pairId}`,
      `trades:${pairId}`,
    );

    const items = Array.isArray(json) ? json : (json.trades ?? []);

    return items
      .map((raw) => ({
        tid: String(raw.tid ?? ''),
        date: toNumber(raw.date),
        price: toNumber(raw.price),
        amount: toNumber(raw.amount),
        type: normalizeTradeSide(raw.type),
      }))
      .filter((trade) => trade.price > 0 && trade.amount > 0 && trade.date > 0);
  }

  async safeGetRecentTrades(pair: string): Promise<IndodaxRecentTrade[] | null> {
    try {
      return await this.getRecentTrades(pair);
    } catch (error) {
      logger.warn({ pair, error }, 'failed to fetch recent trades');
      return null;
    }
  }
}
