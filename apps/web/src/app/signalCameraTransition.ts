export type SignalCameraTransitionMode = "animated" | "instant";
export type SignalDirectedCameraShot = "left" | "right" | "wide";

/** A reaction shot must read as an editorial choice, not a camera twitch. */
export const SIGNAL_REACTION_CAMERA_MIN_HOLD_MS = 2_500;
/** No automatic cut may replace a shot before it has had time to read. */
export const SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS = 5_000;
/** A seeded speech-start Wide is a real shot, not a transitional flash. */
export const SIGNAL_SPEECH_START_WIDE_HOLD_MS = 5_000;
const SIGNAL_SPEECH_START_WIDE_CHANCE = 0.3;

export interface SignalAutomaticCameraPresentationState {
  episodeId: string;
  shot: SignalDirectedCameraShot;
  switchedAtMs: number;
  introActive: boolean;
}

export interface SignalAutomaticCameraPresentation {
  state: SignalAutomaticCameraPresentationState;
  /** Wall-clock delay before the held candidate should be checked again. */
  nextEvaluationInMs: number | null;
}

function signalCameraSeedUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * Some turns begin as room coverage instead of a compulsory talking head.
 * The choice is message-seeded so repeated renders and Watch presentation
 * agree, while faithful capture preserves the visible result for replay.
 */
export function signalSpeechStartCameraShot(args: {
  messageId: string;
  speakerShot: Exclude<SignalDirectedCameraShot, "wide">;
  speechElapsedMs: number;
}): SignalDirectedCameraShot {
  const elapsedMs = Math.max(0, args.speechElapsedMs);
  if (elapsedMs >= SIGNAL_SPEECH_START_WIDE_HOLD_MS) {
    return args.speakerShot;
  }
  const seed = `${args.messageId.trim() || "signal-message"}:${args.speakerShot}:speech-start`;
  return signalCameraSeedUnit(seed) < SIGNAL_SPEECH_START_WIDE_CHANCE
    ? "wide"
    : args.speakerShot;
}

/**
 * Resolve the shot the audience is actually allowed to see. The intro owns
 * Wide until it clears, then starts a fresh establishing hold. Later automatic
 * candidates may cut only after the currently presented shot has held for five
 * seconds. Manual cameras bypass this state machine in the live surface.
 */
export function signalAutomaticCameraPresentationAt(args: {
  state: SignalAutomaticCameraPresentationState | null;
  episodeId: string;
  proposedShot: SignalDirectedCameraShot;
  nowMs: number;
  introActive: boolean;
}): SignalAutomaticCameraPresentation {
  const nowMs = Number.isFinite(args.nowMs) ? args.nowMs : 0;
  if (!args.state || args.state.episodeId !== args.episodeId) {
    return {
      state: {
        episodeId: args.episodeId,
        shot: args.introActive ? "wide" : args.proposedShot,
        switchedAtMs: nowMs,
        introActive: args.introActive,
      },
      nextEvaluationInMs: null,
    };
  }

  if (args.introActive) {
    const introAlreadyOwnsWide =
      args.state.introActive && args.state.shot === "wide";
    return {
      state: introAlreadyOwnsWide
        ? args.state
        : {
            ...args.state,
            shot: "wide",
            switchedAtMs: nowMs,
            introActive: true,
          },
      nextEvaluationInMs: null,
    };
  }

  if (args.state.introActive) {
    const state = {
      ...args.state,
      shot: "wide" as const,
      switchedAtMs: nowMs,
      introActive: false,
    };
    return {
      state,
      nextEvaluationInMs:
        args.proposedShot === "wide"
          ? null
          : SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS,
    };
  }

  if (args.proposedShot === args.state.shot) {
    return { state: args.state, nextEvaluationInMs: null };
  }

  const heldMs = Math.max(0, nowMs - args.state.switchedAtMs);
  if (heldMs < SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS) {
    return {
      state: args.state,
      nextEvaluationInMs: SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS - heldMs,
    };
  }

  return {
    state: {
      ...args.state,
      shot: args.proposedShot,
      switchedAtMs: nowMs,
    },
    nextEvaluationInMs: null,
  };
}

/**
 * Ordinary backchannels cut only when the persisted director plan explicitly
 * allows it. Audible reactions are editorial cuts, never slow sweeps.
 */
export function signalListenerReactionCameraShot(args: {
  cameraCutEligible: boolean;
  ephemeralSpeakingShot?: SignalDirectedCameraShot | null;
  ephemeralSpeechDurationMs?: number | null;
}): SignalDirectedCameraShot | null {
  if (!args.cameraCutEligible) return null;
  if (
    !args.ephemeralSpeakingShot ||
    !Number.isFinite(args.ephemeralSpeechDurationMs) ||
    Number(args.ephemeralSpeechDurationMs) < SIGNAL_REACTION_CAMERA_MIN_HOLD_MS
  ) {
    return null;
  }
  return args.ephemeralSpeakingShot;
}

/** Auto keeps the room visible while a bot prepares, then follows the speaker. */
export function signalLiveAutoCameraShot(args: {
  baseShot: SignalDirectedCameraShot;
  /** Two distinct performers have active audible playback at the same time. */
  audibleVoiceOverlap?: boolean;
  /** An incoming canonical voice is preparing while the current mic stays live. */
  audibleHandoffPreparing?: boolean;
  listenerReactionShot?: SignalDirectedCameraShot | null;
  speakingShot?: SignalDirectedCameraShot | null;
  /** Opening beat anchored to the voice that has actually started playback. */
  speakerOwnershipLock?: boolean;
  postSpeechHoldShot?: SignalDirectedCameraShot | null;
  /** Mid-speech Wide breaths, listener glances, and guest introductions. */
  coverageShot?: SignalDirectedCameraShot | null;
  botThinking: boolean;
  producerGuestThinking: boolean;
}): SignalDirectedCameraShot {
  // Crosstalk is a two-person performance. It must outrank every close-up so
  // the audience can read both voices, while manual cameras bypass this helper.
  if (args.audibleVoiceOverlap) return "wide";
  if (args.listenerReactionShot) return args.listenerReactionShot;
  if (args.speakerOwnershipLock && args.speakingShot) {
    return args.speakingShot;
  }
  if (args.audibleHandoffPreparing) return "wide";
  if (args.coverageShot) return args.coverageShot;
  if (args.speakingShot) return args.speakingShot;
  // A real wait immediately releases the previous speaker; a held reaction
  // must not conceal the bot that is visibly thinking.
  if (args.botThinking) return "wide";
  if (args.producerGuestThinking) return "right";
  if (args.postSpeechHoldShot) return args.postSpeechHoldShot;
  return args.baseShot;
}
