import type { MarketRegime, PairClass } from '../../core/types';
import { isMajorBaseAsset, splitPair } from './majorPairContract';

export type PairTier = 'A' | 'B' | 'C';

export interface PairClassification {
  pair: string;
  tier: PairTier;
  pairClass: PairClass;
  quoteAsset: string;
  baseAsset: string;
  regimeHint: MarketRegime;
}

const MID_CAPS = new Set(['xrp', 'ada', 'doge', 'trx', 'bnb', 'pepe', 'shib']);

export function classifyPair(pair: string): PairClassification {
  const { baseAsset, quoteAsset } = splitPair(pair);

  let tier: PairTier = 'A';
  let pairClass: PairClass = 'MICRO';
  let regimeHint: MarketRegime = 'BREAKOUT_SETUP';

  if (isMajorBaseAsset(baseAsset)) {
    tier = 'C';
    pairClass = 'MAJOR';
    regimeHint = 'QUIET';
  } else if (MID_CAPS.has(baseAsset)) {
    tier = 'B';
    pairClass = 'MID';
    regimeHint = 'ACCUMULATION';
  }

  return {
    pair,
    tier,
    pairClass,
    quoteAsset,
    baseAsset,
    regimeHint,
  };
}

export function classifyTier(pair: string): PairTier {
  return classifyPair(pair).tier;
}
