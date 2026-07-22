import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const introSource = readFileSync(
  new URL("./PrismIntroSequence.tsx", import.meta.url),
  "utf8",
);
const firstRunSource = readFileSync(
  new URL("./PrismFirstRunLivingLayer.tsx", import.meta.url),
  "utf8",
);
const firstRunCss = readFileSync(
  new URL("./PrismFirstRunLivingLayer.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./PrismLivingTutorial.tsx", import.meta.url),
  "utf8",
);
const tutorialCss = readFileSync(
  new URL("./PrismLivingTutorial.module.css", import.meta.url),
  "utf8",
);

describe("living-shell first run", () => {
  it("orders requirements and account creation before the account-owned cinematic", () => {
    assert.doesNotMatch(pageSource, /shouldShowFirstLaunchWelcome/u);
    assert.match(
      pageSource,
      /const shouldShowPreAuthChecklist =\s*!user && !hasAnyAccounts && !preAuthChecklistComplete/u,
    );
    assert.match(pageSource, /requestFirstRunPrismIntro\(\{[\s\S]*force: true/u);
    assert.match(pageSource, /onboardingState\.stage !== "intro"/u);
    assert.match(pageSource, /eulaAccepted: true/u);
  });

  it("always resolves a skipped poem into the Prism awakening", () => {
    assert.match(introSource, /onClose\("skipped"\)/u);
    assert.match(introSource, /onClose\("completed"\)/u);
    assert.match(
      pageSource,
      /onResolved: \(resolution\) => \{[\s\S]*stage: "awakening"[\s\S]*introResolution: resolution/u,
    );
    assert.match(firstRunSource, /PRISM_AUTHORED_WELCOME/u);
    assert.match(pageSource, /englishVoiceEngine: "builtin"/u);
  });

  it("forms all three first choices directly in the canvas", () => {
    assert.match(firstRunSource, />Start writing</u);
    assert.match(firstRunSource, />Meet the spectrum</u);
    assert.match(firstRunSource, />Show me around</u);
    assert.match(firstRunSource, /data-stage=\{stage\}/u);
    assert.match(firstRunCss, /@keyframes orbArrival/u);
    assert.match(firstRunCss, /@keyframes prismUnfold/u);
    assert.match(firstRunCss, /pointer-events:\s*none/u);
    assert.match(firstRunCss, /@media \(prefers-reduced-motion: reduce\)/u);
  });

  it("keeps setup secrets in native controls and out of progress persistence", () => {
    assert.match(pageSource, /type="password"/u);
    assert.match(pageSource, /\/api\/living-shell\/progress/u);
    assert.doesNotMatch(
      pageSource,
      /persistLivingShellProgress\([\s\S]{0,240}(openAiKey|anthropicKey|elevenLabsKey|braveSearchKey)/u,
    );
  });

  it("uses one moving Prism guide with action-led advancement and no Next button", () => {
    assert.match(tutorialSource, /guideOrb/u);
    assert.match(tutorialSource, /prismLivingTutorialCaption\(step\.body\)/u);
    assert.match(tutorialSource, /Remind me later/u);
    assert.match(tutorialSource, />\s*Skip\s*</u);
    assert.doesNotMatch(tutorialSource, />Next</u);
    assert.match(pageSource, /target\.addEventListener\("click", advanceFromTarget\)/u);
    assert.match(
      pageSource,
      /livingShellProgressHydratedUserRef\.current !== user\.id/u,
    );
    assert.match(
      pageSource,
      /activeTutorialMode === "zen"[\s\S]*safeStepIndex === 1[\s\S]*BOT_LIBRARY_GROUP_FILTER_UNGROUPED/u,
    );
    assert.match(pageSource, /PRISM_LIVING_TUTORIAL_CAPTION_ID/u);
    assert.match(
      pageSource,
      /onboardingState\.stage !== "complete" \|\|[\s\S]*activeTutorialMode !== null/u,
    );
    assert.match(tutorialCss, /box-shadow:[\s\S]*9999px/u);
    assert.match(tutorialCss, /@media \(prefers-reduced-motion: reduce\)/u);
  });
});
