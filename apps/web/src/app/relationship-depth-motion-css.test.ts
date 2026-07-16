import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS } from "./relationshipDepthViewTransition.ts";

const globalCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

function sourceSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe("relationship-depth motion CSS", () => {
  it("keeps the shared anchor restrained in both directions", () => {
    const sharedMotion = sourceSlice(
      globalCss,
      'html[data-relationship-depth-motion="shared-anchor"][data-relationship-depth-direction="forward"]',
      'html[data-relationship-depth-motion="pullback-swap"]',
    );
    assert.match(sharedMotion, /animation-duration: 360ms/);
    assert.match(sharedMotion, /animation-duration: 300ms/);
    assert.doesNotMatch(sharedMotion, /scale\([^1][^)]+\)|filter:|blur\(/);
  });

  it("uses only a modest identity pullback for direct Home changes", () => {
    const pullbackMotion = sourceSlice(
      globalCss,
      'html[data-relationship-depth-motion="pullback-swap"]',
      "@keyframes relationship-depth-atmosphere-out",
    );
    assert.match(pullbackMotion, /animation-duration: 280ms/);
    assert.match(globalCss, /transform: scale\(0\.94\)/);
    assert.doesNotMatch(pullbackMotion, /filter:|blur\(/);
  });

  it("crossfades atmosphere without assigning transforms to text containers", () => {
    const localMotion = sourceSlice(
      pageCss,
      ".relationshipDepthInputShield",
      "@media (prefers-reduced-motion: reduce)",
    );
    assert.match(localMotion, /\.messagesFrame[\s\S]+opacity/);
    assert.match(
      localMotion,
      /\[data-relationship-depth-anchor="home"\][\s\S]+scale\(0\.94\)/,
    );
    assert.doesNotMatch(
      localMotion,
      /(?:emptyStateTitle|emptyStateHint|messagesFrame)[^{]*\{[^}]*transform:/,
    );
    assert.doesNotMatch(localMotion, /filter:|blur\(/);
  });

  it("pins the reduced-motion fallback to a short non-spatial fade", () => {
    const reducedMotion = sourceSlice(
      pageCss,
      '@media (prefers-reduced-motion: reduce) {\n  .appLayout[data-relationship-depth-transition] .messagesFrame',
      '.coffeeShell[data-chrome-language="studio"] {',
    );
    assert.match(
      reducedMotion,
      new RegExp(
        String.raw`\.appLayout\[data-relationship-depth-transition\] \.messagesFrame\s*\{[\s\S]*?transition-duration: ${RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS}ms;[\s\S]*?transform: none;`,
      ),
    );
    assert.match(
      reducedMotion,
      new RegExp(
        String.raw`\.appLayout\[data-relationship-depth-motion="pullback-swap"\]\s*\[data-relationship-depth-anchor="home"\]\s*\{[\s\S]*?transition-duration: ${RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS}ms;[\s\S]*?transform: none;`,
      ),
    );

    assert.match(
      pageCss,
      /data-relationship-depth-renderer="manual"[\s\S]+data-relationship-depth-atmosphere="crossfade"[\s\S]+data-relationship-depth-transition="source-beat"[\s\S]+data-relationship-depth-transition="handoff"[\s\S]+opacity: 0/,
    );
    assert.match(
      globalCss,
      new RegExp(
        `@media \\(prefers-reduced-motion: reduce\\)[\\s\\S]+data-relationship-depth-motion="crossfade"[\\s\\S]+::view-transition-old\\(root\\)[\\s\\S]+::view-transition-new\\(root\\)[\\s\\S]+animation-duration: ${RELATIONSHIP_DEPTH_REDUCED_CROSSFADE_MS}ms[\\s\\S]+transform: none`,
      ),
    );
  });
});
