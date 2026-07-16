/** Account-wide voice mode. This is intentionally separate from BotVoicePreset,
 * which controls how a bot writes rather than how it sounds. */
export type VoiceMode = "mute" | "english" | "babble" | "bottish";
export type EnglishVoiceEngine = "builtin" | "elevenlabs";

export const ELEVENLABS_VOICE_EFFECTS = [
  "clean",
  "radio",
  "robot",
  "echo",
  "chorus",
  "deep-space",
] as const;
export type ElevenLabsVoiceEffect = (typeof ELEVENLABS_VOICE_EFFECTS)[number];

export const ELEVENLABS_VOICE_EFFECT_LABELS: Record<ElevenLabsVoiceEffect, string> = {
  clean: "Clean",
  radio: "Radio",
  robot: "Robot",
  echo: "Echo",
  chorus: "Chorus",
  "deep-space": "Deep Space",
};

export const ELEVENLABS_VOICE_EFFECT_DESCRIPTIONS: Record<
  ElevenLabsVoiceEffect,
  string
> = {
  clean: "Unprocessed ElevenLabs voice.",
  radio: "Narrow-band broadcast tone with a trace of radio noise.",
  robot: "Mechanical pulse and a subtly doubled synthetic carrier.",
  echo: "Two level-controlled repeats behind the original voice.",
  chorus: "A wide, gently detuned double without extra loudness.",
  "deep-space": "A lower spectral double with a distant trailing reflection.",
};

export const BOT_AUDIO_VOICE_IDS = [
  "voice-1",
  "voice-2",
  "voice-3",
  "voice-4",
  "voice-5",
] as const;
export type BotAudioVoiceId = (typeof BOT_AUDIO_VOICE_IDS)[number];

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
}

