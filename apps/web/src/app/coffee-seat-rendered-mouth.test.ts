import assert from "node:assert/strict";
import test from "node:test";

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
