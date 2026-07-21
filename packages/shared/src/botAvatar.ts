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
  concise: "Doto",
  playful: "Bounce",
  formal: "Serif",
};

export const DEFAULT_BOT_FACE_FONT_ID: BotFaceFontId = "neutral";
export const BOT_FACE_GLYPH_ANIMATIONS = [
  "none",
  "pulsate",
  "spin",
  "flicker",
  "wobble",
] as const;
export type BotFaceGlyphAnimation = (typeof BOT_FACE_GLYPH_ANIMATIONS)[number];
export const DEFAULT_BOT_FACE_GLYPH_ANIMATION: BotFaceGlyphAnimation = "none";
export const DEFAULT_BOT_FACE_EYE_CHARACTER: string | null = null;
export const BOT_FACE_EYE_COUNTS = [1, 2] as const;
export type BotFaceEyeCount = (typeof BOT_FACE_EYE_COUNTS)[number];
/** A custom glyph is one authored eye unit unless the user opts into a pair. */
export const DEFAULT_BOT_FACE_EYE_COUNT: BotFaceEyeCount = 1;
export const DEFAULT_BOT_FACE_MOUTH_CHARACTER: string | null = null;
/** Existing custom mouths stay visible during Coffee sips until explicitly opted in. */
export const DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER = false;
export const DEFAULT_BOT_FACE_FONT_WEIGHT = 600;
export const BOT_FACE_FONT_WEIGHT_MIN = 300;
export const BOT_FACE_FONT_WEIGHT_MAX = 800;
export const BOT_FACE_FONT_WEIGHT_STEP = 25;
export const DEFAULT_BOT_FACE_EYE_SCALE = 1;
export const BOT_FACE_EYE_SCALE_MIN = 0.7;
export const BOT_FACE_EYE_SCALE_MAX = 1.3;
export const BOT_FACE_EYE_SCALE_STEP = 0.05;
export const DEFAULT_BOT_FACE_EYE_OFFSET_X = 0;
export const BOT_FACE_EYE_OFFSET_X_MIN = -0.18;
export const BOT_FACE_EYE_OFFSET_X_MAX = 0.18;
export const BOT_FACE_EYE_OFFSET_X_STEP = 0.02;
export const DEFAULT_BOT_FACE_EYE_OFFSET_Y = 0;
export const BOT_FACE_EYE_OFFSET_Y_MIN = -0.18;
export const BOT_FACE_EYE_OFFSET_Y_MAX = 0.18;
export const BOT_FACE_EYE_OFFSET_Y_STEP = 0.02;
/** Plate-relative default — custom eyes inherit the same sideways orientation as built-ins. */
export const DEFAULT_BOT_FACE_EYE_ROTATION_DEG = 0;
export const BOT_FACE_EYE_ROTATION_DEG_MIN = -180;
export const BOT_FACE_EYE_ROTATION_DEG_MAX = 180;
export const BOT_FACE_EYE_ROTATION_DEG_STEP = 5;
export const DEFAULT_BOT_FACE_MOUTH_SCALE = 1;
export const BOT_FACE_MOUTH_SCALE_MIN = 0.7;
export const BOT_FACE_MOUTH_SCALE_MAX = 1.5;
export const BOT_FACE_MOUTH_SCALE_STEP = 0.05;
export const DEFAULT_BOT_FACE_MOUTH_OFFSET_X = 0;
export const BOT_FACE_MOUTH_OFFSET_X_MIN = -0.18;
export const BOT_FACE_MOUTH_OFFSET_X_MAX = 0.18;
export const BOT_FACE_MOUTH_OFFSET_X_STEP = 0.02;
export const DEFAULT_BOT_FACE_MOUTH_OFFSET_Y = 0;
export const BOT_FACE_MOUTH_OFFSET_Y_MIN = -0.18;
export const BOT_FACE_MOUTH_OFFSET_Y_MAX = 0.18;
export const BOT_FACE_MOUTH_OFFSET_Y_STEP = 0.02;
export const DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG = 0;
export const BOT_FACE_MOUTH_ROTATION_DEG_MIN = -180;
export const BOT_FACE_MOUTH_ROTATION_DEG_MAX = 180;
export const BOT_FACE_MOUTH_ROTATION_DEG_STEP = 5;
export const BOT_FACE_BLINK_BAR_VALUES = ["none", " ", "❘", "¦"] as const;
export type BotFaceBlinkBar = string;
export const DEFAULT_BOT_FACE_BLINK_BAR: BotFaceBlinkBar = " ";
export const DEFAULT_BOT_FACE_BLINK_SCALE = 1;
export const BOT_FACE_BLINK_SCALE_MIN = 0.7;
export const BOT_FACE_BLINK_SCALE_MAX = 1.3;
export const BOT_FACE_BLINK_SCALE_STEP = 0.05;
export const DEFAULT_BOT_FACE_BLINK_OFFSET_X = 0;
export const BOT_FACE_BLINK_OFFSET_X_MIN = -0.18;
export const BOT_FACE_BLINK_OFFSET_X_MAX = 0.18;
export const BOT_FACE_BLINK_OFFSET_X_STEP = 0.02;
export const DEFAULT_BOT_FACE_BLINK_OFFSET_Y = 0;
export const BOT_FACE_BLINK_OFFSET_Y_MIN = -0.18;
export const BOT_FACE_BLINK_OFFSET_Y_MAX = 0.18;
export const BOT_FACE_BLINK_OFFSET_Y_STEP = 0.02;
export const BOT_FACE_THINKING_FRAME_COUNT = 4;
export type BotFaceThinkingFrames = readonly [string, string, string, string];
export const DEFAULT_BOT_FACE_THINKING_FRAMES: BotFaceThinkingFrames = [
  "|",
  "/",
  "-",
  "\\",
];
export const DISABLED_BOT_FACE_THINKING_FRAMES: BotFaceThinkingFrames = [
  "",
  "",
  "",
  "",
];

