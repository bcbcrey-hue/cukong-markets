import crypto from 'node:crypto';
import { toError } from '../../core/error-utils';
import { createChildLogger } from '../../core/logger';
import { RequestPacer } from './requestPacer';

export interface IndodaxPrivateApiOptions {
  baseUrl: string;
  tradeApiV2BaseUrl?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
  laneMinIntervalsMs?: {
    liveTrading?: number;
    reconciliation?: number;
    background?: number;
  };
  apiKey: string;
  apiSecret: string;
}

export type IndodaxPrivateRequestLane =
  | 'private_live_trading'
  | 'private_reconciliation'
  | 'background_recovery';

export interface IndodaxPrivateRequestOptions {
  lane?: IndodaxPrivateRequestLane;
  requestPriority?: number;
  coalesceKey?: string;
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
  trades?:
    | Array<Record<string, string | number>>
    | Record<string, Array<Record<string, string | number>>>;
}

export interface IndodaxHistoryQueryOptions {
  pair?: string;
  limit?: number;
  orderId?: string | number;
  startTime?: number;
  endTime?: number;
  sort?: 'asc' | 'desc';
}

export interface IndodaxCancelOrderReturn {
  order_id?: string | number;
  client_order_id?: string;
  status?: string;
}

const log = createChildLogger({ module: 'indodax-private-api' });

function getSellAssetKey(pair: string): string {
  const [baseAsset] = pair.toLowerCase().split('_');
  return baseAsset || 'amount';
}

function normalizePair(pair?: string): string | undefined {
  if (!pair) {
    return undefined;
  }

  const normalized = pair.trim().toLowerCase().replace(/[\-/]/g, '_');
  if (normalized.includes('_')) {
    return normalized;
  }

  if (normalized.endsWith('idr') && normalized.length > 3) {
    return `${normalized.slice(0, -3)}_idr`;
  }

  return normalized;
}

function toTradeApiV2Symbol(pair?: string): string | undefined {
  return normalizePair(pair)?.replace(/_/g, '');
}

