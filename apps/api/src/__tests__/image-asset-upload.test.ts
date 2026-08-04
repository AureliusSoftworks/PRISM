import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
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
  });

  it("rejects non-image data", () => {
    assert.throws(() => parseImageAssetDataUrl("data:text/plain;base64,SGk="));
  });
});
