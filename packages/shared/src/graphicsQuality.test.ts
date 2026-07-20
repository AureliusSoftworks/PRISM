import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GRAPHICS_QUALITY,
  normalizeGraphicsQuality,
} from "./graphicsQuality.ts";

describe("graphics quality", () => {
  it("accepts every player-facing tier and defaults invalid values to High", () => {
    assert.equal(normalizeGraphicsQuality("low"), "low");
    assert.equal(normalizeGraphicsQuality("medium"), "medium");
    assert.equal(normalizeGraphicsQuality("high"), "high");
    assert.equal(normalizeGraphicsQuality("full"), DEFAULT_GRAPHICS_QUALITY);
    assert.equal(normalizeGraphicsQuality(null), DEFAULT_GRAPHICS_QUALITY);
  });

  it("preserves a caller-provided valid fallback", () => {
    assert.equal(normalizeGraphicsQuality("unknown", "medium"), "medium");
  });
});
