import { env } from '../../config/env';
import { HttpClient } from '../http/httpClient';

export interface IndodaxTickerResponseItem {
  high: string;
  low: string;
  vol\_btc?: string;
  vol\_idr?: string;
  last: string;
  buy: string;
  sell: string;
  server\_time?: number;
}

export type IndodaxTickerResponse = Record<string, IndodaxTickerResponseItem>;

export interface IndodaxDepthResponse {
  buy: \[string, string]\[];
  sell: \[string, string]\[];
}

export class IndodaxPublicApi {
  constructor(private readonly http = new HttpClient({ baseURL: env.INDODAX\_PUBLIC\_BASE\_URL, timeoutMs: env.HTTP\_TIMEOUT\_MS })) {}

  getTickers(): Promise<IndodaxTickerResponse> {
    return this.http.get<IndodaxTickerResponse>('/api/tickers');
  }

  getDepth(pair: string): Promise<IndodaxDepthResponse> {
    return this.http.get<IndodaxDepthResponse>(`/api/${pair}/depth`);
  }
}
