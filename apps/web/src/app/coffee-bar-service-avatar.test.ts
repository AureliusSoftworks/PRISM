import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const pageCss = readFileSync(join(appDir, "page.module.css"), "utf8");
const tutorialSource = readFileSync(join(appDir, "modeTutorials.ts"), "utf8");

describe("Coffee Join and Serve presentation", () => {
  it("removes the retired waiter and bar-service presentation from Coffee", () => {
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

  it("shows the intro before ordinary arrivals and warms only Serve handoffs", () => {
    const handoffStart = pageSource.indexOf(
      "const prepareCoffeeServeHandoff = async",
    );
    const handoffEnd = pageSource.indexOf(
      "const beginCoffeeLiveWithIntro = async",
      handoffStart,
    );
    const handoffSource = pageSource.slice(handoffStart, handoffEnd);
    assert.match(
      handoffSource,
      /experienceMode !== "serve"\) return true/u,
    );
    assert.match(handoffSource, /coffeeModelWarmupRetryActionRef\.current/u);
    assert.match(handoffSource, /ensureCoffeeModelReady\(true\)/u);
    assert.match(handoffSource, /releaseCoffeeModelWarmup\(\)/u);
    assert.match(
      pageSource,
      /beginCoffeeLiveWithIntro[\s\S]{0,500}prepareCoffeeServeHandoff\([\s\S]{0,300}playCoffeeIntroCurtain\(\)[\s\S]{0,260}startCoffeeArrivalSequence\(/u,
    );
    const introStart = pageSource.indexOf("const beginCoffeeLiveWithIntro =");
    const introEnd = pageSource.indexOf(
      "const refreshCoffeeStarterTopics =",
      introStart,
    );
    const introSource = pageSource.slice(introStart, introEnd);
    assert.ok(
      introSource.indexOf("setCoffeeGuestRevealConcealed(true)") <
        introSource.indexOf("prepareCoffeeServeHandoff"),
    );
    assert.ok(
      introSource.indexOf("startCoffeeArrivalSequence") <
        introSource.indexOf("setCoffeeIntroPlaying(false)"),
    );
    assert.match(
      pageSource,
      /data-coffee-intro-playing=\{[\s\S]{0,100}coffeeIntroPlaying \|\| coffeeGuestRevealConcealed/,
    );
    assert.match(
      pageCss,
      /\.coffeeStage\[data-coffee-intro-playing="true"\] \.coffeeSeat[\s\S]{0,180}visibility:\s*hidden/u,
    );
  });

  it("gives Serve players the pot without legacy ritual state", () => {
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

  it("keeps Join seated with a mug and Serve off camera with the pot", () => {
    assert.match(
      pageSource,
      /const coffeeReplayPlayerAvatarVisible =[\s\S]{0,360}coffeeLiveExperienceMode === "join"[\s\S]{0,180}coffeeSessionPhase === "arriving" \|\| coffeeSessionPhase === "live"/u,
    );
    assert.match(
      pageSource,
      /!coffeeReplayActive &&\s*coffeeLiveExperienceMode === "join" &&\s*[\s\S]{0,360}className=\{styles\.coffeePlayerCupButton\}/u,
    );
    assert.match(
      pageSource,
      /const coffeeExperienceAllowsPot = coffeeLiveExperienceMode === "serve"/u,
    );
    assert.match(pageSource, /const toggleCoffeeMugComposer = \(\): void =>/u);
    assert.match(pageSource, /onClick=\{toggleCoffeeMugComposer\}/u);
    assert.match(pageSource, /aria-pressed=\{coffeePlayerComposerOpen\}/u);
    assert.match(
      pageSource,
      /const coffeeComposerVisible =[\s\S]{0,240}coffeePlayerComposerOpen/u,
    );
    assert.match(pageSource, /consumeJoinSip: true/u);
    assert.match(pageSource, /cancelCoffeeMugFloorClaim/u);
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
    assert.match(coffeeTutorial, /your mug gates the composer/u);
    assert.match(coffeeTutorial, /water glass/u);
    assert.match(coffeeTutorial, /final farewell is visible, voiced, and replayed/u);
    assert.match(coffeeTutorial, /fades to a COFFEE card/u);
    assert.match(
      coffeeTutorial,
      /data-tutorial-target="coffee-participation-control"/u,
    );
    assert.doesNotMatch(coffeeTutorial, /Stop at the bar|Receive your drink/u);
    assert.doesNotMatch(coffeeTutorial, /Choose Video|video download/u);
  });
});
