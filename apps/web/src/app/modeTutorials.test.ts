import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODE_TUTORIALS, modeTutorialStep } from "./modeTutorials.ts";

describe("mode tutorials", () => {
  it("keeps every step click-specific and targetable", () => {
    for (const tutorial of Object.values(MODE_TUTORIALS)) {
      assert.ok(tutorial.steps.length > 0);
      for (const step of tutorial.steps) {
        assert.ok(step.clickLabel.trim().length > 0);
        assert.match(step.targetSelector, /^\[data-tutorial-target=/);
      }
    }
  });

  it("clamps restored progress to a valid step", () => {
    assert.equal(modeTutorialStep("zen", -1).heading, "Stay with PRISM");
    assert.equal(modeTutorialStep("coffee", 99).heading, "Join the conversation");
    assert.equal(modeTutorialStep("botcast", 99).heading, "Direct the replay");
  });

  it("presents the production applet as Signal", () => {
    assert.equal(MODE_TUTORIALS.botcast.title, "Signal producer walkthrough");
  });
});
