import type { BotVoicePreset } from "./botProfile.js";

export const BOT_FACE_FONT_IDS = [
  "neutral",
  "warm",
  "concise",
  "playful",
  "formal",
] as const;

export type BotFaceFontId = (typeof BOT_FACE_FONT_IDS)[number];

export const BOT_FACE_FONT_LABELS: Record<BotFaceFontId, string> = {
  neutral: "Core",
  warm: "Soft",
  concise: "Mono",
  playful: "Bounce",
  formal: "Serif",
};

export const DEFAULT_BOT_FACE_FONT_ID: BotFaceFontId = "neutral";
export const DEFAULT_BOT_FACE_EYE_CHARACTER: string | null = null;
export const DEFAULT_BOT_FACE_FONT_WEIGHT = 600;
export const BOT_FACE_FONT_WEIGHT_MIN = 300;
export const BOT_FACE_FONT_WEIGHT_MAX = 800;
export const BOT_FACE_FONT_WEIGHT_STEP = 25;

export interface BotFaceStyle {
  eyesFont: BotFaceFontId;
  eyeCharacter: string | null;
  mouthFont: BotFaceFontId;
  weight: number;
}

export interface BotFaceStyleInput {
  faceEyesFont?: unknown;
  faceEyeCharacter?: unknown;
  faceMouthFont?: unknown;
  faceFontWeight?: unknown;
}

export function isBotFaceFontId(value: unknown): value is BotFaceFontId {
  return (
    typeof value === "string" &&
    BOT_FACE_FONT_IDS.includes(value as BotFaceFontId)
  );
}

export function normalizeBotFaceFontId(
  value: unknown
): BotFaceFontId | null {
  return isBotFaceFontId(value) ? value : null;
}

export function normalizeBotFaceEyeCharacter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const [character] = Array.from(value.trim());
  return character ?? null;
}

export function normalizeBotFaceFontWeight(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const stepped =
    Math.round(value / BOT_FACE_FONT_WEIGHT_STEP) * BOT_FACE_FONT_WEIGHT_STEP;
  return Math.max(
    BOT_FACE_FONT_WEIGHT_MIN,
    Math.min(BOT_FACE_FONT_WEIGHT_MAX, stepped)
  );
}

export function botFaceFontFromVoicePreset(
  preset: BotVoicePreset | null | undefined
): BotFaceFontId {
  return isBotFaceFontId(preset) ? preset : DEFAULT_BOT_FACE_FONT_ID;
}

export function resolveBotFaceStyle(
  input: BotFaceStyleInput,
  fallbackVoicePreset?: BotVoicePreset | null
): BotFaceStyle {
  const fallbackFont = botFaceFontFromVoicePreset(fallbackVoicePreset);
  return {
    eyesFont: normalizeBotFaceFontId(input.faceEyesFont) ?? fallbackFont,
    eyeCharacter:
      normalizeBotFaceEyeCharacter(input.faceEyeCharacter) ??
      DEFAULT_BOT_FACE_EYE_CHARACTER,
    mouthFont: normalizeBotFaceFontId(input.faceMouthFont) ?? fallbackFont,
    weight:
      normalizeBotFaceFontWeight(input.faceFontWeight) ??
      DEFAULT_BOT_FACE_FONT_WEIGHT,
  };
}

export function randomBotFaceStyle(random = Math.random): BotFaceStyle {
  const pickFont = (): BotFaceFontId => {
    const index = Math.floor(random() * BOT_FACE_FONT_IDS.length);
    return BOT_FACE_FONT_IDS[index] ?? DEFAULT_BOT_FACE_FONT_ID;
  };
  const weightSteps =
    (BOT_FACE_FONT_WEIGHT_MAX - BOT_FACE_FONT_WEIGHT_MIN) /
    BOT_FACE_FONT_WEIGHT_STEP;
  const weight =
    BOT_FACE_FONT_WEIGHT_MIN +
    Math.round(random() * weightSteps) * BOT_FACE_FONT_WEIGHT_STEP;
  return {
    eyesFont: pickFont(),
    eyeCharacter: DEFAULT_BOT_FACE_EYE_CHARACTER,
    mouthFont: pickFont(),
    weight,
  };
}
