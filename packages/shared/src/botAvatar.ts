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
export const DEFAULT_BOT_FACE_EYE_SCALE = 1;
export const BOT_FACE_EYE_SCALE_MIN = 0.7;
export const BOT_FACE_EYE_SCALE_MAX = 1.3;
export const BOT_FACE_EYE_SCALE_STEP = 0.05;
export const DEFAULT_BOT_FACE_EYE_OFFSET_Y = 0;
export const BOT_FACE_EYE_OFFSET_Y_MIN = -0.18;
export const BOT_FACE_EYE_OFFSET_Y_MAX = 0.18;
export const BOT_FACE_EYE_OFFSET_Y_STEP = 0.02;
export const BOT_FACE_BLINK_BAR_VALUES = ["none", "¦", "❘", "|"] as const;
export type BotFaceBlinkBar = string;
export const DEFAULT_BOT_FACE_BLINK_BAR: BotFaceBlinkBar = "|";

export interface BotFaceStyle {
  eyesFont: BotFaceFontId;
  eyeCharacter: string | null;
  mouthFont: BotFaceFontId;
  weight: number;
  eyeScale: number;
  eyeOffsetY: number;
  blinkBar: BotFaceBlinkBar;
}

export interface BotFaceStyleInput {
  faceEyesFont?: unknown;
  faceEyeCharacter?: unknown;
  faceMouthFont?: unknown;
  faceFontWeight?: unknown;
  faceEyeScale?: unknown;
  faceEyeOffsetY?: unknown;
  faceBlinkBar?: unknown;
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

function normalizeSteppedBotFaceFloat(
  value: unknown,
  min: number,
  max: number,
  step: number
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const stepped = Math.round(value / step) * step;
  const clamped = Math.max(min, Math.min(max, stepped));
  return Number(clamped.toFixed(3));
}

export function normalizeBotFaceEyeScale(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_EYE_SCALE_MIN,
    BOT_FACE_EYE_SCALE_MAX,
    BOT_FACE_EYE_SCALE_STEP
  );
}

export function normalizeBotFaceEyeOffsetY(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_EYE_OFFSET_Y_MIN,
    BOT_FACE_EYE_OFFSET_Y_MAX,
    BOT_FACE_EYE_OFFSET_Y_STEP
  );
}

export function normalizeBotFaceBlinkBar(value: unknown): BotFaceBlinkBar | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "none") return trimmed;
  const [character] = Array.from(trimmed);
  return character ?? null;
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
    eyeScale:
      normalizeBotFaceEyeScale(input.faceEyeScale) ??
      DEFAULT_BOT_FACE_EYE_SCALE,
    eyeOffsetY:
      normalizeBotFaceEyeOffsetY(input.faceEyeOffsetY) ??
      DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    blinkBar:
      normalizeBotFaceBlinkBar(input.faceBlinkBar) ??
      DEFAULT_BOT_FACE_BLINK_BAR,
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
    eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
    eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
  };
}
