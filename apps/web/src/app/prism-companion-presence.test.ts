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
const debate = source("./DebateExperience.tsx");
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

test("suppresses the global companion while Creation renders its own live Prism", () => {
  assert.match(orb, /data-prism-orb="true"/u);
  assert.match(orb, /aria-hidden="true"/u);
  assert.match(companion, /<PrismOrb aura=\{false\}/u);
  assert.match(ritual, /<PrismOrb aura size="100%"/u);
  assert.match(ritual, /className=\{styles\.prismRadialLight\}/u);
  assert.match(companion, /publishPrismCompanionVisualSnapshot/u);
  assert.match(ritual, /data-prism-anchor="authored"/u);
  assert.doesNotMatch(ritual, /pointermove/u);
});

test("keeps Foundry brief fields Wieldable, then suppresses the assistant during generation", () => {
  assert.match(
    page,
    /\{botGeneratorBusy \? \(\s*<PrismCompanionPresenceBoundary reason="bot-creation" \/>\s*\) : null\}/u,
  );
  assert.match(page, /id="bot-generator-prompt"/u);
  assert.doesNotMatch(
    page,
    /<textarea[\s\S]{0,500}data-prism-refract-ignore/u,
  );
});

test("suppresses the floating assistant throughout full-screen loading", () => {
  assert.match(page, /reason="view-switch-loading"/u);
  assert.match(page, /reason="story-loading"/u);
  assert.match(warmup, /reason=\{`\$\{props\.experience\}-model-warmup`\}/u);
  assert.match(blocking, /reason="blocking-loader"/u);
  assert.match(slate, /reason="slate-loading"/u);
});

test("submerges passive Prism chrome while keeping panel fields Wieldable", () => {
  assert.match(
    presence,
    /function prismCompanionDisabledByMainPanel\([\s\S]*return panel !== null \|\| avatarStudioOpen;/u,
  );
  assert.match(
    page,
    /const companionSubmergedByMainPanel =\s*prismCompanionDisabledByMainPanel\(panel, botAvatarCustomizerOpen\)/u,
  );
  assert.match(page, /submerged=\{companionSubmergedByMainPanel\}/u);
  assert.match(companion, /data-submerged=\{submerged \? "true" : undefined\}/u);
  assert.match(
    companion,
    /if \(companionSuppressed \|\| sessionNoteContext\) return;\s*return installPrismUniversalInputTargets/u,
  );
});

test("turns the floating assistant into a session-note plus during live Signal, Coffee, and Debate sessions", () => {
  assert.match(
    signal,
    /const liveSessionActive =\s*showLiveExit \|\|[\s\S]{0,160}episode\?\.status === "cancelled"/u,
  );
  assert.match(
    signal,
    /liveSessionActive \? \([\s\S]{0,220}<PrismCompanionSessionNoteBoundary[\s\S]{0,180}surface="signal"/u,
  );
  assert.match(
    page,
    /const coffeeLiveSessionActive =\s*coffeeSessionJoined && !coffeeReplayActive/u,
  );
  assert.match(
    page,
    /coffeeLiveSessionActive \? \([\s\S]{0,220}<PrismCompanionSessionNoteBoundary[\s\S]{0,180}surface="coffee"/u,
  );
  assert.match(
    debate,
    /liveSessionActive && activeSession \? \([\s\S]{0,220}<PrismCompanionSessionNoteBoundary[\s\S]{0,180}surface="debate"/u,
  );
  assert.match(
    page,
    /storySession\?\.status === "playing" \? \([\s\S]{0,220}<PrismCompanionSessionNoteBoundary[\s\S]{0,180}surface="story"/u,
  );
  assert.match(presence, /PrismCompanionSessionNoteBoundary/u);
  assert.match(companion, /getPrismCompanionSessionNoteSnapshot/u);
  assert.match(companion, /data-session-note="true"/u);
  assert.match(
    companion,
    /const onKeyDown = \(event: KeyboardEvent\): void => \{\s*if \(companionSuppressed\) return;/u,
  );
  assert.match(
    companion,
    /\[\s*acceptPrismRefract,\s*companionSuppressed,\s*keyboardShortcut,\s*activatePrismConversation,/u,
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
