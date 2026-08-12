import {
  BOT_AVATAR_DETAILS_CANVAS_SIZE,
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
  BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_SPEECH_INK_ANIMATIONS,
  BOT_AVATAR_DETAILS_VERSION,
  encodeBotAvatarDetailsPaintColorMap,
  isBotAvatarDetailsWritablePixel,
  type BotAvatarDetailsSpeechInkAnimation,
  type BotAvatarDetailsV1,
} from "./botAvatarDetails.ts";
import {
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_EYE_OFFSET_X,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_SCALE,
  resolveBotFaceStyle,
  type BotFaceStyle,
} from "./botAvatar.ts";
import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV2,
} from "./audioVoice.ts";
import { inferCorporalityFromPersona } from "./corporalityFoley.ts";
import {
  hexToHsl,
  hslToHex,
  normalizeBotIdentityColor,
} from "./color.ts";
import {
  BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH,
  parseStoredBotPrompt,
  serializeStoredBotPrompt,
  type BotProfileFields,
} from "./botProfile.ts";
import {
  BOT_POWER_INTENT_MAX_LENGTH,
  botPowerSourceHashForPowerV1,
  type BotPowerV1,
} from "./botPower.ts";

export const BOT_GENERATION_DRAFT_VERSION = 1 as const;
export const BOT_GENERATION_PROMPT_MAX_LENGTH = 2_000;
export const BOT_GENERATION_VOICE_PREVIEW_MAX_LENGTH = 240;
/** Generated ink is an accent layer, not a fully painted portrait. */
export const BOT_GENERATED_AVATAR_INK_MAX_PATHS = 8;
export const BOT_GENERATED_AVATAR_INK_MAX_PAINTED_PIXELS = 900;
const BOT_GENERATED_INK_MAX_LINE_LENGTH = 32;
const BOT_GENERATED_INK_MAX_CIRCLE_RADIUS = 16;
const BOT_GENERATED_INK_MAX_PATH_POINTS = 18;
const BOT_GENERATED_INK_MAX_PATH_SEGMENT_LENGTH = 96;
const BOT_GENERATED_PORTRAIT_EYE_WINDOW = {
  minX: 42,
  maxX: 86,
  minY: 50,
  maxY: 70,
} as const;
const BOT_GENERATED_PORTRAIT_MOUTH_WINDOW = {
  minX: 49,
  maxX: 85,
  minY: 81,
  maxY: 98,
} as const;

/**
 * A shared semantic subset of the bot icon library. Keep these concrete nouns
 * broad enough for persona signatures while avoiding hundreds of near-synonyms
 * that make structured generation less reliable.
 */
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
  "target",
  "radar",
  "atom",
  "dna",
  "yinYang",
  "pulse",
  "eye",
  "peace",
  "terminal",
  "book",
  "feather",
  "compass",
  "shield",
  "music",
  "lightbulb",
  "lens",
  "key",
  "lock",
  "clock",
  "scissors",
  "magnet",
  "umbrella",
  "gift",
  "pencil",
  "scroll",
  "hammer",
  "beaker",
  "telescope",
  "cpu",
  "database",
  "globe",
  "wifi",
  "satellite",
  "antenna",
  "camera",
  "headphones",
  "battery",
  "bolt",
  "signal",
  "broadcast",
  "leaf",
  "tree",
  "mountain",
  "sun",
  "moon",
  "cloud",
  "snowflake",
  "droplet",
  "wave",
  "flower",
  "seedling",
  "cactus",
  "rainbow",
  "tornado",
  "cat",
  "dog",
  "fish",
  "bird",
  "butterfly",
  "rabbit",
  "owl",
  "turtle",
  "spider",
  "paw",
  "snake",
  "whale",
  "octopus",
  "bee",
  "frog",
  "fox",
  "bear",
  "penguin",
  "dragon",
  "unicorn",
  "planet",
  "comet",
  "constellation",
  "galaxy",
  "smile",
  "skull",
  "hand",
  "cherry",
  "mushroom",
  "apple",
  "coffee",
  "cake",
  "strawberry",
  "pizza",
  "car",
  "airplane",
  "balloon",
  "anchor",
  "dice",
  "flag",
  "crown",
  "medal",
  "trophy",
  "gamepad",
  "bike",
  "boat",
  "train",
  "kite",
  "hexagon",
  "diamond",
  "origami",
  "circle",
  "square",
  "pentagon",
  "checkmark",
  "guitar",
  "piano",
  "drum",
  "candle",
  "ring",
  "bell",
  "pi",
  "sigma",
  "hashtag",
  "at",
  "hourglass",
  "calendar",
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

