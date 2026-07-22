import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_DETAILS_FACE_PLACEMENT,
  BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
  botAvatarDetailsFacingOffsetY,
  botAvatarDetailsFacingScaleX,
} from "./bot-avatar-render-geometry.ts";

describe("Avatar Details face registration", () => {
  it("uses the editor calibration for details-bearing live avatars", () => {
    assert.deepEqual(BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE, {
      "--zen-live-bot-face-x":
        `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.xPct}%`,
      "--zen-live-bot-face-y":
        `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.yPct}%`,
      "--zen-live-bot-face-scale": BOT_AVATAR_DETAILS_FACE_PLACEMENT.scale,
      "--zen-live-bot-avatar-face-glyph-size":
        `calc(var(--zen-live-bot-body-frame-size) * ${BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO})`,
    });
  });
});

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

describe("botAvatarDetailsFacingOffsetY", () => {
  it("keeps canonical ink registration and lifts only the left-facing mirror", () => {
    assert.equal(
      botAvatarDetailsFacingOffsetY(BOT_AVATAR_CANONICAL_FACE_SCALE_Y),
      "0%",
    );
    assert.equal(botAvatarDetailsFacingOffsetY(-1), "0%");
    assert.equal(botAvatarDetailsFacingOffsetY("1"), "-2.34375%");
    assert.equal(botAvatarDetailsFacingOffsetY(1), "-2.34375%");
  });
});
