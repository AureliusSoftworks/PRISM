import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_COLOR_MAP_BASE64_LENGTH,
  AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
  AVATAR_DETAILS_INK_ROLES,
  AVATAR_DETAILS_MASK_BASE64_LENGTH,
  AVATAR_DETAILS_MASK_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  AVATAR_DETAIL_STAMP_DEFINITIONS,
  avatarDetailsCirclePoints,
  avatarDetailStampBounds,
  avatarDetailsPhosphorCoreRgba,
  avatarDetailsGridPointFromClient,
  avatarDetailsEqual,
  avatarDetailsInkRoleAt,
  avatarDetailsMoveSelectionAt,
  avatarDetailsKey,
  avatarDetailsMaskPixel,
  avatarDetailsPaintPixelCount,
  avatarDetailsPaintColorPixelCount,
  avatarDetailsWithPaintColorMap,
  avatarDetailsWithSpeechInkAnimation,
  avatarDetailsWritablePixel,
  cloneAvatarDetails,
  decodeAvatarDetailsPaintMask,
  decodeAvatarDetailsPaintColorMap,
  encodeAvatarDetailsPaintMask,
  encodeAvatarDetailsPaintColorMap,
  interpolateAvatarDetailsGridLine,
  moveAvatarDetailsPaintMask,
  moveAvatarDetailsPaintColorMap,
  normalizeAvatarDetails,
  paintAvatarDetailsMask,
  paintAvatarDetailsColorMap,
  recolorAvatarDetailsPaintColorRegion,
  rasterizeAvatarDetailsAlpha,
  rasterizeVisibleAvatarDetailsRgba,
  resolveAvatarDetailStampAnchor,
  replaceAvatarDetailStampForCategory,
  removeAvatarDetailStamp,
  symmetrizeAvatarDetailsGridPoints,
  toggleAvatarDetailStamp,
  type AvatarDetailStampV1,
  type AvatarDetailsV1,
} from "./avatar-details.ts";

const emptyDetails = (): AvatarDetailsV1 => ({
  version: 1,
  screen: { stamps: [], paintMaskBase64: null },
});