export interface BotGeneratedInkPointV1 {
  x: number;
  y: number;
}

/**
 * Safe model-authored portrait geometry. Paths are rasterized into the same
 * bounded semantic ink map as hand-drawn Avatar Details; raw SVG/image data
 * never enters the archive contract.
 */
export interface BotGeneratedInkPathV1 {
  role: BotGeneratedInkRole;
  points: BotGeneratedInkPointV1[];
  closed: boolean;
  fill: boolean;
  size: number;
}

export type BotGeneratedInkPrimitiveV1 =
  | BotGeneratedInkStrokeV1
  | BotGeneratedInkPathV1;

export interface BotGeneratedAvatarDetailsInputV1 {
  ink: BotGeneratedInkPrimitiveV1[];
  speechInkAnimation?: BotAvatarDetailsSpeechInkAnimation;
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
  accentColor: string | null;
  glyph: BotGenerationGlyphId;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  /** Portable sound-design direction; audio is created only by the guarded online workflow. */
  avatarSfxPrompt: string;
  audioVoiceProfile: BotAudioVoiceProfileV2;
  voicePreviewLine: string;
  /** Zero or one compiler-ready prompt-authored Power from the master brief. */
  powers: BotPowerV1[];
  settings: BotGeneratedSettingsV1;
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

function normalizeGeneratedBotHueColor(value: unknown): string {
  const normalized = compactText(value, 24).toLowerCase();
  const expanded = /^#[0-9a-f]{6}$/u.test(normalized)
    ? normalized
    : /^#[0-9a-f]{3}$/u.test(normalized)
      ? `#${normalized.slice(1).split("").map((part) => `${part}${part}`).join("")}`
      : "#5ad6ff";
  const { h } = hexToHsl(expanded);
  // Generated colors obey the same one-axis contract as Avatar Studio's
  // hue-only picker: hue varies, saturation and lightness do not.
  return hslToHex(h, 100, 50).toLowerCase();
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
  const profile = parseStoredBotPrompt(
    serializeStoredBotPrompt(candidate as unknown as BotProfileFields, botName),
  ).fields;
  profile.purpose.statement = fitGeneratedPurpose(profile.purpose.statement);
  return profile;
}

/** Keep an overlong model result readable instead of silently cutting a thought. */
function fitGeneratedPurpose(value: string): string {
  const compact = compactText(value, 500);
  if (compact.length <= BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH) return compact;
  const withinLimit = compact.slice(0, BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH);
  const terminal = [...withinLimit.matchAll(/[.!?](?=\s|$)/gu)].at(-1)?.index;
  if (terminal !== undefined && terminal >= 24) {
    return withinLimit.slice(0, terminal + 1).trim();
  }
  const wordBoundary = withinLimit.lastIndexOf(
    " ",
    BOT_PROFILE_PURPOSE_STATEMENT_MAX_LENGTH - 2,
  );
  return `${withinLimit.slice(0, Math.max(1, wordBoundary)).trim()}…`;
}

function generatedFaceIntent(value: unknown): {
  customEyes: boolean;
  customMouth: boolean;
  customBlink: boolean;
  eyeGeometryException: boolean;
  mouthGeometryException: boolean;
  blinkGeometryException: boolean;
} {
  const face = isRecord(value) ? value : {};
  const customEyes = face.intentionalCustomEyes === true;
  const customMouth = face.intentionalCustomMouth === true;
  const customBlink = face.intentionalCustomBlink === true;
  const legacyGeometryException = face.intentionalGeometryException === true;
  return {
    customEyes,
    customMouth,
    customBlink,
    eyeGeometryException:
      customEyes &&
      (face.intentionalEyeGeometryException === true || legacyGeometryException),
    mouthGeometryException:
      customMouth &&
      (face.intentionalMouthGeometryException === true || legacyGeometryException),
    blinkGeometryException:
      customBlink &&
      (face.intentionalBlinkGeometryException === true || legacyGeometryException),
  };
}

function normalizeGeneratedInkRole(value: unknown): BotGeneratedInkRole | null {
  return value === "blink" || value === "talking" || value === "effect"
    ? value
    : null;
}

function normalizeInkStroke(value: unknown): BotGeneratedInkStrokeV1 | null {
  if (!isRecord(value)) return null;
  const role = normalizeGeneratedInkRole(value.role);
  const shape = value.shape === "line" || value.shape === "circle"
    ? value.shape
    : null;
  if (!role || !shape) return null;
  const max = BOT_AVATAR_DETAILS_CANVAS_SIZE - 1;
  const stroke: BotGeneratedInkStrokeV1 = {
    role,
    shape,
    x1: clampedInteger(value.x1, 64, 0, max),
    y1: clampedInteger(value.y1, 64, 0, max),
    x2: clampedInteger(value.x2, 64, 0, max),
    y2: clampedInteger(value.y2, 64, 0, max),
    size: clampedInteger(value.size, 1, 1, 3),
  };
  const extent = Math.hypot(stroke.x2 - stroke.x1, stroke.y2 - stroke.y1);
  if (
    extent > (shape === "circle"
      ? BOT_GENERATED_INK_MAX_CIRCLE_RADIUS
      : BOT_GENERATED_INK_MAX_LINE_LENGTH)
  ) {
    return null;
  }
  return stroke;
}

function normalizeInkPoint(value: unknown): BotGeneratedInkPointV1 | null {
  if (!isRecord(value)) return null;
  const max = BOT_AVATAR_DETAILS_CANVAS_SIZE - 1;
  return {
    x: clampedInteger(value.x, 64, 0, max),
    y: clampedInteger(value.y, 64, 0, max),
  };
}

function normalizeInkPath(value: unknown): BotGeneratedInkPathV1 | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const role = normalizeGeneratedInkRole(value.role);
  if (!role) return null;
  const points = value.points
    .map(normalizeInkPoint)
    .filter((point): point is BotGeneratedInkPointV1 => point !== null)
    .filter((point, index, all) =>
      index === 0 || point.x !== all[index - 1]?.x || point.y !== all[index - 1]?.y
    )
    .slice(0, BOT_GENERATED_INK_MAX_PATH_POINTS);
  if (points.length < 2) return null;
  const closed = value.closed === true;
  if (closed && points.length < 3) return null;
  const segmentPairs = points.slice(1).map((point, index) => [points[index], point] as const);
  if (closed) segmentPairs.push([points[points.length - 1], points[0]] as const);
  if (segmentPairs.some(([from, to]) =>
    !from || !to || Math.hypot(to.x - from.x, to.y - from.y) > BOT_GENERATED_INK_MAX_PATH_SEGMENT_LENGTH
  )) {
    return null;
  }
  return {
    role,
    points,
    closed,
    fill: closed && value.fill === true,
    size: clampedInteger(value.size, 1, 1, 4),
  };
}

