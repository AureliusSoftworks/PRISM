import {
  normalizeBotVernacularId,
  type BotVernacularId,
} from "./botVernacular.ts";
import {
  normalizeBotLocalLaughDelimiter,
  normalizeBotLocalLaughSyllable,
} from "./localLaugh.ts";

/** Account-wide voice mode. This is intentionally separate from BotVoicePreset,
 * which controls how a bot writes rather than how it sounds. */
export type VoiceMode = "mute" | "english" | "babble" | "bottish";
export type EnglishVoiceEngine = "builtin" | "elevenlabs";

export const VOICE_EFFECTS = [
  "clean",
  "radio",
  "robot",
  "echo",
  "chorus",
  "resonance",
  "deep-space",
] as const;
export type VoiceEffect = (typeof VOICE_EFFECTS)[number];

export const VOICE_EFFECT_LABELS: Record<VoiceEffect, string> = {
  clean: "Clean",
  radio: "Radio",
  robot: "Robot",
  echo: "Echo",
  chorus: "Prism",
  resonance: "Resonance",
  "deep-space": "Deep Space",
};

export const VOICE_EFFECT_DESCRIPTIONS: Record<VoiceEffect, string> = {
  clean: "Unprocessed voice.",
  radio: "Narrow-band broadcast tone with a trace of radio noise.",
  robot: "Mechanical pulse and a subtly doubled synthetic carrier.",
  echo: "Two level-controlled repeats behind the original voice.",
  chorus: "PRISM's subtle tuned voice with a gently refracted double.",
  resonance:
    "A dark, weighty mechanical double with a restrained low reflection.",
  "deep-space": "A lower spectral double with a distant trailing reflection.",
};

/** The stored chorus ID preserves existing profiles and exports while its
 * player-facing Prism label gives the cast a restrained shared house sound. */
export const DEFAULT_VOICE_EFFECT: VoiceEffect = "chorus";

/** Backwards-compatible names for portable profiles and older call sites. */
export const ELEVENLABS_VOICE_EFFECTS = VOICE_EFFECTS;
export type ElevenLabsVoiceEffect = VoiceEffect;
export const ELEVENLABS_VOICE_EFFECT_LABELS = VOICE_EFFECT_LABELS;
export const ELEVENLABS_VOICE_EFFECT_DESCRIPTIONS = VOICE_EFFECT_DESCRIPTIONS;

export const BOT_AUDIO_VOICE_IDS = [
  "voice-1",
  "voice-2",
  "voice-3",
  "voice-4",
  "voice-5",
  "voice-6",
  "voice-7",
  "voice-8",
  "voice-9",
  "voice-10",
  "voice-11",
  "voice-12",
  "voice-13",
  "voice-14",
  "voice-15",
  "voice-16",
  "voice-17",
  "voice-18",
  "voice-19",
  "voice-20",
  "voice-21",
  "voice-22",
  "voice-23",
  "voice-24",
  "voice-25",
  "voice-26",
  "voice-27",
  "voice-28",
] as const;
export type BotAudioVoiceId = (typeof BOT_AUDIO_VOICE_IDS)[number];

export const LOCAL_VOICE_PRESENTATIONS = ["feminine", "masculine"] as const;
export type LocalVoicePresentation = (typeof LOCAL_VOICE_PRESENTATIONS)[number];

/** PRISM's portable, always-local English voice pack. The engine voice IDs are
 * implementation details; profiles continue to persist only the stable
 * `voice-1` through `voice-28` identities. `selectionOrder` is deliberately
 * independent from those persisted IDs so familiar PRISM voices can lead the
 * picker without breaking existing bot files. */
export const PRISM_BUILTIN_ENGLISH_VOICES = [
  {
    voiceId: "voice-1",
    engineVoiceId: "af_heart",
    name: "Heart",
    locale: "en-US",
    character: "Warm",
    presentation: "feminine",
    selectionOrder: 5,
  },
  {
    voiceId: "voice-2",
    engineVoiceId: "af_bella",
    name: "Iris",
    locale: "en-US",
    character: "Rich",
    presentation: "feminine",
    selectionOrder: 2,
  },
  {
    voiceId: "voice-3",
    engineVoiceId: "am_michael",
    name: "Rowan",
    locale: "en-US",
    character: "Grounded",
    presentation: "masculine",
    selectionOrder: 1,
  },
  {
    voiceId: "voice-4",
    engineVoiceId: "bf_emma",
    name: "Pia",
    locale: "en-GB",
    character: "Clear",
    presentation: "feminine",
    selectionOrder: 0,
  },
  {
    voiceId: "voice-5",
    engineVoiceId: "bm_george",
    name: "George",
    locale: "en-GB",
    character: "Measured",
    presentation: "masculine",
    selectionOrder: 6,
  },
  {
    voiceId: "voice-6",
    engineVoiceId: "af_aoede",
    name: "Sol",
    locale: "en-US",
    character: "Bright",
    presentation: "feminine",
    selectionOrder: 3,
  },
  {
    voiceId: "voice-7",
    engineVoiceId: "af_kore",
    name: "Mira",
    locale: "en-US",
    character: "Composed",
    presentation: "feminine",
    selectionOrder: 4,
  },
  {
    voiceId: "voice-8",
    engineVoiceId: "af_nicole",
    name: "Nicole",
    locale: "en-US",
    character: "Smooth",
    presentation: "feminine",
    selectionOrder: 7,
  },
  {
    voiceId: "voice-9",
    engineVoiceId: "af_sarah",
    name: "Sarah",
    locale: "en-US",
    character: "Natural",
    presentation: "feminine",
    selectionOrder: 8,
  },
  {
    voiceId: "voice-10",
    engineVoiceId: "am_fenrir",
    name: "Fenrir",
    locale: "en-US",
    character: "Deep",
    presentation: "masculine",
    selectionOrder: 9,
  },
  {
    voiceId: "voice-11",
    engineVoiceId: "am_puck",
    name: "Puck",
    locale: "en-US",
    character: "Lively",
    presentation: "masculine",
    selectionOrder: 10,
  },
  {
    voiceId: "voice-12",
    engineVoiceId: "bm_fable",
    name: "Fable",
    locale: "en-GB",
    character: "Expressive",
    presentation: "masculine",
    selectionOrder: 11,
  },
  {
    voiceId: "voice-13",
    engineVoiceId: "af_alloy",
    name: "Alloy",
    locale: "en-US",
    character: "Balanced",
    presentation: "feminine",
    selectionOrder: 12,
  },
  {
    voiceId: "voice-14",
    engineVoiceId: "af_jessica",
    name: "Jessica",
    locale: "en-US",
    character: "Confident",
    presentation: "feminine",
    selectionOrder: 13,
  },
  {
    voiceId: "voice-15",
    engineVoiceId: "af_nova",
    name: "Nova",
    locale: "en-US",
    character: "Airy",
    presentation: "feminine",
    selectionOrder: 14,
  },
  {
    voiceId: "voice-16",
    engineVoiceId: "af_river",
    name: "River",
    locale: "en-US",
    character: "Relaxed",
    presentation: "feminine",
    selectionOrder: 15,
  },
  {
    voiceId: "voice-17",
    engineVoiceId: "af_sky",
    name: "Sky",
    locale: "en-US",
    character: "Light",
    presentation: "feminine",
    selectionOrder: 16,
  },
  {
    voiceId: "voice-18",
    engineVoiceId: "am_adam",
    name: "Adam",
    locale: "en-US",
    character: "Direct",
    presentation: "masculine",
    selectionOrder: 17,
  },
  {
    voiceId: "voice-19",
    engineVoiceId: "am_echo",
    name: "Echo",
    locale: "en-US",
    character: "Resonant",
    presentation: "masculine",
    selectionOrder: 18,
  },
  {
    voiceId: "voice-20",
    engineVoiceId: "am_eric",
    name: "Eric",
    locale: "en-US",
    character: "Natural",
    presentation: "masculine",
    selectionOrder: 19,
  },
  {
    voiceId: "voice-21",
    engineVoiceId: "am_liam",
    name: "Liam",
    locale: "en-US",
    character: "Clear",
    presentation: "masculine",
    selectionOrder: 20,
  },
  {
    voiceId: "voice-22",
    engineVoiceId: "am_onyx",
    name: "Onyx",
    locale: "en-US",
    character: "Weighty",
    presentation: "masculine",
    selectionOrder: 21,
  },
  {
    voiceId: "voice-23",
    engineVoiceId: "am_santa",
    name: "Santa",
    locale: "en-US",
    character: "Round",
    presentation: "masculine",
    selectionOrder: 22,
  },
  {
    voiceId: "voice-24",
    engineVoiceId: "bf_alice",
    name: "Alice",
    locale: "en-GB",
    character: "Poised",
    presentation: "feminine",
    selectionOrder: 23,
  },
  {
    voiceId: "voice-25",
    engineVoiceId: "bf_isabella",
    name: "Isabella",
    locale: "en-GB",
    character: "Warm",
    presentation: "feminine",
    selectionOrder: 24,
  },
  {
    voiceId: "voice-26",
    engineVoiceId: "bf_lily",
    name: "Lily",
    locale: "en-GB",
    character: "Gentle",
    presentation: "feminine",
    selectionOrder: 25,
  },
  {
    voiceId: "voice-27",
    engineVoiceId: "bm_daniel",
    name: "Daniel",
    locale: "en-GB",
    character: "Assured",
    presentation: "masculine",
    selectionOrder: 26,
  },
  {
    voiceId: "voice-28",
    engineVoiceId: "bm_lewis",
    name: "Lewis",
    locale: "en-GB",
    character: "Conversational",
    presentation: "masculine",
    selectionOrder: 27,
  },
] as const satisfies ReadonlyArray<{
  voiceId: BotAudioVoiceId;
  engineVoiceId: string;
  name: string;
  locale: string;
  character: string;
  presentation: LocalVoicePresentation;
  selectionOrder: number;
}>;

export type PrismBuiltinEnglishVoice =
  (typeof PRISM_BUILTIN_ENGLISH_VOICES)[number];

export function prismBuiltinEnglishVoice(
  voiceId: BotAudioVoiceId,
): PrismBuiltinEnglishVoice {
  return (
    PRISM_BUILTIN_ENGLISH_VOICES.find((voice) => voice.voiceId === voiceId) ??
    PRISM_BUILTIN_ENGLISH_VOICES[0]
  );
}

export interface BuiltinAccentRealizationBlendV1 {
  towardEngineVoiceIds: readonly string[];
  awayEngineVoiceIds: readonly string[];
  weight: number;
}

/**
 * Weight 1 moves a voice by exactly the mean style difference between the two
 * regional groups. Measured on the packaged engine: every shipped cross-region
 * voice lands a solid rhotic F3 dip at 1.0, while pitch, pacing, and pairwise
 * voice separation stay at their native values.
 */
export const BUILTIN_ACCENT_REALIZATION_BLEND_WEIGHT = 1;

/**
 * Regional style groups used to derive the accent direction. Deliberately
 * excludes novelty or off-manifold styles (am_adam, am_santa, whispered
 * af_nicole) so the group mean captures accent, not character extremes.
 */
const BUILTIN_ACCENT_REALIZATION_GROUPS: Record<
  "a" | "b",
  Record<LocalVoicePresentation, readonly string[]>
> = {
  a: {
    feminine: [
      "af_heart",
      "af_bella",
      "af_aoede",
      "af_kore",
      "af_sarah",
      "af_jessica",
      "af_nova",
      "af_river",
      "af_sky",
      "af_alloy",
    ],
    masculine: [
      "am_michael",
      "am_fenrir",
      "am_puck",
      "am_echo",
      "am_eric",
      "am_liam",
      "am_onyx",
    ],
  },
  b: {
    feminine: ["bf_emma", "bf_alice", "bf_isabella", "bf_lily"],
    masculine: ["bm_george", "bm_fable", "bm_daniel", "bm_lewis"],
  },
};

