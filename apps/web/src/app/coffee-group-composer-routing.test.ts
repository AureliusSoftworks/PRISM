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
  it("renders a Start Session action instead of an editable composer", () => {
    assert.match(
      pageSource,
      /coffeeSessionPhase === "selecting" && !conversationActive && coffeeSelectedGroup !== null/,
    );
    assert.match(pageSource, /data-coffee-group-start-composer="true"/);
    assert.match(
      pageSource,
      /`Start session with \$\{coffeeGroupStartCount\}`/,
    );
    assert.match(pageSource, /void startCoffeeSessionFromSelectedSetup\(\);/);
    assert.match(
      pageSource,
      /coffeeGroupStartComposerVisible\s*\? renderCoffeeGroupStartComposer\(\)/,
    );
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
    assert.match(pageSource, /coffeeSelectedExperienceMode === "serve"/);
    assert.match(pageSource, /coffeeSelectedExperienceMode === "join"/);
    assert.match(pageCss, /\.coffeeExperienceModeField \{/);
  });
});
