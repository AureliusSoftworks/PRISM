import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("empty Chat Spotlight search", () => {
  it("lets the polished Spotlight own search without the browser rail overlapping it", () => {
    const rendererSource = pageSource.slice(
      pageSource.indexOf("const renderChatCanvasPickerControls"),
      pageSource.indexOf("const renderChatBotPickerGrid"),
    );

    assert.match(
      rendererSource,
      /const standaloneSpotlightOwnsSearch =\s*\(view === "chat" \|\| view === "sandbox"\) &&\s*\(!detail \|\| detail\.messages\.length === 0\);/,
    );
    assert.match(
      rendererSource,
      /sortedPanelBots\.length === 0 \|\|\s*standaloneSpotlightOwnsSearch/,
    );
    assert.match(rendererSource, /variant: "chat"/);
  });

  it("keeps the polished search field as the active empty-state search UI", () => {
    assert.match(
      pageSource,
      /const persistentEmptyCanvasSpotlight =\s*\(view === "chat" \|\| view === "sandbox"\) &&\s*\(!detail \|\| detail\.messages\.length === 0\);/,
    );
    assert.equal(
      pageSource.match(/\{renderEmptyStateBotSearch\(\)\}/g)?.length,
      1,
    );
    assert.match(pageSource, /className=\{styles\.emptyStateSearchField\}/);
    assert.match(pageSource, /className=\{styles\.emptyStateSearchInput\}/);
    assert.match(pageSource, /className=\{styles\.emptyStateSearchGroupPicker\}/);
  });

  it("keeps the persistent Spotlight focused while its query activates", () => {
    assert.match(
      pageSource,
      /const emptyStateSpotlightInputRef = useRef<HTMLInputElement \| null>\(null\);/,
    );
    assert.match(
      pageSource,
      /useEffect\(\(\) => \{\s*if \(!emptyStateSearchActive\) return;\s*const timeout = window\.setTimeout\(\(\) => \{\s*const input = emptyStateSpotlightInputRef\.current;\s*if \(!input \|\| document\.activeElement === input\) return;\s*input\.focus\(\{ preventScroll: true \}\);/,
    );
    assert.match(
      pageSource,
      /ref=\{emptyStateSpotlightInputRef\}[\s\S]*?className=\{styles\.emptyStateSearchInput\}/,
    );
    assert.match(
      pageSource,
      /searchInputRef: emptyStateSearchInputRef/,
    );
    assert.match(
      pageSource,
      /const emptyStateTypingSearchAvailable =\s*\(view === "chat" \|\| view === "sandbox"\) &&/,
    );
    assert.match(
      pageSource,
      /if \(!emptyStateSearchActive && !spotlightTypingArmedRef\.current\) return;[\s\S]*?openEmptyStateBotSearchFromTyping\(event\.key\);/,
    );
  });

  it("reserves layout space for the Spotlight above the bot grid", () => {
    const searchRule = cssSource.slice(
      cssSource.indexOf(".emptyStateSearch {"),
      cssSource.indexOf(".emptyStateSearchField {"),
    );

    assert.match(searchRule, /position:\s*relative;/);
    assert.match(searchRule, /order:\s*2;/);
    assert.match(searchRule, /flex:\s*0 0 auto;/);
    assert.doesNotMatch(searchRule, /position:\s*absolute;/);
    assert.doesNotMatch(searchRule, /top:\s*var\(--empty-state-search-top/);
    assert.equal(
      pageSource.match(
        /sortedPanelBots\.length > 0\s*\? styles\.emptyStateHubPicker\s*:\s*null/g,
      )?.length,
      2,
    );
  });
});
