export const BOT_AVATAR_DETAILS_VERSION = 1 as const;
export const BOT_AVATAR_DETAILS_CANVAS_SIZE = 128;
export const BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH =
  (BOT_AVATAR_DETAILS_CANVAS_SIZE * BOT_AVATAR_DETAILS_CANVAS_SIZE) / 8;
export const BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH = 2732;
export const BOT_AVATAR_DETAILS_MAX_JSON_BYTES = 8 * 1024;
export const BOT_AVATAR_DETAIL_OFFSET_MIN = -16;
export const BOT_AVATAR_DETAIL_OFFSET_MAX = 16;
export const BOT_AVATAR_DETAIL_SCALE_MIN = 80;
export const BOT_AVATAR_DETAIL_SCALE_MAX = 120;

export const BOT_AVATAR_DETAIL_STAMP_CATEGORIES = [
  "eyewear",
  "facial-hair",
  "marking",
] as const;

export type BotAvatarDetailStampCategory =
  (typeof BOT_AVATAR_DETAIL_STAMP_CATEGORIES)[number];

export interface BotAvatarDetailStampDefinition {
  id: string;
  category: BotAvatarDetailStampCategory;
  centerX: number;
  centerY: number;
  baseWidth: number;
  baseHeight: number;
}

/**
 * Canonical 128-grid geometry shared by renderers and persistence validation.
 * The rectangles describe each monochrome stamp before its offset and scale
 * are applied; stamp pixels must remain within these bounds.
 */
export const BOT_AVATAR_DETAIL_STAMP_CATALOG = [
  {
    id: "round-glasses",
    category: "eyewear",
    centerX: 64,
    centerY: 48,
    baseWidth: 50,
    baseHeight: 24,
  },
  {
    id: "square-glasses",
    category: "eyewear",
    centerX: 64,
    centerY: 48,
    baseWidth: 52,
    baseHeight: 22,
  },
  {
    id: "visor",
    category: "eyewear",
    centerX: 64,
    centerY: 48,
    baseWidth: 58,
    baseHeight: 18,
  },
  {
    id: "monocle",
    category: "eyewear",
    centerX: 78,
    centerY: 49,
    baseWidth: 25,
    baseHeight: 28,
  },
  {
    id: "handlebar-mustache",
    category: "facial-hair",
    centerX: 64,
    centerY: 76,
    baseWidth: 42,
    baseHeight: 18,
  },
  {
    id: "straight-mustache",
    category: "facial-hair",
    centerX: 64,
    centerY: 74,
    baseWidth: 38,
    baseHeight: 12,
  },
  {
    id: "short-beard",
    category: "facial-hair",
    centerX: 64,
    centerY: 88,
    baseWidth: 44,
    baseHeight: 30,
  },
  {
    id: "goatee",
    category: "facial-hair",
    centerX: 64,
    centerY: 91,
    baseWidth: 20,
    baseHeight: 28,
  },
  {
    id: "freckles",
    category: "marking",
    centerX: 64,
    centerY: 64,
    baseWidth: 48,
    baseHeight: 12,
  },
  {
    id: "diagonal-scar",
    category: "marking",
    centerX: 82,
    centerY: 61,
    baseWidth: 20,
    baseHeight: 32,
  },
  {
    id: "cheek-stripes",
    category: "marking",
    centerX: 86,
    centerY: 68,
    baseWidth: 24,
    baseHeight: 20,
  },
  {
    id: "circuit-mark",
    category: "marking",
    centerX: 40,
    centerY: 66,
    baseWidth: 24,
    baseHeight: 30,
  },
] as const satisfies readonly BotAvatarDetailStampDefinition[];

export const BOT_AVATAR_DETAIL_STAMP_IDS =
  BOT_AVATAR_DETAIL_STAMP_CATALOG.map((stamp) => stamp.id);

export type BotAvatarDetailStampId =
  (typeof BOT_AVATAR_DETAIL_STAMP_CATALOG)[number]["id"];

