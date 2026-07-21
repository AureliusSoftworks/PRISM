import {
  BOT_AVATAR_DETAILS_CANVAS_SIZE,
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
  BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_VERSION,
  BOT_AVATAR_DETAIL_OFFSET_MAX,
  BOT_AVATAR_DETAIL_OFFSET_MIN,
  BOT_AVATAR_DETAIL_SCALE_MAX,
  BOT_AVATAR_DETAIL_SCALE_MIN,
  BOT_AVATAR_DETAIL_STAMP_CATALOG,
  encodeBotAvatarDetailsPaintColorMap,
  isBotAvatarDetailStampTransformInsideCanvas,
  isBotAvatarDetailsWritablePixel,
  type BotAvatarDetailStampCategory,
  type BotAvatarDetailStampId,
  type BotAvatarDetailStampV1,
  type BotAvatarDetailsV1,
} from "./botAvatarDetails.ts";
import {
  resolveBotFaceStyle,
  type BotFaceStyle,
} from "./botAvatar.ts";
import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotNamePronunciation,
  normalizeBotSelfReferral,
  type BotAudioVoiceProfileV2,
} from "./audioVoice.ts";
import {
  parseStoredBotPrompt,
  serializeStoredBotPrompt,
  type BotProfileFields,
} from "./botProfile.ts";

export const BOT_GENERATION_DRAFT_VERSION = 1 as const;
export const BOT_GENERATION_PROMPT_MAX_LENGTH = 2_000;
export const BOT_GENERATION_VOICE_PREVIEW_MAX_LENGTH = 240;

/** A compact, stable subset of the bot icon library that models can choose reliably. */
export const BOT_GENERATION_GLYPH_IDS = [
  "bot",
  "sparkles",
  "brain",
  "heart",
  "flame",
  "ghost",
  "star",
  "rocket",
  "wand",
  "puzzle",
  "infinity",
  "spiral",
  "eye",
  "terminal",
  "book",
  "feather",
  "compass",
  "shield",
  "music",
  "lightbulb",
  "key",
  "clock",
  "beaker",
  "telescope",
  "cpu",
  "database",
  "globe",
  "satellite",
  "camera",
  "leaf",
  "tree",
  "mountain",
  "sun",
  "moon",
  "snowflake",
  "wave",
  "flower",
  "cat",
  "dog",
  "bird",
  "owl",
  "fox",
  "dragon",
  "planet",
  "smile",
  "coffee",
  "crown",
  "gamepad",
  "diamond",
  "origami",
  "hourglass",
] as const;

export type BotGenerationGlyphId = (typeof BOT_GENERATION_GLYPH_IDS)[number];
export type BotGeneratedInkRole = "blink" | "talking" | "effect";
export type BotGeneratedInkShape = "line" | "circle";

export interface BotGeneratedInkStrokeV1 {
  role: BotGeneratedInkRole;
  shape: BotGeneratedInkShape;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
}

export interface BotGeneratedAvatarDetailsInputV1 {
  stamps: BotAvatarDetailStampV1[];
  ink: BotGeneratedInkStrokeV1[];
}

export interface BotGeneratedSettingsV1 {
  flirtEnabled: boolean;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  repetitionPenalty: number;
}

export interface BotGeneratedDraftV1 {
  v: typeof BOT_GENERATION_DRAFT_VERSION;
  name: string;
  namePronunciation: string;
  selfReferral: string;
  profile: BotProfileFields;
  color: string;
  glyph: BotGenerationGlyphId;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  audioVoiceProfile: BotAudioVoiceProfileV2;
  voicePreviewLine: string;
  settings: BotGeneratedSettingsV1;
}

export interface NormalizeBotGeneratedDraftOptions {
  availableElevenLabsVoiceIds?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return isRecord(record[key]) ? record[key] as Record<string, unknown> : {};
}

function compactText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function clampedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampedNumber(value, fallback, min, max));
}

function normalizeGeneratedHexColor(value: unknown): string {
  const normalized = compactText(value, 24).toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/u.test(normalized)) {
    return `#${normalized.slice(1).split("").map((part) => `${part}${part}`).join("")}`;
  }
  return "#5ad6ff";
}

function normalizeGeneratedGlyph(value: unknown): BotGenerationGlyphId {
  return typeof value === "string" &&
    (BOT_GENERATION_GLYPH_IDS as readonly string[]).includes(value)
    ? value as BotGenerationGlyphId
    : "sparkles";
}

function normalizeGeneratedProfile(value: unknown, botName: string): BotProfileFields {
  const candidate = isRecord(value) ? value : {};
  // The profile serializer owns the canonical field parsing and bounds custom facts.
  return parseStoredBotPrompt(
    serializeStoredBotPrompt(candidate as unknown as BotProfileFields, botName),
  ).fields;
}

