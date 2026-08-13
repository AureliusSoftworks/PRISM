import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveZenLiveAvatarDepth,
  resolveZenLiveAvatarFacingForTravel,
  snapZenLiveAvatarPositionForPresentation,
} from "./zenLiveAvatarDepth.ts";

describe("resolveZenLiveAvatarDepth", () => {
  it("keeps high-screen avatars in the existing mini tier and grows full avatars below the seam", () => {
    assert.deepEqual(
      resolveZenLiveAvatarDepth({
        y: 61.2,
        viewportHeight: 800,
        previousMode: "mini",
      }),
      { mode: "mini", sizePx: 184, progress: 0.2 },
    );
    const full = resolveZenLiveAvatarDepth({
      y: 720,
      viewportHeight: 800,
      previousMode: "mini",
    });
    assert.equal(full.mode, "full");
    assert.ok(full.sizePx > 240 && full.sizePx <= 480);
  });

  it("uses a stable depth seam instead of flapping between mini and full", () => {
    assert.equal(
      resolveZenLiveAvatarDepth({
        y: 153,
        viewportHeight: 800,
        previousMode: "mini",
      }).mode,
      "mini",
    );
    assert.equal(
      resolveZenLiveAvatarDepth({
        y: 153,
        viewportHeight: 800,
        previousMode: "full",
      }).mode,
      "full",
    );
  });

  it("starts the full authored chassis at its floor and quantizes later growth", () => {
    assert.equal(
      resolveZenLiveAvatarDepth({
        y: 171.36,
        viewportHeight: 800,
        previousMode: "mini",
      }).sizePx,
      240,
    );
    assert.equal(
      resolveZenLiveAvatarDepth({
        y: 256,
        viewportHeight: 800,
        previousMode: "full",
      }).sizePx % 2,
      0,
    );
  });
});

describe("Zen live avatar presentation", () => {
  it("faces in the direction of every horizontal travel step", () => {
    assert.equal(resolveZenLiveAvatarFacingForTravel("left", 12), "right");
    assert.equal(resolveZenLiveAvatarFacingForTravel("right", -12), "left");
    assert.equal(resolveZenLiveAvatarFacingForTravel("left", 0), "left");
  });

  it("snaps the complete avatar presentation to whole pixels", () => {
    assert.deepEqual(
      snapZenLiveAvatarPositionForPresentation({ x: 10.49, y: 20.51 }),
      { x: 10, y: 21 },
    );
  });
});
