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

  it("keeps Home as the location strip's only navigation affordance", () => {
    const locationStripStart = pageSource.indexOf(
      "const renderLocationStrip =",
    );
    const locationStripEnd = pageSource.indexOf(
      "const renderAppSwitcher =",
      locationStripStart,
    );
    assert.notEqual(locationStripStart, -1);
    assert.notEqual(locationStripEnd, -1);

    const locationStripSource = pageSource.slice(
      locationStripStart,
      locationStripEnd,
    );
    assert.match(locationStripSource, /className=\{styles\.locationStripHome\}/);
    assert.match(locationStripSource, /onClick=\{openLivingShellHome\}/);
    assert.match(locationStripSource, /aria-label="Open All Bots Home"/);
    assert.equal(locationStripSource.match(/<button\b/g)?.length, 1);
    assert.doesNotMatch(locationStripSource, /locationStripBack/);
    assert.doesNotMatch(locationStripSource, /aria-label="Back"/);

    const openHomeStart = pageSource.indexOf(
      "const openLivingShellHome =",
    );
    const openHomeEnd = pageSource.indexOf(
      "const livingShellLocation =",
      openHomeStart,
    );
    const openHomeSource = pageSource.slice(openHomeStart, openHomeEnd);
    assert.match(openHomeSource, /setChatAutoRestoreSuppressed\(true\)/);
    assert.match(openHomeSource, /setForceNewConversationOnNextSend\(true\)/);
    assert.match(openHomeSource, /performShowAllBotsView\(\)/);
    assert.match(openHomeSource, /void openZenMode\(\)/);
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
