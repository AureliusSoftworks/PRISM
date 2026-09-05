"use client";

import { useSyncExternalStore } from "react";
import {
  getPrismVisualLifecycleServerSnapshot,
  getPrismVisualLifecycleSnapshot,
  subscribePrismVisualLifecycle,
  type PrismVisualLifecycleSnapshot,
} from "./prismVisualLifecycle.ts";
import { acquirePrismAudioContextKeepAlive } from "./replayAudioMasterCapture.ts";

export type PrismLivingSessionKind = "debate" | "coffee" | "signal";

type Listener = () => void;

const livingSessionOwners = new Map<string, PrismLivingSessionKind>();
const livingSessionListeners = new Set<Listener>();
const livingSessionAudioKeepAlive = new Map<string, () => void>();

function emitLivingSessionChange(): void {
  for (const listener of livingSessionListeners) listener();
}

/**
 * Claim a live Debate / Coffee / Signal floor so minimize/hide sleeps visuals
 * only — voice, autoplay, and session clocks keep running. Companion system
 * pause still holds presentation.
 */
export function acquirePrismLivingSession(
  kind: PrismLivingSessionKind,
  ownerId: string = kind,
): () => void {
  const key = `${kind}:${ownerId}`;
  livingSessionOwners.set(key, kind);
  if (!livingSessionAudioKeepAlive.has(key)) {
    livingSessionAudioKeepAlive.set(key, acquirePrismAudioContextKeepAlive());
  }
  emitLivingSessionChange();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    livingSessionOwners.delete(key);
    livingSessionAudioKeepAlive.get(key)?.();
    livingSessionAudioKeepAlive.delete(key);
    emitLivingSessionChange();
  };
}

export function hasPrismLivingSessionActive(): boolean {
  return livingSessionOwners.size > 0;
}

export function subscribePrismLivingSession(listener: Listener): () => void {
  livingSessionListeners.add(listener);
  return () => livingSessionListeners.delete(listener);
}

export function resetPrismLivingSessionForTests(): void {
  for (const release of livingSessionAudioKeepAlive.values()) release();
  livingSessionAudioKeepAlive.clear();
  livingSessionOwners.clear();
  livingSessionListeners.clear();
}

/**
 * True when a live experience should keep audio + orchestration while the
 * window is hidden/unfocused. Companion system pause always wins.
 */
export function shouldKeepLivingSessionActive(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  return hasPrismLivingSessionActive() && !snapshot.systemPaused;
}

/**
 * True when living presentation (voice, atmosphere, autoplay) should soft-pause.
 * Visual lifecycle may still be suspended (Pixi/CSS sleep) while a claimed live
 * session keeps audio running. Ordinary window blur does not suspend Coffee
 * clocks; Debate recess uses {@link isPrismAppAwayFromUser}.
 */
export function isPrismPresentationSuspended(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  if (shouldKeepLivingSessionActive(snapshot)) return false;
  return snapshot.lifecycle === "suspended";
}

/**
 * True when the player left the Prism surface (hidden tab/page, system pause,
 * or ordinary window blur / unfocused) and no live session is claiming
 * background continuity. Live Debate/Coffee/Signal keep the floor while
 * minimized; companion system pause still counts as away.
 */
export function isPrismAppAwayFromUser(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  if (shouldKeepLivingSessionActive(snapshot)) return false;
  return snapshot.lifecycle === "suspended" || !snapshot.focused;
}

/** Visual-only suspend (Pixi / decorative CSS). Independent of living audio. */
export function isPrismVisualSuspended(
  snapshot: PrismVisualLifecycleSnapshot = getPrismVisualLifecycleSnapshot(),
): boolean {
  return snapshot.lifecycle === "suspended";
}

function subscribePresentationPolicy(listener: Listener): () => void {
  const unsubscribeLifecycle = subscribePrismVisualLifecycle(listener);
  const unsubscribeLiving = subscribePrismLivingSession(listener);
  return () => {
    unsubscribeLifecycle();
    unsubscribeLiving();
  };
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

/** Subscribe leaf UIs to presentation soft-pause (audio / autoplay holds). */
export function usePrismPresentationSuspended(): boolean {
  return useSyncExternalStore(
    subscribePresentationPolicy,
    getPrismPresentationSuspendedSnapshot,
    getPrismPresentationSuspendedServerSnapshot,
  );
}

/** Subscribe leaf UIs that must recess or hold when the player leaves Prism. */
export function usePrismAppAwayFromUser(): boolean {
  return useSyncExternalStore(
    subscribePresentationPolicy,
    getPrismAppAwayFromUserSnapshot,
    getPrismAppAwayFromUserServerSnapshot,
  );
}

/**
 * Resolve once presentation is foreground again, or when `shouldAbort` says stop.
 * Used so Debate (and similar) never silent-skip turns while the tab is away
 * without a living-session claim.
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
    const unsubscribe = subscribePresentationPolicy(() => {
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
