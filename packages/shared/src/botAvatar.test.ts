import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACE_BLINK_BAR_VALUES,
  BOT_FACE_EYE_SCALE_MAX,
  BOT_FACE_EYE_SCALE_MIN,
  BOT_FACE_FONT_LABELS,
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  BOT_FACE_MOUTH_SCALE_MAX,
  BOT_FACE_MOUTH_SCALE_MIN,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_BLINK_OFFSET_X,
  DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
  DEFAULT_BOT_FACE_BLINK_SCALE,
  DEFAULT_BOT_FACE_EYE_OFFSET_X,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_COUNT,
  DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  DEFAULT_BOT_FACE_GLYPH_ANIMATION,
  DEFAULT_BOT_FACE_MOUTH_CHARACTER,
  DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
  DEFAULT_BOT_FACE_MOUTH_SCALE,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  DISABLED_BOT_FACE_THINKING_FRAMES,
  botFaceThinkingSpinnerDisabled,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceBlinkOffsetX,
  normalizeBotFaceBlinkOffsetY,
  normalizeBotFaceBlinkScale,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeCount,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceGlyphAnimation,
  normalizeBotFaceMouthCharacter,
  normalizeBotFaceMouthCoffeePucker,
  normalizeBotFaceMouthOffsetX,
  normalizeBotFaceMouthOffsetY,
  normalizeBotFaceMouthRotationDeg,
  normalizeBotFaceMouthScale,
  normalizeBotFaceThinkingFrames,
  parseStoredBotFaceThinkingFrames,
  randomBotFaceStyle,
  resolveBotFaceStyle,
  serializeBotFaceThinkingFrames,
} from "./botAvatar.ts";

