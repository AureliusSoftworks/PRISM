import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

test("Coffee uses a brief mood-aware aside without cancelling the slow turn", () => {
  const start = source.indexOf("const coffeeAutomaticCutInConsideredRef");
  const end = source.indexOf("const [coffeeProvider", start);
  const thinkingDelaySlice = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    thinkingDelaySlice,
    /buildDeadAirAsidePlanV1\(\{[\s\S]{0,220}mode: "coffee"/u,
  );
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
  assert.match(source, /data-dead-air-aside=/u);
  assert.match(css, /coffeeSeatActionBadge\[data-dead-air-aside="true"\]/u);
});
