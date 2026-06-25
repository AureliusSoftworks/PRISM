import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_REVEAL_TIMING,
  formatChatRevealTokenDisplay,
  isChatRevealEllipsisToken,
  resolveChatRevealPauseKind,
  resolveChatRevealStepDelayMs,
  resolveChatRevealTokenLetterDurationMs,
  resolveVisibleChatRevealTokenCountAtElapsedMs,
  resolveChatRevealWordDelayMsByMood,
  scaleChatRevealTimingSettings,
  tokenizeChatRevealText,
  visibleChatRevealHasCompletedFirstSentence,
  type ChatRevealTimingSettings,
} from "./chatRevealTiming.ts";

describe("chat reveal ellipsis helpers", () => {
  it("recognizes dot and true ellipsis tokens", () => {
    assert.equal(isChatRevealEllipsisToken("..."), true);
    assert.equal(isChatRevealEllipsisToken("…"), true);
    assert.equal(isChatRevealEllipsisToken("... "), true);
    assert.equal(isChatRevealEllipsisToken("wait..."), false);
  });

  it("splits trailing ellipses into their own reveal token", () => {
    assert.deepEqual(tokenizeChatRevealText("Wait... now"), ["Wait", "... ", "now"]);
    assert.deepEqual(tokenizeChatRevealText("Wait… now"), ["Wait", "… ", "now"]);
  });

  it("reuses long stable token lists to keep composer rerenders cheap", () => {
    const text = Array.from(
      { length: 40 },
      (_, index) => `steady-word-${index}`
    ).join(" ");
    assert.equal(tokenizeChatRevealText(text), tokenizeChatRevealText(text));
  });

  it("shows spaced dots while typing and a true ellipsis when complete", () => {
    assert.equal(formatChatRevealTokenDisplay("...", { ellipsisPhase: "typing" }), ". . .");
    assert.equal(formatChatRevealTokenDisplay("... ", { ellipsisPhase: "typing" }), ". . . ");
    assert.equal(formatChatRevealTokenDisplay("...", { ellipsisPhase: "complete" }), "…");
    assert.equal(formatChatRevealTokenDisplay("… ", { ellipsisPhase: "complete" }), "… ");
  });
});

