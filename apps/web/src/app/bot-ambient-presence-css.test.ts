import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(appDir, "page.module.css"), "utf8");
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");

describe("shared bot ambient presence rig", () => {
  it("keeps grounded light outside the independently moving mannequin body", () => {
    assert.match(pageSource, /interface BotAmbientPresenceRigProps \{[\s\S]*theme: "light" \| "dark";[\s\S]*isTalking: boolean;[\s\S]*motionActive: boolean;[\s\S]*phaseOffsetSeconds\?: number;/);
    assert.match(
      pageSource,
      /className=\{styles\.botAmbientPresenceRig\}[\s\S]*className=\{styles\.botAmbientUnderglow\}[\s\S]*className=\{styles\.botAmbientSpeakingLight\}[\s\S]*className=\{styles\.botAmbientSpeakingPulse\}[\s\S]*className=\{styles\.botAmbientPresenceBody\}[\s\S]*\{children\}/,
    );
    assert.match(css, /\.botAmbientPresenceRig\s*\{[\s\S]*position:\s*relative;[\s\S]*isolation:\s*isolate;/);
    assert.match(css, /\.botAmbientUnderglow\s*\{[\s\S]*z-index:\s*0\s*;/);
    assert.match(
      css,
      /\.botAmbientUnderglow\s*\{[\s\S]*left:\s*var\(--zen-live-bot-body-x,\s*50%\)\s*;[\s\S]*top:\s*calc\([\s\S]*var\(--zen-live-bot-body-y,\s*50%\)[\s\S]*var\(--bot-ambient-underglow-contact-y\)[\s\S]*\)\s*;/,
    );
    assert.match(css, /--bot-ambient-underglow-contact-y:\s*43%\s*;/);
    assert.match(css, /\.botAmbientPresenceBody\s*\{[\s\S]*z-index:\s*2\s*;/);
  });

  it("uses a contact core, broad color spill, and compositor-only motion", () => {
    assert.match(css, /\.botAmbientUnderglow::before\s*\{[\s\S]*rgba\(255, 255, 255, 0\.28\)[\s\S]*var\(--bot-ambient-color\)/);
    assert.match(css, /\.botAmbientUnderglow::after\s*\{[\s\S]*radial-gradient[\s\S]*mix-blend-mode:\s*screen\s*;/);
    assert.match(css, /@keyframes botAmbientHoverDrift[\s\S]*transform:/);
    assert.match(css, /@keyframes botAmbientUnderglowBreathe[\s\S]*opacity:[\s\S]*transform:/);
    assert.doesNotMatch(css, /@keyframes botAmbient(?:HoverDrift|UnderglowBreathe)[\s\S]{0,800}(?:filter|box-shadow):/);
  });

  it("adds a restrained asymmetric speaking lift without moving the bot", () => {
    assert.match(css, /--bot-ambient-speaking-low-opacity:\s*0\.075\s*;/);
    assert.match(css, /--bot-ambient-speaking-high-opacity:\s*0\.12\s*;/);
    assert.match(css, /\.botAmbientSpeakingLight\s*\{[\s\S]*transition:\s*opacity 700ms ease-out\s*;/);
    assert.match(css, /\.botAmbientPresenceRig\[data-talking="true"\] \.botAmbientSpeakingLight\s*\{[\s\S]*opacity:\s*1\s*;[\s\S]*transition-duration:\s*500ms\s*;/);
    assert.match(css, /\.botAmbientPresenceRig\[data-talking="true"\] \.botAmbientSpeakingPulse\s*\{[\s\S]*botAmbientSpeakingLoad 2\.6s/);
    assert.match(css, /@keyframes botAmbientSpeakingLoad[\s\S]*17%[\s\S]*43%[\s\S]*71%/);
    assert.doesNotMatch(css, /@keyframes botAmbientSpeakingLoad[\s\S]{0,600}transform:/);
  });

  it("attenuates Light mode and keeps Reduced Motion static", () => {
    assert.match(css, /\.botAmbientPresenceRig\[data-theme="light"\]\s*\{[\s\S]*--bot-ambient-underglow-rest-opacity:\s*0\.12\s*;[\s\S]*--bot-ambient-speaking-high-opacity:\s*0\.042\s*;/);
    assert.match(css, /data-theme="light"[\s\S]*\.botAmbientSpeakingPulse[\s\S]*mix-blend-mode:\s*multiply\s*;/);
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.botAmbientPresenceBody[\s\S]*animation:\s*none\s*;[\s\S]*\.botAmbientPresenceRig\[data-talking="true"\] \.botAmbientSpeakingPulse[\s\S]*opacity:\s*var\(--bot-ambient-speaking-mid-opacity\)\s*;/);
  });

  it("disables the portable underglow inside Signal's authored Studio set", () => {
    assert.match(
      css,
      /\.signalBotPresencePlate \.botAmbientUnderglow\s*\{[\s\S]*?display:\s*none\s*;[\s\S]*?\}/,
    );
    assert.doesNotMatch(
      css,
      /(?:^|\n)\.botAmbientUnderglow\s*\{[^}]*display:\s*none\s*;/,
    );
  });

  it("wires only the intended immersive avatar surfaces", () => {
    const rigUses = pageSource.match(/<BotAmbientPresenceRig\b/g) ?? [];
    assert.equal(rigUses.length, 7);
    assert.match(pageSource, /scheduleKey=\{`zen-live-/);
    assert.match(pageSource, /scheduleKey=\{`waiting-room-/);
    assert.match(pageSource, /scheduleKey=\{`coffee-replay-player-/);
    assert.match(pageSource, /scheduleKey=\{`coffee-live-/);
    assert.match(pageSource, /scheduleKey=\{`botcast-/);
    assert.match(pageSource, /data-avatar-customizer-preview="true"[\s\S]*<BotAmbientPresenceRig/);
    assert.doesNotMatch(
      pageSource,
      /botPanelHubAvatarPlate[\s\S]{0,1200}<BotAmbientPresenceRig/,
    );
  });
});
