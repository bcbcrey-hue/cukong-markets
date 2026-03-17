import type { MarketSnapshot } from '../../core/types';
import { clamp, sum } from '../../utils/math';

export interface SpoofDetectionResult {
  spoofRiskScore: number;
  suspectedLevels: number[];
  spoofDirection: 'BUY' | 'SELL' | 'NONE';
  evidence: string[];
}

function topDepth(snapshot: MarketSnapshot, side: 'bids' | 'asks'): number {
  return sum((snapshot.orderbook?.[side] ?? []).slice(0, 3).map((level) => level.volume));
}

export function detectSpoofing(
  snapshot: MarketSnapshot,
  recentSnapshots: MarketSnapshot[],
): SpoofDetectionResult {
  const orderbook = snapshot.orderbook;
  const previous = recentSnapshots.at(-1);
  const evidence: string[] = [];

  if (!orderbook || !previous?.orderbook) {
    return {
      spoofRiskScore: 0,
      suspectedLevels: [],
      spoofDirection: 'NONE',
      evidence: ['histori orderbook belum cukup'],
    };
  }

  const currentBidDepth = topDepth(snapshot, 'bids');
  const currentAskDepth = topDepth(snapshot, 'asks');
  const previousBidDepth = topDepth(previous, 'bids');
  const previousAskDepth = topDepth(previous, 'asks');

  const bidFlashRatio = previousBidDepth > 0 ? currentBidDepth / previousBidDepth : 1;
  const askFlashRatio = previousAskDepth > 0 ? currentAskDepth / previousAskDepth : 1;

  const buyFollowThrough = sum(
    snapshot.recentTrades
      .filter((trade) => trade.side === 'buy')
      .map((trade) => trade.quantity),
  );
  const sellFollowThrough = sum(
    snapshot.recentTrades
      .filter((trade) => trade.side === 'sell')
      .map((trade) => trade.quantity),
  );

  let spoofDirection: SpoofDetectionResult['spoofDirection'] = 'NONE';
  let suspectedLevels: number[] = [];

  if (bidFlashRatio >= 1.8 && buyFollowThrough <= sellFollowThrough) {
    spoofDirection = 'BUY';
    suspectedLevels = orderbook.bids.slice(0, 2).map((level) => level.price);
    evidence.push('bid wall muncul cepat tanpa follow-through beli');
  }

  if (askFlashRatio >= 1.8 && sellFollowThrough <= buyFollowThrough) {
    spoofDirection = 'SELL';
    suspectedLevels = orderbook.asks.slice(0, 2).map((level) => level.price);
    evidence.push('ask wall muncul cepat tanpa follow-through jual');
  }

  if (Math.abs(currentBidDepth - currentAskDepth) > Math.max(currentBidDepth, currentAskDepth) * 0.55) {
    evidence.push('ketimpangan depth top-of-book terlalu ekstrem');
  }

  const spoofRiskScore = clamp(
    Math.max(0, bidFlashRatio - 1) * 22 +
      Math.max(0, askFlashRatio - 1) * 22 +
      Math.max(0, orderbook.spreadPct - 0.5) * 18 +
      (evidence.length > 0 ? 16 : 0),
    0,
    100,
  );

  return {
    spoofRiskScore,
    suspectedLevels,
    spoofDirection,
    evidence,
  };
}