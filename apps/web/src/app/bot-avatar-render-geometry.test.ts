import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_CANONICAL_FACE_FACING_STYLE,
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_DETAILS_FACE_NUDGE_Y,
  BOT_AVATAR_DETAILS_FACE_PLACEMENT,
  BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
  BOT_AVATAR_DETAILS_INK_APERTURE_SCALE,
  botAvatarFaceFacingStyle,
  botAvatarDetailsFacingOffsetY,
  botAvatarDetailsFacingScaleX,
  botAvatarDetailsSignalFacingOffsetY,
} from "./bot-avatar-render-geometry.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

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
      "--coffee-plate-emoji-nudge-y": BOT_AVATAR_DETAILS_FACE_NUDGE_Y,
      "--avatar-details-ink-aperture-scale":
        BOT_AVATAR_DETAILS_INK_APERTURE_SCALE,
    });
    assert.equal(BOT_AVATAR_DETAILS_INK_APERTURE_SCALE, 1);
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
  it("defines Avatar Studio's front-facing orientation as the default", () => {
    assert.deepEqual(BOT_AVATAR_CANONICAL_FACE_FACING_STYLE, {
      "--coffee-plate-emoji-face-scale-y":
        BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
      "--zen-live-bot-screen-facing-scale-x": "1",
      "--avatar-details-facing-scale-x": "1",
      "--avatar-details-facing-offset-y": "0%",
    });
  });

  it("keeps canonical face and authored ink on one registration contract", () => {
    assert.deepEqual(
      botAvatarFaceFacingStyle(BOT_AVATAR_CANONICAL_FACE_SCALE_Y),
      {
        "--coffee-plate-emoji-face-scale-y":
          BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
        "--zen-live-bot-screen-facing-scale-x": "1",
        "--avatar-details-facing-scale-x": "1",
        "--avatar-details-facing-offset-y": "0%",
      },
    );
  });

  it("mirrors and optically registers face ink as one operation", () => {
    assert.deepEqual(botAvatarFaceFacingStyle(1), {
      "--coffee-plate-emoji-face-scale-y": "1",
      "--zen-live-bot-screen-facing-scale-x": "-1",
      "--avatar-details-facing-scale-x": "-1",
      "--avatar-details-facing-offset-y": "-2.34375%",
    });
  });

  it("keeps the authored face and ink orientation coupled in both directions", () => {
    for (const faceScaleY of [-1, 1] as const) {
      const style = botAvatarFaceFacingStyle(faceScaleY);
      assert.equal(
        style["--avatar-details-facing-scale-x"],
        botAvatarDetailsFacingScaleX(faceScaleY),
      );
      assert.equal(
        style["--zen-live-bot-screen-facing-scale-x"],
        botAvatarDetailsFacingScaleX(faceScaleY),
      );
      assert.equal(
        style["--avatar-details-facing-offset-y"],
        botAvatarDetailsFacingOffsetY(faceScaleY),
      );
    }
  });

  it("resolves facing directly on both complete face-and-ink screen rigs", () => {
    assert.match(
      pageSource,
      /const screenFacingScaleX = showQuestionMark\s*\? "1"\s*:\s*botAvatarDetailsFacingScaleX\(faceScaleY\)/,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /className=\{styles\.zenLiveBotPresenceScreenContentRig\}[\s\S]{0,280}\["--zen-live-bot-screen-facing-scale-x" as string\]:\s*screenFacingScaleX/g,
        ),
      ].length,
      2,
    );
  });

  it("preserves the flipped Ink optical offset inside the shared screen rig", () => {
    const screenContentRigRule = pageCss.match(
      /\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*\}/,
    )?.[0];
    assert.ok(screenContentRigRule);
    assert.match(
      screenContentRigRule,
      /--avatar-details-facing-scale-x:\s*1/,
      "the full screen rig must remain the sole horizontal mirror",
    );
    assert.doesNotMatch(
      screenContentRigRule,
      /--avatar-details-facing-offset-y\s*:/,
      "the Ink layer must inherit the left-facing three-pixel lift",
    );
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
