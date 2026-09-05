import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee Group roster editing", () => {
  it("keeps saved groups visible and selectable in Coffee's left rail", () => {
    assert.match(pageSource, /data-tutorial-target="coffee-groups"/u);
    assert.match(pageSource, /coffeeGroups\.map\(renderCoffeeGroupRow\)/u);
    assert.match(
      pageSource,
      /const renderCoffeeGroupRow[\s\S]*?onClick=\{\(\) => openCoffeeGroup\(group\)\}/u,
    );
  });

  it("creates groups from explicit per-bot Library selection", () => {
    assert.match(pageSource, /toggleCoffeeSeatBotId\(current, botId\)/u);
    assert.match(pageSource, /groupBotIds: coffeeSelectedSeatBotIdsForLoadedBots/u);
    assert.match(pageSource, /Choose \$\{COFFEE_GROUP_MIN_SIZE_CLIENT\}-\$\{COFFEE_GROUP_MAX_SIZE_CLIENT\} Library bots before forming the group/u);
    assert.doesNotMatch(
      pageSource,
      /Coffee table membership comes from its Library group, not a bot selection/u,
    );
  });

  it("opens the existing group editor from Configure bots", () => {
    assert.match(pageSource, /aria-label="Configure Coffee Group bots"/u);
    assert.match(
      pageSource,
      /aria-label="Configure Coffee Group bots"[\s\S]*?onClick=\{\(\) => openCoffeeSettingsModal\(group\)\}/u,
    );
    assert.match(pageSource, /Add or remove members/u);
  });

  it("keeps the editable roster between two and five Library bots", () => {
    assert.match(pageSource, /addCoffeeGroupRosterDraftBot/u);
    assert.match(pageSource, /removeCoffeeGroupRosterDraftBot/u);
    assert.match(
      pageSource,
      /memberCount <= COFFEE_GROUP_MIN_SIZE_CLIENT/u,
    );
    assert.match(
      pageSource,
      /rosterBotCount >= COFFEE_GROUP_MAX_SIZE_CLIENT/u,
    );
    assert.match(pageSource, /Choose a Library bot/u);
    assert.match(pageSource, /Unavailable bot/u);
  });

  it("saves only the permanent roster through the existing PATCH contract", () => {
    assert.match(pageSource, /groupBotIds: coffeeGroupRosterDraft/u);
    assert.match(pageSource, /starterTopics: group\.starterTopics \?\? \[\]/u);
    assert.match(
      pageSource,
      /setCoffeeSelectedSeatBotIds\(response\.group\.coffeeSeatBotIds\)/u,
    );
  });

  it("explains permanent members separately from per-session attendance", () => {
    const setup = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Set the table",
    );
    assert.match(setup?.body ?? "", /Configure bots adds or removes/u);
    assert.match(setup?.body ?? "", /Saved sessions retain their original cast/u);
    assert.match(setup?.body ?? "", /Invited and Away choices affect only/u);
  });
});
