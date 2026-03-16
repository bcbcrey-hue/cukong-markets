import { clamp } from '../../../utils/math';

export interface HotRotationInput {
  change5m: number;
  change15m: number;
  volumeAcceleration: number;
  volatilityScore: number;
}

export function hotRotationScore(input: HotRotationInput): number {
  const rotationBase =
    Math.max(0, input.change15m) * 1.5 +
    Math.max(0, input.change5m) * 1.2 +
    input.volumeAcceleration * 0.05;

  const antiOverheatPenalty = input.volatilityScore > 70 ? 3 : 0;

  return clamp(rotationBase - antiOverheatPenalty, 0, 10);
}