describe("avatar details semantic ink", () => {
  it("stores mutually exclusive blink, talking, and effect roles", () => {
    const blank = new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
    const blink = paintAvatarDetailsColorMap(
      blank,
      [{ x: 60, y: 60 }],
      1,
      "blink",
    ).colorMap;
    const talking = paintAvatarDetailsColorMap(
      blink,
      [
        { x: 60, y: 60 },
        { x: 62, y: 60 },
      ],
      1,
      "talking",
    ).colorMap;
    const effect = paintAvatarDetailsColorMap(
      talking,
      [{ x: 64, y: 60 }],
      1,
      "effect",
    ).colorMap;

    assert.equal(avatarDetailsInkRoleAt(effect, 60, 60), "talking");
    assert.equal(avatarDetailsInkRoleAt(effect, 62, 60), "talking");
    assert.equal(avatarDetailsInkRoleAt(effect, 64, 60), "effect");
    assert.equal(avatarDetailsPaintColorPixelCount(effect), 3);
    const encoded = encodeAvatarDetailsPaintColorMap(effect);
    assert.equal(encoded?.length, AVATAR_DETAILS_COLOR_MAP_BASE64_LENGTH);
    assert.deepEqual(decodeAvatarDetailsPaintColorMap(encoded), effect);

    const details = avatarDetailsWithPaintColorMap(emptyDetails(), effect);
    assert.deepEqual(cloneAvatarDetails(details), details);
    assert.notEqual(avatarDetailsKey(emptyDetails()), avatarDetailsKey(details));
    assert.equal(avatarDetailsEqual(emptyDetails(), details), false);
  });

  it("keeps Speech ink animation independent through ink edits and cloning", () => {
    const animated = avatarDetailsWithSpeechInkAnimation(
      emptyDetails(),
      "wobble",
    );
    const colorMap = paintAvatarDetailsColorMap(
      new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH),
      [{ x: 64, y: 70 }],
      1,
      "talking",
    ).colorMap;
    const painted = avatarDetailsWithPaintColorMap(animated, colorMap);

    assert.equal(painted.screen.speechInkAnimation, "wobble");
    assert.equal(cloneAvatarDetails(painted).screen.speechInkAnimation, "wobble");
    assert.equal(
      avatarDetailsWithSpeechInkAnimation(painted, "none").screen
        .speechInkAnimation,
      undefined,
    );
  });

  it("migrates the old blink toggle into red semantic ink", () => {
    const legacyMask = paintAvatarDetailsMask(
      new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH),
      [{ x: 64, y: 60 }],
      1,
      "brush",
    ).mask;
    const migrated = normalizeAvatarDetails({
      version: 1,
      screen: {
        stamps: [],
        paintMaskBase64: encodeAvatarDetailsPaintMask(legacyMask),
        hideInkDuringBlink: true,
      },
    });
    const colorMap = decodeAvatarDetailsPaintColorMap(
      migrated.screen.paintColorMapBase64,
    );
    assert.ok(colorMap);
    assert.equal(avatarDetailsInkRoleAt(colorMap, 64, 60), "blink");
    assert.equal(migrated.screen.paintMaskBase64, null);
    assert.equal(migrated.screen.hideInkDuringBlink, undefined);
  });

  it("moves every semantic color together", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 60, y: 60 }],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;
    const moved = moveAvatarDetailsPaintColorMap(
      colorMap,
      { x: 3, y: 2 },
      AVATAR_DETAILS_INK_ROLES,
    );
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 63, 62), "blink");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 65, 62), "talking");
  });

  it("moves only the selected semantic ink layer", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 56, y: 60 }],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 68, y: 60 }],
      1,
      "effect",
    ).colorMap;

    const moved = moveAvatarDetailsPaintColorMap(
      colorMap,
      { x: 3, y: 2 },
      ["talking"],
    );

    assert.equal(moved.changed, true);
    assert.deepEqual(moved.offset, { x: 3, y: 2 });
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 56, 60), "blink");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 62, 60), null);
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 65, 62), "talking");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 68, 60), "effect");
  });

  it("clamps a selected layer before it overwrites stationary ink", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 60, y: 60 }],
      1,
      "talking",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "effect",
    ).colorMap;

    const moved = moveAvatarDetailsPaintColorMap(
      colorMap,
      { x: 4, y: 0 },
      ["talking"],
    );

    assert.deepEqual(moved.offset, { x: 1, y: 0 });
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 61, 60), "talking");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 62, 60), "effect");
  });

  it("moves any explicit combination of semantic ink layers together", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 56, y: 60 }],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 70, y: 60 }],
      1,
      "effect",
    ).colorMap;

    const moved = moveAvatarDetailsPaintColorMap(
      colorMap,
      { x: 2, y: 3 },
      ["blink", "talking"],
    );

    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 58, 63), "blink");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 64, 63), "talking");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 70, 60), "effect");
  });

  it("resolves Auto from the semantic layer under the drag origin", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 56, y: 60 }],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;

    assert.deepEqual(
      avatarDetailsMoveSelectionAt(colorMap, { x: 62, y: 60 }),
      ["talking"],
    );
    assert.deepEqual(
      avatarDetailsMoveSelectionAt(colorMap, { x: 80, y: 80 }),
      [],
    );
    const moved = moveAvatarDetailsPaintColorMap(
      colorMap,
      { x: 2, y: 0 },
      avatarDetailsMoveSelectionAt(colorMap, { x: 62, y: 60 }),
    );
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 56, 60), "blink");
    assert.equal(avatarDetailsInkRoleAt(moved.colorMap, 64, 60), "talking");
  });

  it("uses the paint bucket to recolor only the connected ink selection", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [
        { x: 60, y: 60 },
        { x: 61, y: 60 },
        { x: 61, y: 61 },
        { x: 62, y: 61 },
      ],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [
        { x: 64, y: 60 },
        { x: 63, y: 62 },
      ],
      1,
      "blink",
    ).colorMap;

    const recolored = recolorAvatarDetailsPaintColorRegion(
      colorMap,
      { x: 60, y: 60 },
      "effect",
    );

    assert.equal(recolored.changed, true);
    assert.equal(recolored.pixelCount, 4);
    assert.equal(avatarDetailsInkRoleAt(recolored.colorMap, 60, 60), "effect");
    assert.equal(avatarDetailsInkRoleAt(recolored.colorMap, 61, 61), "effect");
    assert.equal(avatarDetailsInkRoleAt(recolored.colorMap, 62, 60), "talking");
    assert.equal(avatarDetailsInkRoleAt(recolored.colorMap, 64, 60), "blink");
    assert.equal(avatarDetailsInkRoleAt(recolored.colorMap, 63, 62), "blink");
    assert.equal(
      avatarDetailsPaintColorPixelCount(recolored.colorMap),
      avatarDetailsPaintColorPixelCount(colorMap),
    );
  });

  it("keeps paint bucket clicks on blank or matching ink as no-ops", () => {
    const colorMap = paintAvatarDetailsColorMap(
      new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH),
      [{ x: 60, y: 60 }],
      1,
      "effect",
    ).colorMap;

    const blank = recolorAvatarDetailsPaintColorRegion(
      colorMap,
      { x: 61, y: 60 },
      "blink",
    );
    const matching = recolorAvatarDetailsPaintColorRegion(
      colorMap,
      { x: 60, y: 60 },
      "effect",
    );

    assert.deepEqual(blank, {
      colorMap,
      changed: false,
      pixelCount: 0,
    });
    assert.deepEqual(matching, {
      colorMap,
      changed: false,
      pixelCount: 0,
    });
  });

  it("uses erase ink as transparency for brush, line, and circle geometry", () => {
    const blank = new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
    const line = interpolateAvatarDetailsGridLine(
      { x: 58, y: 60 },
      { x: 62, y: 60 },
    );
    const paintedLine = paintAvatarDetailsColorMap(
      blank,
      line,
      1,
      "effect",
    ).colorMap;
    const erasedLine = paintAvatarDetailsColorMap(
      paintedLine,
      [
        { x: 59, y: 60 },
        { x: 60, y: 60 },
        { x: 61, y: 60 },
      ],
      1,
      "erase",
    );

    assert.equal(erasedLine.changed, true);
    assert.equal(erasedLine.limitReached, false);
    assert.equal(avatarDetailsInkRoleAt(erasedLine.colorMap, 58, 60), "effect");
    assert.equal(avatarDetailsInkRoleAt(erasedLine.colorMap, 60, 60), null);
    assert.equal(avatarDetailsInkRoleAt(erasedLine.colorMap, 62, 60), "effect");
    assert.equal(avatarDetailsPaintColorPixelCount(erasedLine.colorMap), 2);

    const circle = avatarDetailsCirclePoints(
      { x: 70, y: 70 },
      { x: 73, y: 70 },
    );
    const paintedCircle = paintAvatarDetailsColorMap(
      erasedLine.colorMap,
      circle,
      1,
      "talking",
    ).colorMap;
    const erasedCircle = paintAvatarDetailsColorMap(
      paintedCircle,
      circle,
      1,
      "erase",
    ).colorMap;
    assert.equal(
      circle.every(
        ({ x, y }) => avatarDetailsInkRoleAt(erasedCircle, x, y) === null,
      ),
      true,
    );
  });

  it("uses erase ink with the bucket without crossing disconnected regions", () => {
    const blank = new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH);
    const painted = paintAvatarDetailsColorMap(
      blank,
      [
        { x: 60, y: 60 },
        { x: 61, y: 60 },
        { x: 61, y: 61 },
        { x: 64, y: 60 },
      ],
      1,
      "blink",
    ).colorMap;

    const erased = recolorAvatarDetailsPaintColorRegion(
      painted,
      { x: 60, y: 60 },
      "erase",
    );

    assert.equal(erased.changed, true);
    assert.equal(erased.pixelCount, 3);
    assert.equal(avatarDetailsInkRoleAt(erased.colorMap, 60, 60), null);
    assert.equal(avatarDetailsInkRoleAt(erased.colorMap, 61, 61), null);
    assert.equal(avatarDetailsInkRoleAt(erased.colorMap, 64, 60), "blink");
    assert.equal(avatarDetailsPaintColorPixelCount(erased.colorMap), 1);
  });

  it("paints and erases vertically mirrored pixel pairs together", () => {
    const symmetricPoints = symmetrizeAvatarDetailsGridPoints([
      { x: 48, y: 54 },
    ]);
    const painted = paintAvatarDetailsColorMap(
      new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH),
      symmetricPoints,
      1,
      "effect",
    ).colorMap;
    assert.equal(avatarDetailsInkRoleAt(painted, 48, 54), "effect");
    assert.equal(avatarDetailsInkRoleAt(painted, 79, 54), "effect");

    const erased = paintAvatarDetailsColorMap(
      painted,
      symmetricPoints,
      1,
      "erase",
    ).colorMap;
    assert.equal(avatarDetailsInkRoleAt(erased, 48, 54), null);
    assert.equal(avatarDetailsInkRoleAt(erased, 79, 54), null);
  });

  it("merges every visible role into one runtime phosphor emission plane", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 60, y: 60 }],
      1,
      "blink",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 62, y: 60 }],
      1,
      "talking",
    ).colorMap;
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [{ x: 64, y: 60 }],
      1,
      "effect",
    ).colorMap;
    const details = avatarDetailsWithPaintColorMap(emptyDetails(), colorMap);
    const alphaAt = (rgba: Uint8ClampedArray, x: number): number =>
      rgba[(60 * AVATAR_DETAILS_CANVAS_SIZE + x) * 4 + 3] ?? 0;

    const idle = rasterizeVisibleAvatarDetailsRgba(
      details,
      "#f0c020",
      null,
      { blinking: false, talking: false },
    );
    assert.deepEqual(
      [alphaAt(idle, 60), alphaAt(idle, 62), alphaAt(idle, 64)],
      [255, 255, 255],
    );

    const blinkingAndTalking = rasterizeVisibleAvatarDetailsRgba(
      details,
      "#f0c020",
      null,
      { blinking: true, talking: true },
    );
    assert.deepEqual(
      [
        alphaAt(blinkingAndTalking, 60),
        alphaAt(blinkingAndTalking, 62),
        alphaAt(blinkingAndTalking, 64),
      ],
      [0, 0, 255],
    );
  });

  it("keeps all authored paint above the face while preserving legacy beard depth", () => {
    let colorMap: Uint8Array = new Uint8Array(
      AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH,
    );
    colorMap = paintAvatarDetailsColorMap(
      colorMap,
      [
        { x: 64, y: 60 },
        { x: 64, y: 75 },
        { x: 64, y: 88 },
      ],
      1,
      "effect",
    ).colorMap;
    const paintedDetails = avatarDetailsWithPaintColorMap(
      emptyDetails(),
      colorMap,
    );
    const paintedAbove = rasterizeAvatarDetailsAlpha(
      paintedDetails,
      null,
      "all",
      "above-face",
    );
    const paintedBehind = rasterizeAvatarDetailsAlpha(
      paintedDetails,
      null,
      "all",
      "behind-face",
    );
    const alphaAt = (alpha: Uint8Array, x: number, y: number): number =>
      alpha[y * AVATAR_DETAILS_CANVAS_SIZE + x] ?? 0;

    assert.equal(alphaAt(paintedAbove, 64, 60), 255);
    assert.equal(alphaAt(paintedAbove, 64, 75), 255);
    assert.equal(alphaAt(paintedAbove, 64, 88), 255);
    assert.equal(alphaAt(paintedBehind, 64, 60), 0);
    assert.equal(alphaAt(paintedBehind, 64, 75), 0);
    assert.equal(alphaAt(paintedBehind, 64, 88), 0);

    const mustacheDetails: AvatarDetailsV1 = {
      version: 1,
      screen: {
        stamps: [
          {
            id: "straight-mustache",
            offsetX: 0,
            offsetY: 0,
            scalePct: 100,
          },
        ],
        paintMaskBase64: null,
      },
    };
    const beardDetails: AvatarDetailsV1 = {
      version: 1,
      screen: {
        stamps: [
          {
            id: "short-beard",
            offsetX: 0,
            offsetY: 0,
            scalePct: 100,
          },
        ],
        paintMaskBase64: null,
      },
    };
    assert.equal(
      rasterizeAvatarDetailsAlpha(
        mustacheDetails,
        null,
        "all",
        "above-face",
      ).some((alpha) => alpha > 0),
      true,
    );
    assert.equal(
      rasterizeAvatarDetailsAlpha(
        mustacheDetails,
        null,
        "all",
        "behind-face",
      ).some((alpha) => alpha > 0),
      false,
    );
    assert.equal(
      rasterizeAvatarDetailsAlpha(
        beardDetails,
        null,
        "all",
        "behind-face",
      ).some((alpha) => alpha > 0),
      true,
    );
  });
});

