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
 * Ordinary window blur does not suspend Coffee clocks; Debate may still hold
 * on blur via {@link isPrismAppAwayFromUser}.
 */
export function isPrismPresentationSuspended(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  return snapshot.lifecycle === "suspended";
}

/**
 * True when the player left the Prism surface (hidden tab/page, system pause,
 * or ordinary window blur / unfocused). Use for durable live-session holds
 * such as Debate recess — not for Coffee table clocks.
 */
export function isPrismAppAwayFromUser(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  return snapshot.lifecycle === "suspended" || !snapshot.focused;
}

export function getPrismPresentationSuspendedSnapshot(): boolean {
  return isPrismPresentationSuspended(getPrismVisualLifecycleSnapshot());
}

export function getPrismPresentationSuspendedServerSnapshot(): boolean {
  return isPrismPresentationSuspended(getPrismVisualLifecycleServerSnapshot());
}

export function getPrismAppAwayFromUserSnapshot(): boolean {
  return isPrismAppAwayFromUser(getPrismVisualLifecycleSnapshot());
}

export function getPrismAppAwayFromUserServerSnapshot(): boolean {
  return isPrismAppAwayFromUser(getPrismVisualLifecycleServerSnapshot());
}

/** Subscribe leaf UIs to tab-hidden presentation soft-pause. */
export function usePrismPresentationSuspended(): boolean {
  return useSyncExternalStore(
    subscribePrismVisualLifecycle,
    getPrismPresentationSuspendedSnapshot,
    getPrismPresentationSuspendedServerSnapshot,
  );
}

/** Subscribe leaf UIs that must recess or hold when the player leaves Prism. */
export function usePrismAppAwayFromUser(): boolean {
  return useSyncExternalStore(
    subscribePrismVisualLifecycle,
    getPrismAppAwayFromUserSnapshot,
    getPrismAppAwayFromUserServerSnapshot,
  );
}

/**
 * Resolve once presentation is foreground again, or when `shouldAbort` says stop.
 * Used so Debate (and similar) never silent-skip turns while the tab is away.
 */
export function waitWhilePrismPresentationSuspended(
  shouldAbort?: () => boolean,
): Promise<void> {
  if (shouldAbort?.() || !isPrismPresentationSuspended()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (pollTimer !== null) clearInterval(pollTimer);
      resolve();
    };
    const unsubscribe = subscribePrismVisualLifecycle(() => {
      if (shouldAbort?.() || !isPrismPresentationSuspended()) {
        finish();
      }
    });
    if (shouldAbort) {
      pollTimer = setInterval(() => {
        if (shouldAbort() || !isPrismPresentationSuspended()) {
          finish();
        }
      }, 50);
    }
    if (shouldAbort?.() || !isPrismPresentationSuspended()) {
      finish();
    }
  });
}
