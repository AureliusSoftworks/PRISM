import assert from "node:assert/strict";
import test from "node:test";

import { recolorMagentaKeyPixels, runtimeTintRgb } from "./magentaKeyRaster.ts";

test("normalizes compact and full runtime tint colors", () => {
  assert.deepEqual(runtimeTintRgb("#5af"), [85, 170, 255]);
  assert.deepEqual(runtimeTintRgb("#123456"), [18, 52, 86]);
  assert.deepEqual(runtimeTintRgb("not-a-color"), [217, 210, 255]);
});

test("recolors exact magenta while preserving alpha and non-keyed pixels", () => {
  const pixels = new Uint8ClampedArray([255, 0, 255, 230, 20, 30, 40, 255]);
  recolorMagentaKeyPixels(pixels, [32, 96, 224]);
  assert.deepEqual([...pixels], [32, 96, 224, 230, 20, 30, 40, 255]);
});

test("preserves shading and pastel softness in keyed magentas", () => {
  const pixels = new Uint8ClampedArray([128, 0, 128, 255, 255, 128, 255, 255]);
  recolorMagentaKeyPixels(pixels, [40, 120, 200]);
  assert.deepEqual([...pixels.slice(0, 4)], [20, 60, 100, 255]);
  assert.deepEqual([...pixels.slice(4, 8)], [148, 188, 228, 255]);
});