function normalizeGeneratedStamps(value: unknown): BotAvatarDetailStampV1[] {
  if (!Array.isArray(value)) return [];
  const catalog = new Map(
    BOT_AVATAR_DETAIL_STAMP_CATALOG.map((stamp) => [stamp.id, stamp]),
  );
  const categoryCounts: Record<BotAvatarDetailStampCategory, number> = {
    eyewear: 0,
    "facial-hair": 0,
    marking: 0,
  };
  const stamps: BotAvatarDetailStampV1[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.id !== "string") continue;
    const definition = catalog.get(candidate.id as BotAvatarDetailStampId);
    if (!definition) continue;
    const categoryLimit = definition.category === "marking" ? 2 : 1;
    if (categoryCounts[definition.category] >= categoryLimit) continue;
    const stamp: BotAvatarDetailStampV1 = {
      id: definition.id as BotAvatarDetailStampId,
      offsetX: clampedInteger(
        candidate.offsetX,
        0,
        BOT_AVATAR_DETAIL_OFFSET_MIN,
        BOT_AVATAR_DETAIL_OFFSET_MAX,
      ),
      offsetY: clampedInteger(
        candidate.offsetY,
        0,
        BOT_AVATAR_DETAIL_OFFSET_MIN,
        BOT_AVATAR_DETAIL_OFFSET_MAX,
      ),
      scalePct: clampedInteger(
        candidate.scalePct,
        100,
        BOT_AVATAR_DETAIL_SCALE_MIN,
        BOT_AVATAR_DETAIL_SCALE_MAX,
      ),
    };
    if (!isBotAvatarDetailStampTransformInsideCanvas(definition, stamp)) continue;
    categoryCounts[definition.category] += 1;
    stamps.push(stamp);
    if (stamps.length >= 4) break;
  }
  return stamps;
}

function normalizeInkStroke(value: unknown): BotGeneratedInkStrokeV1 | null {
  if (!isRecord(value)) return null;
  const role = value.role === "blink" || value.role === "talking" || value.role === "effect"
    ? value.role
    : null;
  const shape = value.shape === "line" || value.shape === "circle"
    ? value.shape
    : null;
  if (!role || !shape) return null;
  const max = BOT_AVATAR_DETAILS_CANVAS_SIZE - 1;
  return {
    role,
    shape,
    x1: clampedInteger(value.x1, 64, 0, max),
    y1: clampedInteger(value.y1, 64, 0, max),
    x2: clampedInteger(value.x2, 64, 0, max),
    y2: clampedInteger(value.y2, 64, 0, max),
    size: clampedInteger(value.size, 1, 1, 3),
  };
}

function setInkPixel(
  bytes: Uint8Array,
  x: number,
  y: number,
  code: 1 | 2 | 3,
  state: { painted: number },
): void {
  if (
    state.painted >= BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS ||
    !isBotAvatarDetailsWritablePixel(x, y)
  ) return;
  const pixelIndex = y * BOT_AVATAR_DETAILS_CANVAS_SIZE + x;
  const byteIndex = pixelIndex >>> 2;
  const shift = 6 - (pixelIndex & 3) * 2;
  const current = (bytes[byteIndex] ?? 0) >>> shift & 0x03;
  if (current === 0) state.painted += 1;
  const cleared = (bytes[byteIndex] ?? 0) & ~(0x03 << shift);
  bytes[byteIndex] = cleared | code << shift;
}

function paintInkBrush(
  bytes: Uint8Array,
  x: number,
  y: number,
  size: number,
  code: 1 | 2 | 3,
  state: { painted: number },
): void {
  const radius = Math.max(0, size - 1);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius + 0.5) continue;
      setInkPixel(bytes, x + dx, y + dy, code, state);
    }
  }
}

function paintGeneratedInkStroke(
  bytes: Uint8Array,
  stroke: BotGeneratedInkStrokeV1,
  state: { painted: number },
): void {
  const code: 1 | 2 | 3 = stroke.role === "blink" ? 1 : stroke.role === "talking" ? 2 : 3;
  if (stroke.shape === "circle") {
    const radius = Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1);
    const samples = Math.max(24, Math.ceil(radius * Math.PI * 2));
    for (let sample = 0; sample < samples; sample += 1) {
      const angle = sample / samples * Math.PI * 2;
      paintInkBrush(
        bytes,
        Math.round(stroke.x1 + Math.cos(angle) * radius),
        Math.round(stroke.y1 + Math.sin(angle) * radius),
        stroke.size,
        code,
        state,
      );
    }
    return;
  }
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1)),
  );
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    paintInkBrush(
      bytes,
      Math.round(stroke.x1 + (stroke.x2 - stroke.x1) * progress),
      Math.round(stroke.y1 + (stroke.y2 - stroke.y1) * progress),
      stroke.size,
      code,
      state,
    );
  }
}