/**
 * The packaged engine realizes accents through a per-voice style vector, and
 * that style dominates phoneme tokens for coda R: a British style renders an
 * American target's explicit "ɹ" silently, no matter how the IPA is written.
 * When the Accent Map's target locale disagrees with the voice's native
 * region, the utterance's style row is translated by the accent direction —
 * mean(target-region group) minus mean(native-region group). A uniform
 * translation carries the accent while preserving every pairwise difference
 * between voices, so Daniel, George, and Lewis stay three distinct people
 * with the same accent instead of collapsing into one shared anchor voice.
 * The bot's selected voice identity never changes — this shades one
 * utterance's rendering, exactly like the target IPA it accompanies.
 */
export function builtinAccentRealizationBlend(args: {
  engineVoiceId: string;
  targetLocale: "en-US" | "en-GB";
}): BuiltinAccentRealizationBlendV1 | null {
  const region = args.targetLocale === "en-GB" ? "b" : "a";
  if (!/^[ab][fm]_/u.test(args.engineVoiceId)) return null;
  if (args.engineVoiceId.startsWith(region)) return null;
  const nativeRegion = region === "a" ? "b" : "a";
  const presentation: LocalVoicePresentation =
    args.engineVoiceId[1] === "m" ? "masculine" : "feminine";
  return {
    towardEngineVoiceIds:
      BUILTIN_ACCENT_REALIZATION_GROUPS[region][presentation],
    awayEngineVoiceIds:
      BUILTIN_ACCENT_REALIZATION_GROUPS[nativeRegion][presentation],
    weight: BUILTIN_ACCENT_REALIZATION_BLEND_WEIGHT,
  };
}

/**
 * Delivery moods realized the same way as accents: a measured direction in
 * style space. Both sides of every direction are same-presentation American
 * voices, so gender identity and accent cancel in the difference and the
 * delta carries only delivery — a mood never nudges a bot across regions and
 * composes cleanly with the accent direction. Weights come from a ladder
 * measurement per mood and presentation (F0, melodic range, tempo, spectral
 * tilt, voicing fraction) chosen where the mood clearly lands while the
 * voice remains unmistakably itself; 0.7 and above drifts identity.
 *
 * Acoustic anchors, measured on the packaged voices: af_nicole is the true
 * whisper (half-voiced, flat melody, breath-forward tilt) and powers the
 * feminine guarded hush; the catalog has no masculine whisper, so masculine
 * guarded is subdued — lowered, darkened, slowed — instead. Strained presses
 * faster and brighter; on masculine voices it overlaps joyful at the
 * synthesis layer and relies on the mood rate transforms (joyful brisk,
 * strained held back) for the rest of the separation.
 */
const BUILTIN_MOOD_REALIZATION_DIRECTIONS: Record<
  Exclude<VoiceDeliveryMood, "neutral">,
  Record<
    LocalVoicePresentation,
    { toward: readonly string[]; away: readonly string[]; weight: number }
  >
> = {
  joyful: {
    feminine: {
      toward: ["af_jessica", "af_heart", "af_sarah"],
      away: ["af_river", "af_alloy", "af_nova"],
      weight: 0.5,
    },
    masculine: {
      toward: ["am_santa", "am_fenrir", "am_eric"],
      away: ["am_onyx", "am_echo", "am_adam"],
      weight: 0.5,
    },
  },
  warm: {
    feminine: {
      toward: ["af_bella", "af_kore", "af_aoede"],
      away: ["af_jessica", "af_sarah"],
      weight: 0.5,
    },
    masculine: {
      toward: ["am_michael", "am_onyx"],
      away: ["am_eric", "am_fenrir"],
      weight: 0.35,
    },
  },
  guarded: {
    feminine: {
      toward: ["af_nicole"],
      away: ["af_jessica", "af_sarah", "af_heart"],
      weight: 0.4,
    },
    masculine: {
      toward: ["am_onyx", "am_echo"],
      away: ["am_fenrir", "am_eric"],
      weight: 0.5,
    },
  },
  strained: {
    feminine: {
      toward: ["af_sarah", "af_jessica"],
      away: ["af_aoede", "af_bella", "af_nicole"],
      weight: 0.4,
    },
    masculine: {
      toward: ["am_eric"],
      away: ["am_onyx", "am_michael"],
      weight: 0.35,
    },
  },
};

/**
 * Melodic range as a style direction: wide-melody voices minus flat-melody
 * voices, per presentation, American-only on both sides so gender and accent
 * cancel (measured F0 IQR extremes: am_santa 94 vs am_onyx 21). Dialects
 * scale it — Irish speech ranges wider, Scottish narrower (the direction
 * simply reverses; the runtime clamps negative weights), South Asian English
 * slightly wider. This supports the client-side intonation contour from
 * underneath rather than replacing it.
 */
const BUILTIN_MELODICITY_DIRECTIONS: Record<
  LocalVoicePresentation,
  { wide: readonly string[]; flat: readonly string[] }
> = {
  feminine: {
    wide: ["af_jessica", "af_sarah", "af_kore"],
    flat: ["af_river", "af_bella", "af_alloy"],
  },
  masculine: {
    wide: ["am_santa", "am_fenrir", "am_liam"],
    flat: ["am_onyx", "am_echo", "am_adam"],
  },
};

const BUILTIN_MELODICITY_BY_ACCENT: ReadonlyMap<string, number> = new Map([
  ["irish-english", 0.25],
  ["scottish-english", -0.2],
  ["indian-english", 0.15],
  ["pakistani-english", 0.15],
  ["sri-lankan-english", 0.15],
  ["bengali-influenced-english", 0.15],
]);

export function builtinMelodicityRealizationBlend(args: {
  engineVoiceId: string;
  accentDefinitionId: unknown;
  speechprintInfluence?: unknown;
}): BuiltinAccentRealizationBlendV1 | null {
  if (!/^[ab][fm]_/u.test(args.engineVoiceId)) return null;
  const accentId =
    normalizeVoiceAccentDefinitionId(args.accentDefinitionId) ??
    normalizeVoiceAccentDefinitionId(args.speechprintInfluence);
  const signedWeight = accentId
    ? BUILTIN_MELODICITY_BY_ACCENT.get(accentId) ?? 0
    : 0;
  if (signedWeight === 0) return null;
  const presentation: LocalVoicePresentation =
    args.engineVoiceId[1] === "m" ? "masculine" : "feminine";
  const direction = BUILTIN_MELODICITY_DIRECTIONS[presentation];
  return signedWeight > 0
    ? {
        towardEngineVoiceIds: direction.wide,
        awayEngineVoiceIds: direction.flat,
        weight: signedWeight,
      }
    : {
        towardEngineVoiceIds: direction.flat,
        awayEngineVoiceIds: direction.wide,
        weight: -signedWeight,
      };
}

export function builtinMoodRealizationBlend(args: {
  engineVoiceId: string;
  deliveryMood: unknown;
}): BuiltinAccentRealizationBlendV1 | null {
  const mood = normalizeVoiceDeliveryMood(args.deliveryMood);
  if (mood === "neutral") return null;
  if (!/^[ab][fm]_/u.test(args.engineVoiceId)) return null;
  const presentation: LocalVoicePresentation =
    args.engineVoiceId[1] === "m" ? "masculine" : "feminine";
  const direction = BUILTIN_MOOD_REALIZATION_DIRECTIONS[mood][presentation];
  return {
    towardEngineVoiceIds: direction.toward,
    awayEngineVoiceIds: direction.away,
    weight: direction.weight,
  };
}

export const BOT_VOICE_TEXTURE_PRESETS = [
  "clean",
  "crt-speaker",
  "lofi",
  "tape",
  "damaged-speaker",
] as const;
export type BotVoiceTexturePreset = (typeof BOT_VOICE_TEXTURE_PRESETS)[number];

export interface BotVoiceTextureV1 {
  preset: BotVoiceTexturePreset;
  amount: number;
  bandwidth: number;
  noise: number;
  instability: number;
  distortion: number;
  damage: number;
}

export interface LegacyBotAudioVoiceProfileV1 {
  v: 1;
  baseVoiceId: BotAudioVoiceId;
  pitch: number;
  warmth: number;
  pace: number;
  lilt: number;
  signal?: number;
  /** Accepted on legacy imports and serialized forward into V2. */
  elevenLabsStability?: number;
}

export interface BotAudioVoiceProfileV2 {
  v: 2;
  enabled: boolean;
  baseVoiceId: BotAudioVoiceId;
  systemVoiceName?: string | null;
  elevenLabsVoiceId?: string | null;
  /** Exact provider identity that wins over the catalog selection when set. */
  elevenLabsVoiceIdOverride?: string | null;
  /** True once Premium identity has been assigned or explicitly declined. */
  elevenLabsVoiceInitialized?: boolean;
  /** Provider-derived catalog metadata; separate from the character Accent Map. */
  elevenLabsNativeAccentHint?: string | null;
  /** Portable playback effect. The key name is retained for export compatibility. */
  elevenLabsEffect: VoiceEffect;
  /** Distinguishes an explicit Clean choice from the former local-only default. */
  voiceEffectExplicit?: boolean;
  /** Comma-separated Eleven v3 audio directions such as "warm, hushed". */
  elevenLabsDirection?: string | null;
  /** ElevenLabs performance consistency. Optional for older portable profiles. */
  elevenLabsStability?: number;
  pitch: number;
  warmth: number;
  /** Local-only vocal tract openness. Negative is open; positive is nasal. */
  openness?: number;
  /** Local-only perceived vocal weight. Negative is light; positive is chest-forward. */
  weight?: number;
  /** Local-only spectral brightness, retained alongside the legacy EQ tilt. */
  brightness?: number;
  /** Local-only formant/resonance depth. */
  resonance?: number;
  /** Local engine choice. Older profiles inherit the account default. */
  localEnginePreference?: LocalVoiceEnginePreference;
  localVoiceSource?: LocalVoiceSource;
  localReferenceId?: string | null;
  /** Authored one-to-four-letter laugh syllable for the Local Instant lane. */
  localLaughSyllable?: string | null;
  /** Authored separator between repeated Local laugh syllables. */
  localLaughDelimiter?: string;
  accentLocale?: string | null;
  accentMode?: LocalVoiceAccentMode;
  pronunciationBase?: LocalVoicePronunciationBase;
  /** Provider-neutral Accent Map identity. Legacy profiles resolve from the
   * Speechprint influence and pronunciation foundation instead. */
  accentDefinitionId?: VoiceAccentDefinitionId | null;
  /** Whether the saved Accent Map is allowed to shape synthesized speech. */
  accentPronunciationEnabled?: boolean;
  /** Word-side twin of the Accent pin: shapes what the bot writes, never how
   * text is pronounced. Authored identity; absent means plain speech. */
  vernacularId?: BotVernacularId | null;
  /** Exact normalized Accent Map position. The chosen influence remains approximate. */
  pronunciationMapPoint?: LocalVoicePronunciationMapPoint;
  speechprintInfluence?: LocalVoiceSpeechprintInfluence;
  speechprintStrength?: LocalVoiceSpeechprintStrength;
  speechprintVariationSeed?: string;
  /** Local-lane Feel tempo. */
  pace: number;
  /** Local-lane Feel melodic wander. */
  lilt: number;
  /** Premium-lane Feel pitch. Defaults to neutral when absent. */
  premiumPitch?: number;
  /** Premium-lane Feel tempo. Falls back to local pace for older profiles. */
  premiumPace?: number;
  /** Premium-lane Feel melodic wander. Falls back to local lilt for older profiles. */
  premiumLilt?: number;
  bottishTone: number;
  /**
   * Bodily Foley material continuum for stock Action SFX fallbacks.
   * 0 = Artificial, 0.5 = Organic, 1 = Ethereal.
   */
  corporality?: number;
  /** Signed low/high shelf tilt. Negative is low-forward; positive is bright. */
  eqTilt: number;
  /** Relative per-bot output trim in decibels; account Voice Volume stays master. */
  gainDb: number;
  volume: number;
  texture: BotVoiceTextureV1;
  /** Optional looping avatar sound that follows the bot's visible state. */
  avatarSfx?: BotAvatarSfxV1;
  /** Portable generation/editing brief retained even before audio exists. */
  avatarSfxPrompt?: string;
  /** Deliberately suppresses both a custom loop and PRISM's built-in fallback. */
  avatarSfxMuted?: boolean;
}

