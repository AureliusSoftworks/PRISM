import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { thumbWebpRelativePathFromPngRelativePath } from "../image-storage.ts";
import {
  encodeWebpThumbFromRasterBytes,
  GENERATED_IMAGE_THUMB_MAX_EDGE_PX,
} from "../image-thumb.ts";

describe("thumbWebpRelativePathFromPngRelativePath", () => {
  it("maps png sidecar to webp thumb filename", () => {
    assert.equal(
      thumbWebpRelativePathFromPngRelativePath("generated-images/u1/abc123.png"),
      "generated-images/u1/abc123.thumb.webp"
    );
  });

  it("rejects non-png paths", () => {
    assert.throws(() => thumbWebpRelativePathFromPngRelativePath("generated-images/u1/x.jpg"));
  });
});

describe("encodeWebpThumbFromRasterBytes", () => {
  it("produces smaller WebP bounded by max edge", async () => {
    const png = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 80, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const webp = await encodeWebpThumbFromRasterBytes(png);
    assert.ok(webp.length > 0);
    assert.ok(webp.length < png.length);

    const meta = await sharp(webp).metadata();
    assert.ok(meta.width != null && meta.width <= GENERATED_IMAGE_THUMB_MAX_EDGE_PX);
    assert.ok(meta.height != null && meta.height <= GENERATED_IMAGE_THUMB_MAX_EDGE_PX);
  });
});
