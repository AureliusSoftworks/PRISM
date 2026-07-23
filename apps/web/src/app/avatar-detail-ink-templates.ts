import {
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  AVATAR_DETAILS_INK_ROLE_COLORS,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  avatarDetailsInkRoleAt,
  avatarDetailsPaintColorPixelCount,
  avatarDetailsWithPaintColorMap,
  avatarDetailsWritablePixel,
  decodeAvatarDetailsPaintColorMap,
  encodeAvatarDetailsPaintColorMap,
  normalizeAvatarDetails,
  setAvatarDetailsInkRole,
  type AvatarDetailsGridPoint,
  type AvatarDetailsInkRole,
  type AvatarDetailsV1,
} from "./avatar-details.ts";

export const AVATAR_DETAIL_INK_TEMPLATE_VERSION = 1;
export const AVATAR_DETAIL_INK_TEMPLATE_LIMIT = 24;
export const AVATAR_DETAIL_INK_TEMPLATE_NAME_MAX_LENGTH = 40;
export const AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN = -64;
export const AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX = 64;
export const AVATAR_DETAIL_INK_TEMPLATE_SCALE_MIN = 50;
export const AVATAR_DETAIL_INK_TEMPLATE_SCALE_MAX = 200;

const AVATAR_DETAIL_INK_TEMPLATE_STORAGE_PREFIX =
  "prism_avatar_detail_ink_templates_v1";

export interface AvatarDetailInkTemplateBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AvatarDetailInkTemplateV1 {
  version: typeof AVATAR_DETAIL_INK_TEMPLATE_VERSION;
  id: string;
  name: string;
  paintColorMapBase64: string;
  bounds: AvatarDetailInkTemplateBounds;
  pixelCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AvatarDetailInkTemplateTransform {
  offsetX: number;
  offsetY: number;
  scalePct: number;
}

export interface ApplyAvatarDetailInkTemplateResult {
  details: AvatarDetailsV1;
  changed: boolean;
  limitReached: boolean;
  appliedPixelCount: number;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizedTemplateName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, AVATAR_DETAIL_INK_TEMPLATE_NAME_MAX_LENGTH);
}

function normalizedTemplateId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function inkTemplateBounds(
  colorMap: Uint8Array,
): AvatarDetailInkTemplateBounds | null {
  let left = AVATAR_DETAILS_CANVAS_SIZE;
  let top = AVATAR_DETAILS_CANVAS_SIZE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (!avatarDetailsInkRoleAt(colorMap, x, y)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left || bottom < top ? null : { left, top, right, bottom };
}

function generatedTemplateId(nowMs: number): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `ink-${nowMs.toString(36)}-${randomPart}`;
}

export function avatarDetailInkTemplateStorageKey(ownerId: string): string {
  return `${AVATAR_DETAIL_INK_TEMPLATE_STORAGE_PREFIX}:${encodeURIComponent(
    ownerId.trim() || "local",
  )}`;
}

export function normalizeAvatarDetailInkTemplates(
  value: unknown,
): AvatarDetailInkTemplateV1[] {
  if (!Array.isArray(value)) return [];
  const templates: AvatarDetailInkTemplateV1[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    if (record.version !== AVATAR_DETAIL_INK_TEMPLATE_VERSION) continue;
    const id = normalizedTemplateId(record.id);
    const name = normalizedTemplateName(record.name);
    if (!id || !name || seenIds.has(id)) continue;
    const encoded =
      typeof record.paintColorMapBase64 === "string"
        ? record.paintColorMapBase64
        : "";
    const colorMap = decodeAvatarDetailsPaintColorMap(encoded);
    if (!colorMap) continue;
    const pixelCount = avatarDetailsPaintColorPixelCount(colorMap);
    const bounds = inkTemplateBounds(colorMap);
    if (!bounds || pixelCount === 0) continue;
    const createdAtMs = finiteTimestamp(record.createdAtMs, 0);
    const updatedAtMs = finiteTimestamp(record.updatedAtMs, createdAtMs);
    templates.push({
      version: AVATAR_DETAIL_INK_TEMPLATE_VERSION,
      id,
      name,
      paintColorMapBase64: encoded,
      bounds,
      pixelCount,
      createdAtMs,
      updatedAtMs,
    });
    seenIds.add(id);
    if (templates.length >= AVATAR_DETAIL_INK_TEMPLATE_LIMIT) break;
  }
  return templates;
}

