import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("empty Chat Spotlight search", () => {
  it("keeps the empty-Home bot browser mounted in both Zen and transcript Chat", () => {
    assert.match(
      pageSource,
      /const zenEmptyHeroVisible =\s*sharedChatConversationPresentation &&\s*\(!detail \|\| detail\.messages\.length === 0\) &&\s*!pendingReplyVisible &&\s*!zenEphemeralUserActionMessage/,
    );
    assert.doesNotMatch(
      pageSource,
      /const zenEmptyHeroVisible =\s*chatLikeSurface &&/,
    );
    assert.equal(pageSource.match(/\{zenEmptyHeroVisible &&/g)?.length, 1);
  });

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

  it("keeps the Hub picker controls compact against the bot grid", () => {
    const hubPickerControlsRule = cssSource.slice(
      cssSource.indexOf(".emptyStateHubPicker .chatCanvasPickerControls {"),
      cssSource.indexOf(".emptyStateHubPicker .chatBotPickerFrame {"),
    );
    assert.match(
      hubPickerControlsRule,
      /margin-top:\s*clamp\(12px,\s*2\.4vh,\s*26px\);/,
    );
    assert.doesNotMatch(hubPickerControlsRule, /margin-top:\s*auto;/);
    assert.doesNotMatch(hubPickerControlsRule, /padding-top:/);
    assert.match(cssSource, /\.emptyStateHubPicker\s*\{[\s\S]*padding-bottom:\s*24px;/);
    const hubPickerFrameRule = cssSource.slice(
      cssSource.indexOf(".emptyStateHubPicker .chatBotPickerFrame {"),
      cssSource.indexOf(".emptyStateHubPicker .chatBotPickerFrame[data-returning-all"),
    );
    assert.match(hubPickerFrameRule, /margin:\s*auto auto 0;/);
    assert.match(
      cssSource,
      /\.messages\.messagesEmptyState\[data-chat-ephemeral="true"\][\s\S]{0,180}padding-bottom:\s*24px;/,
    );
    assert.match(
      cssSource,
      /\.messages\.messagesEmptyState\[data-chat-ephemeral="true"\]:has\([\s\S]{0,100}> \.emptyStateHubPicker[\s\S]{0,100}--zen-empty-state-bottom-reserve:\s*24px;/,
    );
    assert.match(
      cssSource,
      /\.messagesEmptyState[\s\S]{0,80}> \.emptyState\.emptyStateHubPicker\s*\{[\s\S]{0,80}padding-bottom:\s*24px;/,
    );
    assert.match(
      cssSource,
      /@media \(min-width:\s*721px\)[\s\S]{0,420}> \.emptyState\.emptyStateHubPicker\s*\{[\s\S]{0,80}translate:\s*0 clamp\(56px,\s*8dvh,\s*96px\);/,
    );
  });

  it("keeps Spotlight search open while interacting with filtered bot tiles", () => {
    assert.doesNotMatch(
      pageSource,
      /ref=\{emptyStateSpotlightRef\}[\s\S]{0,220}onBlur=\{[\s\S]{0,280}closeEmptyStateBotSearch\(\)/u,
    );
    assert.match(
      pageSource,
      /function isEmptyStateSearchKeepAliveTarget\(/u,
    );
    assert.match(
      pageSource,
      /target\.closest\('\[data-bot-picker-frame="true"\]'\)/u,
    );
    assert.match(
      pageSource,
      /target\.closest\("\[data-prism-menu-owner\]"\)/u,
    );
  });
});
