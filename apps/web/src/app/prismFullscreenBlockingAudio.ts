"use client";

import { useSyncExternalStore } from "react";

/**
 * Fullscreen hard waits (bake / invent / model warmup) should stay quiet —
 * no avatar thinking loops or other bot SFX under the overlay.
 */
let openCount = 0;
const listeners = new Set<() => void>();
let stopSensitiveAudioHandler: (() => void) | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

export function isPrismFullscreenBlockingAudioMuted(): boolean {
  return openCount > 0;
}

export function subscribePrismFullscreenBlockingAudioMute(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Register the one-shot stop for currently playing avatar SFX. Kept injectable
 * so this module does not import the SFX engine (avoids cycles).
 */
export function setPrismFullscreenBlockingAudioStopHandler(
  handler: (() => void) | null,
): void {
  stopSensitiveAudioHandler = handler;
}

/**
 * Begin muting for one fullscreen overlay. Returns a dispose that must run
 * when that overlay closes.
 */
export function beginPrismFullscreenBlockingAudioMute(): () => void {
  openCount += 1;
  if (openCount === 1) {
    stopSensitiveAudioHandler?.();
    emit();
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) emit();
  };
}

export function usePrismFullscreenBlockingAudioMuted(): boolean {
  return useSyncExternalStore(
    subscribePrismFullscreenBlockingAudioMute,
    isPrismFullscreenBlockingAudioMuted,
    () => false,
  );
}

/** Test helper — resets mute state between cases. */
export function resetPrismFullscreenBlockingAudioMuteForTests(): void {
  openCount = 0;
  emit();
}