describe("avatar details packed paint mask", () => {
  it("encodes 128x128 bits row-major and MSB-first", () => {
    const mask = new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
    const row50Byte = (50 * AVATAR_DETAILS_CANVAS_SIZE + 24) >>> 3;
    const row51Byte = (51 * AVATAR_DETAILS_CANVAS_SIZE + 24) >>> 3;
    mask[row50Byte] = 0b10000001;
    mask[row51Byte] = 0b01000000;

    const encoded = encodeAvatarDetailsPaintMask(mask);
    assert.equal(encoded?.length, AVATAR_DETAILS_MASK_BASE64_LENGTH);
    assert.equal(encoded?.endsWith("="), true);

    const decoded = decodeAvatarDetailsPaintMask(encoded);
    assert.ok(decoded);
    assert.equal(decoded.length, 2_048);
    assert.equal(avatarDetailsMaskPixel(decoded, 24, 50), true);
    assert.equal(avatarDetailsMaskPixel(decoded, 31, 50), true);
    assert.equal(avatarDetailsMaskPixel(decoded, 25, 51), true);
    assert.equal(avatarDetailsMaskPixel(decoded, 26, 51), false);
  });

  it("uses null as the canonical empty mask and rejects malformed input", () => {
    assert.equal(
      encodeAvatarDetailsPaintMask(
        new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH),
      ),
      null,
    );
    assert.equal(decodeAvatarDetailsPaintMask("not-a-mask"), null);
  });

  it("stops painting exactly at the 40 percent cap", () => {
    let mask: Uint8Array = new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
    let limitReached = false;
    for (let y = 0; y < AVATAR_DETAILS_CANVAS_SIZE; y += 1) {
      const points = Array.from(
        { length: AVATAR_DETAILS_CANVAS_SIZE },
        (_, x) => ({
          x,
          y,
        }),
      );
      const result = paintAvatarDetailsMask(mask, points, 1, "brush");
      mask = result.mask;
      limitReached ||= result.limitReached;
    }
    assert.equal(
      avatarDetailsPaintPixelCount(mask),
      AVATAR_DETAILS_MAX_PAINT_PIXELS,
    );
    assert.equal(limitReached, true);
  });
});

