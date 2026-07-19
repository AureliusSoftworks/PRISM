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

  it("introduces the customizable mixed-provider Auto chain", () => {
    assert.match(pageSource, /ordered chain of one to five/u);
    assert.match(pageSource, /local or online fallback models/u);
    assert.match(pageSource, /at least one fallback in Settings/u);
  });

  it("names chat routing separately from image and voice routing", () => {
    const providerStep = FIRST_RUN_SETUP_STEPS.find(
      (step) => step.id === "provider",
    );
    assert.equal(providerStep?.title, "Choose your chat home base");
    assert.match(pageSource, /Image generation has its own LOCAL\/ONLINE choice/u);
    assert.match(
      pageSource,
      /choose an ElevenLabs voice from the list or open “Use an exact\s*Voice ID” for a portable override in bot customization from\s*any chat mode; Prism uses it only for eligible ONLINE speech/u,
    );
    assert.match(pageSource, /Chat home base/u);
  });

  it("explains that an ElevenLabs profile voice is the online override", () => {
    assert.match(
      pageSource,
      /Speech stays on the PRISM Voice Pack until you select an ElevenLabs voice in Prism or bot customization/u,
    );
    assert.match(pageSource, /Voice Settings can limit bot menus to one ElevenLabs voice collection/u);
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
