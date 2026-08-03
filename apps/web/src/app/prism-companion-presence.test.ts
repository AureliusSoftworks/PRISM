import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

const page = source("./page.tsx");
const companion = source("./PrismCompanion.tsx");
const presence = source("./prismCompanionPresence.tsx");
const orb = source("./PrismOrb.tsx");
const ritual = source("./BotCreationRitual.tsx");
const warmup = source("./ModelWarmupIntermission.tsx");
const blocking = source("./PrismBlockingLoader.tsx");
const signal = source("./BotcastExperience.tsx");
const slate = source("./SlateWorkspace.tsx");

test("uses one reference-counted focus boundary for overlapping surfaces", () => {
  assert.match(
    presence,
    /const suppressionCounts = new Map<string, number>\(\)/u,
  );
  assert.match(presence, /suppressionCounts\.get\(reason\) \?\? 0/u);
  assert.match(presence, /useLayoutEffect\(/u);
  assert.match(companion, /subscribePrismCompanionSuppression/u);
  assert.match(companion, /if \(!companionSuppressed\) return/u);
});

test("shares one non-interactive orb visual between the companion and focus screens", () => {
  assert.match(orb, /data-prism-orb="true"/u);
  assert.match(orb, /aria-hidden="true"/u);
  assert.match(companion, /<PrismOrb aura=\{false\}/u);
  assert.match(ritual, /<PrismOrb aura=\{false\} className=\{styles\.prismOrb\}/u);
  assert.match(companion, /publishPrismCompanionVisualSnapshot/u);
  assert.match(ritual, /data-companion-origin=/u);
});

test("suppresses the floating assistant throughout bot creation and full-screen loading", () => {
  assert.match(page, /reason="bot-creation"/u);
  assert.match(page, /reason="view-switch-loading"/u);
  assert.match(page, /reason="story-loading"/u);
  assert.match(warmup, /reason=\{`\$\{props\.experience\}-model-warmup`\}/u);
  assert.match(blocking, /reason="blocking-loader"/u);
  assert.match(slate, /reason="slate-loading"/u);
});

test("suppresses the floating assistant only during live Signal, Coffee, and Debate sessions", () => {
  assert.match(
    signal,
    /const liveSessionActive =\s*showLiveExit \|\|[\s\S]{0,160}episode\?\.status === "cancelled"/u,
  );
  assert.match(
    signal,
    /liveSessionActive \? \(\s*<PrismCompanionPresenceBoundary reason="signal-live-session" \/>/u,
  );
  assert.match(
    page,
    /const coffeeLiveSessionActive =\s*coffeeSessionJoined && !coffeeReplayActive/u,
  );
  assert.match(
    page,
    /coffeeLiveSessionActive \? \(\s*<PrismCompanionPresenceBoundary reason="coffee-live-session" \/>/u,
  );
  assert.match(
    page,
    /debateLiveSessionActive \|\| debateCompanionContext === null \? \(\s*<PrismCompanionPresenceBoundary reason="debate-live-session" \/>[\s\S]{0,180}\{renderGlobalPrismCompanion\(\)\}/u,
  );
  assert.match(
    companion,
    /const onKeyDown = \(event: KeyboardEvent\): void => \{\s*if \(companionSuppressed\) return;/u,
  );
  assert.match(
    companion,
    /\[[\s\S]{0,180}companionSuppressed,[\s\S]{0,180}openAndFocus,[\s\S]{0,180}\]/u,
  );
  assert.match(
    companion,
    /if \(typeof document === "undefined" \|\| companionSuppressed\) return null/u,
  );
  assert.match(
    companion,
    /if \(!companionSuppressed\) return;\s*setOpen\(false\);[\s\S]*cancelSpeech\(true\)/u,
  );
});
