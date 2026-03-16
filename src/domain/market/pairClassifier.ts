import type { PairTier, TickerSnapshot } from '../../core/types';

const tierAKeywords = \['btc', 'eth', 'sol', 'bnb', 'idr'];
const tierBKeywords = \['doge', 'xrp', 'ada', 'link', 'pepe', 'shib'];

export function classifyTier(pair: string, snapshot?: TickerSnapshot | null): PairTier {
  const normalized = pair.toLowerCase();

  if (snapshot \&\& snapshot.tradeBurstScore >= 75) {
    return 'HOT';
  }

  if (tierAKeywords.some((item) => normalized.includes(item))) {
    return 'A';
  }

  if (tierBKeywords.some((item) => normalized.includes(item))) {
    return 'B';
  }

  return 'C';
}

export function tierIntervalMs(tier: PairTier): number {
  switch (tier) {
    case 'HOT':
      return 900;
    case 'A':
      return 2\_500;
    case 'B':
      return 5\_000;
    case 'C':
    default:
      return 10\_000;
  }
}
