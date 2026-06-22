import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_REVEAL_TIMING,
  formatChatRevealTokenDisplay,
  isChatRevealEllipsisToken,
  resolveChatRevealPauseKind,
  resolveChatRevealStepDelayMs,
  resolveChatRevealWordDelayMsByMood,
  scaleChatRevealTimingSettings,
  tokenizeChatRevealText,
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
    assert.equal(scaled.clausePauseMs, DEFAULT_CHAT_REVEAL_TIMING.clausePauseMs * 0.5);
    assert.equal(scaled.sentencePauseMs, DEFAULT_CHAT_REVEAL_TIMING.sentencePauseMs * 0.5);
    assert.equal(scaled.ellipsisHoldMs, DEFAULT_CHAT_REVEAL_TIMING.ellipsisHoldMs * 0.5);
    assert.equal(scaled.ellipsisDotStepMs, DEFAULT_CHAT_REVEAL_TIMING.ellipsisDotStepMs * 0.5);
    assert.equal(
      resolveChatRevealWordDelayMsByMood("warm", scaled),
      resolveChatRevealWordDelayMsByMood("warm", DEFAULT_CHAT_REVEAL_TIMING) * 0.5
    );
  });
});
