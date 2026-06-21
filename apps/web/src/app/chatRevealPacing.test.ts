import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePacedChatRevealVisibleTokenCount,
  type ChatRevealPaceState,
} from "./chatRevealPacing.ts";

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
