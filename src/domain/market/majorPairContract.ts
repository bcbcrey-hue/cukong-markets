const DEFAULT_QUOTE_ASSET = 'idr';
const MAJOR_BASE_ASSETS = new Set(['btc', 'eth', 'sol', 'usdt']);

export type CanonicalPairClass = 'MAJOR' | 'NON_MAJOR';

export interface PairAssetSplit {
  baseAsset: string;
  quoteAsset: string;
}

export function splitPair(pair: string): PairAssetSplit {
  const normalized = pair.toLowerCase();
  const [baseAsset, quoteAsset = DEFAULT_QUOTE_ASSET] = normalized.split('_');
  return { baseAsset, quoteAsset };
}

export function isMajorBaseAsset(baseAsset: string): boolean {
  return MAJOR_BASE_ASSETS.has(baseAsset.toLowerCase());
}

export function isMajorPair(pair: string): boolean {
  return isMajorBaseAsset(splitPair(pair).baseAsset);
}

export function getPairClass(pair: string): CanonicalPairClass {
  return isMajorPair(pair) ? 'MAJOR' : 'NON_MAJOR';
}