export function loadAvatarDetailInkTemplates(
  ownerId: string,
  storage: Storage,
): AvatarDetailInkTemplateV1[] {
  try {
    const raw = storage.getItem(avatarDetailInkTemplateStorageKey(ownerId));
    return normalizeAvatarDetailInkTemplates(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function saveAvatarDetailInkTemplates(
  ownerId: string,
  templates: readonly AvatarDetailInkTemplateV1[],
  storage: Storage,
): AvatarDetailInkTemplateV1[] {
  const normalized = normalizeAvatarDetailInkTemplates(templates);
  storage.setItem(
    avatarDetailInkTemplateStorageKey(ownerId),
    JSON.stringify(normalized),
  );
  return normalized;
}

export function createAvatarDetailInkTemplate(
  details: AvatarDetailsV1,
  name: string,
  options: Readonly<{ id?: string; nowMs?: number }> = {},
): AvatarDetailInkTemplateV1 | null {
  const normalizedName = normalizedTemplateName(name);
  if (!normalizedName) return null;
  const normalizedDetails = normalizeAvatarDetails(details);
  const colorMap = decodeAvatarDetailsPaintColorMap(
    normalizedDetails.screen.paintColorMapBase64,
  );
  if (!colorMap) return null;
  const paintColorMapBase64 = encodeAvatarDetailsPaintColorMap(colorMap);
  const bounds = inkTemplateBounds(colorMap);
  const pixelCount = avatarDetailsPaintColorPixelCount(colorMap);
  if (!paintColorMapBase64 || !bounds || pixelCount === 0) return null;
  const nowMs = finiteTimestamp(options.nowMs, Date.now());
  return {
    version: AVATAR_DETAIL_INK_TEMPLATE_VERSION,
    id: normalizedTemplateId(options.id) || generatedTemplateId(nowMs),
    name: normalizedName,
    paintColorMapBase64,
    bounds,
    pixelCount,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export function renameAvatarDetailInkTemplate(
  template: AvatarDetailInkTemplateV1,
  name: string,
  nowMs = Date.now(),
): AvatarDetailInkTemplateV1 {
  const normalizedName = normalizedTemplateName(name);
  return {
    ...template,
    name: normalizedName || template.name,
    updatedAtMs: finiteTimestamp(nowMs, Date.now()),
  };
}

export function applyAvatarDetailInkTemplate(
  details: AvatarDetailsV1,
  template: AvatarDetailInkTemplateV1,
  transform: AvatarDetailInkTemplateTransform,
): ApplyAvatarDetailInkTemplateResult {
  const normalizedDetails = normalizeAvatarDetails(details);
  const destination =
    decodeAvatarDetailsPaintColorMap(
      normalizedDetails.screen.paintColorMapBase64,
    ) ?? new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
  const source = decodeAvatarDetailsPaintColorMap(
    template.paintColorMapBase64,
  );
  if (!source) {
    return {
      details: normalizedDetails,
      changed: false,
      limitReached: false,
      appliedPixelCount: 0,
    };
  }

  const scale =
    clampInteger(
      transform.scalePct,
      AVATAR_DETAIL_INK_TEMPLATE_SCALE_MIN,
      AVATAR_DETAIL_INK_TEMPLATE_SCALE_MAX,
    ) / 100;
  const offset: AvatarDetailsGridPoint = {
    x: clampInteger(
      transform.offsetX,
      AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN,
      AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX,
    ),
    y: clampInteger(
      transform.offsetY,
      AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MIN,
      AVATAR_DETAIL_INK_TEMPLATE_OFFSET_MAX,
    ),
  };
  const sourceCenterX = (template.bounds.left + template.bounds.right) / 2;
  const sourceCenterY = (template.bounds.top + template.bounds.bottom) / 2;
  const targetCenterX = sourceCenterX + offset.x;
  const targetCenterY = sourceCenterY + offset.y;
  const targetLeft = Math.floor(
    targetCenterX + (template.bounds.left - sourceCenterX) * scale,
  );
  const targetRight = Math.ceil(
    targetCenterX + (template.bounds.right - sourceCenterX) * scale,
  );
  const targetTop = Math.floor(
    targetCenterY + (template.bounds.top - sourceCenterY) * scale,
  );
  const targetBottom = Math.ceil(
    targetCenterY + (template.bounds.bottom - sourceCenterY) * scale,
  );
  const targetRoles = new Map<number, AvatarDetailsInkRole>();
  for (let y = targetTop; y <= targetBottom; y += 1) {
    for (let x = targetLeft; x <= targetRight; x += 1) {
      if (!avatarDetailsWritablePixel(x, y)) continue;
      const sourceX = Math.round(
        sourceCenterX + (x - targetCenterX) / scale,
      );
      const sourceY = Math.round(
        sourceCenterY + (y - targetCenterY) / scale,
      );
      const role = avatarDetailsInkRoleAt(source, sourceX, sourceY);
      if (!role) continue;
      targetRoles.set(y * AVATAR_DETAILS_CANVAS_SIZE + x, role);
    }
  }

  let newPixelCount = 0;
  for (const index of targetRoles.keys()) {
    const x = index % AVATAR_DETAILS_CANVAS_SIZE;
    const y = Math.floor(index / AVATAR_DETAILS_CANVAS_SIZE);
    if (avatarDetailsInkRoleAt(destination, x, y) === null) {
      newPixelCount += 1;
    }
  }
  if (
    avatarDetailsPaintColorPixelCount(destination) + newPixelCount >
    AVATAR_DETAILS_MAX_PAINT_PIXELS
  ) {
    return {
      details: normalizedDetails,
      changed: false,
      limitReached: true,
      appliedPixelCount: 0,
    };
  }

  let changed = false;
  for (const [index, role] of targetRoles) {
    const x = index % AVATAR_DETAILS_CANVAS_SIZE;
    const y = Math.floor(index / AVATAR_DETAILS_CANVAS_SIZE);
    changed = setAvatarDetailsInkRole(destination, x, y, role) || changed;
  }
  return {
    details: changed
      ? avatarDetailsWithPaintColorMap(normalizedDetails, destination)
      : normalizedDetails,
    changed,
    limitReached: false,
    appliedPixelCount: targetRoles.size,
  };
}

export function rasterizeAvatarDetailInkTemplateRgba(
  template: AvatarDetailInkTemplateV1,
): Uint8ClampedArray {
  const colorMap =
    decodeAvatarDetailsPaintColorMap(template.paintColorMapBase64) ??
    new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
  const rgba = new Uint8ClampedArray(
    AVATAR_DETAILS_CANVAS_SIZE * AVATAR_DETAILS_CANVAS_SIZE * 4,
  );
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      const role = avatarDetailsInkRoleAt(colorMap, x, y);
      if (!role) continue;
      const color = AVATAR_DETAILS_INK_ROLE_COLORS[role];
      const colorValue = Number.parseInt(color.slice(1), 16);
      const rgbaIndex = (y * AVATAR_DETAILS_CANVAS_SIZE + x) * 4;
      rgba[rgbaIndex] = (colorValue >>> 16) & 255;
      rgba[rgbaIndex + 1] = (colorValue >>> 8) & 255;
      rgba[rgbaIndex + 2] = colorValue & 255;
      rgba[rgbaIndex + 3] = 255;
    }
  }
  return rgba;
}
