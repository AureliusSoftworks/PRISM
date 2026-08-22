import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const layerSource = readFileSync(
  new URL("./CoffeeContextSparkLayer.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

describe("Coffee Context Sparks UI", () => {
  it("uses a dedicated accessible layer with no empty-state footprint", () => {
    assert.match(layerSource, /if \(sparks\.length === 0\) return null;/u);
    assert.match(layerSource, /aria-label="Conversation sparks from earlier sessions"/u);
    assert.match(layerSource, /aria-live="polite"/u);
    assert.match(layerSource, /data-position=\{index % 3\}/u);
    assert.match(layerSource, /<Radio aria-hidden="true"/u);
    assert.match(layerSource, /<Drama aria-hidden="true"/u);
    assert.match(layerSource, /<Coffee aria-hidden="true"/u);
    assert.match(layerSource, /aria-pressed=\{armed\}/u);
    assert.match(layerSource, /Dismiss .* spark/u);
  });

  it("arms into the composer and does not submit until the player sends", () => {
    const armStart = pageSource.indexOf("async function armCoffeeContextSpark");
    const armEnd = pageSource.indexOf("async function releaseCoffeeContextSpark", armStart);
    const armSource = pageSource.slice(armStart, armEnd);
    assert.ok(armStart >= 0 && armEnd > armStart);
    assert.match(armSource, /setCoffeeContextSparkState\(spark, "armed"\)/u);
    assert.match(armSource, /coffeeComposerRichRef\.current\?\.setValue\(spark\.prompt\)/u);
    assert.match(armSource, /coffeeComposerRichRef\.current\?\.focus\(\)/u);
    assert.doesNotMatch(armSource, /sendCoffeeTurn|runCoffeeTurnJob/u);
    assert.match(pageSource, /\? \{ contextSparkId: contextSparkIdForTurn \}/u);
    assert.match(
      pageSource,
      /if \(contextSparkIdForTurn\) \{[\s\S]*?current\.filter\(\(spark\) => spark\.id !== contextSparkIdForTurn\)/u,
    );
  });

  it("restores an armed spark, exposes its source chip, and supports dismissal", () => {
    assert.match(
      pageSource,
      /\/api\/coffee\/sessions\/\$\{encodeURIComponent\(conversationId\)\}\/context-sparks/u,
    );
    assert.match(pageSource, /spark\.state === "armed"/u);
    assert.match(pageSource, /className=\{styles\.coffeeContextSparkChip\}/u);
    assert.match(pageSource, /releaseCoffeeContextSpark\(spark, "available"\)/u);
    assert.match(pageSource, /releaseCoffeeContextSpark\(spark, "dismissed"\)/u);
  });

  it("keeps sparks in pre-session topic setup and removes both chip surfaces when the session starts", () => {
    assert.match(
      pageSource,
      /const coffeeContextSparksSetupVisible =\s*coffeeSessionPhase === "topic" &&\s*!coffeeReplayActive &&\s*!coffeeModelWarmup;/u,
    );
    assert.match(
      pageSource,
      /\{coffeeContextSparksSetupVisible \? \(\s*<CoffeeContextSparkLayer/u,
    );
    assert.match(
      pageSource,
      /\(coffeeContextSparksSetupVisible &&\s*coffeeArmedContextSparkId\) \? \(/u,
    );
    assert.doesNotMatch(
      pageSource,
      /\(coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live"\)[\s\S]{0,160}<CoffeeContextSparkLayer/u,
    );
  });

  it("respects reduced motion and keeps stable stage positions", () => {
    assert.match(cssSource, /\.coffeeContextSparkLayer\[data-receded="true"\]/u);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.coffeeContextSpark/u);
    assert.match(cssSource, /\.coffeeContextSpark\[data-position="0"\]/u);
    assert.match(cssSource, /\.coffeeContextSpark\[data-position="1"\]/u);
    assert.match(cssSource, /\.coffeeContextSpark\[data-position="2"\]/u);
  });

  it("uses opaque dark-ink conversation cards in Light Mode", () => {
    assert.match(
      cssSource,
      /\.themeLight\.coffeeShell \.coffeeContextSpark \{[\s\S]*?rgba\(251, 253, 255, 0\.96\);/u,
    );
    assert.match(
      cssSource,
      /\.themeLight\.coffeeShell \.coffeeContextSparkMain,[\s\S]*?\.coffeeContextSparkCopy strong \{\s*color: #172235;/u,
    );
    assert.match(
      cssSource,
      /\.themeLight\.coffeeShell \.coffeeContextSparkCopy small,[\s\S]*?\.coffeeContextSparkDismiss \{\s*color: #526174;/u,
    );
  });

  it("keeps tutorial guidance without placing a stray cue over the table", () => {
    assert.doesNotMatch(layerSource, /Past sessions can return as conversation sparks\./u);
    assert.doesNotMatch(cssSource, /\.coffeeContextSparkCue/u);
    assert.match(tutorialSource, /COFFEE_CONTEXT_SPARKS_TUTORIAL_SUFFIX/u);
    assert.match(tutorialSource, /nothing sends until you choose Send/u);
    assert.match(tutorialSource, /all spark chips leave the table when the session begins/u);
    assert.doesNotMatch(pageSource, /COFFEE_CONTEXT_SPARK_CUE_DISMISSED_SESSION_KEY/u);
  });
});
