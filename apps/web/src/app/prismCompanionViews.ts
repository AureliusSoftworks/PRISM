"use client";

import { useSyncExternalStore } from "react";

export type PrismCompanionView = "chat";

export interface PrismCompanionViewRequestSnapshot {
  view: PrismCompanionView;
  requestId: number;
}

const listeners = new Set<() => void>();
let snapshot: PrismCompanionViewRequestSnapshot = {
  view: "chat",
  requestId: 0,
};
const serverSnapshot: PrismCompanionViewRequestSnapshot = {
  view: "chat",
  requestId: 0,
};

export function requestPrismCompanionView(view: PrismCompanionView): void {
  snapshot = { view, requestId: snapshot.requestId + 1 };
  for (const listener of listeners) listener();
}

export function getPrismCompanionViewRequestSnapshot(): PrismCompanionViewRequestSnapshot {
  return snapshot;
}

export function getPrismCompanionViewRequestServerSnapshot(): PrismCompanionViewRequestSnapshot {
  return serverSnapshot;
}

export function subscribePrismCompanionViewRequests(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrismCompanionViewRequest(): PrismCompanionViewRequestSnapshot {
  return useSyncExternalStore(
    subscribePrismCompanionViewRequests,
    getPrismCompanionViewRequestSnapshot,
    getPrismCompanionViewRequestServerSnapshot,
  );
}

export function resetPrismCompanionViewRequestsForTests(): void {
  snapshot = { view: "chat", requestId: 0 };
  for (const listener of listeners) listener();
}
