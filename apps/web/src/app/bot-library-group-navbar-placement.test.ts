import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

test("All Bots moves the library group picker into the unavailable navbar Facet slot", () => {
  const headerPicker = sourceBetween(
    "const renderHeaderModelPicker =",
    "const renderImagesPanelModelPicker =",
  );

  assert.match(
    headerPicker,
    /const showBotLibraryGroupPicker =[\s\S]*directBotSelectionVisible[\s\S]*botLibraryGroupFilterOptions\.length > 0/u,
  );
  assert.match(
    headerPicker,
    /\{showBotLibraryGroupPicker \? \([\s\S]*<BotLibraryGroupPicker[\s\S]*value=\{botLibraryGroupPickerValue\}[\s\S]*onChange=\{applyBotLibraryHeaderFilter\}[\s\S]*onCreateGroup=\{\(\) => openCreateBotLibraryGroupDialog\(\[\]\)\}/u,
  );
  assert.match(
    headerPicker,
    /\{showBotPicker \? \([\s\S]*<ComposerBotPicker[\s\S]*\) : null\}[\s\S]*\{showBotLibraryGroupPicker \? \(/u,
  );
});

test("the empty-state spotlight no longer duplicates the library group picker", () => {
  const emptyStateSearch = sourceBetween(
    "const renderEmptyStateBotSearch =",
    "const renderCanvasBotBrowserRail =",
  );

  assert.doesNotMatch(emptyStateSearch, /BotLibraryGroupPicker/u);
  assert.doesNotMatch(cssSource, /emptyStateSearchGroupPicker/u);
  assert.match(
    cssSource,
    /\.chatHeaderModelPicker \.botLibraryGroupControl\s*\{[\s\S]*width:\s*min\(300px, 30vw\);/u,
  );
  assert.match(
    cssSource,
    /\.chatHeaderModelPicker \.botLibraryGroupTrigger\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*border-radius:\s*8px 0 0 8px;/u,
  );
  assert.match(
    cssSource,
    /\.chatHeaderModelPicker \.botLibraryGroupCreate\s*\{[\s\S]*height:\s*100%;[\s\S]*border-radius:\s*0 8px 8px 0;/u,
  );
  assert.match(
    cssSource,
    /\.themeLight \.chatHeaderModelPicker \.botLibraryGroupControl\s*\{[\s\S]*--bot-library-group-trigger-shadow:\s*none;/u,
  );
});