export const LOCAL_VOICE_ENGINE_PREFERENCES = [
  "inherit",
  "auto",
  "voice-plus",
  "instant",
] as const;
export type LocalVoiceEnginePreference =
  (typeof LOCAL_VOICE_ENGINE_PREFERENCES)[number];

export const LOCAL_VOICE_SOURCES = ["portable", "system", "reference"] as const;
export type LocalVoiceSource = (typeof LOCAL_VOICE_SOURCES)[number];

export const LOCAL_VOICE_ACCENT_MODES = [
  "prefer-genuine",
  "approximate",
] as const;
export type LocalVoiceAccentMode = (typeof LOCAL_VOICE_ACCENT_MODES)[number];

export const LOCAL_VOICE_PRONUNCIATION_BASES = [
  "follow-voice",
  "en-US",
  "en-GB",
] as const;
export type LocalVoicePronunciationBase =
  (typeof LOCAL_VOICE_PRONUNCIATION_BASES)[number];

export interface LocalVoicePronunciationMapPoint {
  x: number;
  y: number;
}

/** Stable, provider-neutral key into the shared voice accent registry. */
export type VoiceAccentDefinitionId = string;

export const LOCAL_VOICE_SPEECHPRINT_INFLUENCES = [
  "none",
  "spanish-influenced-english",
  "latin-american-spanish-influenced-english",
  "mexican-spanish-influenced-english",
  "brazilian-portuguese-influenced-english",
  "european-portuguese-influenced-english",
  "mandarin-influenced-english",
  "cantonese-influenced-english",
  "japanese-influenced-english",
  "korean-influenced-english",
  "indian-english",
  "pakistani-english",
  "bengali-influenced-english",
  "sri-lankan-english",
  "french-influenced-english",
  "german-influenced-english",
  "dutch-influenced-english",
  "nordic-influenced-english",
  "polish-influenced-english",
  "greek-influenced-english",
  "russian-influenced-english",
  "italian-influenced-english",
  "irish-english",
  "scottish-english",
  "australian-english",
  "new-zealand-english",
  "canadian-english",
  "new-york-english",
  "new-jersey-english",
  "southern-us-english",
  "southern-california-english",
  "bay-area-english",
  "inland-north-english",
  "texas-english",
  "appalachian-english",
  "eastern-new-england-english",
  "north-florida-english",
  "miami-english",
  "modern-rp-english",
  "cockney-english",
  "estuary-english",
  "multicultural-london-english",
  "essex-english",
  "parisian-french-influenced-english",
  "southern-french-influenced-english",
  "northern-german-influenced-english",
  "bavarian-german-influenced-english",
  "northern-italian-influenced-english",
  "southern-italian-influenced-english",
  "andalusian-spanish-influenced-english",
  "caribbean-english",
  "north-african-arabic-influenced-english",
  "middle-eastern-arabic-influenced-english",
  "persian-influenced-english",
  "turkish-influenced-english",
  "nigerian-english",
  "east-african-english",
  "south-african-english",
  "filipino-english",
  "vietnamese-influenced-english",
  "thai-influenced-english",
  "indonesian-influenced-english",
  "singapore-english",
  "pacific-island-english",
] as const;
export type LocalVoiceSpeechprintInfluence =
  (typeof LOCAL_VOICE_SPEECHPRINT_INFLUENCES)[number];

export const LOCAL_VOICE_SPEECHPRINT_STRENGTHS = [
  "light",
  "balanced",
  "strong",
] as const;
export type LocalVoiceSpeechprintStrength =
  (typeof LOCAL_VOICE_SPEECHPRINT_STRENGTHS)[number];

export interface LocalVoiceSpeechprintV1 {
  influence: LocalVoiceSpeechprintInfluence;
  strength: LocalVoiceSpeechprintStrength;
  /** Opaque portable seed for stable character-specific optional rules. */
  variationSeed: string;
}

export interface BotLocalVoiceToneV1 {
  pitch: number;
  /** Local-only tempo. Pace is the only Feel control that changes duration. */
  pace: number;
  /** Local-only melodic pitch wander applied after synthesis. */
  lilt: number;
  warmth: number;
  openness: number;
  weight: number;
  brightness: number;
  resonance: number;
  gainDb: number;
}

export interface BotLocalVoiceProfileV1 {
  enginePreference: LocalVoiceEnginePreference;
  source: LocalVoiceSource;
  archetypeId: BotAudioVoiceId;
  systemVoiceName?: string | null;
  referenceId?: string | null;
  laughSyllable?: string | null;
  laughDelimiter?: string;
  accent: {
    locale: string;
    mode: LocalVoiceAccentMode;
  };
  pronunciation?: {
    base: LocalVoicePronunciationBase;
    accentPronunciationEnabled?: boolean;
    accentDefinitionId?: VoiceAccentDefinitionId | null;
    vernacularId?: BotVernacularId | null;
    mapPoint?: LocalVoicePronunciationMapPoint;
  };
  speechprint: LocalVoiceSpeechprintV1;
  tone: BotLocalVoiceToneV1;
}

export interface BotPremiumVoiceProfileV1 {
  voiceId?: string | null;
  voiceIdOverride?: string | null;
  initialized?: boolean;
  direction?: string | null;
  stability?: number;
  /** Provider-derived catalog metadata; never reinterprets the Accent Map. */
  nativeAccentHint?: string | null;
  /** Premium-only pitch transform applied after ElevenLabs synthesis. */
  pitch: number;
  /** Premium-only tempo. Pace is the only Feel control that changes duration. */
  pace: number;
  /** Premium-only melodic pitch wander applied after synthesis. */
  lilt: number;
}

export interface BotVoiceDeliveryProfileV1 {
  effect: VoiceEffect;
  effectExplicit?: boolean;
  /**
   * Legacy shared pace retained for older V3 files. Newer profiles store
   * per-lane pace under local.tone / premium and leave this unset on write.
   */
  pace?: number;
  /**
   * Legacy shared lilt retained for older V3 files. Newer profiles store
   * per-lane lilt under local.tone / premium and leave this unset on write.
   */
  lilt?: number;
  volume: number;
  texture: BotVoiceTextureV1;
}

/** Which English synthesis lane owns pitch / pace / lilt Feel controls. */
export type BotVoiceFeelLane = "local" | "premium";

/** Portable V3 storage separates local identity/feel from Premium identity/feel
 * while keeping playback effect and master volume shared. */
export interface BotAudioVoiceProfileV3 {
  v: 3;
  enabled: boolean;
  local: BotLocalVoiceProfileV1;
  premium: BotPremiumVoiceProfileV1;
  delivery: BotVoiceDeliveryProfileV1;
  bottishTone: number;
  /**
   * Bodily Foley material continuum for stock Action SFX fallbacks.
   * 0 = Artificial, 0.5 = Organic, 1 = Ethereal.
   */
  corporality?: number;
  avatarSfx?: BotAvatarSfxV1;
  avatarSfxPrompt?: string;
  avatarSfxMuted?: boolean;
}

export const BOT_AVATAR_SFX_MAX_BYTES = 4 * 1024 * 1024;
export const BOT_AVATAR_SFX_PROMPT_MAX_LENGTH = 400;
export const BOT_AVATAR_SFX_FILE_NAME_MAX_LENGTH = 160;
/** Player-facing 100% for Avatar SFX. Intentionally quiet beside speech. */
export const BOT_AVATAR_SFX_MAX_VOLUME = 0.2;
export const BOT_AVATAR_SFX_DEFAULT_VOLUME = BOT_AVATAR_SFX_MAX_VOLUME;

export interface BotAvatarSfxV1 {
  v: 1;
  source: "upload" | "elevenlabs";
  audioDataUrl: string;
  fileName?: string;
  prompt?: string;
  playWhileTalking: boolean;
  playWhileIdle: boolean;
  playWhileThinking: boolean;
  volume: number;
}

export type BotAudioVoiceProfile =
  | LegacyBotAudioVoiceProfileV1
  | BotAudioVoiceProfileV2
  | BotAudioVoiceProfileV3;

/** Backwards-compatible exported name used by the Phase 1 call sites. New
 * persistence writes V3 through serializeBotAudioVoiceProfileV1. */
export type BotAudioVoiceProfileV1 = BotAudioVoiceProfile;
export type NormalizedBotAudioVoiceProfileV1 = BotAudioVoiceProfileV2;

/** Shared emotional delivery state for every spoken assistant surface. */
export type VoiceDeliveryMood =
  "joyful" | "warm" | "neutral" | "guarded" | "strained";

/** A modest performance layer over the bot's authored base pace. Normal
 * delivery is intentionally a little brisk so long-form spoken experiences
 * do not sag, while the emotional ordering still matches visual reveals. */
export const VOICE_DELIVERY_RATE_BY_MOOD: Readonly<
  Record<VoiceDeliveryMood, number>
> = {
  joyful: 1.18,
  warm: 1.12,
  neutral: 1.08,
  guarded: 1,
  strained: 0.94,
};

/** Provider-only Eleven v3 direction for a spoken mood. Neutral delivery stays
 * untagged so ordinary speech does not become performative by default. */
export const ELEVENLABS_VOICE_DIRECTION_BY_MOOD: Readonly<
  Record<Exclude<VoiceDeliveryMood, "neutral">, string>
> = {
  joyful: "delighted",
  warm: "warmly",
  guarded: "reserved",
  strained: "strained",
};

export const ELEVENLABS_VOICE_SPEED_MIN = 0.7;
export const ELEVENLABS_VOICE_SPEED_MAX = 1.2;
export const BOT_AUDIO_VOICE_PACE_RATE_DEPTH = 0.24;
export const BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS = 650;
export const BOT_VOICE_EQ_TILT_DB_MAX = 6;
export const BOT_VOICE_LOW_SHELF_HZ = 180;
export const BOT_VOICE_HIGH_SHELF_HZ = 4_000;
export const BOT_VOICE_GAIN_DB_MIN = -12;
export const BOT_VOICE_GAIN_DB_MAX = 6;
export const ELEVENLABS_VOICE_STABILITY_DEFAULT = 0.52;

/** The browser's one source of truth for independent voice tempo and pitch.
 * Tempo is the only control that changes duration; pitch and lilt only change
 * spectral pitch through the playback DSP. */
export interface VoicePlaybackTransformV1 {
  tempo: number;
  pitchCents: number;
}

export interface BotVoiceCharacterV1 {
  eqTilt: number;
  lowShelfDb: number;
  highShelfDb: number;
  gainDb: number;
  gainMultiplier: number;
}

