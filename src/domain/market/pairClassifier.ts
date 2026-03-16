import type { MarketRegime } from '../../core/types';

export type PairTier = 'A' | 'B' | 'C';
export type PairClass = 'MAJOR' | 'MID' | 'MICRO';

export interface PairClassification {
  pair: string;
  tier: PairTier;
  pairClass: PairClass;
  quoteAsset: string;
  baseAsset: string;
  regimeHint: MarketRegime;
}

const MAJORS = new Set(['btc', 'eth', 'sol']);
const MID_CAPS = new Set(['xrp', 'ada', 'doge', 'trx', 'bnb', 'pepe', 'shib']);

function splitPair(pair: string): { baseAsset: string; quoteAsset: string } {
  const normalized = pair.toLowerCase();
  const [baseAsset, quoteAsset = 'idr'] = normalized.split('_');
  return { baseAsset, quoteAsset };
}

export function classifyPair(pair: string): PairClassification {
  const { baseAsset, quoteAsset } = splitPair(pair);

  let tier: PairTier = 'C';
  let pairClass: PairClass = 'MICRO';
  let regimeHint: MarketRegime = 'QUIET';

  if (MAJORS.has(baseAsset)) {
    tier = 'A';
    pairClass = 'MAJOR';
    regimeHint = 'ACCUMULATION';
  } else if (MID_CAPS.has(baseAsset)) {
    tier = 'B';
    pairClass = 'MID';
    regimeHint = 'BREAKOUT_SETUP';
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
