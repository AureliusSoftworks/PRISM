import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CRT_FACE_PIXEL_GRID_SIZE,
  CRT_GLYPH_ALPHA_THRESHOLD,
  crtPixelGridDimension,
  quantizeCrtGlyphAlpha,
} from "./crt-pixel-glyph.ts";

const appDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(join(appDir, "CrtPixelGlyph.tsx"), "utf8");
const faceSource = readFileSync(
  join(appDir, "CoffeeSeatPlateEmoji.tsx"),
  "utf8",
);
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");

describe("CRT pixel glyphs", () => {
  it("uses a subtle 128x128 source grid and maps content proportionally", () => {
    assert.equal(CRT_FACE_PIXEL_GRID_SIZE, 128);
    assert.equal(crtPixelGridDimension(128, 256), 64);
    assert.equal(crtPixelGridDimension(256, 256), 128);
    assert.equal(crtPixelGridDimension(0, 256), 1);
  });

  it("turns antialiased source coverage into a binary phosphor mask", () => {
    const quantized = quantizeCrtGlyphAlpha(
      new Uint8ClampedArray([
        4,
        8,
        12,
        CRT_GLYPH_ALPHA_THRESHOLD - 1,
        12,
        16,
        20,
        CRT_GLYPH_ALPHA_THRESHOLD,
      ]),
    );
    assert.deepEqual(
      Array.from(quantized),
      [255, 255, 255, 0, 255, 255, 255, 255],
    );
  });

  it("pixelates face, blink, mouth, question, and spinner glyphs before glow", () => {
    assert.match(faceSource, /pixelGridSize\?: number \| null/);
    assert.match(
      faceSource,
      /<CrtPixelGlyph[\s\S]*pixelGridSize=\{pixelGridSize\}/,
    );
    assert.match(pageSource, /pixelGridSize=\{CRT_FACE_PIXEL_GRID_SIZE\}/);
    assert.match(componentSource, /imageSmoothingEnabled = false/);
    assert.match(componentSource, /quantizeCrtGlyphAlpha/);
    assert.match(componentSource, /data-crt-pixel-emission="halo"/);
    assert.match(componentSource, /data-crt-pixel-emission="core"/);
    assert.match(cssSource, /data-crt-glyph-pixel-ready="true"/);
    assert.match(cssSource, /--crt-glyph-pixel-mask-image/);
  });
});
