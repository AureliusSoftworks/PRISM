import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PRISM_TYPOGRAPHY_SCALE,
  normalizePrismTypographyScale,
  PRISM_TYPOGRAPHY_SCALE_ROOT_PX,
  PRISM_TYPOGRAPHY_SCALE_VALUES,
} from "./typographyScale.ts";

describe("PRISM typography scale", () => {
  it("exposes five ordered presets with the current size in the middle", () => {
    assert.deepEqual(PRISM_TYPOGRAPHY_SCALE_VALUES, [
      "compact",
      "small",
      "standard",
      "large",
      "extra-large",
    ]);
    assert.equal(DEFAULT_PRISM_TYPOGRAPHY_SCALE, "standard");
    assert.equal(PRISM_TYPOGRAPHY_SCALE_VALUES[2], "standard");
    assert.deepEqual(Object.values(PRISM_TYPOGRAPHY_SCALE_ROOT_PX), [
      14, 15, 16, 17, 18,
    ]);
  });

  it("normalizes legacy and invalid values to Standard", () => {
    assert.equal(normalizePrismTypographyScale(undefined), "standard");
    assert.equal(normalizePrismTypographyScale("oversized"), "standard");
    assert.equal(normalizePrismTypographyScale("large"), "large");
    assert.equal(
      normalizePrismTypographyScale(undefined, "small"),
      "small",
    );
  });
});
