import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const coffeeSeatPlateEmojiSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "CoffeeSeatPlateEmoji.tsx"),
  "utf8",
);
const phosphorPixelGlyphSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "PhosphorPixelGlyph.tsx"),
  "utf8",
);

describe("live mouth animation attributes", () => {
  it("keeps none as Default and supports a distinct static option", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const mouthMotionEnabled = !staticFace/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const renderedFaceMouthCharacter =\s*mouthMotionEnabled\s*&&\s*hasCustomMouth\s*&&\s*effectiveTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-character=\{renderedFaceMouthCharacter \?\? undefined\}/,
    );
  });

  it("keeps non-default custom mouth animation active while the bot talks", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-animation=\{\s*renderedFaceMouthCharacter\s*\?\s*normalizedFaceMouthAnimation\s*:\s*undefined\s*\}/,
    );
    assert.doesNotMatch(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-animation=\{[\s\S]{0,160}hasCustomMouth && isTalking/,
    );
  });

  it("uses the authored custom mouth when idle", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const renderedFaceMouthCharacter =\s*mouthMotionEnabled\s*&&\s*hasCustomMouth\s*&&\s*effectiveTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-character=\{renderedFaceMouthCharacter \?\? undefined\}/,
    );
  });

  it("falls back to viseme-driven lips when talking with Default custom mouth animation", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /hasCustomMouth\s*&&\s*effectiveTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null/, // default path
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-mouth-shape=\{\s*effectiveTalking \? streamedMouthShape : undefined\s*\}/,
    );
  });

  it("keeps custom mouth animation and glyph when talking with non-Default animation", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /hasCustomMouth\s*&&\s*effectiveTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/, // non-default path
    );
  });

  it("keeps static custom mouths visible and unanimated while talking", () => {
    assert.doesNotMatch(
      coffeeSeatPlateEmojiSource,
      /hasCustomMouth\s*&&\s*effectiveTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"static"/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-animation=\{\s*renderedFaceMouthCharacter \? normalizedFaceMouthAnimation : undefined\s*\}/,
    );
  });

  it("keeps full and mini mouth motion active while reserving static for micro", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const normalizedFaceMouthAnimation = mouthMotionEnabled\s*\? configuredFaceMouthAnimation\s*: DEFAULT_BOT_FACE_GLYPH_ANIMATION/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /!mouthMotionEnabled \|\|\s*!renderedMouthGlyphForMotion/,
    );
  });

  it("does not synchronously rasterize every live speech glyph", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /const liveMouthGlyphSwapActive =\s*effectiveTalking &&\s*\(renderedFaceMouthCharacter === null \|\| customSpeechGlyph !== null\)/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /enabled=\{\s*pixelated &&\s*!\(part === "mouth" && liveMouthGlyphSwapActive\)\s*\}/,
    );
    assert.match(
      phosphorPixelGlyphSource,
      /enabled && renderedMask\?\.content === content \? renderedMask\.url : null/,
    );
  });

  it("writes the resolved live mouth glyph to both renderer-visible DOM layers", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /coffeeSeatRenderedMouthGlyph\(\{[\s\S]{0,180}baseGlyph: glyph,[\s\S]{0,180}customSpeechGlyph,[\s\S]{0,180}renderedFaceMouthCharacter/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-emoji-glyph=\{renderedGlyph\}/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /<CrtPixelTextGlyph[\s\S]{0,180}content=\{renderedGlyph\}/,
    );
  });
});
