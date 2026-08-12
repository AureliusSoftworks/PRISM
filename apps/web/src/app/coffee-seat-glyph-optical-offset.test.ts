import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coffeeSeatGlyphOpticalOffset } from "./coffee-seat-glyph-optical-offset.ts";

describe("Coffee face glyph optical offsets", () => {
  it("puts every stock idle mood mouth in the neutral ink-authoring slot", () => {
    for (const glyph of [")", "]", "|", "[", "("]) {
      for (const voicePreset of [
        "warm",
        "playful",
        "neutral",
        "concise",
        "formal",
      ] as const) {
        assert.deepEqual(
          coffeeSeatGlyphOpticalOffset({
            part: "mouth",
            glyph,
            voicePreset,
            rotateDeg: 90,
          }),
          { id: "idle-mood-mouth-slot", x: 0, y: 0.055 },
        );
      }
    }
  });

  it("does not move a custom mouth into the stock idle slot", () => {
    for (const glyph of [")", "]", "|", "[", "("]) {
      assert.equal(
        coffeeSeatGlyphOpticalOffset({
          part: "mouth",
          glyph,
          voicePreset: "warm",
          rotateDeg: 90,
          customGlyph: true,
        }),
        null,
      );
    }
  });

  it("keeps the warm broken-bar blink correction", () => {
    assert.equal(
      coffeeSeatGlyphOpticalOffset({
        part: "eyes",
        glyph: "¦",
        voicePreset: "warm",
        rotateDeg: 0,
        blinkGlyph: "¦",
      })?.id,
      "warm-broken-bar",
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

  it("nudges single-eye closed blink glyphs toward screen-right", () => {
    assert.deepEqual(
      coffeeSeatGlyphOpticalOffset({
        part: "eyes",
        glyph: "¦",
        voicePreset: "neutral",
        rotateDeg: 0,
        blinkGlyph: "¦",
      }),
      {
        id: "single-eye-blink",
        x: 0.035,
        y: 0,
      },
    );
    assert.deepEqual(
      coffeeSeatGlyphOpticalOffset({
        part: "eyes",
        glyph: "|",
        voicePreset: "concise",
        rotateDeg: 45,
        blinkGlyph: "|",
      }),
      {
        id: "single-eye-blink",
        x: 0.025,
        y: -0.025,
      },
    );
  });

  it("converts the correction into the rotated face coordinate system", () => {
    const offset = coffeeSeatGlyphOpticalOffset({
      part: "mouth",
      glyph: "]",
      voicePreset: "neutral",
      rotateDeg: 90,
    });
    assert.deepEqual(offset, {
      id: "idle-mood-mouth-slot",
      x: 0,
      y: 0.055,
    });
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
          blinkGlyph: "¦",
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
