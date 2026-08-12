import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rendererSource = readFileSync(
  new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url),
  "utf8",
);

describe("Coffee seat talking blink behavior", () => {
  it("keeps normal blink timing enabled while speech drives the mouth", () => {
    assert.match(rendererSource, /blinkWhileTalking = true/);
    assert.match(
      rendererSource,
      /const talkingPausesBlink = isTalking && !blinkWhileTalking;/,
    );
    assert.match(
      rendererSource,
      /const talking = blinkWhileTalking && isTalkingRef\.current;\s+armBlink\(\s*coffeeSeatBlinkGapMs\(talking\),/,
    );
  });
});
