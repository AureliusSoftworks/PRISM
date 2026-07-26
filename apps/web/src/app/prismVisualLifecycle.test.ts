import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismVisualLifecycleController } from "./prismVisualLifecycle.ts";

describe("PRISM visual lifecycle", () => {
  it("keeps ordinary blur in the foreground while still tracking focus", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: true,
      reducedMotion: false,
    });
    assert.equal(controller.snapshot.lifecycle, "foreground");

    const blurred = controller.dispatch({ type: "blur" });
    assert.equal(blurred.lifecycle, "foreground");
    assert.equal(blurred.focused, false);
    assert.equal(blurred.visible, true);

    const focused = controller.dispatch({ type: "focus" });
    assert.equal(focused.lifecycle, "foreground");
    assert.equal(focused.focused, true);
  });

  it("suspends on hidden, pagehide, and system pause, then restores without focus gating", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: true,
      reducedMotion: false,
    });
    assert.equal(controller.snapshot.lifecycle, "foreground");

    assert.equal(
      controller.dispatch({ type: "visibility", hidden: true }).lifecycle,
      "suspended",
    );
    assert.equal(
      controller.dispatch({
        type: "pageshow",
        hidden: false,
        focused: false,
      }).lifecycle,
      "foreground",
    );
    assert.equal(controller.dispatch({ type: "pagehide" }).lifecycle, "suspended");
    assert.equal(
      controller.dispatch({
        type: "pageshow",
        hidden: false,
        focused: true,
      }).lifecycle,
      "foreground",
    );
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

  it("can stay foreground while unfocused when the document remains visible", () => {
    const controller = new PrismVisualLifecycleController({
      hidden: false,
      focused: false,
      reducedMotion: false,
    });
    assert.equal(controller.snapshot.lifecycle, "foreground");
    assert.equal(controller.snapshot.focused, false);
  });
});
