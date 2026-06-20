import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPrismMoodInterruption,
  applyPrismMoodIgnoreCooldown,
  applyPrismMoodIgnoredTurn,
  applyPrismMoodNegativeTurn,
  applyPrismMoodPositiveTurn,
  coffeeSocialSnapshotToPrismMoodState,
  createDefaultPrismMoodState,
  decayPrismMood,
  isPrismMoodIgnoring,
  prismMoodInterruptionStreak,
  shouldPrismMoodDeclineResponse,
  shouldPrismMoodStartIgnoreCooldown,
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

test("interruption streaks escalate annoyance into a pause-capable range", () => {
  let mood = createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z");
  for (let index = 0; index < 6; index += 1) {
    mood = decayPrismMood(mood, `2026-06-19T12:00:0${index + 1}.000Z`);
    mood = applyPrismMoodInterruption(
      mood,
      { kind: "assistant_reveal", visibleTokenCount: 12, totalTokenCount: 24 },
      `2026-06-19T12:00:0${index + 1}.500Z`
    );
  }
  assert.equal(prismMoodInterruptionStreak(mood), 6);
  assert.ok(mood.annoyance >= 0.58);
  assert.ok(mood.warmth <= 0.52);
  assert.equal(shouldPrismMoodDeclineResponse(mood), true);
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

test("decay is reduced while recent interruptions form a streak", () => {
  const base = {
    ...createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    annoyance: 0.6,
    warmth: 0.48,
    recentDeltas: [
      {
        kind: "interruption" as const,
        at: "2026-06-19T12:00:00.000Z",
        reason: "Interrupted.",
        annoyanceDelta: 0.1,
        warmthDelta: -0.04,
        engagementDelta: -0.02,
        restraintDelta: -0.01,
        moodKeyBefore: "neutral" as const,
        moodKeyAfter: "guarded" as const,
      },
    ],
  };
  const interruptedDecay = decayPrismMood(base, "2026-06-19T12:00:01.000Z");
  const unstreakedDecay = decayPrismMood(
    { ...base, recentDeltas: [] },
    "2026-06-19T12:00:01.000Z"
  );
  assert.ok(
    interruptedDecay.annoyance > unstreakedDecay.annoyance,
    "interruption streaks should not immediately erase annoyance"
  );
});

test("negative turns nudge mood but cannot trigger pause alone", () => {
  let mood = createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z");
  for (let index = 0; index < 8; index += 1) {
    mood = applyPrismMoodNegativeTurn(mood, 1, `2026-06-19T12:00:0${index + 1}.000Z`);
  }
  assert.ok(mood.annoyance > 0.12);
  assert.equal(prismMoodInterruptionStreak(mood), 0);
  assert.equal(shouldPrismMoodDeclineResponse(mood), false);
});

test("severe interruption mood can start an ignore cooldown", () => {
  let mood = {
    ...createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    annoyance: 0.74,
    warmth: 0.42,
    engagement: 0.47,
    recentDeltas: Array.from({ length: 6 }, () => ({
      kind: "interruption" as const,
      at: "2026-06-19T12:00:00.000Z",
      reason: "Interrupted.",
      annoyanceDelta: 0.1,
      warmthDelta: -0.04,
      engagementDelta: -0.02,
      restraintDelta: -0.01,
      moodKeyBefore: "neutral" as const,
      moodKeyAfter: "guarded" as const,
    })),
  };
  assert.equal(shouldPrismMoodStartIgnoreCooldown(mood), true);
  mood = applyPrismMoodIgnoreCooldown(mood, "2026-06-19T12:00:01.000Z", 10_000);
  assert.equal(mood.recentDeltas[0]?.kind, "ignore_started");
  assert.equal(mood.ignoreUntil, "2026-06-19T12:00:11.000Z");
  assert.equal(isPrismMoodIgnoring(mood, "2026-06-19T12:00:05.000Z"), true);
  assert.equal(isPrismMoodIgnoring(mood, "2026-06-19T12:00:12.000Z"), false);
});

test("ignored turns record without extending the cooldown", () => {
  const cooling = {
    ...createDefaultPrismMoodState("zen", "2026-06-19T12:00:00.000Z"),
    ignoreUntil: "2026-06-19T12:01:00.000Z",
  };
  const ignored = applyPrismMoodIgnoredTurn(cooling, "2026-06-19T12:00:05.000Z");
  assert.equal(ignored.recentDeltas[0]?.kind, "ignored_turn");
  assert.equal(ignored.ignoreUntil, cooling.ignoreUntil);
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
