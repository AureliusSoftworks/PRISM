import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("coupled Chat and Zen UI regressions", () => {
  it("keeps Default picker ink dark in light mode without overriding custom accents", () => {
    assert.match(pageSource, /data-render-theme=\{resolvedTheme\}/);
    assert.match(
      pageCss,
      /data-render-theme="light"\]:not\(\s*\[data-bot-selected="true"\]/,
    );
    assert.match(
      pageCss,
      /\.composeBotOptionDefault\[aria-selected="true"\][\s\S]*?color: #142536;/,
    );
  });

  it("limits dynamic transcript sizing to immersive Zen presentation", () => {
    assert.equal(
      [...pageSource.matchAll(/const messageDynamicTypeStyle = chatImmersivePresentation/g)]
        .length,
      2,
    );
    assert.doesNotMatch(
      pageSource,
      /const messageDynamicTypeStyle = assistantRevealActive/,
    );
  });

  it("keeps the Default Prism orb mounted in immersive Zen", () => {
    assert.doesNotMatch(
      pageSource,
      /reason="default-prism-zen"/,
    );
    assert.match(pageSource, /data-prism-chat-home-orb-slot="true"/);
    assert.match(
      pageSource,
      /chatHomeHeroDocked=\{\s*prismHomeEmptyHeroVisible/,
    );
  });

  it("marks and prioritizes the newest prose while retaining chrome avoidance", () => {
    assert.ok(
      [...pageSource.matchAll(/data-zen-live-prose-target=/g)].length >= 2,
    );
    assert.ok(
      [...pageSource.matchAll(/data-zen-live-prose-latest=/g)].length >= 2,
    );
    assert.match(
      pageSource,
      /latestTargets\.length > 0\s*\? latestTargets\s*:\s*document\.querySelectorAll<HTMLElement>/,
    );
    assert.match(pageSource, /collectZenLiveBotChromeAvoidanceRects\(/);
    assert.match(pageSource, /currentOverlapsAvoidance/);
    assert.match(pageSource, /"data-zen-live-bot-chrome-avoid": "true"/);
  });
});
