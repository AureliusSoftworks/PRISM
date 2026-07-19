import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import {
  normalizeSignalAssetUpload,
  normalizeSignalLogoImage,
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

async function logoBytes(args: {
  width: number;
  height: number;
  transparent?: boolean;
  format?: "png" | "jpeg" | "webp";
}): Promise<Buffer> {
  const background = args.transparent
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 250, g: 248, b: 242, alpha: 1 };
  const markSize = Math.round(Math.min(args.width, args.height) * 0.42);
  const mark = Buffer.from(
    `<svg width="${markSize}" height="${markSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="50%" cy="50%" r="44%" fill="#e35435"/><path d="M25 ${markSize / 2}h${markSize - 50}" stroke="#264e9b" stroke-width="18"/></svg>`,
  );
  const image = sharp({
    create: {
      width: args.width,
      height: args.height,
      channels: 4,
      background,
    },
  }).composite([{ input: mark, gravity: "center" }]);
  return image[args.format ?? "png"]().toBuffer();
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

  it("normalizes logos to a contained square mark with real transparency", async () => {
    const bytes = await logoBytes({
      width: 800,
      height: 600,
      format: "webp",
    });
    const upload = await normalizeSignalAssetUpload(
      `data:image/webp;base64,${bytes.toString("base64")}`,
      "logo",
    );
    assert.equal(upload.width, 1024);
    assert.equal(upload.height, 1024);
    const normalized = await sharp(upload.pngBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(normalized.info.channels, 4);
    assert.equal(normalized.data[3], 0);
    const centerOffset =
      (Math.floor(normalized.info.height / 2) * normalized.info.width +
        Math.floor(normalized.info.width / 2)) *
        4;
    assert.ok(normalized.data[centerOffset + 3]! > 240);
  });

  it("preserves an authored alpha channel while normalizing uploaded logos", async () => {
    const normalized = await normalizeSignalLogoImage(
      await logoBytes({ width: 500, height: 700, transparent: true }),
    );
    const metadata = await sharp(normalized.pngBytes).metadata();
    const raw = await sharp(normalized.pngBytes).raw().toBuffer();
    assert.equal(metadata.width, 1024);
    assert.equal(metadata.height, 1024);
    assert.equal(metadata.hasAlpha, true);
    assert.equal(raw[3], 0);
    assert.ok(raw.some((value, offset) => offset % 4 === 3 && value > 240));
  });

  it("keys an opaque generated magenta background without using provider alpha", async () => {
    const source = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 4,
        background: { r: 255, g: 0, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="260" height="260" xmlns="http://www.w3.org/2000/svg"><circle cx="130" cy="130" r="118" fill="#35c9c2"/><circle cx="130" cy="130" r="72" fill="#151515"/></svg>',
          ),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();
    const normalized = await normalizeSignalLogoImage(source, {
      generated: true,
    });
    const raw = await sharp(normalized.pngBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center =
      (Math.floor(raw.info.height / 2) * raw.info.width +
        Math.floor(raw.info.width / 2)) *
      4;
    assert.equal(raw.data[3], 0);
    assert.ok(raw.data[center + 3]! > 240);
    assert.ok(raw.data[center]! < 40);
    assert.ok(raw.data[center + 1]! < 40);
    assert.ok(raw.data[center + 2]! < 40);
  });

  it("converts only boundary-connected legacy black to the magenta key", async () => {
    const source = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg"><circle cx="150" cy="150" r="136" fill="#35c9c2"/><circle cx="150" cy="150" r="92" fill="#111111"/></svg>',
          ),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();
    const normalized = await normalizeSignalLogoImage(source, {
      generated: true,
    });
    const raw = await sharp(normalized.pngBytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center =
      (Math.floor(raw.info.height / 2) * raw.info.width +
        Math.floor(raw.info.width / 2)) *
      4;
    assert.equal(raw.data[3], 0);
    assert.ok(raw.data[center + 3]! > 240);
    assert.ok(raw.data[center]! < 40);
    assert.ok(raw.data[center + 1]! < 40);
    assert.ok(raw.data[center + 2]! < 40);
  });

  it("rejects an opaque tile that contains no recoverable logo mark", async () => {
    const solid = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 4,
        background: { r: 250, g: 248, b: 242, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      normalizeSignalLogoImage(solid),
      /visible mark/iu,
    );
  });

  it("rejects unsupported payloads", async () => {
    await assert.rejects(
      normalizeSignalAssetUpload("data:image/gif;base64,R0lGODlh", "logo"),
      /PNG, JPEG, or WebP/iu,
    );
  });
});