export interface BotAudioVoiceProfileV2 {
  v: 2;
  enabled: boolean;
  baseVoiceId: BotAudioVoiceId;
  systemVoiceName?: string | null;
  elevenLabsVoiceId?: string | null;
  elevenLabsEffect: ElevenLabsVoiceEffect;
  /** Comma-separated Eleven v3 audio directions such as "warm, hushed". */
  elevenLabsDirection?: string | null;
  pitch: number;
  warmth: number;
  pace: number;
  lilt: number;
  bottishTone: number;
  volume: number;
  texture: BotVoiceTextureV1;
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

export const ELEVENLABS_VOICE_SPEED_MIN = 0.7;
export const ELEVENLABS_VOICE_SPEED_MAX = 1.2;
export const BOT_AUDIO_VOICE_PACE_RATE_DEPTH = 0.24;
export const BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS = 650;

export interface ElevenLabsVoicePerformanceV1 {
  speed: number;
  playbackDetuneCents: number;
  deliveryRate: number;
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

/** Keep the requested delivery rate authoritative when ElevenLabs reaches its
 * native speed limits. Extreme pitch is softened only as much as necessary so
 * a low-pitched voice does not silently become a slow voice. */
export function resolveElevenLabsVoicePerformance(
  rawProfile: BotAudioVoiceProfileV1,
): ElevenLabsVoicePerformanceV1 {
  const profile = normalizeBotAudioVoiceProfileV1(rawProfile);
  const deliveryRate = 1 + profile.pace * BOT_AUDIO_VOICE_PACE_RATE_DEPTH;
  const requestedPitchRatio = 2 ** (
    (profile.pitch * BOT_AUDIO_VOICE_PITCH_DEPTH_CENTS) / 1200
  );
  const speed = Math.min(
    ELEVENLABS_VOICE_SPEED_MAX,
    Math.max(
      ELEVENLABS_VOICE_SPEED_MIN,
      deliveryRate / requestedPitchRatio,
    ),
  );
  const compensatedPlaybackRatio = deliveryRate / speed;
  return {
    speed: Number(speed.toFixed(3)),
    playbackDetuneCents: Math.round(
      1200 * Math.log2(compensatedPlaybackRatio),
    ),
    deliveryRate: Number(deliveryRate.toFixed(3)),
  };
}

export const BOT_NAME_PRONUNCIATION_MAX_LENGTH = 120;

export interface BotNamePronunciationEntry {
  name: string | null | undefined;
  namePronunciation?: string | null | undefined;
  name_pronunciation?: string | null | undefined;
}

export function normalizeBotNamePronunciation(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, BOT_NAME_PRONUNCIATION_MAX_LENGTH);
}

export function applyBotNamePronunciations(
  text: unknown,
  entries: readonly BotNamePronunciationEntry[],
): unknown {
  if (typeof text !== "string" || entries.length === 0) return text;
  const replacements = new Map<string, { written: string; spoken: string }>();
  for (const entry of entries) {
    const written = entry.name?.replace(/\s+/gu, " ").trim() ?? "";
    const spoken = normalizeBotNamePronunciation(
      entry.namePronunciation ?? entry.name_pronunciation,
    );
    const key = written.toLocaleLowerCase();
    if (
      !written ||
      !spoken ||
      key === spoken.toLocaleLowerCase() ||
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
  elevenLabsEffect: "clean",
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
  bottishTone: 0.45,
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

export function normalizeElevenLabsVoiceEffect(value: unknown): ElevenLabsVoiceEffect {
  // Migrate the original harsh bit-crusher preset to the more musical chorus.
  if (value === "distortion") return "chorus";
  return typeof value === "string" &&
    (ELEVENLABS_VOICE_EFFECTS as readonly string[]).includes(value)
    ? value as ElevenLabsVoiceEffect
    : "clean";
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
    if (directions.length >= 8) break;
  }
  return directions.length > 0 ? directions.join(", ").slice(0, 240) : null;
}

/** Clamp finite values to the portable [-1, 1] performance range. */
export function normalizeBotAudioVoiceControl(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(-1, safe)).toFixed(3));
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
  const elevenLabsDirection = normalizeElevenLabsVoiceDirection(
    record.elevenLabsDirection,
    fallbackProfile.elevenLabsDirection ?? null
  );
  return {
    v: 2,
    enabled: legacy ? true : record.enabled !== false,
    baseVoiceId: isBotAudioVoiceId(record.baseVoiceId)
      ? record.baseVoiceId
      : fallbackProfile.baseVoiceId,
    ...(systemVoiceName ? { systemVoiceName } : {}),
    ...(elevenLabsVoiceId ? { elevenLabsVoiceId } : {}),
    elevenLabsEffect: normalizeElevenLabsVoiceEffect(record.elevenLabsEffect),
    ...(elevenLabsDirection ? { elevenLabsDirection } : {}),
    pitch: normalizeBotAudioVoiceControl(record.pitch, fallbackProfile.pitch),
    warmth: normalizeBotAudioVoiceControl(record.warmth, fallbackProfile.warmth),
    pace: normalizeBotAudioVoiceControl(record.pace, fallbackProfile.pace),
    lilt: normalizeBotAudioVoiceControl(record.lilt, fallbackProfile.lilt),
    bottishTone: normalizeBotAudioVoiceControl(
      legacy ? record.signal : record.bottishTone,
      fallbackProfile.bottishTone
    ),
    volume: normalizeBotVoiceVolume(record.volume, fallbackProfile.volume),
    // Voice texture presets are retired. Keep the field canonical for export
    // compatibility, but always resolve old and new profiles to clean audio.
    texture: botVoiceTextureForPreset("clean"),
  };
}

function normalizeBotAudioVoiceProfileFallback(value: BotAudioVoiceProfile): BotAudioVoiceProfileV2 {
  if (value.v === 2) {
    const elevenLabsDirection = normalizeElevenLabsVoiceDirection(value.elevenLabsDirection);
    return {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V2,
      ...value,
      elevenLabsEffect: normalizeElevenLabsVoiceEffect(value.elevenLabsEffect),
      ...(elevenLabsDirection
        ? { elevenLabsDirection }
        : { elevenLabsDirection: undefined }),
      texture: botVoiceTextureForPreset("clean"),
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
    typeof record.elevenLabsVoiceId === "string"
  );
  if (version !== 1 && version !== 2 && !recognizableUnversionedProfile) return null;
  return normalizeBotAudioVoiceProfileV1(candidate);
}

export function parseStoredBotAudioVoiceProfileV1(value: unknown): BotAudioVoiceProfileV2 | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try { return normalizeOptionalBotAudioVoiceProfileV1(JSON.parse(value)); } catch { return null; }
}

export function serializeBotAudioVoiceProfileV1(value: unknown): string {
  return JSON.stringify(normalizeBotAudioVoiceProfileV1(value));
}
