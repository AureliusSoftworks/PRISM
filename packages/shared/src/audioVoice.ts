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

export const VOICE_EFFECT_DESCRIPTIONS: Record<
  VoiceEffect,
  string
> = {
  clean: "Unprocessed voice.",
  radio: "Narrow-band broadcast tone with a trace of radio noise.",
  robot: "Mechanical pulse and a subtly doubled synthetic carrier.",
  echo: "Two level-controlled repeats behind the original voice.",
  chorus: "PRISM's subtle tuned voice with a gently refracted double.",
  resonance: "A dark, weighty mechanical double with a restrained low reflection.",
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
] as const;
export type BotAudioVoiceId = (typeof BOT_AUDIO_VOICE_IDS)[number];

/** PRISM's portable, always-local English voice pack. The engine voice IDs are
 * implementation details; profiles continue to persist only the stable
 * `voice-1` through `voice-12` identities. */
export const PRISM_BUILTIN_ENGLISH_VOICES = [
  {
    voiceId: "voice-1",
    engineVoiceId: "af_heart",
    name: "Heart",
    locale: "en-US",
    character: "Warm American",
  },
  {
    voiceId: "voice-2",
    engineVoiceId: "af_bella",
    name: "Bella",
    locale: "en-US",
    character: "Rich American",
  },
  {
    voiceId: "voice-3",
    engineVoiceId: "am_michael",
    name: "Michael",
    locale: "en-US",
    character: "Grounded American",
  },
  {
    voiceId: "voice-4",
    engineVoiceId: "bf_emma",
    name: "Emma",
    locale: "en-GB",
    character: "Clear British",
  },
  {
    voiceId: "voice-5",
    engineVoiceId: "bm_george",
    name: "George",
    locale: "en-GB",
    character: "Measured British",
  },
  {
    voiceId: "voice-6",
    engineVoiceId: "af_aoede",
    name: "Aoede",
    locale: "en-US",
    character: "Bright American",
  },
  {
    voiceId: "voice-7",
    engineVoiceId: "af_kore",
    name: "Kore",
    locale: "en-US",
    character: "Composed American",
  },
  {
    voiceId: "voice-8",
    engineVoiceId: "af_nicole",
    name: "Nicole",
    locale: "en-US",
    character: "Smooth American",
  },
  {
    voiceId: "voice-9",
    engineVoiceId: "af_sarah",
    name: "Sarah",
    locale: "en-US",
    character: "Natural American",
  },
  {
    voiceId: "voice-10",
    engineVoiceId: "am_fenrir",
    name: "Fenrir",
    locale: "en-US",
    character: "Deep American",
  },
  {
    voiceId: "voice-11",
    engineVoiceId: "am_puck",
    name: "Puck",
    locale: "en-US",
    character: "Lively American",
  },
  {
    voiceId: "voice-12",
    engineVoiceId: "bm_fable",
    name: "Fable",
    locale: "en-GB",
    character: "Expressive British",
  },
] as const satisfies ReadonlyArray<{
  voiceId: BotAudioVoiceId;
  engineVoiceId: string;
  name: string;
  locale: string;
  character: string;
}>;

export type PrismBuiltinEnglishVoice =
  (typeof PRISM_BUILTIN_ENGLISH_VOICES)[number];

export function prismBuiltinEnglishVoice(
  voiceId: BotAudioVoiceId,
): PrismBuiltinEnglishVoice {
  return PRISM_BUILTIN_ENGLISH_VOICES.find(
    (voice) => voice.voiceId === voiceId,
  ) ?? PRISM_BUILTIN_ENGLISH_VOICES[0];
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
  pace: number;
  lilt: number;
  bottishTone: number;
  /** Signed low/high shelf tilt. Negative is low-forward; positive is bright. */
  eqTilt: number;
  /** Relative per-bot output trim in decibels; account Voice Volume stays master. */
  gainDb: number;
  volume: number;
  texture: BotVoiceTextureV1;
  /** Optional looping avatar sound that follows the bot's visible state. */
  avatarSfx?: BotAvatarSfxV1;
}

export const BOT_AVATAR_SFX_MAX_BYTES = 4 * 1024 * 1024;
export const BOT_AVATAR_SFX_PROMPT_MAX_LENGTH = 400;
export const BOT_AVATAR_SFX_FILE_NAME_MAX_LENGTH = 160;

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

export type BotAudioVoiceProfile = LegacyBotAudioVoiceProfileV1 | BotAudioVoiceProfileV2;

