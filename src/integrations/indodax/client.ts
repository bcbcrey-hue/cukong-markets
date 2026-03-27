import { env } from '../../config/env';
import type { StoredAccount } from '../../core/types';
import {
  PublicApi,
  type IndodaxOrderbook,
  type IndodaxRecentTrade,
  type IndodaxTickerEntry,
} from './publicApi';
import { PrivateApi } from './privateApi';

export class IndodaxClient {
  private readonly privateApiByAccount = new Map<string, PrivateApi>();

  constructor(
    private readonly publicApi = new PublicApi(
      env.indodaxPublicBaseUrl,
      env.indodaxTimeoutMs,
      env.indodaxPublicMinIntervalMs,
    ),
  ) {}

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return this.publicApi.getTickers();
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    return this.publicApi.safeGetDepth(pair);
  }

  async getRecentTrades(pair: string): Promise<IndodaxRecentTrade[] | null> {
    return this.publicApi.safeGetRecentTrades(pair);
  }

  forAccount(account: StoredAccount): PrivateApi {
    const cacheKey = `${account.id}:${account.apiKey}`;
    const existing = this.privateApiByAccount.get(cacheKey);
    if (existing) {
      return existing;
    }

    const client = new PrivateApi({
      baseUrl: env.indodaxPrivateBaseUrl,
      tradeApiV2BaseUrl: env.indodaxTradeApiV2BaseUrl,
      timeoutMs: env.indodaxTimeoutMs,
      minIntervalMs: env.indodaxPrivateMinIntervalMs,
      laneMinIntervalsMs: {
        liveTrading: env.indodaxPrivateLiveMinIntervalMs,
        reconciliation: env.indodaxPrivateReconcileMinIntervalMs,
        background: env.indodaxPrivateBackgroundMinIntervalMs,
      },
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
    this.privateApiByAccount.set(cacheKey, client);
    return client;
  }
}
