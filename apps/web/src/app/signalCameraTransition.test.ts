import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS,
  SIGNAL_SPEECH_START_WIDE_HOLD_MS,
  signalAutomaticCameraPresentationAt,
  signalListenerReactionCameraShot,
  signalLiveAutoCameraShot,
  signalSpeechStartCameraShot,
} from "./signalCameraTransition.ts";

describe("Signal automatic camera direction", () => {
  it("establishes the studio Wide for five seconds after the intro clears", () => {
    const duringIntro = signalAutomaticCameraPresentationAt({
      state: null,
      episodeId: "episode-opening",
      proposedShot: "left",
      nowMs: 1_000,
      introActive: true,
    });
    assert.equal(duringIntro.state.shot, "wide");

    const revealed = signalAutomaticCameraPresentationAt({
      state: duringIntro.state,
      episodeId: "episode-opening",
      proposedShot: "left",
      nowMs: 8_000,
      introActive: false,
    });
    assert.equal(revealed.state.shot, "wide");
    assert.equal(
      revealed.nextEvaluationInMs,
      SIGNAL_AUTOMATIC_CAMERA_MIN_HOLD_MS,
    );

    const justBeforeCut = signalAutomaticCameraPresentationAt({
      state: revealed.state,
      episodeId: "episode-opening",
      proposedShot: "left",
      nowMs: 12_999,
      introActive: false,
    });
    assert.equal(justBeforeCut.state.shot, "wide");
    assert.equal(justBeforeCut.nextEvaluationInMs, 1);

    const readyToCut = signalAutomaticCameraPresentationAt({
      state: revealed.state,
      episodeId: "episode-opening",
      proposedShot: "left",
      nowMs: 13_000,
      introActive: false,
    });
    assert.equal(readyToCut.state.shot, "left");
  });

  it("sometimes starts either speaker Wide with a replay-stable choice", () => {
    for (const speakerShot of ["left", "right"] as const) {
      const starts = Array.from({ length: 64 }, (_, index) =>
        signalSpeechStartCameraShot({
          messageId: `message-${index}`,
          speakerShot,
          speechElapsedMs: 0,
        }),
      );
      assert.ok(starts.includes("wide"));
      assert.ok(starts.includes(speakerShot));
      assert.deepEqual(
        starts,
        Array.from({ length: 64 }, (_, index) =>
          signalSpeechStartCameraShot({
            messageId: `message-${index}`,
            speakerShot,
            speechElapsedMs: 0,
          }),
        ),
      );
    }
    assert.equal(
      signalSpeechStartCameraShot({
        messageId: "message-0",
        speakerShot: "left",
        speechElapsedMs: SIGNAL_SPEECH_START_WIDE_HOLD_MS,
      }),
      "left",
    );
  });

  it("blocks every automatic switch until the current shot has held five seconds", () => {
    const state = {
      episodeId: "episode-cooldown",
      shot: "left" as const,
      switchedAtMs: 2_000,
      introActive: false,
    };
    const held = signalAutomaticCameraPresentationAt({
      state,
      episodeId: state.episodeId,
      proposedShot: "right",
      nowMs: 6_999,
      introActive: false,
    });
    assert.equal(held.state.shot, "left");
    assert.equal(held.nextEvaluationInMs, 1);

    const switched = signalAutomaticCameraPresentationAt({
      state,
      episodeId: state.episodeId,
      proposedShot: "right",
      nowMs: 7_000,
      introActive: false,
    });
    assert.equal(switched.state.shot, "right");
    assert.equal(switched.state.switchedAtMs, 7_000);
  });

  it("holds Wide while an incoming host voice prepares over the live mic", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        audibleHandoffPreparing: true,
        speakingShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "wide",
    );
  });

  it("anchors the opening camera beat to the voice that actually started", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "wide",
        audibleHandoffPreparing: true,
        coverageShot: "right",
        speakingShot: "left",
        speakerOwnershipLock: true,
        botThinking: false,
        producerGuestThinking: false,
      }),
      "left",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "wide",
        coverageShot: "right",
        speakingShot: "left",
        speakerOwnershipLock: false,
        botThinking: false,
        producerGuestThinking: false,
      }),
      "right",
    );
  });

  it("holds Wide for true audible crosstalk before reactions or coverage", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        audibleVoiceOverlap: true,
        listenerReactionShot: "right",
        coverageShot: "right",
        speakingShot: "left",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "wide",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        audibleVoiceOverlap: false,
        speakingShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "right",
    );
  });

  it("holds the Producer guest, then uses Wide whenever a bot is thinking", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        botThinking: false,
        producerGuestThinking: true,
      }),
      "right",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        botThinking: true,
        producerGuestThinking: false,
      }),
      "wide",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        botThinking: true,
        producerGuestThinking: true,
      }),
      "wide",
    );
  });

  it("lets lingering coverage leave the speaker without stealing reaction cuts", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        speakingShot: "left",
        coverageShot: "wide",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "wide",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        speakingShot: "left",
        coverageShot: "right",
        listenerReactionShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "right",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        speakingShot: "left",
        coverageShot: "right",
        listenerReactionShot: "left",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "left",
    );
  });

  it("cuts directly to live speech, but releases a prior hold for real thinking", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        speakingShot: "right",
        postSpeechHoldShot: "left",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "right",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        postSpeechHoldShot: "left",
        botThinking: true,
        producerGuestThinking: false,
      }),
      "wide",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        botThinking: true,
        producerGuestThinking: false,
      }),
      "wide",
    );
  });

  it("holds Wide through voice preparation, then hands directly to the ready speaker", () => {
    const shots = [
      signalLiveAutoCameraShot({
        baseShot: "right",
        botThinking: true,
        producerGuestThinking: false,
      }),
      signalLiveAutoCameraShot({
        baseShot: "right",
        botThinking: true,
        producerGuestThinking: false,
      }),
      signalLiveAutoCameraShot({
        baseShot: "right",
        speakingShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
    ];
    assert.deepEqual(shots, ["wide", "wide", "right"]);
  });

  it("preserves base shots and higher-priority listener reactions", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "left",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        listenerReactionShot: "right",
        speakingShot: "left",
        botThinking: true,
        producerGuestThinking: false,
      }),
      "right",
    );
  });

  it("keeps ordinary comments off camera unless the saved plan earns a cut", () => {
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: false,
        ephemeralSpeakingShot: "right",
        ephemeralSpeechDurationMs: 3_000,
      }),
      null,
    );
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: true,
        ephemeralSpeakingShot: "right",
        ephemeralSpeechDurationMs: 2_500,
      }),
      "right",
    );
  });

  it("keeps brief interruption audio off camera to prevent a quick bounce", () => {
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: true,
        ephemeralSpeakingShot: "left",
        ephemeralSpeechDurationMs: 2_499,
      }),
      null,
    );
  });

  it("cuts an eligible sustained interruption with its audible overlap", () => {
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: true,
        ephemeralSpeakingShot: "left",
        ephemeralSpeechDurationMs: 3_100,
      }),
      "left",
    );
  });
});
