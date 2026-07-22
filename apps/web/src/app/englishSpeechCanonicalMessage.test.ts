import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function completedMessageVoiceEffect(): string {
  const start = pageSource.indexOf(
    "const assistantMessages = detail.messages.filter",
  );
  const end = pageSource.indexOf(
    "\n  useEffect(\n    () => () => {",
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return pageSource.slice(start, end);
}

describe("English speech canonical message ownership", () => {
  it("uses one message-id synthesis request and never commits transcript state", () => {
    const effectSource = completedMessageVoiceEffect();
    assert.equal(
      [...effectSource.matchAll(/requestEnglishResponse\(\{/g)].length,
      1,
    );
    assert.match(
      effectSource,
      /requestEnglishResponse\(\{[\s\S]*?messageId: message\.id,[\s\S]*?engine: effectiveEnglishEngine/,
    );
    assert.match(
      effectSource,
      /messageId: input\.messageId,[\s\S]*?detail\.incognito[\s\S]*?ephemeralMessage: true,[\s\S]*?spokenText: speechDisplayContent/,
    );
    assert.match(
      effectSource,
      /const speechLifecycle =[\s\S]*?startChatSpeechReveal\([\s\S]*?speechRevealKey,[\s\S]*?speechDisplayContent/,
    );
    assert.match(
      effectSource,
      /await enqueueEnglishVoice\([\s\S]*?message\.id,[\s\S]*?speechLifecycle\?\.\(clip\.alignment\)/,
    );
    assert.doesNotMatch(effectSource, /buildSpeechRevealPhrases/);
    assert.doesNotMatch(effectSource, /\bsetDetail\(/);
  });

  it("hands partial speech progress to the canvas clock in place", () => {
    const handoffStart = pageSource.indexOf(
      "const handoffChatSpeechRevealToCanvasClock",
    );
    const handoffEnd = pageSource.indexOf("useEffect(() => {", handoffStart);
    assert.notEqual(handoffStart, -1);
    assert.notEqual(handoffEnd, -1);
    const handoffSource = pageSource.slice(handoffStart, handoffEnd);
    assert.match(
      handoffSource,
      /speechRevealVisibleTokenCount\(timeline\)/,
    );
    assert.match(handoffSource, /releaseChatSpeechReveal\(revealKey\)/);
    assert.match(
      handoffSource,
      /createChatRevealPaceHandoffState\(\{[\s\S]*?tokenSignature: timeline\.tokenSignature,[\s\S]*?visibleTokenCount/,
    );

    const effectSource = completedMessageVoiceEffect();
    assert.match(
      effectSource,
      /catch \(err\) \{[\s\S]*?handoffChatSpeechRevealToCanvasClock\(activeSpeechRevealKey\)/,
    );
    assert.doesNotMatch(
      effectSource,
      /catch \(err\) \{[\s\S]*?chatRevealPaceByKeyRef\.current\.delete\(activeSpeechRevealKey\)/,
    );
  });
});
