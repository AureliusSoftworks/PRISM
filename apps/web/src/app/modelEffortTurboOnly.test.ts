import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("only Auto uses the effort glyph as a direct Turbo toggle", () => {
  assert.doesNotMatch(pageSource, /fixedOnlineTurboToggleAvailable/u);
  assert.match(
    pageSource,
    /const onlineTurboToggleAvailable =\s*autoOnlineTurboToggleAvailable/u,
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
    /Only Auto uses the effort glyph as a direct Turbo switch; every fixed model opens the Effort picker/u,
  );
});
