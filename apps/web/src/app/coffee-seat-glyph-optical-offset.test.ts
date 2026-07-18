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

  it("gives every cloned two-eye glyph the same screen-right baseline", () => {
    for (const [glyph, voicePreset] of [
      ["✦", "warm"],
      ["◇", "playful"],
      ["☀", "neutral"],
      ["⌖", "concise"],
      ["⊕", "formal"],
      ["⌃", "concise"],
    ] as const) {
      assert.deepEqual(
        coffeeSeatGlyphOpticalOffset({
          part: "eyes",
          glyph,
          voicePreset,
          rotateDeg: 90,
          pairedEye: true,
        }),
        { id: "paired-eye", x: 0, y: 0.13 },
      );
    }
  });

  it("does not move a single eye", () => {
    const baseArgs = {
      part: "eyes" as const,
      glyph: "⌖",
      voicePreset: "concise" as const,
      rotateDeg: 90,
    };
    assert.equal(coffeeSeatGlyphOpticalOffset(baseArgs), null);
  });
});
