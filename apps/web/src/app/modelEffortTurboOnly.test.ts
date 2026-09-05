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
  assert.match(pageSource, /AUTO_MODEL_TURBO_PREFERENCE_ID/u);
  assert.match(pageSource, /function savedAutoTurboMode/u);
  assert.match(
    pageSource,
    /const autoSelected = effortTrigger\.dataset\.autoTurboAction === "true"/u,
  );
  assert.match(
    pageSource,
    /if \(autoSelected && autoProvider === "local"\)[\s\S]{0,180}turbo-denied/u,
  );
  assert.match(
    pageSource,
    /if \(!autoSelected\) \{[\s\S]{0,120}persistGlobalModelSelection/u,
  );
  assert.match(
    pageSource,
    /else \{[\s\S]{0,520}\[turboCandidate\.provider\]: AUTO_MODEL_CHOICE/u,
  );
  assert.doesNotMatch(
    pageSource.match(
      /else \{[\s\S]{0,520}\[turboCandidate\.provider\]: AUTO_MODEL_CHOICE/u,
    )?.[0] ?? "",
    /turboCandidate\.id/u,
  );
  assert.match(
    pageSource,
    /if \(autoSelected\) \{[\s\S]{0,520}if \(!nextTurboEnabled\)[\s\S]{0,220}persistAutoTurboPreference\(false\)/u,
  );
  assert.match(
    pageSource,
    /if \(target\?\.turboSupported\) \{[\s\S]{0,220}persistAutoTurboPreference\(true\)[\s\S]{0,180}Enabling continues below/u,
  );
});

test("the Auto triangle spins only for active generation and honors reduced motion", () => {
  assert.match(
    cssSource,
    /data-generating="true"\][\s\S]{0,80}> \.modelEffortAutoIcon[\s\S]{0,40}> svg\s*\{[\s\S]{0,180}modelEffortThinkingSpin/u,
  );
  assert.match(
    cssSource,
    /prefers-reduced-motion: reduce[\s\S]*data-generating="true"\][\s\S]{0,80}> \.modelEffortAutoIcon[\s\S]{0,40}> svg\s*\{[\s\S]{0,80}animation:\s*none/u,
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
