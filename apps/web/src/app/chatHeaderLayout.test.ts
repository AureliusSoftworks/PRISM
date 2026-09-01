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
    assert.match(pageSource, /ref=\{options\.headerRef \?\? chatHeaderRef\}/u);
    assert.match(
      pageSource,
      /appShellTopNavHeightCssValue\(\s*header\.getBoundingClientRect\(\)\.height,?\s*\)/,
    );
    assert.match(
      pageSource,
      /shell\.style\.setProperty\(\s*"--app-shell-top-nav-height"/,
    );
    assert.match(
      pageSource,
      /document\.documentElement\.style\.setProperty\(\s*"--app-shell-top-nav-height"/,
    );
    assert.match(
      pageSource,
      /\[chatHeaderToolsWrapped, sidebarOpen, user\?\.id, view, viewportWidth\]/,
    );
    assert.equal(
      pageSource.match(/\sdata-app-shell-header="true"/g)?.length,
      2,
    );
  });

  it("moves current-applet Home navigation onto the PRISM wordmarks", () => {
    assert.doesNotMatch(pageSource, /renderLocationStrip/);
    assert.doesNotMatch(pageSource, /livingShellLocation/);
    assert.doesNotMatch(cssSource, /\.locationStrip(?:Home|Copy|Status)?\b/);
    assert.match(
      pageSource,
      /const renderSharedAppletBrand =[\s\S]*?onClick=\{\(\) => openCurrentAppletHome\(appletId\)\}[\s\S]*?data-shared-applet-brand=\{appletId\}[\s\S]*?aria-label=\{`Open \$\{PRISM_APPLETS\[appletId\]\.name\} home`\}/,
    );
    assert.match(
      pageSource,
      /className=\{`\$\{styles\.hubWordmark\} \$\{styles\.sidebarWordmarkButton\} \$\{styles\.wordmarkHomeButton\}`\}[\s\S]{0,180}onClick=\{handleBotGeneratorWordmarkNavigation\}[\s\S]{0,260}"Open All Bots Home"/,
    );
    const openHomeStart = pageSource.indexOf("const openLivingShellHome =");
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

  it("keeps Chat and Zen routing controls in the navbar before and during a conversation", () => {
    assert.match(
      pageSource,
      /renderSharedAppletNavbar\("Chat tools", \{[\s\S]*brandAppletId: chatPresentation === "zen" \? "zen" : "chat"/,
    );
    assert.match(
      pageSource,
      /controlRail: renderHeaderModelPicker\(\{[\s\S]{0,100}disabled: botFoundryGenerationLocked/,
    );
    assert.doesNotMatch(pageSource, /zenHeaderModelPickerActive/u);
    assert.doesNotMatch(pageSource, /zenFirstReplyPending/u);
    assert.match(
      pageSource,
      /const renderHeaderModelPicker =[\s\S]*renderProviderModeToggle\(\s*styles\.chatHeaderModeToggle,[\s\S]{0,100}disabled \? disabledReason : null[\s\S]*<ComposerModelPicker/u,
    );
    assert.doesNotMatch(pageSource, /data-zen-header-hidden=/u);
    assert.doesNotMatch(pageSource, /zenHeaderBotPickerActive/);
    assert.match(
      pageSource,
      /view === "chat" && detail\?\.incognito === true[\s\S]*data-private-chat-status="true"[\s\S]*Private chat/u,
    );
    assert.match(
      pageSource,
      /aria-label="Private chat\. No memories saved\."/u,
    );
  });

  it("lets Default PRISM Chat use the same model and Effort controls as Zen personas", () => {
    const pickerStart = pageSource.indexOf("const renderHeaderModelPicker =");
    const pickerEnd = pageSource.indexOf(
      "const renderImagesPanelModelPicker =",
      pickerStart,
    );
    const pickerSource = pageSource.slice(pickerStart, pickerEnd);

    assert.doesNotMatch(pickerSource, /prismHomeUsesDedicatedLocalModel/u);
    assert.doesNotMatch(pickerSource, /ariaLabel="Prism local model; change it in Settings"/u);
    assert.match(
      pickerSource,
      /renderProviderModeToggle\(\s*styles\.chatHeaderModeToggle,[\s\S]{0,100}disabled \? disabledReason : null/u,
    );
    assert.match(
      pickerSource,
      /effortControl=\{effortControlForTarget\(effortTarget, \{[\s\S]{0,100}autoSelected:/u,
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

  it("makes contextual Auto the model default inside a binary privacy lane", () => {
    const pickerStart = pageSource.indexOf("const renderHeaderModelPicker =");
    const pickerEnd = pageSource.indexOf(
      "const renderImagesPanelModelPicker =",
      pickerStart,
    );
    const pickerSource = pageSource.slice(pickerStart, pickerEnd);
    assert.match(pageSource, /const autoLabelShown = autoRouteLabel\?\.trim\(\) \|\| "Auto";/u);
    assert.match(
      pageSource,
      /autoSelected \? ` \$\{styles\.composeModelTriggerNameAuto\}` : ""/u,
    );
    assert.doesNotMatch(pageSource, /composeModelTriggerNameModel/u);
    assert.match(
      pageSource,
      /composeModelOptionName\}>\s*Auto\s*<\/span>/u,
    );
    assert.match(cssSource, /\.composeModelTriggerNameAuto/u);
    assert.match(
      cssSource,
      /\.themeLight \.composeModelTriggerNameAuto\s*\{[\s\S]{0,240}#207052[\s\S]{0,160}#a92373/u,
    );
    assert.match(pageSource, /function AutoEffortIcon/u);
    assert.match(
      pageSource,
      /function AutoEffortIcon\(\): React\.JSX\.Element \{[\s\S]{0,420}d="M9 2\.75 15\.25 14H2\.75L9 2\.75Z"/u,
    );
    assert.match(pageSource, /Effort chosen automatically/u);
    assert.doesNotMatch(pickerSource, /Account default/u);
    assert.match(pageSource, /\(\["local", "online"\] as const\)\.map/u);
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
      const responsiveGap = Math.max(16, Math.min(36, viewportHeight * 0.03));
      for (const measuredHeaderHeight of [60, 84, 112.25]) {
        const roundedHeaderHeight = Number.parseInt(
          appShellTopNavHeightCssValue(measuredHeaderHeight),
          10,
        );
        assert.ok(roundedHeaderHeight + responsiveGap > measuredHeaderHeight);
      }
    }
  });

  it("compacts the shared navbar before its independent controls can overlap", () => {
    assert.match(
      pageSource,
      /<PrismRefractionEmblem\s+className=\{styles\.sharedAppletNavbarCompactBrand\}/,
    );
    assert.match(
      cssSource,
      /@media \(min-width:\s*721px\) and \(max-width:\s*1600px\)[\s\S]*\.sharedAppletHeader[\s\S]*\.sharedAppletNavbarCompactBrand\s*\{[\s\S]*display:\s*block;/,
    );
    assert.match(
      cssSource,
      /\.sharedAppletHeader \.chatHeaderModelPicker \.composeModelControl\s*\{[\s\S]*min-width:\s*132px;/,
    );
    assert.match(
      cssSource,
      /\.sharedAppletHeader \.chatHeaderModelPicker \.voiceModeSelector\s*\{[\s\S]*max-width:\s*172px;/,
    );
  });

  it("gives short empty Homes a composer-safe internal scroll owner", () => {
    assert.match(
      cssSource,
      /@media \(min-width:\s*721px\) and \(max-height:\s*800px\)[\s\S]*\.messages\.messagesEmptyState\[data-chat-ephemeral="true"\][\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior-y:\s*contain;/,
    );
    assert.match(
      cssSource,
      /--zen-empty-state-bottom-reserve:\s*max\([\s\S]*152px[\s\S]*env\(safe-area-inset-bottom, 0px\)/,
    );
    assert.match(
      cssSource,
      /> \.emptyState\.emptyStateHubPicker\s*\{[\s\S]*min-height:\s*max-content;[\s\S]*translate:\s*0 0;/,
    );
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