/** Backwards-compatible exported name used by the Phase 1 call sites. New
 * persistence always writes v2 through serializeBotAudioVoiceProfileV1. */
export type BotAudioVoiceProfileV1 = BotAudioVoiceProfile;
export type NormalizedBotAudioVoiceProfileV1 = BotAudioVoiceProfileV2;

/** Shared emotional delivery state for every spoken assistant surface. */
export type VoiceDeliveryMood =
  | "joyful"
  | "warm"
  | "neutral"
  | "guarded"
  | "strained";

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

export const NEUTRAL_COFFEE_VOICE_DELIVERY_ENVELOPE: CoffeeVoiceDeliveryEnvelope = {
  paceMultiplier: 1,
  pitchDeltaCents: 0,
  liltDelta: 0,
  warmthDelta: 0,
  emphasisStrength: 0,
};

export function normalizeVoiceDeliveryMood(
  value: unknown,
): VoiceDeliveryMood {
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

/** Apply mood without mutating or persisting the bot's authored profile. */
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
    tempo: Number((1 + profile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH).toFixed(3)),
    pitchCents: Math.round(profile.pitch * BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS),
  };
}

export function expectedVoicePlaybackDurationMs(
  sourceDurationMs: number,
  rawProfile: BotAudioVoiceProfileV1,
): number {
  const source = Number.isFinite(sourceDurationMs) ? Math.max(0, sourceDurationMs) : 0;
  return Math.max(1, Math.round(source / resolveVoicePlaybackTransform(rawProfile).tempo));
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
export const BOT_NAME_SELF_REFERRAL_MAX_LENGTH = BOT_NAME_PRONUNCIATION_MAX_LENGTH;

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
      ? normalizeBotSelfReferral(entry.selfReferral ?? entry.self_referral) || written
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
  return text.replace(pattern, (match) =>
    replacements.get(match.toLocaleLowerCase())?.spoken ?? match,
  );
}

export function applyPlayerNamePronunciation(
  text: unknown,
  displayName: string | null | undefined,
  pronunciation: string | null | undefined
): unknown {
  return applyBotNamePronunciations(text, [
    { name: displayName, namePronunciation: pronunciation },
  ]);
}

export const BOT_VOICE_TEXTURE_PRESET_LABELS: Record<BotVoiceTexturePreset, string> = {
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
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2: Readonly<BotAudioVoiceProfileV2> = {
  v: 2,
  enabled: true,
  baseVoiceId: "voice-1",
  elevenLabsEffect: DEFAULT_VOICE_EFFECT,
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
  bottishTone: 0.45,
  eqTilt: 0,
  gainDb: 0,
  volume: 1,
  texture: BOT_VOICE_TEXTURE_RECIPES.clean,
};
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1 = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2;

export function isBotAudioVoiceId(value: unknown): value is BotAudioVoiceId {
  return typeof value === "string" && (BOT_AUDIO_VOICE_IDS as readonly string[]).includes(value);
}

export function isBotVoiceTexturePreset(value: unknown): value is BotVoiceTexturePreset {
  return typeof value === "string" &&
    (BOT_VOICE_TEXTURE_PRESETS as readonly string[]).includes(value);
}

export function normalizeVoiceMode(value: unknown, fallback = DEFAULT_VOICE_MODE): VoiceMode {
  return value === "mute" || value === "english" || value === "babble" || value === "bottish"
    ? value
    : fallback;
}

export function normalizeEnglishVoiceEngine(
  value: unknown,
  fallback = DEFAULT_ENGLISH_VOICE_ENGINE
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
    ? value as VoiceEffect
    : fallback;
}

/** Backwards-compatible normalizer for the legacy persisted field name. */
export function normalizeElevenLabsVoiceEffect(value: unknown): VoiceEffect {
  return normalizeVoiceEffect(value);
}

export function normalizeElevenLabsVoiceDirection(
  value: unknown,
  fallback: string | null = null
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
      .trim()
      .slice(0, 48);
    if (!direction) continue;
    const key = direction.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    directions.push(direction);
    if (directions.length >= 3) break;
  }
  return directions.length > 0 ? directions.join(", ").slice(0, 240) : null;
}

/** Clamp finite values to the portable [-1, 1] performance range. */
export function normalizeBotAudioVoiceControl(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(-1, safe)).toFixed(3));
}

export function normalizeBotVoiceGainDb(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(
    Math.min(BOT_VOICE_GAIN_DB_MAX, Math.max(BOT_VOICE_GAIN_DB_MIN, safe)).toFixed(3),
  );
}

