import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

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
    /coffeeSelectedGroup !== null\s*\?\s*null\s*:\s*coffeeChromePolicy\.reviewActive\s*\?\s*null\s*:/,
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

test("Coffee review copies and downloads the same canonical public transcript", () => {
  assert.doesNotMatch(pageSource, /exportCoffeeSession/u);
  assert.doesNotMatch(pageSource, /Download Session/u);
  assert.match(
    pageSource,
    /coffeeReplayUtilityControls[\s\S]{0,1000}copyCoffeeTranscriptToClipboard/u,
  );
  assert.match(
    pageSource,
    /loadSessionReviewRecordingEvidence\("coffee", coffeeConversation\.id\)/u,
  );
  assert.match(pageSource, /formatCoffeeReviewClipboardText\(\{[\s\S]*recordingEvidence,/u);
  assert.match(
    pageSource,
    /const publicTranscript = projectCoffeePublicTranscript\(\{/u,
  );
  assert.match(pageSource, /publicTranscript\.visibleRows\.length/u);
  assert.match(
    pageSource,
    /const downloadCoffeeReplayTranscriptWithNote = async \(\)[\s\S]{0,700}coffeeTranscriptText\("standard"\)/u,
  );
  assert.doesNotMatch(
    pageSource,
    /downloadCoffeeReplayTranscriptWithNote = async[\s\S]{0,700}fetch\(transcriptMarkdownUrl/u,
  );
  assert.match(pageSource, /data-copy-state=/u);
});

test("previous Coffee sessions copy a verbose review transcript beside Delete", () => {
  assert.match(
    pageSource,
    /const copyPreviousCoffeeSessionVerboseTranscript = async \([\s\S]{0,1200}\/export`[\s\S]{0,240}JSON\.stringify\(\{ format: "developer" \}\)[\s\S]{0,500}writeClipboardText\(exported\.markdown\)/u,
  );
  assert.match(
    pageSource,
    /className=\{styles\.coffeeGroupSessionCopyButton\}[\s\S]{0,1200}copyPreviousCoffeeSessionVerboseTranscript\([\s\S]{0,600}className=\{styles\.coffeeGroupSessionDeleteButton\}/u,
  );
  assert.match(
    pageSource,
    /Copy verbose transcript for \$\{sessionLabel\} Coffee Review/u,
  );
  assert.match(cssSource, /\.coffeeGroupSessionCopyButton \{\s*right: 28px;/u);
  assert.match(
    tutorialSource,
    /heading: "Review previous tables"[\s\S]{0,500}clipboard button beside Delete[\s\S]{0,300}coffee-recent-sessions/u,
  );
});

test("replay seats Default Prism with the pot as the motion anchor", () => {
  assert.match(
    pageSource,
    /coffeeReplayActive && \(replayState\?\.playerPresent \?\? true\)[\s\S]*?className=\{styles\.coffeeReplayPlayerSeat\}/u,
  );
  assert.match(
    pageSource,
    /ref=\{coffeeReplayPotDockRef\}[\s\S]*?className=\{styles\.coffeeReplayPlayerPot\}/u,
  );
  assert.doesNotMatch(pageSource, /coffeeBarScene|coffeeWaiterVisit/u);
  assert.doesNotMatch(pageSource, /coffeeReplayOffCameraPotDock/u);
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
    /const hasSynopsis =\s*coffeeConversationHasSessionSynopsis\(coffeeConversation\);\s*if \(coffeeSessionModelDisabled && !hasSynopsis\)/,
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

test("finished Coffee review offers Coffee home back to setup", () => {
  assert.match(
    pageSource,
    /onClick=\{\(\) => void exitCoffeeSessionToSelectedView\(\)\}[\s\S]{0,160}data-tutorial-target="coffee-review-home"[\s\S]{0,120}Coffee home/,
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
