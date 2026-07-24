import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readSignalCameraTransitionMode,
  SIGNAL_CAMERA_TRANSITION_STORAGE_KEY,
  signalCameraTransitionsShouldAnimate,
  signalLiveAutoCameraShot,
  writeSignalCameraTransitionMode,
} from "./signalCameraTransition.ts";

describe("Signal camera transition preference", () => {
  it("persists Instant and restores it in a later panel session", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeSignalCameraTransitionMode(storage, "instant");
    assert.equal(
      values.get(SIGNAL_CAMERA_TRANSITION_STORAGE_KEY),
      "instant",
    );
    assert.equal(readSignalCameraTransitionMode(storage), "instant");
  });

  it("defaults corrupt or unavailable storage to Animated", () => {
    assert.equal(readSignalCameraTransitionMode(null), "animated");
    assert.equal(
      readSignalCameraTransitionMode({ getItem: () => "surprise" }),
      "animated",
    );
  });

  it("gives reduced-motion precedence over the saved Animated preference", () => {
    assert.equal(signalCameraTransitionsShouldAnimate("animated", false), true);
    assert.equal(signalCameraTransitionsShouldAnimate("animated", true), false);
    assert.equal(signalCameraTransitionsShouldAnimate("instant", false), false);
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

  it("cuts directly to live speech and holds that shot before returning Wide", () => {
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
      "left",
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
});
