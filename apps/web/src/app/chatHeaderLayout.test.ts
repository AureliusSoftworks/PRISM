import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  APP_SHELL_TOP_NAV_HEIGHT_FALLBACK_PX,
  appShellTopNavHeightCssValue,
} from "./chatHeaderLayout.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Chat shell header layout", () => {
  it("rounds zoomed header measurements upward and has a safe fallback", () => {
    assert.equal(appShellTopNavHeightCssValue(60), "60px");
    assert.equal(appShellTopNavHeightCssValue(60.25), "61px");
    assert.equal(
      appShellTopNavHeightCssValue(Number.NaN),
      `${APP_SHELL_TOP_NAV_HEIGHT_FALLBACK_PX}px`,
    );
  });

  it("publishes the live navigation height from the shared header observer", () => {
    assert.match(
      pageSource,
      /appShellTopNavHeightCssValue\(header\.getBoundingClientRect\(\)\.height\)/,
    );
    assert.match(
      pageSource,
      /shell\.style\.setProperty\(\s*"--app-shell-top-nav-height"/,
    );
    assert.equal(
      pageSource.match(/data-app-shell-header="true"/g)?.length,
      3,
    );
  });

  it("moves Home navigation onto the PRISM wordmarks", () => {
    assert.doesNotMatch(pageSource, /renderLocationStrip/);
    assert.doesNotMatch(pageSource, /livingShellLocation/);
    assert.doesNotMatch(cssSource, /\.locationStrip(?:Home|Copy|Status)?\b/);
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.hubWordmark\} \$\{styles\.wordmarkHomeButton\}`\}[\s\S]*?onClick=\{openLivingShellHome\}[\s\S]*?data-home-affordance="wordmark"[\s\S]*?aria-label="Open All Bots Home"/,
    );
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.hubWordmark\} \$\{styles\.sidebarWordmarkButton\} \$\{styles\.wordmarkHomeButton\}`\}[\s\S]*?onClick=\{openLivingShellHome\}[\s\S]*?aria-label="Open All Bots Home"/,
    );
    const openHomeStart = pageSource.indexOf(
      "const openLivingShellHome =",
    );
    const openHomeEnd = pageSource.indexOf(
      "const prismCompanionSurfaceReference =",
      openHomeStart,
    );
    const openHomeSource = pageSource.slice(openHomeStart, openHomeEnd);
    assert.match(openHomeSource, /setChatAutoRestoreSuppressed\(true\)/);
    assert.match(openHomeSource, /setForceNewConversationOnNextSend\(true\)/);
    assert.match(openHomeSource, /performShowAllBotsView\(\)/);
    assert.match(openHomeSource, /void openZenMode\(\)/);
  });

  it("keeps one full Zen toolbar across All Bots and relationship Homes", () => {
    assert.match(
      pageSource,
      /const zenHeaderModelPickerActive =\s*view === "chat" && !zenFirstReplyPending;/,
    );
    assert.match(
      pageSource,
      /\{zenHeaderModelPickerActive\s*\? renderHeaderModelPicker\(\)\s*: renderVoiceModeSelector\(\)\}/,
    );
    assert.doesNotMatch(pageSource, /zenHeaderBotPickerActive/);
    assert.doesNotMatch(
      pageSource,
      /renderHeaderModelPicker\(\{ showModelControls: false \}\)/,
    );
  });

  it("lists saved default PRISM chats beside persona conversation groups", () => {
    const visibleConversationsStart = pageSource.indexOf(
      "const visibleConversations =",
    );
    const visibleConversationsEnd = pageSource.indexOf(
      "const conversationGroups =",
      visibleConversationsStart,
    );
    const sidebarItemsStart = pageSource.indexOf(
      "const sidebarConversationItems =",
    );
    const sidebarItemsEnd = pageSource.indexOf(
      "useEffect(() => {",
      sidebarItemsStart,
    );
    assert.notEqual(visibleConversationsStart, -1);
    assert.notEqual(visibleConversationsEnd, -1);
    assert.notEqual(sidebarItemsStart, -1);
    assert.notEqual(sidebarItemsEnd, -1);

    const visibleConversationsSource = pageSource.slice(
      visibleConversationsStart,
      visibleConversationsEnd,
    );
    const sidebarItemsSource = pageSource.slice(
      sidebarItemsStart,
      sidebarItemsEnd,
    );
    assert.match(
      visibleConversationsSource,
      /conversation\.mode === "chat" &&\s*conversationGroupKey\(conversation\) ===\s*PRISM_CONVERSATION_GROUP_KEY/,
    );
    assert.match(
      sidebarItemsSource,
      /const key = conversationGroupKey\(conversation\);/,
    );
    assert.doesNotMatch(
      sidebarItemsSource,
      /key === PRISM_CONVERSATION_GROUP_KEY/,
    );
    assert.match(
      pageSource,
      /name: botId \? bot\?\.name\?\.trim\(\) \|\| "Deleted bot" : DEFAULT_ASSISTANT_NAME,/,
    );
    assert.match(pageSource, /: "triangle",/);
  });

  it("distinguishes the account model default from Auto response routing", () => {
    assert.match(
      pageSource,
      /const ACCOUNT_DEFAULT_MODEL_LABEL = "Account default";/,
    );
    assert.match(
      pageSource,
      /autoOptionLabel = ACCOUNT_DEFAULT_MODEL_LABEL/,
    );
    assert.match(
      pageSource,
      /const AUTO_MODEL_SETTINGS_SUBTEXT = "uses the model saved in Settings";/,
    );
    assert.match(
      pageSource,
      /value === autoOptionValue\s*\? \(autoOptionTriggerLabel \?\? autoOptionLabel\)/,
    );
    assert.equal(
      pageSource.match(/autoOptionTriggerLabel=\{primaryTriggerLabel\}/g)
        ?.length,
      2,
    );
  });

  it("offsets the collapsed Chat hero while sidebar-open layout stays in flow", () => {
    assert.match(
      cssSource,
      /\.chatPane\s*\{[\s\S]*--app-shell-top-nav-height:\s*calc\(\s*60px\s*\+\s*env\(safe-area-inset-top, 0px\)\s*\)/,
    );
    assert.match(
      cssSource,
      /\.appLayout\[data-zen-surface="true"\]\[data-chat-sidebar-hidden="true"\][\s\S]*\.messagesEmptyState[\s\S]*> \.emptyState\s*\{[\s\S]*padding-block-start:\s*calc\([\s\S]*var\(--app-shell-top-nav-height\)[\s\S]*clamp\(/,
    );
    assert.match(
      cssSource,
      /\.appLayout\[data-zen-surface="true"\]:not\(\[data-chat-sidebar-hidden="true"\]\)\s*\{[\s\S]*grid-template-columns:/,
    );
  });

  it("keeps content below normal and wrapped headers at short and tall heights", () => {
    for (const viewportHeight of [480, 900, 1_440]) {
      const responsiveGap = Math.max(
        16,
        Math.min(36, viewportHeight * 0.03),
      );
      for (const measuredHeaderHeight of [60, 84, 112.25]) {
        const roundedHeaderHeight = Number.parseInt(
          appShellTopNavHeightCssValue(measuredHeaderHeight),
          10,
        );
        assert.ok(
          roundedHeaderHeight + responsiveGap > measuredHeaderHeight,
        );
      }
    }
  });

  it("includes safe-area padding and lets long localized title parts wrap", () => {
    assert.match(
      cssSource,
      /\.chatHeader\[data-app-shell-header="true"\]\s*\{[\s\S]*env\(safe-area-inset-top, 0px\)[\s\S]*env\(safe-area-inset-left, 0px\)[\s\S]*env\(safe-area-inset-right, 0px\)/,
    );
    assert.match(
      cssSource,
      /\.emptyStateTitlePhrase\s*\{[\s\S]*flex-wrap:\s*wrap;[\s\S]*white-space:\s*normal;/,
    );
    assert.match(
      cssSource,
      /\.emptyStateTitleLead\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*white-space:\s*normal;/,
    );
  });

  it("keeps structured bot titles separated before collapsed Zen styles apply", () => {
    assert.match(
      cssSource,
      /\.emptyStateTitle\[data-zen-title-with-hero="true"\]\s*\{[^}]*display:\s*inline-flex;[^}]*gap:/,
    );
    assert.match(
      cssSource,
      /\.emptyStateTitle\[data-zen-title-with-hero="true"\]\s+\.emptyStateTitlePhrase\s*\{[^}]*display:\s*inline-flex;[^}]*gap:/,
    );
  });
});
