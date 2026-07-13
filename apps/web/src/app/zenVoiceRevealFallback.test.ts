import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Zen voice reveal fallback", () => {
  it("releases visual text when synthesized speech stays in preparation", () => {
    assert.match(
      pageSource,
      /const ZEN_VOICE_REVEAL_PREPARATION_TIMEOUT_MS = 4000;/
    );
    assert.match(
      pageSource,
      /speechRevealTimelineWaitingForAudio\([\s\S]*?chatSpeechRevealVisualFallbackKeysRef\.current\.add\(revealKey\);[\s\S]*?releaseChatSpeechReveal\(revealKey\);[\s\S]*?chatMessageFirstSeenAtRef\.current\.set\(revealKey, Date\.now\(\)\);/
    );
  });

  it("makes Shh non-destructive before audio playback begins", () => {
    const handlerStart = pageSource.indexOf("const handleTypingIndicatorPress");
    const handlerEnd = pageSource.indexOf(
      "function finishActiveAssistantRevealForCompaction",
      handlerStart
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    assert.match(handlerSource, /speechRevealTimelineWaitingForAudio/);
    assert.match(handlerSource, /finishActiveAssistantRevealForCompaction\(\)/);
    assert.ok(
      handlerSource.indexOf("finishActiveAssistantRevealForCompaction()") <
        handlerSource.indexOf("prepareActiveAssistantRevealInterruption()")
    );
  });
});
