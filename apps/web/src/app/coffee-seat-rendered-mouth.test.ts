import assert from "node:assert/strict";
import test from "node:test";

import { coffeeSeatPlateGlyph } from "./coffee-seat-plate.ts";
import { coffeeSeatRenderedMouthGlyph } from "./coffee-seat-rendered-mouth.ts";

test("uses a neutral bar for the closed portion of default speech", () => {
  assert.equal(
    coffeeSeatRenderedMouthGlyph({
      baseGlyph: ")",
      renderedFaceMouthCharacter: null,
      effectiveTalking: true,
      mouthShape: "closed",
    }),
    "|",
  );
});

test("restores the normal mouth when the bot is not talking", () => {
  assert.equal(
    coffeeSeatRenderedMouthGlyph({
      baseGlyph: ")",
      renderedFaceMouthCharacter: null,
      effectiveTalking: false,
      mouthShape: "closed",
    }),
    ")",
  );
});

test("keeps distinct ordinary Whodunnit mouths at idle and during speech", () => {
  const idleMouths = [
    { mood: "happy", expected: ")" },
    { mood: "warm", expected: "]" },
    { mood: "sad", expected: "(" },
  ] as const;
  for (const { mood, expected } of idleMouths) {
    const plate = coffeeSeatPlateGlyph(mood, "closed");
    assert.equal(
      coffeeSeatRenderedMouthGlyph({
        baseGlyph: Array.from(plate.text)[1]!,
        renderedFaceMouthCharacter: null,
        effectiveTalking: false,
        mouthShape: "closed",
      }),
      expected,
      `${mood} idle mouth`,
    );
  }

  const speechMouths = [
    { shape: "open-wide", expected: "0" },
    { shape: "open-small", expected: "o" },
    { shape: "open-round", expected: "O" },
  ] as const;
  for (const { shape, expected } of speechMouths) {
    const plate = coffeeSeatPlateGlyph("happy", shape);
    assert.equal(
      coffeeSeatRenderedMouthGlyph({
        baseGlyph: Array.from(plate.text)[1]!,
        renderedFaceMouthCharacter: null,
        effectiveTalking: true,
        mouthShape: shape,
      }),
      expected,
      `${shape} speech mouth`,
    );
  }
});

test("preserves explicitly authored static and Custom Speech mouths", () => {
  assert.equal(
    coffeeSeatRenderedMouthGlyph({
      baseGlyph: ")",
      renderedFaceMouthCharacter: "⌣",
      effectiveTalking: true,
      mouthShape: "closed",
    }),
    "⌣",
  );
  assert.equal(
    coffeeSeatRenderedMouthGlyph({
      baseGlyph: ")",
      customSpeechGlyph: "—",
      renderedFaceMouthCharacter: null,
      effectiveTalking: true,
      mouthShape: "closed",
    }),
    "—",
  );
});
