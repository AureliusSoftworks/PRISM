import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readSignalCameraTransitionMode,
  SIGNAL_CAMERA_TRANSITION_STORAGE_KEY,
  signalCameraTransitionsShouldAnimate,
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
});
