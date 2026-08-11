import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX,
  PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX,
  PHOSPHOR_FACE_CANONICAL_DENSITY_SCALE,
  PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA,
  PHOSPHOR_PIXEL_ALPHA_THRESHOLD,
  PHOSPHOR_PIXEL_CELL_SIZE_PX,
  phosphorCanonicalPresentationScale,
  phosphorCanonicalRasterDimension,
  phosphorCanvasFontShorthand,
  phosphorTextAlphabeticBaseline,
  resamplePhosphorRgbaCoverage,
  resamplePhosphorRgbaForPresentation,
  resamplePhosphorRgbaNearestNeighbor,
  samplePhosphorAlphaCells,
  thresholdPhosphorPixelAlpha,
} from "./phosphorPixelRaster.ts";

describe("phosphor pixel raster", () => {
  it("uses one logical phosphor cell and keeps the binary ink helper", () => {
    assert.equal(PHOSPHOR_PIXEL_CELL_SIZE_PX, 1);
    assert.equal(PHOSPHOR_FACE_PIXEL_CELL_SIZE_PX, 1);
    assert.equal(PHOSPHOR_FACE_PIXEL_COVERAGE_GAMMA, 0.78);
    assert.equal(PHOSPHOR_PIXEL_ALPHA_THRESHOLD, 92);

    const result = thresholdPhosphorPixelAlpha(
      new Uint8ClampedArray([
        12, 24, 36, 0,
        12, 24, 36, 91,
        12, 24, 36, 92,
        12, 24, 36, 255,
      ]),
    );
    assert.deepEqual(
      Array.from(result),
      [
        255, 255, 255, 0,
        255, 255, 255, 0,
        255, 255, 255, 255,
        255, 255, 255, 255,
      ],
    );
  });

  it("keeps full-avatar emitters on one scale-independent 256px plane", () => {
    assert.equal(PHOSPHOR_FACE_CANONICAL_DENSITY_SCALE, 2);
    assert.equal(PHOSPHOR_FACE_CANONICAL_SCREEN_SIZE_PX, 256);
    assert.equal(phosphorCanonicalPresentationScale(256), 1);
    assert.equal(phosphorCanonicalPresentationScale(640), 2.5);
    assert.equal(phosphorCanonicalRasterDimension(75, 2.5), 30);
    assert.equal(phosphorCanonicalRasterDimension(150, 5), 30);
  });

  it("does not mutate the source raster", () => {
    const source = new Uint8ClampedArray([7, 8, 9, 140]);
    const result = thresholdPhosphorPixelAlpha(source);
    assert.deepEqual(Array.from(source), [7, 8, 9, 140]);
    assert.deepEqual(Array.from(result), [255, 255, 255, 255]);
  });

  it("omits font variants that silently reset canvas text to 10px", () => {
    const font = phosphorCanvasFontShorthand(
      {
        fontFamily: '"Cormorant Garamond", Georgia, serif',
        fontSize: "67.24px",
        fontStyle: "normal",
        fontVariant: "lining-nums",
        fontWeight: "640",
      },
      4,
    );

    assert.equal(
      font,
      'normal 640 268.96px "Cormorant Garamond", Georgia, serif',
    );
    assert.doesNotMatch(font, /lining-nums/);
  });

  it("keeps compact mouths and tall eyes on the browser font baseline", () => {
    const compactMouthBaseline = phosphorTextAlphabeticBaseline(80, {
      fontBoundingBoxAscent: 72,
      fontBoundingBoxDescent: 18,
      actualBoundingBoxAscent: 34,
      actualBoundingBoxDescent: 0,
    });
    const tallEyeBaseline = phosphorTextAlphabeticBaseline(80, {
      fontBoundingBoxAscent: 72,
      fontBoundingBoxDescent: 18,
      actualBoundingBoxAscent: 67,
      actualBoundingBoxDescent: 2,
    });

    assert.equal(compactMouthBaseline, 67);
    assert.equal(tallEyeBaseline, compactMouthBaseline);
  });

  it("falls back to actual ink bounds when font bounds are unavailable", () => {
    assert.equal(
      phosphorTextAlphabeticBaseline(80, {
        actualBoundingBoxAscent: 34,
        actualBoundingBoxDescent: 2,
      }),
      56,
    );
  });

  it("preserves fractional coverage when sampling supersampled glyph edges", () => {
    const source = new Uint8ClampedArray(4 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
      source[(y * 4 + 1) * 4 + 3] = 255;
      source[(y * 4 + 2) * 4 + 3] = 255;
      source[(y * 4 + 3) * 4 + 3] = 255;
    }

    const result = samplePhosphorAlphaCells(source, 4, 2, 2, 1, 1, 1, 0);

    assert.equal(result.length, 2 * 1 * 4);
    assert.equal(result[3], 128);
    assert.equal(result[7], 255);
    assert.deepEqual(
      Array.from(source.slice(0, 8)),
      [0, 0, 0, 0, 0, 0, 0, 255],
    );
  });

  it("gives authored Ink fractional subcells without changing its geometry", () => {
    const source = new Uint8ClampedArray(2 * 2 * 4);
    source.set([220, 40, 70, 255], 0);

    const result = resamplePhosphorRgbaCoverage(
      source,
      2,
      2,
      4,
      4,
      1,
      0,
    );
    const alphaAt = (x: number, y: number): number =>
      result[(y * 4 + x) * 4 + 3] ?? 0;

    assert.equal(alphaAt(0, 0), 255);
    assert.equal(alphaAt(1, 0), 191);
    assert.equal(alphaAt(2, 0), 64);
    assert.equal(alphaAt(3, 0), 0);
    assert.equal(alphaAt(0, 1), 191);
    assert.equal(alphaAt(1, 1), 143);
    assert.equal(alphaAt(2, 2), 16);
    assert.deepEqual(Array.from(result.slice(0, 3)), [220, 40, 70]);
  });

  it("keeps hard block cells when nearest-neighbor resampling for the pixel grid", () => {
    const source = new Uint8ClampedArray(2 * 2 * 4);
    source.set([220, 40, 70, 255], 0);
    source.set([10, 200, 30, 255], 4);

    const result = resamplePhosphorRgbaNearestNeighbor(source, 2, 2, 4, 4);
    const pixelAt = (x: number, y: number): number[] =>
      Array.from(result.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));

    assert.deepEqual(pixelAt(0, 0), [220, 40, 70, 255]);
    assert.deepEqual(pixelAt(1, 0), [220, 40, 70, 255]);
    assert.deepEqual(pixelAt(2, 0), [10, 200, 30, 255]);
    assert.deepEqual(pixelAt(3, 0), [10, 200, 30, 255]);
    assert.deepEqual(pixelAt(0, 1), [220, 40, 70, 255]);
    assert.deepEqual(pixelAt(2, 1), [10, 200, 30, 255]);

    const viaPresentation = resamplePhosphorRgbaForPresentation(
      source,
      2,
      2,
      4,
      4,
      "nearest",
    );
    assert.deepEqual(Array.from(viaPresentation), Array.from(result));
  });
});
