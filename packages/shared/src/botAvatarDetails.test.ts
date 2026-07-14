import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS,
  BOT_AVATAR_DETAILS_MAX_JSON_BYTES,
  BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH,
  BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH,
  BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT,
  BOT_AVATAR_DETAIL_STAMP_CATALOG,
  BOT_AVATAR_DETAIL_STAMP_IDS,
  decodeBotAvatarDetailsPaintMask,
  encodeBotAvatarDetailsPaintMask,
  isBotAvatarDetailStampTransformInsideCanvas,
  isBotAvatarDetailsWritablePixel,
  parseBotAvatarDetailsV1,
  parseStoredBotAvatarDetailsV1,
  serializeBotAvatarDetailsV1,
} from "./botAvatarDetails.ts";

function details(stamps: unknown[] = [], paintMaskBase64: string | null = null) {
  return { version: 1, screen: { stamps, paintMaskBase64 } };
}

function stamp(id: string, offsetX = 0, offsetY = 0, scalePct = 100) {
  return { id, offsetX, offsetY, scalePct };
}

function bytesWithSetBitCount(count: number): Uint8Array {
  const bytes = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH);
  let remaining = count;
  for (let y = 0; y < 128 && remaining > 0; y += 1) {
    for (let x = 0; x < 128 && remaining > 0; x += 1) {
      if (!isBotAvatarDetailsWritablePixel(x, y)) continue;
      const index = y * 128 + x;
      bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
      remaining -= 1;
    }
  }
  return bytes;
}

