import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_RUN_SETUP_STEPS,
  clampFirstRunSetupStepIndex,
  firstRunSetupProgressPercent,
  firstRunSetupStepAt,
} from "./firstRunOnboarding.ts";

describe("first-run onboarding", () => {
  it("keeps setup choices one step at a time", () => {
    assert.deepEqual(
      FIRST_RUN_SETUP_STEPS.map((step) => step.id),
      [
        "place",
        "provider",
        "openai",
        "anthropic",
        "elevenlabs",
        "local-model",
        "online-model",
        "ready",
      ]
    );
  });

  it("marks credentials and model choices as skippable", () => {
    for (const stepId of [
      "openai",
      "anthropic",
      "elevenlabs",
      "local-model",
      "online-model",
    ]) {
      assert.equal(
        FIRST_RUN_SETUP_STEPS.find((step) => step.id === stepId)?.optional,
        true
      );
    }
  });

  it("clamps restored progress and reaches a full final bar", () => {
    assert.equal(firstRunSetupStepAt(-4).id, "place");
    assert.equal(firstRunSetupStepAt(999).id, "ready");
    assert.equal(clampFirstRunSetupStepIndex(2.9), 2);
    assert.equal(firstRunSetupProgressPercent(0), 0);
    assert.equal(firstRunSetupProgressPercent(999), 100);
  });
});
