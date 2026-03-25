import { env } from '../../config/env';
import type { DiscoverySettings, OrderbookSnapshot, PairTickerSnapshot } from '../../core/types';
import type { IndodaxOrderbook } from '../../integrations/indodax/publicApi';
import { DiscoveryAllocator } from './discoveryAllocator';
import { DiscoveryScorer, type DiscoveryRankedCandidate } from './discoveryScorer';
import { OrderbookSnapshotBuilder } from './orderbookSnapshot';
import type { PairUniverse } from './pairUniverse';
import { TickerSnapshotStore } from './tickerSnapshot';

export interface DiscoverySelectionResult {
  selected: DiscoveryRankedCandidate[];
  preDepthShortlist: DiscoveryRankedCandidate[];
  orderbookByPair: Map<string, OrderbookSnapshot>;
}

export class DiscoveryEngine {
  private readonly scorer = new DiscoveryScorer();
  private readonly allocator = new DiscoveryAllocator();
  private readonly tickerStore = new TickerSnapshotStore(env.scannerHistoryLimit);
  private readonly orderbookBuilder = new OrderbookSnapshotBuilder();

  constructor(private readonly universe: PairUniverse) {}

  private toTicker(snapshot: {
    pair: string;
    lastPrice: number;
    bestBid: number;
    bestAsk: number;
    high24h: number;
    low24h: number;
    volumeBtc: number;
    volumeIdr: number;
  }): PairTickerSnapshot {
    return {
      pair: snapshot.pair,
      lastPrice: snapshot.lastPrice,
      bid: snapshot.bestBid,
      ask: snapshot.bestAsk,
      high24h: snapshot.high24h,
      low24h: snapshot.low24h,
      volume24hBase: snapshot.volumeBtc,
      volume24hQuote: snapshot.volumeIdr,
      change24hPct: snapshot.low24h > 0 ? ((snapshot.lastPrice - snapshot.low24h) / snapshot.low24h) * 100 : 0,
      timestamp: Date.now(),
    };
  }

  private toOrderbookSnapshot(pair: string, orderbook: IndodaxOrderbook, timestamp: number): OrderbookSnapshot {
    const bids = orderbook.buy.map(([price, volume]) => ({ price, volume }));
    const asks = orderbook.sell.map(([price, volume]) => ({ price, volume }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const spread = Math.max(0, bestAsk - bestBid);
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;

    return {
      pair,
      bids,
      asks,
      bestBid,
      bestAsk,
      spread,
      spreadPct: bestAsk > 0 ? (spread / bestAsk) * 100 : 0,
      midPrice,
      timestamp,
    };
  }

  async discover(
    limit: number,
    fetchDepth: (pair: string) => Promise<IndodaxOrderbook>,
    settings: DiscoverySettings,
  ): Promise<DiscoverySelectionResult> {
    const snapshots = this.universe.listSnapshots();

    const preDepthCandidates = snapshots
      .map((snapshot) => {
        const ticker = this.tickerStore.buildFeatures(this.toTicker(snapshot));
        return this.scorer.scorePreDepth({ snapshot, ticker });
      })
      .filter((candidate) => candidate.volumeIdr >= settings.minVolumeIdr)
      .filter((candidate) => candidate.spreadPct <= settings.maxSpreadPct)
      .sort((a, b) => b.discoveryScore - a.discoveryScore);

    const shortlistSize = Math.min(
      preDepthCandidates.length,
      Math.max(
        limit * 2,
        settings.anomalySlots +
          settings.rotationSlots +
          settings.stealthSlots +
          settings.liquidLeaderSlots,
      ),
    );

    const preDepthShortlist = preDepthCandidates.slice(0, shortlistSize);
    const orderbookByPair = new Map<string, OrderbookSnapshot>();

    const enriched = await Promise.all(
      preDepthShortlist.map(async (candidate) => {
        const depthRaw = await fetchDepth(candidate.pair);
        const timestamp = Date.now();
        const snapshot = this.toOrderbookSnapshot(candidate.pair, depthRaw, timestamp);
        orderbookByPair.set(candidate.pair, snapshot);
        const features = this.orderbookBuilder.build(snapshot);
        return this.scorer.enrichWithDepth(candidate, features);
      }),
    );

    const depthFiltered = enriched.filter((candidate) => candidate.depthScore >= settings.minDepthScore);
    const selected = this.allocator.allocate(depthFiltered, limit, settings);

    return {
      selected,
      preDepthShortlist,
      orderbookByPair,
    };
  }
}