/** Ephemeral modulation around a bot's persisted voice identity. */
export interface CoffeeVoiceDeliveryEnvelope {
  paceMultiplier: number;
  pitchDeltaCents: number;
  liltDelta: number;
  warmthDelta: number;
  emphasisStrength: number;
}

export const NEUTRAL_COFFEE_VOICE_DELIVERY_ENVELOPE: CoffeeVoiceDeliveryEnvelope =
  {
    paceMultiplier: 1,
    pitchDeltaCents: 0,
    liltDelta: 0,
    warmthDelta: 0,
    emphasisStrength: 0,
  };

export function normalizeVoiceDeliveryMood(value: unknown): VoiceDeliveryMood {
  return value === "joyful" ||
    value === "warm" ||
    value === "guarded" ||
    value === "strained"
    ? value
    : "neutral";
}

export function elevenLabsVoiceDirectionForMood(value: unknown): string | null {
  const mood = normalizeVoiceDeliveryMood(value);
  return mood === "neutral" ? null : ELEVENLABS_VOICE_DIRECTION_BY_MOOD[mood];
}

export function voiceDeliveryRateForMood(value: unknown): number {
  return VOICE_DELIVERY_RATE_BY_MOOD[normalizeVoiceDeliveryMood(value)];
}

/** Map a synthesis engine (or babble/bottish) onto the Feel lane that owns it. */
export function botVoiceFeelLaneForEngine(
  engineUsed: string | null | undefined,
): BotVoiceFeelLane {
  return engineUsed === "elevenlabs" ? "premium" : "local";
}

/**
 * Project a portable profile onto one Feel lane so pitch / pace / lilt read
 * from the active Local or Premium controls. Identity fields stay intact.
 */
export function botAudioVoiceProfileForFeelLane(
  rawProfile: BotAudioVoiceProfileV1,
  lane: BotVoiceFeelLane,
): BotAudioVoiceProfileV2 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  if (lane === "local") return profile;
  return {
    ...profile,
    pitch: normalizeBotAudioVoiceControl(
      profile.premiumPitch,
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2.premiumPitch,
    ),
    pace: normalizeBotAudioVoiceControl(
      profile.premiumPace,
      profile.pace,
    ),
    lilt: normalizeBotAudioVoiceControl(
      profile.premiumLilt,
      profile.lilt,
    ),
  };
}

/** Apply mood without mutating or persisting the bot's authored profile.
 * Pass a Feel-lane projection when Premium owns the utterance. */
export function applyVoiceDeliveryMoodToProfile(
  rawProfile: BotAudioVoiceProfileV1,
  mood: unknown,
): BotAudioVoiceProfileV2 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const authoredRate = 1 + profile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
  const deliveryRate = Math.min(
    1 + BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
    Math.max(
      1 - BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
      authoredRate * voiceDeliveryRateForMood(mood),
    ),
  );
  return {
    ...profile,
    pace: normalizeBotAudioVoiceControl(
      (deliveryRate - 1) / BOT_AUDIO_VOICE_PACE_RATE_DEPTH,
    ),
  };
}

export function resolveVoicePlaybackTransform(
  rawProfile: BotAudioVoiceProfileV1,
): VoicePlaybackTransformV1 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  return {
    tempo: Number(
      (1 + profile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH).toFixed(3),
    ),
    pitchCents: Math.round(profile.pitch * BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS),
  };
}

/** Resolve tempo/pitch for a specific Local or Premium Feel lane. */
export function resolveVoicePlaybackTransformForLane(
  rawProfile: BotAudioVoiceProfileV1,
  lane: BotVoiceFeelLane,
): VoicePlaybackTransformV1 {
  return resolveVoicePlaybackTransform(
    botAudioVoiceProfileForFeelLane(rawProfile, lane),
  );
}

export function expectedVoicePlaybackDurationMs(
  sourceDurationMs: number,
  rawProfile: BotAudioVoiceProfileV1,
): number {
  const source = Number.isFinite(sourceDurationMs)
    ? Math.max(0, sourceDurationMs)
    : 0;
  return Math.max(
    1,
    Math.round(source / resolveVoicePlaybackTransform(rawProfile).tempo),
  );
}

/** Resolve the portable two-axis Voice Character pad into the three playback
 * values presented to the person. The shelves are deliberately coupled so a
 * two-dimensional pad stays honest: horizontal is tonal tilt and vertical is
 * relative gain. */
export function resolveBotVoiceCharacter(
  rawProfile: BotAudioVoiceProfileV1,
): BotVoiceCharacterV1 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const highShelfDb = Number(
    (profile.eqTilt * BOT_VOICE_EQ_TILT_DB_MAX).toFixed(3),
  );
  const lowShelfDb = Number((-highShelfDb).toFixed(3));
  return {
    eqTilt: profile.eqTilt,
    lowShelfDb,
    highShelfDb,
    gainDb: profile.gainDb,
    gainMultiplier: Number((10 ** (profile.gainDb / 20)).toFixed(6)),
  };
}

export const BOT_NAME_PRONUNCIATION_MAX_LENGTH = 120;
export const BOT_NAME_SELF_REFERRAL_MAX_LENGTH =
  BOT_NAME_PRONUNCIATION_MAX_LENGTH;

export interface BotNamePronunciationEntry {
  id?: string | null | undefined;
  name: string | null | undefined;
  namePronunciation?: string | null | undefined;
  name_pronunciation?: string | null | undefined;
  selfReferral?: string | null | undefined;
  self_referral?: string | null | undefined;
}

export function normalizeBotNamePronunciation(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, BOT_NAME_PRONUNCIATION_MAX_LENGTH);
}

/**
 * Normalize the private name a bot uses when speaking about itself. It shares
 * the pronunciation field's compact, speech-safe limits without affecting any
 * visible labels.
 */
export function normalizeBotSelfReferral(value: unknown): string {
  return normalizeBotNamePronunciation(value).slice(
    0,
    BOT_NAME_SELF_REFERRAL_MAX_LENGTH,
  );
}

export const SPEECH_TITLE_ABBREVIATIONS = Object.freeze({
  Adm: "Admiral",
  Amb: "Ambassador",
  Assoc: "Associate",
  Asst: "Assistant",
  Atty: "Attorney",
  Brig: "Brigadier",
  Capt: "Captain",
  Cdr: "Commander",
  Cmdr: "Commander",
  Col: "Colonel",
  Cpl: "Corporal",
  Dep: "Deputy",
  Det: "Detective",
  Dir: "Director",
  Dr: "Doctor",
  Fr: "Father",
  Gen: "General",
  Gov: "Governor",
  Hon: "Honorable",
  Insp: "Inspector",
  Lt: "Lieutenant",
  Maj: "Major",
  Mr: "Mister",
  Mrs: "Missus",
  Ms: "Miss",
  Mx: "Mix",
  Ofc: "Officer",
  Pres: "President",
  Prof: "Professor",
  Pvt: "Private",
  Rep: "Representative",
  Rev: "Reverend",
  Sen: "Senator",
  Sgt: "Sergeant",
  Supt: "Superintendent",
} as const);

const SPEECH_TITLE_ABBREVIATION_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(SPEECH_TITLE_ABBREVIATIONS)
    .sort((left, right) => right.length - left.length)
    .join("|")})(?:\\.)?(?=\\s+(?:(?:da|de|del|der|di|du|la|le|van|von)\\s+)?\\p{Lu}[\\p{L}\\p{M}.'’\\-]*)`,
  "gu",
);

export interface SpeechAbbreviationProjectionSegment {
  /** Private text sent to a voice engine. */
  synthesisText: string;
  /** Corresponding text as authored and displayed. */
  sourceText: string;
}

export interface SpeechAbbreviationProjection {
  sourceText: string;
  synthesisText: string;
  segments: readonly SpeechAbbreviationProjectionSegment[];
  changed: boolean;
}

/**
 * Builds a private, alignment-safe speech projection for common name-led
 * English titles. Callers retain sourceText for captions, transcripts, and
 * stored messages while synthesisText is the only form sent to a voice.
 *
 * Deliberately avoid broad dictionary substitutions here. In particular,
 * abbreviations such as St. and in. need surrounding semantic context. Exact
 * title case plus a following capitalized name keeps MS., ms., and ordinary
 * prose untouched while covering civilian, professional, civic, and military
 * titles with or without a period.
 */
export function projectSpeechAbbreviations(
  text: string,
): SpeechAbbreviationProjection {
  const segments: SpeechAbbreviationProjectionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SPEECH_TITLE_ABBREVIATION_PATTERN)) {
    const start = match.index;
    if (start > cursor) {
      const sourceText = text.slice(cursor, start);
      segments.push({ synthesisText: sourceText, sourceText });
    }
    const sourceText = match[0];
    const title = match[1] as keyof typeof SPEECH_TITLE_ABBREVIATIONS;
    segments.push({
      synthesisText: SPEECH_TITLE_ABBREVIATIONS[title],
      sourceText,
    });
    cursor = start + sourceText.length;
  }
  if (cursor < text.length) {
    const sourceText = text.slice(cursor);
    segments.push({ synthesisText: sourceText, sourceText });
  }
  if (segments.length === 0) {
    segments.push({ synthesisText: text, sourceText: text });
  }
  const synthesisText = segments
    .map((segment) => segment.synthesisText)
    .join("");
  return {
    sourceText: text,
    synthesisText,
    segments,
    changed: synthesisText !== text,
  };
}

export function expandSpeechAbbreviations(text: string): string;
export function expandSpeechAbbreviations(text: unknown): unknown;
export function expandSpeechAbbreviations(text: unknown): unknown {
  if (typeof text !== "string") return text;
  return projectSpeechAbbreviations(text).synthesisText;
}

