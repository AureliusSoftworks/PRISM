import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coffeeSeatGlyphOpticalOffset } from "./coffee-seat-glyph-optical-offset.ts";

describe("Coffee face glyph optical offsets", () => {
  it("corrects only the warm bracket mouth and broken-bar blink", () => {
    assert.equal(
      coffeeSeatGlyphOpticalOffset({
        part: "mouth",
        glyph: "]",
        voicePreset: "warm",
        rotateDeg: 0,
      })?.id,
      "warm-bracket",
    );
    assert.equal(
      coffeeSeatGlyphOpticalOffset({
        part: "eyes",
        glyph: "¦",
        voicePreset: "warm",
        rotateDeg: 0,
      })?.id,
      "warm-broken-bar",
    );
    assert.equal(
      coffeeSeatGlyphOpticalOffset({
        part: "mouth",
        glyph: "]",
        voicePreset: "neutral",
        rotateDeg: 0,
      }),
      null,
    );
    assert.equal(
      coffeeSeatGlyphOpticalOffset({
        part: "eyes",
        glyph: "|",
        voicePreset: "warm",
        rotateDeg: 0,
      }),
      null,
    );
  });

  it("converts the correction into the rotated face coordinate system", () => {
    const offset = coffeeSeatGlyphOpticalOffset({
      part: "mouth",
      glyph: "]",
      voicePreset: "warm",
      rotateDeg: 90,
    });
    assert.deepEqual(offset, { id: "warm-bracket", x: 0, y: -0.055 });
  });
});
