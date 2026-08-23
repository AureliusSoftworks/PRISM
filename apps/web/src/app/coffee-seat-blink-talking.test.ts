import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rendererSource = readFileSync(
  new URL("./CoffeeSeatPlateEmoji.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee seat talking blink behavior", () => {
  it("keeps the identical normal blink cadence while speech drives the mouth", () => {
    assert.match(rendererSource, /blinkWhileTalking = true/);
    assert.match(
      rendererSource,
      /const talkingPausesBlink = effectiveTalking && !blinkWhileTalking;/,
    );
    assert.match(
      rendererSource,
      /function coffeeSeatBlinkGapMs\(\): number \{\s+return randomBetween\(1500, 4000\);/,
    );
    assert.match(
      rendererSource,
      /function coffeeSeatExtraBlinkCount\(\): number \{\s+const roll = Math\.random\(\);\s+if \(roll < 0\.05\) return 2;\s+if \(roll < 0\.22\) return 1;/,
    );
    assert.match(
      rendererSource,
      /const armNextBlink = \(\) => \{\s+armBlink\(coffeeSeatBlinkGapMs\(\), coffeeSeatExtraBlinkCount\(\)\);/,
    );
    assert.doesNotMatch(rendererSource, /TALKING_BLINK_GAP_MULTIPLIER/);
    assert.doesNotMatch(rendererSource, /isTalkingRef/);
  });

  it("keeps normal talking blinks enabled in the shared and live-mode consumers", () => {
    assert.match(
      pageSource,
      /function ZenLiveBotMannequin\([\s\S]*?blinkWhileTalking = true,/,
    );
    assert.match(
      pageSource,
      /isTalking: seatMouthActive,[\s\S]*?blinkWhileTalking: true,[\s\S]*?mouthShape: mouthShapeWhileTyping,/,
    );
    assert.match(
      pageSource,
      /isTalking: signalMannequinTalking,[\s\S]*?blinkWhileTalking: true,[\s\S]*?mouthShape: avatarState\.mouthShape,/,
    );
  });
});
