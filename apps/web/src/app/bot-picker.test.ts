import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  filterBotPickerItems,
  sortBotPickerItems,
} from "./botPickerFilter.ts";

const source = readFileSync(
  fileURLToPath(new URL("./BotPicker.tsx", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const signalSource = readFileSync(
  fileURLToPath(new URL("./BotcastExperience.tsx", import.meta.url)),
  "utf8",
);
const debateSource = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);

describe("shared bot picker", () => {
  const bots = [
    { id: "amber", name: "Amber" },
    { id: "blue", name: "Blue" },
    { id: "violet", name: "Violet" },
  ];
  const groups = [
    { id: "all", botIds: bots.map((bot) => bot.id) },
    { id: "warm", botIds: ["amber"] },
    { id: "cool", botIds: ["blue", "violet"] },
  ];

  it("combines group and case-insensitive name filtering", () => {
    assert.deepEqual(
      filterBotPickerItems(bots, "VIO", "cool", groups).map(
        (bot) => bot.id,
      ),
      ["violet"],
    );
    assert.deepEqual(
      filterBotPickerItems(bots, "", "warm", groups).map((bot) => bot.id),
      ["amber"],
    );
  });

  it("keeps an unknown group non-destructive and supports all bots", () => {
    assert.equal(filterBotPickerItems(bots, "", "missing", groups).length, 3);
    assert.equal(filterBotPickerItems(bots, "", "all", groups).length, 3);
  });

  it("sorts alphabetically by default and by color only with an active hue lens", () => {
    const unsortedBots = [
      { id: "violet", name: "Violet", hue: 40 },
      { id: "amber", name: "amber", hue: 280 },
      { id: "blue", name: "Blue", hue: 220 },
    ];
    const byHue = (
      left: (typeof unsortedBots)[number],
      right: (typeof unsortedBots)[number],
    ) => left.hue - right.hue;

    assert.deepEqual(
      sortBotPickerItems(unsortedBots, false, byHue).map((bot) => bot.id),
      ["amber", "blue", "violet"],
    );
    assert.deepEqual(
      sortBotPickerItems(unsortedBots, true, byHue).map((bot) => bot.id),
      ["violet", "blue", "amber"],
    );
    assert.deepEqual(
      unsortedBots.map((bot) => bot.id),
      ["violet", "amber", "blue"],
    );
  });

  it("keeps dropdown ordering tied to explicit hue-lens state", () => {
    assert.match(
      pageSource,
      /sortBotPickerItems\(\s*bots,\s*filtersEnabled && hueFilterCenter !== null/u,
    );
    assert.doesNotMatch(pageSource, /randomizeHueOnOpen/u);
    assert.match(
      signalSource,
      /sortBotPickerItems\(\s*filteredBots,\s*hueLensCenter !== null/u,
    );
  });

  it("provides shared grid, tile, toolbar, and arrow-key behavior", () => {
    assert.match(source, /export function BotPickerGrid/u);
    assert.match(source, /export function BotPickerTile/u);
    assert.match(source, /export function BotPickerToolbar/u);
    assert.match(source, /ArrowRight/u);
    assert.match(source, /button\[data-bot-id\]:not\(:disabled\)/u);
  });

  it("is consumed by Chat, Zen, Coffee, Signal, and Debate", () => {
    assert.match(pageSource, /const renderChatBotPickerGrid/u);
    assert.match(pageSource, /const renderCoffeeBotTile/u);
    assert.ok((pageSource.match(/<BotPickerTile/gu) ?? []).length >= 3);
    assert.match(signalSource, /<BotPickerTile/u);
    assert.match(debateSource, /<BotPickerTile/u);
  });
});
