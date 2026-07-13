import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AVATAR_DETAILS_CANVAS_SIZE,
  AVATAR_DETAILS_MASK_BASE64_LENGTH,
  AVATAR_DETAILS_MASK_BYTE_LENGTH,
  AVATAR_DETAILS_MAX_PAINT_PIXELS,
  AVATAR_DETAIL_STAMP_DEFINITIONS,
  avatarDetailStampBounds,
  avatarDetailsPhosphorCoreRgba,
  avatarDetailsGridPointFromClient,
  avatarDetailsMaskPixel,
  avatarDetailsPaintPixelCount,
  decodeAvatarDetailsPaintMask,
  encodeAvatarDetailsPaintMask,
  interpolateAvatarDetailsGridLine,
  paintAvatarDetailsMask,
  rasterizeAvatarDetailsAlpha,
  resolveAvatarDetailStampAnchor,
  replaceAvatarDetailStampForCategory,
  toggleAvatarDetailStamp,
  type AvatarDetailStampV1,
  type AvatarDetailsV1,
} from "./avatar-details.ts";

const emptyDetails = (): AvatarDetailsV1 => ({
  version: 1,
  screen: { stamps: [], paintMaskBase64: null },
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
