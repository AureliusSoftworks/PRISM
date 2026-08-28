import assert from "node:assert/strict";
import test from "node:test";
import {
  WHODUNNIT_INTERROGATION_BEAT_MS,
  WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS,
  nextWhodunnitInterrogationPhase,
  startWhodunnitInterrogation,
  whodunnitActorDriftTiming,
  whodunnitCaptionRevealIsPending,
  whodunnitCaptionSpeechText,
  whodunnitCourtCalloutPresentationVisible,
  whodunnitCourtDialogueGestureCrossedPresentation,
  whodunnitCourtDialogueFinishDecision,
  whodunnitCourtPresentationVisible,
  whodunnitCourtPresentedWitnessSeatId,
  whodunnitDialogueGestureControlIsInteractive,
  whodunnitDialogueGestureDecision,
  whodunnitInvestigationDialogueGraceMs,
  whodunnitInvestigationDialogueShouldAutoAdvance,
  whodunnitInterrogationAudioOwnsMouth,
  whodunnitInterrogationBeatMs,
  whodunnitInterrogationCompletionIsCurrent,
  whodunnitInterrogationFinishDecision,
  whodunnitInterrogationMayStartAudio,
} from "./debateMysteryInterrogation.ts";

test("holds spoken dialogue briefly and scales text-only grace with visible length", () => {
  assert.equal(whodunnitInvestigationDialogueGraceMs({
    delivery: "spoken",
    reducedMotion: false,
    text: "A very long spoken line still follows its real audio clock.",
  }), WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.spoken);
  const shortTextGrace = whodunnitInvestigationDialogueGraceMs({
    delivery: "text_only",
    reducedMotion: false,
    text: "A note.",
  });
  const longTextGrace = whodunnitInvestigationDialogueGraceMs({
    delivery: "text_only",
    reducedMotion: false,
    text: "A longer written observation with several details that deserve a calmer reading interval.",
  });
  assert.equal(shortTextGrace, WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.textMin);
  assert.ok(longTextGrace > shortTextGrace);
  assert.equal(
    whodunnitInvestigationDialogueGraceMs({
      delivery: "text_only",
      reducedMotion: true,
      text: "A note.",
    }),
    shortTextGrace + WHODUNNIT_INVESTIGATION_DIALOGUE_GRACE_MS.reducedMotionExtra,
  );
});

test("auto-advances only settled non-interactive Investigation dialogue", () => {
  const settled = {
    busy: false,
    hasActiveAudio: false,
    hasDialogue: true,
    playPhase: "investigation",
    requiresPlayerInput: false,
    roomView: "room",
    streaming: false,
  };
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance(settled), true);
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance({ ...settled, hasActiveAudio: true }), false);
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance({ ...settled, streaming: true }), false);
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance({ ...settled, requiresPlayerInput: true }), false);
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance({ ...settled, playPhase: "trial" }), false);
  assert.equal(whodunnitInvestigationDialogueShouldAutoAdvance({ ...settled, roomView: "mansion" }), false);
});

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

test("finishing Court dialogue advances one frozen beat before releasing the queue", () => {
  assert.equal(
    whodunnitCourtDialogueFinishDecision({ hasQueuedResponse: true }),
    "advance_queue",
  );
  assert.equal(
    whodunnitCourtDialogueFinishDecision({ hasQueuedResponse: false }),
    "clear",
  );
});

test("keeps the retiring witness on the stand until playback reaches the next witness", () => {
  const dialogueQueue = [
    { speakerSeatId: null },
    { speakerSeatId: "witness-old" },
    { speakerSeatId: null },
    { speakerSeatId: "witness-next" },
  ];
  const suspectSeatIds = new Set(["witness-old", "witness-next"]);

  assert.equal(whodunnitCourtPresentedWitnessSeatId({
    activeWitnessSeatId: "witness-next",
    dialogueIndex: 0,
    dialogueQueue,
    suspectSeatIds,
  }), "witness-old");
  assert.equal(whodunnitCourtPresentedWitnessSeatId({
    activeWitnessSeatId: "witness-next",
    dialogueIndex: 1,
    dialogueQueue,
    suspectSeatIds,
  }), "witness-old");
  assert.equal(whodunnitCourtPresentedWitnessSeatId({
    activeWitnessSeatId: "witness-next",
    dialogueIndex: 2,
    dialogueQueue,
    suspectSeatIds,
  }), "witness-next");
  assert.equal(whodunnitCourtPresentedWitnessSeatId({
    activeWitnessSeatId: "witness-next",
    dialogueIndex: 0,
    dialogueQueue: [{ speakerSeatId: null }],
    suspectSeatIds,
  }), "witness-next");
});

test("does not carry a double-click from an old Court key into the next beat", () => {
  assert.equal(whodunnitCourtDialogueGestureCrossedPresentation({
    armedPresentationKey: "court-line-old",
    clickCount: 2,
    presentationKey: "court-line-next",
  }), true);
  assert.equal(whodunnitCourtDialogueGestureCrossedPresentation({
    armedPresentationKey: "court-line-old",
    clickCount: 1,
    presentationKey: "court-line-next",
  }), false);
  assert.equal(whodunnitCourtDialogueGestureCrossedPresentation({
    armedPresentationKey: "court-line-old",
    clickCount: 2,
    presentationKey: "court-line-old",
  }), false);
});

test("keeps a verdict-bound Court exchange visible until its queue clears", () => {
  assert.equal(whodunnitCourtPresentationVisible({
    hasQueuedDialogue: false,
    playPhase: "trial",
  }), true);
  assert.equal(whodunnitCourtPresentationVisible({
    hasQueuedDialogue: true,
    playPhase: "verdict",
  }), true);
  assert.equal(whodunnitCourtPresentationVisible({
    hasQueuedDialogue: false,
    playPhase: "verdict",
  }), false);
});

test("holds the verdict callout until the final Court exchange clears", () => {
  assert.equal(whodunnitCourtCalloutPresentationVisible({
    courtPresentationActive: true,
    playPhase: "trial",
  }), true);
  assert.equal(whodunnitCourtCalloutPresentationVisible({
    courtPresentationActive: true,
    playPhase: "verdict",
  }), false);
  assert.equal(whodunnitCourtCalloutPresentationVisible({
    courtPresentationActive: false,
    playPhase: "verdict",
  }), true);
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
