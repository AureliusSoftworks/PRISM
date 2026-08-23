import type { VoiceDeliveryMood } from "@localai/shared";

export type PreSpeechBreathSurface =
  "chat" | "coffee" | "debate" | "signal" | "story";
export type PreSpeechBreathIntensity = "micro" | "natural" | "deliberate";

export interface PreSpeechBreathPlan {
  url: string;
  intensity: PreSpeechBreathIntensity;
  gain: number;
  /** Starts speech before the decorative breath has fully released. */
  voiceOverlapMs: number;
}

export interface PreSpeechBreathPlaybackTiming {
  /** The amount of the source clip allowed into the conversational mix. */
  playbackDurationMs: number;
  /** Start-relative speech onset; the remaining tail overlaps the statement. */
  voiceStartOffsetMs: number;
  /** A small release at the end of a deliberately shortened Foley clip. */
  releaseFadeMs: number;
}

export const PRE_SPEECH_BREATH_URLS = {
  micro: [
    "/audio/voice-presence/breath-micro-01-v2.mp3",
    "/audio/voice-presence/breath-micro-02-v2.mp3",
  ],
  natural: [
    "/audio/voice-presence/breath-natural-01-v2.mp3",
    "/audio/voice-presence/breath-natural-02-v2.mp3",
    "/audio/voice-presence/breath-natural-03-v2.mp3",
  ],
  deliberate: [
    "/audio/voice-presence/breath-deliberate-01-v2.mp3",
    "/audio/voice-presence/breath-deliberate-02-v2.mp3",
  ],
} as const satisfies Record<PreSpeechBreathIntensity, readonly string[]>;

const SURFACE_CHANCE: Readonly<Record<PreSpeechBreathSurface, number>> = {
  chat: 0.2,
  coffee: 0.2,
  debate: 0.28,
  signal: 0.34,
  story: 0.16,
};

const MOOD_CHANCE_MULTIPLIER: Readonly<Record<VoiceDeliveryMood, number>> = {
  joyful: 0.78,
  warm: 0.9,
  neutral: 1,
  guarded: 1.08,
  strained: 1.2,
};

/**
 * Shared conversational placement for every breath surface. These are shorter
 * than the source assets on purpose: an inhale establishes presence, then the
 * adjacent statement arrives while its release falls away. Keeping this table
 * here makes live playback and rendered Signal masters use the same clock.
 */
export const PRE_SPEECH_BREATH_TIMING = {
  micro: { playbackDurationMs: 350, voiceStartOffsetMs: 260, releaseFadeMs: 70 },
  natural: { playbackDurationMs: 480, voiceStartOffsetMs: 350, releaseFadeMs: 90 },
  deliberate: { playbackDurationMs: 640, voiceStartOffsetMs: 470, releaseFadeMs: 110 },
} as const satisfies Record<PreSpeechBreathIntensity, PreSpeechBreathPlaybackTiming>;

const BREATH_DIRECTION_RE =
  /(?:\[[^\]]*\b(?:breath(?:e[sd]?|ing)?|inhales?|exhales?|sighs?|gasps?)\b[^\]]*\]|\*[^*]*\b(?:breath(?:e[sd]?|ing)?|inhales?|exhales?|sighs?|gasps?)\b[^*]*\*|\brespirat(?:or|ion|ing)\b)/iu;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value: string): number {
  return stableHash(value) / 0xffffffff;
}

function normalizedMood(
  value: VoiceDeliveryMood | null | undefined,
): VoiceDeliveryMood {
  return value === "joyful" ||
    value === "warm" ||
    value === "guarded" ||
    value === "strained"
    ? value
    : "neutral";
}

