import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { coffeeDepartureRevealMessageIndexes } from "./coffee-departure-presentation.ts";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const curtainSource = readFileSync(
  new URL("./CoffeeIntroCurtain.tsx", import.meta.url),
  "utf8",
);

describe("Coffee departure presentation", () => {
  it("presents every new assistant goodbye in server order", () => {
    const before = [
      { id: "player", role: "user" },
      { id: "last-live", role: "assistant" },
    ];
    const after = [
      ...before,
      { id: "player-departure", role: "system" },
      { id: "first-goodbye", role: "assistant" },
      { id: "second-goodbye", role: "assistant" },
      { id: "final-departures", role: "system" },
      { id: "synopsis", role: "system" },
    ];

    assert.deepEqual(
      coffeeDepartureRevealMessageIndexes({ before, after }),
      [3, 4],
    );
  });

  it("does not replay an assistant message already visible at the table", () => {
    const before = [{ id: "already-heard", role: "assistant" }];
    assert.deepEqual(
      coffeeDepartureRevealMessageIndexes({
        before,
        after: [
          ...before,
          { id: "departure", role: "system" },
        ],
      }),
      [],
    );
  });

  it("keeps ordinary completion distinct from an actual player departure", () => {
    const finishStart = pageSource.indexOf("const finishCoffeeSession =");
    const finishEnd = pageSource.indexOf(
      "finishCoffeeSessionRef.current = finishCoffeeSession",
      finishStart,
    );
    const finishSource = pageSource.slice(finishStart, finishEnd);

    assert.match(finishSource, /\/synopsis/u);
    assert.doesNotMatch(finishSource, /\/depart/u);
    assert.doesNotMatch(finishSource, /awaitEpilogue/u);
    assert.match(pageSource, /recordCoffeePlayerDepartureOnExit/u);
    assert.match(pageSource, /\/depart/u);
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /closes the table without adding player dialogue/u,
    );
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /holds on the empty table, fades to a COFFEE card/u,
    );
  });

  it("holds scheduling until the voiced departure and walk-away have finished", () => {
    const revealStart = pageSource.indexOf("const queueCoffeeReveal =");
    const revealEnd = pageSource.indexOf(
      "queueCoffeeRevealFnRef.current = queueCoffeeReveal",
      revealStart,
    );
    const revealSource = pageSource.slice(revealStart, revealEnd);

    assert.match(revealSource, /departurePresentationDeferred = true/u);
    assert.match(
      revealSource,
      /coffeeLiveDepartureTimerRef\.current = setTimeout\([\s\S]{0,520}finishRevealPresentation\(\)/u,
    );
    assert.match(
      revealSource,
      /if \(!departurePresentationDeferred\) \{\s*finishRevealPresentation\(\);/u,
    );
  });

  it("closes on the empty table, plays the Coffee card, then enters Review", () => {
    const finishStart = pageSource.indexOf("const finishCoffeeSession =");
    const finishEnd = pageSource.indexOf(
      "finishCoffeeSessionRef.current = finishCoffeeSession",
      finishStart,
    );
    const finishSource = pageSource.slice(finishStart, finishEnd);

    assert.match(finishSource, /\/close/u);
    assert.match(finishSource, /setCoffeeOutroEmptyTable\(true\)/u);
    assert.match(finishSource, /COFFEE_OUTRO_EMPTY_TABLE_MS/u);
    assert.match(finishSource, /setCoffeeOutroPlaying\(true\)/u);
    assert.match(finishSource, /COFFEE_OUTRO_CURTAIN_MS/u);
    assert.match(finishSource, /\/complete/u);
    assert.match(finishSource, /assignCoffeeSessionPhase\("finished"\)/u);
    assert.match(curtainSource, /COFFEE_OUTRO_EMPTY_TABLE_MS = 400/u);
    assert.match(curtainSource, /COFFEE_OUTRO_FADE_MS = 760/u);
    assert.match(curtainSource, /COFFEE_OUTRO_CARD_MS = 1800/u);
    assert.match(curtainSource, /\? "COFFEE" : "PRISM presents"/u);
    assert.match(curtainSource, /The table is empty\./u);
  });
});
