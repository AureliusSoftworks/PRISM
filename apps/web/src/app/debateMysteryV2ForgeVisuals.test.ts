import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { debateMysteryForgeVisualState } from "./debateMysteryV2ForgeVisuals.ts";

const experienceSource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);
const compilationSource = readFileSync(
  new URL("../../../api/src/debate-mystery-v2.ts", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Whodunnit V2 Case Forge visual progression", () => {
  it("maps only durable stage completion from near-black monochrome to a crisp exterior", () => {
    const first = debateMysteryForgeVisualState(0, 5, "writing_case");
    const middle = debateMysteryForgeVisualState(3, 5, "preparing_local_voices");
    const final = debateMysteryForgeVisualState(5, 5, "complete");

    assert.equal(first.completion, 0);
    assert.ok(first.brightness < middle.brightness && middle.brightness < final.brightness);
    assert.ok(first.contrast < middle.contrast && middle.contrast < final.contrast);
    assert.ok(first.grayscale > middle.grayscale && middle.grayscale > final.grayscale);
    assert.ok(first.saturation < middle.saturation && middle.saturation < final.saturation);
    assert.equal(first.opacity, 0);
    assert.ok(first.opacity < middle.opacity && middle.opacity < final.opacity);
    assert.equal(final.opacity, 1);
    assert.ok(first.blurPx > middle.blurPx && middle.blurPx > final.blurPx);
    assert.equal(final.blurPx, 0);
  });

  it("keeps a stopped Forge spoiler-safe and actionable without resetting earned visual progress", () => {
    const recovered = debateMysteryForgeVisualState(2, 5, "needs_attention");
    assert.equal(recovered.completion, 0.4);
    assert.ok(recovered.blurPx > 0 && recovered.grayscale > 0);
    assert.match(experienceSource, /Case preparation stopped/u);
    assert.match(experienceSource, /Retry preparation/u);
    assert.match(experienceSource, /Copy error details/u);
    assert.match(experienceSource, /Return to Archive/u);
  });

  it("uses the durable exterior-door checkpoint for completed unstarted cases", () => {
    assert.match(compilationSource, /state\.playPhase = "title_card";[\s\S]{0,900}stage: "complete"/u);
    assert.match(experienceSource, /if \(state\.playPhase === "title_card"\)/u);
    assert.match(experienceSource, /data-tutorial-target="whodunnit-enter-mansion"/u);
    assert.match(experienceSource, /Open the mansion door and enter the foyer/u);
    assert.match(experienceSource, /beginExteriorEntry/u);
    assert.match(tutorialSource, /Archive reopens a completed, unstarted Participant case/u);
    assert.match(tutorialSource, /Open the glowing door target with a click, Enter, or Space to cross into the Foyer/u);
  });

  it("reveals the durable authored case title before the fullscreen exterior", () => {
    assert.match(experienceSource, /state\.caseTitle \? "PRISM presents" : "PRISM \/ Case Forge"/u);
    assert.match(experienceSource, /state\.caseTitle \?\? "A mystery is taking shape"/u);
    assert.match(experienceSource, /"--forge-exterior-opacity": String\(forgeVisual\.opacity\)/u);
    assert.match(cssSource, /\.forgeCard\[data-exterior-hero="true"\] \{[\s\S]*min-height: 100dvh/u);
    assert.match(cssSource, /opacity: var\(--forge-exterior-opacity, 0\)/u);
  });

  it("honors reduced motion while retaining the stage-derived image state", () => {
    assert.match(experienceSource, /const forgeVisual = debateMysteryForgeVisualState\(/u);
    assert.match(experienceSource, /"--forge-exterior-blur": `\$\{forgeVisual\.blurPx\}px`/u);
    assert.match(cssSource, /filter: brightness\(var\(--forge-exterior-brightness/u);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.forgeCard\[data-exterior-hero="true"\]::before \{ transition: none; \}/u);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.titleCardContent \{ animation: none; \}/u);
  });
});
