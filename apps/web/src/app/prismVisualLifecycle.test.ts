import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismVisualLifecycleController } from "./prismVisualLifecycle.ts";

describe("PRISM visual lifecycle", () => {
  it("suspends on blur, hidden, and pagehide, then restores on focus/pageshow", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: true,
      reducedMotion: false,
    });
    assert.equal(controller.snapshot.lifecycle, "foreground");
    assert.equal(controller.dispatch({ type: "blur" }).lifecycle, "suspended");
    assert.equal(controller.dispatch({ type: "focus" }).lifecycle, "foreground");
    assert.equal(
      controller.dispatch({ type: "visibility", hidden: true }).lifecycle,
      "suspended",
    );
    assert.equal(
      controller.dispatch({
        type: "pageshow",
        hidden: false,
        focused: true,
      }).lifecycle,
      "foreground",
    );
    assert.equal(controller.dispatch({ type: "pagehide" }).lifecycle, "suspended");
  });

  it("tracks reduced motion without changing semantic lifecycle state", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: true,
      reducedMotion: false,
    });
    const snapshot = controller.dispatch({
      type: "reduced-motion",
      matches: true,
    });
    assert.equal(snapshot.lifecycle, "foreground");
    assert.equal(snapshot.reducedMotion, true);
  });

  it("suspends while a modal system pause is active and resumes cleanly", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: true,
      reducedMotion: false,
    });
    const paused = controller.dispatch({
      type: "system-pause",
      active: true,
    });
    assert.equal(paused.lifecycle, "suspended");
    assert.equal(paused.systemPaused, true);

    const resumed = controller.dispatch({
      type: "system-pause",
      active: false,
    });
    assert.equal(resumed.lifecycle, "foreground");
    assert.equal(resumed.systemPaused, false);
  });
});
