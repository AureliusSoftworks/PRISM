import assert from "node:assert/strict";
import test from "node:test";
import {
  WHODUNNIT_INTERROGATION_BEAT_MS,
  nextWhodunnitInterrogationPhase,
  startWhodunnitInterrogation,
  whodunnitActorDriftTiming,
  whodunnitCaptionSpeechText,
  whodunnitInterrogationAudioOwnsMouth,
  whodunnitInterrogationBeatMs,
  whodunnitInterrogationCompletionIsCurrent,
  whodunnitInterrogationFinishDecision,
  whodunnitInterrogationMayStartAudio,
} from "./debateMysteryInterrogation.ts";

test("paces a current Talk graph from Prosecutor entrance through witness response", () => {
  const phase = startWhodunnitInterrogation([
    { speakerBotId: "prosecutor", speakerSeatId: null },
    { speakerBotId: "witness-bot", speakerSeatId: "witness" },
  ], "prosecutor", "witness");

  assert.equal(phase, "prosecutor_entrance");
  assert.equal(whodunnitInterrogationBeatMs(phase), WHODUNNIT_INTERROGATION_BEAT_MS.prosecutorEntrance);
  assert.equal(nextWhodunnitInterrogationPhase(phase), "prosecutor_speaking");
  assert.equal(nextWhodunnitInterrogationPhase("prosecutor_speaking"), "handoff");
  assert.equal(whodunnitInterrogationBeatMs("handoff"), WHODUNNIT_INTERROGATION_BEAT_MS.handoff);
  assert.equal(nextWhodunnitInterrogationPhase("handoff"), "advance_queue");
  assert.equal(whodunnitInterrogationBeatMs("suspect_entrance"), WHODUNNIT_INTERROGATION_BEAT_MS.suspectEntrance);
  assert.equal(nextWhodunnitInterrogationPhase("suspect_entrance"), "suspect_speaking");
  assert.equal(nextWhodunnitInterrogationPhase("suspect_speaking"), "complete");
});

test("keeps mouths idle until local audio has actually started", () => {
  assert.equal(whodunnitInterrogationMayStartAudio("prosecutor_entrance"), false);
  assert.equal(whodunnitInterrogationAudioOwnsMouth({ phase: "prosecutor_speaking", audible: false }), false);
  assert.equal(whodunnitInterrogationAudioOwnsMouth({ phase: "prosecutor_speaking", audible: true }), true);
  assert.equal(whodunnitInterrogationAudioOwnsMouth({ phase: "handoff", audible: true }), false);
});

test("removes only matched wrapping dialogue quotes from captions", () => {
  assert.equal(
    whodunnitCaptionSpeechText('"The key is in the \"study\"."'),
    'The key is in the "study".',
  );
  assert.equal(
    whodunnitCaptionSpeechText("“I heard ‘wait’ before the bell.”"),
    "I heard ‘wait’ before the bell.",
  );
  assert.equal(whodunnitCaptionSpeechText('"Unmatched'), '"Unmatched');
});

test("ignores stale completion after cancellation or a newer audio run", () => {
  assert.equal(whodunnitInterrogationCompletionIsCurrent(3, 3), true);
  assert.equal(whodunnitInterrogationCompletionIsCurrent(3, 4), false);
});

test("finishing a line preserves the remaining interrogation beat", () => {
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "prosecutor_entrance", hasQueuedResponse: true }),
    "handoff",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "prosecutor_speaking", hasQueuedResponse: true }),
    "handoff",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "handoff", hasQueuedResponse: true }),
    "ignore",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "suspect_speaking", hasQueuedResponse: false }),
    "settle",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "suspect_entrance", hasQueuedResponse: true }),
    "advance_queue",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: "prosecutor_speaking", hasQueuedResponse: false }),
    "settle",
  );
  assert.equal(
    whodunnitInterrogationFinishDecision({ phase: null, hasQueuedResponse: false }),
    "settle",
  );
});

test("keeps legacy response-only Talk graphs playable", () => {
  assert.equal(startWhodunnitInterrogation([
    { speakerBotId: "witness-bot", speakerSeatId: "witness" },
  ], "prosecutor", "witness"), "suspect_entrance");
});

test("gives room actors stable bounded idle-motion timing", () => {
  const meg = whodunnitActorDriftTiming("case-1:meg:suspect");
  const felix = whodunnitActorDriftTiming("case-1:felix:suspect");

  assert.deepEqual(whodunnitActorDriftTiming("case-1:meg:suspect"), meg);
  assert.notDeepEqual(felix, meg);
  assert.ok(meg.durationMs >= 6_400 && meg.durationMs <= 8_800);
  assert.ok(meg.delayMs <= -600 && meg.delayMs >= -5_400);
});
