import type { PrismSceneDiagnosticsSnapshot } from "./prismSceneRuntime.ts";

type Listener = () => void;

const listeners = new Set<Listener>();
const snapshots = new Map<string, PrismSceneDiagnosticsSnapshot>();

const EMPTY_SNAPSHOT: PrismSceneDiagnosticsSnapshot = {
  sceneId: null,
  rendererStatus: "uninitialized",
  lifecycle: "suspended",
  quality: "full",
  targetFps: 0,
  observedFps: 0,
  p50FrameIntervalMs: 0,
  p95FrameIntervalMs: 0,
  missedFramePercentage: 0,
  effectiveDpr: 1,
  objectCount: 0,
  particleCount: 0,
  contextLossCount: 0,
  tickCount: 0,
  updatedAtMs: 0,
};

let currentSnapshot = EMPTY_SNAPSHOT;

function selectCurrentSnapshot(): PrismSceneDiagnosticsSnapshot {
  let selected: PrismSceneDiagnosticsSnapshot | undefined;
  for (const snapshot of snapshots.values()) {
    if (!selected || snapshot.updatedAtMs >= selected.updatedAtMs) {
      selected = snapshot;
    }
  }
  return selected ?? EMPTY_SNAPSHOT;
}

function emit(): void {
  currentSnapshot = selectCurrentSnapshot();
  for (const listener of listeners) listener();
}

export function publishPrismSceneDiagnostics(
  sceneId: string,
  snapshot: Omit<PrismSceneDiagnosticsSnapshot, "sceneId">,
): void {
  snapshots.set(sceneId, { ...snapshot, sceneId });
  emit();
}

export function removePrismSceneDiagnostics(sceneId: string): void {
  if (!snapshots.delete(sceneId)) return;
  emit();
}

export function getPrismSceneDiagnosticsSnapshot(): PrismSceneDiagnosticsSnapshot {
  return currentSnapshot;
}

export function subscribePrismSceneDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetPrismSceneDiagnosticsForTests(): void {
  snapshots.clear();
  currentSnapshot = EMPTY_SNAPSHOT;
  emit();
}
