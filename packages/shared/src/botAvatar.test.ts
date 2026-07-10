import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACE_FONT_LABELS,
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_EYE_OFFSET_X,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  DEFAULT_BOT_FACE_MOUTH_CHARACTER,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
  DEFAULT_BOT_FACE_MOUTH_SCALE,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeOffsetX,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceMouthCharacter,
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
  it("labels the concise face font as a distinct sharp style", () => {
    assert.equal(BOT_FACE_FONT_LABELS.concise, "Sharp");
  });

  it("normalizes known face font ids only", () => {
    assert.equal(normalizeBotFaceFontId("warm"), "warm");
    assert.equal(normalizeBotFaceFontId("playful"), "playful");
    assert.equal(normalizeBotFaceFontId("unknown"), null);
    assert.equal(normalizeBotFaceFontId(null), null);
  });

  it("normalizes custom eye characters to one visible character", () => {
    assert.equal(normalizeBotFaceEyeCharacter("  =  "), "=");
    assert.equal(normalizeBotFaceEyeCharacter("8)"), "8");
    assert.equal(normalizeBotFaceEyeCharacter("💩"), null);
    assert.equal(normalizeBotFaceEyeCharacter("👁️"), null);
    assert.equal(normalizeBotFaceEyeCharacter(""), null);
    assert.equal(normalizeBotFaceEyeCharacter("   "), null);
    assert.equal(normalizeBotFaceEyeCharacter(null), null);
  });

  it("normalizes custom mouth characters to one visible character", () => {
    assert.equal(normalizeBotFaceMouthCharacter("  △  "), "△");
    assert.equal(normalizeBotFaceMouthCharacter("Vv"), "V");
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
      mouthFont: "formal",
      mouthCharacter: DEFAULT_BOT_FACE_MOUTH_CHARACTER,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetX: DEFAULT_BOT_FACE_EYE_OFFSET_X,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      mouthScale: DEFAULT_BOT_FACE_MOUTH_SCALE,
      mouthOffsetX: DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      mouthRotationDeg: DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
      blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
      thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
    });
    assert.deepEqual(resolveBotFaceStyle({}, null), {
      eyesFont: DEFAULT_BOT_FACE_FONT_ID,
      eyeCharacter: null,
      mouthFont: DEFAULT_BOT_FACE_FONT_ID,
      mouthCharacter: DEFAULT_BOT_FACE_MOUTH_CHARACTER,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetX: DEFAULT_BOT_FACE_EYE_OFFSET_X,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      mouthScale: DEFAULT_BOT_FACE_MOUTH_SCALE,
      mouthOffsetX: DEFAULT_BOT_FACE_MOUTH_OFFSET_X,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      mouthRotationDeg: DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG,
      blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
      thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
    });
  });

  it("keeps independently saved eyes, custom eye character, face placement, blink, thinking frames, and mouth fonts", () => {
    assert.deepEqual(
      resolveBotFaceStyle(
        {
          faceEyesFont: "concise",
          faceEyeCharacter: "B)",
          faceMouthFont: "playful",
          faceMouthCharacter: "△▽",
          faceFontWeight: 725,
          faceEyeScale: 1.18,
          faceEyeOffsetX: 0.071,
          faceEyeOffsetY: -0.084,
          faceMouthScale: 1.22,
          faceMouthOffsetX: -0.071,
          faceMouthOffsetY: 0.071,
          faceMouthRotationDeg: 47,
          faceBlinkBar: "¦",
          faceThinkingFrames: ["·", "*", "✦", "*"],
        },
        "formal"
      ),
      {
        eyesFont: "concise",
        eyeCharacter: "B",
        mouthFont: "playful",
        mouthCharacter: "△",
        weight: 725,
        eyeScale: 1.2,
        eyeOffsetX: 0.08,
        eyeOffsetY: -0.08,
        mouthScale: 1.2,
        mouthOffsetX: -0.08,
        mouthOffsetY: 0.08,
        mouthRotationDeg: 45,
        blinkBar: "¦",
        thinkingFrames: ["·", "*", "✦", "*"],
      }
    );
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
    assert.equal(normalizeBotFaceBlinkBar("  ❘  "), "❘");
    assert.equal(normalizeBotFaceBlinkBar("::"), ":");
    assert.equal(normalizeBotFaceBlinkBar("😂"), null);
    assert.equal(normalizeBotFaceBlinkBar("none"), "none");
    assert.equal(normalizeBotFaceBlinkBar(""), null);
    assert.equal(normalizeBotFaceBlinkBar("   "), null);
    assert.equal(normalizeBotFaceBlinkBar(null), null);
    assert.equal(
      resolveBotFaceStyle({ faceBlinkBar: null }, null).blinkBar,
      DEFAULT_BOT_FACE_BLINK_BAR
    );
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
    assert.equal(serializeBotFaceThinkingFrames(["?", "!"]), null);
    assert.equal(parseStoredBotFaceThinkingFrames("[broken"), null);
  });

  it("randomizes face style within allowed bounds", () => {
    const values = [0, 0, 0.99, 0.51];
    const style = randomBotFaceStyle(() => values.shift() ?? 0);
    assert.equal(style.eyesFont, "neutral");
    assert.equal(style.eyeCharacter, null);
    assert.equal(style.mouthFont, "formal");
    assert.equal(style.mouthCharacter, DEFAULT_BOT_FACE_MOUTH_CHARACTER);
    assert.equal(style.weight >= BOT_FACE_FONT_WEIGHT_MIN, true);
    assert.equal(style.weight <= BOT_FACE_FONT_WEIGHT_MAX, true);
    assert.equal(style.eyeScale, DEFAULT_BOT_FACE_EYE_SCALE);
    assert.equal(style.eyeOffsetX, DEFAULT_BOT_FACE_EYE_OFFSET_X);
    assert.equal(style.eyeOffsetY, DEFAULT_BOT_FACE_EYE_OFFSET_Y);
    assert.equal(style.mouthScale, DEFAULT_BOT_FACE_MOUTH_SCALE);
    assert.equal(style.mouthOffsetX, DEFAULT_BOT_FACE_MOUTH_OFFSET_X);
    assert.equal(style.mouthOffsetY, DEFAULT_BOT_FACE_MOUTH_OFFSET_Y);
    assert.equal(style.mouthRotationDeg, DEFAULT_BOT_FACE_MOUTH_ROTATION_DEG);
    assert.equal(style.blinkBar, DEFAULT_BOT_FACE_BLINK_BAR);
    assert.deepEqual(style.thinkingFrames, DEFAULT_BOT_FACE_THINKING_FRAMES);
  });
});
