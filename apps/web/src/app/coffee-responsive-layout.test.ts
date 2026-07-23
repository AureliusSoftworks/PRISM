import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8")
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");

test("first-person Coffee fills the stage with a bottom-anchored table and narrow prose", () => {
  assert.match(css, /--coffee-table-asset-width:\s*min\(104cqw,\s*1490px\)/);
  assert.match(css, /bottom:\s*clamp\(-92px,\s*-7vh,\s*-36px\)/);
  assert.match(
    css,
    /--coffee-table-prose-inline-size:\s*min\(42cqw,\s*560px\);\s*width:\s*var\(--coffee-table-prose-inline-size\)/,
  );
  assert.match(
    css,
    /@container \(max-width: 980px\)[\s\S]*?--coffee-table-prose-inline-size:\s*min\(38cqw,\s*400px\)/,
  );
  assert.match(
    css,
    /\.coffeeStage\[data-coffee-perspective="first-person"\]\[data-phase="live"\] \.coffeeTableScene,[\s\S]*?height:\s*100%;\s*min-height:\s*0/,
  );
  assert.match(css, /--coffee-canvas-y:\s*clamp\(-70px,\s*-6vh,\s*-42px\)/);
});

test("three-seat first-person Coffee keeps its head avatar below the stage edge", () => {
  assert.match(
    css,
    /\.coffeeStage\[data-coffee-perspective="first-person"\]:is\(\[data-phase="arriving"\],\s*\[data-phase="live"\]\):not\(\[data-compact="true"\]\)[\s\S]*?:is\(\.coffeeSeat,\s*\.coffeeSeatActionAnchor\)\[data-seat-count="3"\]\[data-layout-seat="0"\]\s*\{[\s\S]*?left:\s*50%;[\s\S]*?top:\s*max\(\s*calc\(38% - var\(--coffee-experimental-seat-lift\)\),\s*calc\(clamp\(74px,\s*6\.3cqw,\s*98px\) - var\(--coffee-canvas-y\) \+ 10px\)\s*\);/,
  );
  assert.match(
    css,
    /\[data-seat-count="5"\]\[data-layout-seat="0"\]\s*\{\s*left:\s*50%;\s*top:\s*calc\(45% - var\(--coffee-experimental-seat-lift\)\);/,
    "the established five-seat head position should remain unchanged",
  );
});

test("four-seat first-person Coffee keeps its upper pair below the stage edge", () => {
  for (const layoutIndex of [0, 1]) {
    assert.match(
      css,
      new RegExp(
        String.raw`\[data-seat-count="4"\]\[data-layout-seat="${layoutIndex}"\]\s*\{[\s\S]*?top:\s*max\(\s*calc\(48% - var\(--coffee-experimental-seat-lift\) - var\(--coffee-experimental-seat-extra-lift\)\),\s*calc\(clamp\(74px,\s*6\.3cqw,\s*98px\) - var\(--coffee-canvas-y\) \+ 10px\)\s*\);`,
      ),
      `four-seat upper layout ${layoutIndex} must stay inside the stage`,
    );
  }
});

test("first-person Coffee distributes every bot around the player's open seat", () => {
  const expectedPositions = [
    [2, 0, 22, 58],
    [2, 1, 78, 58],
    [3, 0, 50, 38],
    [3, 1, 18, 72],
    [3, 2, 82, 72],
    [4, 0, 18, 48],
    [4, 1, 82, 48],
    [4, 2, 80, 76],
    [4, 3, 20, 76],
    [5, 0, 50, 45],
    [5, 1, 14, 58],
    [5, 2, 86, 58],
    [5, 3, 16, 80],
    [5, 4, 84, 80],
  ] as const;

  for (const [seatCount, layoutSeat, left, top] of expectedPositions) {
    assert.match(
      css,
      new RegExp(
        String.raw`\[data-seat-count="${seatCount}"\]\[data-layout-seat="${layoutSeat}"\]\s*\{\s*left:\s*${left}%;[\s\S]*?top:\s*(?:max\(\s*)?calc\(${top}% - var\(--coffee-experimental-seat-lift\)`,
      ),
      `${seatCount}-bot layout seat ${layoutSeat} should follow the balanced table arc`,
    );
  }
});

test("Coffee locks live sessions to the available workspace instead of scrolling", () => {
  assert.match(
    pageSource,
    /const coffeeWorkspaceRef = useRef<HTMLDivElement \| null>\(null\)/,
  );
  assert.match(
    pageSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*?const workspace = coffeeWorkspaceRef\.current;[\s\S]*?workspace\.scrollTop = 0;[\s\S]*?window\.requestAnimationFrame\(resetWorkspaceScroll\);[\s\S]*?\}, \[coffeeConversation\?\.id, coffeeReplayActive, coffeeSessionPhase\]\);/,
  );
  assert.match(
    pageSource,
    /ref=\{coffeeWorkspaceRef\}[\s\S]*?data-mode=\{coffeeWorkspaceMode\}/,
  );
  assert.match(
    css,
    /\.coffeeWorkspace\[data-mode="session"\]\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*?overflow-y:\s*hidden;[\s\S]*?scrollbar-gutter:\s*auto/,
  );
  assert.match(
    css,
    /\.coffeeWorkspace\[data-mode="session"\] \.coffeeStage,[\s\S]*?\.coffeeWorkspace\[data-mode="session"\] \.coffeeTableCanvas\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0/,
  );
});

