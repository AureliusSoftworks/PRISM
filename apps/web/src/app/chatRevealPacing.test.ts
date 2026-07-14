import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createChatRevealPaceHandoffState,
  resolveChatRevealTypingPacing,
  resolvePacedChatRevealVisibleTokenCount,
  type ChatRevealPaceState,
} from "./chatRevealPacing.ts";
import {
  CLEANUP_MESSAGE_REVEAL_DURATION_MS,
  CLEANUP_MESSAGE_REVEAL_SETTLE_MS,
  cleanupMessageRevealKey,
  mapPendingCleanupMessagesToFinalRevealKeys,
} from "./messageCleanupReveal.ts";

describe("resolveChatRevealTypingPacing", () => {
  const base = {
    active: true,
    hasDraft: true,
    lastTypingAtMs: 1000,
    maxMultiplier: 2,
    pauseMs: 2400,
    recoveryMs: 1200,
  };

  it("pauses the reveal during the composer cooldown", () => {
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 1000 }), {
      paused: true,
      delayMultiplier: 2,
    });
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 3399 }), {
      paused: true,
      delayMultiplier: 2,
    });
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 3400 }), {
      paused: true,
      delayMultiplier: 2,
    });
  });

  it("gradually restores to normal speed after the pause", () => {
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 4000 }), {
      paused: false,
      delayMultiplier: 1.5,
    });
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 4600 }), {
      paused: false,
      delayMultiplier: 1,
    });
    assert.deepEqual(resolveChatRevealTypingPacing({ ...base, nowMs: 5000 }), {
      paused: false,
      delayMultiplier: 1,
    });
  });

  it("does not pause or slow down without active typing context", () => {
    assert.deepEqual(
      resolveChatRevealTypingPacing({ ...base, active: false, nowMs: 1000 }),
      { paused: false, delayMultiplier: 1 }
    );
    assert.deepEqual(
      resolveChatRevealTypingPacing({ ...base, hasDraft: false, nowMs: 1000 }),
      { paused: false, delayMultiplier: 1 }
    );
    assert.deepEqual(
      resolveChatRevealTypingPacing({
        ...base,
        lastTypingAtMs: null,
        nowMs: 1000,
      }),
      { paused: false, delayMultiplier: 1 }
    );
  });
});

describe("resolvePacedChatRevealVisibleTokenCount", () => {
  it("continues after a speech failure without replaying visible text", () => {
    const revealKey = "conversation:message";
    const tokenSignature = "one two three four five";
    const state = new Map<string, ChatRevealPaceState>([
      [
        revealKey,
        createChatRevealPaceHandoffState({
          tokenSignature,
          visibleTokenCount: 3,
          nowMs: 1000,
        }),
      ],
    ]);
    const args = {
      revealKey,
      tokenCount: 5,
      tokenSignature,
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 1000 }),
      3,
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 1099 }),
      3,
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 1100 }),
      4,
    );
  });

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

  it("can hold at zero visible tokens before starting an action-first reveal", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const args = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
      startDelayMs: 320,
    };
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 0 }), 0);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 319 }), 0);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 320 }), 1);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 420 }), 2);
  });

  it("can pause at zero visible tokens while the composer is active", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const args = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 0, pause: true }),
      0
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 100, pause: true }),
      0
    );
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 150 }), 0);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 200 }), 1);
  });

  it("pauses mid-reveal and resumes without catching up missed tokens", () => {
    const state = new Map<string, ChatRevealPaceState>();
    const args = {
      revealKey: "conversation:message",
      tokenCount: 4,
      tokenSignature: "one two three four",
      stateByRevealKey: state,
      resolveStepDelayMs: () => 100,
    };
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 0 }), 1);
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 100, pause: true }),
      1
    );
    assert.equal(
      resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 340, pause: true }),
      1
    );
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 420 }), 1);
    assert.equal(resolvePacedChatRevealVisibleTokenCount({ ...args, nowMs: 440 }), 2);
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

  it("speeds the pending step when the delay multiplier decreases", () => {
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
        nowMs: 60,
        delayMultiplier: 0.5,
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

describe("message cleanup reveal helpers", () => {
  it("keeps a settle window longer than the whole-message reveal animation", () => {
    assert.ok(CLEANUP_MESSAGE_REVEAL_DURATION_MS > 0);
    assert.ok(CLEANUP_MESSAGE_REVEAL_SETTLE_MS > CLEANUP_MESSAGE_REVEAL_DURATION_MS);
  });

  it("maps pending optimistic cleanup messages to final user messages by send order", () => {
    assert.deepEqual(
      mapPendingCleanupMessagesToFinalRevealKeys({
        conversationId: "conversation",
        pendingMessageIds: ["pending-a", "pending-b"],
        previousMessages: [
          { id: "old-user", role: "user" },
          { id: "old-assistant", role: "assistant" },
          { id: "pending-a", role: "user" },
          { id: "pending-b", role: "user" },
        ],
        finalMessages: [
          { id: "old-user", role: "user" },
          { id: "old-assistant", role: "assistant" },
          { id: "final-a", role: "user" },
          { id: "final-b", role: "user" },
          { id: "final-assistant", role: "assistant" },
        ],
      }),
      [
        cleanupMessageRevealKey("conversation", "final-a"),
        cleanupMessageRevealKey("conversation", "final-b"),
      ]
    );
  });
});
