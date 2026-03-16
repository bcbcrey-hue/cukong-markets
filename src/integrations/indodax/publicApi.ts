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
  constructor(private readonly baseUrl = 'https://indodax.com/api') {}

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    const response = await fetch(`${this.baseUrl}/tickers`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tickers: ${response.status}`);
    }

    const json = (await response.json()) as {
      tickers?: Record<string, Record<string, unknown>>;
    };

    const entries = json.tickers ?? {};
    const result: Record<string, IndodaxTickerEntry> = {};

    for (const [pair, value] of Object.entries(entries)) {
      result[pair] = mapTickerEntry(pair, value);
    }

    return result;
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    const response = await fetch(`${this.baseUrl}/${pair}/depth`);
    if (!response.ok) {
      throw new Error(`Failed to fetch depth for ${pair}: ${response.status}`);
    }

    const json = (await response.json()) as {
      buy?: Array<[string | number, string | number]>;
      sell?: Array<[string | number, string | number]>;
    };

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
