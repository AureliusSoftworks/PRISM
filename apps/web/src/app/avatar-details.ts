import {
  BOT_AVATAR_DETAILS_CANVAS_SIZE,
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
  BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH,
  BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_VERSION,
  BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT,
  BOT_AVATAR_DETAIL_OFFSET_MAX,
  BOT_AVATAR_DETAIL_OFFSET_MIN,
  BOT_AVATAR_DETAIL_SCALE_MAX,
  BOT_AVATAR_DETAIL_SCALE_MIN,
  BOT_AVATAR_DETAIL_STAMP_CATALOG,
  BOT_AVATAR_DETAIL_STAMP_IDS,
  countBotAvatarDetailsPaintedPixels,
  decodeBotAvatarDetailsPaintMask,
  encodeBotAvatarDetailsPaintMask,
  isBotAvatarDetailsWritablePixel,
  parseBotAvatarDetailsV1,
  type BotFaceStyle,
  type BotAvatarDetailStampCategory,
  type BotAvatarDetailStampId,
  type BotAvatarDetailStampV1,
  type BotAvatarDetailsV1,
} from "@localai/shared";

export const AVATAR_DETAILS_CANVAS_SIZE = BOT_AVATAR_DETAILS_CANVAS_SIZE;
export const AVATAR_DETAILS_MASK_BYTE_LENGTH =
  BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH;
export const AVATAR_DETAILS_MASK_BASE64_LENGTH =
  BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH;
export const AVATAR_DETAILS_MAX_PAINT_PIXELS =
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS;
export const AVATAR_DETAILS_WRITABLE_PIXELS =
  BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT;
export const AVATAR_DETAILS_VERSION = BOT_AVATAR_DETAILS_VERSION;
export const AVATAR_DETAIL_OFFSET_MIN = BOT_AVATAR_DETAIL_OFFSET_MIN;
export const AVATAR_DETAIL_OFFSET_MAX = BOT_AVATAR_DETAIL_OFFSET_MAX;
export const AVATAR_DETAIL_SCALE_MIN = BOT_AVATAR_DETAIL_SCALE_MIN;
export const AVATAR_DETAIL_SCALE_MAX = BOT_AVATAR_DETAIL_SCALE_MAX;
export const AVATAR_DETAILS_BRUSH_SIZES = [1, 3, 5] as const;

export const AVATAR_DETAIL_STAMP_IDS = BOT_AVATAR_DETAIL_STAMP_IDS;

export type AvatarDetailStampId = BotAvatarDetailStampId;
export type AvatarDetailStampCategory = BotAvatarDetailStampCategory;
export type AvatarDetailsBrushSize =
  (typeof AVATAR_DETAILS_BRUSH_SIZES)[number];
export type AvatarDetailsPaintMode = "brush" | "eraser";
export type AvatarDetailsTool =
  AvatarDetailsPaintMode | "line" | "circle" | "move";

export type AvatarDetailStampV1 = BotAvatarDetailStampV1;
export type AvatarDetailsV1 = BotAvatarDetailsV1;

export interface AvatarDetailStampDefinition {
  id: AvatarDetailStampId;
  label: string;
  category: AvatarDetailStampCategory;
  centerX: number;
  centerY: number;
  baseWidth: number;
  baseHeight: number;
}

/**
 * Face-relative smart anchors shared with the storage validator. Offsets are
 * deltas from these centers, so changing an accessory never makes it jump to a
 * generic canvas origin.
 */
const AVATAR_DETAIL_STAMP_LABELS: Record<AvatarDetailStampId, string> = {
  "round-glasses": "Round glasses",
  "square-glasses": "Square glasses",
  visor: "Visor",
  monocle: "Monocle",
  "handlebar-mustache": "Handlebar",
  "straight-mustache": "Straight mustache",
  "short-beard": "Short beard",
  goatee: "Goatee",
  freckles: "Freckles",
  "diagonal-scar": "Diagonal scar",
  "cheek-stripes": "Cheek stripes",
  "circuit-mark": "Circuit mark",
};

export const AVATAR_DETAIL_STAMP_DEFINITIONS: readonly AvatarDetailStampDefinition[] =
  BOT_AVATAR_DETAIL_STAMP_CATALOG.map((definition) => ({
    ...definition,
    label: AVATAR_DETAIL_STAMP_LABELS[definition.id],
  }));

const AVATAR_DETAIL_STAMP_DEFINITION_BY_ID = new Map(
  AVATAR_DETAIL_STAMP_DEFINITIONS.map((definition) => [
    definition.id,
    definition,
  ]),
);
export const EMPTY_AVATAR_DETAILS: AvatarDetailsV1 = {
  version: AVATAR_DETAILS_VERSION,
  screen: {
    stamps: [],
    paintMaskBase64: null,
  },
};

