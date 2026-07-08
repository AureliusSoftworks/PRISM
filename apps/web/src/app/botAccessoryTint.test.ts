import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyBotAccessoryTintToImageData,
  isBotAccessoryTintMagentaPixel,
  normalizeBotAccessoryTintHex,
  parseBotAccessoryTintRgb,
  tintBotAccessoryMagentaPixel,
} from "./botAccessoryTint.ts";

describe("bot accessory magenta tinting", () => {
  it("normalizes bot tint colors from hex values", () => {
    assert.equal(normalizeBotAccessoryTintHex("#66CC33"), "#66cc33");
    assert.equal(normalizeBotAccessoryTintHex("f0f"), "#ff00ff");
    assert.deepEqual(parseBotAccessoryTintRgb("#336699"), { r: 51, g: 102, b: 153 });
    assert.equal(normalizeBotAccessoryTintHex("rebeccapurple"), null);
  });

  it("detects intentional magenta key pixels without catching ordinary colors", () => {
    assert.equal(isBotAccessoryTintMagentaPixel(255, 0, 255, 255), true);
    assert.equal(isBotAccessoryTintMagentaPixel(255, 80, 255, 255), true);
    assert.equal(isBotAccessoryTintMagentaPixel(255, 0, 128, 255), false);
    assert.equal(isBotAccessoryTintMagentaPixel(128, 0, 255, 255), false);
    assert.equal(isBotAccessoryTintMagentaPixel(255, 0, 255, 0), false);
  });

  it("maps pure magenta exactly to the bot color", () => {
    assert.deepEqual(
      tintBotAccessoryMagentaPixel(255, 0, 255, { r: 51, g: 102, b: 153 }),
      [51, 102, 153]
    );
  });

  it("preserves brightness and softness for shaded magentas", () => {
    assert.deepEqual(
      tintBotAccessoryMagentaPixel(128, 0, 128, { r: 51, g: 102, b: 153 }),
      [26, 51, 77]
    );
    assert.deepEqual(
      tintBotAccessoryMagentaPixel(255, 128, 255, { r: 51, g: 102, b: 153 }),
      [153, 179, 204]
    );
  });

  it("tints only magenta pixels inside image data", () => {
    const data = new Uint8ClampedArray([
      255, 0, 255, 255,
      20, 120, 220, 255,
      255, 80, 255, 128,
    ]);

    assert.equal(applyBotAccessoryTintToImageData(data, "#336699"), true);
    assert.deepEqual(Array.from(data), [
      51, 102, 153, 255,
      20, 120, 220, 255,
      115, 150, 185, 128,
    ]);
  });

  it("returns unchanged when no magenta key is present", () => {
    const data = new Uint8ClampedArray([20, 120, 220, 255]);
    assert.equal(applyBotAccessoryTintToImageData(data, "#336699"), false);
    assert.deepEqual(Array.from(data), [20, 120, 220, 255]);
  });
});
