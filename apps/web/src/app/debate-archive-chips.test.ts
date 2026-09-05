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

test("debate archive list items carry routing and frozen cast visuals", () => {
  assert.match(sharedDebate, /castColors\?: string\[\]/u);
  assert.match(
    sharedDebate,
    /advocateVisuals\?: DebateSessionAdvocateVisualV1\[\]/u,
  );
  assert.match(
    sharedDebate,
    /reasoningEffort\?: Exclude<ProviderReasoningEffort, "auto"> \| null/u,
  );
  assert.match(
    sharedDebate,
    /lastReasoningEffort\?: Exclude<ProviderReasoningEffort, "auto"> \| null/u,
  );
  assert.match(sharedDebate, /lastTurbo\?: boolean/u);
  assert.match(apiDebate, /castColors = debateSessionListCastColors\(parsed\)/u);
  assert.match(
    apiDebate,
    /advocateVisuals = debateSessionListAdvocateVisuals\(\s*parsed,\s*mysteryV2ArchiveState,\s*\)/u,
  );
  assert.match(apiDebate, /mysteryV2ArchiveState = mysteryV2/u);
  assert.match(apiDebate, /lastReasoningEffort: debateRuntimeReasoningEffort/u);
  assert.match(apiDebate, /lastTurbo: debateRuntimeTurbo/u);
});

test("debate archive rows render compact matchups with progressive detail", () => {
  assert.match(experienceSource, /buildDebateArchiveChipVisualStyle\(/u);
  assert.match(experienceSource, /className=\{styles\.archiveChip\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipTag\}/u);
  assert.match(experienceSource, /debateArchiveModelLabel\(/u);
  assert.match(experienceSource, /DebateArchiveEffortIcon/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipMatchup\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipCombatantIdentity\}/u);
  assert.match(experienceSource, /const whodunnitMatchup = session\.format === "whodunnit"/u);
  assert.match(experienceSource, /session\.forTeamName\?\.trim\(\) \|\| "Prosecution"/u);
  assert.match(experienceSource, /session\.againstTeamName\?\.trim\(\) \|\| "Defense"/u);
  assert.match(experienceSource, /<small>\{forMatchupSideLabel\}<\/small>/u);
  assert.match(experienceSource, /<b>\{forAdvocateVisual\.name\}<\/b>/u);
  assert.match(experienceSource, /<small>\{againstMatchupSideLabel\}<\/small>/u);
  assert.match(experienceSource, /<b>\{againstAdvocateVisual\.name\}<\/b>/u);
  assert.match(experienceSource, /aria-label=\{matchupLabel\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipToggle\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipMotionPreview\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipExpanded\}/u);
  assert.match(experienceSource, /className=\{styles\.archiveChipDetails\}/u);
  assert.doesNotMatch(experienceSource, /if \(level === "auto"\)/u);
  assert.match(experienceSource, /auto: "●"/u);
  assert.match(experienceSource, /none: "○"/u);
  assert.match(experienceSource, /\[auto\]/u);
  assert.match(experienceSource, /session\.turbo \? <span aria-hidden="true">🔥<\/span>/u);
  assert.match(experienceSource, /- Resolved routing:/u);
  assert.match(experienceSource, /- Effort:/u);
  assert.match(experienceSource, /DEBATE_TRANSCRIPT_EFFORT_GLYPHS/u);
  assert.match(css, /\.archiveChip\s*\{/u);
  assert.match(css, /--debate-archive-gradient/u);
  assert.match(css, /\.archiveChipTag\s*\{/u);
  assert.match(css, /\.archiveChipRouting\s*\{/u);
  assert.match(css, /\.archiveChipMatchup\s*\{/u);
  assert.match(css, /\.archiveChipCombatantIdentity\s*\{/u);
  assert.match(css, /\.archiveChipCombatant\s*\{/u);
  assert.match(css, /\.archiveChipCombatantCopy\s*\{/u);
  assert.match(css, /\.archiveChipVersus\s*\{/u);
  assert.match(css, /\.archiveChipToggle\s*\{/u);
  assert.match(css, /\.archiveChipMotionPreview\s*\{/u);
  assert.match(css, /\.archiveChipExpanded\s*\{/u);
  assert.match(css, /\.archiveChipDetails\s*\{/u);
  assert.match(
    css,
    /\.dashboard \.archivePanel \.archiveSynopsis p\s*\{[^}]*text-wrap:\s*pretty/u,
  );
  assert.doesNotMatch(css, /\.archiveSynopsis[\s\S]{0,240}-webkit-line-clamp/u);
});
