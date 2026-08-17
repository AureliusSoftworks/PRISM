import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  signalListenerReactionCameraShot,
  signalLiveAutoCameraShot,
} from "./signalCameraTransition.ts";

describe("Signal automatic camera direction", () => {

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