export function normalizeAvatarDetails(value: unknown): AvatarDetailsV1 {
  try {
    const parsed = parseBotAvatarDetailsV1(value);
    const decoded = decodeAvatarDetailsPaintMask(parsed.screen.paintMaskBase64);
    return {
      ...parsed,
      screen: {
        ...parsed.screen,
        paintMaskBase64:
          decoded && countBotAvatarDetailsPaintedPixels(decoded) > 0
            ? parsed.screen.paintMaskBase64
            : null,
      },
    };
  } catch {
    return cloneAvatarDetails(EMPTY_AVATAR_DETAILS);
  }
}

export function cloneAvatarDetails(details: AvatarDetailsV1): AvatarDetailsV1 {
  return {
    version: AVATAR_DETAILS_VERSION,
    screen: {
      stamps: details.screen.stamps.map((stamp) => ({ ...stamp })),
      paintMaskBase64: details.screen.paintMaskBase64,
      ...(details.screen.hideInkDuringBlink
        ? { hideInkDuringBlink: true as const }
        : {}),
    },
  };
}

export function setAvatarDetailsHideInkDuringBlink(
  details: AvatarDetailsV1,
  enabled: boolean,
): AvatarDetailsV1 {
  const screen = { ...details.screen };
  if (enabled) screen.hideInkDuringBlink = true;
  else delete screen.hideInkDuringBlink;
  return normalizeAvatarDetails({ ...details, screen });
}

export function avatarDetailsInkHiddenForBlink(
  details: AvatarDetailsV1 | null | undefined,
  blinkPhase: "open" | "closed",
): boolean {
  return details?.screen.hideInkDuringBlink === true && blinkPhase === "closed";
}

export function avatarDetailsKey(
  details: AvatarDetailsV1 | null | undefined,
): string {
  const normalized = normalizeAvatarDetails(details);
  return JSON.stringify(normalized);
}

export function avatarDetailsEqual(
  left: AvatarDetailsV1 | null | undefined,
  right: AvatarDetailsV1 | null | undefined,
): boolean {
  return avatarDetailsKey(left) === avatarDetailsKey(right);
}

export function avatarDetailsHasVisuals(
  details: AvatarDetailsV1 | null | undefined,
): boolean {
  const normalized = normalizeAvatarDetails(details);
  return (
    normalized.screen.stamps.length > 0 ||
    normalized.screen.paintMaskBase64 !== null
  );
}

export function encodeAvatarDetailsPaintMask(mask: Uint8Array): string | null {
  if (mask.length !== AVATAR_DETAILS_MASK_BYTE_LENGTH) {
    throw new RangeError(
      `Avatar detail mask must contain ${AVATAR_DETAILS_MASK_BYTE_LENGTH} bytes.`,
    );
  }
  return avatarDetailsPaintPixelCount(mask) === 0
    ? null
    : encodeBotAvatarDetailsPaintMask(mask);
}

export function decodeAvatarDetailsPaintMask(
  encoded: string | null | undefined,
): Uint8Array | null {
  if (encoded == null || encoded === "") {
    return new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
  }
  try {
    return decodeBotAvatarDetailsPaintMask(encoded);
  } catch {
    return null;
  }
}

export function avatarDetailsPaintPixelCount(mask: Uint8Array): number {
  return countBotAvatarDetailsPaintedPixels(mask);
}

export function avatarDetailsPaintCoveragePercent(mask: Uint8Array): number {
  return (
    (avatarDetailsPaintPixelCount(mask) / AVATAR_DETAILS_WRITABLE_PIXELS) * 100
  );
}

export function avatarDetailsWritablePixel(x: number, y: number): boolean {
  return isBotAvatarDetailsWritablePixel(x, y);
}

export function avatarDetailsMaskPixel(
  mask: Uint8Array,
  x: number,
  y: number,
): boolean {
  if (
    x < 0 ||
    y < 0 ||
    x >= AVATAR_DETAILS_CANVAS_SIZE ||
    y >= AVATAR_DETAILS_CANVAS_SIZE
  ) {
    return false;
  }
  const bitIndex = y * AVATAR_DETAILS_CANVAS_SIZE + x;
  const byteIndex = bitIndex >>> 3;
  const bit = 7 - (bitIndex & 7);
  return Boolean((mask[byteIndex] ?? 0) & (1 << bit));
}

