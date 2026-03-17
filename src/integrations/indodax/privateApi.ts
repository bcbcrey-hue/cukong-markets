import crypto from 'node:crypto';

export interface IndodaxPrivateApiOptions {
  baseUrl?: string;
  apiKey: string;
  apiSecret: string;
}

function getSellAssetKey(pair: string): string {
  const [baseAsset] = pair.toLowerCase().split('_');
  return baseAsset || 'amount';
}

export class PrivateApi {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(options: IndodaxPrivateApiOptions) {
    this.baseUrl = options.baseUrl ?? 'https://indodax.com/tapi';
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha512', this.apiSecret).update(payload).digest('hex');
  }

  private async post<T>(method: string, params: Record<string, string | number> = {}): Promise<T> {
    const nonce = Date.now();
    const body = new URLSearchParams({
      method,
      nonce: String(nonce),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Key: this.apiKey,
        Sign: this.sign(body.toString()),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Private API ${method} failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  getInfo<T>(): Promise<T> {
    return this.post<T>('getInfo');
  }

  trade<T>(pair: string, type: 'buy' | 'sell', price: number, amount: number): Promise<T> {
    const amountField = type === 'buy' ? 'idr' : getSellAssetKey(pair);

    return this.post<T>('trade', {
      pair,
      type,
      price,
      [amountField]: amount,
    });
  }

  cancelOrder<T>(pair: string, orderId: string | number, type: 'buy' | 'sell'): Promise<T> {
    return this.post<T>('cancelOrder', {
      pair,
      order_id: orderId,
      type,
    });
  }

  openOrders<T>(pair?: string): Promise<T> {
    return this.post<T>('openOrders', pair ? { pair } : {});
  }

  orderHistory<T>(pair?: string): Promise<T> {
    return this.post<T>('orderHistory', pair ? { pair } : {});
  }
}
