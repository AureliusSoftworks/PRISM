import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
const playExperience = readFileSync(new URL("./DebateMysteryV2Experience.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
const tutorials = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");

test("Mystery setup shows only spoiler-safe Spark interpretation chips", () => {
  assert.match(experience, /inferMysterySparkMotifsV1\(\s*mysteryInspiration/u);
  assert.match(experience, /PRISM heard/u);
  assert.match(experience, /mysterySparkMotifs\.map/u);
  assert.match(experience, /Leave the spark blank for a seeded surprise/u);
  assert.match(styles, /\.sparkInterpretation/u);
  assert.match(tutorials, /they never reveal responsible parties or sealed relationships/u);
});

test("Theory Board presents the public charge and supports two defendants", () => {
  assert.match(playExperience, /caseCharge\.accusationPrompt/u);
  assert.match(playExperience, /Accused · choose one or two/u);
  assert.match(playExperience, /debateMysteryTheoryWithAccusedSeatIdsV2/u);
  assert.match(playExperience, /defendantVerdicts/u);
  assert.match(playExperience, /MIXED VERDICT/u);
  assert.match(tutorials, /Guilty or Not Guilty result for each defendant/u);
});
