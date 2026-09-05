import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8")
  .replace(/\s+/gu, " ");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8")
  .replace(/\s+/gu, " ")
  .replace(/\(\s+/gu, "(")
  .replace(/\s+\)/gu, ")");

function scopedRule(
  selectorNeedles: readonly string[],
  bodyNeedle: string,
): string {
  const match = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
    (entry) =>
      selectorNeedles.every((needle) => (entry[1] ?? "").includes(needle)) &&
      (entry[2] ?? "").includes(bodyNeedle),
  );
  assert.ok(
    match,
    `Missing summary rule containing ${selectorNeedles.join(", ")} and ${bodyNeedle}`,
  );
  return match[2] ?? "";
}

test("finished Coffee review renders the synopsis and keeps replay behind the review header", () => {
  assert.match(
    pageSource,
    /const synopsisMessages = coffeeSessionPhase === "finished" && !coffeeReplayActive \? messages\.filter\([\s\S]*coffeeSystemSynopsisIsDisplayable\(message\.content\)/,
  );
  assert.match(pageSource, /"Preparing session synopsis\.\.\."/);
  assert.match(
    pageSource,
    /className=\{`\$\{styles\.coffeeStageHeader\} \$\{styles\.coffeeReviewHeader\}`\}/,
  );
  assert.match(pageSource, /<span className=\{styles\.sectionLabel\}>Session complete<\/span>/);
  assert.match(pageSource, /data-primary="true"/);
  assert.match(pageSource, /"View replay"/);
  assert.match(pageSource, /coffeeFinishedControlsVisible =[\s\S]*coffeeReplayActive/);
  assert.match(pageSource, /styles\.coffeeReplayComposerControls/);
  assert.match(pageSource, /className=\{styles\.coffeeTranscriptStatus\}/);
});

test("finished Coffee keeps the synopsis centered with the shifted table", () => {
  const focalRule = scopedRule(
    [
      '.coffeeStage[data-phase="finished"][data-autoplay-dock="true"]',
      ".coffeeTableFocalColumn",
    ],
    "transform: translateY(var(--coffee-finished-table-y))",
  );
  assert.match(
    focalRule,
    /transform:\s*translateY\(var\(--coffee-finished-table-y\)\)/,
  );
  assert.doesNotMatch(
    css,
    /--coffee-finished-table-y,\s*0px\)\s*-\s*clamp\(150px,\s*16vh,\s*180px\)/,
  );
});

