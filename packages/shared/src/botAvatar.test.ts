import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  randomBotFaceStyle,
  resolveBotFaceStyle,
} from "./botAvatar.ts";

describe("bot avatar face style", () => {
  it("normalizes known face font ids only", () => {
    assert.equal(normalizeBotFaceFontId("warm"), "warm");
    assert.equal(normalizeBotFaceFontId("playful"), "playful");
    assert.equal(normalizeBotFaceFontId("unknown"), null);
    assert.equal(normalizeBotFaceFontId(null), null);
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
      mouthFont: "formal",
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
    });
    assert.deepEqual(resolveBotFaceStyle({}, null), {
      eyesFont: DEFAULT_BOT_FACE_FONT_ID,
      mouthFont: DEFAULT_BOT_FACE_FONT_ID,
      weight: DEFAULT_BOT_FACE_FONT_WEIGHT,
    });
  });

  it("keeps independently saved eyes and mouth fonts", () => {
    assert.deepEqual(
      resolveBotFaceStyle(
        { faceEyesFont: "concise", faceMouthFont: "playful", faceFontWeight: 725 },
        "formal"
      ),
      {
        eyesFont: "concise",
        mouthFont: "playful",
        weight: 725,
      }
    );
  });

  it("randomizes face style within allowed bounds", () => {
    const values = [0, 0, 0.99, 0.51];
    const style = randomBotFaceStyle(() => values.shift() ?? 0);
    assert.equal(style.eyesFont, "neutral");
    assert.equal(style.mouthFont, "formal");
    assert.equal(style.weight >= BOT_FACE_FONT_WEIGHT_MIN, true);
    assert.equal(style.weight <= BOT_FACE_FONT_WEIGHT_MAX, true);
  });
});