export function applyBotNamePronunciations(
  text: unknown,
  entries: readonly BotNamePronunciationEntry[],
  speakerBotId?: string | null,
): unknown {
  if (typeof text !== "string" || entries.length === 0) return text;
  const normalizedSpeakerBotId = speakerBotId?.trim() ?? "";
  const orderedEntries = normalizedSpeakerBotId
    ? [...entries].sort(
        (left, right) =>
          Number(right.id === normalizedSpeakerBotId) -
          Number(left.id === normalizedSpeakerBotId),
      )
    : entries;
  const replacements = new Map<string, { written: string; spoken: string }>();
  for (const entry of orderedEntries) {
    const written = entry.name?.replace(/\s+/gu, " ").trim() ?? "";
    const isSpeaker =
      normalizedSpeakerBotId.length > 0 && entry.id === normalizedSpeakerBotId;
    const spoken = isSpeaker
      ? normalizeBotSelfReferral(entry.selfReferral ?? entry.self_referral) ||
        written
      : normalizeBotNamePronunciation(
          entry.namePronunciation ?? entry.name_pronunciation,
        );
    const key = written.toLocaleLowerCase();
    if (
      !written ||
      !spoken ||
      (!isSpeaker && key === spoken.toLocaleLowerCase()) ||
      replacements.has(key)
    ) {
      continue;
    }
    replacements.set(key, { written, spoken });
  }
  if (replacements.size === 0) return text;
  const alternatives = [...replacements.values()]
    .sort((left, right) => right.written.length - left.written.length)
    .map(({ written }) => written.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return text.replace(
    pattern,
    (match) => replacements.get(match.toLocaleLowerCase())?.spoken ?? match,
  );
}

export function applyPlayerNamePronunciation(
  text: unknown,
  displayName: string | null | undefined,
  pronunciation: string | null | undefined,
): unknown {
  return applyBotNamePronunciations(text, [
    { name: displayName, namePronunciation: pronunciation },
  ]);
}

export const BOT_VOICE_TEXTURE_PRESET_LABELS: Record<
  BotVoiceTexturePreset,
  string
> = {
  clean: "Clean",
  "crt-speaker": "CRT Speaker",
  lofi: "Lo-Fi",
  tape: "Tape",
  "damaged-speaker": "Damaged Speaker",
};

export const BOT_VOICE_TEXTURE_RECIPES: Readonly<
  Record<BotVoiceTexturePreset, Readonly<BotVoiceTextureV1>>
> = {
  clean: {
    preset: "clean",
    amount: 0,
    bandwidth: 1,
    noise: 0,
    instability: 0,
    distortion: 0,
    damage: 0,
  },
  "crt-speaker": {
    preset: "crt-speaker",
    amount: 0.65,
    bandwidth: 0.35,
    noise: 0.05,
    instability: 0.02,
    distortion: 0.12,
    damage: 0.05,
  },
  lofi: {
    preset: "lofi",
    amount: 0.65,
    bandwidth: 0.45,
    noise: 0.15,
    instability: 0.08,
    distortion: 0.25,
    damage: 0.1,
  },
  tape: {
    preset: "tape",
    amount: 0.65,
    bandwidth: 0.8,
    noise: 0.22,
    instability: 0.35,
    distortion: 0.22,
    damage: 0.08,
  },
  "damaged-speaker": {
    preset: "damaged-speaker",
    amount: 0.65,
    bandwidth: 0.3,
    noise: 0.28,
    instability: 0.18,
    distortion: 0.45,
    damage: 0.65,
  },
};

export const DEFAULT_VOICE_MODE: VoiceMode = "mute";
export const DEFAULT_ENGLISH_VOICE_ENGINE: EnglishVoiceEngine = "builtin";
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2: Readonly<BotAudioVoiceProfileV2> =
  {
    v: 2,
    enabled: true,
    baseVoiceId: "voice-1",
    elevenLabsEffect: DEFAULT_VOICE_EFFECT,
    pitch: 0,
    warmth: 0,
    openness: 0,
    weight: 0,
    brightness: 0,
    resonance: 0,
    localEnginePreference: "inherit",
    localVoiceSource: "portable",
    localLaughDelimiter: "-",
    accentLocale: "en-US",
    accentMode: "prefer-genuine",
    pronunciationBase: "follow-voice",
    speechprintInfluence: "none",
    speechprintStrength: "balanced",
    speechprintVariationSeed: "natural-v1",
    pace: 0,
    lilt: 0,
    bottishTone: 0.45,
    corporality: 0.5,
    eqTilt: 0,
    gainDb: 0,
    volume: 1,
    texture: BOT_VOICE_TEXTURE_RECIPES.clean,
  };
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3: Readonly<BotAudioVoiceProfileV3> =
  {
    v: 3,
    enabled: true,
    local: {
      enginePreference: "inherit",
      source: "portable",
      archetypeId: "voice-1",
      laughDelimiter: "-",
      accent: { locale: "en-US", mode: "prefer-genuine" },
      pronunciation: { base: "follow-voice" },
      speechprint: {
        influence: "none",
        strength: "balanced",
        variationSeed: "natural-v1",
      },
      tone: {
        pitch: 0,
        pace: 0,
        lilt: 0,
        warmth: 0,
        openness: 0,
        weight: 0,
        brightness: 0,
        resonance: 0,
        gainDb: 0,
      },
    },
    premium: {
      pitch: 0,
      pace: 0,
      lilt: 0,
    },
    delivery: {
      effect: DEFAULT_VOICE_EFFECT,
      volume: 1,
      texture: BOT_VOICE_TEXTURE_RECIPES.clean,
    },
    bottishTone: 0.45,
    corporality: 0.5,
  };
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 =
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2;

export function isBotAudioVoiceId(value: unknown): value is BotAudioVoiceId {
  return (
    typeof value === "string" &&
    (BOT_AUDIO_VOICE_IDS as readonly string[]).includes(value)
  );
}

export function isBotVoiceTexturePreset(
  value: unknown,
): value is BotVoiceTexturePreset {
  return (
    typeof value === "string" &&
    (BOT_VOICE_TEXTURE_PRESETS as readonly string[]).includes(value)
  );
}

export function normalizeLocalVoiceEnginePreference(
  value: unknown,
  fallback: LocalVoiceEnginePreference = "inherit",
): LocalVoiceEnginePreference {
  return typeof value === "string" &&
    (LOCAL_VOICE_ENGINE_PREFERENCES as readonly string[]).includes(value)
    ? (value as LocalVoiceEnginePreference)
    : fallback;
}

export function normalizeLocalVoiceSource(
  value: unknown,
  fallback: LocalVoiceSource = "portable",
): LocalVoiceSource {
  return typeof value === "string" &&
    (LOCAL_VOICE_SOURCES as readonly string[]).includes(value)
    ? (value as LocalVoiceSource)
    : fallback;
}

export function normalizeLocalVoiceAccentMode(
  value: unknown,
  fallback: LocalVoiceAccentMode = "prefer-genuine",
): LocalVoiceAccentMode {
  return typeof value === "string" &&
    (LOCAL_VOICE_ACCENT_MODES as readonly string[]).includes(value)
    ? (value as LocalVoiceAccentMode)
    : fallback;
}

export function normalizeLocalVoiceAccentLocale(
  value: unknown,
  fallback = "en-US",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/_/gu, "-").slice(0, 32);
  return /^en(?:-[a-z0-9]{2,8}){1,2}$/iu.test(normalized)
    ? normalized
    : fallback;
}

export function normalizeLocalVoicePronunciationBase(
  value: unknown,
  fallback: LocalVoicePronunciationBase = "follow-voice",
): LocalVoicePronunciationBase {
  return typeof value === "string" &&
    (LOCAL_VOICE_PRONUNCIATION_BASES as readonly string[]).includes(value)
    ? (value as LocalVoicePronunciationBase)
    : fallback;
}

export function normalizeVoiceAccentDefinitionId(
  value: unknown,
  fallback: VoiceAccentDefinitionId | null = null,
): VoiceAccentDefinitionId | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLocaleLowerCase().slice(0, 96);
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/u.test(normalized)) return fallback;
  // These two persisted IDs predate named Accent Map anchors. Country-wide
  // umbrellas are navigation, never speech settings: preserve old profiles by
  // normalizing them to the closest concrete varieties at every parse boundary.
  if (normalized === "american-english") return "general-american-english";
  if (normalized === "british-english") return "modern-rp-english";
  return normalized;
}

export function resolveLocalVoicePronunciationLocale(
  pronunciationBase: unknown,
  genuineLocale: unknown,
): "en-US" | "en-GB" {
  const sourceLocale = normalizeLocalVoiceAccentLocale(genuineLocale, "en-US");
  const base = normalizeLocalVoicePronunciationBase(pronunciationBase);
  if (base === "en-US" || base === "en-GB") return base;
  return sourceLocale.toLowerCase() === "en-gb" ? "en-GB" : "en-US";
}

export function localVoicePronunciationOverrideIsActive(
  pronunciationBase: unknown,
  genuineLocale: unknown,
): boolean {
  const base = normalizeLocalVoicePronunciationBase(pronunciationBase);
  return (
    base !== "follow-voice" &&
    resolveLocalVoicePronunciationLocale(base, genuineLocale) !==
      resolveLocalVoicePronunciationLocale("follow-voice", genuineLocale)
  );
}

export function normalizeLocalVoiceSpeechprintInfluence(
  value: unknown,
  fallback: LocalVoiceSpeechprintInfluence = "none",
): LocalVoiceSpeechprintInfluence {
  return typeof value === "string" &&
    (LOCAL_VOICE_SPEECHPRINT_INFLUENCES as readonly string[]).includes(value)
    ? (value as LocalVoiceSpeechprintInfluence)
    : fallback;
}

export function normalizeLocalVoiceSpeechprintStrength(
  value: unknown,
  fallback: LocalVoiceSpeechprintStrength = "balanced",
): LocalVoiceSpeechprintStrength {
  return typeof value === "string" &&
    (LOCAL_VOICE_SPEECHPRINT_STRENGTHS as readonly string[]).includes(value)
    ? (value as LocalVoiceSpeechprintStrength)
    : fallback;
}

export function normalizeLocalVoiceSpeechprintVariationSeed(
  value: unknown,
  fallback = "natural-v1",
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, 64);
  return /^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(normalized)
    ? normalized
    : fallback;
}

export function normalizeLocalVoiceSpeechprintV1(
  value: unknown,
  fallback: LocalVoiceSpeechprintV1 = {
    influence: "none",
    strength: "balanced",
    variationSeed: "natural-v1",
  },
): LocalVoiceSpeechprintV1 {
  const record = voiceProfileObject(value);
  const influence = normalizeLocalVoiceSpeechprintInfluence(
    record.influence,
    fallback.influence,
  );
  return {
    influence,
    strength: normalizeLocalVoiceSpeechprintStrength(
      record.strength,
      fallback.strength,
    ),
    variationSeed: normalizeLocalVoiceSpeechprintVariationSeed(
      record.variationSeed,
      influence === "none"
        ? "natural-v1"
        : fallback.influence === influence
          ? fallback.variationSeed
          : `speechprint-${influence}`.slice(0, 64),
    ),
  };
}

export function normalizeVoiceMode(
  value: unknown,
  fallback = DEFAULT_VOICE_MODE,
): VoiceMode {
  return value === "mute" ||
    value === "english" ||
    value === "babble" ||
    value === "bottish"
    ? value
    : fallback;
}

export function normalizeEnglishVoiceEngine(
  value: unknown,
  fallback = DEFAULT_ENGLISH_VOICE_ENGINE,
): EnglishVoiceEngine {
  return value === "builtin" || value === "elevenlabs" ? value : fallback;
}

export function normalizeVoiceEffect(
  value: unknown,
  fallback: VoiceEffect = DEFAULT_VOICE_EFFECT,
): VoiceEffect {
  // Migrate the original harsh bit-crusher preset to the more musical chorus.
  if (value === "distortion") return "chorus";
  // Retired texture values were historically interpreted as clean playback.
  if (
    value === "crt-speaker" ||
    value === "lofi" ||
    value === "tape" ||
    value === "damaged-speaker"
  ) {
    return "clean";
  }
  return typeof value === "string" &&
    (VOICE_EFFECTS as readonly string[]).includes(value)
    ? (value as VoiceEffect)
    : fallback;
}

/** Backwards-compatible normalizer for the legacy persisted field name. */
export function normalizeElevenLabsVoiceEffect(value: unknown): VoiceEffect {
  return normalizeVoiceEffect(value);
}

export const ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS = 48;

function truncateVoiceDirectionAtWordBoundary(value: string): string {
  if (value.length <= ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS) {
    return value;
  }
  const clipped = value
    .slice(0, ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS)
    .trimEnd();
  const boundary = clipped.lastIndexOf(" ");
  return boundary >= Math.floor(ELEVENLABS_VOICE_DIRECTION_MAX_CHARACTERS * 0.6)
    ? clipped.slice(0, boundary)
    : clipped;
}

export function normalizeElevenLabsVoiceDirection(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const directions: string[] = [];
  const seen = new Set<string>();
  for (const rawDirection of value.split(/[,;\n]+/u)) {
    const direction = rawDirection
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .trim()
      .replace(/^\[+|\]+$/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    const boundedDirection = truncateVoiceDirectionAtWordBoundary(direction);
    if (!boundedDirection) continue;
    const key = boundedDirection.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    directions.push(boundedDirection);
    if (directions.length >= 3) break;
  }
  return directions.length > 0 ? directions.join(", ").slice(0, 240) : null;
}

/** Clamp finite values to the portable [-1, 1] performance range. */
export function normalizeBotAudioVoiceControl(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(-1, safe)).toFixed(3));
}

