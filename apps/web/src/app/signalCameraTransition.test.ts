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
        timedReactionShot: "right",
      }),
      null,
    );
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: true,
        ephemeralSpeakingShot: "right",
      }),
      "right",
    );
  });

  it("cuts an eligible interruption with its audible overlap", () => {
    assert.equal(
      signalListenerReactionCameraShot({
        cameraCutEligible: true,
        ephemeralSpeakingShot: "left",
      }),
      "left",
    );
  });
});
