import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { coffeeDepartureRevealMessageIndexes } from "./coffee-departure-presentation.ts";
import { MODE_TUTORIALS } from "./modeTutorials.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

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

  it("keeps Review behind an awaited, ordered live departure wrap", () => {
    const finishStart = pageSource.indexOf("const finishCoffeeSession =");
    const finishEnd = pageSource.indexOf(
      "finishCoffeeSessionRef.current = finishCoffeeSession",
      finishStart,
    );
    const finishSource = pageSource.slice(finishStart, finishEnd);

    assert.match(finishSource, /awaitEpilogue: true/u);
    assert.match(
      finishSource,
      /coffeeDepartureRevealMessageIndexes\([\s\S]*?presentNextDepartureTurn/u,
    );
    assert.ok(
      finishSource.indexOf("queueCoffeeReveal({") <
        finishSource.indexOf('assignCoffeeSessionPhase("finished")'),
    );
    assert.match(pageSource, /Wrapping up at the table…/u);
    assert.match(
      MODE_TUTORIALS.coffee.steps.map((step) => step.body).join(" "),
      /Wrapping up keeps the live table visible while every generated departure line streams and speaks in order/u,
    );
  });
});