function setAvatarDetailsMaskPixel(
  mask: Uint8Array,
  x: number,
  y: number,
  enabled: boolean,
): boolean {
  if (
    x < 0 ||
    y < 0 ||
    x >= AVATAR_DETAILS_CANVAS_SIZE ||
    y >= AVATAR_DETAILS_CANVAS_SIZE ||
    !avatarDetailsWritablePixel(x, y)
  ) {
    return false;
  }
  const bitIndex = y * AVATAR_DETAILS_CANVAS_SIZE + x;
  const byteIndex = bitIndex >>> 3;
  const bit = 7 - (bitIndex & 7);
  const bitMask = 1 << bit;
  const wasEnabled = Boolean((mask[byteIndex] ?? 0) & bitMask);
  if (wasEnabled === enabled) return false;
  mask[byteIndex] = enabled
    ? (mask[byteIndex] ?? 0) | bitMask
    : (mask[byteIndex] ?? 0) & ~bitMask;
  return true;
}

export interface AvatarDetailsGridPoint {
  x: number;
  y: number;
}

export interface AvatarDetailsClientBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Maps a pointer into the canonical, front-facing 128px editor grid. */
export function avatarDetailsGridPointFromClient(
  clientX: number,
  clientY: number,
  bounds: AvatarDetailsClientBounds,
): AvatarDetailsGridPoint {
  const x = Math.floor(
    ((clientX - bounds.left) / Math.max(1, bounds.width)) *
      AVATAR_DETAILS_CANVAS_SIZE,
  );
  const y = Math.floor(
    ((clientY - bounds.top) / Math.max(1, bounds.height)) *
      AVATAR_DETAILS_CANVAS_SIZE,
  );
  return {
    x: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, x)),
    y: Math.max(0, Math.min(AVATAR_DETAILS_CANVAS_SIZE - 1, y)),
  };
}

/** Integer Bresenham traversal prevents holes between sparse pointer events. */
export function interpolateAvatarDetailsGridLine(
  start: AvatarDetailsGridPoint,
  end: AvatarDetailsGridPoint,
): AvatarDetailsGridPoint[] {
  let x = Math.round(start.x);
  let y = Math.round(start.y);
  const targetX = Math.round(end.x);
  const targetY = Math.round(end.y);
  const dx = Math.abs(targetX - x);
  const dy = Math.abs(targetY - y);
  const stepX = x < targetX ? 1 : -1;
  const stepY = y < targetY ? 1 : -1;
  let error = dx - dy;
  const points: AvatarDetailsGridPoint[] = [];

  while (true) {
    points.push({ x, y });
    if (x === targetX && y === targetY) break;
    const doubledError = error * 2;
    if (doubledError > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubledError < dx) {
      error += dx;
      y += stepY;
    }
  }
  return points;
}

/** Midpoint-circle traversal keeps outline previews crisp on the pixel grid. */
export function avatarDetailsCirclePoints(
  center: AvatarDetailsGridPoint,
  edge: AvatarDetailsGridPoint,
): AvatarDetailsGridPoint[] {
  const centerX = Math.round(center.x);
  const centerY = Math.round(center.y);
  const radius = Math.round(
    Math.hypot(Math.round(edge.x) - centerX, Math.round(edge.y) - centerY),
  );
  if (radius === 0) return [{ x: centerX, y: centerY }];

  const points = new Map<string, AvatarDetailsGridPoint>();
  const addPoint = (x: number, y: number): void => {
    points.set(`${x}:${y}`, { x, y });
  };
  let x = radius;
  let y = 0;
  let error = 1 - radius;
  while (x >= y) {
    addPoint(centerX + x, centerY + y);
    addPoint(centerX + y, centerY + x);
    addPoint(centerX - y, centerY + x);
    addPoint(centerX - x, centerY + y);
    addPoint(centerX - x, centerY - y);
    addPoint(centerX - y, centerY - x);
    addPoint(centerX + y, centerY - x);
    addPoint(centerX + x, centerY - y);
    y += 1;
    if (error < 0) {
      error += 2 * y + 1;
    } else {
      x -= 1;
      error += 2 * (y - x) + 1;
    }
  }
  return [...points.values()];
}

export interface MoveAvatarDetailsPaintMaskResult {
  mask: Uint8Array;
  changed: boolean;
  offset: AvatarDetailsGridPoint;
}

