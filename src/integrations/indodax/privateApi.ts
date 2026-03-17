import crypto from 'node:crypto';

export interface IndodaxPrivateApiOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

export interface IndodaxPrivateEnvelope<T> {
  success: number;
  return?: T;
  error?: string;
  error_code?: string;
}

export interface IndodaxTradeReturn {
  order_id?: string | number;
  type?: 'buy' | 'sell';
  balance?: Record<string, string | number>;
  trades?: Array<Record<string, string | number>>;
  order_status?: {
    price?: string | number;
    max_volume?: string | number;
    volume?: string | number;
  };
}

export interface IndodaxGetOrderReturn {
  order?: Record<string, string | number>;
}

export interface IndodaxOpenOrdersReturn {
  orders?: Record<string, Array<Record<string, string | number>>>;
}

export interface IndodaxOrderHistoryReturn {
  orders?: Array<Record<string, string | number>>;
}

export interface IndodaxTradeHistoryReturn {
  trades?: Array<Record<string, string | number>>;
}

export interface IndodaxCancelOrderReturn {
  order_id?: string | number;
  client_order_id?: string;
  status?: string;
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
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha512', this.apiSecret).update(payload).digest('hex');
  }

  private async post<T>(
    method: string,
    params: Record<string, string | number> = {},
  ): Promise<IndodaxPrivateEnvelope<T>> {
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

    const payload = (await response.json()) as IndodaxPrivateEnvelope<T>;

    if (Number(payload.success) !== 1) {
      throw new Error(payload.error ?? `Private API ${method} failed`);
    }

    return payload;
  }

  getInfo<T>(): Promise<IndodaxPrivateEnvelope<T>> {
    return this.post<T>('getInfo');
  }

  trade(
    pair: string,
    type: 'buy' | 'sell',
    price: number,
    amount: number,
  ): Promise<IndodaxPrivateEnvelope<IndodaxTradeReturn>> {
    const amountField = type === 'buy' ? 'idr' : getSellAssetKey(pair);

    return this.post<IndodaxTradeReturn>('trade', {
      pair,
      type,
      price,
      [amountField]: amount,
    });
  }

  cancelOrder(
    pair: string,
    orderId: string | number,
    type: 'buy' | 'sell',
  ): Promise<IndodaxPrivateEnvelope<IndodaxCancelOrderReturn>> {
    return this.post<IndodaxCancelOrderReturn>('cancelOrder', {
      pair,
      order_id: orderId,
      type,
    });
  }

  openOrders(pair?: string): Promise<IndodaxPrivateEnvelope<IndodaxOpenOrdersReturn>> {
    return this.post<IndodaxOpenOrdersReturn>('openOrders', pair ? { pair } : {});
  }

  orderHistory(pair?: string): Promise<IndodaxPrivateEnvelope<IndodaxOrderHistoryReturn>> {
    return this.post<IndodaxOrderHistoryReturn>('orderHistory', pair ? { pair } : {});
  }

  tradeHistory(pair?: string): Promise<IndodaxPrivateEnvelope<IndodaxTradeHistoryReturn>> {
    return this.post<IndodaxTradeHistoryReturn>('tradeHistory', pair ? { pair } : {});
  }

  getOrder(
    pair: string,
    orderId: string | number,
  ): Promise<IndodaxPrivateEnvelope<IndodaxGetOrderReturn>> {
    return this.post<IndodaxGetOrderReturn>('getOrder', {
      pair,
      order_id: orderId,
    });
  }
}
