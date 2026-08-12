import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const pageCss = readFileSync(join(appDir, "page.module.css"), "utf8");
const tutorialSource = readFileSync(join(appDir, "modeTutorials.ts"), "utf8");

describe("retired Coffee service", () => {
  it("removes retired service and player-cup presentation from Coffee", () => {
    assert.doesNotMatch(pageSource, /coffeeSettings\?\.barRitual/u);
    assert.doesNotMatch(pageSource, /coffeeBarScene|coffeeWaiterVisit/u);
    assert.doesNotMatch(pageSource, /player-cup\/sip/u);
    assert.doesNotMatch(pageSource, /drinkReaction/u);
    assert.match(pageSource, /coffeeReplayPlayerSeat/u);
    assert.doesNotMatch(
      pageCss,
      /\.coffee(?:Bar|Waiter|PlayerCup)\b/u,
    );
    assert.match(pageCss, /\.coffeeReplayPlayerSeat\s*\{/u);
  });

  it("starts new and resumed sessions at topic or arrivals", () => {
    const createStart = pageSource.indexOf("const createCoffeeSession = async");
    const createEnd = pageSource.indexOf(
      "const createCoffeeGroupFromSelection",
      createStart,
    );
    const createSource = pageSource.slice(createStart, createEnd);
    assert.doesNotMatch(createSource, /assignCoffeeSessionPhase\("barista"\)/u);
    assert.match(createSource, /assignCoffeeSessionPhase\("topic"\)/u);
    assert.match(createSource, /beginCoffeeLiveWithIntro\(/u);

    const resumeStart = pageSource.indexOf(
      "const joinPreviewedCoffeeSession =",
    );
    const resumeEnd = pageSource.indexOf(
      "type CoffeeTurnClientResponse",
      resumeStart,
    );
    const resumeSource = pageSource.slice(resumeStart, resumeEnd);
    assert.doesNotMatch(resumeSource, /setCoffeeSessionPhase\("barista"\)/u);
    assert.match(resumeSource, /startCoffeeArrivalSequence\(/u);
  });

  it("preloads the model before Serve arrivals and keeps retry actionable", () => {
    const handoffStart = pageSource.indexOf(
      "const prepareCoffeeServeHandoff = async",
    );
    const handoffEnd = pageSource.indexOf(
      "const beginCoffeeLiveWithIntro = async",
      handoffStart,
    );
    const handoffSource = pageSource.slice(handoffStart, handoffEnd);
    assert.match(handoffSource, /coffeeSettings\?\.experienceMode !== "serve"/u);
    assert.match(handoffSource, /coffeeModelWarmupRetryActionRef\.current/u);
    assert.match(handoffSource, /ensureCoffeeModelReady\(true\)/u);
    assert.match(handoffSource, /releaseCoffeeModelWarmup\(\)/u);
    assert.match(
      pageSource,
      /beginCoffeeLiveWithIntro[\s\S]*prepareCoffeeServeHandoff\(/u,
    );
  });

  it("gives every live off-camera player the pot without legacy ritual state", () => {
    assert.match(
      pageSource,
      /const coffeePotComposerDockVisible =\s*conversationActive &&\s*\(coffeeSessionPhase === "arriving" \|\|\s*coffeeSessionPhase === "live"\) &&\s*!coffeeReplayActive &&\s*coffeeExperienceAllowsPot;/u,
    );
    assert.doesNotMatch(
      pageSource,
      /coffeePotComposerDockVisible[\s\S]{0,220}barRitual/u,
    );
    assert.doesNotMatch(
      pageSource,
      /activeConv\.coffeeSettings\?\.barRitual\?\.drinkReactionStatus/u,
    );
    assert.match(
      pageSource,
      /const coffeePotVisible =\s*conversationActive &&\s*\(coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live"\) &&\s*!previewingSession &&\s*!coffeeReplayActive &&\s*coffeeExperienceAllowsPot;/u,
    );
    assert.doesNotMatch(
      pageSource,
      /const coffeePotVisible =[\s\S]{0,220}barRitual/u,
    );
  });

  it("teaches pot-only play without barista, waiter, mug, or video steps", () => {
    const coffeeStart = tutorialSource.indexOf("coffee: {");
    const coffeeEnd = tutorialSource.indexOf("botcast: {", coffeeStart);
    const coffeeTutorial = tutorialSource.slice(coffeeStart, coffeeEnd);
    assert.match(coffeeTutorial, /You remain off camera during the live table/u);
    assert.match(coffeeTutorial, /Replay seats you as Default Prism/u);
    assert.match(coffeeTutorial, /Drag the pot/u);
    assert.match(coffeeTutorial, /Join for Coffee/u);
    assert.match(coffeeTutorial, /Serve Coffee/u);
    assert.match(coffeeTutorial, /faithful audio master/u);
    assert.doesNotMatch(coffeeTutorial, /Stop at the bar|Receive your drink/u);
    assert.doesNotMatch(coffeeTutorial, /Choose Video|video download/u);
  });
});