test("Light Mode finished Coffee summary defines semantic contrast tokens", () => {
  const tokenRule = scopedRule(
    [
      ".themeLight.coffeeShell:has",
      '.coffeeStage[data-phase="finished"]:not([data-replay-active="true"])',
    ],
    "--coffee-finished-summary-surface",
  );
  assert.match(tokenRule, /--coffee-finished-summary-ink:\s*var\(--fg\)/);
  assert.match(
    tokenRule,
    /--coffee-finished-summary-muted-ink:\s*var\(--fg-muted\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-link-ink:\s*var\(--accent-ink\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-divider:\s*var\(--line-strong\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-button-surface:\s*var\(--accent\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-button-ink:\s*var\(--accent-text\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-disabled-ink:\s*var\(--fg-muted\)/,
  );
  assert.match(
    tokenRule,
    /--coffee-finished-summary-error-surface:\s*var\(--danger-soft\)/,
  );
  assert.doesNotMatch(tokenRule, /#[0-9a-f]{3,8}|rgba?\(/i);
  assert.doesNotMatch(
    css,
    /\.themeDark[^{}]*\{[^}]*--coffee-finished-summary-/,
  );
});

test("finished Coffee headings, body, metadata, links, dividers, and cards use summary tokens", () => {
  const cardRule = scopedRule(
    [
      ".themeLight.coffeeShell:has",
      '.coffeeStage[data-phase="finished"]',
      ".coffeeCenterMessage",
    ],
    "--coffee-finished-summary-surface",
  );
  assert.match(
    cardRule,
    /border:\s*1px solid var\(--coffee-finished-summary-divider\)/,
  );
  assert.match(
    cardRule,
    /background:\s*var\(--coffee-finished-summary-surface\)/,
  );
  assert.match(cardRule, /color:\s*var\(--coffee-finished-summary-ink\)/);

  const headingRule = scopedRule(
    [".coffeeCenterMessage > strong", ".coffeeTranscriptHeader .sectionLabel"],
    "--coffee-finished-summary-ink",
  );
  assert.match(headingRule, /color:\s*var\(--coffee-finished-summary-ink\)/);

  const bodyRule = scopedRule(
    [".coffeeCenterFeedLine", '.coffeeMessage[data-role="system"]'],
    "--coffee-finished-summary-ink",
  );
  assert.match(bodyRule, /color:\s*var\(--coffee-finished-summary-ink\)/);

  const metadataRule = scopedRule(
    [
      ".coffeeFinishedRecapCaption",
      ".coffeeCenterFeedLineFallback",
      ".coffeeTranscriptStatus",
      ".coffeeReplayPosition",
    ],
    "--coffee-finished-summary-muted-ink",
  );
  assert.match(
    metadataRule,
    /color:\s*var\(--coffee-finished-summary-muted-ink\)/,
  );

  const dividerRule = scopedRule(
    [
      ".coffeeCenterMessage",
      ".coffeeMessages",
      '.coffeeMessage[data-role="system"]',
      ".coffeeReplayComposerControls",
    ],
    "--coffee-finished-summary-divider",
  );
  assert.match(
    dividerRule,
    /border-color:\s*var\(--coffee-finished-summary-divider\)/,
  );

  const linkRule = scopedRule(
    [".coffeeCenterMessage", "a", ".botMentionChip", ".botMentionInlineColor"],
    "--coffee-finished-summary-link-ink",
  );
  assert.match(
    linkRule,
    /color:\s*var\(--coffee-finished-summary-link-ink\)/,
  );
});

test("finished Coffee buttons and loading controls stay readable in every state", () => {
  const primaryRule = scopedRule(
    [
      ".coffeeFinishedRecapControls .coffeeJoinSessionButton",
      ".coffeeFinishedRecapControls .coffeeTableStartButton",
      ".coffeeReplayPrimaryButton",
    ],
    "--coffee-finished-summary-button-surface",
  );
  assert.match(
    primaryRule,
    /background:\s*var\(--coffee-finished-summary-button-surface\)/,
  );
  assert.match(
    primaryRule,
    /color:\s*var\(--coffee-finished-summary-button-ink\)/,
  );

  const utilityRule = scopedRule(
    [
      ".coffeeReplayIconButton:not(.coffeeReplayPrimaryButton)",
      ".coffeeTranscriptHeaderActions .headerIconButton",
    ],
    "--coffee-finished-summary-surface-raised",
  );
  assert.match(
    utilityRule,
    /color:\s*var\(--coffee-finished-summary-ink\)/,
  );

  const focusRule = scopedRule(
    [
      ".coffeeFinishedRecapControls button",
      ".coffeeReplayComposerControls button",
      ":focus-visible",
    ],
    "--coffee-finished-summary-link-ink",
  );
  assert.match(
    focusRule,
    /outline:\s*2px solid var\(--coffee-finished-summary-link-ink\)/,
  );

  const disabledRule = scopedRule(
    [
      ".coffeeFinishedRecapControls button:disabled",
      ".coffeeReplayComposerControls button:disabled",
    ],
    "--coffee-finished-summary-disabled-surface",
  );
  assert.match(
    disabledRule,
    /color:\s*var\(--coffee-finished-summary-disabled-ink\)/,
  );
  assert.match(disabledRule, /opacity:\s*1/);

  const failedRule = scopedRule(
    [
      '.coffeeFinishedCopyButton[data-copy-state="failed"]',
      '.headerIconButton[data-copy-state="failed"]',
    ],
    "--coffee-finished-summary-error-surface",
  );
  assert.match(
    failedRule,
    /color:\s*var\(--coffee-finished-summary-error-ink\)/,
  );

  const loadingScrubberRule = scopedRule(
    [".coffeeReplayScrubber", "input:disabled"],
    "opacity: 1",
  );
  assert.match(loadingScrubberRule, /opacity:\s*1/);
});
