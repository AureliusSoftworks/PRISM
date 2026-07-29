import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_DETAILS_FACE_PLACEMENT,
  BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
  botAvatarFaceFacingStyle,
  botAvatarDetailsFacingOffsetY,
  botAvatarDetailsFacingScaleX,
  botAvatarDetailsSignalFacingOffsetY,
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
        `${BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
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

describe("botAvatarFaceFacingStyle", () => {
  it("keeps canonical face and authored ink on one registration contract", () => {
    assert.deepEqual(
      botAvatarFaceFacingStyle(BOT_AVATAR_CANONICAL_FACE_SCALE_Y),
      {
        "--coffee-plate-emoji-face-scale-y":
          BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
        "--avatar-details-facing-scale-x": "1",
        "--avatar-details-facing-offset-y": "0%",
      },
    );
  });

  it("mirrors and optically registers face ink as one operation", () => {
    assert.deepEqual(botAvatarFaceFacingStyle(1), {
      "--coffee-plate-emoji-face-scale-y": "1",
      "--avatar-details-facing-scale-x": "-1",
      "--avatar-details-facing-offset-y": "-2.34375%",
    });
  });
});

describe("botAvatarDetailsSignalFacingOffsetY", () => {
  it("lifts only Signal's Align-stage ink by one authored pixel", () => {
    assert.equal(
      botAvatarDetailsSignalFacingOffsetY(-1, "alignment"),
      "calc(0% - 0.78125%)",
    );
    assert.equal(
      botAvatarDetailsSignalFacingOffsetY(1, "alignment"),
      "calc(-2.34375% - 0.78125%)",
    );
    assert.equal(botAvatarDetailsSignalFacingOffsetY(-1, "stage"), "0%");
    assert.equal(
      botAvatarDetailsSignalFacingOffsetY(1, "dashboard"),
      "-2.34375%",
    );
  });
});
