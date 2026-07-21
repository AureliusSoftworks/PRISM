export type SignalCameraTransitionMode = "animated" | "instant";
export type SignalDirectedCameraShot = "left" | "right" | "wide";

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

/** Auto keeps the room visible while a bot prepares, then follows the speaker. */
export function signalLiveAutoCameraShot(args: {
  baseShot: SignalDirectedCameraShot;
  listenerReactionShot?: SignalDirectedCameraShot | null;
  speakingShot?: SignalDirectedCameraShot | null;
  postSpeechHoldShot?: SignalDirectedCameraShot | null;
  botThinking: boolean;
  producerGuestThinking: boolean;
}): SignalDirectedCameraShot {
  if (args.listenerReactionShot) return args.listenerReactionShot;
  if (args.speakingShot) return args.speakingShot;
  if (args.postSpeechHoldShot) return args.postSpeechHoldShot;
  if (args.botThinking) return "wide";
  if (args.producerGuestThinking) return "right";
  return args.baseShot;
}
