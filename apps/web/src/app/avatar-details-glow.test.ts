import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { avatarDetailsExteriorGlowRaster } from "./avatar-details-glow.ts";

function solidRgba(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = 120;
    pixels[index * 4 + 1] = 40;
    pixels[index * 4 + 2] = 220;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

function alphaAt(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): number {
  return pixels[(y * width + x) * 4 + 3] ?? 0;
}

describe("Avatar Details exterior glow raster", () => {
  it("removes surrounded ink while preserving a two-pixel exterior rim", () => {
    const result = avatarDetailsExteriorGlowRaster(solidRgba(7, 7), 7, 7, 2);
    assert.ok(result);
    assert.deepEqual(result.bounds, { x: 0, y: 0, width: 7, height: 7 });
    assert.equal(alphaAt(result.pixels, 7, 0, 3), 255);
    assert.equal(alphaAt(result.pixels, 7, 1, 3), 255);
    assert.equal(alphaAt(result.pixels, 7, 3, 3), 0);
  });

  it("does not light the perimeter of an enclosed transparent hole", () => {
    const pixels = solidRgba(9, 9);
    pixels[(4 * 9 + 4) * 4 + 3] = 0;
    const result = avatarDetailsExteriorGlowRaster(pixels, 9, 9, 1);
    assert.ok(result);
    assert.equal(alphaAt(result.pixels, 9, 4, 3), 0);
    assert.equal(alphaAt(result.pixels, 9, 3, 4), 0);
    assert.equal(alphaAt(result.pixels, 9, 4, 5), 0);
    assert.equal(alphaAt(result.pixels, 9, 5, 4), 0);
  });

  it("crops disconnected exposed marks to their combined occupied bounds", () => {
    const pixels = new Uint8ClampedArray(10 * 8 * 4);
    for (const [x, y] of [
      [2, 3],
      [7, 5],
    ]) {
      const index = (y * 10 + x) * 4;
      pixels[index] = 255;
      pixels[index + 3] = 255;
    }
    const result = avatarDetailsExteriorGlowRaster(pixels, 10, 8, 2);
    assert.ok(result);
    assert.deepEqual(result.bounds, { x: 2, y: 3, width: 6, height: 3 });
    assert.equal(alphaAt(result.pixels, 6, 0, 0), 255);
    assert.equal(alphaAt(result.pixels, 6, 5, 2), 255);
  });

  it("returns null for empty or invalid rasters", () => {
    assert.equal(
      avatarDetailsExteriorGlowRaster(new Uint8ClampedArray(4 * 4 * 4), 4, 4),
      null,
    );
    assert.equal(
      avatarDetailsExteriorGlowRaster(new Uint8ClampedArray(3), 4, 4),
      null,
    );
  });
});
