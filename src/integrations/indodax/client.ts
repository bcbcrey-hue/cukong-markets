import type { AccountCredential, OrderbookSnapshot, TickerSnapshot } from '../../core/types';
import { nowIso } from '../../utils/time';
import { IndodaxPrivateApi } from './privateApi';
import { IndodaxPublicApi } from './publicApi';

export class IndodaxClient {
  private readonly history = new Map<string, TickerSnapshot\[]>();

  constructor(
    private readonly publicApi = new IndodaxPublicApi(),
    private readonly privateApi = new IndodaxPrivateApi(),
  ) {}

  private buildTicker(pair: string, row: { last: string; buy: string; sell: string; vol\_btc?: string; vol\_idr?: string }, previous: TickerSnapshot\[]): TickerSnapshot {
    const lastPrice = Number(row.last);
    const bestBid = Number(row.buy);
    const bestAsk = Number(row.sell);
    const spreadPct = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) \* 100 : 0;
    const volume24h = Number(row.vol\_idr ?? row.vol\_btc ?? 0);
    const prev1 = previous.at(-1);
    const prev3 = previous.at(-3);
    const prev5 = previous.at(-5);
    const prev15 = previous.at(-15);

    const pct = (prev?: TickerSnapshot): number => {
      if (!prev || prev.lastPrice <= 0) return 0;
      return ((lastPrice - prev.lastPrice) / prev.lastPrice) \* 100;
    };

    const snapshot: TickerSnapshot = {
      pair,
      lastPrice,
      bestBid,
      bestAsk,
      spreadPct,
      baseVolume24h: Number(row.vol\_btc ?? 0),
      quoteVolume24h: volume24h,
      priceChange24hPct: 0,
      change1m: pct(prev1),
      change3m: pct(prev3),
      change5m: pct(prev5),
      change15m: pct(prev15),
      velocity1m: Math.abs(pct(prev1)),
      velocity5m: Math.abs(pct(prev5)),
      volume1m: volume24h,
      volume3m: volume24h,
      volume5m: volume24h,
      volume15m: volume24h,
      tradeBurstScore: Math.min(100, Math.max(0, Math.abs(pct(prev1)) \* 20)),
      breakoutDistancePct: Math.max(0, 1 - Math.abs(pct(prev5))),
      liquidityScore: Math.max(0, Math.min(100, volume24h / 1\_000\_000)),
      capturedAt: nowIso(),
    };

    return snapshot;
  }

  async getTicker(pair: string): Promise<TickerSnapshot | null> {
    const tickers = await this.publicApi.getTickers();
    const row = tickers\[pair];
    if (!row) {
      return null;
    }

    const history = this.history.get(pair) ?? \[];
    const snapshot = this.buildTicker(pair, row, history);
    this.history.set(pair, \[...history, snapshot].slice(-20));
    return snapshot;
  }

  async getOrderbook(pair: string): Promise<OrderbookSnapshot | null> {
    const depth = await this.publicApi.getDepth(pair);
    const bids = depth.buy.slice(0, 5).map((\[price, volume]) => ({ price: Number(price), volume: Number(volume) }));
    const asks = depth.sell.slice(0, 5).map((\[price, volume]) => ({ price: Number(price), volume: Number(volume) }));
    const bestBid = bids\[0]?.price ?? 0;
    const bestAsk = asks\[0]?.price ?? 0;
    const bidDepthTop5 = bids.reduce((sum, row) => sum + row.volume, 0);
    const askDepthTop5 = asks.reduce((sum, row) => sum + row.volume, 0);
    const imbalanceTop5 = bidDepthTop5 + askDepthTop5 > 0 ? (bidDepthTop5 - askDepthTop5) / (bidDepthTop5 + askDepthTop5) : 0;

    return {
      pair,
      bids,
      asks,
      bestBid,
      bestAsk,
      bidDepthTop5,
      askDepthTop5,
      imbalanceTop5,
      spreadPct: bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) \* 100 : 0,
      capturedAt: nowIso(),
    };
  }

  async placeBuyOrder(account: AccountCredential, pair: string, price: number, quantity: number): Promise<unknown> {
    return this.privateApi.call(account, 'trade', { pair, type: 'buy', price, btc: quantity });
  }

  async placeSellOrder(account: AccountCredential, pair: string, price: number, quantity: number): Promise<unknown> {
    return this.privateApi.call(account, 'trade', { pair, type: 'sell', price, btc: quantity });
  }
}
