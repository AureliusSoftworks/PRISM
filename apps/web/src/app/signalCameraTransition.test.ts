import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readSignalCameraTransitionMode,
  SIGNAL_CAMERA_TRANSITION_STORAGE_KEY,
  signalCameraTransitionStyleForChange,
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

  it("persists Smart and restores it in a later panel session", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    writeSignalCameraTransitionMode(storage, "smart");
    assert.equal(values.get(SIGNAL_CAMERA_TRANSITION_STORAGE_KEY), "smart");
    assert.equal(readSignalCameraTransitionMode(storage), "smart");
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
    assert.equal(signalCameraTransitionsShouldAnimate("smart", false), true);
    assert.equal(signalCameraTransitionsShouldAnimate("smart", true), false);
    assert.equal(signalCameraTransitionsShouldAnimate("instant", false), false);
  });

  it("always cuts instantly from one bot close-up to the other", () => {
    for (const mode of ["animated", "smart"] as const) {
      assert.equal(
        signalCameraTransitionStyleForChange({
          mode,
          previousShot: "left",
          nextShot: "right",
          transitionOrdinal: 1,
        }),
        "instant",
      );
      assert.equal(
        signalCameraTransitionStyleForChange({
          mode,
          previousShot: "right",
          nextShot: "left",
          transitionOrdinal: 2,
        }),
        "instant",
      );
    }
  });

  it("mixes animated and instant Wide transitions in a stable Smart cadence", () => {
    const styles = Array.from({ length: 10 }, (_, index) =>
      signalCameraTransitionStyleForChange({
        mode: "smart",
        previousShot: index % 2 === 0 ? "wide" : "left",
        nextShot: index % 2 === 0 ? "left" : "wide",
        transitionOrdinal: index + 1,
      }),
    );
    assert.deepEqual(styles, [
      "animated",
      "instant",
      "animated",
      "animated",
      "instant",
      "animated",
      "instant",
      "animated",
      "animated",
      "instant",
    ]);
  });

  it("keeps Instant fixed and gives reduced motion precedence over Smart", () => {
    assert.equal(
      signalCameraTransitionStyleForChange({
        mode: "instant",
        previousShot: "wide",
        nextShot: "left",
        transitionOrdinal: 1,
      }),
      "instant",
    );
    assert.equal(
      signalCameraTransitionStyleForChange({
        mode: "smart",
        previousShot: "wide",
        nextShot: "left",
        transitionOrdinal: 1,
        prefersReducedMotion: true,
      }),
      "instant",
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

  it("keeps episode bookend fades Wide even when a speaker or reaction is active", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        bookendWide: true,
        listenerReactionShot: "right",
        speakingShot: "left",
        postSpeechHoldShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "wide",
    );
  });

  it("keeps the full cup beat on camera despite competing close shots", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        cupActivityWide: true,
        listenerReactionShot: "right",
        speakingShot: "left",
        postSpeechHoldShot: "right",
        botThinking: false,
        producerGuestThinking: false,
      }),
      "wide",
    );
  });
});
