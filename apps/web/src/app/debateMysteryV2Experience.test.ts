import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const experienceSource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);

describe("Whodunnit V2 prosecution experience", () => {
  it("exposes the finite investigation and statement-level court grammar", () => {
    for (const action of [
      "move",
      "examine",
      "talk",
      "present_to_suspect",
      "file_theory",
      "focus_statement",
      "press_statement",
      "present_record",
      "choose_prosecution_response",
      "consult_partner",
      "retry_witness_checkpoint",
    ]) {
      assert.match(experienceSource, new RegExp(`action: [\"']${action}[\"']`, "u"));
    }
    assert.match(experienceSource, /Previous statement/u);
    assert.match(experienceSource, /Next statement/u);
    assert.match(experienceSource, /Present against this statement/u);
    assert.match(experienceSource, /Incomplete method, motive, or opportunity will weaken the case/u);
    assert.doesNotMatch(experienceSource, /actionsRemaining|action token|freeform/iu);
  });

  it("uses only the completed local pack during gameplay", () => {
    assert.match(experienceSource, /mystery-audio\/\$\{encodeURIComponent\(lineId\)\}/u);
    assert.match(experienceSource, /Premium voices are unavailable in Whodunnit V2/u);
    assert.match(experienceSource, /No ElevenLabs request will be made/u);
    assert.doesNotMatch(experienceSource, /playMysteryVoice|playMysteryPlayerVoice|elevenlabs\.io/iu);
  });

  it("renders the full Case Forge and accessible replay-safe callouts", () => {
    for (const stage of [
      "Writing the Case",
      "Testing Contradictions",
      "Directing Performances",
      "Preparing Local Voices",
      "Verifying Case Audio",
      "Begin Case",
    ]) {
      assert.match(experienceSource, new RegExp(stage, "u"));
    }
    for (const callout of [
      "HOLD IT!",
      "OBJECTION!",
      "ORDER!",
      "SUSTAINED!",
      "OVERRULED!",
      "TESTIMONY REVISED",
      "GUILTY",
      "NOT GUILTY",
    ]) {
      assert.ok(experienceSource.includes(callout));
    }
    assert.match(experienceSource, /aria-live="assertive"/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
    assert.match(cssSource, /\.callout span/u);
  });

  it("creates new cases as V2 prosecution cases with Jury Trial default support", () => {
    assert.match(setupSource, /DEBATE_MYSTERY_V2_SCHEMA_VERSION/u);
    assert.match(setupSource, /trialType: juryEnabled \? "jury" : "bench"/u);
    assert.match(setupSource, /jurorBotIds: juryEnabled/u);
    assert.match(setupSource, /playerRole: "participant"/u);
    assert.match(setupSource, /Premium unavailable for Whodunnit V2/u);
    assert.match(setupSource, /props\.initialFormat === "whodunnit"/u);
  });
});
