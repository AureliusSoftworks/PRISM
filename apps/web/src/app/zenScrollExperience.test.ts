import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const rawPageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageSource = rawPageSource.replace(/\s+/gu, " ");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

function functionBody(name: string): string {
  const start = rawPageSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const nextFunction = rawPageSource.indexOf("\n  function ", start + 1);
  return rawPageSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe("Zen scroll experience", () => {
  it("keeps tail-space measurement out of hot scroll resolution", () => {
    const maxScrollBody = functionBody("resolveZenReadableMaxScrollTop");
    const scrollHandlerBody = functionBody("handleMessagesPaneScroll");

    assert.doesNotMatch(maxScrollBody, /syncZenReadableTailSpace/);
    assert.match(pageSource, /new ResizeObserver\(scheduleTailSpaceSync\)/);
    assert.doesNotMatch(scrollHandlerBody, /MANUAL_SCROLL_UP_THRESHOLD_PX|previousScrollTop/);
  });

  it("remeasures the live tail when the current Zen reply grows or settles", () => {
    assert.match(
      pageSource,
      /observeCurrentZenReadableAnchorRow\(\)[\s\S]*reconcileChatScrollAfterLayoutChange/,
    );
    assert.match(
      pageSource,
      /mutationObserver\?\.observe\(scrollRoot, \{ childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: \[ "data-chat-typing-line", "data-chat-render-kind", "data-reply-runway-active", \], \}\)/,
    );
    assert.match(
      pageSource,
      /resizeObserver\?\.unobserve\(observedAnchorRow\)[\s\S]*resizeObserver\?\.observe\(observedAnchorRow\)/,
    );
    assert.match(pageSource, /latestUserMessageId, replyRunwayActive, \]\)/);
  });

  it("uses one explicit follow loop and one wheel path", () => {
    assert.doesNotMatch(pageSource, /handleNativeWheel/);
    assert.doesNotMatch(pageSource, /CHAT_MODE_ASSISTANT_ANCHOR_SMOOTH_SCROLL_MS/);
    assert.match(pageSource, /Explicit wheel\/touch gestures set `armed=false`/);
  });

  it("settles atmosphere after scrolling instead of rerendering per frame", () => {
    assert.match(
      pageSource,
      /zenAtmosphereScrollSettleTimerRef\.current = window\.setTimeout\([\s\S]*ZEN_ATMOSPHERE_SCROLL_SETTLE_MS/,
    );
    assert.match(pageSource, /\.slice\(0, 2\)/);
    assert.match(pageSource, /zenAtmosphereMountedTimeline\.map/);
  });

  it("lets native scrolling own the surface while JS owns follow motion", () => {
    const rule = cssSource.match(
      /\.messages\[data-chat-ephemeral="true"\]\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";

    assert.match(rule, /scroll-behavior:\s*auto/);
    assert.match(rule, /overflow-anchor:\s*none/);
    assert.doesNotMatch(rule, /will-change:\s*scroll-position/);
    assert.match(pageSource, /zenReadableGestureShouldDisarmFollow\([\s\S]*event\.deltaY/);
    assert.match(pageSource, /zenReadableGestureShouldDisarmFollow\([\s\S]*-touchDeltaY/);
    assert.match(pageSource, /zenReadableWheelShouldApplyElasticPull\(el\.scrollTop, event\.deltaY\)/);
    assert.doesNotMatch(pageSource, /zenReadableBottomMomentumHold|holdZenReadableBottom/);
    const wheelHandler = pageSource.slice(
      pageSource.indexOf("function handleChatModeThreadWheel"),
      pageSource.indexOf("function handleChatModeThreadTouchStart")
    );
    assert.doesNotMatch(wheelHandler, /preventDefault\(\)/);
  });

  it("keeps a native Zen runway when opening measurements request zero tail space", () => {
    const rule = cssSource.match(
      /\.appLayout\[data-zen-surface="true"\] \.messages\[data-chat-ephemeral="true"\]\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";

    assert.match(
      rule,
      /--zen-readable-tail-padding-floor:\s*var\(--zen-prose-runway-bottom\)/,
    );
    assert.match(
      rule,
      /padding-bottom:\s*max\([\s\S]*var\(--zen-readable-tail-padding-floor\)[\s\S]*var\(--zen-readable-tail-padding\)/,
    );
  });

  it("windows mounted history and reserves per-character rendering for the latest rich reply", () => {
    assert.equal(
      pageSource.match(/renderedDetailMessages\.map/g)?.length,
      2,
    );
    assert.match(
      pageSource,
      /renderAsEphemeralLines=\{[\s\S]*msg\.id === latestAssistantMessageId \|\| Boolean\(msg\.zenDisplay\)/,
    );
  });

  it("preserves the Zen viewport while wildcard cleanup swaps in the resolved turn", () => {
    assert.match(
      pageSource,
      /pendingCleanupIdsForReveal\.length > 0[\s\S]*zenStableViewportAnchorMessageId\([\s\S]*zenPendingViewportRestoreRef\.current =/,
    );
    assert.match(
      pageSource,
      /const pendingRestore = zenPendingViewportRestoreRef\.current;[\s\S]*zenRestoredViewportScrollTop\([\s\S]*commitChatModeScrollTop\(/,
    );
  });
});
