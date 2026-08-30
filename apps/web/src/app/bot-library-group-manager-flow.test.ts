import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Bot Library group manager flow", () => {
  it("uses one staged workspace for creating, renaming, and changing membership", () => {
    assert.match(pageSource, /function openBotLibraryGroupManager/u);
    assert.match(pageSource, /function addBotLibraryGroupManagerGroup/u);
    assert.match(pageSource, /function removeBotLibraryGroupManagerGroup/u);
    assert.match(pageSource, /renameBotLibraryGroupManagerDraft/u);
    assert.match(pageSource, /describeBotLibraryGroupManagerDraft/u);
    assert.match(pageSource, /removeBotLibraryGroupManagerDraft/u);
    assert.match(pageSource, /setBotLibraryGroupManagerMembers/u);
    assert.doesNotMatch(pageSource, /renderBotLibraryAddToGroupDialog/u);
  });

  it("keeps persistence behind explicit Save and leaves Cancel local", () => {
    assert.match(pageSource, /Nothing changes in your Library until you save\./u);
    assert.match(pageSource, /function saveBotLibraryGroupManager[\s\S]*?setBotLibraryGroups\(normalizeBotLibraryGroups\(saved\)\)/u);
    assert.match(pageSource, /onClick=\{closeBotLibraryGroupManager\}>Cancel<\/button>/u);
  });

  it("shows the selected group identity and protects capacity", () => {
    assert.match(pageSource, /data-group-gradient-preview="true"/u);
    assert.match(pageSource, /botLibraryGroupVisualStyle\(selected, selectedGroupBots, resolvedTheme\)/u);
    assert.match(pageSource, /style=\{botLibraryGroupVisualStyle\(group, groupBots, resolvedTheme\)\}/u);
    assert.match(pageSource, /group\.botIds\.length >= BOT_LIBRARY_GROUP_BOT_CAP/u);
    assert.match(pageSource, /data-focused-bot=/u);
  });

  it("edits group details and keeps stale members removable", () => {
    assert.match(pageSource, /<span>Description<\/span>/u);
    assert.match(pageSource, /What brings this group together\?/u);
    assert.match(pageSource, /Remove group/u);
    assert.match(pageSource, /data-unavailable-bot="true"/u);
    assert.match(pageSource, /aria-label="Remove unavailable bot"/u);
    assert.match(
      tutorialSource,
      /rename or describe it and add or remove members[\s\S]*Remove group is staged[\s\S]*Cancel leaves the Library untouched until Save changes/u,
    );
  });

  it("keeps narrow rails and long lists reachable", () => {
    assert.match(
      styles,
      /\.botLibraryGroupManager\s*\{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto;/u,
    );
    assert.match(styles, /\.botLibraryGroupManagerRailList,[\s\S]*?overflow: auto;/u);
    assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?grid-template-columns: 1fr;/u);
    assert.match(styles, /\.botLibraryGroupManagerRailList \{[\s\S]*?overflow-x: auto;/u);
    assert.match(styles, /\.botLibraryGroupManagerFields \{[\s\S]*?grid-template-columns: 1fr;/u);
    assert.match(styles, /\.botLibraryGroupManagerPreview \{[\s\S]*?flex-wrap: wrap;/u);
  });
});
