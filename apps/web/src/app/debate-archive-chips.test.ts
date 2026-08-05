import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildDebateArchiveChipVisualStyle } from "./debateArchiveChipGradient.ts";

const appDir = dirname(fileURLToPath(import.meta.url));
const experienceSource = readFileSync(
  join(appDir, "DebateExperience.tsx"),
  "utf8",
);
const css = readFileSync(join(appDir, "DebateExperience.module.css"), "utf8");
const sharedDebate = readFileSync(
  join(appDir, "../../../../packages/shared/src/debate.ts"),
  "utf8",
);
const apiDebate = readFileSync(
  join(appDir, "../../../api/src/debate.ts"),
  "utf8",
);

test("debate archive chips build Coffee-style cast gradients", () => {
  const style = buildDebateArchiveChipVisualStyle(
    "session-1",
    ["#ff4d6d", "#2fd3e3", "#7b5cff"],
    "dark",
  );
  assert.match(style["--debate-archive-gradient"], /radial-gradient/u);
  assert.match(style["--debate-archive-gradient"], /rgba\(\d+,\s*\d+,\s*\d+,\s*0\.\d+\)/u);
});

test("debate archive list items carry model, effort, and cast colors", () => {
  assert.match(sharedDebate, /castColors\?: string\[\]/u);
  assert.match(sharedDebate, /reasoningEffort\?: ModelReasoningEffortPreference/u);
  assert.match(sharedDebate, /lastReasoningEffort\?: ModelReasoningEffortPreference/u);
  assert.match(apiDebate, /castColors = debateSessionListCastColors\(parsed\)/u);
  assert.match(apiDebate, /lastReasoningEffort: debateRuntimeReasoningEffort/u);
});

test("debate archive rows render gradient chips with model and effort", () => {
  assert.match(experienceSource, /buildDebateArchiveChipVisualStyle\(/u);
  assert.match(experienceSource, /className=\{styles\.archiveChip\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipTag\}/u);
  assert.match(experienceSource, /debateArchiveModelLabel\(/u);
  assert.match(experienceSource, /DebateArchiveEffortIcon/u);
  assert.match(css, /\.archiveChip\s*\{/u);
  assert.match(css, /--debate-archive-gradient/u);
  assert.match(css, /\.archiveChipTag\s*\{/u);
  assert.match(css, /\.archiveChipRouting\s*\{/u);
});