describe("avatar details input geometry", () => {
  it("mirrors ink across the vertical seam without duplicating paired pixels", () => {
    assert.deepEqual(
      symmetrizeAvatarDetailsGridPoints([
        { x: 12, y: 34 },
        { x: 115, y: 34 },
        { x: 63, y: 20 },
      ]),
      [
        { x: 12, y: 34 },
        { x: 115, y: 34 },
        { x: 63, y: 20 },
        { x: 64, y: 20 },
      ],
    );
  });

  it("moves the vertical symmetry seam in half-pixel steps", () => {
    assert.deepEqual(
      symmetrizeAvatarDetailsGridPoints([{ x: 20, y: 34 }], 30.5),
      [
        { x: 20, y: 34 },
        { x: 41, y: 34 },
      ],
    );
    assert.deepEqual(
      symmetrizeAvatarDetailsGridPoints([{ x: 100, y: 34 }], 10.5),
      [{ x: 100, y: 34 }],
    );
  });

  it("maps pointer movement into the canonical front-facing grid", () => {
    const bounds = { left: 100, top: 50, width: 256, height: 256 };
    assert.deepEqual(avatarDetailsGridPointFromClient(164, 178, bounds), {
      x: 32,
      y: 64,
    });
    assert.deepEqual(avatarDetailsGridPointFromClient(292, 178, bounds), {
      x: 96,
      y: 64,
    });
    assert.ok(
      avatarDetailsGridPointFromClient(164, 178, bounds).x <
        avatarDetailsGridPointFromClient(292, 178, bounds).x,
    );
  });

  it("interpolates every pixel between sparse pointer samples", () => {
    assert.deepEqual(
      interpolateAvatarDetailsGridLine({ x: 2, y: 3 }, { x: 7, y: 3 }),
      [
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
        { x: 7, y: 3 },
      ],
    );
    const diagonal = interpolateAvatarDetailsGridLine(
      { x: 2, y: 2 },
      { x: 5, y: 5 },
    );
    assert.deepEqual(diagonal, [
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ]);
  });

  it("rasterizes a crisp circle from a center and dragged radius", () => {
    const points = avatarDetailsCirclePoints(
      { x: 64, y: 64 },
      { x: 68, y: 64 },
    );
    const keys = new Set(points.map(({ x, y }) => `${x}:${y}`));
    assert.equal(keys.has("68:64"), true);
    assert.equal(keys.has("60:64"), true);
    assert.equal(keys.has("64:68"), true);
    assert.equal(keys.has("64:60"), true);
    assert.equal(keys.has("64:64"), false);
    assert.deepEqual(
      avatarDetailsCirclePoints({ x: 8, y: 9 }, { x: 8, y: 9 }),
      [{ x: 8, y: 9 }],
    );
  });

  it("moves the whole ink mask without dropping pixels at the writable edge", () => {
    const source = new Uint8Array(AVATAR_DETAILS_MASK_BYTE_LENGTH);
    const painted = paintAvatarDetailsMask(
      source,
      [
        { x: 60, y: 60 },
        { x: 61, y: 60 },
      ],
      1,
      "brush",
    ).mask;
    const moved = moveAvatarDetailsPaintMask(painted, { x: 5, y: 3 });
    assert.equal(moved.changed, true);
    assert.deepEqual(moved.offset, { x: 5, y: 3 });
    assert.equal(avatarDetailsMaskPixel(moved.mask, 65, 63), true);
    assert.equal(avatarDetailsMaskPixel(moved.mask, 66, 63), true);
    assert.equal(avatarDetailsPaintPixelCount(moved.mask), 2);

    let rightEdge = AVATAR_DETAILS_CANVAS_SIZE - 1;
    while (!avatarDetailsWritablePixel(rightEdge, 64)) rightEdge -= 1;
    const edgeMask = paintAvatarDetailsMask(
      source,
      [{ x: rightEdge, y: 64 }],
      1,
      "brush",
    ).mask;
    const blocked = moveAvatarDetailsPaintMask(edgeMask, { x: 10, y: 0 });
    assert.equal(blocked.changed, false);
    assert.deepEqual(blocked.offset, { x: 0, y: 0 });
    assert.equal(avatarDetailsMaskPixel(blocked.mask, rightEdge, 64), true);
    assert.equal(avatarDetailsPaintPixelCount(blocked.mask), 1);
  });

  it("keeps every smart anchor in bounds at max scale and offset", () => {
    for (const definition of AVATAR_DETAIL_STAMP_DEFINITIONS) {
      for (const offsetX of [-16, 16]) {
        for (const offsetY of [-16, 16]) {
          const bounds = avatarDetailStampBounds({
            id: definition.id,
            offsetX,
            offsetY,
            scalePct: 120,
          });
          assert.ok(bounds.left >= 0, `${definition.id} left`);
          assert.ok(bounds.top >= 0, `${definition.id} top`);
          assert.ok(bounds.right <= 128, `${definition.id} right`);
          assert.ok(bounds.bottom <= 128, `${definition.id} bottom`);
        }
      }
    }
  });

  it("replaces stamps only inside their smart-anchor slot", () => {
    const glasses: AvatarDetailStampV1 = {
      id: "round-glasses",
      offsetX: 0,
      offsetY: 0,
      scalePct: 100,
    };
    const beard: AvatarDetailStampV1 = {
      id: "short-beard",
      offsetX: 0,
      offsetY: 0,
      scalePct: 100,
    };
    const square: AvatarDetailStampV1 = {
      id: "square-glasses",
      offsetX: 2,
      offsetY: -1,
      scalePct: 110,
    };
    const withTwo = replaceAvatarDetailStampForCategory(
      replaceAvatarDetailStampForCategory(emptyDetails(), "eyewear", glasses),
      "facial-hair",
      beard,
    );
    const replaced = replaceAvatarDetailStampForCategory(
      withTwo,
      "eyewear",
      square,
    );
    assert.deepEqual(replaced.screen.stamps, [square, beard]);
  });

  it("allows two canonical marking slots but refuses a third", () => {
    const first = toggleAvatarDetailStamp(emptyDetails(), "freckles");
    const second = toggleAvatarDetailStamp(first, "diagonal-scar");
    const capped = toggleAvatarDetailStamp(second, "circuit-mark");
    assert.deepEqual(
      second.screen.stamps.map((stamp) => stamp.id),
      ["freckles", "diagonal-scar"],
    );
    assert.deepEqual(capped, second);
  });

  it("removes one accessory without disturbing other stamps or screen ink", () => {
    const colorMap = paintAvatarDetailsColorMap(
      new Uint8Array(AVATAR_DETAILS_COLOR_MAP_BYTE_LENGTH),
      [{ x: 64, y: 64 }],
      1,
      "effect",
    ).colorMap;
    const withInk = avatarDetailsWithPaintColorMap(
      toggleAvatarDetailStamp(
        toggleAvatarDetailStamp(emptyDetails(), "round-glasses"),
        "diagonal-scar",
      ),
      colorMap,
    );

    const removed = removeAvatarDetailStamp(withInk, "round-glasses");

    assert.deepEqual(
      removed.screen.stamps.map((stamp) => stamp.id),
      ["diagonal-scar"],
    );
    assert.equal(
      removed.screen.paintColorMapBase64,
      withInk.screen.paintColorMapBase64,
    );
  });
});

