import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { filterBotPickerItems } from "./botPickerFilter.ts";

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
