import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing ${start}`);
  const endIndex = pageSource.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `Missing ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

test("Coffee publishes the selected responder while player text is still delivering", () => {
  const jobLoop = sourceBetween(
    "const runCoffeeTurnJobOnce = async",
    "const runCoffeeTurnJob = async",
  );
  const thinkingStart = jobLoop.indexOf('if (job.phase === "thinking")');
  const thinkingEnd = jobLoop.indexOf('if (job.phase === "failed")', thinkingStart);
  assert.notEqual(thinkingStart, -1);
  assert.notEqual(thinkingEnd, -1);
  const thinkingBranch = jobLoop.slice(thinkingStart, thinkingEnd);

  assert.match(
    thinkingBranch,
    /if \(job\.speakerBotId\) \{\s*setCoffeePendingSpeakerBotId\(job\.speakerBotId\);\s*\}\s*if \(!presentationHeld\?\.\(\)\)/u,
  );
  assert.match(thinkingBranch, /setCoffeeTurnRhythmState\("botThinking"\)/u);
});

test("Coffee waits for the voice handoff before revealing a Premium line", () => {
  const queue = sourceBetween(
    "const queueCoffeeReveal = (args: CoffeePendingRevealQueueArgs) =>",
    "queueCoffeeRevealFnRef.current = queueCoffeeReveal;",
  );
  const beginSpeaking = sourceBetween(
    "const beginSpeaking = async (): Promise<number | null> =>",
    "const beginSpeakingAndScheduleReveal = () =>",
  );

  assert.match(
    beginSpeaking,
    /const voiceDurationMs = await startCoffeeVoiceForReveal\(/u,
  );
  assert.match(
    beginSpeaking,
    /setCoffeeTurnRhythmState\("tableTyping"\)/u,
  );
  assert.ok(
    beginSpeaking.indexOf("await startCoffeeVoiceForReveal") <
      beginSpeaking.indexOf('setCoffeeTurnRhythmState("tableTyping")'),
  );
  assert.match(
    queue,
    /coffeeVoiceRevealFallbackDelayMs\(durationMs, voiced\)/u,
  );
});

test("cancelled or failed Premium preparation settles the same Coffee handoff", () => {
  const voice = sourceBetween(
    "const startCoffeeVoiceForReveal = async",
    "const startCoffeePlayerVoiceForReveal = async",
  );
  const queue = sourceBetween(
    "const queueCoffeeReveal = (args: CoffeePendingRevealQueueArgs) =>",
    "queueCoffeeRevealFnRef.current = queueCoffeeReveal;",
  );

  assert.match(
    voice,
    /controller\.abort\(\);\s*releaseCoffeeVoicePlayback\(\);[\s\S]{0,640}settle\(null\);/u,
  );
  assert.match(
    voice,
    /catch \(error\) \{\s*releaseCoffeeVoicePlayback\(\);[\s\S]{0,640}settle\(null\);/u,
  );
  assert.match(
    queue,
    /if \(durationMs === null\) \{\s*releaseStalledHandoff\(\);\s*return;/u,
  );
});

test("ordinary Coffee completion preserves audio tails while interruption stays explicit", () => {
  const queue = sourceBetween(
    "const queueCoffeeReveal = (args: CoffeePendingRevealQueueArgs) =>",
    "queueCoffeeRevealFnRef.current = queueCoffeeReveal;",
  );
  const applyStart = queue.indexOf("const applyReveal = () =>");
  const applyEnd = queue.indexOf("clearCoffeeRhythmTimers();", applyStart);
  assert.notEqual(applyStart, -1);
  assert.notEqual(applyEnd, -1);
  const applyReveal = queue.slice(applyStart, applyEnd);
  const interruption = sourceBetween(
    "const captureCoffeePlayerInterruption = (",
    "const sendCoffeeTurn = async",
  );

  assert.match(
    applyReveal,
    /handoffVoicePlaybackPreservingPreparedMode\(\s*voicePlaybackSelectionRef\.current\.voiceMode,\s*\)/u,
  );
  assert.doesNotMatch(applyReveal, /stop(?:Bottish|English)Voice\(\)/u);
  assert.match(interruption, /stopBottishVoice\(\);\s*stopEnglishVoice\(\);/u);
});
