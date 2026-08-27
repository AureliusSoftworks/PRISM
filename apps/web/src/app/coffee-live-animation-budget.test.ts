import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const coffeeIntroCss = readFileSync(
  new URL("./CoffeeIntroCurtain.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Coffee and Signal live visual fidelity", () => {
  it("never trades the authored CRT stack for a live-session performance floor", () => {
    assert.doesNotMatch(css, /Coffee live animation budget/u);
    assert.doesNotMatch(
      css,
      /coffeeStage\[data-phase="live"\][\s\S]{0,240}botFaceCrt(?:Noise|Breathing)Layer[\s\S]{0,120}animation:\s*none/u,
    );
    assert.doesNotMatch(
      signalCss,
      /data-live-episode="true"[\s\S]{0,260}(?:data-prism-priority-phosphor|zenLiveBotPresenceFaceEmissionMask)[\s\S]{0,180}(?:display:\s*none|filter:\s*none|animation:\s*none)/u,
    );
    assert.match(pageSource, /data-prism-priority-phosphor="true"/u);
    assert.match(pageSource, /detailLevel:\s*"full"/u);
  });

  it("sheds only explicitly decorative Coffee motion and preserves CRT descendants", () => {
    const motionShed = css.slice(
      css.indexOf('.coffeeStage[data-motion-shed="true"]'),
      css.indexOf(".coffeeAbsentNote"),
    );
    assert.match(motionShed, /data-prism-decorative-motion/u);
    assert.match(motionShed, /data-crt-phosphor="bot"/u);
    assert.match(motionShed, /animation-play-state:\s*paused/u);
    assert.doesNotMatch(motionShed, /data-prism-decorative-motion="true"\]\s+\*/u);
    assert.match(
      globalCss,
      /data-prism-runtime-quality="minimal"[\s\S]{0,220}:not\([\s\S]{0,120}data-crt-phosphor="bot"/u,
    );
  });

  it("keeps semantic cup consumption visible during the live table", () => {
    assert.doesNotMatch(pageSource, /liveCoffeeDecorativePresentationFrozen/u);
    assert.match(
      pageSource,
      /const coffeeCupVisual = buildCoffeeCupVisualState\(\{[\s\S]{0,900}sippingOverride:[\s\S]{0,260}visualSeatSipInProgress/u,
    );
    assert.match(
      pageSource,
      /resolveCoffeeSeatSipFacePresentation\(\{\s*sipInProgress:\s*visualSeatSipInProgress/u,
    );
    assert.match(pageSource, /className=\{styles\.coffeePlayerCupButton\}/u);
    assert.match(pageSource, /onClick=\{toggleCoffeeMugComposer\}/u);
    assert.match(pageSource, /consumeJoinSip: true/u);
  });

  it("keeps live table copy to one bounded utterance and one action label", () => {
    assert.match(pageSource, /COFFEE_LIVE_CENTER_FEED_MAX_LINES = 1/u);
    assert.match(pageSource, /data-coffee-center-feed-line="true"/u);
    assert.match(pageSource, /data-coffee-action-text="true"/u);
    assert.match(pageSource, /data-coffee-player-action-text="true"/u);
  });

  it("keeps full semantic motion and the authored Mini LED motion", () => {
    assert.match(
      pageSource,
      /motionMode=\{\s*resolvedSemanticFaceMotionEnabled \? "full" : "speech"\s*\}/u,
    );
    assert.match(
      pageSource,
      /motionMode=\{runtimeEffectsEnabled \? "mini-led" : "static"\}/u,
    );
    assert.match(pageSource, /showThinkingSpinner:\s*seatThinkingVisualActive/u);
    assert.match(pageSource, /showThinkingSpinner:\s*signalPrismThinking/u);
  });

  it("keeps both title lockups above their animated reveal curtains", () => {
    assert.match(
      signalCss,
      /\.episodePreRoll\[data-kind="intro"\]::after\s*\{[^}]*z-index:\s*0/u,
    );
    assert.match(
      signalCss,
      /\.preRollLockup\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/u,
    );
    assert.match(
      coffeeIntroCss,
      /\.curtain::after\s*\{[^}]*z-index:\s*2/u,
    );
    assert.match(
      coffeeIntroCss,
      /\.lockup\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*3/u,
    );
  });

  it("does not expose the circular fallback table before a topic is chosen", () => {
    assert.match(
      css,
      /\.coffeeStage\[data-phase="topic"\] \.coffeeTableGlow,[\s\S]{0,100}\.coffeeStage\[data-phase="topic"\] \.coffeeTableDisk\s*\{[^}]*opacity:\s*0/u,
    );
  });
});
