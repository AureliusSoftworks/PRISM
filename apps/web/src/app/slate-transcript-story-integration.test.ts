import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("offers one transcript-to-Slate path across applet transcript surfaces", () => {
  assert.match(pageSource, /\/api\/slate\/transcript-stories/u);
  assert.match(pageSource, /sourceApplet: "Chat \/ Zen"/u);
  assert.match(pageSource, /data-tutorial-target="coffee-create-slate-story"/u);
  assert.match(pageSource, /data-tutorial-target="story-create-slate-story"/u);
  assert.match(signalSource, /data-tutorial-target="botcast-create-slate-story"/u);
  assert.match(debateSource, /data-tutorial-target="debate-create-slate-story"/u);
});

test("explains that transcript stories remain editable with private provenance", () => {
  assert.match(
    tutorialSource,
    /short, editable story; the exact source transcript remains private provenance/u,
  );
  assert.match(
    tutorialSource,
    /turn the exchange into a short, editable story while preserving the exact source transcript as private provenance/u,
  );
});