/** ElevenLabs accepts a 0..1 stability value. Older profiles keep the former
 * neutral behavior rather than inheriting any lilt-dependent provider setting. */
export function normalizeElevenLabsVoiceStability(
  value: unknown,
  fallback = ELEVENLABS_VOICE_STABILITY_DEFAULT,
): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(0, safe)).toFixed(3));
}

export function normalizeBotVoiceTextureUnit(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(0, safe)).toFixed(3));
}

export function botVoiceTextureForPreset(preset: BotVoiceTexturePreset): BotVoiceTextureV1 {
  return { ...BOT_VOICE_TEXTURE_RECIPES[preset] };
}

export function normalizeBotVoiceTexture(value: unknown): BotVoiceTextureV1 {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const preset = isBotVoiceTexturePreset(record.preset) ? record.preset : "clean";
  const fallback = BOT_VOICE_TEXTURE_RECIPES[preset];
  return {
    preset,
    amount: normalizeBotVoiceTextureUnit(record.amount, fallback.amount),
    bandwidth: normalizeBotVoiceTextureUnit(record.bandwidth, fallback.bandwidth),
    noise: normalizeBotVoiceTextureUnit(record.noise, fallback.noise),
    instability: normalizeBotVoiceTextureUnit(record.instability, fallback.instability),
    distortion: normalizeBotVoiceTextureUnit(record.distortion, fallback.distortion),
    damage: normalizeBotVoiceTextureUnit(record.damage, fallback.damage),
  };
}

export function botVoiceTextureIsModified(texture: BotVoiceTextureV1): boolean {
  const normalized = normalizeBotVoiceTexture(texture);
  const canonical = BOT_VOICE_TEXTURE_RECIPES[normalized.preset];
  return normalized.amount !== canonical.amount ||
    normalized.bandwidth !== canonical.bandwidth ||
    normalized.noise !== canonical.noise ||
    normalized.instability !== canonical.instability ||
    normalized.distortion !== canonical.distortion ||
    normalized.damage !== canonical.damage;
}

export function normalizeBotAudioVoiceProfileV1(
  value: unknown,
  fallback: BotAudioVoiceProfile = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2
): BotAudioVoiceProfileV2 {
  const fallbackProfile = normalizeBotAudioVoiceProfileFallback(fallback);
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const legacy = record.v !== 2;
  const systemVoiceName = normalizeOptionalVoiceSelection(
    record.systemVoiceName,
    fallbackProfile.systemVoiceName ?? null
  );
  const elevenLabsVoiceId = normalizeOptionalVoiceSelection(
    record.elevenLabsVoiceId,
    fallbackProfile.elevenLabsVoiceId ?? null
  );
  const elevenLabsVoiceIdOverride = normalizeOptionalVoiceSelection(
    record.elevenLabsVoiceIdOverride,
    fallbackProfile.elevenLabsVoiceIdOverride ?? null
  );
  const elevenLabsVoiceInitialized = record.elevenLabsVoiceInitialized === true;
  const voiceEffectExplicit = record.voiceEffectExplicit === true ||
    (record.elevenLabsEffect === "clean" && Boolean(
      elevenLabsVoiceId || elevenLabsVoiceIdOverride,
    ));
  const voiceEffect = record.elevenLabsEffect === "clean" && !voiceEffectExplicit
    ? fallbackProfile.elevenLabsEffect
    : normalizeVoiceEffect(
        record.elevenLabsEffect,
        fallbackProfile.elevenLabsEffect,
      );
  const elevenLabsDirection = normalizeElevenLabsVoiceDirection(
    record.elevenLabsDirection,
    fallbackProfile.elevenLabsDirection ?? null
  );
  const elevenLabsStability = normalizeElevenLabsVoiceStability(
    record.elevenLabsStability,
    fallbackProfile.elevenLabsStability ?? ELEVENLABS_VOICE_STABILITY_DEFAULT,
  );
  const avatarSfx = normalizeBotAvatarSfxV1(
    record.avatarSfx,
    fallbackProfile.avatarSfx ?? null,
  );
  return {
    v: 2,
    enabled: legacy ? true : record.enabled !== false,
    baseVoiceId: isBotAudioVoiceId(record.baseVoiceId)
      ? record.baseVoiceId
      : fallbackProfile.baseVoiceId,
    ...(systemVoiceName ? { systemVoiceName } : {}),
    ...(elevenLabsVoiceId ? { elevenLabsVoiceId } : {}),
    ...(elevenLabsVoiceIdOverride ? { elevenLabsVoiceIdOverride } : {}),
    ...(elevenLabsVoiceInitialized ? { elevenLabsVoiceInitialized: true } : {}),
    elevenLabsEffect: voiceEffect,
    ...(voiceEffectExplicit ? { voiceEffectExplicit: true } : {}),
    ...(elevenLabsDirection ? { elevenLabsDirection } : {}),
    ...(record.elevenLabsStability !== undefined ? { elevenLabsStability } : {}),
    pitch: normalizeBotAudioVoiceControl(record.pitch, fallbackProfile.pitch),
    warmth: normalizeBotAudioVoiceControl(record.warmth, fallbackProfile.warmth),
    pace: normalizeBotAudioVoiceControl(record.pace, fallbackProfile.pace),
    lilt: normalizeBotAudioVoiceControl(record.lilt, fallbackProfile.lilt),
    bottishTone: normalizeBotAudioVoiceControl(
      legacy ? record.signal : record.bottishTone,
      fallbackProfile.bottishTone
    ),
    eqTilt: normalizeBotAudioVoiceControl(record.eqTilt, fallbackProfile.eqTilt),
    gainDb: normalizeBotVoiceGainDb(record.gainDb, fallbackProfile.gainDb),
    volume: normalizeBotVoiceVolume(record.volume, fallbackProfile.volume),
    // Voice texture presets are retired. Keep the field canonical for export
    // compatibility, but always resolve old and new profiles to clean audio.
    texture: botVoiceTextureForPreset("clean"),
    ...(avatarSfx ? { avatarSfx } : {}),
  };
}

