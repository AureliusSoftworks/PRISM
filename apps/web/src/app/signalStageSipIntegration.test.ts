import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Signal stage sip integration", () => {
  it("measures the mounted mouth before latching either stage mug", () => {
    const syncStart = source.indexOf("const syncSignalCupTravel = useCallback");
    const syncEnd = source.indexOf(
      "const finishSignalCupReturn",
      syncStart,
    );
    const syncSource = source.slice(syncStart, syncEnd);

    assert.ok(syncStart >= 0);
    assert.ok(syncEnd > syncStart);
    assert.match(
      syncSource,
      /syncSignalSipMouthTargets\(\);[\s\S]{0,120}setSignalCupTravelByRole/u,
    );
    assert.match(
      syncSource,
      /for \(const role of \["host", "guest"\] as const\)/u,
    );
    assert.match(source, /data-sip-requested=\{hostSipping/u);
    assert.match(source, /data-sip-requested=\{guestSipping/u);
  });

  it("keeps Signal's inner cup translation at zero so the wrapper owns mouth travel", () => {
    assert.match(
      pageCss,
      /\.coffeeCup\.signalCoffeeCup,[\s\S]{0,220}--coffee-cup-sip-x:\s*0px;[\s\S]{0,80}--coffee-cup-sip-y:\s*0px/iu,
    );
  });
});
