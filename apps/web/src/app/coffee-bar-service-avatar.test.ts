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
    assert.doesNotMatch(pageSource, /coffeeReplayPlayerSeat/u);
    assert.doesNotMatch(
      pageCss,
      /\.coffee(?:Bar|Waiter|PlayerCup|ReplayPlayer(?:Seat|Avatar|Nameplate|Glyph))/u,
    );
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
    assert.match(createSource, /startCoffeeArrivalSequence\(/u);

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

  it("gives every live off-camera player the pot without legacy ritual state", () => {
    assert.match(
      pageSource,
      /const coffeePotComposerDockVisible =\s*conversationActive &&\s*\(coffeeSessionPhase === "arriving" \|\|\s*coffeeSessionPhase === "live"\) &&\s*!coffeeReplayActive;/u,
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
      /const coffeePotVisible =\s*conversationActive &&\s*\(coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live"\) &&\s*!previewingSession &&\s*!coffeeReplayActive;/u,
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
    assert.match(coffeeTutorial, /You remain off camera/u);
    assert.match(coffeeTutorial, /Drag the pot/u);
    assert.match(coffeeTutorial, /faithful audio master/u);
    assert.doesNotMatch(coffeeTutorial, /Stop at the bar|Receive your drink/u);
    assert.doesNotMatch(coffeeTutorial, /Choose Video|video download/u);
  });
});