export interface BotFaceStyle {
  eyesFont: BotFaceFontId;
  eyeCharacter: string | null;
  eyeCount: BotFaceEyeCount;
  /** Legacy compatibility field. Custom eye glyphs do not animate. */
  eyeAnimation: BotFaceGlyphAnimation;
  mouthFont: BotFaceFontId;
  mouthCharacter: string | null;
  mouthAnimation: BotFaceGlyphAnimation;
  mouthCoffeePucker: boolean;
  weight: number;
  eyeScale: number;
  eyeOffsetX: number;
  eyeOffsetY: number;
  eyeRotationDeg: number;
  mouthScale: number;
  mouthOffsetX: number;
  mouthOffsetY: number;
  mouthRotationDeg: number;
  blinkBar: BotFaceBlinkBar;
  blinkScale: number;
  blinkOffsetX: number;
  blinkOffsetY: number;
  thinkingFrames: BotFaceThinkingFrames;
}

export interface BotFaceStyleInput {
  faceEyesFont?: unknown;
  faceEyeCharacter?: unknown;
  faceEyeCount?: unknown;
  faceEyeAnimation?: unknown;
  faceMouthFont?: unknown;
  faceMouthCharacter?: unknown;
  faceMouthAnimation?: unknown;
  faceMouthCoffeePucker?: unknown;
  faceFontWeight?: unknown;
  faceEyeScale?: unknown;
  faceEyeOffsetX?: unknown;
  faceEyeOffsetY?: unknown;
  faceEyeRotationDeg?: unknown;
  faceMouthScale?: unknown;
  faceMouthOffsetX?: unknown;
  faceMouthOffsetY?: unknown;
  faceMouthRotationDeg?: unknown;
  faceBlinkBar?: unknown;
  faceBlinkScale?: unknown;
  faceBlinkOffsetX?: unknown;
  faceBlinkOffsetY?: unknown;
  faceThinkingFrames?: unknown;
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

export function normalizeBotFaceGlyphAnimation(
  value: unknown
): BotFaceGlyphAnimation | null {
  return typeof value === "string" &&
    BOT_FACE_GLYPH_ANIMATIONS.includes(value as BotFaceGlyphAnimation)
    ? (value as BotFaceGlyphAnimation)
    : null;
}

const BOT_FACE_EMOJI_GLYPH_PATTERN =
  /[\u200d\u20e3\ufe0f]|\p{Emoji_Presentation}|\p{Emoji_Modifier}/u;

function botFaceGraphemeHasEmoji(value: string): boolean {
  return BOT_FACE_EMOJI_GLYPH_PATTERN.test(value);
}

export function normalizeBotFaceEyeCharacter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value === " ") return value;
  const [glyph] = splitBotFaceVisibleGraphemes(value);
  if (!glyph || botFaceGraphemeHasEmoji(glyph)) return null;
  return glyph;
}

