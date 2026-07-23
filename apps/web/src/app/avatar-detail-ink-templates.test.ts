import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  EMPTY_AVATAR_DETAILS,
  avatarDetailsInkRoleAt,
  avatarDetailsPaintColorPixelCount,
  avatarDetailsWithPaintColorMap,
  avatarDetailsWritablePixel,
  decodeAvatarDetailsPaintColorMap,
  flattenLegacyAvatarDetailStampsToInk,
  setAvatarDetailsInkRole,
  type AvatarDetailsInkRole,
  type AvatarDetailsV1,
} from "./avatar-details.ts";
import {
  applyAvatarDetailInkTemplate,
  avatarDetailInkTemplateStorageKey,
  createAvatarDetailInkTemplate,
  loadAvatarDetailInkTemplates,
  normalizeAvatarDetailInkTemplates,
  saveAvatarDetailInkTemplates,
} from "./avatar-detail-ink-templates.ts";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function detailsWithInk(
  points: readonly Readonly<{ x: number; y: number; role: AvatarDetailsInkRole }>[],
): AvatarDetailsV1 {
  const colorMap = new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
  for (const point of points) {
    setAvatarDetailsInkRole(colorMap, point.x, point.y, point.role);
  }
  return avatarDetailsWithPaintColorMap(EMPTY_AVATAR_DETAILS, colorMap);
}

test("creates a reusable template from user-authored semantic ink", () => {
  const template = createAvatarDetailInkTemplate(
    detailsWithInk([
      { x: 42, y: 37, role: "blink" },
      { x: 43, y: 37, role: "talking" },
      { x: 44, y: 38, role: "effect" },
    ]),
    "  My glasses  ",
    { id: "glasses", nowMs: 42 },
  );

  assert.ok(template);
  assert.equal(template.name, "My glasses");
  assert.equal(template.pixelCount, 3);
  assert.deepEqual(template.bounds, {
    left: 42,
    top: 37,
    right: 44,
    bottom: 38,
  });
  assert.deepEqual(normalizeAvatarDetailInkTemplates([template]), [template]);
});

test("places a template as ordinary erasable ink with its roles intact", () => {
  const template = createAvatarDetailInkTemplate(
    detailsWithInk([
      { x: 50, y: 50, role: "blink" },
      { x: 51, y: 50, role: "effect" },
    ]),
    "Brows",
    { id: "brows", nowMs: 42 },
  );
  assert.ok(template);

  const result = applyAvatarDetailInkTemplate(
    EMPTY_AVATAR_DETAILS,
    template,
    { offsetX: 7, offsetY: -3, scalePct: 100 },
  );
  const colorMap = decodeAvatarDetailsPaintColorMap(
    result.details.screen.paintColorMapBase64,
  );

  assert.equal(result.changed, true);
  assert.equal(result.limitReached, false);
  assert.equal(result.details.screen.stamps.length, 0);
  assert.ok(colorMap);
  assert.equal(avatarDetailsInkRoleAt(colorMap, 57, 47), "blink");
  assert.equal(avatarDetailsInkRoleAt(colorMap, 58, 47), "effect");
});

test("refuses a placement atomically when the authored-ink cap is full", () => {
  const destination = new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
  const reserved = { x: 64, y: 64 };
  let count = 0;
  for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
    for (let x = 0; x < AVATAR_DETAILS_CANVAS_SIZE; x += 1) {
      if (
        count >= AVATAR_DETAILS_MAX_PAINT_PIXELS ||
        (x === reserved.x && y === reserved.y) ||
        !avatarDetailsWritablePixel(x, y)
      ) {
        continue;
      }
      if (setAvatarDetailsInkRole(destination, x, y, "effect")) count += 1;
    }
  }
  assert.equal(count, AVATAR_DETAILS_MAX_PAINT_PIXELS);
  const destinationDetails = avatarDetailsWithPaintColorMap(
    EMPTY_AVATAR_DETAILS,
    destination,
  );
  const template = createAvatarDetailInkTemplate(
    detailsWithInk([{ ...reserved, role: "effect" }]),
    "Dot",
    { id: "dot", nowMs: 42 },
  );
  assert.ok(template);

  const result = applyAvatarDetailInkTemplate(
    destinationDetails,
    template,
    { offsetX: 0, offsetY: 0, scalePct: 100 },
  );

  assert.equal(result.changed, false);
  assert.equal(result.limitReached, true);
  assert.equal(
    result.details.screen.paintColorMapBase64,
    destinationDetails.screen.paintColorMapBase64,
  );
});

test("keeps saved ink libraries scoped to the signed-in owner", () => {
  const storage = new MemoryStorage();
  const template = createAvatarDetailInkTemplate(
    detailsWithInk([{ x: 64, y: 64, role: "effect" }]),
    "Dot",
    { id: "dot", nowMs: 42 },
  );
  assert.ok(template);

  saveAvatarDetailInkTemplates("one", [template], storage);

  assert.equal(loadAvatarDetailInkTemplates("one", storage).length, 1);
  assert.equal(loadAvatarDetailInkTemplates("two", storage).length, 0);
  assert.notEqual(
    avatarDetailInkTemplateStorageKey("one"),
    avatarDetailInkTemplateStorageKey("two"),
  );
});

test("flattens retired catalog decorations into effect ink without visual loss", () => {
  const legacy: AvatarDetailsV1 = {
    ...EMPTY_AVATAR_DETAILS,
    screen: {
      stamps: [
        {
          id: "round-glasses",
          offsetX: 0,
          offsetY: 0,
          scalePct: 100,
        },
      ],
      paintMaskBase64: null,
    },
  };

  const result = flattenLegacyAvatarDetailStampsToInk(legacy);
  const colorMap = decodeAvatarDetailsPaintColorMap(
    result.details.screen.paintColorMapBase64,
  );

  assert.equal(result.flattened, true);
  assert.equal(result.limitReached, false);
  assert.equal(result.details.screen.stamps.length, 0);
  assert.ok(colorMap);
  assert.ok(avatarDetailsPaintColorPixelCount(colorMap) > 0);
});
