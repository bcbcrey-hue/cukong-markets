import { clamp } from '../../../utils/math';

export interface VolumeSpikeInput {
  quoteFlow1m: number;
  quoteFlow5m: number;
  quoteFlow15mAvgPerMin: number;
  change1m: number;
}

export function volumeSpikeScore(input: VolumeSpikeInput): number {
  const baselinePerMinute = Math.max(1, input.quoteFlow15mAvgPerMin);
  const ratio1m = input.quoteFlow1m / baselinePerMinute;
  const ratio5m = input.quoteFlow5m / Math.max(1, baselinePerMinute * 5);
  const momentumBonus = Math.max(0, input.change1m) * 1.5;

  return clamp(ratio1m * 10 + ratio5m * 6 + momentumBonus, 0, 18);
}
