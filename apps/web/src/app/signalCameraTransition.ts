export type SignalCameraTransitionMode = "animated" | "instant";
export type SignalDirectedCameraShot = "left" | "right" | "wide";

/** A reaction shot must read as an editorial choice, not a camera twitch. */
export const SIGNAL_REACTION_CAMERA_MIN_HOLD_MS = 2_500;

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
  listenerReactionShot?: SignalDirectedCameraShot | null;
  speakingShot?: SignalDirectedCameraShot | null;
  postSpeechHoldShot?: SignalDirectedCameraShot | null;
  /** Mid-speech Wide breaths, listener glances, and guest introductions. */
  coverageShot?: SignalDirectedCameraShot | null;
  botThinking: boolean;
  producerGuestThinking: boolean;
}): SignalDirectedCameraShot {
  if (args.listenerReactionShot) return args.listenerReactionShot;
  if (args.coverageShot) return args.coverageShot;
  if (args.speakingShot) return args.speakingShot;
  // A real wait immediately releases the previous speaker; a held reaction
  // must not conceal the bot that is visibly thinking.
  if (args.botThinking) return "wide";
  if (args.producerGuestThinking) return "right";
  if (args.postSpeechHoldShot) return args.postSpeechHoldShot;
  return args.baseShot;
}
