import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);
const tutorial = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("groups Case File item repairs behind three focused choices", () => {
  assert.match(experience, /An item isn&apos;t accurate/u);
  assert.match(
    experience,
    /sceneRepairItemMenu === "categories"[\s\S]{0,1800}<strong>Emoji<\/strong>[\s\S]{0,1800}<strong>Item information<\/strong>[\s\S]{0,1800}<strong>Asset<\/strong>/u,
  );
  assert.match(
    experience,
    /sceneRepairItemMenu === "information"[\s\S]{0,1300}<strong>Name<\/strong>[\s\S]{0,1300}<strong>Description<\/strong>/u,
  );
  assert.match(
    experience,
    /openSceneRepairItemPicker\("regenerate_evidence_asset", "categories"\)/u,
  );
  assert.match(
    experience,
    /const CASE_FILE_ROOT_REPAIR_ACTIONS[\s\S]{0,180}"clean_case_file"/u,
  );
  assert.match(
    styles,
    /\.sceneRepairOptions\[data-layout="three"\][\s\S]{0,100}repeat\(3/u,
  );
  assert.match(tutorial, /Emoji, Item information, and Asset/u);
});
