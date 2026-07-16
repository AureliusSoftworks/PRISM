import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import {
  normalizeSignalAssetUpload,
  readSignalAssetSlot,
} from "../signal-asset-upload.ts";

async function dataUrl(
  format: "png" | "jpeg" | "webp",
  width: number,
  height: number,
): Promise<string> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 50, g: 90, b: 160, alpha: 1 },
    },
  });
  const bytes = await image[format]().toBuffer();
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

describe("Signal asset uploads", () => {
  it("accepts each replaceable show asset slot", () => {
    assert.equal(readSignalAssetSlot("day-studio"), "day-studio");
    assert.equal(readSignalAssetSlot("night-studio"), "night-studio");
    assert.equal(readSignalAssetSlot("logo"), "logo");
    assert.throws(() => readSignalAssetSlot("studio"), /Light studio/iu);
  });

  it("normalizes studio uploads without forcing a crop", async () => {
    const upload = await normalizeSignalAssetUpload(
      await dataUrl("jpeg", 1200, 800),
      "day-studio",
    );
    assert.equal(upload.width, 1200);
    assert.equal(upload.height, 800);
    assert.equal((await sharp(upload.pngBytes).metadata()).format, "png");
  });

  it("normalizes logos to the square Signal mark", async () => {
    const upload = await normalizeSignalAssetUpload(
      await dataUrl("webp", 800, 600),
      "logo",
    );
    assert.equal(upload.width, 1024);
    assert.equal(upload.height, 1024);
  });

  it("rejects unsupported payloads", async () => {
    await assert.rejects(
      normalizeSignalAssetUpload("data:image/gif;base64,R0lGODlh", "logo"),
      /PNG, JPEG, or WebP/iu,
    );
  });
});