export function normalizeBotFaceEyeCount(
  value: unknown
): BotFaceEyeCount | null {
  return value === 1 || value === 2 ? value : null;
}

export function normalizeBotFaceMouthCharacter(value: unknown): string | null {
  return normalizeBotFaceEyeCharacter(value);
}

export function normalizeBotFaceMouthCoffeePucker(
  value: unknown
): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
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

export function normalizeBotFaceEyeOffsetX(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_EYE_OFFSET_X_MIN,
    BOT_FACE_EYE_OFFSET_X_MAX,
    BOT_FACE_EYE_OFFSET_X_STEP
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

export function normalizeBotFaceEyeRotationDeg(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_EYE_ROTATION_DEG_MIN,
    BOT_FACE_EYE_ROTATION_DEG_MAX,
    BOT_FACE_EYE_ROTATION_DEG_STEP
  );
}

export function normalizeBotFaceMouthScale(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_MOUTH_SCALE_MIN,
    BOT_FACE_MOUTH_SCALE_MAX,
    BOT_FACE_MOUTH_SCALE_STEP
  );
}

export function normalizeBotFaceMouthOffsetX(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_MOUTH_OFFSET_X_MIN,
    BOT_FACE_MOUTH_OFFSET_X_MAX,
    BOT_FACE_MOUTH_OFFSET_X_STEP
  );
}

export function normalizeBotFaceMouthOffsetY(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_MOUTH_OFFSET_Y_MIN,
    BOT_FACE_MOUTH_OFFSET_Y_MAX,
    BOT_FACE_MOUTH_OFFSET_Y_STEP
  );
}

export function normalizeBotFaceMouthRotationDeg(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_MOUTH_ROTATION_DEG_MIN,
    BOT_FACE_MOUTH_ROTATION_DEG_MAX,
    BOT_FACE_MOUTH_ROTATION_DEG_STEP
  );
}

export function normalizeBotFaceBlinkBar(value: unknown): BotFaceBlinkBar | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_BOT_FACE_BLINK_BAR;
  if (trimmed === "none") return trimmed;
  const [character] = splitBotFaceVisibleGraphemes(trimmed);
  if (!character || botFaceGraphemeHasEmoji(character)) return null;
  return character;
}

export function normalizeBotFaceBlinkScale(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_BLINK_SCALE_MIN,
    BOT_FACE_BLINK_SCALE_MAX,
    BOT_FACE_BLINK_SCALE_STEP
  );
}

export function normalizeBotFaceBlinkOffsetX(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_BLINK_OFFSET_X_MIN,
    BOT_FACE_BLINK_OFFSET_X_MAX,
    BOT_FACE_BLINK_OFFSET_X_STEP
  );
}

export function normalizeBotFaceBlinkOffsetY(value: unknown): number | null {
  return normalizeSteppedBotFaceFloat(
    value,
    BOT_FACE_BLINK_OFFSET_Y_MIN,
    BOT_FACE_BLINK_OFFSET_Y_MAX,
    BOT_FACE_BLINK_OFFSET_Y_STEP
  );
}

type BotFaceGraphemeSegment = {
  segment: string;
};

