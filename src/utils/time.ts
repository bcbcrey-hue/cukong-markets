export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function minutesToMs(minutes: number): number {
  return Math.max(0, minutes) * 60_000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
