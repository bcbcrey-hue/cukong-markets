import { clamp } from '../../../utils/math';

export interface SilentAccumulationInput {
  change1m: number;
  change5m: number;
  volumeAcceleration: number;
  orderbookImbalance: number;
  spreadBps: number;
}

export function silentAccumulationScore(input: SilentAccumulationInput): number {
  const tightRange = Math.abs(input.change1m) < 0.8 && Math.abs(input.change5m) < 2.5;
  const hiddenPressure =
    input.volumeAcceleration > 25 &&
    input.orderbookImbalance > 0.12 &&
    input.spreadBps < 80;

  if (!tightRange || !hiddenPressure) {
    return 0;
  }

  return clamp(
    input.volumeAcceleration * 0.08 +
      input.orderbookImbalance * 12 +
      Math.max(0, 8 - input.spreadBps / 10),
    0,
    10,
  );
}
