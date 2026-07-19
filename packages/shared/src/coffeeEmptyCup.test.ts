import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COFFEE_EMPTY_CUP_ATTEMPT_ANIMATION_MS,
  coffeeEmptyCupAttemptState,
} from "../dist/index.js";

describe("Coffee empty-cup attempts", () => {
  it("schedules two or three spaced failed sips after the cup empties", () => {
    const initial = coffeeEmptyCupAttemptState({
      seed: "session:bot-a",
      nowMs: 0,
      sessionStartedAtMs: 0,
      durationMinutes: 10,
    });

    assert.ok(initial);
    assert.ok(initial.maxAttempts === 2 || initial.maxAttempts === 3);
    assert.equal(initial.attemptStartedAtMs.length, initial.maxAttempts);
    assert.ok(initial.attemptStartedAtMs[0]! > initial.emptyAtMs);
    for (let index = 1; index < initial.attemptStartedAtMs.length; index += 1) {
      assert.ok(
        initial.attemptStartedAtMs[index]! - initial.attemptStartedAtMs[index - 1]! >=
          7_500,
      );
    }

    const firstRealization = coffeeEmptyCupAttemptState({
      seed: "session:bot-a",
      nowMs: initial.attemptRealizedAtMs[0]!,
      sessionStartedAtMs: 0,
      durationMinutes: 10,
    });
    assert.equal(firstRealization?.realizedAttemptCount, 1);
    assert.equal(firstRealization?.activeAttemptNumber, 1);
    assert.equal(firstRealization?.frowning, true);

    const finished = coffeeEmptyCupAttemptState({
      seed: "session:bot-a",
      nowMs:
        initial.attemptRealizedAtMs.at(-1)! +
        COFFEE_EMPTY_CUP_ATTEMPT_ANIMATION_MS,
      sessionStartedAtMs: 0,
      durationMinutes: 10,
    });
    assert.equal(finished?.realizedAttemptCount, initial.maxAttempts);
    assert.equal(finished?.gaveUp, true);
  });

  it("starts a fresh attempt arc after a top-off", () => {
    const toppedOffAt = "2026-07-19T06:00:00.000Z";
    const toppedOffAtMs = Date.parse(toppedOffAt);
    const state = coffeeEmptyCupAttemptState({
      seed: "session:bot-b",
      nowMs: toppedOffAtMs + 1_000,
      sessionStartedAtMs: toppedOffAtMs - 300_000,
      durationMinutes: 10,
      topOff: {
        progressBefore: 1,
        progressAfter: 0.04,
        toppedOffAt,
      },
    });

    assert.equal(state?.fillId, `topoff:${toppedOffAt}`);
    assert.equal(state?.fillStartedAtMs, toppedOffAtMs);
    assert.equal(state?.realizedAttemptCount, 0);
    assert.ok((state?.emptyAtMs ?? 0) > toppedOffAtMs);
  });

  it("does not schedule failed sips for a bot that refuses coffee", () => {
    assert.equal(
      coffeeEmptyCupAttemptState({
        seed: "session:bot-c",
        nowMs: 600_000,
        sessionStartedAtMs: 0,
        durationMinutes: 10,
        powerRateMultiplier: 0,
      }),
      null,
    );
  });
});
