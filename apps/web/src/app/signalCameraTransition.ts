export type SignalCameraTransitionMode = "animated" | "instant";

export const SIGNAL_CAMERA_TRANSITION_STORAGE_KEY =
  "prism.signal.camera-transition-mode.v1";

type SignalCameraTransitionStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeSignalCameraTransitionMode(
  value: unknown,
): SignalCameraTransitionMode {
  return value === "instant" ? "instant" : "animated";
}

export function readSignalCameraTransitionMode(
  storage: Pick<SignalCameraTransitionStorage, "getItem"> | null | undefined,
): SignalCameraTransitionMode {
  if (!storage) return "animated";
  try {
    return normalizeSignalCameraTransitionMode(
      storage.getItem(SIGNAL_CAMERA_TRANSITION_STORAGE_KEY),
    );
  } catch {
    return "animated";
  }
}

export function writeSignalCameraTransitionMode(
  storage: Pick<SignalCameraTransitionStorage, "setItem"> | null | undefined,
  mode: SignalCameraTransitionMode,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SIGNAL_CAMERA_TRANSITION_STORAGE_KEY,
      normalizeSignalCameraTransitionMode(mode),
    );
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

/** Reduced-motion always wins, even when the saved preference is Animated. */
export function signalCameraTransitionsShouldAnimate(
  mode: SignalCameraTransitionMode,
  prefersReducedMotion: boolean,
): boolean {
  return mode === "animated" && !prefersReducedMotion;
}