function avatarDetailsPaintTranslationIsValid(
  source: Uint8Array,
  offset: AvatarDetailsGridPoint,
): boolean {
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (
        avatarDetailsMaskPixel(source, x, y) &&
        !avatarDetailsWritablePixel(x + offset.x, y + offset.y)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Moves all authored ink together and backs off toward the origin when the
 * requested offset would clip any pixel outside the writable screen.
 */
export function moveAvatarDetailsPaintMask(
  source: Uint8Array,
  desiredOffset: AvatarDetailsGridPoint,
): MoveAvatarDetailsPaintMaskResult {
  if (source.length !== AVATAR_DETAILS_MASK_BYTE_LENGTH) {
    throw new RangeError(
      `Avatar detail mask must contain ${AVATAR_DETAILS_MASK_BYTE_LENGTH} bytes.`,
    );
  }
  const requested = {
    x: Math.round(desiredOffset.x),
    y: Math.round(desiredOffset.y),
  };
  const candidates = interpolateAvatarDetailsGridLine(
    { x: 0, y: 0 },
    requested,
  );
  const offset = [...candidates]
    .reverse()
    .find((candidate) =>
      avatarDetailsPaintTranslationIsValid(source, candidate),
    ) ?? { x: 0, y: 0 };
  const changed =
    (offset.x !== 0 || offset.y !== 0) &&
    avatarDetailsPaintPixelCount(source) > 0;
  if (!changed) return { mask: source.slice(), changed: false, offset };

  const mask = new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (avatarDetailsMaskPixel(source, x, y)) {
        setAvatarDetailsMaskPixel(mask, x + offset.x, y + offset.y, true);
      }
    }
  }
  return { mask, changed: true, offset };
}

export interface PaintAvatarDetailsMaskResult {
  mask: Uint8Array;
  changed: boolean;
  limitReached: boolean;
}

export function paintAvatarDetailsMask(
  source: Uint8Array,
  points: readonly AvatarDetailsGridPoint[],
  brushSize: AvatarDetailsBrushSize,
  mode: AvatarDetailsPaintMode,
): PaintAvatarDetailsMaskResult {
  const mask = source.slice();
  let pixelCount = avatarDetailsPaintPixelCount(mask);
  let changed = false;
  let limitReached = false;
  const radius = Math.floor(brushSize / 2);

  for (const point of points) {
    const centerX = Math.round(point.x);
    const centerY = Math.round(point.y);
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if (!avatarDetailsWritablePixel(x, y)) continue;
        const enabled = mode === "brush";
        if (enabled && !avatarDetailsMaskPixel(mask, x, y)) {
          if (pixelCount >= AVATAR_DETAILS_MAX_PAINT_PIXELS) {
            limitReached = true;
            continue;
          }
          if (setAvatarDetailsMaskPixel(mask, x, y, true)) {
            pixelCount += 1;
            changed = true;
          }
        } else if (!enabled && avatarDetailsMaskPixel(mask, x, y)) {
          if (setAvatarDetailsMaskPixel(mask, x, y, false)) {
            pixelCount -= 1;
            changed = true;
          }
        }
      }
    }
  }
  return { mask, changed, limitReached };
}

export function avatarDetailStampDefinition(
  id: AvatarDetailStampId,
): AvatarDetailStampDefinition {
  return AVATAR_DETAIL_STAMP_DEFINITION_BY_ID.get(id)!;
}

export function avatarDetailStampForCategory(
  details: AvatarDetailsV1,
  category: AvatarDetailStampCategory,
): AvatarDetailStampV1 | null {
  return (
    details.screen.stamps.find(
      (stamp) => avatarDetailStampDefinition(stamp.id).category === category,
    ) ?? null
  );
}

export function avatarDetailStampsForCategory(
  details: AvatarDetailsV1,
  category: AvatarDetailStampCategory,
): AvatarDetailStampV1[] {
  return details.screen.stamps.filter(
    (stamp) => avatarDetailStampDefinition(stamp.id).category === category,
  );
}

export function replaceAvatarDetailStampForCategory(
  details: AvatarDetailsV1,
  category: AvatarDetailStampCategory,
  stamp: AvatarDetailStampV1 | null,
): AvatarDetailsV1 {
  const stamps = details.screen.stamps.filter(
    (candidate) =>
      avatarDetailStampDefinition(candidate.id).category !== category,
  );
  if (stamp) stamps.push({ ...stamp });
  return normalizeAvatarDetails({
    ...details,
    screen: { ...details.screen, stamps },
  });
}