describe("avatar details deterministic raster", () => {
  it("keeps alpha intact while making the phosphor core white", () => {
    const glow = new Uint8ClampedArray([
      80, 120, 240, 0, 80, 120, 240, 96, 80, 120, 240, 255,
    ]);
    const core = avatarDetailsPhosphorCoreRgba(glow);
    assert.deepEqual(
      Array.from(core),
      [80, 120, 240, 0, 255, 255, 255, 96, 255, 255, 255, 255],
    );
    assert.deepEqual(
      Array.from(glow),
      [80, 120, 240, 0, 80, 120, 240, 96, 80, 120, 240, 255],
    );
  });

  it("caches identical nearest-neighbor alpha masks", () => {
    const details: AvatarDetailsV1 = {
      version: 1,
      screen: {
        stamps: [
          { id: "round-glasses", offsetX: 0, offsetY: 0, scalePct: 100 },
          { id: "freckles", offsetX: 0, offsetY: 0, scalePct: 100 },
        ],
        paintMaskBase64: null,
      },
    };
    const first = rasterizeAvatarDetailsAlpha(details);
    const second = rasterizeAvatarDetailsAlpha({
      ...details,
      screen: {
        ...details.screen,
        stamps: details.screen.stamps.map((stamp) => ({ ...stamp })),
      },
    });
    assert.equal(first, second);
    assert.ok(first.some((alpha) => alpha > 0));
  });

  it("moves and scales eyewear with eyes while rotating facial hair with the mouth", () => {
    const glasses: AvatarDetailStampV1 = {
      id: "round-glasses",
      offsetX: 2,
      offsetY: -1,
      scalePct: 100,
    };
    const beard: AvatarDetailStampV1 = {
      id: "short-beard",
      offsetX: 0,
      offsetY: 0,
      scalePct: 100,
    };
    assert.deepEqual(resolveAvatarDetailStampAnchor(glasses), {
      centerX: 66,
      centerY: 47,
      anchorScale: 1,
      rotationDeg: 0,
    });
    const moved = resolveAvatarDetailStampAnchor(glasses, {
      eyeScale: 1.2,
      eyeOffsetX: 0.1,
      eyeOffsetY: -0.05,
    });
    assert.equal(moved.centerX, 72.4);
    assert.equal(moved.centerY, 43.8);
    assert.equal(moved.anchorScale, 1.2);
    const mouth = resolveAvatarDetailStampAnchor(beard, {
      mouthScale: 1.3,
      mouthOffsetX: -0.1,
      mouthOffsetY: 0.05,
      mouthRotationDeg: 35,
    });
    assert.equal(mouth.centerX, 57.6);
    assert.equal(mouth.centerY, 91.2);
    assert.equal(mouth.anchorScale, 1.3);
    assert.equal(mouth.rotationDeg, 35);
  });
});
