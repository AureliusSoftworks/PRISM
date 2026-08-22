import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Coffee uses a brief mood-aware aside without cancelling the slow turn", () => {
  const start = source.indexOf("const coffeeDeadAirAsideConsideredRef");
  const end = source.indexOf("const coffeeProvider =", start);
  const thinkingDelaySlice = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    thinkingDelaySlice,
    /buildDeadAirAsidePlanV1\(\{[\s\S]{0,220}mode: "coffee"/u,
  );
  assert.match(thinkingDelaySlice, /coffeeDeadAirAsideShouldAttempt\(/u);
  assert.match(thinkingDelaySlice, /COFFEE_DEAD_AIR_ASIDE_EXTRA_THINK_MS/u);
  assert.match(thinkingDelaySlice, /setCoffeeDeadAirAside\(plan\)/u);
  assert.match(thinkingDelaySlice, /playCoffeeDeadAirAsideRef\.current\(plan\)/u);
  assert.match(
    thinkingDelaySlice,
    /coffeeActiveTurnJob\.phase !== "thinking"[\s\S]{0,120}setCoffeeDeadAirAside\(null\)/u,
  );
  assert.doesNotMatch(
    thinkingDelaySlice,
    /coffeeActiveTurnJob\.phase !== "thinking"[\s\S]{0,240}stopReactionVoiceAudio\(\)/u,
  );
  assert.doesNotMatch(thinkingDelaySlice, /turn-jobs[^\n]*interrupt/u);
  assert.doesNotMatch(thinkingDelaySlice, /interruption-pause/u);
  // Intelligible side speech must stay visibly owned by its seat.
  assert.match(
    source,
    /Intelligible asides must remain visibly owned[\s\S]{0,280}seatListenerReactionText \?\?[\s\S]{0,120}seatDeadAirAsideActive \? activeCoffeeDeadAirAside\.text/u,
  );
  assert.match(css, /coffeeSeatActionBadge\[data-dead-air-aside="true"\]/u);
});
