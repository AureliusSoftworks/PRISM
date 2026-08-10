export interface PrismCompanionVisualSnapshot {
  position: { x: number; y: number };
  available: boolean;
}

let visualSnapshot: PrismCompanionVisualSnapshot = {
  position: { x: 0.92, y: 0.84 },
  available: false,
};
const serverVisualSnapshot: PrismCompanionVisualSnapshot = {
  position: { x: 0.92, y: 0.84 },
  available: false,
};
const visualListeners = new Set<() => void>();

export function publishPrismCompanionVisualSnapshot(
  next: PrismCompanionVisualSnapshot,
): void {
  const normalized: PrismCompanionVisualSnapshot = {
    position: {
      x: Math.max(0, Math.min(1, next.position.x)),
      y: Math.max(0, Math.min(1, next.position.y)),
    },
    available: next.available,
  };
  if (
    visualSnapshot.position.x === normalized.position.x &&
    visualSnapshot.position.y === normalized.position.y &&
    visualSnapshot.available === normalized.available
  ) {
    return;
  }
  visualSnapshot = normalized;
  for (const listener of visualListeners) listener();
}

export function getPrismCompanionVisualSnapshot(): PrismCompanionVisualSnapshot {
  return visualSnapshot;
}

export function getPrismCompanionVisualServerSnapshot(): PrismCompanionVisualSnapshot {
  return serverVisualSnapshot;
}

export function subscribePrismCompanionVisualSnapshot(
  listener: () => void,
): () => void {
  visualListeners.add(listener);
  return () => visualListeners.delete(listener);
}