describe("chat reveal timing helpers", () => {
  it("classifies pause kinds for base, clause, sentence, and ellipsis tokens", () => {
    assert.equal(resolveChatRevealPauseKind("hello "), "base");
    assert.equal(resolveChatRevealPauseKind("hello, "), "clause");
    assert.equal(resolveChatRevealPauseKind("hello— "), "clause");
    assert.equal(resolveChatRevealPauseKind("hello. "), "sentence");
    assert.equal(resolveChatRevealPauseKind("... "), "ellipsis");
  });

  it("uses custom timing overrides for computed delays", () => {
    const timing: ChatRevealTimingSettings = {
      ...DEFAULT_CHAT_REVEAL_TIMING,
      baseWordDelayMs: 500,
      clausePauseMs: 700,
      sentencePauseMs: 900,
      ellipsisHoldMs: 1100,
      ellipsisDotStepMs: 50,
    };
    assert.equal(resolveChatRevealStepDelayMs("...", "neutral", timing), 1100);
    assert.equal(resolveChatRevealStepDelayMs("I", "neutral", timing), 500);
    assert.equal(resolveChatRevealStepDelayMs("I,", "neutral", timing), 1200);
    assert.equal(resolveChatRevealStepDelayMs("I.", "neutral", timing), 1400);
  });

  it("scales every reveal delay by the provided multiplier", () => {
    const scaled = scaleChatRevealTimingSettings(DEFAULT_CHAT_REVEAL_TIMING, 0.5);

    assert.equal(scaled.baseWordDelayMs, DEFAULT_CHAT_REVEAL_TIMING.baseWordDelayMs * 0.5);
    assert.equal(scaled.letterRevealMs, DEFAULT_CHAT_REVEAL_TIMING.letterRevealMs * 0.5);
    assert.equal(scaled.letterRevealStepMs, DEFAULT_CHAT_REVEAL_TIMING.letterRevealStepMs * 0.5);
    assert.equal(scaled.wordRevealSettleMs, DEFAULT_CHAT_REVEAL_TIMING.wordRevealSettleMs * 0.5);
    assert.equal(scaled.clausePauseMs, DEFAULT_CHAT_REVEAL_TIMING.clausePauseMs * 0.5);
    assert.equal(scaled.sentencePauseMs, DEFAULT_CHAT_REVEAL_TIMING.sentencePauseMs * 0.5);
    assert.equal(scaled.ellipsisHoldMs, DEFAULT_CHAT_REVEAL_TIMING.ellipsisHoldMs * 0.5);
    assert.equal(scaled.ellipsisDotStepMs, DEFAULT_CHAT_REVEAL_TIMING.ellipsisDotStepMs * 0.5);
    assert.equal(
      resolveChatRevealWordDelayMsByMood("warm", scaled),
      resolveChatRevealWordDelayMsByMood("warm", DEFAULT_CHAT_REVEAL_TIMING) * 0.5
    );
  });

  it("scales the scheduler wait that follows each fading word", () => {
    const scaled = scaleChatRevealTimingSettings(DEFAULT_CHAT_REVEAL_TIMING, 0.5);
    const token = "quietly";

    assert.equal(
      resolveChatRevealTokenLetterDurationMs(token, scaled),
      resolveChatRevealTokenLetterDurationMs(token, DEFAULT_CHAT_REVEAL_TIMING) * 0.5
    );
    assert.equal(
      resolveChatRevealStepDelayMs(token, "neutral", scaled),
      resolveChatRevealStepDelayMs(token, "neutral", DEFAULT_CHAT_REVEAL_TIMING) * 0.5
    );
  });

  it("reveals more prose sooner when timing is scaled faster", () => {
    const tokens = tokenizeChatRevealText("one gently unfolding thought");
    const scaled = scaleChatRevealTimingSettings(DEFAULT_CHAT_REVEAL_TIMING, 0.5);
    const defaultFirstStep = resolveChatRevealStepDelayMs(tokens[0] ?? "", "neutral");
    const scaledFirstStep = resolveChatRevealStepDelayMs(tokens[0] ?? "", "neutral", scaled);

    assert.equal(
      resolveVisibleChatRevealTokenCountAtElapsedMs(
        tokens,
        scaledFirstStep,
        "neutral",
        DEFAULT_CHAT_REVEAL_TIMING
      ),
      1
    );
    assert.equal(
      resolveVisibleChatRevealTokenCountAtElapsedMs(tokens, scaledFirstStep, "neutral", scaled),
      2
    );
    assert.equal(scaledFirstStep < defaultFirstStep, true);
  });
});

describe("visibleChatRevealHasCompletedFirstSentence", () => {
  it("keeps grace before sentence-ending punctuation is visible", () => {
    const text = "What an interesting find, I'm sure you will make good use of it.";
    assert.equal(visibleChatRevealHasCompletedFirstSentence(text, 6), false);
  });

  it("ends grace once the first sentence is visible", () => {
    const text = "What an interesting find, I'm sure you will make good use of it. Tell me, what next?";
    const tokens = tokenizeChatRevealText(text);
    const firstSentenceEnd = tokens.findIndex((token) => token.includes("."));
    assert.ok(firstSentenceEnd >= 0);
    assert.equal(visibleChatRevealHasCompletedFirstSentence(text, firstSentenceEnd), false);
    assert.equal(visibleChatRevealHasCompletedFirstSentence(text, firstSentenceEnd + 1), true);
  });

  it("treats question and exclamation endings as completed sentences", () => {
    assert.equal(visibleChatRevealHasCompletedFirstSentence("Really? I see.", 2), true);
    assert.equal(visibleChatRevealHasCompletedFirstSentence("Careful! More follows.", 2), true);
  });
});
