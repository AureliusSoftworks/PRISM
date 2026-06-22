import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveChatRevealDelayMultiplierForTyping,
  resolvePacedChatRevealVisibleTokenCount,
  type ChatRevealPaceState,
} from "./chatRevealPacing.ts";

describe("resolveChatRevealDelayMultiplierForTyping", () => {
  const base = {
    active: true,
    hasDraft: true,
    lastTypingAtMs: 1000,
    maxMultiplier: 2,
    idleHoldMs: 1000,
    recoveryMs: 1200,
  };

  it("holds the slowdown for one second after typing stops", () => {
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 1000 }), 2);
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 1999 }), 2);
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 2000 }), 2);
  });

  it("gradually restores to normal speed after the idle hold", () => {
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 2600 }), 1.5);
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 3200 }), 1);
    assert.equal(resolveChatRevealDelayMultiplierForTyping({ ...base, nowMs: 5000 }), 1);
  });

  it("does not slow down without active typing context", () => {
    assert.equal(
      resolveChatRevealDelayMultiplierForTyping({ ...base, active: false, nowMs: 1000 }),
      1
    );
    assert.equal(
      resolveChatRevealDelayMultiplierForTyping({ ...base, hasDraft: false, nowMs: 1000 }),
      1
    );
    assert.equal(
      resolveChatRevealDelayMultiplierForTyping({
        ...base,
        lastTypingAtMs: null,
        nowMs: 1000,
      }),
      1
    );
  });
});

describe("resolvePacedChatRevealVisibleTokenCount", () => {
  it("starts a late reveal at one visible token instead of catching up immediately", () => {
    const state = new Map<string, ChatRevealPaceState>();
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        revealKey: "conversation:message",
        tokenCount: 4,
        tokenSignature: "one two three four",
        nowMs: 800,
        stateByRevealKey: state,
        resolveStepDelayMs: () => 100,
      }),
      1
    );
  });

  it("advances at most one token for a delayed frame", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const args = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 0 }), 1);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 450 }), 2);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 450 }), 2);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 900 }), 3);
  });

  it("recalculates the pending step when delay settings change", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const base = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
    };
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        nowMs: 0,
        resolveStepDelayMs: () => 1000,
      }),
      1
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        nowMs: 400,
        resolveStepDelayMs: () => 1000,
      }),
      1
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        nowMs: 450,
        resolveStepDelayMs: () => 300,
      }),
      2
    );
  });

  it("slows the pending step when the delay multiplier increases", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const base = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...base, nowMs: 0 }), 1);
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        nowMs: 100,
        delayMultiplier: 2,
      }),
      1
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        nowMs: 200,
        delayMultiplier: 2,
      }),
      2
    );
  });

  it("resets pacing when the token signature changes", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const base = {
      revealKey: "conversation:message",
      tokenCount: 4,
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        tokenSignature: "one two three four",
        nowMs: 0,
      }),
      1
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        tokenSignature: "one two three four",
        nowMs: 200,
      }),
      2
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({
        ...base,
        tokenSignature: "new message text",
        nowMs: 400,
      }),
      1
    );
  });
});
