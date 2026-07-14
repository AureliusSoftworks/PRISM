import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("bot group canvas filtering", () => {
  it("renders saved group identity as a hero without replacing the filtered grid", () => {
    assert.match(pageSource, /const renderFocusedBotLibraryGroupHero/);
    assert.equal(
      pageSource.match(/const groupHero = renderFocusedBotLibraryGroupHero/g)
        ?.length,
      2,
    );
    assert.doesNotMatch(pageSource, /renderFocusedBotLibraryGroupDashboard/);
    assert.doesNotMatch(pageSource, /if \(groupHero\) return groupHero/);
    assert.doesNotMatch(pageSource, /styles\.emptyStateGroupDashboard/);
    assert.match(
      pageSource,
      /\{groupHero\}[\s\S]*?renderChatCanvasPickerControls\(controlsStyle\)[\s\S]*?renderChatBotPickerGrid/,
    );
    assert.match(
      pageSource,
      /if \(activeBotLibraryGroupFilter && selectedBotIds\.length === 0\)[\s\S]*?openBotLibraryGroupBotContextMenu/,
    );
    assert.equal(pageSource.match(/openCanvasBotContextMenu\(/g)?.length, 2);
  });

  it("keeps the group description, controls, and combined member gradient in the hero", () => {
    const heroSource = pageSource.slice(
      pageSource.indexOf("const renderFocusedBotLibraryGroupHero"),
      pageSource.indexOf("const renderChatCanvasPickerControls"),
    );

    assert.match(heroSource, /className=\{styles\.botGroupHero\}/);
    assert.match(heroSource, /botLibraryGroupVisualStyle\(/);
    assert.match(heroSource, /focusedBotLibraryGroup\.description\.trim\(\)/);
    assert.match(heroSource, /"Protect group"/);
    assert.match(heroSource, />Export group</);
    assert.match(heroSource, />\s*Edit\s*</);
    assert.match(heroSource, />Delete</);
    assert.match(
      cssSource,
      /\.botGroupHero\s*\{[\s\S]*?width:\s*min\([\s\S]*?--empty-state-browser-width[\s\S]*?var\(--bot-library-group-gradient\)/,
    );
  });

  it("omits zero-count Ungrouped options and clears stale selections", () => {
    assert.match(
      pageSource,
      /\.\.\.\(ungroupedPanelBots\.length > 0[\s\S]*?menuName: "Ungrouped bots"/,
    );
    assert.match(
      pageSource,
      /\.\.\.\(ungroupedCoffeeBots\.length > 0[\s\S]*?menuName: "Ungrouped bots"/,
    );
    assert.match(
      pageSource,
      /\{ungroupedPanelBots\.length > 0 \? \([\s\S]*?value=\{BOT_LIBRARY_GROUP_FILTER_UNGROUPED\}/,
    );
    assert.match(
      pageSource,
      /botLibraryGroupFilterId !== BOT_LIBRARY_GROUP_FILTER_UNGROUPED[\s\S]*?ungroupedPanelBots\.length > 0[\s\S]*?setBotLibraryGroupFilterId\(BOT_LIBRARY_GROUP_FILTER_ALL\)/,
    );
    assert.match(
      pageSource,
      /setCoffeeBotLibraryGroupFilterId\(BOT_LIBRARY_GROUP_FILTER_ALL\)/,
    );
  });
});
