import {
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeVoiceAccentDefinitionId,
  type LocalVoiceSpeechprintStrength,
} from "./audioVoice.ts";

/**
 * Dialect intonation: the pitch tune of a phrase, distinct from phonemes
 * (speechprint rules), timbre (style directions), and words (vernacular).
 * Each contour is a deterministic piecewise-linear cent envelope over phrase
 * progress, applied by the playback layer's formant-corrected pitch
 * automation — one envelope per played buffer, so streamed clauses each get
 * their own arc and the climbing contour resets at clause boundaries exactly
 * the way South Asian English intonation does.
 */
export const VOICE_INTONATION_CONTOUR_IDS = [
  "climbing-reset",
  "rise-fall",
  "terminal-fall",
  "terminal-rise",
] as const;

export type VoiceIntonationContourId =
  (typeof VOICE_INTONATION_CONTOUR_IDS)[number];

export interface VoiceIntonationKeyframeV1 {
  /** Phrase progress in [0, 1]. */
  progress: number;
  /** Pitch offset in cents at that progress. */
  cents: number;
}

export interface VoiceIntonationContourDefinitionV1 {
  id: VoiceIntonationContourId;
  label: string;
  description: string;
  keyframes: readonly VoiceIntonationKeyframeV1[];
}

export const VOICE_INTONATION_CONTOUR_DEFINITIONS: readonly VoiceIntonationContourDefinitionV1[] =
  [
    {
      id: "climbing-reset",
      label: "Climbing",
      description:
        "Rises steadily across each phrase and resets at the next — the South Asian English arc.",
      keyframes: [
        { progress: 0, cents: -15 },
        { progress: 0.8, cents: 85 },
        { progress: 1, cents: 70 },
      ],
    },
    {
      id: "rise-fall",
      label: "Rise and fall",
      description:
        "High early onset, a held middle, and a firm terminal fall — the Irish English arc.",
      keyframes: [
        { progress: 0, cents: 30 },
        { progress: 0.22, cents: 62 },
        { progress: 0.62, cents: 42 },
        { progress: 1, cents: -72 },
      ],
    },
    {
      id: "terminal-fall",
      label: "Terminal fall",
      description:
        "A level band that ends in a decisive fall — the Scottish English arc.",
      keyframes: [
        { progress: 0, cents: 12 },
        { progress: 0.72, cents: 2 },
        { progress: 1, cents: -95 },
      ],
    },
    {
      id: "terminal-rise",
      label: "Terminal rise",
      description:
        "Level speech lifting at the end of the phrase — the Australasian rise.",
      keyframes: [
        { progress: 0, cents: -5 },
        { progress: 0.68, cents: 5 },
        { progress: 1, cents: 78 },
      ],
    },
  ];

const VOICE_INTONATION_BY_ACCENT_DEFINITION: ReadonlyMap<
  string,
  VoiceIntonationContourId
> = new Map([
  ["irish-english", "rise-fall"],
  ["scottish-english", "terminal-fall"],
  ["australian-english", "terminal-rise"],
  ["new-zealand-english", "terminal-rise"],
  ["indian-english", "climbing-reset"],
  ["pakistani-english", "climbing-reset"],
  ["sri-lankan-english", "climbing-reset"],
  ["bengali-influenced-english", "climbing-reset"],
]);

/** Accent strength scales contour depth like it scales phoneme rules. */
const VOICE_INTONATION_STRENGTH_SCALE: Record<
  LocalVoiceSpeechprintStrength,
  number
> = {
  light: 0.65,
  balanced: 1,
  strong: 1.25,
};

/**
 * Phrases shorter than this get proportionally shallower contours: a full
 * 90-cent climb inside a half-second chunk reads as a chirp, not a dialect.
 */
export const VOICE_INTONATION_FULL_DEPTH_SECONDS = 1.2;

export interface VoiceIntonationPlanV1 {
  contourId: VoiceIntonationContourId;
  scale: number;
}

export function voiceIntonationContourDefinitionForId(
  value: unknown,
): VoiceIntonationContourDefinitionV1 | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase();
  return (
    VOICE_INTONATION_CONTOUR_DEFINITIONS.find(
      (definition) => definition.id === normalized,
    ) ?? null
  );
}

export function voiceIntonationContourForAccentDefinition(
  accentDefinitionId: unknown,
): VoiceIntonationContourId | null {
  const id = normalizeVoiceAccentDefinitionId(accentDefinitionId);
  return id ? VOICE_INTONATION_BY_ACCENT_DEFINITION.get(id) ?? null : null;
}

/**
 * The playback-time intonation plan a voice profile implies: pin-derived,
 * exactly like vernacular, with the accent's strength setting scaling depth.
 * Legacy profiles that stored only a Speechprint influence still resolve.
 */
export function voiceIntonationPlanForProfile(profile: {
  ttsPronunciationEnabled?: unknown;
  accentPronunciationEnabled?: unknown;
  accentDefinitionId?: unknown;
  speechprintInfluence?: unknown;
  speechprintStrength?: unknown;
}): VoiceIntonationPlanV1 | null {
  if (
    profile.ttsPronunciationEnabled === false ||
    (profile.ttsPronunciationEnabled !== true &&
      profile.accentPronunciationEnabled === false)
  ) {
    return null;
  }
  const contourId =
    voiceIntonationContourForAccentDefinition(profile.accentDefinitionId) ??
    voiceIntonationContourForAccentDefinition(
      normalizeLocalVoiceSpeechprintInfluence(profile.speechprintInfluence),
    );
  if (!contourId) return null;
  return {
    contourId,
    scale:
      VOICE_INTONATION_STRENGTH_SCALE[
        normalizeLocalVoiceSpeechprintStrength(profile.speechprintStrength)
      ],
  };
}

/** Piecewise-linear sample of a contour at phrase progress in [0, 1]. */
export function voiceIntonationContourCentsAt(
  contourId: VoiceIntonationContourId,
  progress: number,
): number {
  const definition = voiceIntonationContourDefinitionForId(contourId);
  if (!definition) return 0;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const frames = definition.keyframes;
  let previous = frames[0]!;
  for (const frame of frames) {
    if (clamped <= frame.progress) {
      const span = frame.progress - previous.progress;
      if (span <= 0) return frame.cents;
      const mix = (clamped - previous.progress) / span;
      return previous.cents + (frame.cents - previous.cents) * mix;
    }
    previous = frame;
  }
  return frames[frames.length - 1]!.cents;
}

/**
 * The cent offset the playback layer adds at `elapsedSeconds` into a phrase
 * of `phraseDurationSeconds`. Deterministic, formant-correction friendly, and
 * damped on very short phrases.
 */
export function voiceIntonationDetuneCents(
  plan: VoiceIntonationPlanV1 | null | undefined,
  elapsedSeconds: number,
  phraseDurationSeconds: number,
): number {
  if (!plan) return 0;
  const duration = Number.isFinite(phraseDurationSeconds)
    ? Math.max(0, phraseDurationSeconds)
    : 0;
  if (duration <= 0) return 0;
  const elapsed = Math.max(
    0,
    Math.min(duration, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0),
  );
  const depth =
    plan.scale * Math.min(1, duration / VOICE_INTONATION_FULL_DEPTH_SECONDS);
  return (
    voiceIntonationContourCentsAt(plan.contourId, elapsed / duration) * depth
  );
}