function generatedPortraitPixelIsReserved(
  x: number,
  y: number,
  code: 1 | 2 | 3,
): boolean {
  const inside = (window: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }): boolean =>
    x >= window.minX && x <= window.maxX &&
    y >= window.minY && y <= window.maxY;
  const insideEyes = inside(BOT_GENERATED_PORTRAIT_EYE_WINDOW);
  const insideMouth = inside(BOT_GENERATED_PORTRAIT_MOUTH_WINDOW);
  if (code === 1) return insideMouth;
  if (code === 2) return insideEyes;
  return insideEyes || insideMouth;
}

function setInkPixel(
  bytes: Uint8Array,
  x: number,
  y: number,
  code: 1 | 2 | 3,
  state: { painted: number },
): void {
  if (
    state.painted >= Math.min(
      BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
      BOT_GENERATED_AVATAR_INK_MAX_PAINTED_PIXELS,
    ) ||
    generatedPortraitPixelIsReserved(x, y, code) ||
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

function paintInkSegment(
  bytes: Uint8Array,
  from: BotGeneratedInkPointV1,
  to: BotGeneratedInkPointV1,
  size: number,
  code: 1 | 2 | 3,
  state: { painted: number },
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y)));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    paintInkBrush(
      bytes,
      Math.round(from.x + (to.x - from.x) * progress),
      Math.round(from.y + (to.y - from.y) * progress),
      size,
      code,
      state,
    );
  }
}

