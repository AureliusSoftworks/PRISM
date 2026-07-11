import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

describe("Coffee seat hover treatment", () => {
  it("keeps the moving mannequin separate from grounded seat furniture", () => {
    assert.match(
      pageSource,
      /coffeeSeatUnderglow[\s\S]*coffeeSeatHoverBody[\s\S]*<ZenLiveBotMannequin[\s\S]*coffeeSeatTeamBadge[\s\S]*coffeeCup[\s\S]*coffeeSeatGlowPill/
    );
    assert.match(pageSource, /data-hover-active=\{coffeeSeatHoverActive \? "true" : undefined\}/);
  });

  it("enables hover only for firmly seated idle live seats", () => {
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*seatIsFirmlySeated/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*!isTableTypingThisSeat/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*!seatIsThinkingThisSeat/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*!coffeeCupVisual\.sipping/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*activeCoffeeCupTopOffAnimation == null/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*!coffeeReplayActive/);
    assert.match(pageSource, /const coffeeSeatHoverActive =[\s\S]*coffeeSeatDebugDraggingBotId !== bot\.id/);
  });

  it("uses a subtle staggered nine-second drift with compact restraint", () => {
    assert.match(css, /--coffee-hover-amplitude:\s*2px\s*;/);
    assert.match(css, /--coffee-hover-duration:\s*9s\s*;/);
    assert.match(css, /data-layout-seat="1"[\s\S]*--coffee-hover-delay:\s*-1\.8s\s*;/);
    assert.match(css, /data-layout-seat="4"[\s\S]*--coffee-hover-delay:\s*-7\.2s\s*;/);
    assert.match(css, /data-compact="true"[\s\S]*\.coffeeSeat[\s\S]*--coffee-hover-amplitude:\s*1px\s*;/);
    assert.match(css, /@keyframes coffeeSeatHoverDrift[\s\S]*translateY\(calc\(-1 \* var\(--coffee-hover-amplitude\)\)\)/);
  });

  it("provides restrained light-mode and reduced-motion fallbacks", () => {
    assert.match(
      css,
      /\.themeLight\.coffeeShell \.coffeeSeat[\s\S]*--coffee-underglow-contact-opacity:\s*0\.28\s*;/
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.coffeeSeatHoverBody[\s\S]*animation:\s*none\s*;[\s\S]*transform:\s*translateY\(0\)\s*;/
    );
  });

  it("uses browser-safe non-zero underglow geometry", () => {
    assert.match(css, /--coffee-underglow-width:\s*88%\s*;/);
    assert.match(css, /--coffee-underglow-height:\s*24%\s*;/);
    assert.match(css, /\.coffeeSeatUnderglow\s*\{[\s\S]*width:\s*var\(--coffee-underglow-width\)\s*;/);
    assert.doesNotMatch(css, /calc\([^)]*\*\s*var\(--coffee-underglow/);
  });
});
