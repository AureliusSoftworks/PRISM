import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
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

test("Auto effort and model-choice glyphs render with intended assets", () => {
  assert.match(
    pageSource,
    /function AutoEffortIcon\(\): React\.JSX\.Element \{[\s\S]{0,420}d="M9 2\.75 15\.25 14H2\.75L9 2\.75Z"/u,
  );
  assert.ok(pageSource.includes("function AutoModelChoiceGlyph()"));
  assert.ok(pageSource.includes("composeModelOptionAutoGlyph"));
  assert.match(
    cssSource,
    /composeModelOptionAutoGlyph\s*\{[\s\S]{0,140}url\("\/icon-triangle\.svg"\)/u,
  );
});

test("Auto Turbo toggle never persists a fixed model when Auto is selected", () => {
  assert.match(
    pageSource,
    /const selectedProvider = settings\.preferredProvider;[\s\S]{0,180}=== AUTO_MODEL_CHOICE/u,
  );
  assert.match(
    pageSource,
    /if \(!autoSelected\) \{[\s\S]{0,120}persistGlobalModelSelection/u,
  );
  assert.match(
    pageSource,
    /else if \(selectedProvider === "local"\) \{[\s\S]{0,220}\[turboCandidate\.provider\]: AUTO_MODEL_CHOICE/u,
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
