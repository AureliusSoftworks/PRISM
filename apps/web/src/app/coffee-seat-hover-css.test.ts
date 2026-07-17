import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

describe("Coffee seat hover treatment", () => {
  it("uses the shared rig while keeping the moving mannequin grounded above the light", () => {
    assert.match(
      pageSource,
      /<BotAmbientPresenceRig[\s\S]*motionActive=\{coffeeSeatHoverActive\}[\s\S]*phaseOffsetSeconds=\{layoutIndex \* 1\.8\}[\s\S]*<ZenLiveBotMannequin[\s\S]*<\/BotAmbientPresenceRig>[\s\S]*coffeeSeatTeamBadge[\s\S]*coffeeCup[\s\S]*coffeeSeatGlowPill/
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
    assert.match(css, /\.coffeeSeat\s*\{[\s\S]*--bot-ambient-hover-amplitude:\s*2px\s*;/);
    assert.match(css, /\.botAmbientPresenceRig\s*\{[\s\S]*--bot-ambient-hover-duration:\s*9s\s*;/);
    assert.match(pageSource, /phaseOffsetSeconds=\{layoutIndex \* 1\.8\}/);
    assert.match(css, /data-compact="true"[\s\S]*\.coffeeSeat[\s\S]*--bot-ambient-hover-amplitude:\s*1px\s*;/);
    assert.match(css, /@keyframes botAmbientHoverDrift[\s\S]*translateY\(calc\(-1 \* var\(--bot-ambient-hover-amplitude\)\)\)/);
  });

  it("provides restrained light-mode and reduced-motion fallbacks", () => {
    assert.match(
      css,
      /\.botAmbientPresenceRig\[data-theme="light"\][\s\S]*--bot-ambient-underglow-contact-opacity:\s*0\.19\s*;/
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.botAmbientPresenceBody[\s\S]*animation:\s*none\s*;[\s\S]*transform:\s*translateY\(0\)\s*;/
    );
  });

  it("uses browser-safe non-zero underglow geometry", () => {
    assert.match(css, /--bot-ambient-underglow-width:\s*88%\s*;/);
    assert.match(css, /--bot-ambient-underglow-height:\s*24%\s*;/);
    assert.match(css, /\.botAmbientUnderglow\s*\{[\s\S]*width:\s*var\(--bot-ambient-underglow-width\)\s*;/);
    assert.doesNotMatch(css, /calc\([^)]*\*\s*var\(--bot-ambient-underglow/);
  });
});
