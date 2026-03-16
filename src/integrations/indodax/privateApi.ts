import crypto from 'node:crypto';
import { env } from '../../config/env';
import { HttpClient } from '../http/httpClient';

interface PrivateApiCredential {
  apiKey: string;
  apiSecret: string;
}

export interface IndodaxPrivateResponse<T> {
  success: 0 | 1;
  return?: T;
  error?: string;
}

export class IndodaxPrivateApi {
  constructor(private readonly http = new HttpClient({ baseURL: env.INDODAX\_PRIVATE\_BASE\_URL, timeoutMs: env.HTTP\_TIMEOUT\_MS })) {}

  private sign(secret: string, body: string): string {
    return crypto.createHmac('sha512', secret).update(body).digest('hex');
  }

  async call<T>(credential: PrivateApiCredential, method: string, params: Record<string, string | number> = {}): Promise<IndodaxPrivateResponse<T>> {
    const nonce = Date.now();
    const payload = new URLSearchParams({ method, nonce: String(nonce), ...Object.fromEntries(Object.entries(params).map((\[k, v]) => \[k, String(v)])) });
    const sign = this.sign(credential.apiSecret, payload.toString());

    return this.http.postForm<IndodaxPrivateResponse<T>>('/tapi', payload, {
      headers: {
        Key: credential.apiKey,
        Sign: sign,
      },
    });
  }
}