type BotFaceGraphemeSegmenter = {
  segment(input: string): Iterable<BotFaceGraphemeSegment>;
};

type BotFaceGraphemeSegmenterConstructor = new (
  locale?: string | string[],
  options?: { granularity?: "grapheme" }
) => BotFaceGraphemeSegmenter;

function splitBotFaceVisibleGraphemes(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const segmenterConstructor = (
    Intl as unknown as { Segmenter?: BotFaceGraphemeSegmenterConstructor }
  ).Segmenter;
  const segments = segmenterConstructor
    ? Array.from(
        new segmenterConstructor(undefined, { granularity: "grapheme" }).segment(
          trimmed
        ),
        (part) => part.segment
      )
    : Array.from(trimmed);
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function botFaceThinkingFramesFromList(
  frames: readonly string[]
): BotFaceThinkingFrames | null {
  if (frames.length !== BOT_FACE_THINKING_FRAME_COUNT) return null;
  const [first, second, third, fourth] = frames;
  if (!first || !second || !third || !fourth) return null;
  if (frames.some((frame) => botFaceGraphemeHasEmoji(frame))) return null;
  return [first, second, third, fourth];
}

export function normalizeBotFaceThinkingFrames(
  value: unknown
): BotFaceThinkingFrames | null {
  if (typeof value === "string") {
    return botFaceThinkingFramesFromList(splitBotFaceVisibleGraphemes(value));
  }
  if (!Array.isArray(value)) return null;
  if (
    value.length === BOT_FACE_THINKING_FRAME_COUNT &&
    value.every((entry) => typeof entry === "string" && entry.trim() === "")
  ) {
    return DISABLED_BOT_FACE_THINKING_FRAMES;
  }
  const frames = value.flatMap((entry) =>
    typeof entry === "string" ? splitBotFaceVisibleGraphemes(entry) : []
  );
  return botFaceThinkingFramesFromList(frames);
}

export function botFaceThinkingSpinnerDisabled(value: unknown): boolean {
  const frames = normalizeBotFaceThinkingFrames(value);
  return (
    frames !== null &&
    botFaceThinkingFramesEqual(frames, DISABLED_BOT_FACE_THINKING_FRAMES)
  );
}

export function parseStoredBotFaceThinkingFrames(
  value: unknown
): BotFaceThinkingFrames | null {
  if (typeof value !== "string") return normalizeBotFaceThinkingFrames(value);
  try {
    return normalizeBotFaceThinkingFrames(JSON.parse(value));
  } catch {
    return normalizeBotFaceThinkingFrames(value);
  }
}

export function serializeBotFaceThinkingFrames(value: unknown): string | null {
  const frames = normalizeBotFaceThinkingFrames(value);
  return frames ? JSON.stringify(frames) : null;
}

export function botFaceThinkingFramesEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((frame, index) => frame === right[index]);
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
  const eyeCharacter =
    normalizeBotFaceEyeCharacter(input.faceEyeCharacter) ??
    DEFAULT_BOT_FACE_EYE_CHARACTER;
  const mouthCharacter =
    normalizeBotFaceMouthCharacter(input.faceMouthCharacter) ??
    DEFAULT_BOT_FACE_MOUTH_CHARACTER;
  return {
    eyesFont: normalizeBotFaceFontId(input.faceEyesFont) ?? fallbackFont,
    eyeCharacter,
    eyeCount:
      eyeCharacter !== null
        ? normalizeBotFaceEyeCount(input.faceEyeCount) ??
          DEFAULT_BOT_FACE_EYE_COUNT
        : DEFAULT_BOT_FACE_EYE_COUNT,
    eyeAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    mouthFont: normalizeBotFaceFontId(input.faceMouthFont) ?? fallbackFont,
    mouthCharacter,
    mouthAnimation:
      normalizeBotFaceGlyphAnimation(input.faceMouthAnimation) ??
      DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    mouthCoffeePucker:
      normalizeBotFaceMouthCoffeePucker(input.faceMouthCoffeePucker) ??
      DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
    weight:
      normalizeBotFaceFontWeight(input.faceFontWeight) ??
      DEFAULT_BOT_FACE_FONT_WEIGHT,
    eyeScale:
      normalizeBotFaceEyeScale(input.faceEyeScale) ??
      DEFAULT_BOT_FACE_EYE_SCALE,
    eyeOffsetX:
      eyeCharacter !== null
        ? normalizeBotFaceEyeOffsetX(input.faceEyeOffsetX) ??
          DEFAULT_BOT_FACE_EYE_OFFSET_X
        : DEFAULT_BOT_FACE_EYE_OFFSET_X,
    eyeOffsetY:
      normalizeBotFaceEyeOffsetY(input.faceEyeOffsetY) ??
      DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    eyeRotationDeg:
      normalizeBotFaceEyeRotationDeg(input.faceEyeRotationDeg) ??
      DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
    mouthScale:
      normalizeBotFaceMouthScale(input.faceMouthScale) ??
      DEFAULT_BOT_FACE_MOUTH_SCALE,
    mouthOffsetX:
      mouthCharacter !== null
        ? normalizeBotFaceMouthOffsetX(input.faceMouthOffsetX) ??
          DEFAULT_BOT_FACE_MOUTH_OFFSET_X
        : DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
    mouthOffsetY:
      normalizeBotFaceMouthOffsetY(input.faceMouthOffsetY) ??
      DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
    mouthRotationDeg:
      normalizeBotFaceMouthRotationDeg(input.faceMouthRotationDeg) ??
      DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
    blinkBar:
      normalizeBotFaceBlinkBar(input.faceBlinkBar) ??
      DEFAULT_BOT_FACE_BLINK_BAR,
    blinkScale:
      normalizeBotFaceBlinkScale(input.faceBlinkScale) ??
      DEFAULT_BOT_FACE_BLINK_SCALE,
    blinkOffsetX:
      normalizeBotFaceBlinkOffsetX(input.faceBlinkOffsetX) ??
      DEFAULT_BOT_FACE_BLINK_OFFSET_X,
    blinkOffsetY:
      normalizeBotFaceBlinkOffsetY(input.faceBlinkOffsetY) ??
      DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
    thinkingFrames:
      normalizeBotFaceThinkingFrames(input.faceThinkingFrames) ??
      DEFAULT_BOT_FACE_THINKING_FRAMES,
  };
}

