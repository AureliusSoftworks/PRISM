import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CHAT_REVEAL_TIMING,
  formatChatRevealTokenDisplay,
  isChatRevealEllipsisToken,
  resolveChatRevealPauseKind,
  resolveChatRevealStepDelayMs,
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
});
