import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

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

test("review renders Default Prism in a reserved bottom table seat", () => {
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
  assert.match(pageSource, /name=\{zenDefaultPrismGlyph\}/);
});
