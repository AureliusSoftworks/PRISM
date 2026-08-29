import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMAT_VISUAL_THEMES,
} from "@localai/shared";

describe("Debate format visual themes", () => {
  it("covers every current and announced sub-module", () => {
    assert.deepEqual(
      Object.keys(DEBATE_FORMAT_VISUAL_THEMES).sort(),
      DEBATE_FORMAT_CATALOG.map((entry) => entry.id).sort(),
    );
  });

  it("gives every available sub-module a distinct dark and light accent", () => {
    const availableThemes = DEBATE_FORMAT_CATALOG
      .filter((entry) => entry.availability === "available")
      .map((entry) => DEBATE_FORMAT_VISUAL_THEMES[entry.id]);

    assert.equal(
      new Set(availableThemes.map((theme) => theme.accentDark)).size,
      availableThemes.length,
    );
    assert.equal(
      new Set(availableThemes.map((theme) => theme.accentLight)).size,
      availableThemes.length,
    );
    assert.equal(DEBATE_FORMAT_VISUAL_THEMES.whodunnit.archiveNoun, "case");
    assert.equal(DEBATE_FORMAT_VISUAL_THEMES.turnabout.archiveNoun, "trial");
  });

  it("drives both the Studio shell and completed archive shelves", () => {
    const experience = readFileSync(
      new URL("./DebateExperience.tsx", import.meta.url),
      "utf8",
    );
    const css = readFileSync(
      new URL("./DebateExperience.module.css", import.meta.url),
      "utf8",
    );

    assert.match(experience, /style=\{debateFormatThemeStyle\(format, props\.theme\)\}/u);
    assert.match(experience, /groupDebateArchiveSessionsByFormat\(completedSessions\)/u);
    assert.match(experience, /className=\{styles\.archiveFormatShelf\}/u);
    assert.match(experience, /DEBATE_FORMAT_VISUAL_THEMES\[shelf\.format\]/u);
    assert.match(css, /\.archiveFormatShelf\s*\{/u);
    assert.match(css, /box-shadow:[\s\S]{0,180}var\(--debate-studio-accent\)/u);
  });
});
