"use client";

import { useSyncExternalStore } from "react";

export type PrismSoftSynthesisUiSnapshot = {
  jobCount: number;
  expanded: boolean;
  /** A scoped workflow may temporarily make the orb itself open Progress. */
  orbOpensProgress: boolean;
};

type PrismSoftSynthesisSource = {
  jobCount: number;
  orbOpensProgress: boolean;
};

const sources = new Map<string, PrismSoftSynthesisSource>();
const listeners = new Set<() => void>();

let expanded = false;

function totalJobCount(): number {
  let total = 0;
  for (const source of sources.values()) total += source.jobCount;
  return total;
}

function orbOpensProgress(): boolean {
  return Array.from(sources.values()).some(
    (source) => source.jobCount > 0 && source.orbOpensProgress,
  );
}

function snapshot(): PrismSoftSynthesisUiSnapshot {
  return {
    jobCount: totalJobCount(),
    expanded,
    orbOpensProgress: orbOpensProgress(),
  };
}

let cachedSnapshot = snapshot();

// React requires getServerSnapshot to return the same object until the store
// actually changes. Constructing this value inside the getter triggers an
// infinite-cache warning during hydration, even though its fields are equal.
const cachedServerSnapshot: PrismSoftSynthesisUiSnapshot = {
  jobCount: 0,
  expanded: false,
  orbOpensProgress: false,
};

function publish(): void {
  cachedSnapshot = snapshot();
  for (const listener of listeners) listener();
}

export function subscribePrismSoftSynthesisUi(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPrismSoftSynthesisUiSnapshot(): PrismSoftSynthesisUiSnapshot {
  return cachedSnapshot;
}

export function getPrismSoftSynthesisUiServerSnapshot(): PrismSoftSynthesisUiSnapshot {
  return cachedServerSnapshot;
}

/**
 * Register how many soft jobs a surface currently owns. A focused workflow may
 * opt into routing direct orb activation to its Progress card while registered.
 * Passing `0` removes the source. Soft work always starts minimized.
 */
export function registerPrismSoftSynthesisJobs(
  sourceId: string,
  jobCount: number,
  options: { orbOpensProgress?: boolean } = {},
): void {
  const nextCount =
    typeof jobCount === "number" && Number.isFinite(jobCount)
      ? Math.max(0, Math.floor(jobCount))
      : 0;
  const previousTotal = totalJobCount();
  if (nextCount <= 0) sources.delete(sourceId);
  else {
    sources.set(sourceId, {
      jobCount: nextCount,
      orbOpensProgress: options.orbOpensProgress === true,
    });
  }
  const nextTotal = totalJobCount();
  if (previousTotal === 0 && nextTotal > 0) {
    expanded = false;
  }
  if (nextTotal === 0) {
    expanded = false;
  }
  publish();
}

export function setPrismSoftSynthesisExpanded(next: boolean): void {
  if (totalJobCount() <= 0) {
    if (expanded) {
      expanded = false;
      publish();
    }
    return;
  }
  if (expanded === next) return;
  expanded = next;
  publish();
}

export function togglePrismSoftSynthesisExpanded(): void {
  setPrismSoftSynthesisExpanded(!expanded);
}

export function usePrismSoftSynthesisUi(): PrismSoftSynthesisUiSnapshot {
  return useSyncExternalStore(
    subscribePrismSoftSynthesisUi,
    getPrismSoftSynthesisUiSnapshot,
    getPrismSoftSynthesisUiServerSnapshot,
  );
}

/** Test / teardown helper — clears all soft-synthesis UI state. */
export function resetPrismSoftSynthesisUiForTests(): void {
  sources.clear();
  expanded = false;
  publish();
}
