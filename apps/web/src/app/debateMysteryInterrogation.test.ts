import assert from "node:assert/strict";
import test from "node:test";
import {
  WHODUNNIT_INTERROGATION_BEAT_MS,
  nextWhodunnitInterrogationPhase,
  startWhodunnitInterrogation,
  whodunnitActorDriftTiming,
  whodunnitCaptionRevealIsPending,
  whodunnitCaptionSpeechText,
  whodunnitDialogueGestureControlIsInteractive,
  whodunnitDialogueGestureDecision,
  whodunnitInterrogationAudioOwnsMouth,
  whodunnitInterrogationBeatMs,
  whodunnitInterrogationCompletionIsCurrent,
  whodunnitInterrogationFinishDecision,
  whodunnitInterrogationMayStartAudio,
} from "./debateMysteryInterrogation.ts";

test("fills streaming dialogue before a later gesture advances it", () => {
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: false,
    botFillArmed: false,
    clickCount: 1,
    filledByGesture: false,
    streaming: true,
  }), "fill");
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: false,
    botFillArmed: false,
    clickCount: 2,
    filledByGesture: true,
    streaming: false,
  }), "advance");
});

test("keeps the second half of a bot double-click on the filled line", () => {
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: true,
    botFillArmed: false,
    clickCount: 1,
    filledByGesture: false,
    streaming: true,
  }), "fill");
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: false,
    botFillArmed: true,
    clickCount: 2,
    filledByGesture: true,
    streaming: false,
  }), "ignore");
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: false,
    botFillArmed: true,
    clickCount: 1,
    filledByGesture: true,
    streaming: false,
  }), "advance");
});

test("does not issue the same completed advance twice during a double-click", () => {
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: false,
    automatedBotPlayback: false,
    botFillArmed: false,
    clickCount: 1,
    filledByGesture: false,
    streaming: false,
  }), "advance");
  assert.equal(whodunnitDialogueGestureDecision({
    advanceArmed: true,
    automatedBotPlayback: false,
    botFillArmed: false,
    clickCount: 2,
    filledByGesture: false,
    streaming: false,
  }), "ignore");
});

test("identifies controls excluded from screen-wide dialogue gestures", () => {
  for (const tagName of ["input", "textarea", "select", "button", "a", "label"]) {
    assert.equal(whodunnitDialogueGestureControlIsInteractive({ tagName, contentEditable: false }), true);
  }
  assert.equal(whodunnitDialogueGestureControlIsInteractive({ tagName: "div", contentEditable: true }), true);
  assert.equal(whodunnitDialogueGestureControlIsInteractive({ tagName: "div", contentEditable: false }), false);
});

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

test("gives queued dialogue reveal ownership before its playback clock starts", () => {
  assert.equal(whodunnitCaptionRevealIsPending({
    queued: true,
    revealExpected: true,
    presentationText: "Where were you?",
    timingText: null,
  }), true);
  assert.equal(whodunnitCaptionRevealIsPending({
    queued: true,
    revealExpected: true,
    presentationText: "I was in the study.",
    timingText: "Where were you?",
  }), true);
  assert.equal(whodunnitCaptionRevealIsPending({
    queued: true,
    revealExpected: true,
    presentationText: "I was in the study.",
    timingText: '"I was in the study."',
  }), false);
  assert.equal(whodunnitCaptionRevealIsPending({
    queued: true,
    revealExpected: true,
    presentationText: "A cold fireplace.",
    timingText: null,
  }), true);
  assert.equal(whodunnitCaptionRevealIsPending({
    queued: true,
    revealExpected: false,
    presentationText: "...",
    timingText: null,
  }), false);
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