function pointInsidePolygon(
  x: number,
  y: number,
  points: readonly BotGeneratedInkPointV1[],
): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    if (!currentPoint || !previousPoint) continue;
    const crosses = (currentPoint.y > y) !== (previousPoint.y > y) &&
      x < (previousPoint.x - currentPoint.x) * (y - currentPoint.y) /
        (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function paintGeneratedInkPath(
  bytes: Uint8Array,
  path: BotGeneratedInkPathV1,
  state: { painted: number },
): void {
  const code: 1 | 2 | 3 = path.role === "blink" ? 1 : path.role === "talking" ? 2 : 3;
  if (path.fill) {
    const minX = Math.floor(Math.min(...path.points.map((point) => point.x)));
    const maxX = Math.ceil(Math.max(...path.points.map((point) => point.x)));
    const minY = Math.floor(Math.min(...path.points.map((point) => point.y)));
    const maxY = Math.ceil(Math.max(...path.points.map((point) => point.y)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (pointInsidePolygon(x + 0.5, y + 0.5, path.points)) {
          setInkPixel(bytes, x, y, code, state);
        }
      }
    }
  }
  for (let index = 1; index < path.points.length; index += 1) {
    const from = path.points[index - 1];
    const to = path.points[index];
    if (from && to) paintInkSegment(bytes, from, to, path.size, code, state);
  }
  if (path.closed) {
    const from = path.points[path.points.length - 1];
    const to = path.points[0];
    if (from && to) paintInkSegment(bytes, from, to, path.size, code, state);
  }
}

function normalizeGeneratedAvatarDetails(value: unknown): BotAvatarDetailsV1 | null {
  const record = isRecord(value) ? value : {};
  const primitives = Array.isArray(record.ink)
    ? record.ink
        .map((candidate): BotGeneratedInkPrimitiveV1 | null =>
          normalizeInkPath(candidate) ?? normalizeInkStroke(candidate)
        )
        .filter((primitive): primitive is BotGeneratedInkPrimitiveV1 => primitive !== null)
        .slice(0, BOT_GENERATED_AVATAR_INK_MAX_PATHS)
    : [];
  const colorMap = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_COLOR_MAP_BYTE_LENGTH);
  const paintState = { painted: 0 };
  for (const primitive of primitives) {
    if ("points" in primitive) {
      paintGeneratedInkPath(colorMap, primitive, paintState);
    } else {
      paintGeneratedInkStroke(colorMap, primitive, paintState);
    }
  }
  if (paintState.painted === 0) return null;
  const hasSpeechInk = primitives.some((primitive) => primitive.role === "talking");
  const speechInkAnimation =
    hasSpeechInk &&
    typeof record.speechInkAnimation === "string" &&
    BOT_AVATAR_DETAILS_SPEECH_INK_ANIMATIONS.includes(
      record.speechInkAnimation as BotAvatarDetailsSpeechInkAnimation,
    )
      ? record.speechInkAnimation as BotAvatarDetailsSpeechInkAnimation
      : null;
  return {
    version: BOT_AVATAR_DETAILS_VERSION,
    screen: {
      stamps: [],
      paintMaskBase64: null,
      ...(paintState.painted > 0
        ? { paintColorMapBase64: encodeBotAvatarDetailsPaintColorMap(colorMap) }
        : {}),
      ...(speechInkAnimation && speechInkAnimation !== "none"
        ? { speechInkAnimation }
        : {}),
    },
  };
}

