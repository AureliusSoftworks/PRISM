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
  it("keeps every authored mouth animation active while the bot talks", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-animation=\{\s*renderedFaceMouthCharacter\s*\?\s*normalizedFaceMouthAnimation\s*:\s*undefined\s*\}/,
    );
    assert.doesNotMatch(
      coffeeSeatPlateEmojiSource,
      /data-face-mouth-animation=\{[\s\S]{0,160}hasCustomMouth && isTalking/,
    );
  });
});
