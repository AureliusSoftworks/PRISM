import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const coffeeSeatPlateEmojiSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "CoffeeSeatPlateEmoji.tsx"),
  "utf8",
);

describe("live mouth animation attributes", () => {
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
      /const renderedFaceMouthCharacter =\s*hasCustomMouth\s*&&\s*isTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/,
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-character=\{renderedFaceMouthCharacter \?\? undefined\}/,
    );
  });

  it("falls back to viseme-driven lips when talking with Default custom mouth animation", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /hasCustomMouth\s*&&\s*isTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null/, // default path
    );
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-coffee-plate-mouth-shape=\{isTalking \? streamedMouthShape : undefined\}/,
    );
  });

  it("keeps custom mouth animation and glyph when talking with non-Default animation", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /hasCustomMouth\s*&&\s*isTalking\s*&&\s*normalizedFaceMouthAnimation\s*===\s*"none"\s*\?\s*null\s*:\s*normalizedFaceMouthCharacter/, // non-default path
    );
  });
});