function normalizeGeneratedVoice(
  value: unknown,
  personaText = "",
  avatarSfxPrompt = "",
): BotAudioVoiceProfileV2 {
  const record = isRecord(value) ? value : {};
  const corporality =
    typeof record.corporality === "number" && Number.isFinite(record.corporality)
      ? record.corporality
      : inferCorporalityFromPersona(personaText);
  const normalized = normalizeBotAudioVoiceProfileV1({
    ...record,
    v: 2,
    enabled: true,
    systemVoiceName: null,
    elevenLabsVoiceId: null,
    elevenLabsVoiceIdOverride: null,
    // A generated bot intentionally starts local-only. Mark the premium lane
    // initialized so account default assignment cannot silently relink it.
    elevenLabsVoiceInitialized: true,
    voiceEffectExplicit: true,
    corporality,
    avatarSfx: null,
    avatarSfxPrompt,
  });
  const {
    systemVoiceName: _systemVoiceName,
    elevenLabsVoiceId: _elevenLabsVoiceId,
    elevenLabsVoiceIdOverride: _elevenLabsVoiceIdOverride,
    avatarSfx: _avatarSfx,
    avatarSfxMuted: _avatarSfxMuted,
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
): BotGeneratedDraftV1 | null {
  if (!isRecord(value)) return null;
  const name = compactText(value.name, 80) || "New bot";
  const profile = normalizeGeneratedProfile(value.profile, name);
  const faceInput = recordAt(value, "face");
  const faceIntent = generatedFaceIntent(faceInput);
  const resolvedFace = resolveBotFaceStyle(
    faceInput,
    profile.core.communicationStyle,
  );
  const avatarDetails = normalizeGeneratedAvatarDetails(value.avatarDetails);
  const face: BotFaceStyle = {
    ...resolvedFace,
    eyeCharacter: faceIntent.customEyes ? resolvedFace.eyeCharacter : null,
    eyeCount: faceIntent.customEyes ? resolvedFace.eyeCount : 1,
    mouthCharacter: faceIntent.customMouth ? resolvedFace.mouthCharacter : null,
    blinkBar: faceIntent.customBlink
      ? resolvedFace.blinkBar
      : DEFAULT_BOT_FACE_BLINK_BAR,
    eyeScale: faceIntent.eyeGeometryException ? resolvedFace.eyeScale : 1,
    eyeOffsetX: faceIntent.eyeGeometryException
      ? resolvedFace.eyeOffsetX
      : DEFAULT_BOT_FACE_EYE_OFFSET_X,
    eyeOffsetY: faceIntent.eyeGeometryException
      ? resolvedFace.eyeOffsetY
      : DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    eyeRotationDeg: faceIntent.eyeGeometryException
      ? resolvedFace.eyeRotationDeg
      : 0,
    mouthScale: faceIntent.mouthGeometryException
      ? resolvedFace.mouthScale
      : DEFAULT_BOT_FACE_MOUTH_SCALE,
    mouthOffsetX: faceIntent.mouthGeometryException
      ? resolvedFace.mouthOffsetX
      : DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
    mouthOffsetY: faceIntent.mouthGeometryException
      ? resolvedFace.mouthOffsetY
      : DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
    mouthRotationDeg: faceIntent.mouthGeometryException
      ? resolvedFace.mouthRotationDeg
      : 0,
    blinkScale: faceIntent.blinkGeometryException ? resolvedFace.blinkScale : 1,
    blinkOffsetX: faceIntent.blinkGeometryException
      ? resolvedFace.blinkOffsetX
      : DEFAULT_BOT_FACE_EYE_OFFSET_X,
    blinkOffsetY: faceIntent.blinkGeometryException
      ? resolvedFace.blinkOffsetY
      : DEFAULT_BOT_FACE_EYE_OFFSET_Y,
    blinkRotationDeg: faceIntent.blinkGeometryException
      ? resolvedFace.blinkRotationDeg
      : 0,
  };
  const voicePreviewLine = compactText(
    value.voicePreviewLine,
    BOT_GENERATION_VOICE_PREVIEW_MAX_LENGTH,
  ) || `Hello. I'm ${name}.`;
  const avatarSfxPrompt = compactText(value.avatarSfxPrompt, 400);
  const powerPrompt = compactText(value.powerPrompt, BOT_POWER_INTENT_MAX_LENGTH);
  const generatedPower: BotPowerV1 | null = powerPrompt
    ? {
        version: 1,
        id: `generated-${botPowerSourceHashForPowerV1({
          authoringMode: "prompt",
          name: "",
          intent: powerPrompt,
        }).replace(/[^a-z0-9-]+/giu, "-")}`,
        authoringMode: "prompt",
        name: "",
        intent: powerPrompt,
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      }
    : null;
  const personaSeedText = [
    name,
    voicePreviewLine,
    powerPrompt,
    profile.purpose.statement,
    profile.purpose.legacyNotes,
    profile.core.traits,
    profile.core.interests,
    profile.core.quirks,
    profile.identity.species,
    profile.appearance.description,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  return {
    v: BOT_GENERATION_DRAFT_VERSION,
    name,
    // Keep schema fields for archive compatibility, but never auto-fill them.
    namePronunciation: "",
    selfReferral: "",
    profile,
    color: normalizeGeneratedBotHueColor(value.color),
    accentColor: normalizeBotIdentityColor(value.accentColor),
    glyph: normalizeGeneratedGlyph(value.glyph),
    face,
    avatarDetails,
    avatarSfxPrompt,
    audioVoiceProfile: normalizeGeneratedVoice(
      value.voice,
      personaSeedText,
      avatarSfxPrompt,
    ),
    voicePreviewLine,
    powers: generatedPower ? [generatedPower] : [],
    settings: normalizeGeneratedSettings(value.settings),
  };
}