export function normalizeBotVoiceGainDb(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(
    Math.min(
      BOT_VOICE_GAIN_DB_MAX,
      Math.max(BOT_VOICE_GAIN_DB_MIN, safe),
    ).toFixed(3),
  );
}

/** ElevenLabs accepts a 0..1 stability value. Older profiles keep the former
 * neutral behavior rather than inheriting any lilt-dependent provider setting. */
export function normalizeElevenLabsVoiceStability(
  value: unknown,
  fallback = ELEVENLABS_VOICE_STABILITY_DEFAULT,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(0, safe)).toFixed(3));
}

export function normalizeBotVoiceTextureUnit(
  value: unknown,
  fallback = 0,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(0, safe)).toFixed(3));
}

export function botVoiceTextureForPreset(
  preset: BotVoiceTexturePreset,
): BotVoiceTextureV1 {
  return { ...BOT_VOICE_TEXTURE_RECIPES[preset] };
}

export function normalizeBotVoiceTexture(value: unknown): BotVoiceTextureV1 {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const preset = isBotVoiceTexturePreset(record.preset)
    ? record.preset
    : "clean";
  const fallback = BOT_VOICE_TEXTURE_RECIPES[preset];
  return {
    preset,
    amount: normalizeBotVoiceTextureUnit(record.amount, fallback.amount),
    bandwidth: normalizeBotVoiceTextureUnit(
      record.bandwidth,
      fallback.bandwidth,
    ),
    noise: normalizeBotVoiceTextureUnit(record.noise, fallback.noise),
    instability: normalizeBotVoiceTextureUnit(
      record.instability,
      fallback.instability,
    ),
    distortion: normalizeBotVoiceTextureUnit(
      record.distortion,
      fallback.distortion,
    ),
    damage: normalizeBotVoiceTextureUnit(record.damage, fallback.damage),
  };
}

export function botVoiceTextureIsModified(texture: BotVoiceTextureV1): boolean {
  const normalized = normalizeBotVoiceTexture(texture);
  const canonical = BOT_VOICE_TEXTURE_RECIPES[normalized.preset];
  return (
    normalized.amount !== canonical.amount ||
    normalized.bandwidth !== canonical.bandwidth ||
    normalized.noise !== canonical.noise ||
    normalized.instability !== canonical.instability ||
    normalized.distortion !== canonical.distortion ||
    normalized.damage !== canonical.damage
  );
}

function voiceProfileObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeLocalVoicePronunciationMapPoint(
  value: unknown,
  fallback: LocalVoicePronunciationMapPoint | null = null,
): LocalVoicePronunciationMapPoint | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const record = voiceProfileObject(value);
  const x = typeof record.x === "number" ? record.x : NaN;
  const y = typeof record.y === "number" ? record.y : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

/** Flatten V3 into the established runtime shape. This keeps every existing
 * synthesis surface compatible while persistence and new editors use the
 * separated local / premium / delivery contract. */
function flattenBotAudioVoiceProfileV3Record(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (value.v !== 3) return value;
  const local = voiceProfileObject(value.local);
  const premium = voiceProfileObject(value.premium);
  const delivery = voiceProfileObject(value.delivery);
  const accent = voiceProfileObject(local.accent);
  const pronunciation = voiceProfileObject(local.pronunciation);
  const speechprint = voiceProfileObject(local.speechprint);
  const tone = voiceProfileObject(local.tone);
  return {
    v: 2,
    enabled: value.enabled,
    baseVoiceId: local.archetypeId,
    systemVoiceName: local.systemVoiceName,
    elevenLabsVoiceId: premium.voiceId,
    elevenLabsVoiceIdOverride: premium.voiceIdOverride,
    elevenLabsVoiceInitialized: premium.initialized,
    elevenLabsNativeAccentHint: premium.nativeAccentHint,
    elevenLabsDirection: premium.direction,
    elevenLabsStability: premium.stability,
    elevenLabsEffect: delivery.effect,
    voiceEffectExplicit: delivery.effectExplicit,
    pitch: tone.pitch,
    warmth: tone.warmth,
    openness: tone.openness,
    weight: tone.weight,
    brightness: tone.brightness,
    resonance: tone.resonance,
    localEnginePreference: local.enginePreference,
    localVoiceSource: local.source,
    localReferenceId: local.referenceId,
    localLaughSyllable: local.laughSyllable,
    localLaughDelimiter: local.laughDelimiter,
    accentLocale: accent.locale,
    accentMode: accent.mode,
    pronunciationBase: pronunciation.base,
    accentPronunciationEnabled: pronunciation.accentPronunciationEnabled,
    accentDefinitionId:
      pronunciation.accentDefinitionId ?? value.accentDefinitionId,
    vernacularId: pronunciation.vernacularId ?? value.vernacularId,
    pronunciationMapPoint: pronunciation.mapPoint,
    speechprintInfluence: speechprint.influence,
    speechprintStrength: speechprint.strength,
    speechprintVariationSeed: speechprint.variationSeed,
    // Prefer per-lane Feel; older V3 files kept pace/lilt only on delivery.
    // Use `in` so an authored 0 is kept and a missing key can migrate.
    pace: "pace" in tone ? tone.pace : delivery.pace,
    lilt: "lilt" in tone ? tone.lilt : delivery.lilt,
    // Premium pitch was not authored before; stay neutral unless set.
    premiumPitch: "pitch" in premium ? premium.pitch : 0,
    premiumPace: "pace" in premium ? premium.pace : delivery.pace,
    premiumLilt: "lilt" in premium ? premium.lilt : delivery.lilt,
    bottishTone: value.bottishTone,
    corporality: value.corporality,
    eqTilt: tone.brightness,
    gainDb: tone.gainDb,
    volume: delivery.volume,
    texture: delivery.texture,
    avatarSfx: value.avatarSfx,
    avatarSfxPrompt: value.avatarSfxPrompt,
    avatarSfxMuted: value.avatarSfxMuted,
  };
}

export function normalizeBotAudioVoiceProfileV1(
  value: unknown,
  fallback: BotAudioVoiceProfile = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
): BotAudioVoiceProfileV2 {
  const fallbackProfile = normalizeBotAudioVoiceProfileFallback(fallback);
  const inputRecord = voiceProfileObject(value);
  const record = flattenBotAudioVoiceProfileV3Record(inputRecord);
  const legacy = inputRecord.v !== 2 && inputRecord.v !== 3;
  const systemVoiceName = normalizeOptionalVoiceSelection(
    record.systemVoiceName,
    fallbackProfile.systemVoiceName ?? null,
  );
  const elevenLabsVoiceId = normalizeOptionalVoiceSelection(
    record.elevenLabsVoiceId,
    fallbackProfile.elevenLabsVoiceId ?? null,
  );
  const elevenLabsVoiceIdOverride = normalizeOptionalVoiceSelection(
    record.elevenLabsVoiceIdOverride,
    fallbackProfile.elevenLabsVoiceIdOverride ?? null,
  );
  const elevenLabsVoiceInitialized = record.elevenLabsVoiceInitialized === true;
  const elevenLabsNativeAccentHint = normalizeElevenLabsNativeAccentHint(
    record.elevenLabsNativeAccentHint,
    fallbackProfile.elevenLabsNativeAccentHint ?? null,
  );
  const voiceEffectExplicit =
    record.voiceEffectExplicit === true ||
    (record.elevenLabsEffect === "clean" &&
      Boolean(elevenLabsVoiceId || elevenLabsVoiceIdOverride));
  const voiceEffect =
    record.elevenLabsEffect === "clean" && !voiceEffectExplicit
      ? fallbackProfile.elevenLabsEffect
      : normalizeVoiceEffect(
          record.elevenLabsEffect,
          fallbackProfile.elevenLabsEffect,
        );
  const elevenLabsDirection = normalizeElevenLabsVoiceDirection(
    record.elevenLabsDirection,
    fallbackProfile.elevenLabsDirection ?? null,
  );
  const elevenLabsStability = normalizeElevenLabsVoiceStability(
    record.elevenLabsStability,
    fallbackProfile.elevenLabsStability ?? ELEVENLABS_VOICE_STABILITY_DEFAULT,
  );
  const avatarSfx = normalizeBotAvatarSfxV1(
    record.avatarSfx,
    fallbackProfile.avatarSfx ?? null,
  );
  const avatarSfxPrompt = normalizeBotAvatarSfxText(
    record.avatarSfxPrompt ?? avatarSfx?.prompt,
    BOT_AVATAR_SFX_PROMPT_MAX_LENGTH,
  );
  const avatarSfxMuted =
    record.avatarSfxMuted === undefined
      ? fallbackProfile.avatarSfxMuted === true
      : record.avatarSfxMuted === true;
  const baseVoiceId = isBotAudioVoiceId(record.baseVoiceId)
    ? record.baseVoiceId
    : fallbackProfile.baseVoiceId;
  const localVoiceSource = normalizeLocalVoiceSource(
    record.localVoiceSource,
    fallbackProfile.localVoiceSource ?? "portable",
  );
  const localLaughSyllable = normalizeBotLocalLaughSyllable(
    record.localLaughSyllable,
    fallbackProfile.localLaughSyllable ?? null,
  );
  const localLaughDelimiter = normalizeBotLocalLaughDelimiter(
    record.localLaughDelimiter,
    fallbackProfile.localLaughDelimiter ?? "-",
  );
  const speechprintInfluence = normalizeLocalVoiceSpeechprintInfluence(
    record.speechprintInfluence,
    fallbackProfile.speechprintInfluence ?? "none",
  );
  const pronunciationMapPoint = normalizeLocalVoicePronunciationMapPoint(
    record.pronunciationMapPoint,
    fallbackProfile.pronunciationMapPoint ?? null,
  );
  const accentDefinitionId = normalizeVoiceAccentDefinitionId(
    record.accentDefinitionId,
    fallbackProfile.accentDefinitionId ?? null,
  );
  const vernacularId = normalizeBotVernacularId(
    record.vernacularId,
    fallbackProfile.vernacularId ?? null,
  );
  const accentPronunciationEnabled =
    typeof record.accentPronunciationEnabled === "boolean"
      ? record.accentPronunciationEnabled
      : Boolean(
          accentDefinitionId ||
            pronunciationMapPoint ||
            speechprintInfluence !== "none" ||
            normalizeLocalVoicePronunciationBase(
              record.pronunciationBase,
              fallbackProfile.pronunciationBase ?? "follow-voice",
            ) !== "follow-voice",
        );
  return {
    v: 2,
    enabled: legacy ? true : record.enabled !== false,
    baseVoiceId,
    ...(systemVoiceName ? { systemVoiceName } : {}),
    ...(elevenLabsVoiceId ? { elevenLabsVoiceId } : {}),
    ...(elevenLabsVoiceIdOverride ? { elevenLabsVoiceIdOverride } : {}),
    ...(elevenLabsVoiceInitialized ? { elevenLabsVoiceInitialized: true } : {}),
    ...(elevenLabsNativeAccentHint ? { elevenLabsNativeAccentHint } : {}),
    elevenLabsEffect: voiceEffect,
    ...(voiceEffectExplicit ? { voiceEffectExplicit: true } : {}),
    ...(elevenLabsDirection ? { elevenLabsDirection } : {}),
    ...(record.elevenLabsStability !== undefined
      ? { elevenLabsStability }
      : {}),
    pitch: normalizeBotAudioVoiceControl(record.pitch, fallbackProfile.pitch),
    warmth: normalizeBotAudioVoiceControl(
      record.warmth,
      fallbackProfile.warmth,
    ),
    openness: normalizeBotAudioVoiceControl(
      record.openness,
      fallbackProfile.openness ?? 0,
    ),
    weight: normalizeBotAudioVoiceControl(
      record.weight,
      fallbackProfile.weight ?? 0,
    ),
    brightness: normalizeBotAudioVoiceControl(
      record.brightness ?? record.eqTilt,
      fallbackProfile.brightness ?? fallbackProfile.eqTilt,
    ),
    resonance: normalizeBotAudioVoiceControl(
      record.resonance,
      fallbackProfile.resonance ?? 0,
    ),
    localEnginePreference: normalizeLocalVoiceEnginePreference(
      record.localEnginePreference,
      fallbackProfile.localEnginePreference ?? "inherit",
    ),
    localVoiceSource,
    ...(normalizeOptionalVoiceSelection(
      record.localReferenceId,
      fallbackProfile.localReferenceId ?? null,
    )
      ? {
          localReferenceId: normalizeOptionalVoiceSelection(
            record.localReferenceId,
            fallbackProfile.localReferenceId ?? null,
          ),
      }
      : {}),
    ...(localLaughSyllable ? { localLaughSyllable } : {}),
    localLaughDelimiter,
    accentLocale: normalizeLocalVoiceAccentLocale(
      localVoiceSource === "portable" && !systemVoiceName
        ? prismBuiltinEnglishVoice(baseVoiceId).locale
        : record.accentLocale,
      prismBuiltinEnglishVoice(baseVoiceId).locale,
    ),
    accentMode: normalizeLocalVoiceAccentMode(
      record.accentMode,
      fallbackProfile.accentMode ?? "prefer-genuine",
    ),
    pronunciationBase: normalizeLocalVoicePronunciationBase(
      record.pronunciationBase,
      fallbackProfile.pronunciationBase ?? "follow-voice",
    ),
    ...(typeof record.accentPronunciationEnabled === "boolean" ||
    accentPronunciationEnabled
      ? { accentPronunciationEnabled }
      : {}),
    ...(accentDefinitionId ? { accentDefinitionId } : {}),
    ...(vernacularId ? { vernacularId } : {}),
    ...(pronunciationMapPoint ? { pronunciationMapPoint } : {}),
    speechprintInfluence,
    speechprintStrength: normalizeLocalVoiceSpeechprintStrength(
      record.speechprintStrength,
      fallbackProfile.speechprintStrength ?? "balanced",
    ),
    speechprintVariationSeed: normalizeLocalVoiceSpeechprintVariationSeed(
      record.speechprintVariationSeed,
      speechprintInfluence === "none"
        ? "natural-v1"
        : fallbackProfile.speechprintInfluence === speechprintInfluence
          ? fallbackProfile.speechprintVariationSeed
          : `speechprint-${speechprintInfluence}`.slice(0, 64),
    ),
    pace: normalizeBotAudioVoiceControl(record.pace, fallbackProfile.pace),
    lilt: normalizeBotAudioVoiceControl(record.lilt, fallbackProfile.lilt),
    premiumPitch: normalizeBotAudioVoiceControl(
      record.premiumPitch,
      fallbackProfile.premiumPitch ?? 0,
    ),
    // Older shared delivery Feel becomes both lanes until Premium is edited.
    premiumPace: normalizeBotAudioVoiceControl(
      record.premiumPace,
      normalizeBotAudioVoiceControl(record.pace, fallbackProfile.pace),
    ),
    premiumLilt: normalizeBotAudioVoiceControl(
      record.premiumLilt,
      normalizeBotAudioVoiceControl(record.lilt, fallbackProfile.lilt),
    ),
    bottishTone: normalizeBotAudioVoiceControl(
      legacy ? record.signal : record.bottishTone,
      fallbackProfile.bottishTone,
    ),
    corporality: normalizeCorporality(
      record.corporality,
      fallbackProfile.corporality ?? 0.5,
    ),
    eqTilt: normalizeBotAudioVoiceControl(
      record.eqTilt,
      fallbackProfile.eqTilt,
    ),
    gainDb: normalizeBotVoiceGainDb(record.gainDb, fallbackProfile.gainDb),
    volume: normalizeBotVoiceVolume(record.volume, fallbackProfile.volume),
    // Voice texture presets are retired. Keep the field canonical for export
    // compatibility, but always resolve old and new profiles to clean audio.
    texture: botVoiceTextureForPreset("clean"),
    ...(avatarSfx ? { avatarSfx } : {}),
    ...(avatarSfxPrompt ? { avatarSfxPrompt } : {}),
    ...(avatarSfxMuted ? { avatarSfxMuted: true } : {}),
  };
}