describe("BotAvatarDetailsV1", () => {
  it("publishes the exact 12-stamp allowlist and canonical geometry", () => {
    assert.deepEqual(BOT_AVATAR_DETAIL_STAMP_IDS, [
      "round-glasses",
      "square-glasses",
      "visor",
      "monocle",
      "handlebar-mustache",
      "straight-mustache",
      "short-beard",
      "goatee",
      "freckles",
      "diagonal-scar",
      "cheek-stripes",
      "circuit-mark",
    ]);
    assert.equal(BOT_AVATAR_DETAIL_STAMP_CATALOG.length, 12);
  });

  it("accepts one eyewear, one facial-hair, and two marking stamps", () => {
    assert.deepEqual(
      parseBotAvatarDetailsV1(
        details([
          stamp("circuit-mark", -16, 16, 120),
          stamp("goatee", 16, -16, 80),
          stamp("round-glasses"),
          stamp("freckles"),
        ])
      ).screen.stamps.map(({ id }) => id),
      ["round-glasses", "goatee", "freckles", "circuit-mark"]
    );
  });

  it("keeps legacy screens unchanged and persists only an opted-in blink ink setting", () => {
    const legacy = details([stamp("freckles")]);
    assert.deepEqual(parseBotAvatarDetailsV1(legacy), legacy);

    assert.deepEqual(
      parseBotAvatarDetailsV1({
        ...legacy,
        screen: { ...legacy.screen, hideInkDuringBlink: true },
      }).screen,
      {
        stamps: [stamp("freckles")],
        paintMaskBase64: null,
        hideInkDuringBlink: true,
      }
    );

    assert.deepEqual(
      parseBotAvatarDetailsV1({
        ...legacy,
        screen: { ...legacy.screen, hideInkDuringBlink: false },
      }),
      legacy
    );
  });

  it("rejects invalid blink ink settings and unknown screen keys", () => {
    assert.throws(
      () =>
        parseBotAvatarDetailsV1({
          ...details(),
          screen: { ...details().screen, hideInkDuringBlink: "yes" },
        }),
      /hideInkDuringBlink must be a boolean/i
    );
    assert.throws(
      () =>
        parseBotAvatarDetailsV1({
          ...details(),
          screen: { ...details().screen, hideInkDuringBlink: true, extra: true },
        }),
      /contain exactly/i
    );
  });

  it("rejects non-v1, extra keys, rotation, unknown stamps, and invalid transforms", () => {
    assert.throws(
      () => parseBotAvatarDetailsV1({ ...details(), version: 2 }),
      /version must be 1/i
    );
    assert.throws(
      () => parseBotAvatarDetailsV1({ ...details(), extra: true }),
      /contain exactly/i
    );
    assert.throws(
      () =>
        parseBotAvatarDetailsV1(
          details([{ ...stamp("visor"), rotation: 0 }])
        ),
      /exactly id, offsetX, offsetY, and scalePct/i
    );
    assert.throws(
      () => parseBotAvatarDetailsV1(details([stamp("aviators")])),
      /not allowlisted/i
    );
    assert.throws(
      () => parseBotAvatarDetailsV1(details([stamp("visor", 1.5)])),
      /must be an integer/i
    );
    assert.throws(
      () => parseBotAvatarDetailsV1(details([stamp("visor", 17)])),
      /-16 through 16/i
    );
    assert.throws(
      () => parseBotAvatarDetailsV1(details([stamp("visor", 0, 0, 121)])),
      /80 through 120/i
    );
  });

  it("rejects stamp geometry that would extend outside the 128px canvas", () => {
    const edgeDefinition = {
      id: "synthetic-edge",
      category: "marking" as const,
      centerX: 8,
      centerY: 64,
      baseWidth: 24,
      baseHeight: 24,
    };
    assert.equal(
      isBotAvatarDetailStampTransformInsideCanvas(edgeDefinition, {
        offsetX: 0,
        offsetY: 0,
        scalePct: 100,
      }),
      false
    );
    assert.equal(
      isBotAvatarDetailStampTransformInsideCanvas(
        BOT_AVATAR_DETAIL_STAMP_CATALOG[0],
        { offsetX: 16, offsetY: -16, scalePct: 120 }
      ),
      true
    );
  });

  it("enforces category slots and rejects duplicate stamp ids", () => {
    assert.throws(
      () =>
        parseBotAvatarDetailsV1(
          details([stamp("round-glasses"), stamp("monocle")])
        ),
      /one eyewear/i
    );
    assert.throws(
      () =>
        parseBotAvatarDetailsV1(
          details([stamp("goatee"), stamp("short-beard")])
        ),
      /one facial-hair/i
    );
    assert.throws(
      () =>
        parseBotAvatarDetailsV1(
          details([
            stamp("freckles"),
            stamp("diagonal-scar"),
            stamp("cheek-stripes"),
          ])
        ),
      /at most two marking/i
    );
    assert.throws(
      () =>
        parseBotAvatarDetailsV1(
          details([stamp("freckles"), stamp("freckles", 1)])
        ),
      /may appear only once/i
    );
  });

  it("round-trips an exact 2048-byte MSB-first canonical padded Base64 mask", () => {
    const bytes = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH);
    const writableByte = (50 * 128 + 24) >>> 3;
    bytes[writableByte] = 0x81;
    const encoded = encodeBotAvatarDetailsPaintMask(bytes);
    assert.equal(encoded.length, BOT_AVATAR_DETAILS_PAINT_MASK_BASE64_LENGTH);
    assert.ok(encoded.endsWith("="));
    assert.deepEqual(decodeBotAvatarDetailsPaintMask(encoded), bytes);
    assert.equal(decodeBotAvatarDetailsPaintMask(encoded)[writableByte], 0x81);
  });

  it("rejects lenient, URL-safe, unpadded, whitespace, and wrong-size Base64", () => {
    const encoded = encodeBotAvatarDetailsPaintMask(
      new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH)
    );
    assert.throws(
      () => decodeBotAvatarDetailsPaintMask(encoded.slice(0, -1)),
      /exactly 2732 characters/i
    );
    assert.throws(
      () => decodeBotAvatarDetailsPaintMask(`${encoded.slice(0, -2)}_=`),
      /standard Base64 alphabet/i
    );
    assert.throws(
      () => decodeBotAvatarDetailsPaintMask(`${encoded.slice(0, -2)}\n=`),
      /standard Base64 alphabet/i
    );
    assert.throws(
      () =>
        encodeBotAvatarDetailsPaintMask(
          new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH - 1)
        ),
      /exactly 2048 bytes/i
    );
  });

  it("caps freehand mask coverage at 40 percent", () => {
    assert.equal(BOT_AVATAR_DETAILS_WRITABLE_PIXEL_COUNT, 5_467);
    const atLimit = bytesWithSetBitCount(BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS);
    assert.doesNotThrow(() => encodeBotAvatarDetailsPaintMask(atLimit));
    const overLimit = bytesWithSetBitCount(
      BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS + 1
    );
    assert.throws(
      () => encodeBotAvatarDetailsPaintMask(overLimit),
      new RegExp(`at most ${BOT_AVATAR_DETAILS_MAX_PAINTED_PIXELS} pixels`, "i")
    );
  });

  it("rejects paint pixels outside the writable face screen", () => {
    const bytes = new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH);
    bytes[0] = 0x80;
    assert.throws(
      () => encodeBotAvatarDetailsPaintMask(bytes),
      /outside the writable face screen/i
    );
  });

  it("serializes in canonical key and stamp order and safely reads stored JSON", () => {
    const canonical = serializeBotAvatarDetailsV1(
      details([stamp("circuit-mark"), stamp("monocle")])
    );
    assert.equal(
      canonical,
      '{"version":1,"screen":{"stamps":[{"id":"monocle","offsetX":0,"offsetY":0,"scalePct":100},{"id":"circuit-mark","offsetX":0,"offsetY":0,"scalePct":100}],"paintMaskBase64":null}}'
    );
    assert.deepEqual(parseStoredBotAvatarDetailsV1(canonical), JSON.parse(canonical));
    assert.equal(parseStoredBotAvatarDetailsV1("not json"), null);
    assert.equal(parseStoredBotAvatarDetailsV1(null), null);
  });

  it("enforces the 8KB UTF-8 input limit before canonicalization or stored parsing", () => {
    const oversized = {
      ...details(),
      extra: "🎨".repeat(BOT_AVATAR_DETAILS_MAX_JSON_BYTES / 2),
    };
    assert.throws(
      () => parseBotAvatarDetailsV1(oversized),
      /input JSON may not exceed 8192 bytes/i
    );
    assert.equal(
      parseStoredBotAvatarDetailsV1(
        ` ${" ".repeat(BOT_AVATAR_DETAILS_MAX_JSON_BYTES)}${JSON.stringify(details())}`
      ),
      null
    );
  });

  it("canonicalizes an all-zero paint mask to null", () => {
    const emptyMask = encodeBotAvatarDetailsPaintMask(
      new Uint8Array(BOT_AVATAR_DETAILS_PAINT_MASK_BYTE_LENGTH)
    );
    assert.equal(
      parseBotAvatarDetailsV1(details([], emptyMask)).screen.paintMaskBase64,
      null
    );
  });
});
