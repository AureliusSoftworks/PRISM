import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");
const serverSource = readFileSync(
  join(here, "../../../api/src/server.ts"),
  "utf8",
);
const coffeeSource = readFileSync(
  join(here, "../../../api/src/coffee.ts"),
  "utf8",
);

describe("Coffee Group setup", () => {
  it("exposes setup-suggestion beside Coffee group create", () => {
    assert.match(
      serverSource,
      /route\("POST", "\/api\/coffee\/groups\/setup-suggestion"/u,
    );
    assert.match(
      serverSource,
      /setup-suggestion[\s\S]{0,1200}debateAiRuntimeForUser/u,
    );
    assert.match(
      serverSource,
      /setup-suggestion[\s\S]{0,1600}suggestCoffeeGroupSetup/u,
    );
    assert.match(
      serverSource,
      /coffee\/groups\/setup-suggestion[\s\S]{0,2200}provider:\s*invent\.provider[\s\S]{0,80}model:\s*invent\.model/u,
    );
    assert.match(coffeeSource, /export async function suggestCoffeeGroupSetup/u);
  });

  it("opens explicit Library bot selection from the Coffee Groups + control", () => {
    assert.match(
      pageSource,
      /data-tutorial-target="coffee-new-group"/u,
    );
    assert.match(pageSource, /aria-label="Invite bots to Coffee"/u);
    assert.match(pageSource, /ariaLabel="Bots available for Coffee"/u);
    assert.doesNotMatch(pageSource, /PrismRefractTarget target=\{newCoffeeGroupMagic\}/u);
  });

  it("creates a table from the explicitly selected fixed roster", () => {
    assert.match(
      pageSource,
      /const createCoffeeGroupFromSelection[\s\S]*?groupBotIds: coffeeSelectedSeatBotIdsForLoadedBots/u,
    );
    assert.match(
      pageSource,
      /openCoffeeGroup\(response\.group\)/u,
    );
  });

  it("accepts bot-roster table creation and editing at the API boundary", () => {
    const createStart = serverSource.indexOf(
      'route("POST", "/api/coffee/groups"',
    );
    const createEnd = serverSource.indexOf(
      'route("POST", "/api/coffee/groups/setup-suggestion"',
      createStart,
    );
    const createSource = serverSource.slice(createStart, createEnd);
    assert.match(
      createSource,
      /\(libraryGroupId \? \{ libraryGroupId \} : \{ groupBotIds \}\)/u,
    );

    const patchStart = serverSource.indexOf(
      'route("PATCH", "/api/coffee/groups/:id"',
    );
    const patchEnd = serverSource.indexOf(
      'route("DELETE", "/api/coffee/groups/:id"',
      patchStart,
    );
    const patchSource = serverSource.slice(patchStart, patchEnd);
    assert.match(patchSource, /\.\.\.\(groupBotIds !== undefined \? \{ groupBotIds \} : \{\}\)/u);
    assert.doesNotMatch(patchSource, /membership comes from its Library group/u);
  });
});