function normalizeGeneratedAvatarDetails(value: unknown): BotAvatarDetailsV1 | null {
  const record = isRecord(value) ? value : {};
  const stamps = normalizeGeneratedStamps(record.stamps);
  const strokes = Array.isArray(record.ink)
    ? record.ink.map(normalizeInkStroke).filter((stroke): stroke is BotGeneratedInkStrokeV1 => stroke !== null).slice(0, 8)
    : [];
  const colorMap = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BYTE_LENGTH);
  const paintState = { painted: 0 };
  for (const stroke of strokes) {
    paintGeneratedInkStroke(colorMap, stroke, paintState);
  }
  if (stamps.length === 0 && paintState.painted === 0) return null;
  return {
    version: BOT_AVATAR_DETAILS_VERSION,
    screen: {
      stamps,
      paintMaskBase64: null,
      ...(paintState.painted > 0
        ? { paintColorMapBase64: encodeBotAvatarDetailsPaintColorMap(colorMap) }
        : {}),
    },
  };
}

function normalizeGeneratedVoice(
  value: unknown,
  availableElevenLabsVoiceIds: readonly string[],
): BotAudioVoiceProfileV2 {
  const record = isRecord(value) ? value : {};
  const available = new Set(
    availableElevenLabsVoiceIds.map((voiceId) => voiceId.trim()).filter(Boolean),
  );
  const requestedVoiceId = compactText(record.elevenLabsVoiceId, 240);
  const elevenLabsVoiceId = available.has(requestedVoiceId) ? requestedVoiceId : null;
  const normalized = normalizeBotAudioVoiceProfileV1({
    ...record,
    v: 2,
    enabled: true,
    systemVoiceName: null,
    elevenLabsVoiceId,
    elevenLabsVoiceIdOverride: null,
    elevenLabsVoiceInitialized: available.size > 0,
    voiceEffectExplicit: true,
    avatarSfx: null,
  });
  const {
    systemVoiceName: _systemVoiceName,
    elevenLabsVoiceIdOverride: _elevenLabsVoiceIdOverride,
    avatarSfx: _avatarSfx,
    ...portable
  } = normalized;
  return portable;
}

function normalizeGeneratedSettings(value: unknown): BotGeneratedSettingsV1 {
  const record = isRecord(value) ? value : {};
  return {
    flirtEnabled: record.flirtEnabled === true,
    temperature: Number(clampedNumber(record.temperature, 0.75, 0, 2).toFixed(2)),
    maxTokens: clampedInteger(record.maxTokens, 2_048, 256, 8_192),
    topP: Number(clampedNumber(record.topP, 0.95, 0, 1).toFixed(2)),
    topK: clampedInteger(record.topK, 40, 0, 200),
    repetitionPenalty: Number(
      clampedNumber(record.repetitionPenalty, 1.05, 0.5, 2).toFixed(2),
    ),
  };
}

export function normalizeBotGenerationPrompt(value: unknown): string {
  return compactText(value, BOT_GENERATION_PROMPT_MAX_LENGTH);
}

/**
 * Treat model output as an untrusted suggestion. Every field is parsed through
 * the same canonical normalizers used by Avatar Studio and persistence.
 */
export function normalizeBotGeneratedDraftV1(
  value: unknown,
  options: NormalizeBotGeneratedDraftOptions = {},
): BotGeneratedDraftV1 | null {
  if (!isRecord(value)) return null;
  const name = compactText(value.name, 80) || "New bot";
  const profile = normalizeGeneratedProfile(value.profile, name);
  const face = resolveBotFaceStyle(
    recordAt(value, "face"),
    profile.core.communicationStyle,
  );
  const voicePreviewLine = compactText(
    value.voicePreviewLine,
    BOT_GENERATION_VOICE_PREVIEW_MAX_LENGTH,
  ) || `Hello. I'm ${name}.`;
  return {
    v: BOT_GENERATION_DRAFT_VERSION,
    name,
    namePronunciation: normalizeBotNamePronunciation(value.namePronunciation),
    selfReferral: normalizeBotSelfReferral(value.selfReferral),
    profile,
    color: normalizeGeneratedHexColor(value.color),
    glyph: normalizeGeneratedGlyph(value.glyph),
    face,
    avatarDetails: normalizeGeneratedAvatarDetails(value.avatarDetails),
    audioVoiceProfile: normalizeGeneratedVoice(
      value.voice,
      options.availableElevenLabsVoiceIds ?? [],
    ),
    voicePreviewLine,
    settings: normalizeGeneratedSettings(value.settings),
  };
}
