import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

test("completed Coffee sessions enter read-only review before replay starts", () => {
  assert.match(
    pageSource,
    /const coffeeFinishedControlsVisible = shellPolicy\.reviewActive;/,
  );
  assert.match(
    pageSource,
    /const toggleCoffeeReplayPlayback = \(\) => \{[\s\S]*?startCoffeeReplay\(\);[\s\S]*?setCoffeeReplayPlaying\(\(playing\) => !playing\);/,
  );
  assert.match(pageSource, /onClick=\{toggleCoffeeReplayPlayback\}/);
  assert.match(
    pageSource,
    /coffeeGroupStartComposerVisible\s*\?\s*renderCoffeeGroupStartComposer\(\)\s*:\s*shellPolicy\.reviewActive\s*\?\s*null\s*:\s*renderShellComposer/,
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

test("replay renders Default Prism in a reserved bottom table seat", () => {
  assert.match(
    pageSource,
    /\{coffeeReplayActive && \(replayState\?\.playerPresent \?\? true\) \? \(\s*<div\s*className=\{styles\.coffeeReplayPlayerSeat\}/,
  );
  assert.match(pageSource, /className=\{styles\.coffeeReplayPlayerSeat\}/);
  assert.match(pageSource, /glyph=\{zenDefaultPrismGlyph\}/);
  assert.match(pageSource, /faceStyle=\{zenDefaultPrismFaceStyle\}/);
  assert.match(
    pageSource,
    /showThinkingSpinner=\{coffeeReplayPlayerThinking\}/,
  );
  assert.match(pageSource, /isTalking=\{replayPlayerTalking\}/);
  assert.match(pageSource, /mouthShape=\{replayPlayerMouthShape\}/);
  assert.match(pageSource, /className=\{styles\.coffeeReplayPlayerNameplate\}/);
  assert.match(pageSource, /className=\{styles\.coffeeReplayPlayerPot\}/);
  assert.match(pageSource, /className=\{styles\.coffeeReplayPlayerName\}/);
  assert.match(pageSource, /className=\{styles\.coffeeReplayPlayerGlyph\}/);
  assert.match(pageSource, /\{coffeePlayerLabel\}/);
  assert.match(
    pageSource,
    /className=\{styles\.coffeeReplayPlayerGlyph\}[\s\S]{0,180}<BotGlyph\s+name=\{zenDefaultPrismGlyph\}/,
  );
  assert.match(pageSource, /data-player-departing=/);
  assert.match(
    cssSource,
    /\.coffeeReplayPlayerSeat\[data-player-departing="true"\][\s\S]*?animation: coffeeReplayPlayerWalkAway/,
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
  assert.match(pageSource, /"Wrapping table\.\.\."/);
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
