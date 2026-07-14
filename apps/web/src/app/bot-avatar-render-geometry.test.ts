import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  botAvatarDetailsFacingScaleX,
} from "./bot-avatar-render-geometry.ts";

describe("botAvatarDetailsFacingScaleX", () => {
  it("keeps editor-authored ink aligned in the canonical face orientation", () => {
    assert.equal(
      botAvatarDetailsFacingScaleX(BOT_AVATAR_CANONICAL_FACE_SCALE_Y),
      "1",
    );
    assert.equal(botAvatarDetailsFacingScaleX(-1), "1");
  });

  it("mirrors ink only when the runtime face actually flips", () => {
    assert.equal(botAvatarDetailsFacingScaleX("1"), "-1");
    assert.equal(botAvatarDetailsFacingScaleX(1), "-1");
  });
});
