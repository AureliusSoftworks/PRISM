import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrismMoodInterruption,
  applyPrismMoodPositiveTurn,
  coffeeSocialSnapshotToPrismMoodState,
  createDefaultPrismMoodState,
  decayPrismMood,
  shouldPrismMoodDeclineResponse,
} from "./mood.ts";

test("interruption increases annoyance with progress-aware weighting", () => {
  const base = createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z");
  const early = applyPrismMoodInterruption(
    base,
    { kind: "assistant_reveal", visibleTokenCount: 1, totalTokenCount: 30 },
    "2026-06-19T12:00:01.000Z"
  );
  const middle = applyPrismMoodInterruption(
    base,
    { kind: "assistant_reveal", visibleTokenCount: 15, totalTokenCount: 30 },
    "2026-06-19T12:00:01.000Z"
  );
  const late = applyPrismMoodInterruption(
    base,
    { kind: "assistant_reveal", visibleTokenCount: 29, totalTokenCount: 30 },
    "2026-06-19T12:00:01.000Z"
  );
  assert.ok(early.annoyance > base.annoyance);
  assert.ok(middle.annoyance > early.annoyance);
  assert.ok(middle.annoyance > late.annoyance);
});

test("positive turns repair annoyance and warmth", () => {
  const interrupted = applyPrismMoodInterruption(
    createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    { kind: "assistant_reveal", visibleTokenCount: 12, totalTokenCount: 24 },
    "2026-06-19T12:00:01.000Z"
  );
  const repaired = applyPrismMoodPositiveTurn(interrupted, 1, "2026-06-19T12:00:02.000Z");
  assert.ok(repaired.annoyance < interrupted.annoyance);
  assert.ok(repaired.warmth > interrupted.warmth);
});

test("decay drifts mood toward baseline without instant reset", () => {
  const interrupted = applyPrismMoodInterruption(
    createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    { kind: "assistant_reveal", visibleTokenCount: 12, totalTokenCount: 24 },
    "2026-06-19T12:00:01.000Z"
  );
  const decayed = decayPrismMood(interrupted, "2026-06-19T12:00:02.000Z");
  const baseline = createDefaultPrismMoodState("zen", "2026-06-19T12:00:02.000Z");
  assert.ok(decayed.annoyance < interrupted.annoyance);
  assert.ok(decayed.annoyance > baseline.annoyance);
});

test("high annoyance can decline a response", () => {
  const state = {
    ...createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    annoyance: 0.9,
    warmth: 0.25,
    engagement: 0.3,
  };
  assert.equal(shouldPrismMoodDeclineResponse(state), true);
});

test("coffee social snapshots map into shared mood", () => {
  const social = {
    disposition: 0.2,
    valuesFriction: 0.85,
    restraint: 0.4,
    engagement: 0.5,
    leavePressure: 0.75,
  };
  const mood = coffeeSocialSnapshotToPrismMoodState(
    social,
    "2026-06-19T12:00:00.000Z"
  );
  assert.equal(mood.mode, "coffee");
  assert.ok(mood.annoyance > 0.7);
  assert.ok(mood.warmth < 0.35);
  assert.equal(mood.moodKey, "strained");
});
