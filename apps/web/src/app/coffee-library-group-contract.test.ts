import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee Library group contract", () => {
  it("creates tables from a Library source card, including Ungrouped", () => {
    assert.match(pageSource, /COFFEE_LIBRARY_UNGROUPED_SOURCE_ID = "builtin:ungrouped"/u);
    assert.match(pageSource, /const coffeeTableSources = useMemo/u);
    assert.match(pageSource, /Choose one Library group. Its current members stay invited/u);
    assert.match(pageSource, /libraryGroupId: source\.id/u);
    assert.match(pageSource, /Table ready · open \$\{linkedTable\.name\}/u);
  });

  it("keeps Coffee roster changes in Library rather than the table settings", () => {
    const settingsStart = pageSource.indexOf("const renderCoffeeGroupSettingsModal");
    const settingsEnd = pageSource.indexOf("const renderCoffeeGroupOverview", settingsStart);
    const settingsSource = pageSource.slice(settingsStart, settingsEnd);
    assert.match(settingsSource, /Manage its[\s\S]{0,80}members in Library/u);
    assert.doesNotMatch(settingsSource, /Choose a bot to add to this Coffee Group/u);
    assert.doesNotMatch(settingsSource, /aria-label=\{`Remove \$\{botName\} from this Coffee Group`\}/u);
    assert.doesNotMatch(pageSource, /Save as group/u);
    assert.doesNotMatch(pageSource, /generateCoffeeGroupFromPrism/u);
  });

  it("routes Library-room starts through the linked table without a one-off roster fallback", () => {
    const runnerStart = pageSource.indexOf("botGroupCoffeeLaunchRunnerRef.current = async");
    const runnerEnd = pageSource.indexOf(
      "const currentBotGroupCoffeeReturnCheckpoint",
      runnerStart,
    );
    const runnerSource = pageSource.slice(runnerStart, runnerEnd);
    assert.match(
      runnerSource,
      /group\.libraryGroupId === launch\.sourceGroupId/u,
    );
    assert.match(runnerSource, /libraryGroupId: launch\.sourceGroupId/u);
    assert.match(
      runnerSource,
      /excludedBotIds: linkedGroup\.botGroupIds\.filter/u,
    );
    assert.doesNotMatch(runnerSource, /createCoffeeSession\(/u);
  });

  it("requires two to four live bots while allowing larger linked invite pools", () => {
    assert.match(pageSource, /const COFFEE_GROUP_MIN_SIZE_CLIENT = 2/u);
    assert.match(pageSource, /const COFFEE_SESSION_ATTENDEE_MAX_SIZE_CLIENT = 4/u);
    assert.match(pageSource, /future sessions; Coffee seats up to four at a time/u);
    assert.match(pageSource, /The table can wait for enough members to join/u);
    assert.match(pageSource, /sessions start at \$\{COFFEE_GROUP_MIN_SIZE_CLIENT\}/u);
    assert.match(pageSource, /const coffeeSelectionValid = coffeeSelectedTableSource !== null/u);
    assert.doesNotMatch(pageSource, /const eligible = source\.count >= COFFEE_GROUP_MIN_SIZE_CLIENT/u);
  });
});
