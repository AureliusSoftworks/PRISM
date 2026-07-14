import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FIRST_RUN_SETUP_STORAGE_KEY,
  FIRST_RUN_SETUP_STEPS,
  clampFirstRunSetupStepIndex,
  clearFirstRunSetupCompletion,
  firstRunSetupProgressPercent,
  firstRunSetupStepAt,
} from "./firstRunOnboarding.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

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
        "auto-models",
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
      "auto-models",
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

  it("clears the completion marker without making blocked storage fatal", () => {
    const removedKeys: string[] = [];
    assert.equal(
      clearFirstRunSetupCompletion({
        removeItem(key) {
          removedKeys.push(key);
        },
      }),
      true,
    );
    assert.deepEqual(removedKeys, [FIRST_RUN_SETUP_STORAGE_KEY]);

    assert.equal(
      clearFirstRunSetupCompletion({
        removeItem() {
          throw new Error("storage unavailable");
        },
      }),
      false,
    );
  });

  it("keeps guided setup available from Settings", () => {
    assert.match(pageSource, /data-first-run-setup-reentry="true"/u);
    assert.match(pageSource, />Run guided setup again</u);
    assert.match(pageSource, /onClick=\{reopenDesktopFirstRunChecklist\}/u);
  });
});
