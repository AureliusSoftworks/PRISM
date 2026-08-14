export interface PrismFrameRateSnapshot {
  fps: number;
  sampledAt: string;
}

type PrismFrameRateListener = (snapshot: PrismFrameRateSnapshot | null) => void;

let latestSnapshot: PrismFrameRateSnapshot | null = null;
const listeners = new Set<PrismFrameRateListener>();

export function normalizePrismFrameRate(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.min(240, Math.round(value)));
}

export function publishPrismFrameRate(
  fps: number,
  sampledAt = new Date().toISOString(),
): PrismFrameRateSnapshot | null {
  const normalized = normalizePrismFrameRate(fps);
  if (normalized === null) return null;
  latestSnapshot = { fps: normalized, sampledAt };
  listeners.forEach((listener) => listener(latestSnapshot));
  return latestSnapshot;
}

export function currentPrismFrameRate(): PrismFrameRateSnapshot | null {
  return latestSnapshot;
}

export function subscribePrismFrameRate(
  listener: PrismFrameRateListener,
): () => void {
  listeners.add(listener);
  listener(latestSnapshot);
  return () => listeners.delete(listener);
}

export function resetPrismFrameRateForTests(): void {
  latestSnapshot = null;
  listeners.forEach((listener) => listener(null));
}
