import assert from "node:assert/strict";
import test from "node:test";

import {
  DEBATE_PRESENTATION_CALLBACK_MAX_MS,
  DEBATE_PRESENTATION_FIRST_VOICE_STALL_MS,
  DEBATE_PRESENTATION_STALL_TIMEOUT_MS,
  debatePresentationCallbackTimeoutMs,
  settleDebatePresentationCallback,
} from "./debatePresentationLifecycle.ts";

test("a stale Debate presentation callback falls back instead of holding the result", async () => {
  const stalled = new Promise<boolean>(() => undefined);
  const startedAt = Date.now();
  assert.equal(await settleDebatePresentationCallback(stalled, 1), false);
  assert.ok(Date.now() - startedAt < 250);
});

test("a completed Debate presentation callback keeps its playback result", async () => {
  assert.equal(
    await settleDebatePresentationCallback(Promise.resolve(true), 1_000),
    true,
  );
});

test("Debate presentation waits for the spoken estimate instead of the 12s stall floor", () => {
  assert.equal(
    debatePresentationCallbackTimeoutMs(1_400),
    DEBATE_PRESENTATION_STALL_TIMEOUT_MS,
  );
  const minuteLine = debatePresentationCallbackTimeoutMs(60_000);
  assert.ok(minuteLine > DEBATE_PRESENTATION_STALL_TIMEOUT_MS);
  assert.ok(minuteLine <= DEBATE_PRESENTATION_CALLBACK_MAX_MS);
  assert.ok(minuteLine >= 60_000);
});

test("Debate presentation keeps waiting while voice progress is still arriving", async () => {
  let lastProgressAtMs = Date.now();
  const playback = new Promise<boolean>((resolve) => {
    const tick = setInterval(() => {
      lastProgressAtMs = Date.now();
    }, 40);
    setTimeout(() => {
      clearInterval(tick);
      resolve(true);
    }, 400);
  });
  assert.equal(
    await settleDebatePresentationCallback(playback, {
      stallMs: 80,
      maxMs: 1_000,
      lastProgressAtMs: () => lastProgressAtMs,
    }),
    true,
  );
});

test("Debate presentation does not jump ahead after voice has started", async () => {
  let lastProgressAtMs = 0;
  const playback = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      lastProgressAtMs = Date.now();
      setTimeout(() => resolve(true), 250);
    }, 40);
  });
  assert.equal(
    await settleDebatePresentationCallback(playback, {
      stallMs: 80,
      maxMs: 1_000,
      lastProgressAtMs: () => lastProgressAtMs,
    }),
    true,
  );
});

test("Debate presentation waits for the first voice sample before stalling", async () => {
  const stalled = new Promise<boolean>(() => undefined);
  const startedAt = Date.now();
  assert.equal(
    await settleDebatePresentationCallback(stalled, {
      stallMs: 80,
      maxMs: 1_000,
      lastProgressAtMs: () => 0,
    }),
    false,
  );
  assert.ok(Date.now() - startedAt >= 80);
  assert.ok(DEBATE_PRESENTATION_FIRST_VOICE_STALL_MS > DEBATE_PRESENTATION_STALL_TIMEOUT_MS);
});