export interface BotAvatarDetailStampV1 {
  id: BotAvatarDetailStampId;
  offsetX: number;
  offsetY: number;
  scalePct: number;
}

export interface BotAvatarDetailsV1 {
  version: typeof BOT_AVATAR_DETAILS_VERSION;
  screen: {
    stamps: BotAvatarDetailStampV1[];
    /**
     * 128x128 row-major 1-bit mask. Each byte stores eight horizontal pixels,
     * most-significant bit first, encoded as canonical standard padded Base64.
     */
    paintMaskBase64: string | null;
    /** Hide stamps and paint only while the avatar is blinking. */
    hideInkDuringBlink?: true;
  };
}

export interface BotAvatarDetailStampTransform {
  offsetX: number;
  offsetY: number;
  scalePct: number;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUE_BY_CHARACTER = new Map(
  Array.from(BASE64_ALPHABET, (character, value) => [character, value] as const)
);
const ROOT_KEYS = ["screen", "version"] as const;
const SCREEN_KEYS = ["paintMaskBase64", "stamps"] as const;
const SCREEN_KEYS_WITH_BLINK_INK = [
  "hideInkDuringBlink",
  "paintMaskBase64",
  "stamps",
] as const;
const STAMP_KEYS = ["id", "offsetX", "offsetY", "scalePct"] as const;
const UTF8_ENCODER = new TextEncoder();
const STAMP_DEFINITION_BY_ID = new Map(
  BOT_AVATAR_DETAIL_STAMP_CATALOG.map((definition) => [definition.id, definition])
);
const STAMP_ORDER_BY_ID = new Map(
  BOT_AVATAR_DETAIL_STAMP_CATALOG.map((definition, index) => [definition.id, index])
);

/**
 * Logical writable pixels sampled from the largest connected component of
 * bot-frame-screen-mask-glass.png?v=1000 at 128x128. The smaller lower glass
 * panel is intentionally excluded: V1 details belong on the face screen.
 */
const WRITABLE_SCREEN_RUNS = [
  [17, 57, 70], [18, 53, 75], [19, 50, 78], [20, 47, 80],
  [21, 45, 82], [22, 43, 84], [23, 41, 86], [24, 40, 88],
  [25, 38, 89], [26, 37, 90], [27, 36, 91], [28, 35, 93],
  [29, 34, 94], [30, 33, 95], [31, 32, 96], [32, 31, 96],
  [33, 30, 97], [34, 30, 98], [35, 29, 99], [36, 28, 99],
  [37, 28, 100], [38, 27, 100], [39, 26, 101], [40, 26, 102],
  [41, 25, 102], [42, 25, 102], [43, 25, 103], [44, 24, 103],
  [45, 24, 104], [46, 23, 104], [47, 23, 104], [48, 23, 104],
  [49, 23, 105], [50, 22, 105], [51, 22, 105], [52, 22, 105],
  [53, 22, 105], [54, 22, 105], [55, 22, 106], [56, 22, 106],
  [57, 22, 106], [58, 22, 106], [59, 22, 106], [60, 22, 106],
  [61, 22, 106], [62, 22, 105], [63, 22, 105], [64, 22, 105],
  [65, 22, 105], [66, 22, 105], [67, 23, 105], [68, 23, 104],
  [69, 23, 104], [70, 23, 104], [71, 24, 103], [72, 24, 103],
  [73, 25, 103], [74, 25, 102], [75, 25, 102], [76, 26, 101],
  [77, 26, 101], [78, 27, 100], [79, 28, 100], [80, 28, 99],
  [81, 29, 98], [82, 30, 98], [83, 30, 97], [84, 31, 96],
  [85, 32, 95], [86, 33, 94], [87, 34, 93], [88, 35, 92],
  [89, 36, 91], [90, 38, 89], [91, 39, 88], [92, 40, 87],
  [93, 42, 85], [94, 44, 83], [95, 46, 81], [96, 48, 60],
  [96, 68, 79], [97, 51, 56], [97, 71, 76], [98, 73, 73],
] as const;

const WRITABLE_SCREEN_ROW_RUNS = new Map<number, ReadonlyArray<readonly [number, number]>>();
for (const [y, startX, endX] of WRITABLE_SCREEN_RUNS) {
  const row = WRITABLE_SCREEN_ROW_RUNS.get(y) ?? [];
  WRITABLE_SCREEN_ROW_RUNS.set(y, [...row, [startX, endX]]);
}

export const BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT = WRITABLE_SCREEN_RUNS.reduce(
  (count, [, startX, endX]) => count + endX - startX + 1,
  0
);
export const BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS = Math.floor(
  BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT * 0.4
);

export function isBotAvatarDetailsWritablePixel(x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const runs = WRITABLE_SCREEN_ROW_RUNS.get(y);
  return Boolean(runs?.some(([startX, endX]) => x >= startX && x <= endX));
}

function fail(message: string): never {
  throw new Error(`Invalid avatar details: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function readIntegerInRange(
  value: unknown,
  label: string,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(`${label} must be an integer from ${min} through ${max}.`);
  }
  return value as number;
}

/**
 * Tests the full scaled stamp rectangle against the canonical canvas. Keeping
 * this independent from the allowlist makes the outside-screen guard directly
 * testable and safe for future catalog additions.
 */
export function isBotAvatarDetailStampTransformInsideCanvas(
  definition: BotAvatarDetailStampDefinition,
  transform: BotAvatarDetailStampTransform
): boolean {
  const halfWidth = (definition.baseWidth * transform.scalePct) / 200;
  const halfHeight = (definition.baseHeight * transform.scalePct) / 200;
  const centerX = definition.centerX + transform.offsetX;
  const centerY = definition.centerY + transform.offsetY;
  return (
    centerX - halfWidth >= 0 &&
    centerY - halfHeight >= 0 &&
    centerX + halfWidth <= BOT_AVATAR_DETAILS_CANVAS_SIZE &&
    centerY + halfHeight <= BOT_AVATAR_DETAILS_CANVAS_SIZE
  );
}

function encodeBase64Unchecked(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64_ALPHABET[first >> 2];
    encoded += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    encoded +=
      second === undefined
        ? "="
        : BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? "=" : BASE64_ALPHABET[third & 0x3f];
  }
  return encoded;
}

function decodeBase64Unchecked(value: string): Uint8Array {
  const bytes = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH);
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_VALUE_BY_CHARACTER.get(value[index] ?? "");
    const second = BASE64_VALUE_BY_CHARACTER.get(value[index + 1] ?? "");
    const thirdCharacter = value[index + 2] ?? "";
    const fourthCharacter = value[index + 3] ?? "";
    const third = BASE64_VALUE_BY_CHARACTER.get(thirdCharacter);
    const fourth = BASE64_VALUE_BY_CHARACTER.get(fourthCharacter);
    if (
      first === undefined ||
      second === undefined ||
      third === undefined ||
      (fourth === undefined && fourthCharacter !== "=")
    ) {
      fail("paintMaskBase64 must use the standard Base64 alphabet.");
    }
    bytes[outputIndex] = (first << 2) | (second >> 4);
    outputIndex += 1;
    if (thirdCharacter !== "=") {
      bytes[outputIndex] = ((second & 0x0f) << 4) | (third >> 2);
      outputIndex += 1;
    }
    if (fourthCharacter !== "=") {
      bytes[outputIndex] = ((third & 0x03) << 6) | (fourth as number);
      outputIndex += 1;
    }
  }
  if (outputIndex !== BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH) {
    fail(
      `paintMaskBase64 must decode to exactly ${BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH} bytes.`
    );
  }
  return bytes;
}

export function countBotAvatarDetailsPaintedPixels(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    let remaining = byte;
    while (remaining !== 0) {
      remaining &= remaining - 1;
      count += 1;
    }
  }
  return count;
}

function assertPaintMaskInsideWritableScreen(bytes: Uint8Array): void {
  for (let y = 0; y < BOT_AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < BOT_AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      const bitIndex = y * BOT_AVATAR_DETAILS_CANVAS_SIZE + x;
      const enabled = Boolean(
        (bytes[bitIndex >>> 3] ?? 0) & (1 << (7 - (bitIndex & 7)))
      );
      if (enabled && !isBotAvatarDetailsWritablePixel(x, y)) {
        fail(`paintMaskBase64 contains a pixel outside the writable face screen at ${x},${y}.`);
      }
    }
  }
}

export function decodeBotAvatarDetailsPaintMask(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length !== BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH ||
    value[value.length - 1] !== "=" ||
    value.slice(0, -1).includes("=")
  ) {
    fail(
      `paintMaskBase64 must be canonical padded Base64 with exactly ${BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH} characters.`
    );
  }
  const bytes = decodeBase64Unchecked(value);
  if (encodeBase64Unchecked(bytes) !== value) {
    fail("paintMaskBase64 must use canonical standard padded Base64.");
  }
  assertPaintMaskInsideWritableScreen(bytes);
  const paintedPixels = countBotAvatarDetailsPaintedPixels(bytes);
  if (paintedPixels > BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS) {
    fail(
      `paintMaskBase64 may cover at most ${BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS} pixels.`
    );
  }
  return bytes;
}

export function encodeBotAvatarDetailsPaintMask(bytes: Uint8Array): string {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength !== BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH
  ) {
    fail(
      `paint mask must contain exactly ${BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH} bytes.`
    );
  }
  assertPaintMaskInsideWritableScreen(bytes);
  const paintedPixels = countBotAvatarDetailsPaintedPixels(bytes);
  if (paintedPixels > BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS) {
    fail(`paint mask may cover at most ${BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS} pixels.`);
  }
  return encodeBase64Unchecked(bytes);
}

function readStamp(value: unknown, index: number): BotAvatarDetailStampV1 {
  if (!isRecord(value) || !hasExactKeys(value, STAMP_KEYS)) {
    fail(
      `screen.stamps[${index}] must contain exactly id, offsetX, offsetY, and scalePct.`
    );
  }
  if (
    typeof value.id !== "string" ||
    !STAMP_DEFINITION_BY_ID.has(value.id as BotAvatarDetailStampId)
  ) {
    fail(`screen.stamps[${index}].id is not allowlisted.`);
  }
  const id = value.id as BotAvatarDetailStampId;
  const offsetX = readIntegerInRange(
    value.offsetX,
    `screen.stamps[${index}].offsetX`,
    BOT_AVATAR_DETAIL_OFFSET_MIN,
    BOT_AVATAR_DETAIL_OFFSET_MAX
  );
  const offsetY = readIntegerInRange(
    value.offsetY,
    `screen.stamps[${index}].offsetY`,
    BOT_AVATAR_DETAIL_OFFSET_MIN,
    BOT_AVATAR_DETAIL_OFFSET_MAX
  );
  const scalePct = readIntegerInRange(
    value.scalePct,
    `screen.stamps[${index}].scalePct`,
    BOT_AVATAR_DETAIL_SCALE_MIN,
    BOT_AVATAR_DETAIL_SCALE_MAX
  );
  const definition = STAMP_DEFINITION_BY_ID.get(id)!;
  if (
    !isBotAvatarDetailStampTransformInsideCanvas(definition, {
      offsetX,
      offsetY,
      scalePct,
    })
  ) {
    fail(`screen.stamps[${index}] extends outside the 128x128 avatar canvas.`);
  }
  return { id, offsetX, offsetY, scalePct };
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

export function parseBotAvatarDetailsV1(value: unknown): BotAvatarDetailsV1 {
  let inputJson: string | undefined;
  try {
    inputJson = JSON.stringify(value);
  } catch {
    fail("the input must be JSON-serializable.");
  }
  if (
    inputJson !== undefined &&
    utf8ByteLength(inputJson) > BOT_AVATAR_DETAILS_MAX_JSON_BYTES
  ) {
    fail(`input JSON may not exceed ${BOT_AVATAR_DETAILS_MAX_JSON_BYTES} bytes.`);
  }
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS)) {
    fail("the object must contain exactly version and screen.");
  }
  if (value.version !== BOT_AVATAR_DETAILS_VERSION) {
    fail(`version must be ${BOT_AVATAR_DETAILS_VERSION}.`);
  }
  if (
    !isRecord(value.screen) ||
    (!hasExactKeys(value.screen, SCREEN_KEYS) &&
      !hasExactKeys(value.screen, SCREEN_KEYS_WITH_BLINK_INK))
  ) {
    fail(
      "screen must contain exactly stamps and paintMaskBase64, with optional hideInkDuringBlink."
    );
  }
  if (!Array.isArray(value.screen.stamps)) {
    fail("screen.stamps must be an array.");
  }
  if (
    "hideInkDuringBlink" in value.screen &&
    typeof value.screen.hideInkDuringBlink !== "boolean"
  ) {
    fail("screen.hideInkDuringBlink must be a boolean when provided.");
  }
  const stamps = value.screen.stamps.map(readStamp);
  const ids = new Set<BotAvatarDetailStampId>();
  const categoryCounts: Record<BotAvatarDetailStampCategory, number> = {
    eyewear: 0,
    "facial-hair": 0,
    marking: 0,
  };
  for (const stamp of stamps) {
    if (ids.has(stamp.id)) {
      fail(`stamp id ${stamp.id} may appear only once.`);
    }
    ids.add(stamp.id);
    const category = STAMP_DEFINITION_BY_ID.get(stamp.id)!.category;
    categoryCounts[category] += 1;
  }
  if (categoryCounts.eyewear > 1) {
    fail("only one eyewear stamp is allowed.");
  }
  if (categoryCounts["facial-hair"] > 1) {
    fail("only one facial-hair stamp is allowed.");
  }
  if (categoryCounts.marking > 2) {
    fail("at most two marking stamps are allowed.");
  }

  let paintMaskBase64: string | null = null;
  if (value.screen.paintMaskBase64 !== null) {
    if (typeof value.screen.paintMaskBase64 !== "string") {
      fail("screen.paintMaskBase64 must be a string or null.");
    }
    const maskBytes = decodeBotAvatarDetailsPaintMask(value.screen.paintMaskBase64);
    if (countBotAvatarDetailsPaintedPixels(maskBytes) > 0) {
      paintMaskBase64 = value.screen.paintMaskBase64;
    }
  }

  stamps.sort(
    (left, right) =>
      STAMP_ORDER_BY_ID.get(left.id)! - STAMP_ORDER_BY_ID.get(right.id)!
  );
  const parsed: BotAvatarDetailsV1 = {
    version: BOT_AVATAR_DETAILS_VERSION,
    screen: {
      stamps,
      paintMaskBase64,
      ...(value.screen.hideInkDuringBlink === true
        ? { hideInkDuringBlink: true as const }
        : {}),
    },
  };
  const canonicalJson = JSON.stringify(parsed);
  if (utf8ByteLength(canonicalJson) > BOT_AVATAR_DETAILS_MAX_JSON_BYTES) {
    fail(`canonical JSON may not exceed ${BOT_AVATAR_DETAILS_MAX_JSON_BYTES} bytes.`);
  }
  return parsed;
}

export function serializeBotAvatarDetailsV1(value: unknown): string {
  return JSON.stringify(parseBotAvatarDetailsV1(value));
}

/** Safely reads the nullable canonical JSON column used by bot rows. */
export function parseStoredBotAvatarDetailsV1(
  value: unknown
): BotAvatarDetailsV1 | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (utf8ByteLength(value) > BOT_AVATAR_DETAILS_MAX_JSON_BYTES) return null;
  try {
    return parseBotAvatarDetailsV1(JSON.parse(value));
  } catch {
    return null;
  }
}
