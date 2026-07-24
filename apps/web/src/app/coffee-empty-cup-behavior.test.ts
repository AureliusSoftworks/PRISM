import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

describe("Coffee empty-cup behavior", () => {
  it("keeps the empty mug at the seat and drives deterministic failed attempts", () => {
    assert.match(pageSource, /coffeeEmptyCupAttemptState\(\{/u);
    assert.match(
      pageSource,
      /const coffeeCupVisible =\s*!rosterPreviewSeat &&\s*!seatLiveDeparting &&\s*seatIsFirmlySeated &&\s*!coffeeCupRefused;/u,
    );
    assert.match(
      pageSource,
      /data-cup-empty-attempt=\{\s*emptyCupAttemptActive \? "true" : undefined\s*\}/u,
    );
  });

  it("uses a short reach, returns the cup, and frowns after realization", () => {
    assert.match(cssSource, /@keyframes coffeeCupEmptyAttempt/u);
    assert.match(cssSource, /--coffee-cup-empty-attempt-x:/u);
    assert.match(cssSource, /34%,\s*43%[\s\S]*coffee-cup-empty-attempt-x/u);
    assert.match(pageSource, /emptyCupAttemptFrowning[\s\S]*coffeeSeatPlateGlyph\("sad"\)/u);
  });

  it("finishes the client session after a server-directed group wrap", () => {
    assert.match(
      pageSource,
      /if \(response\.shouldEndSession\) \{\s*finishCoffeeSessionRef\.current\(response\.conversation\.id\);\s*return;/u,
    );
    assert.match(
      pageSource,
      /\/api\/coffee\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/depart/u,
    );
  });
});
