import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_ONBOARDING_VERSION,
  createPrismTutorialProgress,
  normalizePrismOnboardingState,
  normalizePrismTutorialProgress,
  prismTutorialShouldRun,
} from "./livingShellProgress.ts";

describe("living-shell account progress", () => {
  it("starts new accounts at the intro and treats migrated accounts as complete", () => {
    assert.equal(normalizePrismOnboardingState({}, 0).stage, "intro");
    assert.equal(
      normalizePrismOnboardingState({}, PRISM_ONBOARDING_VERSION).stage,
      "complete",
    );
  });

  it("normalizes resumable onboarding state without accepting arbitrary stages", () => {
    assert.deepEqual(
      normalizePrismOnboardingState(
        { stage: "setup", introResolution: "skipped", setupStep: 4.8 },
        0,
      ),
      { stage: "setup", introResolution: "skipped", setupStep: 4 },
    );
    assert.equal(
      normalizePrismOnboardingState({ stage: "steal-secrets" }, 0).stage,
      "intro",
    );
  });

  it("migrates legacy booleans and honors persisted reminders", () => {
    const progress = normalizePrismTutorialProgress({ zen: true, slate: false });
    assert.equal(progress.zen.status, "completed");
    assert.equal(progress.slate.status, "pending");

    const remind = createPrismTutorialProgress().coffee;
    remind.status = "remind";
    remind.remindAfter = new Date(Date.now() + 60_000).toISOString();
    assert.equal(prismTutorialShouldRun(remind), false);
    assert.equal(prismTutorialShouldRun(remind, Date.now() + 120_000), true);
  });
});