test("live Coffee stretches its stage row to the composer", () => {
  assert.match(
    css,
    /\.coffeeWorkspace\[data-mode="session"\]\s*\{[\s\S]*?align-content:\s*stretch;[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    css,
    /\.coffeeMain\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*?gap:\s*12px/,
  );
});

test("first-person Coffee lifts the participant ring behind live status chrome", () => {
  assert.match(
    css,
    /\.coffeeStage\[data-coffee-perspective="first-person"\]\[data-autoplay-dock="true"\]\[data-phase="live"\],\s*\.coffeeStage\[data-coffee-perspective="first-person"\]\[data-autoplay-dock="true"\]\[data-phase="arriving"\]\s*\{[\s\S]*?--coffee-canvas-y:\s*clamp\(-180px,\s*-12vh,\s*-112px\);/,
  );
});

test("light first-person Coffee uses a readable light prose surface", () => {
  assert.match(
    css,
    /\.themeLight\.coffeeShell\[data-chrome-language="studio"\][\s\S]*?\.coffeeStage\[data-coffee-perspective="first-person"\][\s\S]*?\.coffeeCenterMessage\s*\{[\s\S]*?linear-gradient\(180deg,\s*rgba\(253,\s*254,\s*255,\s*0\.96\),\s*rgba\(235,\s*245,\s*253,\s*0\.97\)\)/,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell\s+:where\([\s\S]*\.coffeeCenterFeedLine[\s\S]*\)\s*\{\s*color:\s*var\(--fg\)/,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell \.coffeeCenterFeedLine\[data-role="assistant"\],[\s\S]*?\.coffeeCenterFeedLineTyping\[data-role="assistant"\][\s\S]*?\.coffeeTableTypingLine,[\s\S]*?\.coffeeTypewriterCaret\s*\{\s*color:\s*var\(--coffee-center-line-color,\s*var\(--fg\)\)/,
  );
  assert.match(
    pageSource,
    /"--coffee-center-line-color":\s*coffeeBotTranscriptTextColor\([\s\S]*?visibleTableTypingBot\.color,[\s\S]*?resolvedTheme/,
  );
});

test("Coffee action text repositions inward from container-relative seat sides", () => {
  assert.match(
    pageSource,
    /data-seat-horizontal-side=\{display\.seatHorizontalSide\}/,
  );
  assert.match(
    pageSource,
    /"--coffee-action-seat-left" as string\]: `\$\{display\.seatCanvasLeftPercent\}cqw`/,
  );
  assert.match(
    css,
    /data-seat-horizontal-side="left"[\s\S]*--coffee-action-quote-preferred-x:\s*-20%/,
  );
  assert.match(
    css,
    /data-seat-horizontal-side="right"[\s\S]*--coffee-action-quote-preferred-x:\s*-80%/,
  );
  assert.match(
    css,
    /--coffee-action-quote-x:\s*clamp\(\s*calc\(var\(--coffee-action-edge-safe\) - var\(--coffee-action-seat-left\)\),\s*var\(--coffee-action-quote-preferred-x\),\s*calc\([\s\S]*?100cqw[\s\S]*?var\(--coffee-action-seat-left\) - 100%/,
  );
  assert.match(css, /width:\s*min\(260px,\s*28cqw,\s*calc\(100cqw - 32px\)\)/);
  assert.match(css, /font-size:\s*clamp\(0\.78rem,\s*1\.15cqw,\s*0\.96rem\)/);
  assert.match(css, /@container\s*\(max-width:\s*980px\)/);
});

test("Coffee replay action text stays inside the review canvas", () => {
  assert.match(
    css,
    /\.coffeeStage\[data-replay-active="true"\]:not\(\[data-compact="true"\]\) \.coffeeSeatActionBadgeStack \{ --coffee-action-quote-x:\s*-50%/,
  );
  assert.match(
    css,
    /\.coffeeStage\[data-replay-active="true"\]:not\(\[data-compact="true"\]\)[\s\S]*?width:\s*min\(260px,\s*28cqw,\s*calc\(100cqw - 32px\)\)/,
  );
  assert.match(
    css,
    /data-replay-active="true"[\s\S]*?data-seat-horizontal-side="left"[\s\S]*?--coffee-action-quote-x:\s*-20%/,
  );
  assert.match(
    css,
    /data-replay-active="true"[\s\S]*?data-seat-horizontal-side="right"[\s\S]*?--coffee-action-quote-x:\s*-80%/,
  );
});
