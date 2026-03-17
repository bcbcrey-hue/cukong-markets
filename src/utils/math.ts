export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function pct(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) {
    return 0;
  }

  return ((to - from) / from) * 100;
}

export function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}