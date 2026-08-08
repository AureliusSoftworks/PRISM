"use client";

import { useSyncExternalStore } from "react";
import {
  clampPrismCompanionPosition,
  type PrismCompanionPosition,
} from "./prismCompanionPhysics.ts";

/** Session-only default for the relocatable soft synthesis card. */
export const PRISM_SOFT_SYNTHESIS_DEFAULT_POSITION: PrismCompanionPosition = {
  x: 0.82,
  y: 0.78,
};

export type PrismSoftSynthesisUiSnapshot = {
  jobCount: number;
  expanded: boolean;
  position: PrismCompanionPosition;
  /** Companion orb is visually lodged in the soft/hard loader slot. */
  lodged: boolean;
  handoffBusy: boolean;
};

const sourceCounts = new Map<string, number>();
const listeners = new Set<() => void>();

let expanded = false;
let position: PrismCompanionPosition = {
  ...PRISM_SOFT_SYNTHESIS_DEFAULT_POSITION,
};
let lodged = false;
let handoffBusy = false;

function totalJobCount(): number {
  let total = 0;
  for (const count of sourceCounts.values()) total += count;
  return total;
}

function snapshot(): PrismSoftSynthesisUiSnapshot {
  return {
    jobCount: totalJobCount(),
    expanded,
    position,
    lodged,
    handoffBusy,
  };
}

let cachedSnapshot = snapshot();

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
  return {
    jobCount: 0,
    expanded: false,
    position: { ...PRISM_SOFT_SYNTHESIS_DEFAULT_POSITION },
    lodged: false,
    handoffBusy: false,
  };
}

/**
 * Register how many soft jobs a surface currently owns.
 * Passing `0` removes the source. Soft work always starts minimized.
 */
export function registerPrismSoftSynthesisJobs(
  sourceId: string,
  jobCount: number,
): void {
  const nextCount =
    typeof jobCount === "number" && Number.isFinite(jobCount)
      ? Math.max(0, Math.floor(jobCount))
      : 0;
  const previousTotal = totalJobCount();
  if (nextCount <= 0) sourceCounts.delete(sourceId);
  else sourceCounts.set(sourceId, nextCount);
  const nextTotal = totalJobCount();
  if (previousTotal === 0 && nextTotal > 0) {
    expanded = false;
    lodged = false;
  }
  if (nextTotal === 0) {
    expanded = false;
    lodged = false;
    handoffBusy = false;
  }
  publish();
}

export function setPrismSoftSynthesisExpanded(next: boolean): void {
  if (totalJobCount() <= 0) {
    if (expanded || lodged) {
      expanded = false;
      lodged = false;
      handoffBusy = false;
      publish();
    }
    return;
  }
  if (expanded === next) return;
  expanded = next;
  if (!next) lodged = false;
  publish();
}

export function togglePrismSoftSynthesisExpanded(): void {
  setPrismSoftSynthesisExpanded(!expanded);
}

export function setPrismSoftSynthesisPosition(
  next: PrismCompanionPosition,
): void {
  position = clampPrismCompanionPosition(next);
  publish();
}

export function setPrismSoftSynthesisLodged(next: boolean): void {
  if (lodged === next) return;
  lodged = next;
  publish();
}

export function setPrismSoftSynthesisHandoffBusy(next: boolean): void {
  if (handoffBusy === next) return;
  handoffBusy = next;
  publish();
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
  sourceCounts.clear();
  expanded = false;
  position = { ...PRISM_SOFT_SYNTHESIS_DEFAULT_POSITION };
  lodged = false;
  handoffBusy = false;
  publish();
}
