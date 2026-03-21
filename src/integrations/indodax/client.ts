import { env } from '../../config/env';
import type { StoredAccount } from '../../core/types';
import { PublicApi, type IndodaxOrderbook, type IndodaxTickerEntry } from './publicApi';
import { PrivateApi } from './privateApi';

export class IndodaxClient {
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

  forAccount(account: StoredAccount): PrivateApi {
    return new PrivateApi({
      baseUrl: env.indodaxPrivateBaseUrl,
      tradeApiV2BaseUrl: env.indodaxTradeApiV2BaseUrl,
      timeoutMs: env.indodaxTimeoutMs,
      minIntervalMs: env.indodaxPrivateMinIntervalMs,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
  }
}
