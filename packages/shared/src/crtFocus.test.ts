import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CRT_FOCUS,
  crtFocusRadiusScale,
  normalizeCrtFocus,
} from "./crtFocus.ts";

describe("CRT focus", () => {
  it("normalizes persisted and incoming values without leaving its range", () => {
    assert.equal(normalizeCrtFocus(undefined), DEFAULT_CRT_FOCUS);
    assert.equal(normalizeCrtFocus("65"), 65);
    assert.equal(normalizeCrtFocus(-12), 0);
    assert.equal(normalizeCrtFocus(140), 100);
  });

  it("preserves the approved midpoint and tightens only the beam radius", () => {
    assert.equal(crtFocusRadiusScale(0), 1.3);
    assert.equal(crtFocusRadiusScale(50), 1);
    assert.equal(crtFocusRadiusScale(100), 0.7);
  });
});
