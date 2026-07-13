import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

describe("Coffee table reveal speed nudge", () => {
  it("wires the Zen-style press interaction to the table scene", () => {
    assert.match(
      pageSource,
      /data-coffee-table-scene="true"[\s\S]*onPointerDownCapture=\{handleCoffeeTableSpeedNudgePointerDown\}[\s\S]*onPointerUpCapture=\{handleCoffeeTableSpeedNudgePointerEnd\}/
    );
    assert.match(
      pageSource,
      /beginZenCanvasSpeedNudgeHold\([\s\S]*coffeeTableSpeedNudgeStateRef\.current/
    );
  });

  it("keeps voiced Coffee reveals synchronized to their audio clock", () => {
    assert.match(
      pageSource,
      /Spoken Coffee stays audio-master[\s\S]*coffeeVoiceRevealClockRef\.current\?\.messageId === pendingMessage\.id/
    );
    assert.match(pageSource, /voiceRevealActive \|\| reducedMotion[\s\S]*\? 1/);
  });
});
