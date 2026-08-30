import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOT_AVATAR_CANONICAL_FACE_FACING_STYLE,
  BOT_AVATAR_CANONICAL_FACING,
  BOT_AVATAR_CANONICAL_EYE_LOCAL_X,
  BOT_AVATAR_CANONICAL_FACE_NUDGE_Y,
  BOT_AVATAR_CANONICAL_FACE_PLACEMENT,
  BOT_AVATAR_CANONICAL_FACE_REGISTRATION_STYLE,
  BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
  BOT_AVATAR_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO,
  BOT_AVATAR_DETAILS_FACE_NUDGE_Y,
  BOT_AVATAR_DETAILS_FACE_PLACEMENT,
  BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
  BOT_AVATAR_DETAILS_INK_APERTURE_SCALE,
  botAvatarFaceFacingStyle,
  botAvatarFaceRegistrationStyle,
  botAvatarFaceScaleYForFacing,
  botAvatarFacingFromFaceScaleY,
  botAvatarDetailsFacingScaleX,
  botAvatarScreenFacingScaleX,
} from "./bot-avatar-render-geometry.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const debateCss = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);
const EXTERNAL_FACING_COUNTER_SCALE =
  "var(--bot-avatar-external-facing-scale-x, 1)";

describe("Avatar Details face registration", () => {
  it("applies Avatar Studio's canonical registration at the shared mannequin boundary", () => {
    assert.deepEqual(BOT_AVATAR_CANONICAL_FACE_REGISTRATION_STYLE, {
      "--zen-live-bot-face-x":
        `${BOT_AVATAR_CANONICAL_FACE_PLACEMENT.xPct}%`,
      "--zen-live-bot-face-y":
        `${BOT_AVATAR_CANONICAL_FACE_PLACEMENT.yPct}%`,
      "--zen-live-bot-face-scale": BOT_AVATAR_CANONICAL_FACE_PLACEMENT.scale,
      "--zen-live-bot-avatar-face-glyph-size":
        `${BOT_AVATAR_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
      "--zen-live-bot-eye-local-x": BOT_AVATAR_CANONICAL_EYE_LOCAL_X,
      "--coffee-plate-emoji-nudge-y": BOT_AVATAR_CANONICAL_FACE_NUDGE_Y,
    });
    assert.match(
      pageSource,
      /const avatarFaceRegistrationStyle = botAvatarFaceRegistrationStyle\(\s*hasAvatarDetailsVisuals,\s*\);/,
    );
    assert.strictEqual(
      botAvatarFaceRegistrationStyle(false),
      BOT_AVATAR_CANONICAL_FACE_REGISTRATION_STYLE,
    );
    assert.doesNotMatch(pageSource, /ZEN_LIVE_BOT_LOCKED_FACE_PLACEMENT/);
    assert.match(
      pageSource,
      /const registeredFaceEyeMovement =\s*botFaceEyeMovementPreservingInkRegistration\(\{[\s\S]{0,220}movement: faceStyle\.eyeAnimation,[\s\S]{0,120}hasVisibleInk: hasAvatarDetailsVisuals,[\s\S]{0,120}talking: isTalking/,
    );
    assert.match(
      pageSource,
      /faceEyeMovement=\{registeredFaceEyeMovement\}/,
    );
  });

  it("uses the editor calibration for details-bearing live avatars", () => {
    assert.deepEqual(BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE, {
      "--zen-live-bot-face-x":
        `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.xPct}%`,
      "--zen-live-bot-face-y":
        `${BOT_AVATAR_DETAILS_FACE_PLACEMENT.yPct}%`,
      "--zen-live-bot-face-scale": BOT_AVATAR_DETAILS_FACE_PLACEMENT.scale,
      "--zen-live-bot-avatar-face-glyph-size":
        `${BOT_AVATAR_DETAILS_FACE_GLYPH_FRAME_RATIO * 100}cqw`,
      "--zen-live-bot-eye-local-x": BOT_AVATAR_CANONICAL_EYE_LOCAL_X,
      "--coffee-plate-emoji-nudge-y": BOT_AVATAR_DETAILS_FACE_NUDGE_Y,
    });
    assert.strictEqual(
      botAvatarFaceRegistrationStyle(true),
      BOT_AVATAR_DETAILS_FACE_REGISTRATION_STYLE,
    );
    assert.equal(BOT_AVATAR_DETAILS_INK_APERTURE_SCALE, 1);
  });

  it("keeps Full and Mini registration inside the shared Studio contract", () => {
    assert.equal(
      [...pageSource.matchAll(/botAvatarFaceRegistrationStyle\(/g)].length,
      6,
      "Full plus every Mini consumer must resolve registration through one helper",
    );
    const protectedSurfaceSelectors = [
      ".zenLiveBotPresencePlate",
      ".signalBotPresencePlate",
      ".debateBotPresencePlate",
      '.coffeeSeatPlate[data-live-body-style="zen"]',
      ".coffeeReplayPlayerAvatar",
      ".botPanelHubAvatarPlate",
    ];
    const protectedProperties = /--zen-live-bot-(?:face-(?:x|y|scale)|avatar-face-glyph-size|eye-local-x)|--coffee-plate-emoji-nudge-y/;
    for (const match of pageCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1] ?? "";
      const body = match[2] ?? "";
      if (protectedSurfaceSelectors.some((surface) => selector.includes(surface))) {
        assert.doesNotMatch(body, protectedProperties, selector.trim());
      }
    }
    assert.doesNotMatch(
      pageCss,
      /\.signalBotPresencePlate[^{}]*\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*translate:/,
      "Signal may place the chassis but not translate the internal screen rig",
    );
  });

  it("uses the canonical Mini tier for Story and leaves Slate non-visual", () => {
    const storyAvatar = pageSource.slice(
      pageSource.indexOf("className={styles.storySpriteWrap}"),
      pageSource.indexOf("className={styles.storyDialogueBox}"),
    );
    assert.match(storyAvatar, /<EmptyStateHeroMiniBot/);
    assert.match(storyAvatar, /bot=\{npcActor\.bot\}/);
    assert.match(storyAvatar, /isTalking=\{npcActor\.isSpeaking\}/);
    assert.doesNotMatch(
      storyAvatar,
      /storySpriteFacePlate|storySpriteAsciiFace|storySpriteBrows/,
    );
    assert.doesNotMatch(
      pageCss,
      /\.storySprite(?:FacePlate|AsciiFace|Brows|ChestGlyph)\b/,
    );
    assert.doesNotMatch(
      pageSource,
      /data-slate[^\n]*(?:ZenLiveBotMannequin|ChatMiniBotAvatar|BotAvatarMicro)/,
      "Slate does not currently present a bot avatar surface",
    );
  });

  it("keeps Batch Foundry on the same registered Mini and Ink renderer", () => {
    const batchAvatar = pageSource.slice(
      pageSource.indexOf("function BotFoundryBatchSlotAvatar("),
      pageSource.indexOf("const BotAvatarScreen ="),
    );
    assert.match(batchAvatar, /<MiniAvatarDetailsInk/);
    assert.match(batchAvatar, /details=\{preview\.avatarDetails\}/);
    assert.match(batchAvatar, /botAvatarFaceRegistrationStyle\(batchHasAvatarArt\)/);
    assert.match(batchAvatar, /<ChatMiniBotAvatar/);
    assert.match(batchAvatar, /faceEyeOffsetX=\{batchFaceStyle\.eyeOffsetX\}/);
    assert.match(batchAvatar, /faceBlinkOffsetY=\{batchFaceStyle\.blinkOffsetY\}/);
    assert.match(batchAvatar, /faceMouthOffsetY=\{batchFaceStyle\.mouthOffsetY\}/);
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

describe("botAvatarFaceFacingStyle", () => {
  it("defines Avatar Studio's front-facing orientation as the default", () => {
    assert.deepEqual(BOT_AVATAR_CANONICAL_FACE_FACING_STYLE, {
      "--coffee-plate-emoji-face-scale-y":
        BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
      "--zen-live-bot-screen-facing-scale-x": "1",
      "--zen-live-bot-glyph-facing-scale-x": EXTERNAL_FACING_COUNTER_SCALE,
      "--avatar-details-facing-scale-x": "1",
    });
  });

  it("keeps canonical face and authored ink on one registration contract", () => {
    assert.deepEqual(
      botAvatarFaceFacingStyle(BOT_AVATAR_CANONICAL_FACING),
      {
        "--coffee-plate-emoji-face-scale-y":
          BOT_AVATAR_CANONICAL_FACE_SCALE_Y,
        "--zen-live-bot-screen-facing-scale-x": "1",
        "--zen-live-bot-glyph-facing-scale-x": EXTERNAL_FACING_COUNTER_SCALE,
        "--avatar-details-facing-scale-x": "1",
      },
    );
  });

  it("mirrors face and ink as one operation without translating either", () => {
    assert.deepEqual(botAvatarFaceFacingStyle("left"), {
      "--coffee-plate-emoji-face-scale-y": botAvatarFaceScaleYForFacing("left"),
      "--zen-live-bot-screen-facing-scale-x": "-1",
      "--zen-live-bot-glyph-facing-scale-x": EXTERNAL_FACING_COUNTER_SCALE,
      "--avatar-details-facing-scale-x": "-1",
    });
  });

  it("keeps the authored face and ink orientation coupled in both directions", () => {
    for (const facing of ["right", "left"] as const) {
      const style = botAvatarFaceFacingStyle(facing);
      assert.equal(
        style["--avatar-details-facing-scale-x"],
        botAvatarScreenFacingScaleX(facing),
      );
      assert.equal(
        style["--zen-live-bot-screen-facing-scale-x"],
        botAvatarScreenFacingScaleX(facing),
      );
      assert.equal(
        style["--zen-live-bot-glyph-facing-scale-x"],
        EXTERNAL_FACING_COUNTER_SCALE,
      );
    }
  });

  it("counter-mirrors lower glyphs when a room turns the complete chassis", () => {
    assert.match(
      debateCss,
      /\.debateAudienceBotPortrait\s*\{[^}]*--bot-avatar-external-facing-scale-x:\s*var\(\s*--debate-audience-facing-scale\s*\)/,
    );
    assert.match(
      debateCss,
      /\.debateAudienceBotPortrait > \[data-debate-bot-avatar="true"\]\s*\{[^}]*transform:\s*translateX\(-50%\) scaleX\(var\(--debate-audience-facing-scale\)\)/,
    );
    assert.match(
      debateCss,
      /\.debateAudienceBotPortrait > \[data-chat-mini-bot-avatar="true"\]\s*\{[^}]*transform:\s*translateX\(-50%\) scaleX\(var\(--debate-audience-facing-scale\)\)/,
    );
  });

  it("resolves facing directly on both complete face-and-ink screen rigs", () => {
    assert.match(
      pageSource,
      /const resolvedFacing = facing \?\? botAvatarFacingFromFaceScaleY\(faceScaleY\);[\s\S]*const screenFacingScaleX = showQuestionMark\s*\? "1"\s*:\s*botAvatarScreenFacingScaleX\(resolvedFacing\)/,
    );
    assert.equal(
      [
        ...pageSource.matchAll(
          /className=\{styles\.zenLiveBotPresenceScreenContentRig\}[\s\S]{0,280}\["--zen-live-bot-screen-facing-scale-x" as string\]:\s*screenFacingScaleX/g,
        ),
      ].length,
      2,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresenceBotGlyph\s*\{[\s\S]*?transform:\s*translate\(-50%, -50%\)\s*scaleX\(var\(--zen-live-bot-glyph-facing-scale-x, 1\)\)/,
      "the lower buckle stays upright while face and authored Ink may mirror",
    );
  });

  it("normalizes legacy full-avatar scale values into explicit directions", () => {
    assert.equal(botAvatarFacingFromFaceScaleY(-1), "right");
    assert.equal(botAvatarFacingFromFaceScaleY(1), "left");
  });

  it("forbids any post-flip Ink translation inside the shared screen rig", () => {
    const screenContentRigRule = [
      ...pageCss.matchAll(/\.zenLiveBotPresenceScreenContentRig\s*\{[^}]*\}/g),
    ].find((rule) => rule[0].includes("--avatar-details-facing-scale-x"))?.[0];
    assert.ok(screenContentRigRule);
    assert.match(
      screenContentRigRule,
      /--avatar-details-facing-scale-x:\s*1/,
      "the full screen rig must remain the sole horizontal mirror",
    );
    assert.doesNotMatch(
      screenContentRigRule,
      /--avatar-details-facing-offset-y\s*:/,
      "the Ink layer may mirror but must never move after authoring",
    );
  });

  it("keeps Avatar Studio's mini glyph aligned with the full private preview", () => {
    assert.match(
      pageCss,
      /\.appLayout\[data-private-active="true"\][\s\S]*?\.botAvatarStudioMiniPreview[\s\S]*?\.emptyStateHeroMiniGlyph,[\s\S]*?\.appLayout\[data-zen-private-tone="true"\][\s\S]*?\.botAvatarStudioMiniPreview[\s\S]*?\.emptyStateHeroMiniGlyph\s*\{\s*transform:\s*rotate\(180deg\);\s*\}/,
      "the Studio mini should share the private runtime glyph rotation",
    );
    assert.match(
      pageCss,
      /\.appLayout\[data-private-active="true"\][\s\S]*?\.zenLiveBotPresencePlate[\s\S]*?\.zenLiveBotPresenceBotGlyph,[\s\S]*?\.appLayout\[data-zen-private-tone="true"\][\s\S]*?\.zenLiveBotPresencePlate[\s\S]*?\.zenLiveBotPresenceBotGlyph\s*\{[\s\S]*?rotate\(180deg\)[\s\S]*?scaleX\(var\(--zen-live-bot-glyph-facing-scale-x, 1\)\);\s*\}/,
      "the full Studio plate should retain the runtime private treatment",
    );
  });
});
