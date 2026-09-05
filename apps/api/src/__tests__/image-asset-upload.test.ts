import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  imageHasVisibleTransparency,
  normalizeImageAssetUpload,
  parseImageAssetDataUrl,
} from "../image-asset-upload.ts";

describe("local asset uploads", () => {
  it("normalizes common image data URLs without forcing one aspect ratio", async () => {
    const bytes = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 4,
        background: { r: 12, g: 24, b: 36, alpha: 1 },
      },
    }).jpeg().toBuffer();
    const result = await normalizeImageAssetUpload(
      `data:image/jpeg;base64,${bytes.toString("base64")}`,
      { width: 600, height: 600 },
    );
    assert.equal(result.width, 600);
    assert.equal(result.height, 400);
    assert.equal((await sharp(result.pngBytes).metadata()).format, "png");
    assert.equal(
      result.contentSha256,
      createHash("sha256").update(result.pngBytes).digest("hex"),
    );
  });

  it("rejects non-image data", () => {
    assert.throws(() => parseImageAssetDataUrl("data:text/plain;base64,SGk="));
  });

  it("distinguishes a transparent PNG item from a fully opaque PNG photo", async () => {
    const transparentPng = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 36, g: 72, b: 108, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const opaquePng = await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 36, g: 72, b: 108, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    assert.equal(await imageHasVisibleTransparency(transparentPng), true);
    assert.equal(await imageHasVisibleTransparency(opaquePng), false);
  });
});
