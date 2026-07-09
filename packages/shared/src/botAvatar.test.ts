import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACE_FONT_LABELS,
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
  DEFAULT_BOT_FACE_THINKING_FRAMES,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  normalizeBotFaceMouthOffsetY,
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
    assert.equal(normalizeBotFaceEyeCharacter(""), null);
    assert.equal(normalizeBotFaceEyeCharacter("   "), null);
    assert.equal(normalizeBotFaceEyeCharacter(null), null);
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
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
      blinkBar: DEFAULT_BOT_FACE_BLINK_BAR,
      thinkingFrames: DEFAULT_BOT_FACE_THINKING_FRAMES,
    });
    assert.deepEqual(resolveBotFaceStyle({}, null), {
      eyesFont: DEFAULT_BOT_FACE_FONT_ID,
      eyeCharacter: null,
      mouthFont: DEFAULT_BOT_FACE_FONT_ID,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
      eyeScale: DEFAULT_BOT_FACE_EYE_SCALE,
      eyeOffsetY: DEFAULT_BOT_FACE_EYE_OFFSET_Y,
      mouthOffsetY: DEFAULT_BOT_FACE_MOUTH_OFFSET_Y,
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
          faceFontWeight: 725,
          faceEyeScale: 1.18,
          faceEyeOffsetY: -0.084,
          faceMouthOffsetY: 0.071,
          faceBlinkBar: "¦",
          faceThinkingFrames: ["·", "*", "✦", "*"],
        },
        "formal"
      ),
      {
        eyesFont: "concise",
        eyeCharacter: "B",
        mouthFont: "playful",
        weight: 725,
        eyeScale: 1.2,
        eyeOffsetY: -0.08,
        mouthOffsetY: 0.08,
        blinkBar: "¦",
        thinkingFrames: ["·", "*", "✦", "*"],
      }
    );
  });

  it("clamps and steps eye scale and vertical face placement", () => {
    assert.equal(normalizeBotFaceEyeScale(1.17), 1.15);
    assert.equal(normalizeBotFaceEyeScale(0.2), 0.7);
    assert.equal(normalizeBotFaceEyeScale(2), 1.3);
    assert.equal(normalizeBotFaceEyeScale("1"), null);
    assert.equal(normalizeBotFaceEyeOffsetY(0.071), 0.08);
    assert.equal(normalizeBotFaceEyeOffsetY(-2), -0.18);
    assert.equal(normalizeBotFaceEyeOffsetY(2), 0.18);
    assert.equal(normalizeBotFaceEyeOffsetY("0"), null);
    assert.equal(normalizeBotFaceMouthOffsetY(0.071), 0.08);
    assert.equal(normalizeBotFaceMouthOffsetY(-2), -0.18);
    assert.equal(normalizeBotFaceMouthOffsetY(2), 0.18);
    assert.equal(normalizeBotFaceMouthOffsetY("0"), null);
  });

  it("normalizes blink bars to one visible custom character", () => {
    assert.equal(normalizeBotFaceBlinkBar("|"), "|");
    assert.equal(normalizeBotFaceBlinkBar("  ❘  "), "❘");
    assert.equal(normalizeBotFaceBlinkBar("::"), ":");
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

  it("keeps emoji graphemes intact for thinking frames", () => {
    assert.deepEqual(normalizeBotFaceThinkingFrames("🙂🙃🙂🙃"), [
      "🙂",
      "🙃",
      "🙂",
      "🙃",
    ]);
    assert.deepEqual(normalizeBotFaceThinkingFrames(["👁️", "✨", "🌀", "💭"]), [
      "👁️",
      "✨",
      "🌀",
      "💭",
    ]);
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
    assert.equal(style.weight >= BOT_FACE_FONT_WEIGHT_MIN, true);
    assert.equal(style.weight <= BOT_FACE_FONT_WEIGHT_MAX, true);
    assert.equal(style.eyeScale, DEFAULT_BOT_FACE_EYE_SCALE);
    assert.equal(style.eyeOffsetY, DEFAULT_BOT_FACE_EYE_OFFSET_Y);
    assert.equal(style.mouthOffsetY, DEFAULT_BOT_FACE_MOUTH_OFFSET_Y);
    assert.equal(style.blinkBar, DEFAULT_BOT_FACE_BLINK_BAR);
    assert.deepEqual(style.thinkingFrames, DEFAULT_BOT_FACE_THINKING_FRAMES);
  });
});
