import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_DEBATE_JURY_SETTINGS,
  DEBATE_JURY_DECISION_TIMEOUT_MAX_MS,
  DEBATE_JURY_DECISION_TIMEOUT_MIN_MS,
  debateJurySettingsStorageKey,
  normalizeDebateJurySettings,
} from "./debateJurySettings.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);

describe("Debate Jury settings", () => {
  it("defaults to a quick timed Auto choice", () => {
    assert.deepEqual(DEFAULT_DEBATE_JURY_SETTINGS, {
      autoDeliberationEnabled: true,
      decisionTimeoutMs: 6_000,
    });
    assert.deepEqual(normalizeDebateJurySettings(null), {
      autoDeliberationEnabled: true,
      decisionTimeoutMs: 6_000,
    });
  });

  it("clamps and rounds the choice countdown", () => {
    assert.equal(
      normalizeDebateJurySettings({ decisionTimeoutMs: 1 }).decisionTimeoutMs,
      DEBATE_JURY_DECISION_TIMEOUT_MIN_MS,
    );
    assert.equal(
      normalizeDebateJurySettings({ decisionTimeoutMs: 99_000 })
        .decisionTimeoutMs,
      DEBATE_JURY_DECISION_TIMEOUT_MAX_MS,
    );
    assert.equal(
      normalizeDebateJurySettings({ decisionTimeoutMs: 6_600 })
        .decisionTimeoutMs,
      7_000,
    );
  });

  it("scopes the setting by account and exposes it in Debate settings", () => {
    assert.notEqual(
      debateJurySettingsStorageKey("account-a"),
      debateJurySettingsStorageKey("account-b"),
    );
    assert.match(
      settingsPanelSource,
      /\{ scope: "debate", title: "Debate", icon: <Gavel/u,
    );
    assert.match(pageSource, /activeSettingsScope === "debate"/u);
    assert.match(pageSource, /Automatically choose Auto/u);
    assert.match(pageSource, /Jury deliberation choice countdown/u);
    assert.match(pageSource, /Judge \/ Moderator sessions stay on\s*Auto/u);
    assert.match(
      pageSource,
      /juryAutoDeliberationEnabled=\{[\s\S]{0,100}debateJurySettings\.autoDeliberationEnabled/u,
    );
    assert.match(
      pageSource,
      /juryDecisionTimeoutMs=\{debateJurySettings\.decisionTimeoutMs\}/u,
    );
  });
});
