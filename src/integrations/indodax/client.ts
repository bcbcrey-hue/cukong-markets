import type { StoredAccount } from '../../core/types';
import { PublicApi, type IndodaxOrderbook, type IndodaxTickerEntry } from './publicApi';
import { PrivateApi } from './privateApi';

export class IndodaxClient {
  constructor(private readonly publicApi = new PublicApi()) {}

  async getTickers(): Promise<Record<string, IndodaxTickerEntry>> {
    return this.publicApi.getTickers();
  }

  async getDepth(pair: string): Promise<IndodaxOrderbook> {
    return this.publicApi.safeGetDepth(pair);
  }

  forAccount(account: StoredAccount): PrivateApi {
    return new PrivateApi({
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    });
  }
}
