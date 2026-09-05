import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveZenLiveAvatarFacingForTravel,
  snapZenLiveAvatarPositionForPresentation,
} from "./zenLiveAvatarDepth.ts";

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
