import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("fixed online models without adjustable effort toggle Turbo directly", () => {
  assert.match(
    pageSource,
    /const fixedOnlineTurboToggleAvailable =\s*!autoSelected[\s\S]{0,260}provider === "online"[\s\S]{0,180}capability\.mode === "unavailable"[\s\S]{0,120}turboSupported === true/u,
  );
  assert.match(
    pageSource,
    /const onlineTurboToggleAvailable =\s*autoOnlineTurboToggleAvailable \|\| fixedOnlineTurboToggleAvailable/u,
  );
  assert.match(
    pageSource,
    /if \(onlineTurboToggleAvailable\) \{[\s\S]{0,240}new Event\(TURBO_TOGGLE_QUICK_EVENT, \{ bubbles: true \}\)/u,
  );
  assert.match(
    pageSource,
    /aria-haspopup=\{effortDirectActionAvailable \? undefined : "dialog"\}/u,
  );
  assert.match(
    pageSource,
    /aria-pressed=\{\s*onlineTurboToggleAvailable[\s\S]{0,80}effortControl\.turboEnabled/u,
  );
  assert.match(
    pageSource,
    /data-fixed-turbo-toggle=\{\s*fixedOnlineTurboToggleAvailable/u,
  );
});

test("adjustable models retain the Effort popover", () => {
  assert.match(
    pageSource,
    /const effortMenuOpen =\s*effortOpen &&\s*!effortInteractionDisabled &&\s*!effortDirectActionAvailable/u,
  );
  assert.match(
    pageSource,
    /data-adjustable=\{\s*!autoSelected &&\s*effortControl\.capability\.mode !== "unavailable"/u,
  );
  assert.match(
    tutorialSource,
    /models without an adjustable Effort dial use the Effort control itself as a direct Turbo switch, just like ONLINE Auto; adjustable models keep Turbo inside the Effort popover/u,
  );
});