function randomSteppedBotFaceScale(
  random: () => number,
  min: number,
  max: number,
  step: number
): number {
  const steps = Math.round((max - min) / step);
  const centeredRoll = (random() + random()) / 2;
  return Number((min + Math.round(centeredRoll * steps) * step).toFixed(3));
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
    eyeCount: DEFAULT_BOT_FACE_EYE_COUNT,
    eyeAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    mouthFont: pickFont(),
    mouthCharacter: DEFAULT_BOT_FACE_MOUTH_CHARACTER,
    mouthAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
    mouthCoffeePucker: DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
    weight,
    eyeScale: randomSteppedBotFaceScale(
      random,
      BOT_FACE_EYE_SCALE_MIN,
      BOT_FACE_EYE_SCALE_MAX,
      BOT_FACE_EYE_SCALE_STEP
    ),
    eyeOffsetX: DEFAULT_BOT_FACE_EYE_OFFSET_X,
    eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    eyeRotationDeg: DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
    mouthScale: randomSteppedBotFaceScale(
      random,
      BOT_FACE_MOUTH_SCALE_MIN,
      BOT_FACE_MOUTH_SCALE_MAX,
      BOT_FACE_MOUTH_SCALE_STEP
    ),
    mouthOffsetX: DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
    mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
    mouthRotationDeg: DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
    blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
    blinkScale: DEFAULT_BOT_FACE_BLINK_SCALE,
    blinkOffsetX: DEFAULT_BOT_FACE_BLINK_OFFSET_X,
    blinkOffsetY: DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
    thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
  };
}
