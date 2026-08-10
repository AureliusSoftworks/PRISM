import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee Group roster editing", () => {
  it("opens the existing group editor from Configure bots", () => {
    assert.match(pageSource, /aria-label="Configure Coffee Group bots"/u);
    assert.match(
      pageSource,
      /aria-label="Configure Coffee Group bots"[\s\S]*?onClick=\{\(\) => openCoffeeSettingsModal\(group\)\}/u,
    );
    assert.match(pageSource, /Add or remove members/u);
    assert.doesNotMatch(pageSource, /Configure bots — coming soon/u);
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
  });

  it("saves only the group roster and keeps existing topics immediate", () => {
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
    assert.match(setup?.body ?? "", /saved sessions retain their original cast/u);
    assert.match(setup?.body ?? "", /Invited and Away choices affect only/u);
  });
});