export function toggleAvatarDetailStamp(
  details: AvatarDetailsV1,
  id: AvatarDetailStampId,
): AvatarDetailsV1 {
  const definition = avatarDetailStampDefinition(id);
  const existing = details.screen.stamps.find((stamp) => stamp.id === id);
  if (existing) {
    return normalizeAvatarDetails({
      ...details,
      screen: {
        ...details.screen,
        stamps: details.screen.stamps.filter((stamp) => stamp.id !== id),
      },
    });
  }
  const categoryStamps = avatarDetailStampsForCategory(
    details,
    definition.category,
  );
  if (definition.category !== "marking") {
    return replaceAvatarDetailStampForCategory(details, definition.category, {
      id,
      offsetX: 0,
      offsetY: 0,
      scalePct: 100,
    });
  }
  if (categoryStamps.length >= 2) return cloneAvatarDetails(details);
  return normalizeAvatarDetails({
    ...details,
    screen: {
      ...details.screen,
      stamps: [
        ...details.screen.stamps,
        { id, offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
    },
  });
}

export function updateAvatarDetailStamp(
  details: AvatarDetailsV1,
  nextStamp: AvatarDetailStampV1,
): AvatarDetailsV1 {
  return normalizeAvatarDetails({
    ...details,
    screen: {
      ...details.screen,
      stamps: details.screen.stamps.map((stamp) =>
        stamp.id === nextStamp.id ? { ...nextStamp } : stamp,
      ),
    },
  });
}

export interface AvatarDetailStampBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export function avatarDetailStampBounds(
  stamp: AvatarDetailStampV1,
): AvatarDetailStampBounds {
  const definition = avatarDetailStampDefinition(stamp.id);
  const scale = stamp.scalePct / 100;
  const width = definition.baseWidth * scale;
  const height = definition.baseHeight * scale;
  const centerX = definition.centerX + stamp.offsetX;
  const centerY = definition.centerY + stamp.offsetY;
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
    width,
    height,
  };
}

function alphaIndex(x: number, y: number): number {
  return y * AVATAR_DETAILS_CANVAS_SIZE + x;
}

function setAlphaPixel(
  alpha: Uint8Array,
  x: number,
  y: number,
  value = 255,
): void {
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (
    roundedX < 0 ||
    roundedY < 0 ||
    roundedX >= AVATAR_DETAILS_CANVAS_SIZE ||
    roundedY >= AVATAR_DETAILS_CANVAS_SIZE
  ) {
    return;
  }
  const index = alphaIndex(roundedX, roundedY);
  alpha[index] = Math.max(alpha[index] ?? 0, value);
}

function drawAlphaDisk(
  alpha: Uint8Array,
  centerX: number,
  centerY: number,
  radius: number,
): void {
  const integerRadius = Math.max(0, Math.round(radius));
  for (let y = -integerRadius; y <= integerRadius; y += 1) {
    for (let x = -integerRadius; x <= integerRadius; x += 1) {
      if (x * x + y * y <= integerRadius * integerRadius + 0.5) {
        setAlphaPixel(alpha, centerX + x, centerY + y);
      }
    }
  }
}

function drawAlphaLine(
  alpha: Uint8Array,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  thickness = 1,
): void {
  const points = interpolateAvatarDetailsGridLine(
    { x: startX, y: startY },
    { x: endX, y: endY },
  );
  const radius = Math.max(0, (thickness - 1) / 2);
  for (const point of points) drawAlphaDisk(alpha, point.x, point.y, radius);
}

function drawAlphaEllipseOutline(
  alpha: Uint8Array,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  thickness: number,
): void {
  const steps = Math.max(
    24,
    Math.ceil(Math.max(radiusX, radiusY) * Math.PI * 3),
  );
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    drawAlphaDisk(
      alpha,
      centerX + Math.cos(angle) * radiusX,
      centerY + Math.sin(angle) * radiusY,
      Math.max(0, (thickness - 1) / 2),
    );
  }
}

function drawAlphaRectangleOutline(
  alpha: Uint8Array,
  left: number,
  top: number,
  right: number,
  bottom: number,
  thickness: number,
): void {
  drawAlphaLine(alpha, left, top, right, top, thickness);
  drawAlphaLine(alpha, right, top, right, bottom, thickness);
  drawAlphaLine(alpha, right, bottom, left, bottom, thickness);
  drawAlphaLine(alpha, left, bottom, left, top, thickness);
}