function intensityFor(args: {
  seed: string;
  mood: VoiceDeliveryMood;
  surface: PreSpeechBreathSurface;
}): PreSpeechBreathIntensity {
  const roll = stableUnit(`${args.seed}:pre-speech-breath:intensity`);
  if (args.mood === "strained") return roll < 0.58 ? "deliberate" : "natural";
  if (args.mood === "guarded") {
    if (roll < 0.18) return "deliberate";
    return roll < 0.88 ? "natural" : "micro";
  }
  if (args.mood === "joyful" || args.mood === "warm") {
    return roll < 0.56 ? "micro" : "natural";
  }
  if (args.surface === "debate") {
    if (roll < 0.12) return "micro";
    return roll < 0.84 ? "natural" : "deliberate";
  }
  if (roll < 0.28) return "micro";
  if (roll < 0.9) return "natural";
  return "deliberate";
}

export function hasAuthoredBreathDirection(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && BREATH_DIRECTION_RE.test(value);
}

/**
 * Resolve the bounded playback window for a decoded clip. The source's tail
 * may be shortened, never the following speech; short/missing assets fail
 * down gracefully while retaining a little natural overlap when possible.
 */
export function preSpeechBreathPlaybackTiming(
  plan: PreSpeechBreathPlan,
  decodedDurationMs: number,
): PreSpeechBreathPlaybackTiming {
  const configured = PRE_SPEECH_BREATH_TIMING[plan.intensity];
  const availableMs = Number.isFinite(decodedDurationMs)
    ? Math.max(0, Math.round(decodedDurationMs))
    : 0;
  const playbackDurationMs = Math.min(
    availableMs,
    configured.playbackDurationMs,
  );
  const tailOverlapMs = Math.min(
    Math.max(0, Math.round(plan.voiceOverlapMs)),
    playbackDurationMs,
  );
  const voiceStartOffsetMs = Math.max(
    0,
    Math.min(
      configured.voiceStartOffsetMs,
      playbackDurationMs - tailOverlapMs,
    ),
  );
  return {
    playbackDurationMs,
    voiceStartOffsetMs,
    releaseFadeMs: Math.min(configured.releaseFadeMs, playbackDurationMs),
  };
}

/**
 * Resolves sparse shared microphone presence. The samples stay intentionally
 * unvoiced and surface-owned so they do not imply a specific bot body or alter
 * the bot's authored voice identity.
 */
export function resolvePreSpeechBreathPlan(args: {
  seed: string;
  text: string;
  surface: PreSpeechBreathSurface;
  mood?: VoiceDeliveryMood | null;
  authoredPerformanceText?: string | null;
  enabled?: boolean;
  /** Hard Power: Ready breathless holders never emit pre-speech lung Foley. */
  breathless?: boolean;
}): PreSpeechBreathPlan | null {
  if (args.enabled === false || args.breathless === true) return null;
  const text = args.text.replace(/\s+/gu, " ").trim();
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? [];
  if (text.length < 28 || words.length < 5) return null;
  if (
    hasAuthoredBreathDirection(text) ||
    hasAuthoredBreathDirection(args.authoredPerformanceText)
  ) {
    return null;
  }

  const mood = normalizedMood(args.mood);
  const lengthMultiplier =
    text.length >= 160 ? 1.08 : text.length < 64 ? 0.82 : 1;
  const chance = Math.min(
    0.44,
    SURFACE_CHANCE[args.surface] *
      MOOD_CHANCE_MULTIPLIER[mood] *
      lengthMultiplier,
  );
  if (stableUnit(`${args.seed}:pre-speech-breath:gate`) >= chance) return null;

  const intensity = intensityFor({
    seed: args.seed,
    mood,
    surface: args.surface,
  });
  const urls = PRE_SPEECH_BREATH_URLS[intensity];
  const url =
    urls[stableHash(`${args.seed}:pre-speech-breath:variant`) % urls.length]!;
  const gain =
    intensity === "micro" ? 0.58 : intensity === "natural" ? 0.66 : 0.72;
  const voiceOverlapMs =
    intensity === "micro" ? 90 : intensity === "natural" ? 140 : 180;
  return { url, intensity, gain, voiceOverlapMs };
}
