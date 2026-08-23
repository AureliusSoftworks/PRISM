import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee Group Library membership", () => {
  it("does not expose Coffee-side roster editing", () => {
    const settingsStart = pageSource.indexOf("const renderCoffeeGroupSettingsModal");
    const settingsEnd = pageSource.indexOf("const renderCoffeeGroupOverview", settingsStart);
    const settingsSource = pageSource.slice(settingsStart, settingsEnd);
    assert.doesNotMatch(settingsSource, /Choose a bot to add|Remove \$\{botName\}/u);
    assert.match(settingsSource, /Manage its[\s\S]{0,80}members in Library/u);
  });

  it("explains Library membership separately from per-session attendance", () => {
    const setup = MODE_TUTORIALS.coffee.steps.find(
      (step) => step.heading === "Set the table",
    );
    assert.match(setup?.body ?? "", /linked Library group manages permanent members/u);
    assert.match(setup?.body ?? "", /saved sessions retain their original cast/u);
    assert.match(setup?.body ?? "", /Invited and Away choices affect only/u);
  });
});