function normalizeOrderSide(value: unknown, fallback?: 'buy' | 'sell'): 'buy' | 'sell' | '' {
  if (typeof value === 'boolean') {
    return value ? 'buy' : 'sell';
  }

  if (typeof value !== 'string') {
    return fallback ?? '';
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'buy' || normalized === 'sell') {
    return normalized;
  }

  return fallback ?? '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

function collectItems(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => asRecord(item)).filter(Boolean) as Array<Record<string, unknown>>;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => asRecord(item)).filter(Boolean) as Array<Record<string, unknown>>;
    }

    const nestedRecord = asRecord(value);
    if (nestedRecord) {
      const nested = collectItems(nestedRecord, keys);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function stringifyHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function assertWindowWithinSevenDays(
  method: 'orderHistoriesV2' | 'myTradesV2',
  startTime?: number,
  endTime?: number,
): void {
  if (
    startTime !== undefined &&
    endTime !== undefined &&
    Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    Math.abs(endTime - startTime) > 7 * 24 * 60 * 60 * 1000
  ) {
    throw new Error(`${method} only supports a maximum time range of 7 days per request`);
  }
}

function normalizeHistoryLimit(limit: number | undefined, fallback: number): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  const normalized = Math.max(10, Math.min(1000, Math.trunc(limit)));
  return Number.isFinite(normalized) ? normalized : fallback;
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

export class PrivateApi {
  private readonly baseUrl: string;
  private readonly tradeApiV2BaseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly minIntervalMs: number;
  private readonly pacer: RequestPacer;

  constructor(options: IndodaxPrivateApiOptions) {
    this.baseUrl = options.baseUrl;
    this.tradeApiV2BaseUrl = options.tradeApiV2BaseUrl ?? 'https://tapi.indodax.com';
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.minIntervalMs = options.minIntervalMs ?? 300;
    const laneIntervals = options.laneMinIntervalsMs ?? {};
    this.pacer = new RequestPacer(
      {
        private_live_trading: {
          priority: 100,
          minIntervalMs: laneIntervals.liveTrading ?? this.minIntervalMs,
        },
        private_reconciliation: {
          priority: 70,
          minIntervalMs: laneIntervals.reconciliation ?? this.minIntervalMs,
        },
        background_recovery: {
          priority: 30,
          minIntervalMs: laneIntervals.background ?? this.minIntervalMs + 150,
          maxQueueDepth: 150,
        },
      },
      `indodax-private:${this.apiKey.slice(0, 6)}`,
    );
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha512', this.apiSecret).update(payload).digest('hex');
  }

  private assertSuccess(method: string, payload: unknown): void {
    const record = asRecord(payload);
    if (!record) {
      return;
    }

    if (record.success !== undefined && Number(record.success) !== 1) {
      throw new Error(String(record.error ?? `Private API ${method} failed`));
    }

    if (record.error) {
      throw new Error(String(record.error));
    }
  }
  private async executeWithPacing<T>(
    lane: IndodaxPrivateRequestLane,
    label: string,
    run: () => Promise<T>,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<T> {
    return this.pacer.schedule(
      {
        lane: options?.lane ?? lane,
        label,
        requestPriority: options?.requestPriority,
        coalesceKey: options?.coalesceKey,
      },
      run,
    );
  }

  private async post<T>(
    method: string,
    params: Record<string, string | number> = {},
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<T>> {
    const nonce = Date.now();
    const body = new URLSearchParams({
      method,
      nonce: String(nonce),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });

    let response: Response;

    try {
      response = await this.executeWithPacing(
        options?.lane ?? 'private_reconciliation',
        `post:${method}`,
        () =>
          fetch(this.baseUrl, {
            method: 'POST',
            headers: {
              Key: this.apiKey,
              Sign: this.sign(body.toString()),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(this.timeoutMs),
          }),
        options,
      );
    } catch (error) {
      throw new Error(`Private API ${method} request failed`, {
        cause: toError(error),
      });
    }

    if (!response.ok) {
      throw new Error(`Private API ${method} failed: ${response.status}`);
    }

    const payload = (await response.json()) as IndodaxPrivateEnvelope<T>;

    if (Number(payload.success) !== 1) {
      throw new Error(payload.error ?? `Private API ${method} failed`);
    }

    return payload;
  }

  private async getV2<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    attempt = 1,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<T> {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => [key, String(value)]),
    );

    if (!query.has('timestamp') && !query.has('nonce')) {
      query.set('timestamp', String(Date.now()));
    }
    if (query.has('timestamp') && !query.has('recvWindow')) {
      query.set('recvWindow', '5000');
    }

    const requestUrl = new URL(path, this.tradeApiV2BaseUrl);
    requestUrl.search = query.toString();

    let response: Response;

    try {
      response = await this.executeWithPacing(
        options?.lane ?? 'private_reconciliation',
        `get:${requestUrl.pathname}`,
        () =>
          fetch(requestUrl, {
            method: 'GET',
            headers: {
              'X-APIKEY': this.apiKey,
              Sign: this.sign(query.toString()),
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(this.timeoutMs),
          }),
        options,
      );
    } catch (error) {
      if (attempt < 2 && shouldRetryTransportError(error)) {
        log.warn({ path: requestUrl.pathname, attempt, error }, 'retrying private api v2 get after transport failure');
        return this.getV2<T>(path, params, attempt + 1, options);
      }

      throw new Error(`Private API GET ${requestUrl.pathname} request failed`, {
        cause: toError(error),
      });
    }

    if (!response.ok) {
      if (attempt < 2 && isRetriableStatus(response.status)) {
        log.warn({ path: requestUrl.pathname, attempt, status: response.status }, 'retrying private api v2 get after retriable status');
        return this.getV2<T>(path, params, attempt + 1, options);
      }

      const errorPayload = await response
        .json()
        .catch(async () => ({ error: await response.text().catch(() => '') }));
      const errorRecord = asRecord(errorPayload);
      throw new Error(
        String(
          errorRecord?.error ??
            errorRecord?.message ??
            `Private API GET ${requestUrl.pathname} failed: ${response.status}`,
        ),
      );
    }

    const payload = (await response.json()) as T;
    this.assertSuccess(requestUrl.pathname, payload);
    return payload;
  }

  private normalizeV2OrderHistoryItem(
    item: Record<string, unknown>,
    pair?: string,
  ): Record<string, string | number> | null {
    const normalizedPair = normalizePair(
      pair ?? String(readValue(item, ['symbol', 'pair', 'market', 'trade_pair']) ?? ''),
    );
    const asset = getSellAssetKey(normalizedPair ?? 'amount_idr');
    const originalQuantity = readValue(item, ['oriQty', `order_${asset}`, asset, 'amount', 'quantity', 'qty', 'volume']);
    const filled = readValue(item, ['executedQty', 'filled_qty', 'filled_quantity', 'executed_qty']);
    const remaining = readValue(item, ['remaining_qty', 'remain_qty', 'remaining', 'leaves_qty', 'remain']);
    const quantity =
      originalQuantity ??
      ((Number(filled ?? 0) || Number(remaining ?? 0)) > 0
        ? (Number(filled ?? 0) + Number(remaining ?? 0))
        : undefined);
    const computedRemaining =
      remaining ??
      (quantity !== undefined && filled !== undefined
        ? typeof quantity === 'string' || typeof filled === 'string'
          ? String(Math.max(0, Number(quantity) - Number(filled)))
          : Math.max(0, Number(quantity) - Number(filled))
        : 0);
    const orderId = readValue(item, ['orderId', 'order_id', 'id']);

    if (orderId === undefined || orderId === null) {
      return null;
    }

    return {
      order_id: String(orderId),
      client_order_id: String(readValue(item, ['clientOrderId', 'client_order_id', 'clientId']) ?? ''),
      pair: normalizedPair ?? pair ?? '',
      type: normalizeOrderSide(readValue(item, ['type', 'side'])),
      price: readValue(item, ['price', 'order_price', 'avg_price', 'average_price']) as string | number,
      [`order_${asset}`]: quantity as string | number,
      [`remain_${asset}`]: computedRemaining as string | number,
      status: String(
        readValue(item, ['status', 'order_status', 'state']) ??
          (Number(computedRemaining ?? 0) <= 0 ? 'filled' : 'open'),
      ),
      submit_time: readValue(item, ['submitTime', 'submit_time', 'created_at', 'createdAt', 'timestamp', 'time']) as
        | string
        | number,
      finish_time: readValue(item, ['finishTime', 'finish_time', 'updated_at', 'updatedAt', 'closed_at', 'closedAt']) as
        | string
        | number,
    };
  }

  private normalizeV2TradeItem(
    item: Record<string, unknown>,
    pair?: string,
  ): Record<string, string | number> | null {
    const normalizedPair = normalizePair(
      pair ?? String(readValue(item, ['symbol', 'pair', 'market', 'trade_pair']) ?? ''),
    );
    const asset = getSellAssetKey(normalizedPair ?? 'amount_idr');
    const orderId = readValue(item, ['orderId', 'order_id']);

    if (orderId === undefined || orderId === null) {
      return null;
    }

    const feeAsset = String(
      readValue(item, ['commissionAsset', 'commission_asset', 'fee_asset', 'feeAsset']) ??
        (normalizedPair?.split('_')[1] ?? 'idr'),
    ).toLowerCase();
    const normalizedSide = normalizeOrderSide(
      readValue(item, ['type', 'side']),
      normalizeOrderSide(readValue(item, ['isBuyer'])) || undefined,
    );
    const quantity = readValue(item, ['qty', 'quantity', asset, 'amount', 'executed_qty']) ?? 0;

    return {
      trade_id: String(readValue(item, ['tradeId', 'trade_id', 'id']) ?? ''),
      order_id: String(orderId),
      client_order_id: String(readValue(item, ['clientOrderId', 'client_order_id', 'clientId']) ?? ''),
      pair: normalizedPair ?? pair ?? '',
      type: normalizedSide,
      price: readValue(item, ['price', 'avg_price', 'average_price']) as string | number,
      [asset]: quantity as
        | string
        | number,
      quote_qty: (readValue(item, ['quoteQty', 'quote_qty']) ?? 0) as string | number,
      [`fee_${feeAsset}`]: (readValue(item, [`fee_${feeAsset}`, 'commission', 'fee']) ?? 0) as
        | string
        | number,
      timestamp: readValue(item, ['time', 'timestamp', 'created_at', 'createdAt', 'executed_at']) as
        | string
        | number,
    };
  }

  getInfo<T>(options?: IndodaxPrivateRequestOptions): Promise<IndodaxPrivateEnvelope<T>> {
    return this.post<T>('getInfo', {}, options);
  }

  trade(
    pair: string,
    type: 'buy' | 'sell',
    price: number,
    amount: number,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxTradeReturn>> {
    const amountField = type === 'buy' ? 'idr' : getSellAssetKey(pair);

    return this.post<IndodaxTradeReturn>(
      'trade',
      {
        pair,
        type,
        price,
        [amountField]: amount,
      },
      { lane: 'private_live_trading', requestPriority: 5, ...options },
    );
  }

  cancelOrder(
    pair: string,
    orderId: string | number,
    type: 'buy' | 'sell',
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxCancelOrderReturn>> {
    return this.post<IndodaxCancelOrderReturn>(
      'cancelOrder',
      {
        pair,
        order_id: orderId,
        type,
      },
      { lane: 'private_live_trading', requestPriority: 6, ...options },
    );
  }

  openOrders(
    pair?: string,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxOpenOrdersReturn>> {
    return this.post<IndodaxOpenOrdersReturn>('openOrders', pair ? { pair } : {}, {
      lane: 'private_reconciliation',
      requestPriority: 2,
      coalesceKey: options?.coalesceKey ?? `openOrders:${pair ?? 'all'}`,
      ...options,
    });
  }

  orderHistory(
    pair?: string,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxOrderHistoryReturn>> {
    return this.post<IndodaxOrderHistoryReturn>('orderHistory', pair ? { pair } : {}, options);
  }

  async orderHistoriesV2(
    options: IndodaxHistoryQueryOptions = {},
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxOrderHistoryReturn>> {
    const symbol = toTradeApiV2Symbol(options.pair);
    if (!symbol) {
      throw new Error('pair is required for orderHistoriesV2');
    }

    assertWindowWithinSevenDays('orderHistoriesV2', options.startTime, options.endTime);

    const payload = await this.getV2<unknown>(
      '/api/v2/order/histories',
      {
        symbol,
        startTime: options.startTime,
        endTime: options.endTime,
        limit: normalizeHistoryLimit(options.limit, 100),
        sort: options.sort,
      },
      1,
      requestOptions,
    );

    const items = collectItems(payload, ['data', 'results', 'items', 'orders', 'histories']);
    return {
      success: 1,
      return: {
        orders: items
          .map((item) => this.normalizeV2OrderHistoryItem(item, options.pair))
          .filter(Boolean) as Array<Record<string, string | number>>,
      },
    };
  }

  tradeHistory(
    pair?: string,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxTradeHistoryReturn>> {
    return this.post<IndodaxTradeHistoryReturn>('tradeHistory', pair ? { pair } : {}, options);
  }

  async myTradesV2(
    options: IndodaxHistoryQueryOptions = {},
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxTradeHistoryReturn>> {
    const symbol = toTradeApiV2Symbol(options.pair);
    if (!symbol) {
      throw new Error('pair is required for myTradesV2');
    }

    assertWindowWithinSevenDays('myTradesV2', options.startTime, options.endTime);

    const payload = await this.getV2<unknown>(
      '/api/v2/myTrades',
      {
        symbol,
        startTime: options.startTime,
        endTime: options.endTime,
        limit: normalizeHistoryLimit(options.limit, 500),
        orderId: options.orderId,
        sort: options.sort,
      },
      1,
      requestOptions,
    );

    const items = collectItems(payload, ['data', 'results', 'items', 'trades']);
    return {
      success: 1,
      return: {
        trades: items
          .map((item) => this.normalizeV2TradeItem(item, options.pair))
          .filter(Boolean) as Array<Record<string, string | number>>,
      },
    };
  }

  getOrder(
    pair: string,
    orderId: string | number,
    options?: IndodaxPrivateRequestOptions,
  ): Promise<IndodaxPrivateEnvelope<IndodaxGetOrderReturn>> {
    return this.post<IndodaxGetOrderReturn>(
      'getOrder',
      {
        pair,
        order_id: orderId,
      },
      { lane: 'private_live_trading', requestPriority: 4, ...options },
    );
  }
}