function normalizeBotAudioVoiceProfileFallback(
  value: BotAudioVoiceProfile,
): BotAudioVoiceProfileV2 {
  if (value.v === 3) {
    return normalizeBotAudioVoiceProfileFallback({
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      ...flattenBotAudioVoiceProfileV3Record(
        value as unknown as Record<string, unknown>,
      ),
      v: 2,
    } as BotAudioVoiceProfileV2);
  }
  if (value.v === 2) {
    const {
      avatarSfx: rawAvatarSfx,
      avatarSfxPrompt: rawAvatarSfxPrompt,
      avatarSfxMuted: rawAvatarSfxMuted,
      ...voiceProfile
    } = value;
    const elevenLabsDirection = normalizeElevenLabsVoiceDirection(
      value.elevenLabsDirection,
    );
    const elevenLabsStability =
      value.elevenLabsStability === undefined
        ? undefined
        : normalizeElevenLabsVoiceStability(value.elevenLabsStability);
    const avatarSfx = normalizeBotAvatarSfxV1(rawAvatarSfx);
    const avatarSfxPrompt = normalizeBotAvatarSfxText(
      rawAvatarSfxPrompt ?? avatarSfx?.prompt,
      BOT_AVATAR_SFX_PROMPT_MAX_LENGTH,
    );
    const pronunciationMapPoint = normalizeLocalVoicePronunciationMapPoint(
      value.pronunciationMapPoint,
    );
    return {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      ...voiceProfile,
      elevenLabsEffect: normalizeVoiceEffect(value.elevenLabsEffect),
      ...(elevenLabsDirection
        ? { elevenLabsDirection }
        : { elevenLabsDirection: undefined }),
      ...(elevenLabsStability === undefined ? {} : { elevenLabsStability }),
      eqTilt: normalizeBotAudioVoiceControl(value.eqTilt),
      openness: normalizeBotAudioVoiceControl(value.openness),
      weight: normalizeBotAudioVoiceControl(value.weight),
      brightness: normalizeBotAudioVoiceControl(
        value.brightness,
        normalizeBotAudioVoiceControl(value.eqTilt),
      ),
      resonance: normalizeBotAudioVoiceControl(value.resonance),
      localEnginePreference: normalizeLocalVoiceEnginePreference(
        value.localEnginePreference,
      ),
      localVoiceSource: normalizeLocalVoiceSource(value.localVoiceSource),
      ...(normalizeOptionalVoiceSelection(value.localReferenceId)
        ? {
            localReferenceId: normalizeOptionalVoiceSelection(
              value.localReferenceId,
            ),
          }
        : {}),
      accentLocale: normalizeLocalVoiceAccentLocale(
        normalizeLocalVoiceSource(value.localVoiceSource) === "portable" &&
          !value.systemVoiceName
          ? prismBuiltinEnglishVoice(value.baseVoiceId).locale
          : value.accentLocale,
        prismBuiltinEnglishVoice(value.baseVoiceId).locale,
      ),
      accentMode: normalizeLocalVoiceAccentMode(value.accentMode),
      pronunciationBase: normalizeLocalVoicePronunciationBase(
        value.pronunciationBase,
      ),
      ...(normalizeVoiceAccentDefinitionId(value.accentDefinitionId)
        ? {
            accentDefinitionId: normalizeVoiceAccentDefinitionId(
              value.accentDefinitionId,
            ),
          }
        : { accentDefinitionId: undefined }),
      ...(normalizeBotVernacularId(value.vernacularId)
        ? { vernacularId: normalizeBotVernacularId(value.vernacularId) }
        : { vernacularId: undefined }),
      ...(pronunciationMapPoint
        ? { pronunciationMapPoint }
        : { pronunciationMapPoint: undefined }),
      speechprintInfluence: normalizeLocalVoiceSpeechprintInfluence(
        value.speechprintInfluence,
      ),
      speechprintStrength: normalizeLocalVoiceSpeechprintStrength(
        value.speechprintStrength,
      ),
      speechprintVariationSeed: normalizeLocalVoiceSpeechprintVariationSeed(
        value.speechprintVariationSeed,
        value.speechprintInfluence && value.speechprintInfluence !== "none"
          ? `speechprint-${value.speechprintInfluence}`.slice(0, 64)
          : "natural-v1",
      ),
      gainDb: normalizeBotVoiceGainDb(value.gainDb),
      texture: botVoiceTextureForPreset("clean"),
      ...(avatarSfx ? { avatarSfx } : {}),
      ...(avatarSfxPrompt ? { avatarSfxPrompt } : {}),
      ...(rawAvatarSfxMuted === true ? { avatarSfxMuted: true } : {}),
    };
  }
  return {
    ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
    baseVoiceId: isBotAudioVoiceId(value.baseVoiceId)
      ? value.baseVoiceId
      : DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2.baseVoiceId,
    pitch: normalizeBotAudioVoiceControl(value.pitch),
    warmth: normalizeBotAudioVoiceControl(value.warmth),
    pace: normalizeBotAudioVoiceControl(value.pace),
    lilt: normalizeBotAudioVoiceControl(value.lilt),
    bottishTone: normalizeBotAudioVoiceControl(
      value.signal,
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2.bottishTone,
    ),
  };
}

