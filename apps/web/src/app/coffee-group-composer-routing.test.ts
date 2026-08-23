import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
).replace(/\s+/gu, " ");
const pageCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.module.css"),
  "utf8",
).replace(/\s+/gu, " ");

describe("Coffee group dashboard composer routing", () => {
  it("routes group home through the compact Table Setup desk and one footer", () => {
    assert.match(pageSource, /<h2>Table Setup<\/h2>/);
    assert.match(pageSource, /Set the table/);
    assert.match(pageSource, /← Back to group/);
    assert.match(pageSource, /coffeeTableSetupFooter/);
    assert.match(pageSource, /coffeeTableSetupPrimaryButton/);
    assert.match(pageSource, /coffeeTableGuestSummary/);
    assert.match(pageSource, /coffeeTableTopicSummary/);
    assert.match(pageSource, /coffeeTableVisitSummary/);
    assert.match(pageSource, /coffeeTablePresetSummary/);
    assert.match(pageSource, /more needed/);
    assert.equal(
      (
        pageSource.match(
          /onClick=\{\(\) => void startCoffeeSessionFromSelectedSetup\(\)\}/g,
        ) ?? []
      ).length,
      1,
    );
    assert.match(
      pageSource,
      /coffeeSelectedGroup !== null\s*\? null\s*:\s*coffeeChromePolicy\.reviewActive/,
    );
    assert.doesNotMatch(pageSource, /data-coffee-group-start-composer=/);
    assert.doesNotMatch(pageSource, /SessionThresholdCard/);
  });

  it("keeps the typed topic composer behind an active Coffee conversation", () => {
    const shellStart = pageSource.indexOf("const renderCoffeeShell = ()");
    const shellEnd = pageSource.indexOf("return (", shellStart);
    assert.ok(shellStart >= 0 && shellEnd > shellStart);
    const shellSetup = pageSource.slice(shellStart, shellEnd);

    assert.match(
      shellSetup,
      /const coffeeComposerVisible =\s*conversationActive &&/,
    );
    assert.match(shellSetup, /coffeeSessionPhase === "topic"/);
    // Serve still needs the Coffee topic composer; otherwise the shell falls
    // through to coffee-global and hands the draft into Zen/chat.
    assert.match(
      shellSetup,
      /coffeeSessionPhase === "topic" \|\| \(!coffeeIsServeExperience &&/,
    );
    assert.match(
      pageSource,
      /coffeeSessionPhase === "topic" \|\| coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live" \? null : renderShellComposer\(\{ variant: "coffee-global"/,
    );
  });

  it("restores a recent session into an editable Coffee setup", () => {
    assert.match(pageSource, /data-tutorial-target="coffee-recent-sessions"/);
    assert.match(pageSource, /groupSessions\.slice\(0, 5\)/);
    assert.match(pageSource, /void openCoffeeSession\(session\.id\)/);
    assert.match(pageSource, /void loadCoffeeSessionSetup\(session\)/);
    assert.match(pageSource, /"Use setup"/);
    assert.match(pageSource, /coffeeSessionRetryDraft\(\{/);
    assert.match(
      pageSource,
      /setCoffeeExcludedBotIds\(new Set\(retry\.excludedBotIds\)\)/,
    );
    assert.match(pageSource, /setCoffeeSelectedDurationMinutes\(/);
    assert.match(pageSource, /setCoffeeSessionSettings\(retry\.settings\)/);
    assert.match(pageSource, /coffeeSettings: coffeeSessionSettings/);
    assert.match(pageSource, /deferTopicSelection: true/);
    assert.match(pageSource, /topicDraft: restoredSetup\.topicDraft/);
    assert.match(
      pageSource,
      /coffeeDraftRef\.current = topicDraft; setCoffeeDraft\(topicDraft\)/,
    );
    assert.match(
      pageSource,
      /Current model and response routing stay selected/,
    );
    assert.match(pageCss, /\.coffeeRestoredSetupNotice \{/);
    assert.match(pageCss, /\.coffeeGroupRecentSessionRow \{/);
    assert.match(pageCss, /\.coffeeGroupRecentSessionReuse \{/);
  });

  it("exposes the Join or Serve choice and sends it with a group start", () => {
    assert.match(pageSource, /coffeeExperienceModePicker/);
    assert.match(pageSource, /Join for Coffee/);
    assert.match(pageSource, /Serve Coffee/);
    assert.match(
      pageSource,
      /experienceMode:\s*coffeeSelectedExperienceMode/,
    );
    assert.doesNotMatch(
      pageSource,
      /experienceMode:\s*isCoffeeExperienceMode\(\s*coffeeSessionSettings\.experienceMode/,
      "stale settings must not override the visible Join or Serve choice",
    );
    assert.match(
      pageSource,
      /const coffeeExperienceAllowsPot = coffeeLiveExperienceMode === "serve"/,
    );
    assert.match(
      pageSource,
      /function coffeeExperienceModeForConversation\([\s\S]{0,500}coffeeSessionDurationMinutes === "number"[\s\S]{0,120}\? "serve"[\s\S]{0,80}: "join"/,
      "legacy timed Serve sessions must resolve identically on the stage and composer dock",
    );
    assert.equal(
      (pageSource.match(/coffeeExperienceModeForConversation\(coffeeConversation\)/g) ?? [])
        .length,
      2,
    );
    assert.match(
      pageSource,
      /const coffeePotComposerDockVisible =[\s\S]{0,260}coffeeExperienceAllowsPot/,
    );
    assert.match(
      pageSource,
      /!coffeeReplayActive &&\s*coffeeExperienceAllowsPot/,
      "live Serve owns the pot while faithful replay keeps its separate dock",
    );
    assert.match(pageSource, /coffeeSelectedExperienceMode === "serve"/);
    assert.match(pageSource, /coffeeSelectedExperienceMode === "join"/);
    assert.match(pageCss, /\.coffeeExperienceModeField \{/);
  });
});
