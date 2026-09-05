import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee Library roster contract", () => {
  it("creates tables from explicit per-bot Library choices", () => {
    assert.match(pageSource, /const coffeeBotLibraryGroupFilterOptions = useMemo/u);
    assert.match(pageSource, /aria-label="Invite bots to Coffee"/u);
    assert.match(pageSource, /toggleCoffeeSeatBotId\(current, botId\)/u);
    assert.match(pageSource, /groupBotIds: coffeeSelectedSeatBotIdsForLoadedBots/u);
  });

  it("keeps permanent Coffee roster changes in table settings", () => {
    const settingsStart = pageSource.indexOf("const renderCoffeeGroupSettingsModal");
    const settingsEnd = pageSource.indexOf("const renderCoffeeGroupOverview", settingsStart);
    const settingsSource = pageSource.slice(settingsStart, settingsEnd);
    assert.match(settingsSource, /Choose a bot to add to this Coffee Group/u);
    assert.match(settingsSource, /aria-label=\{`Remove \$\{botName\} from this Coffee Group`\}/u);
    assert.match(pageSource, /groupBotIds: coffeeGroupRosterDraft/u);
    assert.doesNotMatch(pageSource, /Save as group/u);
    assert.doesNotMatch(pageSource, /generateCoffeeGroupFromPrism/u);
  });

  it("routes staged Library-room starts through the selected fixed roster", () => {
    const runnerStart = pageSource.indexOf("botGroupCoffeeLaunchRunnerRef.current = async");
    const runnerEnd = pageSource.indexOf(
      "const currentBotGroupCoffeeReturnCheckpoint",
      runnerStart,
    );
    const runnerSource = pageSource.slice(runnerStart, runnerEnd);
    assert.match(
      runnerSource,
      /coffeeGroupRosterSignature\(group\.botGroupIds\)[\s\S]{0,120}coffeeGroupRosterSignature\(selectedBotIds\)/u,
    );
    assert.match(runnerSource, /groupBotIds: coffeeSeatsFromBotIds\(selectedBotIds\)/u);
    assert.match(
      runnerSource,
      /excludedBotIds: linkedGroup\.botGroupIds\.filter/u,
    );
    assert.doesNotMatch(runnerSource, /createCoffeeSession\(/u);
  });

  it("supports all five permanent bots at the live table while keeping attendance separate", () => {
    assert.match(pageSource, /const COFFEE_GROUP_MIN_SIZE_CLIENT = 2/u);
    assert.match(pageSource, /const COFFEE_GROUP_MAX_SIZE_CLIENT = 5/u);
    assert.match(pageSource, /const COFFEE_SESSION_ATTENDEE_MAX_SIZE_CLIENT = 5/u);
    assert.match(pageSource, /coffeeSelectedBotIds\.length >= COFFEE_GROUP_MIN_SIZE_CLIENT/u);
    assert.match(pageSource, /coffeeSelectedBotIds\.length <= COFFEE_GROUP_MAX_SIZE_CLIENT/u);
    assert.match(pageSource, /Invited and Away apply only to the[\s\S]{0,40}next session/u);
  });
});
