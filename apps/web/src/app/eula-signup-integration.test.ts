import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PRISM_EULA_AGREEMENT_CONFIRMATION,
  PRISM_EULA_MINIMUM_AGE_CONFIRMATION,
  PRISM_EULA_VERSION,
  PRISM_MODEL_VARIABILITY_NOTICE,
} from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(
  new URL("./EulaAgreement.tsx", import.meta.url),
  "utf8",
);
const dialogCss = readFileSync(
  new URL("./eula-agreement.module.css", import.meta.url),
  "utf8",
);
const firstRunSource = readFileSync(
  new URL("./firstRunOnboarding.ts", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("signup EULA integration", () => {
  it("uses explicit, accessible clickwrap before registration", () => {
    assert.match(pageSource, /Review & create account/u);
    assert.match(pageSource, /setEulaReviewOpen\(true\)/u);
    assert.match(pageSource, /<EulaAgreementDialog/u);
    assert.match(pageSource, /eulaAccepted: true/u);
    assert.match(pageSource, /eulaVersion: PRISM_EULA_VERSION/u);
    assert.match(pageSource, /minimumAgeConfirmed: true/u);

    assert.match(dialogSource, /dialog\.showModal\(\)/u);
    assert.match(dialogSource, /aria-labelledby="eula-dialog-title"/u);
    assert.match(dialogSource, /data-eula-scroll="true"/u);
    assert.match(dialogSource, /data-eula-acceptance="true"/u);
    assert.match(dialogSource, /PRISM_EULA_MINIMUM_AGE_CONFIRMATION/u);
    assert.match(dialogSource, /PRISM_EULA_AGREEMENT_CONFIRMATION/u);
    assert.match(PRISM_EULA_MINIMUM_AGE_CONFIRMATION, /at least 18 years old/u);
    assert.match(PRISM_EULA_AGREEMENT_CONFIRMATION, /read and agree/u);
    assert.match(
      dialogSource,
      /disabled=\{!minimumAgeConfirmed \|\| !agreementAccepted \|\| busy\}/u,
    );
    assert.match(dialogCss, /\.dialog::backdrop/u);
    assert.match(dialogCss, /@media print/u);
  });

  it("keeps the agreement retainable and outside skippable tutorials", () => {
    assert.match(pageSource, /href="\/legal\/eula"/u);
    assert.match(pageSource, /Legal &amp; AI notice/u);
    assert.doesNotMatch(firstRunSource, /EULA|End User License/u);
    assert.doesNotMatch(tutorialSource, /EULA|End User License/u);
    assert.match(PRISM_EULA_VERSION, /^\d{4}-\d{2}-\d{2}$/u);
  });

  it("puts the same model-variability warning beside model choices", () => {
    assert.match(PRISM_MODEL_VARIABILITY_NOTICE, /Results vary by model/u);
    assert.match(PRISM_MODEL_VARIABILITY_NOTICE, /Every PRISM experience/u);
    assert.ok(
      pageSource.match(/data-model-variability-notice="true"/gu)?.length === 3,
    );
    assert.match(pageSource, /\{PRISM_MODEL_VARIABILITY_NOTICE\}/u);
  });
});
