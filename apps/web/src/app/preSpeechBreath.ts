import type { VoiceDeliveryMood } from "@localai/shared";

export type PreSpeechBreathSurface = "chat" | "coffee" | "signal" | "story";
export type PreSpeechBreathIntensity = "micro" | "natural" | "deliberate";

export interface PreSpeechBreathPlan {
  url: string;
  intensity: PreSpeechBreathIntensity;
  gain: number;
  postGapMs: number;
}

export const PRE_SPEECH_BREATH_URLS = {
  micro: [
    "/audio/voice-presence/breath-micro-01.mp3",
    "/audio/voice-presence/breath-micro-02.mp3",
  ],
  natural: [
    "/audio/voice-presence/breath-natural-01.mp3",
    "/audio/voice-presence/breath-natural-02.mp3",
    "/audio/voice-presence/breath-natural-03.mp3",
  ],
  deliberate: [
    "/audio/voice-presence/breath-deliberate-01.mp3",
    "/audio/voice-presence/breath-deliberate-02.mp3",
  ],
} as const satisfies Record<PreSpeechBreathIntensity, readonly string[]>;

const SURFACE_CHANCE: Readonly<Record<PreSpeechBreathSurface, number>> = {
  chat: 0.2,
  coffee: 0.2,
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

const BREATH_DIRECTION_RE =
  /(?:\[[^\]]*\b(?:breath(?:e[sd]?|ing)?|inhales?|exhales?|sighs?|gasps?)\b[^\]]*\]|\*[^*]*\b(?:breath(?:e[sd]?|ing)?|inhales?|exhales?|sighs?|gasps?)\b[^*]*\*)/iu;

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

function normalizedMood(value: VoiceDeliveryMood | null | undefined): VoiceDeliveryMood {
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
  if (roll < 0.28) return "micro";
  if (roll < 0.9) return "natural";
  return "deliberate";
}

export function hasAuthoredBreathDirection(value: string | null | undefined): boolean {
  return typeof value === "string" && BREATH_DIRECTION_RE.test(value);
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
}): PreSpeechBreathPlan | null {
  if (args.enabled === false) return null;
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
  const lengthMultiplier = text.length >= 160 ? 1.08 : text.length < 64 ? 0.82 : 1;
  const chance = Math.min(
    0.44,
    SURFACE_CHANCE[args.surface] * MOOD_CHANCE_MULTIPLIER[mood] * lengthMultiplier,
  );
  if (stableUnit(`${args.seed}:pre-speech-breath:gate`) >= chance) return null;

  const intensity = intensityFor({ seed: args.seed, mood });
  const urls = PRE_SPEECH_BREATH_URLS[intensity];
  const url = urls[stableHash(`${args.seed}:pre-speech-breath:variant`) % urls.length]!;
  const gain = intensity === "micro" ? 0.58 : intensity === "natural" ? 0.66 : 0.72;
  const postGapMs = intensity === "micro" ? 52 : intensity === "natural" ? 68 : 88;
  return { url, intensity, gain, postGapMs };
}
