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

describe("Coffee Group Prism setup invent", () => {
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

  it("wires Wield Prism magic on the Coffee Groups + control", () => {
    assert.match(pageSource, /id: "coffee:new-group-generate"/u);
    assert.match(pageSource, /generateCoffeeGroupFromPrism/u);
    assert.match(
      pageSource,
      /PrismRefractTarget target=\{newCoffeeGroupMagic\}/u,
    );
    assert.match(
      pageSource,
      /\/api\/coffee\/groups\/setup-suggestion/u,
    );
    assert.match(
      pageSource,
      /data-tutorial-target="coffee-new-group"/u,
    );
    assert.match(
      pageSource,
      /ensureCoffeeModelReady\(true\)[\s\S]{0,1200}\/api\/coffee\/groups\/setup-suggestion/u,
    );
    assert.match(pageSource, /Refraction complete/u);
    assert.match(
      pageSource,
      /coffeeNewGroupGenerateBusy && coffeeModelWarmup/u,
    );
  });

  it("creates the invented group with name, ethos, cast, and topics", () => {
    assert.match(
      pageSource,
      /const generateCoffeeGroupFromPrism = async[\s\S]*?\/api\/coffee\/groups\/setup-suggestion[\s\S]*?\/api\/coffee\/groups[\s\S]*?name: suggestion\.name[\s\S]*?ethos: suggestion\.ethos[\s\S]*?groupBotIds: suggestion\.groupBotIds[\s\S]*?starterTopics: suggestion\.starterTopics/u,
    );
    assert.match(
      pageSource,
      /openCoffeeGroup\(response\.group\)/u,
    );
  });
});