function drawAvatarDetailStamp(
  alpha: Uint8Array,
  stamp: AvatarDetailStampV1,
): void {
  const bounds = avatarDetailStampBounds(stamp);
  const { centerX: cx, centerY: cy, width: w, height: h } = bounds;
  const line = Math.max(1, Math.round(stamp.scalePct / 55));

  switch (stamp.id) {
    case "round-glasses": {
      const lensRadiusX = w * 0.2;
      const lensRadiusY = h * 0.4;
      drawAlphaEllipseOutline(
        alpha,
        cx - w * 0.26,
        cy,
        lensRadiusX,
        lensRadiusY,
        line,
      );
      drawAlphaEllipseOutline(
        alpha,
        cx + w * 0.26,
        cy,
        lensRadiusX,
        lensRadiusY,
        line,
      );
      drawAlphaLine(alpha, cx - w * 0.06, cy, cx + w * 0.06, cy, line);
      drawAlphaLine(
        alpha,
        bounds.left,
        cy - h * 0.06,
        bounds.left - w * 0.08,
        cy - h * 0.15,
        line,
      );
      drawAlphaLine(
        alpha,
        bounds.right,
        cy - h * 0.06,
        bounds.right + w * 0.08,
        cy - h * 0.15,
        line,
      );
      break;
    }
    case "square-glasses": {
      drawAlphaRectangleOutline(
        alpha,
        bounds.left + w * 0.04,
        bounds.top + h * 0.1,
        cx - w * 0.05,
        bounds.bottom - h * 0.1,
        line,
      );
      drawAlphaRectangleOutline(
        alpha,
        cx + w * 0.05,
        bounds.top + h * 0.1,
        bounds.right - w * 0.04,
        bounds.bottom - h * 0.1,
        line,
      );
      drawAlphaLine(alpha, cx - w * 0.05, cy, cx + w * 0.05, cy, line);
      break;
    }
    case "visor": {
      drawAlphaRectangleOutline(
        alpha,
        bounds.left,
        bounds.top + h * 0.08,
        bounds.right,
        bounds.bottom - h * 0.08,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        bounds.left + w * 0.08,
        cy,
        bounds.right - w * 0.08,
        cy,
        line,
      );
      break;
    }
    case "monocle": {
      drawAlphaEllipseOutline(
        alpha,
        cx,
        cy - h * 0.08,
        w * 0.38,
        h * 0.36,
        line,
      );
      drawAlphaLine(
        alpha,
        cx + w * 0.3,
        cy + h * 0.17,
        cx + w * 0.46,
        bounds.bottom,
        line,
      );
      break;
    }
    case "handlebar-mustache": {
      drawAlphaLine(alpha, cx, cy, cx - w * 0.22, cy + h * 0.1, line + 2);
      drawAlphaLine(
        alpha,
        cx - w * 0.22,
        cy + h * 0.1,
        bounds.left,
        cy - h * 0.24,
        line + 1,
      );
      drawAlphaLine(alpha, cx, cy, cx + w * 0.22, cy + h * 0.1, line + 2);
      drawAlphaLine(
        alpha,
        cx + w * 0.22,
        cy + h * 0.1,
        bounds.right,
        cy - h * 0.24,
        line + 1,
      );
      drawAlphaDisk(alpha, cx, cy, line + 1);
      break;
    }
    case "straight-mustache": {
      drawAlphaLine(alpha, bounds.left, cy, cx - 1, cy + h * 0.08, line + 2);
      drawAlphaLine(alpha, cx + 1, cy + h * 0.08, bounds.right, cy, line + 2);
      break;
    }
    case "short-beard": {
      drawAlphaLine(
        alpha,
        bounds.left,
        bounds.top,
        bounds.left + w * 0.12,
        cy + h * 0.28,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        bounds.left + w * 0.12,
        cy + h * 0.28,
        cx,
        bounds.bottom,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        cx,
        bounds.bottom,
        bounds.right - w * 0.12,
        cy + h * 0.28,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        bounds.right - w * 0.12,
        cy + h * 0.28,
        bounds.right,
        bounds.top,
        line + 1,
      );
      for (let offset = -0.28; offset <= 0.28; offset += 0.14) {
        drawAlphaLine(
          alpha,
          cx + w * offset,
          cy + h * 0.16,
          cx + w * offset,
          bounds.bottom - h * 0.08,
          line,
        );
      }
      break;
    }
    case "goatee": {
      drawAlphaLine(
        alpha,
        cx - w * 0.28,
        bounds.top,
        cx - w * 0.14,
        bounds.bottom,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        cx + w * 0.28,
        bounds.top,
        cx + w * 0.14,
        bounds.bottom,
        line + 1,
      );
      drawAlphaLine(
        alpha,
        cx - w * 0.14,
        bounds.bottom,
        cx + w * 0.14,
        bounds.bottom,
        line + 1,
      );
      break;
    }
    case "freckles": {
      const points = [
        [-0.38, -0.12],
        [-0.26, 0.18],
        [-0.13, -0.02],
        [0.13, -0.02],
        [0.26, 0.18],
        [0.38, -0.12],
      ] as const;
      for (const [x, y] of points) {
        drawAlphaDisk(alpha, cx + w * x, cy + h * y, Math.max(1, line - 1));
      }
      break;
    }
    case "diagonal-scar": {
      drawAlphaLine(
        alpha,
        bounds.left,
        bounds.bottom,
        bounds.right,
        bounds.top,
        line,
      );
      for (const offset of [0.25, 0.5, 0.75]) {
        const x = bounds.left + w * offset;
        const y = bounds.bottom - h * offset;
        drawAlphaLine(
          alpha,
          x - w * 0.12,
          y - h * 0.05,
          x + w * 0.12,
          y + h * 0.05,
          line,
        );
      }
      break;
    }
    case "cheek-stripes": {
      for (const offset of [-0.3, 0, 0.3]) {
        drawAlphaLine(
          alpha,
          bounds.left,
          cy + h * offset + h * 0.14,
          bounds.right,
          cy + h * offset - h * 0.14,
          line,
        );
      }
      break;
    }
    case "circuit-mark": {
      drawAlphaLine(alpha, bounds.left, cy - h * 0.18, cx, cy - h * 0.18, line);
      drawAlphaLine(alpha, cx, bounds.top, cx, bounds.bottom, line);
      drawAlphaLine(alpha, cx, cy + h * 0.2, bounds.right, cy + h * 0.2, line);
      drawAlphaDisk(alpha, bounds.left, cy - h * 0.18, line + 1);
      drawAlphaDisk(alpha, bounds.right, cy + h * 0.2, line + 1);
      drawAlphaDisk(alpha, cx, bounds.top, line + 1);
      break;
    }
  }
}

