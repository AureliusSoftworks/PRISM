import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
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
      /if \(activeBotLibraryGroupFilter\) \{[\s\S]*?openBotLibraryGroupBotContextMenu/,
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
    assert.match(heroSource, /Explore \{focusedBotLibraryGroup\.name\}/);
    assert.match(heroSource, /"Protect group"/);
    assert.match(heroSource, /label: "Export group"/);
    assert.match(
      heroSource,
      /openAddBotFromLibraryGroupDialog\(\s*focusedBotLibraryGroup\.id,?\s*\)/,
    );
    assert.match(heroSource, />Add bots</);
    assert.match(heroSource, />Group actions</);
    assert.match(heroSource, /label: "Edit details"/);
    assert.match(heroSource, /label: "Delete group"/);
    assert.match(
      cssSource,
      /\.botGroupHero\s*\{[\s\S]*?width:\s*min\([\s\S]*?--empty-state-browser-width[\s\S]*?var\(--bot-library-group-gradient\)/,
    );
  });

  it("keeps future built-in groups selectable while reserving mutable hero controls", () => {
    assert.match(
      pageSource,
      /const selectableBotLibraryGroups = useMemo\([\s\S]*?group\.id !== BOT_LIBRARY_FAVORITES_GROUP_ID/,
    );
    assert.equal(
      pageSource.match(/\.\.\.selectableBotLibraryGroups\.map\(optionForGroup\)/g)
        ?.length,
      2,
    );
    assert.doesNotMatch(
      pageSource,
      /\.\.\.customBotLibraryGroups\.map\(optionForGroup\)/,
    );

    const heroSource = pageSource.slice(
      pageSource.indexOf("const renderFocusedBotLibraryGroupHero"),
      pageSource.indexOf("const renderChatCanvasPickerControls"),
    );
    assert.match(
      heroSource,
      /if \(!focusedBotLibraryGroup\.builtIn\) \{[\s\S]*?label: "Edit details"[\s\S]*?label: "Delete group"/,
    );
  });

  it("suppresses compact grid placeholders while a group filter is active", () => {
    assert.match(
      pageSource,
      /if \(\s*!b\s*\) \{[\s\S]*?pickerBots\.length\s*<[\s\S]*?pickerSourceBots\.length[\s\S]*?return null;[\s\S]*?styles\.chatBotTilePlaceholder/,
    );
  });

  it("returns group-picker focus after selection and focuses the group-first dialog", () => {
    assert.match(
      pageSource,
      /const pick = \(nextValue: string\): void => \{[\s\S]*?setOpen\(false\);[\s\S]*?triggerRef\.current\?\.focus\(\);/,
    );
    assert.match(
      pageSource,
      /const pickBotMode = dialog\.mode === "pick-bot"[\s\S]*?<select[\s\S]*?value=\{pickBotMode \? selectedBotId : selectedGroupId\}[\s\S]*?autoFocus/,
    );
  });

  it("offers direct group creation with an in-dialog member roster", () => {
    assert.equal(
      pageSource.match(
        /onCreateGroup=\{\(\) => openCreateBotLibraryGroupDialog\(\[\]\)\}/g,
      )?.length,
      2,
    );
    assert.match(
      pageSource,
      /data-tutorial-target="chat-new-group"[\s\S]*?<Plus/,
    );
    assert.doesNotMatch(
      pageSource,
      /function openCreateBotLibraryGroupDialog\([\s\S]{0,260}uniqueSelected\.length < 2\) return/,
    );
    assert.match(
      pageSource,
      /className=\{styles\.botLibraryGroupMemberGrid\}[\s\S]*?sortedPanelBots\.map\([\s\S]*?toggleBotLibraryGroupDialogMember/,
    );
    assert.match(
      cssSource,
      /\.botLibraryGroupMemberGrid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    assert.match(
      tutorialSource,
      /targetSelector: '\[data-tutorial-target="chat-new-group"\]'/,
    );
  });

  it("explains when removing members deletes an undersized custom group", () => {
    assert.match(
      pageSource,
      /const deletesUndersizedGroup =[\s\S]*?remainingBotIds\.length < BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS/,
    );
    assert.match(
      pageSource,
      /deleted \"\$\{target\.name\}\" because custom groups need at least \$\{BOT_LIBRARY_CUSTOM_GROUP_MIN_BOTS\} bots\. The bots were kept\./,
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