function normalizeBotAudioVoiceProfileFallback(value: BotAudioVoiceProfile): BotAudioVoiceProfileV2 {
  if (value.v === 2) {
    const { avatarSfx: rawAvatarSfx, ...voiceProfile } = value;
    const elevenLabsDirection = normalizeElevenLabsVoiceDirection(value.elevenLabsDirection);
    const elevenLabsStability = value.elevenLabsStability === undefined
      ? undefined
      : normalizeElevenLabsVoiceStability(value.elevenLabsStability);
    const avatarSfx = normalizeBotAvatarSfxV1(rawAvatarSfx);
    return {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      ...voiceProfile,
      elevenLabsEffect: normalizeVoiceEffect(value.elevenLabsEffect),
      ...(elevenLabsDirection
        ? { elevenLabsDirection }
        : { elevenLabsDirection: undefined }),
      ...(elevenLabsStability === undefined ? {} : { elevenLabsStability }),
      eqTilt: normalizeBotAudioVoiceControl(value.eqTilt),
      gainDb: normalizeBotVoiceGainDb(value.gainDb),
      texture: botVoiceTextureForPreset("clean"),
      ...(avatarSfx ? { avatarSfx } : {}),
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
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2.bottishTone
    ),
  };
}

export function normalizeBotVoiceVolume(value: unknown, fallback = 1): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
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
  fallback = 0.45,
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
  const rawDataUrl = typeof record.audioDataUrl === "string"
    ? record.audioDataUrl.trim()
    : "";
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
  fallback: string | null = null
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 240) : null;
}

/** Null is a deliberate absence for per-user overrides; malformed values are ignored. */
export function normalizeOptionalBotAudioVoiceProfileV1(value: unknown): BotAudioVoiceProfileV2 | null {
  if (value === null || value === undefined) return null;
  let candidate = value;
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate); } catch { return null; }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  const version = record.v;
  const recognizableUnversionedProfile = version === undefined && (
    isBotAudioVoiceId(record.baseVoiceId) ||
    typeof record.systemVoiceName === "string" ||
    typeof record.elevenLabsVoiceId === "string" ||
    typeof record.elevenLabsVoiceIdOverride === "string" ||
    record.elevenLabsVoiceInitialized === true
  );
  if (version !== 1 && version !== 2 && !recognizableUnversionedProfile) return null;
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

  if (override.elevenLabsVoiceInitialized === true &&
      !override.elevenLabsVoiceIdOverride &&
      !override.elevenLabsVoiceId) {
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

export function parseStoredBotAudioVoiceProfileV1(value: unknown): BotAudioVoiceProfileV2 | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try { return normalizeOptionalBotAudioVoiceProfileV1(JSON.parse(value)); } catch { return null; }
}

export function serializeBotAudioVoiceProfileV1(value: unknown): string {
  return JSON.stringify(normalizeBotAudioVoiceProfileV1(value));
}
