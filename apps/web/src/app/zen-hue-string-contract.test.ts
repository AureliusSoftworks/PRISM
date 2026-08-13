import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const control = readFileSync(
  new URL("./ZenHueStringControl.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Zen hue string integration contract", () => {
  it("keeps the custom string desktop-Zen-only and preserves the shared lens fallback", () => {
    assert.match(
      page,
      /const zenHueStringEligible =\s*view === "chat"[\s\S]*?viewportWidth > PICKER_MOBILE_BREAKPOINT[\s\S]*?!coarsePointer/u,
    );
    assert.match(
      page,
      /if \(!zenHueStringVisible\) \{[\s\S]*?<HueLensControl/u,
    );
    assert.match(page, /<ZenHueStringControl/u);
  });

  it("suspends hue directories for whole-group search and restores state per group", () => {
    assert.match(
      page,
      /const zenDirectorySuspended = zenHueStringEligible && emptyStateSearchActive/u,
    );
    assert.match(page, /zenHueDirectoryByGroupRef/u);
    assert.match(
      page,
      /zenHueDirectoryByGroupRef\.current\.get\(nextFilterId\)/u,
    );
    assert.match(page, /ZEN_HUE_STRING_CUE_DISMISSED_SESSION_KEY/u);
    assert.match(
      page,
      /sessionStorage\.removeItem\([\s\S]*?ZEN_HUE_STRING_CUE_DISMISSED_SESSION_KEY/u,
    );
  });

  it("exposes separate hue and breadth ranges without traversal animation", () => {
    assert.match(control, /aria-label="Hue"/u);
    assert.match(control, /aria-label="Breadth"/u);
    assert.match(control, /event\.key === "Home"/u);
    assert.match(control, /event\.key === "End"/u);
    assert.match(control, /event\.key === "Escape"/u);
    assert.match(control, /\+ delta \+ 360\) % 360/u);
    assert.match(control, /latestNavigateRef\.current\(update\)/u);
    assert.doesNotMatch(control, /requestAnimationFrame|stepZenHueSpring|curveOffset/u);
  });

  it("does not animate grid traversal", () => {
    assert.doesNotMatch(page, /function useZenHuePickerMotion/u);
    assert.doesNotMatch(page, /useZenHuePickerMotion\(/u);
  });

  it("allows one deeper two-row traversal tier", () => {
    const navigation = readFileSync(
      new URL("./zenHueStringNavigation.ts", import.meta.url),
      "utf8",
    );
    assert.match(navigation, /ZEN_HUE_DIRECTORY_MIN_ROWS = 2/u);
  });

  it("uses the committed directory for a contextual atmosphere and restores root", () => {
    assert.match(page, /const zenHueAtmosphereBots = useMemo/u);
    assert.match(
      page,
      /Search suspends the string, then restores this[\s\S]*?exact palette/u,
    );
    assert.match(
      page,
      /zenHueDirectoryState\.tier === "root" \? "home" : "directory"/u,
    );
    assert.match(page, /rootNodePositions = \[10, 34, 52, 72, 92\]/u);
    assert.match(
      styles,
      /\.messagesFrame\[data-mode="home"\],[\s\S]*?\.messagesFrame\[data-mode="directory"\]/u,
    );
    assert.match(styles, /var\(--home-halo-1-color, #ff4d6d\)/u);
    assert.match(styles, /var\(--home-halo-5-color, #7b5cff\)/u);
  });

  it("keeps the Hue lens's discrete PRISM bars on the pulling string", () => {
    assert.match(control, /discrete PRISM bars, never a blended/u);
    assert.match(control, /colors\.flatMap\(/u);
    assert.match(control, /const start = \(index \/ colors\.length\) \* 100/u);
    assert.match(control, /const end = \(\(index \+ 1\) \/ colors\.length\) \* 100/u);
    assert.match(control, /gradientUnits="userSpaceOnUse"/u);
    assert.match(control, /style=\{\{ stroke: `url\(#\$\{gradientId\}\)` \}\}/u);
  });
});
