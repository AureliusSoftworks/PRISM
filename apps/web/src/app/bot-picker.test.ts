import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  arrangeBotPickerItemsInColumnBands,
  botPickerRainbowHuePosition,
  compareBotPickerRainbowSortKeys,
  filterBotPickerItems,
  sortBotPickerItems,
} from "./botPickerFilter.ts";
import {
  BOT_PICKER_GROUP_MENU_GAP_PX,
  placeBotPickerGroupMenu,
} from "./botPickerGroupMenu.ts";

const source = readFileSync(
  fileURLToPath(new URL("./BotPicker.tsx", import.meta.url)),
  "utf8",
);
const pageSource = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const pageCssSource = readFileSync(
  fileURLToPath(new URL("./page.module.css", import.meta.url)),
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

  it("offers a reusable placement-Refract contract with an in-grid Space reroll", () => {
    assert.match(source, /export interface BotPickerPlacementRefractTarget/u);
    assert.match(source, /placementRefractTarget\?: BotPickerPlacementRefractTarget/u);
    assert.match(source, /registerPrismRefractTarget\(placementTargetId/u);
    assert.match(source, /event\.code === "Space"[\s\S]{0,500}rerollVisible\(\)/u);
    assert.match(source, /aria-keyshortcuts=\{placementTargetId \? "Space" : undefined\}/u);
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

  it("orders the rainbow on one continuous, transitive hue axis", () => {
    assert.equal(botPickerRainbowHuePosition(355), -5);
    assert.equal(botPickerRainbowHuePosition(5), 5);
    assert.equal(botPickerRainbowHuePosition(30), 30);
    assert.equal(botPickerRainbowHuePosition(290), 290);
    assert.equal(botPickerRainbowHuePosition(330), 330);
    assert.equal(botPickerRainbowHuePosition(-30), 330);

    const keys = [
      { id: "orange", name: "Orange", huePosition: 30, luminance: 0.9 },
      { id: "red-dark", name: "Red dark", huePosition: 12, luminance: 0.1 },
      { id: "red-bright", name: "Red bright", huePosition: 2, luminance: 1 },
    ].map((key) => ({ ...key, colorClass: 0, saturation: 100 }));
    const ordered = [...keys].sort(compareBotPickerRainbowSortKeys);

    assert.deepEqual(
      ordered.map((key) => key.id),
      ["red-bright", "red-dark", "orange"],
    );
    assert.ok(compareBotPickerRainbowSortKeys(ordered[0]!, ordered[1]!) < 0);
    assert.ok(compareBotPickerRainbowSortKeys(ordered[1]!, ordered[2]!) < 0);
    assert.ok(compareBotPickerRainbowSortKeys(ordered[0]!, ordered[2]!) < 0);

    const visualCells = arrangeBotPickerItemsInColumnBands(ordered, 2, 2);
    for (let row = 0; row < 2; row += 1) {
      const rowHues = [0, 1]
        .map((column) => visualCells[row * 2 + column]?.huePosition)
        .filter((hue): hue is number => hue !== undefined);
      assert.deepEqual(rowHues, [...rowHues].sort((left, right) => left - right));
    }
  });

  it("fills dense rainbow grids in vertical hue bands", () => {
    const cells = arrangeBotPickerItemsInColumnBands(
      Array.from({ length: 10 }, (_, index) => index),
      4,
      3,
    );

    assert.deepEqual(cells, [0, 3, 6, 9, 1, 4, 7, null, 2, 5, 8, null]);
    assert.deepEqual(
      [0, 1, 2].map((row) => cells[row * 4]),
      [0, 1, 2],
    );
    assert.match(
      pageSource,
      /data-rainbow-flow=\{rainbowColumnFlow \? "columns" : undefined\}/u,
    );
    assert.match(
      pageCssSource,
      /\.chatBotPicker\[data-rainbow-flow="columns"\][\s\S]*?visibility:\s*hidden/u,
    );
  });

  it("engages dropdown hue ordering locally and resets it on close", () => {
    assert.match(
      pageSource,
      /sortBotPickerItems\(\s*bots,\s*filtersEnabled && hueSortEngaged && hueFilterCenter !== null/u,
    );
    assert.match(
      pageSource,
      /const \[hueSortEngaged, setHueSortEngaged\] = useState\(false\)/u,
    );
    assert.match(
      pageSource,
      /const closeMenu = useCallback\(\(\): void => \{\s*setOpen\(false\);\s*setHueSortEngaged\(false\);/u,
    );
    assert.match(
      pageSource,
      /const handleMenuHueChange = useCallback\([\s\S]*?setHueSortEngaged\(next !== null\);[\s\S]*?onHueChange\?\.\(next\);/u,
    );
    assert.match(
      signalSource,
      /sortBotPickerItems\(\s*filteredBots,\s*hueLensCenter !== null/u,
    );
  });

  it("keeps Chat and Zen cards alphabetical until the Hue Cable is anchored", () => {
    assert.match(
      pageSource,
      /const hueCableCardOrderingActive =\s*zenHueStringEligible &&\s*zenHueDirectoryState\.hueAnchor !== null/u,
    );
    assert.match(
      pageSource,
      /hueCableCardOrderingActive\s*\?\s*\[\.\.\.filteredBots\]\s*:\s*sortBotPickerItems\(filteredBots, false\)/u,
    );
  });

  it("provides shared grid, tile, toolbar, and arrow-key behavior", () => {
    assert.match(source, /export function BotPickerGrid/u);
    assert.match(source, /export function BotPickerTile/u);
    assert.match(source, /export function BotPickerToolbar/u);
    assert.match(source, /ArrowRight/u);
    assert.match(source, /button\[data-bot-id\]:not\(:disabled\)/u);
  });

  it("uses the Library group-picker treatment instead of a native select", () => {
    assert.doesNotMatch(source, /<select[\s\S]{0,240}Filter by bot group/u);
    assert.match(source, /buildBotLibraryGroupVisualVariables/u);
    assert.match(source, /botLibraryGroupTrigger/u);
    assert.match(source, /botLibraryGroupOption/u);
    assert.match(
      source,
      /aria-haspopup=\{groupSelectionIsModal \? "dialog" : "listbox"\}/u,
    );
    assert.match(source, /ArrowDown[\s\S]{0,220}ArrowUp/u);
    assert.match(source, /createPortal\([\s\S]*botLibraryGroupMenu/u);
    assert.match(source, /placeBotPickerGroupMenu/u);
    assert.match(source, /groupMenuPortal/u);
    assert.match(source, /group\.count === 1[\s\S]*"1 bot"/u);
    assert.match(signalSource, /groupItems=\{bots\}/u);
    assert.match(signalSource, /groupTheme=\{theme\}/u);
    assert.match(debateSource, /groupItems=\{bots\}/u);
    assert.match(debateSource, /groupTheme=\{props\.theme\}/u);
  });

  it("uses a bounded modal group picker for Signal", () => {
    assert.match(source, /groupSelectionMode\?: "dropdown" \| "modal"/u);
    assert.match(source, /groupSelectionIsModal = groupSelectionMode === "modal"/u);
    assert.match(source, /role=\{groupSelectionIsModal \? "dialog" : undefined\}/u);
    assert.match(source, /aria-modal=\{groupSelectionIsModal \? true : undefined\}/u);
    assert.match(source, /groupModalBackdrop/u);
    assert.match(source, /groupModalListbox/u);
    assert.match(signalSource, /groupSelectionMode="modal"/u);
  });

  it("overrides Chat's upward composer menu so a body portal can sit on screen", () => {
    assert.match(
      pageCssSource,
      /\.composeBotMenu \{[\s\S]*?bottom: calc\(100% \+ 6px\)/u,
    );
    const below = placeBotPickerGroupMenu(
      { top: 80, right: 320, bottom: 112, width: 180 },
      { width: 1280, height: 800 },
    );
    assert.equal(below.position, "fixed");
    assert.equal(below.bottom, "auto");
    assert.equal(below.top, 112 + BOT_PICKER_GROUP_MENU_GAP_PX);

    const above = placeBotPickerGroupMenu(
      { top: 640, right: 320, bottom: 672, width: 180 },
      { width: 1280, height: 800 },
    );
    assert.equal(above.top, "auto");
    assert.equal(
      above.bottom,
      800 - 640 + BOT_PICKER_GROUP_MENU_GAP_PX,
    );
  });

  it("reuses the navbar group picker in Library workflow controls", () => {
    assert.match(
      pageSource,
      /<BotLibraryGroupPicker\s+value=\{botLibraryGroupPickerValue\}\s+options=\{botLibraryGroupFilterOptions\}\s+onChange=\{applyBotLibraryHeaderFilter\}/u,
    );
    assert.doesNotMatch(
      pageSource,
      /className=\{styles\.botLibraryFilterSelect\}[\s\S]{0,80}aria-label="Bot library filter"/u,
    );
  });

  it("unfocuses the focused Zen overview bot on reactivation", () => {
    assert.match(
      pageSource,
      /const tileActivation = resolveCanvasBotTileActivation\([\s\S]*?if \(tileActivation === "unfocus"\) \{[\s\S]*?resetEmptyStateBotSelection\(\);[\s\S]*?return;/u,
    );
    assert.match(pageSource, /"selected; activate to unfocus"/u);
    assert.doesNotMatch(
      pageSource,
      /if \(tileActivation === "unfocus"\) \{[\s\S]{0,420}openBotPanelHub\(b\)/u,
    );
    assert.match(pageSource, /OPEN BOT PANEL/u);
  });

  it("is consumed by Chat, Zen, Coffee, Signal, and Debate", () => {
    assert.match(pageSource, /const renderChatBotPickerGrid/u);
    assert.match(pageSource, /const renderCoffeeBotTile/u);
    assert.ok((pageSource.match(/<BotPickerTile/gu) ?? []).length >= 3);
    assert.match(signalSource, /<BotPickerTile/u);
    assert.match(debateSource, /<BotPickerTile/u);
  });

  it("opens the shared Library bot context menu from picker chips", () => {
    assert.match(
      pageSource,
      /data-debate-shell="true"[\s\S]{0,220}onContextMenu=\{handleAppContextMenu\}/u,
    );
    assert.match(
      pageSource,
      /data-debate-shell="true"[\s\S]*?renderContextMenuPortal\(renderBotContextMenu\(\)\)/u,
    );
    assert.match(
      debateSource,
      /onBotContextMenu\?\.\([\s\S]{0,80}bot\.id/u,
    );
    assert.match(
      signalSource,
      /onBotContextMenu\?\.\([\s\S]{0,80}bot\.id/u,
    );
    assert.match(
      pageSource,
      /onBotContextMenu=\{openBotContextMenuById\}/u,
    );
    assert.match(
      pageSource,
      /openBotContextMenu\(bot, event\.clientX, event\.clientY\)/u,
    );
  });
});
