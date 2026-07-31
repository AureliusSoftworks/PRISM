"use client";

import { useSyncExternalStore } from "react";
import {
  getPrismVisualLifecycleServerSnapshot,
  getPrismVisualLifecycleSnapshot,
  subscribePrismVisualLifecycle,
  type PrismVisualLifecycleSnapshot,
} from "./prismVisualLifecycle.ts";

/**
 * True when living presentation (voice, atmosphere, autoplay) should soft-pause.
 * Matches visual lifecycle suspended: tab hidden, pagehide, or system pause.
 * Ordinary window blur does not suspend.
 */
export function isPrismPresentationSuspended(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  return snapshot.lifecycle === "suspended";
}

export function getPrismPresentationSuspendedSnapshot(): boolean {
  return isPrismPresentationSuspended(getPrismVisualLifecycleSnapshot());
}

export function getPrismPresentationSuspendedServerSnapshot(): boolean {
  return isPrismPresentationSuspended(getPrismVisualLifecycleServerSnapshot());
}

/** Subscribe leaf UIs to tab-hidden presentation soft-pause. */
export function usePrismPresentationSuspended(): boolean {
  return useSyncExternalStore(
    subscribePrismVisualLifecycle,
    getPrismPresentationSuspendedSnapshot,
    getPrismPresentationSuspendedServerSnapshot,
  );
}
