import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("completed Coffee sessions enter read-only review before replay starts", () => {
  assert.match(
    pageSource,
    /const coffeeFinishedControlsVisible =\s*coffeeChromePolicy\.reviewActive && coffeeReplayActive;/,
  );
  assert.match(
    pageSource,
    /const toggleCoffeeReplayPlayback = \(\) => \{[\s\S]*?startCoffeeReplay\(\);[\s\S]*?if \(coffeeReplayUsesAudioMaster\) \{[\s\S]*?stopCoffeeReplayAudioMaster\(\{ preserveOffset: true \}\);[\s\S]*?playCoffeeReplayAudioMaster\(\);[\s\S]*?setCoffeeReplayPlaying\(false\);/,
  );
  assert.match(pageSource, /onClick=\{toggleCoffeeReplayPlayback\}/);
  assert.match(
    pageSource,
    /coffeeGroupStartComposerVisible\s*\?\s*renderCoffeeGroupStartComposer\(\)\s*:\s*coffeeChromePolicy\.reviewActive\s*\?\s*null\s*:\s*renderShellComposer/,
  );
  assert.match(
    pageSource,
    /data-session-active=\{coffeeSessionSurfaceActive \? "true" : undefined\}/,
  );
  assert.doesNotMatch(
    pageSource,
    /Replay mode — watching this session back\./,
  );
});

test("completed Coffee review keeps the table clear behind a Signal-like header", () => {
  assert.doesNotMatch(pageSource, /<ReplayRecordingPanel\s+surface="coffee"/u);
  assert.match(
    pageSource,
    /className=\{`\$\{styles\.coffeeStageHeader\} \$\{styles\.coffeeReviewHeader\}`\}/,
  );
  assert.doesNotMatch(pageSource, /Open Coffee Session video/u);
  assert.doesNotMatch(pageSource, /onRebuildVideo/u);
  assert.match(cssSource, /\.coffeeReviewHeader\s*\{/);
});

test("Coffee review copies transcripts instead of exporting transcript files", () => {
  assert.doesNotMatch(pageSource, /exportCoffeeSession/u);
  assert.doesNotMatch(pageSource, /Download Session/u);
  assert.match(
    pageSource,
    /coffeeReplayUtilityControls[\s\S]{0,1000}copyCoffeeTranscriptToClipboard/u,
  );
  assert.match(pageSource, /data-copy-state=/u);
});

test("replay keeps the player off camera while retaining a pot-motion anchor", () => {
  assert.match(
    pageSource,
    /coffeeReplayActive \? \(\s*<span\s+ref=\{coffeeReplayPotDockRef\}\s+className=\{styles\.coffeeReplayOffCameraPotDock\}/u,
  );
  assert.doesNotMatch(pageSource, /coffeeBarScene|coffeeWaiterVisit/u);
  assert.doesNotMatch(
    pageSource,
    /className=\{styles\.coffeeReplayPlayerSeat\}/u,
  );
});

test("review stops live audio and cannot start replay while the closing wrap is settling", () => {
  assert.match(
    pageSource,
    /const openCoffeeSession = async \(conversationId: string\) => \{[\s\S]*?stopAudioForStateExit\(\);[\s\S]*?\/api\/conversations\//,
  );
  assert.match(
    pageSource,
    /const startCoffeeReplay = \(\) => \{[\s\S]*?coffeeReviewPreparingSessionId === coffeeConversation\.id[\s\S]*?return;/,
  );
  assert.match(pageSource, /"Wrapping…"/);
  assert.match(
    pageSource,
    /coffeeSynopsisRequestIdsRef\.current\.delete\(response\.conversation\.id\);\s*setCoffeeReviewPreparingSessionId\(response\.conversation\.id\);/,
  );
  assert.match(
    pageSource,
    /const hasSynopsis = coffeeConversationHasSessionSynopsis\(\s*coffeeConversation,\s*\);\s*if \(coffeeSessionModelDisabled && !hasSynopsis\)/,
  );
});

test("leaving Coffee returns immediately while the epilogue continues in the background", () => {
  assert.match(
    pageSource,
    /const recordCoffeePlayerDepartureOnExit = \([\s\S]*?void api\([\s\S]*?keepalive: true/,
  );
  assert.match(
    pageSource,
    /recordCoffeePlayerDepartureOnExit\(conversation, coffeeSessionPhase\);[\s\S]*?setCoffeeConversation\(null\);[\s\S]*?setCoffeeSessionPhase\("selecting"\)/,
  );
});

test("review restores departed seats and animates each recorded bot walk-out", () => {
  assert.match(pageSource, /restoreCoffeeReviewSeatBotIds\(/);
  assert.match(pageSource, /replayState\?\.departedBotIds\.has\(entry\.botId\)/);
  assert.match(pageSource, /data-replay-departing=/);
  assert.match(
    cssSource,
    /\.coffeeSeat\[data-replay-departing="true"\][\s\S]*?animation: coffeeSeatWalkAway 2600ms/,
  );
});
