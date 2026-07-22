export type SignalCameraTransitionMode = "animated" | "instant" | "smart";
export type SignalCameraTransitionStyle = "animated" | "instant";
export type SignalDirectedCameraShot = "left" | "right" | "wide";

export const SIGNAL_CAMERA_TRANSITION_STORAGE_KEY =
  "prism.signal.camera-transition-mode.v1";

type SignalCameraTransitionStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeSignalCameraTransitionMode(
  value: unknown,
): SignalCameraTransitionMode {
  return value === "instant" || value === "smart" ? value : "animated";
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

/** Reduced-motion always wins, even when the saved preference may move. */
export function signalCameraTransitionsShouldAnimate(
  mode: SignalCameraTransitionMode,
  prefersReducedMotion: boolean,
): boolean {
  return mode !== "instant" && !prefersReducedMotion;
}

const SIGNAL_SMART_CAMERA_TRANSITION_CADENCE = [
  "animated",
  "instant",
  "animated",
  "animated",
  "instant",
] as const satisfies readonly SignalCameraTransitionStyle[];

function signalCameraShotIsBotCloseup(
  shot: SignalDirectedCameraShot,
): shot is "left" | "right" {
  return shot === "left" || shot === "right";
}

/**
 * Resolves the motion for one committed shot change. Smart uses a stable
 * cadence for lively variety; direct bot-to-bot cutaways never pan the room.
 */
export function signalCameraTransitionStyleForChange(args: {
  mode: SignalCameraTransitionMode;
  previousShot: SignalDirectedCameraShot;
  nextShot: SignalDirectedCameraShot;
  transitionOrdinal: number;
  prefersReducedMotion?: boolean;
}): SignalCameraTransitionStyle {
  if (
    !signalCameraTransitionsShouldAnimate(
      args.mode,
      args.prefersReducedMotion === true,
    )
  ) {
    return "instant";
  }
  if (
    args.previousShot !== args.nextShot &&
    signalCameraShotIsBotCloseup(args.previousShot) &&
    signalCameraShotIsBotCloseup(args.nextShot)
  ) {
    return "instant";
  }
  if (args.mode === "animated" || args.previousShot === args.nextShot) {
    return "animated";
  }
  const cadenceIndex =
    (Math.max(1, Math.trunc(args.transitionOrdinal)) - 1) %
    SIGNAL_SMART_CAMERA_TRANSITION_CADENCE.length;
  return SIGNAL_SMART_CAMERA_TRANSITION_CADENCE[cadenceIndex]!;
}

/** Auto keeps the room visible for physical beats, then follows the speaker. */
export function signalLiveAutoCameraShot(args: {
  baseShot: SignalDirectedCameraShot;
  bookendWide?: boolean;
  cupActivityWide?: boolean;
  listenerReactionShot?: SignalDirectedCameraShot | null;
  speakingShot?: SignalDirectedCameraShot | null;
  postSpeechHoldShot?: SignalDirectedCameraShot | null;
  botThinking: boolean;
  producerGuestThinking: boolean;
}): SignalDirectedCameraShot {
  if (args.bookendWide) return "wide";
  if (args.cupActivityWide) return "wide";
  if (args.listenerReactionShot) return args.listenerReactionShot;
  if (args.speakingShot) return args.speakingShot;
  if (args.postSpeechHoldShot) return args.postSpeechHoldShot;
  if (args.botThinking) return "wide";
  if (args.producerGuestThinking) return "right";
  return args.baseShot;
}
