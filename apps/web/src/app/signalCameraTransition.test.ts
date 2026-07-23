import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readSignalCameraTransitionMode,
  SIGNAL_CAMERA_TRANSITION_STORAGE_KEY,
  signalCameraTransitionStyleForChange,
  signalCameraTransitionsShouldAnimate,
  signalLiveAutoCameraShot,
  signalThinkingBeatCameraShot,
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

  it("holds the Producer guest without forcing ordinary bot pauses Wide", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        producerGuestThinking: true,
      }),
      "right",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        producerGuestThinking: false,
      }),
      "left",
    );
  });

  it("directs stable bot-thinking beats Wide most often with both close-up alternatives", () => {
    const shots = Array.from({ length: 500 }, (_, index) =>
      signalThinkingBeatCameraShot({
        seed: `episode:message-${index}:guest`,
        thinkingShot: "right",
        nonThinkingShot: "left",
      }),
    );
    const counts = {
      wide: shots.filter((shot) => shot === "wide").length,
      thinking: shots.filter((shot) => shot === "right").length,
      nonThinking: shots.filter((shot) => shot === "left").length,
    };
    assert.ok(counts.wide > counts.thinking);
    assert.ok(counts.wide > counts.nonThinking);
    assert.ok(counts.thinking > 0);
    assert.ok(counts.nonThinking > 0);
    assert.equal(
      signalThinkingBeatCameraShot({
        seed: "episode:message-42:guest",
        thinkingShot: "right",
        nonThinkingShot: "left",
      }),
      shots[42],
    );
  });

  it("cuts directly to live speech and holds that shot through handoff pauses", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        speakingShot: "right",
        postSpeechHoldShot: "left",
        producerGuestThinking: false,
      }),
      "right",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        thinkingShot: "wide",
        postSpeechHoldShot: "left",
        producerGuestThinking: false,
      }),
      "wide",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        postSpeechHoldShot: "left",
        producerGuestThinking: false,
      }),
      "left",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "right",
        producerGuestThinking: false,
      }),
      "right",
    );
  });

  it("preserves base shots and higher-priority listener reactions", () => {
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        producerGuestThinking: false,
      }),
      "left",
    );
    assert.equal(
      signalLiveAutoCameraShot({
        baseShot: "left",
        listenerReactionShot: "right",
        speakingShot: "left",
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
        producerGuestThinking: false,
      }),
      "wide",
    );
  });
});
