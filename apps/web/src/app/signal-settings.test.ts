import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const settingsPanelSource = readFileSync(
  new URL("./SettingsPanel.tsx", import.meta.url),
  "utf8",
);
const tutorialsSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("Signal presents immersive voice performance as automatic", () => {
  assert.match(settingsPanelSource, /\| "botcast"/u);
  assert.match(
    settingsPanelSource,
    /scope: "botcast", title: "Signal", icon: <Radio/u,
  );
  assert.match(pageSource, /activeSettingsScope === "botcast"/u);
  assert.match(pageSource, /data-settings-section="botcast"/u);
  assert.match(pageSource, /Automatic ElevenLabs immersion/u);
  assert.match(pageSource, /float above the bot/u);
  assert.match(pageSource, /appear between/u);
  assert.doesNotMatch(pageSource, /settings\.signalImmersiveVoiceEffectsEnabled/u);
  assert.doesNotMatch(pageSource, /Save Signal settings/u);
  assert.match(pageSource, /activeSettingsScope !== "botcast"/u);
});

test("Signal navbar opens its contextual settings and preserves the tutorial", () => {
  assert.match(
    pageSource,
    /view === "botcast"[\s\S]{0,80}\? "botcast"/u,
  );
  assert.match(pageSource, /resetSingleModeTutorial\("botcast"\)/u);
  assert.match(
    tutorialsSource,
    /Eligible ElevenLabs voices automatically receive sparse, saved vocal reactions/u,
  );
  assert.match(
    tutorialsSource,
    /The direct stereo mix follows the host and guest’s saved stage positions subtly while their room reflections remain shared/u,
  );
});

test("Signal keeps provider tags scoped while local actions use structured streaming", () => {
  assert.match(
    pageSource,
    /signalOnlineVoiceEnabled && strippedElevenLabsText[\s\S]{0,180}elevenLabsText: strippedElevenLabsText/u,
  );
  assert.match(pageSource, /signalMessageId: message\.id/u);
  assert.match(pageSource, /text: voiceSpokenText\(message\.content\)/u);
  assert.match(pageSource, /const rawPerformanceText =[\s\S]{0,80}message\.voicePerformanceText \?\? message\.content/u);
  assert.match(pageSource, /const performanceText = botPowerIsBreathlessV1/u);
  assert.match(
    pageSource,
    /const useLocalPerformanceStream =[\s\S]{0,260}segment\.kind === "vocal-action"/u,
  );
  assert.match(pageSource, /performanceText,/u);
  assert.match(pageSource, /includeAlignment: premiumAlignmentRequested/u);
  assert.match(pageSource, /streamChunks: true/u);
  assert.match(
    pageSource,
    /englishVoiceResponseSupportsChunkedStreaming\(response\)[\s\S]{0,300}kind: "stream"/u,
  );
  assert.match(
    pageSource,
    /onSegmentTiming: \(timing\) => \{[\s\S]{0,280}segmentTimings: replaySegmentTimings/u,
  );
  assert.match(
    pageSource,
    /signalOnlineVoiceEnabled[\s\S]{0,260}selectedEngine/u,
  );
  assert.match(pageSource, /voiceSelection\.englishVoiceEngine/u);
  assert.doesNotMatch(
    pageSource,
    /effectiveProvider === "local"[\s\S]{0,100}settings\.englishVoiceEngine/u,
  );
});

test("Signal procedural voices use the same stage-direction-free spoken text", () => {
  assert.match(
    pageSource,
    /const spokenText = voiceSpokenText\(message\.content\);[\s\S]*?enqueueRobotVoiceMode\(\{[\s\S]*?source: \{ text: spokenText \},\s*sourceText: spokenText/u,
  );
  assert.match(
    pageSource,
    /proceduralTiming: signalRobotVoiceCadenceTiming\(spokenText\)/u,
  );
});