export const AVATAR_DETAILS_CATALOG_VERSION = 1;
const AVATAR_DETAILS_ALPHA_CACHE_LIMIT = 128;
const avatarDetailsAlphaCache = new Map<string, Uint8Array>();

export type AvatarDetailsFaceGeometry = Pick<
  BotFaceStyle,
  | "eyeScale"
  | "eyeOffsetX"
  | "eyeOffsetY"
  | "mouthScale"
  | "mouthOffsetX"
  | "mouthOffsetY"
  | "mouthRotationDeg"
>;

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeAvatarDetailsFaceGeometry(
  geometry: Partial<AvatarDetailsFaceGeometry> | null | undefined,
): AvatarDetailsFaceGeometry {
  return {
    eyeScale: Math.min(1.3, Math.max(0.7, finiteOr(geometry?.eyeScale, 1))),
    eyeOffsetX: Math.min(
      0.18,
      Math.max(-0.18, finiteOr(geometry?.eyeOffsetX, 0)),
    ),
    eyeOffsetY: Math.min(
      0.18,
      Math.max(-0.18, finiteOr(geometry?.eyeOffsetY, 0)),
    ),
    mouthScale: Math.min(1.5, Math.max(0.7, finiteOr(geometry?.mouthScale, 1))),
    mouthOffsetX: Math.min(
      0.18,
      Math.max(-0.18, finiteOr(geometry?.mouthOffsetX, 0)),
    ),
    mouthOffsetY: Math.min(
      0.18,
      Math.max(-0.18, finiteOr(geometry?.mouthOffsetY, 0)),
    ),
    mouthRotationDeg: Math.min(
      180,
      Math.max(-180, finiteOr(geometry?.mouthRotationDeg, 0)),
    ),
  };
}

export function avatarDetailsMaskCacheKey(
  details: AvatarDetailsV1 | null | undefined,
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null,
): string {
  return `${AVATAR_DETAILS_CATALOG_VERSION}:${avatarDetailsKey(details)}:${JSON.stringify(
    normalizeAvatarDetailsFaceGeometry(faceGeometry),
  )}`;
}

export interface AvatarDetailsResolvedStampAnchor {
  centerX: number;
  centerY: number;
  anchorScale: number;
  rotationDeg: number;
}

export function resolveAvatarDetailStampAnchor(
  stamp: AvatarDetailStampV1,
  geometryInput?: Partial<AvatarDetailsFaceGeometry> | null,
): AvatarDetailsResolvedStampAnchor {
  const definition = avatarDetailStampDefinition(stamp.id);
  const geometry = normalizeAvatarDetailsFaceGeometry(geometryInput);
  const baseCenterX = definition.centerX + stamp.offsetX;
  const baseCenterY = definition.centerY + stamp.offsetY;
  if (definition.category === "eyewear") {
    return {
      centerX: baseCenterX + geometry.eyeOffsetX * 64,
      centerY: baseCenterY + geometry.eyeOffsetY * 64,
      anchorScale: geometry.eyeScale,
      rotationDeg: 0,
    };
  }
  if (definition.category === "facial-hair") {
    return {
      centerX: baseCenterX + geometry.mouthOffsetX * 64,
      centerY: baseCenterY + geometry.mouthOffsetY * 64,
      anchorScale: geometry.mouthScale,
      rotationDeg: geometry.mouthRotationDeg,
    };
  }
  return {
    centerX: baseCenterX,
    centerY: baseCenterY,
    anchorScale: 1,
    rotationDeg: 0,
  };
}