export function normalizeBotAudioVoiceProfileV3(
  value: unknown,
  fallback: BotAudioVoiceProfile = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V3,
): BotAudioVoiceProfileV3 {
  const profile = normalizeBotAudioVoiceProfileV1(value, fallback);
  const inputRecord = voiceProfileObject(value);
  const explicitSource =
    inputRecord.v === 3 ||
    Object.prototype.hasOwnProperty.call(inputRecord, "localVoiceSource");
  const source = explicitSource
    ? normalizeLocalVoiceSource(profile.localVoiceSource)
    : profile.localReferenceId
      ? "reference"
      : profile.systemVoiceName
        ? "system"
        : "portable";
  const referenceId = normalizeOptionalVoiceSelection(profile.localReferenceId);
  const systemVoiceName = normalizeOptionalVoiceSelection(
    profile.systemVoiceName,
  );
  const voiceId = normalizeOptionalVoiceSelection(profile.elevenLabsVoiceId);
  const voiceIdOverride = normalizeOptionalVoiceSelection(
    profile.elevenLabsVoiceIdOverride,
  );
  const direction = normalizeElevenLabsVoiceDirection(
    profile.elevenLabsDirection,
  );
  const avatarSfx = normalizeBotAvatarSfxV1(profile.avatarSfx);
  const avatarSfxPrompt = normalizeBotAvatarSfxText(
    profile.avatarSfxPrompt ?? avatarSfx?.prompt,
    BOT_AVATAR_SFX_PROMPT_MAX_LENGTH,
  );
  return {
    v: 3,
    enabled: profile.enabled,
    local: {
      enginePreference: normalizeLocalVoiceEnginePreference(
        profile.localEnginePreference,
      ),
      source,
      archetypeId: profile.baseVoiceId,
      ...(systemVoiceName ? { systemVoiceName } : {}),
      ...(referenceId ? { referenceId } : {}),
      ...(profile.localLaughSyllable
        ? { laughSyllable: profile.localLaughSyllable }
        : {}),
      laughDelimiter: profile.localLaughDelimiter ?? "-",
      accent: {
        locale: normalizeLocalVoiceAccentLocale(
          profile.accentLocale,
          prismBuiltinEnglishVoice(profile.baseVoiceId).locale,
        ),
        mode: normalizeLocalVoiceAccentMode(profile.accentMode),
      },
      pronunciation: {
        base: normalizeLocalVoicePronunciationBase(profile.pronunciationBase),
        ...(profile.accentPronunciationEnabled !== undefined
          ? {
              accentPronunciationEnabled: profile.accentPronunciationEnabled,
            }
          : {}),
        ...(profile.accentDefinitionId
          ? { accentDefinitionId: profile.accentDefinitionId }
          : {}),
        ...(profile.vernacularId
          ? { vernacularId: profile.vernacularId }
          : {}),
        ...(profile.pronunciationMapPoint
          ? { mapPoint: { ...profile.pronunciationMapPoint } }
          : {}),
      },
      speechprint: normalizeLocalVoiceSpeechprintV1({
        influence: profile.speechprintInfluence,
        strength: profile.speechprintStrength,
        variationSeed: profile.speechprintVariationSeed,
      }),
      tone: {
        pitch: normalizeBotAudioVoiceControl(profile.pitch),
        pace: normalizeBotAudioVoiceControl(profile.pace),
        lilt: normalizeBotAudioVoiceControl(profile.lilt),
        warmth: normalizeBotAudioVoiceControl(profile.warmth),
        openness: normalizeBotAudioVoiceControl(profile.openness),
        weight: normalizeBotAudioVoiceControl(profile.weight),
        brightness: normalizeBotAudioVoiceControl(
          profile.brightness,
          profile.eqTilt,
        ),
        resonance: normalizeBotAudioVoiceControl(profile.resonance),
        gainDb: normalizeBotVoiceGainDb(profile.gainDb),
      },
    },
    premium: {
      ...(voiceId ? { voiceId } : {}),
      ...(voiceIdOverride ? { voiceIdOverride } : {}),
      ...(profile.elevenLabsVoiceInitialized ? { initialized: true } : {}),
      ...(profile.elevenLabsNativeAccentHint
        ? { nativeAccentHint: profile.elevenLabsNativeAccentHint }
        : {}),
      ...(direction ? { direction } : {}),
      ...(profile.elevenLabsStability === undefined
        ? {}
        : {
            stability: normalizeElevenLabsVoiceStability(
              profile.elevenLabsStability,
            ),
          }),
      pitch: normalizeBotAudioVoiceControl(profile.premiumPitch, 0),
      pace: normalizeBotAudioVoiceControl(profile.premiumPace, profile.pace),
      lilt: normalizeBotAudioVoiceControl(profile.premiumLilt, profile.lilt),
    },
    delivery: {
      effect: normalizeVoiceEffect(profile.elevenLabsEffect),
      ...(profile.voiceEffectExplicit ? { effectExplicit: true } : {}),
      volume: normalizeBotVoiceVolume(profile.volume),
      texture: normalizeBotVoiceTexture(profile.texture),
    },
    bottishTone: normalizeBotAudioVoiceControl(profile.bottishTone, 0.45),
    corporality: normalizeCorporality(profile.corporality, 0.5),
    ...(avatarSfx ? { avatarSfx } : {}),
    ...(avatarSfxPrompt ? { avatarSfxPrompt } : {}),
    ...(profile.avatarSfxMuted ? { avatarSfxMuted: true } : {}),
  };
}

/** Keep a saved Accent Map editable while bypassing every pronunciation and
 * Speechprint transform at synthesis when its per-bot switch is off. */
export function normalizeBotAudioVoiceProfileForSynthesisV1(
  value: unknown,
): BotAudioVoiceProfileV2 {
  const profile = normalizeBotAudioVoiceProfileV1(value);
  if (profile.accentPronunciationEnabled) return profile;
  const {
    accentDefinitionId: _accentDefinitionId,
    pronunciationMapPoint: _pronunciationMapPoint,
    ...withoutAccentMap
  } = profile;
  return {
    ...withoutAccentMap,
    pronunciationBase: "follow-voice",
    speechprintInfluence: "none",
  };
}

/** Clamp Identity corporality slider to [0, 1]. */
export function normalizeCorporality(
  value: unknown,
  fallback = 0.5,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(0, safe)).toFixed(4));
}

export function normalizeBotVoiceVolume(value: unknown, fallback = 1): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1.25, Math.max(0, safe)).toFixed(3));
}

function normalizeBotAvatarSfxText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function botAvatarSfxDataUrlIsValid(value: string): boolean {
  if (value.length > Math.ceil((BOT_AVATAR_SFX_MAX_BYTES * 4) / 3) + 256) {
    return false;
  }
  return /^data:audio\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/iu.test(value);
}

export function normalizeBotAvatarSfxVolume(
  value: unknown,
  fallback = BOT_AVATAR_SFX_DEFAULT_VOLUME,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(
    Math.min(BOT_AVATAR_SFX_MAX_VOLUME, Math.max(0, safe)).toFixed(3),
  );
}

export function normalizeBotAvatarSfxV1(
  value: unknown,
  fallback: BotAvatarSfxV1 | null = null,
): BotAvatarSfxV1 | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const record = value as Record<string, unknown>;
  const rawDataUrl =
    typeof record.audioDataUrl === "string" ? record.audioDataUrl.trim() : "";
  if (!botAvatarSfxDataUrlIsValid(rawDataUrl)) return fallback;
  const fileName = normalizeBotAvatarSfxText(
    record.fileName,
    BOT_AVATAR_SFX_FILE_NAME_MAX_LENGTH,
  );
  const prompt = normalizeBotAvatarSfxText(
    record.prompt,
    BOT_AVATAR_SFX_PROMPT_MAX_LENGTH,
  );
  return {
    v: 1,
    source: record.source === "elevenlabs" ? "elevenlabs" : "upload",
    audioDataUrl: rawDataUrl,
    ...(fileName ? { fileName } : {}),
    ...(prompt ? { prompt } : {}),
    playWhileTalking: record.playWhileTalking === true,
    playWhileIdle: record.playWhileIdle === true,
    playWhileThinking: record.playWhileThinking === true,
    volume: normalizeBotAvatarSfxVolume(record.volume),
  };
}

function normalizeOptionalVoiceSelection(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 240) : null;
}

/** Provider metadata is intentionally small and disposable. It is not a
 * user-authored direction or character pronunciation field. */
export function normalizeElevenLabsNativeAccentHint(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 96);
  return normalized || null;
}

/** Distinguish a user-authored/new-schema Accent Map switch from legacy
 * profiles whose enabled state had to be inferred from their saved pin. */
export function botAudioVoiceProfileHasExplicitAccentPronunciationSetting(
  value: unknown,
): boolean {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return false;
    }
  }
  const record = voiceProfileObject(candidate);
  if (typeof record.accentPronunciationEnabled === "boolean") return true;
  const local = voiceProfileObject(record.local);
  const pronunciation = voiceProfileObject(local.pronunciation);
  return typeof pronunciation.accentPronunciationEnabled === "boolean";
}

/** Null is a deliberate absence for per-user overrides; malformed values are ignored. */
export function normalizeOptionalBotAudioVoiceProfileV1(
  value: unknown,
): BotAudioVoiceProfileV2 | null {
  if (value === null || value === undefined) return null;
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const record = candidate as Record<string, unknown>;
  const version = record.v;
  const recognizableUnversionedProfile =
    version === undefined &&
    (isBotAudioVoiceId(record.baseVoiceId) ||
      typeof record.systemVoiceName === "string" ||
      typeof record.elevenLabsVoiceId === "string" ||
      typeof record.elevenLabsVoiceIdOverride === "string" ||
      record.elevenLabsVoiceInitialized === true);
  if (
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    !recognizableUnversionedProfile
  ) {
    return null;
  }
  return normalizeBotAudioVoiceProfileV1(candidate);
}

/** Resolve a saved bot's effective profile without letting an older local
 * customization hide a newly authored ElevenLabs identity. A user's chosen
 * ElevenLabs voice remains authoritative; otherwise the authored provider
 * identity and performance direction fill the legacy override's gap. */
export function resolveBotAudioVoiceProfileV1(
  authoredValue: unknown,
  overrideValue: unknown,
): BotAudioVoiceProfileV2 {
  const authored =
    normalizeOptionalBotAudioVoiceProfileV1(authoredValue) ??
    normalizeBotAudioVoiceProfileV1(undefined);
  const override = normalizeOptionalBotAudioVoiceProfileV1(overrideValue);
  if (!override) return authored;

  const authoredElevenLabsVoiceId =
    authored.elevenLabsVoiceIdOverride ?? authored.elevenLabsVoiceId ?? null;
  if (!authoredElevenLabsVoiceId) return override;

  if (
    override.elevenLabsVoiceInitialized === true &&
    !override.elevenLabsVoiceIdOverride &&
    !override.elevenLabsVoiceId
  ) {
    return override;
  }

  const overrideElevenLabsVoiceId =
    override.elevenLabsVoiceIdOverride ?? override.elevenLabsVoiceId ?? null;
  if (overrideElevenLabsVoiceId) {
    return normalizeBotAudioVoiceProfileV1({
      ...override,
      elevenLabsDirection:
        override.elevenLabsDirection ?? authored.elevenLabsDirection,
    });
  }

  return normalizeBotAudioVoiceProfileV1({
    ...override,
    elevenLabsVoiceId: authored.elevenLabsVoiceId,
    elevenLabsVoiceIdOverride: authored.elevenLabsVoiceIdOverride,
    elevenLabsEffect: authored.elevenLabsEffect,
    elevenLabsDirection: authored.elevenLabsDirection,
  });
}

/** Accent Map coordinates are optional authored identity, not a default voice
 * value. Mumbling uses only an explicitly persisted pin so legacy bots retain
 * their historical gibberish until someone moves them on the map. */
export function resolveBotPronunciationMapPointV1(
  authoredValue: unknown,
  overrideValue: unknown,
): LocalVoicePronunciationMapPoint | null {
  const recordFor = (value: unknown): Record<string, unknown> | null => {
    let candidate = value;
    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return candidate && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : null;
  };
  const authored = recordFor(authoredValue);
  const override = recordFor(overrideValue);
  const source = override &&
      Object.prototype.hasOwnProperty.call(override, "pronunciationMapPoint")
    ? override
    : authored &&
        Object.prototype.hasOwnProperty.call(authored, "pronunciationMapPoint")
      ? authored
      : null;
  if (!source || source.pronunciationMapPoint === null) return null;
  const point = source.pronunciationMapPoint;
  if (!point || typeof point !== "object" || Array.isArray(point)) return null;
  const row = point as Record<string, unknown>;
  if (
    typeof row.x !== "number" ||
    !Number.isFinite(row.x) ||
    typeof row.y !== "number" ||
    !Number.isFinite(row.y)
  ) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(1, row.x)),
    y: Math.max(0, Math.min(1, row.y)),
  };
}

export function parseStoredBotAudioVoiceProfileV1(
  value: unknown,
): BotAudioVoiceProfileV2 | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    return normalizeOptionalBotAudioVoiceProfileV1(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseStoredBotAudioVoiceProfileV3(
  value: unknown,
): BotAudioVoiceProfileV3 | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeOptionalBotAudioVoiceProfileV1(parsed)
      ? normalizeBotAudioVoiceProfileV3(parsed)
      : null;
  } catch {
    return null;
  }
}

export function serializeBotAudioVoiceProfileV1(value: unknown): string {
  return JSON.stringify(normalizeBotAudioVoiceProfileV3(value));
}
