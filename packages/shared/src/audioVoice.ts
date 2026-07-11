/** Account-wide voice mode. This is intentionally separate from BotVoicePreset,
 * which controls how a bot writes rather than how it sounds. */
export type VoiceMode = "mute" | "bottish" | "english";
export type EnglishVoiceEngine = "builtin" | "elevenlabs";

export const BOT_AUDIO_VOICE_IDS = [
  "voice-1",
  "voice-2",
  "voice-3",
  "voice-4",
  "voice-5",
] as const;
export type BotAudioVoiceId = (typeof BOT_AUDIO_VOICE_IDS)[number];

export interface BotAudioVoiceProfileV1 {
  v: 1;
  baseVoiceId: BotAudioVoiceId;
  pitch: number;
  warmth: number;
  pace: number;
  lilt: number;
}

export const DEFAULT_VOICE_MODE: VoiceMode = "mute";
export const DEFAULT_ENGLISH_VOICE_ENGINE: EnglishVoiceEngine = "builtin";
export const DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1: Readonly<BotAudioVoiceProfileV1> = {
  v: 1,
  baseVoiceId: "voice-1",
  pitch: 0,
  warmth: 0,
  pace: 0,
  lilt: 0,
};

export function isBotAudioVoiceId(value: unknown): value is BotAudioVoiceId {
  return typeof value === "string" && (BOT_AUDIO_VOICE_IDS as readonly string[]).includes(value);
}

export function normalizeVoiceMode(value: unknown, fallback = DEFAULT_VOICE_MODE): VoiceMode {
  return value === "mute" || value === "bottish" || value === "english" ? value : fallback;
}

export function normalizeEnglishVoiceEngine(
  value: unknown,
  fallback = DEFAULT_ENGLISH_VOICE_ENGINE
): EnglishVoiceEngine {
  return value === "builtin" || value === "elevenlabs" ? value : fallback;
}

/** Clamp finite values to the portable [-1, 1] profile range. */
export function normalizeBotAudioVoiceControl(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Number(Math.min(1, Math.max(-1, safe)).toFixed(3));
}

export function normalizeBotAudioVoiceProfileV1(
  value: unknown,
  fallback: BotAudioVoiceProfileV1 = DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1
): BotAudioVoiceProfileV1 {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    v: 1,
    baseVoiceId: isBotAudioVoiceId(record.baseVoiceId) ? record.baseVoiceId : fallback.baseVoiceId,
    pitch: normalizeBotAudioVoiceControl(record.pitch, fallback.pitch),
    warmth: normalizeBotAudioVoiceControl(record.warmth, fallback.warmth),
    pace: normalizeBotAudioVoiceControl(record.pace, fallback.pace),
    lilt: normalizeBotAudioVoiceControl(record.lilt, fallback.lilt),
  };
}

/** Null is a deliberate absence for per-user overrides; malformed values are ignored. */
export function normalizeOptionalBotAudioVoiceProfileV1(value: unknown): BotAudioVoiceProfileV1 | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if ((value as Record<string, unknown>).v !== 1) return null;
  return normalizeBotAudioVoiceProfileV1(value);
}

export function parseStoredBotAudioVoiceProfileV1(value: unknown): BotAudioVoiceProfileV1 | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try { return normalizeOptionalBotAudioVoiceProfileV1(JSON.parse(value)); } catch { return null; }
}

export function serializeBotAudioVoiceProfileV1(value: unknown): string {
  return JSON.stringify(normalizeBotAudioVoiceProfileV1(value));
}