function compositeResolvedAvatarDetailStamp(
  destination: Uint8Array,
  stamp: AvatarDetailStampV1,
  geometry: AvatarDetailsFaceGeometry,
): void {
  const source = new Uint8Array(
    AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE,
  );
  drawAvatarDetailStamp(source, stamp);
  const definition = avatarDetailStampDefinition(stamp.id);
  const sourceCenterX = definition.centerX + stamp.offsetX;
  const sourceCenterY = definition.centerY + stamp.offsetY;
  const anchor = resolveAvatarDetailStampAnchor(stamp, geometry);
  const radians = (anchor.rotationDeg * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      const targetX = x - anchor.centerX;
      const targetY = y - anchor.centerY;
      const sourceX =
        sourceCenterX +
        (targetX * cosine + targetY * sine) / anchor.anchorScale;
      const sourceY =
        sourceCenterY +
        (-targetX * sine + targetY * cosine) / anchor.anchorScale;
      const sampleX = Math.round(sourceX);
      const sampleY = Math.round(sourceY);
      if (
        sampleX >= 0 &&
        sampleY >= 0 &&
        sampleX < AVATAR_DETAILS_CANVAS_SIZE &&
        sampleY < AVATAR_DETAILS_CANVAS_SIZE &&
        (source[alphaIndex(sampleX, sampleY)] ?? 0) > 0
      ) {
        destination[alphaIndex(x, y)] = 255;
      }
    }
  }
}

export function rasterizeAvatarDetailsAlpha(
  details: AvatarDetailsV1 | null | undefined,
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null,
): Uint8Array {
  const normalized = normalizeAvatarDetails(details);
  const geometry = normalizeAvatarDetailsFaceGeometry(faceGeometry);
  const key = avatarDetailsMaskCacheKey(normalized, geometry);
  const cached = avatarDetailsAlphaCache.get(key);
  if (cached) return cached;

  const alpha = new Uint8Array(
    AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE,
  );
  const paintMask = decodeAvatarDetailsPaintMask(
    normalized.screen.paintMaskBase64,
  );
  if (paintMask) {
    for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
      for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
        if (avatarDetailsMaskPixel(paintMask, x, y))
          alpha[alphaIndex(x, y)] = 255;
      }
    }
  }
  for (const stamp of normalized.screen.stamps) {
    compositeResolvedAvatarDetailStamp(alpha, stamp, geometry);
  }
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (!avatarDetailsWritablePixel(x, y)) alpha[alphaIndex(x, y)] = 0;
    }
  }

  avatarDetailsAlphaCache.set(key, alpha);
  if (avatarDetailsAlphaCache.size > AVATAR_DETAILS_ALPHA_CACHE_LIMIT) {
    const oldestKey = avatarDetailsAlphaCache.keys().next().value;
    if (oldestKey !== undefined) avatarDetailsAlphaCache.delete(oldestKey);
  }
  return alpha;
}

export function normalizeAvatarDetailsColor(
  color: string | null | undefined,
): string {
  const raw = color?.trim() ?? "";
  const shortHex = /^#([0-9a-f]{3})$/i.exec(raw)?.[1];
  if (shortHex) {
    return `#${Array.from(shortHex, (part) => `${part}${part}`).join("")}`.toLowerCase();
  }
  const longHex = /^#([0-9a-f]{6})$/i.exec(raw)?.[1];
  return longHex ? `#${longHex.toLowerCase()}` : "#ffffff";
}

export function rasterizeAvatarDetailsRgba(
  details: AvatarDetailsV1 | null | undefined,
  color: string | null | undefined,
  faceGeometry?: Partial<AvatarDetailsFaceGeometry> | null,
): Uint8ClampedArray {
  const normalizedColor = normalizeAvatarDetailsColor(color);
  const colorValue = Number.parseInt(normalizedColor.slice(1), 16);
  const red = (colorValue >>> 16) & 255;
  const green = (colorValue >>> 8) & 255;
  const blue = colorValue & 255;
  const alpha = rasterizeAvatarDetailsAlpha(details, faceGeometry);
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let index = 0; index < alpha.length; index += 1) {
    const rgbaIndex = index * 4;
    rgba[rgbaIndex] = red;
    rgba[rgbaIndex + 1] = green;
    rgba[rgbaIndex + 2] = blue;
    rgba[rgbaIndex + 3] = alpha[index] ?? 0;
  }
  return rgba;
}

export function avatarDetailsPhosphorCoreRgba(
  glowRgba: Uint8ClampedArray,
): Uint8ClampedArray {
  const coreRgba = new Uint8ClampedArray(glowRgba);
  for (let index = 0; index < coreRgba.length; index += 4) {
    if ((coreRgba[index + 3] ?? 0) === 0) continue;
    coreRgba[index] = 255;
    coreRgba[index + 1] = 255;
    coreRgba[index + 2] = 255;
  }
  return coreRgba;
}