describe("bot avatar face style", () => {
  it("offers an empty-space default blink and keeps the broken bar as a built-in", () => {
    assert.equal(DEFAULT_BOT_FACE_BLINK_BAR, " ");
    assert.equal(resolveBotFaceStyle({}, null).blinkBar, " ");
    assert.deepEqual(Array.from(BOT_FACE_BLINK_BAR_VALUES), [
      "none",
      DEFAULT_BOT_FACE_BLINK_BAR,
      "❘",
      "¦",
    ]);
  });

  it("labels the concise face font as the Doto matrix style", () => {
    assert.equal(BOT_FACE_FONT_LABELS.concise, "Doto");
  });

  it("normalizes known face font ids only", () => {
    assert.equal(normalizeBotFaceFontId("warm"), "warm");
    assert.equal(normalizeBotFaceFontId("playful"), "playful");
    assert.equal(normalizeBotFaceFontId("unknown"), null);
    assert.equal(normalizeBotFaceFontId(null), null);
  });

  it("normalizes only supported custom glyph animations", () => {
    for (const animation of ["none", "pulsate", "spin", "flicker", "wobble"]) {
      assert.equal(normalizeBotFaceGlyphAnimation(animation), animation);
    }
    assert.equal(normalizeBotFaceGlyphAnimation("bounce"), null);
    assert.equal(normalizeBotFaceGlyphAnimation(null), null);
  });

  it("accepts broad single eye glyphs while rejecting emoji presentation", () => {
    assert.equal(normalizeBotFaceEyeCharacter(" "), " ");
    assert.equal(normalizeBotFaceEyeCharacter("  =  "), "=");
    assert.equal(normalizeBotFaceEyeCharacter("8)"), "8");
    assert.equal(normalizeBotFaceEyeCharacter("♥"), "♥");
    assert.equal(normalizeBotFaceEyeCharacter("☀"), "☀");
    assert.equal(normalizeBotFaceEyeCharacter("ಠ"), "ಠ");
    assert.equal(normalizeBotFaceEyeCharacter("💩"), null);
    assert.equal(normalizeBotFaceEyeCharacter("👁️"), null);
    assert.equal(normalizeBotFaceEyeCharacter("❤️"), null);
    assert.equal(normalizeBotFaceEyeCharacter("1️⃣"), null);
    assert.equal(normalizeBotFaceEyeCharacter(""), null);
    assert.equal(normalizeBotFaceEyeCharacter("   "), null);
    assert.equal(normalizeBotFaceEyeCharacter(null), null);
  });

  it("accepts one or two custom eyes and defaults legacy styles to one", () => {
    assert.equal(DEFAULT_BOT_FACE_EYE_COUNT, 1);
    assert.equal(normalizeBotFaceEyeCount(1), 1);
    assert.equal(normalizeBotFaceEyeCount(2), 2);
    assert.equal(normalizeBotFaceEyeCount(0), null);
    assert.equal(normalizeBotFaceEyeCount(3), null);
    assert.equal(normalizeBotFaceEyeCount("2"), null);
    assert.equal(resolveBotFaceStyle({ faceEyeCharacter: "⦿" }).eyeCount, 1);
    assert.equal(
      resolveBotFaceStyle({ faceEyeCharacter: "⦿", faceEyeCount: 2 })
        .eyeCount,
      2,
    );
    assert.equal(resolveBotFaceStyle({ faceEyeCount: 2 }).eyeCount, 1);
  });

  it("accepts broad single mouth glyphs while rejecting emoji presentation", () => {
    assert.equal(normalizeBotFaceMouthCharacter(" "), " ");
    assert.equal(normalizeBotFaceMouthCharacter("  △  "), "△");
    assert.equal(normalizeBotFaceMouthCharacter("Vv"), "V");
    assert.equal(normalizeBotFaceMouthCharacter("※"), "※");
    assert.equal(normalizeBotFaceMouthCharacter("©"), "©");
    assert.equal(normalizeBotFaceMouthCharacter("😂"), null);
    assert.equal(normalizeBotFaceMouthCharacter(""), null);
    assert.equal(normalizeBotFaceMouthCharacter(null), null);
  });

  it("clamps and steps face font weight", () => {
    assert.equal(normalizeBotFaceFontWeight(612), 600);
    assert.equal(normalizeBotFaceFontWeight(613), 625);
    assert.equal(normalizeBotFaceFontWeight(100), BOT_FACE_FONT_WEIGHT_MIN);
    assert.equal(normalizeBotFaceFontWeight(999), BOT_FACE_FONT_WEIGHT_MAX);
    assert.equal(normalizeBotFaceFontWeight("600"), null);
  });

  it("falls back to voice preset for legacy bots without saved face fonts", () => {
    assert.deepEqual(resolveBotFaceStyle({}, "formal"), {
      eyesFont: "formal",
      eyeCharacter: null,
      eyeCount: DEFAULT_BOT_FACE_EYE_COUNT,
      eyeAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      mouthFont: "formal",
      mouthCharacter: DEFAULT_BOT_FACE_MOUTH_CHARACTER,
      mouthAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      mouthCoffeePucker: DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetX: DEFAULT_BOT_FACE_EYE_OFFSET_X,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      eyeRotationDeg: DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
      mouthScale: DEFAULT_BOT_FACE_MOUTH_SCALE,
      mouthOffsetX: DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      mouthRotationDeg: DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
      blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
      blinkScale: DEFAULT_BOT_FACE_BLINK_SCALE,
      blinkOffsetX: DEFAULT_BOT_FACE_BLINK_OFFSET_X,
      blinkOffsetY: DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
      thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
    });
    assert.deepEqual(resolveBotFaceStyle({}, null), {
      eyesFont: DEFAULT_BOT_FACE_FONT_ID,
      eyeCharacter: null,
      eyeCount: DEFAULT_BOT_FACE_EYE_COUNT,
      eyeAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      mouthFont: DEFAULT_BOT_FACE_FONT_ID,
      mouthCharacter: DEFAULT_BOT_FACE_MOUTH_CHARACTER,
      mouthAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
      mouthCoffeePucker: DEFAULT_BOT_FACE_MOUTH_COFFEE_PUCKER,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetX: DEFAULT_BOT_FACE_EYE_OFFSET_X,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      eyeRotationDeg: DEFAULT_BOT_FACE_EYE_ROTATION_DEG,
      mouthScale: DEFAULT_BOT_FACE_MOUTH_SCALE,
      mouthOffsetX: DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      mouthRotationDeg: DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
      blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
      blinkScale: DEFAULT_BOT_FACE_BLINK_SCALE,
      blinkOffsetX: DEFAULT_BOT_FACE_BLINK_OFFSET_X,
      blinkOffsetY: DEFAULT_BOT_FACE_BLINK_OFFSET_Y,
      thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
    });
  });

  it("keeps independently saved eyes, custom eye character, face placement, blink, thinking frames, and mouth fonts", () => {
    assert.deepEqual(
      resolveBotFaceStyle(
        {
          faceEyesFont: "concise",
          faceEyeCharacter: "B)",
          faceEyeCount: 2,
          faceEyeAnimation: "wobble",
          faceMouthFont: "playful",
          faceMouthCharacter: "△▽",
          faceMouthAnimation: "flicker",
          faceMouthCoffeePucker: true,
          faceFontWeight: 725,
          faceEyeScale: 1.18,
          faceEyeOffsetX: 0.071,
          faceEyeOffsetY: -0.084,
          faceEyeRotationDeg: -47,
          faceMouthScale: 1.22,
          faceMouthOffsetX: -0.071,
          faceMouthOffsetY: 0.071,
          faceMouthRotationDeg: 47,
          faceBlinkBar: "¦",
          faceBlinkScale: 1.18,
          faceBlinkOffsetX: -0.071,
          faceBlinkOffsetY: 0.071,
          faceThinkingFrames: ["·", "*", "✦", "*"],
        },
        "formal"
      ),
      {
        eyesFont: "concise",
        eyeCharacter: "B",
        eyeCount: 2,
        eyeAnimation: DEFAULT_BOT_FACE_GLYPH_ANIMATION,
        mouthFont: "playful",
        mouthCharacter: "△",
        mouthAnimation: "flicker",
        mouthCoffeePucker: true,
        weight: 725,
        eyeScale: 1.2,
        eyeOffsetX: 0.08,
        eyeOffsetY: -0.08,
        eyeRotationDeg: -45,
        mouthScale: 1.2,
        mouthOffsetX: -0.08,
        mouthOffsetY: 0.08,
        mouthRotationDeg: 45,
        blinkBar: "¦",
        blinkScale: 1.2,
        blinkOffsetX: -0.08,
        blinkOffsetY: 0.08,
        thinkingFrames: ["·", "*", "✦", "*"],
      }
    );
  });

  it("normalizes Coffee pucker choices while keeping legacy custom mouths unchanged", () => {
    assert.equal(normalizeBotFaceMouthCoffeePucker(true), true);
    assert.equal(normalizeBotFaceMouthCoffeePucker(1), true);
    assert.equal(normalizeBotFaceMouthCoffeePucker(false), false);
    assert.equal(normalizeBotFaceMouthCoffeePucker(0), false);
    assert.equal(normalizeBotFaceMouthCoffeePucker("true"), null);
    assert.equal(
      resolveBotFaceStyle({ faceMouthCharacter: "△" }).mouthCoffeePucker,
      false,
    );
  });

  it("locks built-in eyes and mouths to default horizontal placement", () => {
    const style = resolveBotFaceStyle(
      {
        faceEyeOffsetX: 0.12,
        faceEyeOffsetY: -0.08,
        faceMouthOffsetX: -0.12,
        faceMouthOffsetY: 0.08,
      },
      null
    );

    assert.equal(style.eyeCharacter, null);
    assert.equal(style.eyeCount, DEFAULT_BOT_FACE_EYE_COUNT);
    assert.equal(style.eyeAnimation, DEFAULT_BOT_FACE_GLYPH_ANIMATION);
    assert.equal(style.eyeOffsetX, DEFAULT_BOT_FACE_EYE_OFFSET_X);
    assert.equal(style.eyeOffsetY, -0.08);
    assert.equal(style.mouthCharacter, DEFAULT_BOT_FACE_MOUTH_CHARACTER);
    assert.equal(style.mouthAnimation, DEFAULT_BOT_FACE_GLYPH_ANIMATION);
    assert.equal(style.mouthOffsetX, DEFAULT_BOT_FACE_MOUTH_OFFSET_X);
    assert.equal(style.mouthOffsetY, 0.08);
  });

  it("defaults custom eye rotation to plate-relative zero", () => {
    assert.equal(DEFAULT_BOT_FACE_EYE_ROTATION_DEG, 0);
  });

  it("clamps and steps eye scale, mouth scale, face placement, and mouth rotation", () => {
    assert.equal(normalizeBotFaceEyeScale(1.17), 1.15);
    assert.equal(normalizeBotFaceEyeScale(0.2), 0.7);
    assert.equal(normalizeBotFaceEyeScale(2), 1.3);
    assert.equal(normalizeBotFaceEyeScale("1"), null);
    assert.equal(normalizeBotFaceMouthScale(1.22), 1.2);
    assert.equal(normalizeBotFaceMouthScale(0.2), 0.7);
    assert.equal(normalizeBotFaceMouthScale(2), 1.5);
    assert.equal(normalizeBotFaceMouthScale("1"), null);
    assert.equal(normalizeBotFaceEyeOffsetX(0.071), 0.08);
    assert.equal(normalizeBotFaceEyeOffsetX(-2), -0.18);
    assert.equal(normalizeBotFaceEyeOffsetX(2), 0.18);
    assert.equal(normalizeBotFaceEyeOffsetX("0"), null);
    assert.equal(normalizeBotFaceEyeOffsetY(0.071), 0.08);
    assert.equal(normalizeBotFaceEyeOffsetY(-2), -0.18);
    assert.equal(normalizeBotFaceEyeOffsetY(2), 0.18);
    assert.equal(normalizeBotFaceEyeOffsetY("0"), null);
    assert.equal(normalizeBotFaceMouthOffsetX(0.071), 0.08);
    assert.equal(normalizeBotFaceMouthOffsetX(-2), -0.18);
    assert.equal(normalizeBotFaceMouthOffsetX(2), 0.18);
    assert.equal(normalizeBotFaceMouthOffsetX("0"), null);
    assert.equal(normalizeBotFaceMouthOffsetY(0.071), 0.08);
    assert.equal(normalizeBotFaceMouthOffsetY(-2), -0.18);
    assert.equal(normalizeBotFaceMouthOffsetY(2), 0.18);
    assert.equal(normalizeBotFaceMouthOffsetY("0"), null);
    assert.equal(normalizeBotFaceMouthRotationDeg(47), 45);
    assert.equal(normalizeBotFaceMouthRotationDeg(-999), -180);
    assert.equal(normalizeBotFaceMouthRotationDeg(999), 180);
    assert.equal(normalizeBotFaceMouthRotationDeg("45"), null);
  });

  it("normalizes blink bars to one visible custom character", () => {
    assert.equal(normalizeBotFaceBlinkBar("|"), "|");
    assert.equal(normalizeBotFaceBlinkBar(" "), DEFAULT_BOT_FACE_BLINK_BAR);
    assert.equal(normalizeBotFaceBlinkBar("  ❘  "), "❘");
    assert.equal(normalizeBotFaceBlinkBar("::"), ":");
    assert.equal(normalizeBotFaceBlinkBar("😂"), null);
    assert.equal(normalizeBotFaceBlinkBar("none"), "none");
    assert.equal(normalizeBotFaceBlinkBar(""), DEFAULT_BOT_FACE_BLINK_BAR);
    assert.equal(normalizeBotFaceBlinkBar("   "), DEFAULT_BOT_FACE_BLINK_BAR);
    assert.equal(normalizeBotFaceBlinkBar(null), null);
    assert.equal(
      resolveBotFaceStyle({ faceBlinkBar: null }, null).blinkBar,
      DEFAULT_BOT_FACE_BLINK_BAR
    );
  });

  it("clamps and steps custom blink scale and placement", () => {
    assert.equal(normalizeBotFaceBlinkScale(1.18), 1.2);
    assert.equal(normalizeBotFaceBlinkScale(2), 1.3);
    assert.equal(normalizeBotFaceBlinkOffsetX(-0.071), -0.08);
    assert.equal(normalizeBotFaceBlinkOffsetY(0.071), 0.08);
    assert.equal(normalizeBotFaceBlinkOffsetX(-2), -0.18);
    assert.equal(normalizeBotFaceBlinkOffsetY(2), 0.18);
  });

  it("normalizes thinking frames from arrays and pasted strings", () => {
    assert.deepEqual(normalizeBotFaceThinkingFrames(["|", "/", "-", "\\"]), [
      "|",
      "/",
      "-",
      "\\",
    ]);
    assert.deepEqual(normalizeBotFaceThinkingFrames(" . o O o "), [
      ".",
      "o",
      "O",
      "o",
    ]);
    assert.deepEqual(normalizeBotFaceThinkingFrames(["·", "*", "✦", "*"]), [
      "·",
      "*",
      "✦",
      "*",
    ]);
    assert.deepEqual(normalizeBotFaceThinkingFrames(["  ◐  ", "◓", "◑", "◒"]), [
      "◐",
      "◓",
      "◑",
      "◒",
    ]);
    assert.deepEqual(
      normalizeBotFaceThinkingFrames(["", " ", "", ""]),
      DISABLED_BOT_FACE_THINKING_FRAMES
    );
    assert.equal(
      botFaceThinkingSpinnerDisabled(DISABLED_BOT_FACE_THINKING_FRAMES),
      true
    );
    assert.equal(
      botFaceThinkingSpinnerDisabled(DEFAULT_BOT_FACE_THINKING_FRAMES),
      false
    );
  });

  it("rejects emoji graphemes for custom thinking frames", () => {
    assert.equal(normalizeBotFaceThinkingFrames("🙂🙃🙂🙃"), null);
    assert.equal(normalizeBotFaceThinkingFrames(["👁️", "✨", "🌀", "💭"]), null);
    assert.equal(normalizeBotFaceThinkingFrames(["|", "💩", "-", "\\"]), null);
    assert.deepEqual(
      resolveBotFaceStyle({ faceThinkingFrames: ["|", "💩", "-", "\\"] }, null)
        .thinkingFrames,
      DEFAULT_BOT_FACE_THINKING_FRAMES
    );
  });

  it("rejects invalid thinking frames and falls back in resolved styles", () => {
    assert.equal(normalizeBotFaceThinkingFrames(["|", "/"]), null);
    assert.equal(normalizeBotFaceThinkingFrames(["|", "/", "-", "\\", "."]), null);
    assert.equal(normalizeBotFaceThinkingFrames(["|", "/", "", "\\"]), null);
    assert.equal(normalizeBotFaceThinkingFrames(null), null);
    assert.deepEqual(
      resolveBotFaceStyle({ faceThinkingFrames: ["|", "/"] }, null).thinkingFrames,
      DEFAULT_BOT_FACE_THINKING_FRAMES
    );
  });

  it("serializes and parses stored thinking frame JSON", () => {
    const serialized = serializeBotFaceThinkingFrames(["?", "!", "?", "…"]);
    assert.equal(serialized, '["?","!","?","…"]');
    assert.deepEqual(parseStoredBotFaceThinkingFrames(serialized), [
      "?",
      "!",
      "?",
      "…",
    ]);
    const disabledSerialized = serializeBotFaceThinkingFrames(
      DISABLED_BOT_FACE_THINKING_FRAMES
    );
    assert.equal(disabledSerialized, '["","","",""]');
    assert.deepEqual(
      parseStoredBotFaceThinkingFrames(disabledSerialized),
      DISABLED_BOT_FACE_THINKING_FRAMES
    );
    assert.equal(serializeBotFaceThinkingFrames(["?", "!"]), null);
    assert.equal(parseStoredBotFaceThinkingFrames("[broken"), null);
  });

  it("randomizes face style within allowed bounds", () => {
    const values = [0, 0, 0.99, 0.2, 0.8, 0.25, 0.75];
    const style = randomBotFaceStyle(() => values.shift() ?? 0);
    assert.equal(style.eyesFont, "neutral");
    assert.equal(style.eyeCharacter, null);
    assert.equal(style.eyeCount, DEFAULT_BOT_FACE_EYE_COUNT);
    assert.equal(style.mouthFont, "formal");
    assert.equal(style.mouthCharacter, DEFAULT_BOT_FACE_MOUTH_CHARACTER);
    assert.equal(style.weight >= BOT_FACE_FONT_WEIGHT_MIN, true);
    assert.equal(style.weight <= BOT_FACE_FONT_WEIGHT_MAX, true);
    assert.equal(style.eyeScale >= BOT_FACE_EYE_SCALE_MIN, true);
    assert.equal(style.eyeScale <= BOT_FACE_EYE_SCALE_MAX, true);
    assert.equal(style.eyeOffsetX, DEFAULT_BOT_FACE_EYE_OFFSET_X);
    assert.equal(style.eyeOffsetY, DEFAULT_BOT_FACE_EYE_OFFSET_Y);
    assert.equal(style.eyeRotationDeg, DEFAULT_BOT_FACE_EYE_ROTATION_DEG);
    assert.equal(style.mouthScale >= BOT_FACE_MOUTH_SCALE_MIN, true);
    assert.equal(style.mouthScale <= BOT_FACE_MOUTH_SCALE_MAX, true);
    assert.equal(style.mouthOffsetX, DEFAULT_BOT_FACE_MOUTH_OFFSET_X);
    assert.equal(style.mouthOffsetY, DEFAULT_BOT_FACE_MOUTH_OFFSET_Y);
    assert.equal(style.mouthRotationDeg, DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG);
    assert.equal(style.blinkBar, DEFAULT_BOT_FACE_BLINK_BAR);
    assert.deepEqual(style.thinkingFrames, DEFAULT_BOT_FACE_THINKING_FRAMES);
  });

  it("can randomize eye and mouth sizes to slider extremes without custom glyphs or placement", () => {
    const smallStyle = randomBotFaceStyle(() => 0);
    assert.equal(smallStyle.eyeCharacter, null);
    assert.equal(smallStyle.mouthCharacter, DEFAULT_BOT_FACE_MOUTH_CHARACTER);
    assert.equal(smallStyle.eyeScale, BOT_FACE_EYE_SCALE_MIN);
    assert.equal(smallStyle.mouthScale, BOT_FACE_MOUTH_SCALE_MIN);
    assert.equal(smallStyle.eyeOffsetX, DEFAULT_BOT_FACE_EYE_OFFSET_X);
    assert.equal(smallStyle.eyeOffsetY, DEFAULT_BOT_FACE_EYE_OFFSET_Y);
    assert.equal(smallStyle.mouthOffsetX, DEFAULT_BOT_FACE_MOUTH_OFFSET_X);
    assert.equal(smallStyle.mouthOffsetY, DEFAULT_BOT_FACE_MOUTH_OFFSET_Y);

    const largeStyle = randomBotFaceStyle(() => 1);
    assert.equal(largeStyle.eyeCharacter, null);
    assert.equal(largeStyle.mouthCharacter, DEFAULT_BOT_FACE_MOUTH_CHARACTER);
    assert.equal(largeStyle.eyeScale, BOT_FACE_EYE_SCALE_MAX);
    assert.equal(largeStyle.mouthScale, BOT_FACE_MOUTH_SCALE_MAX);
    assert.equal(largeStyle.eyeOffsetX, DEFAULT_BOT_FACE_EYE_OFFSET_X);
    assert.equal(largeStyle.eyeOffsetY, DEFAULT_BOT_FACE_EYE_OFFSET_Y);
    assert.equal(largeStyle.mouthOffsetX, DEFAULT_BOT_FACE_MOUTH_OFFSET_X);
    assert.equal(largeStyle.mouthOffsetY, DEFAULT_BOT_FACE_MOUTH_OFFSET_Y);
  });
});
