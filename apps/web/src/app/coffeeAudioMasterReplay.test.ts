import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(
  new URL("./replayClient.ts", import.meta.url),
  "utf8",
);
const rendererSource = readFileSync(
  new URL("./ReplayRenderCoordinator.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

test("Coffee finalizes one retained V2 audio master through the shared lifecycle", () => {
  assert.match(pageSource, /stopReplayAudioMasterCapture\(conversation\.id\)/u);
  assert.match(pageSource, /replayManifestV2IsValid\(provisionalManifest\)/u);
  assert.match(
    pageSource,
    /saveFaithfulReplaySession\(\{\s*surface: "coffee",\s*sourceId: conversation\.id,\s*manifest,\s*capture,/u,
  );
  assert.match(pageSource, /coffeeReplayCaptureBySessionRef/u);
  assert.match(pageSource, /startReplayRecordingDraft\(\{\s*surface: "coffee"/u);
  assert.match(clientSource, /retainPendingFaithfulReplayCapture\(\{/u);
  assert.match(clientSource, /uploadReplayFaithfulAudio\(\{/u);
  assert.match(clientSource, /finalizeReplayRecording\(\{/u);
  assert.match(clientSource, /retryPendingFaithfulReplaySessions/u);
  assert.ok(
    clientSource.indexOf("retainPendingFaithfulReplayCapture({") <
      clientSource.indexOf("const draft = await startReplayRecordingDraft"),
    "encoded bytes and direction are retained before the first network request",
  );
  assert.match(
    clientSource,
    /capture\.recordingId \?\?[\s\S]*startReplayRecordingDraft/u,
  );
});

test("Coffee uses authenticated master currentTime as the sole procedural replay clock", () => {
  assert.match(
    pageSource,
    /recording\.availability !== "faithful"[\s\S]*setCoffeeReplayUsesAudioMaster\(false\)/u,
  );
  assert.match(pageSource, /const audio = new Audio\(detail\.recording\.audioUrl\)/u);
  assert.match(pageSource, /runtime\.audio\.playbackRate = 1/u);
  assert.match(
    pageSource,
    /elapsedMs = Math\.min\([\s\S]*runtime\.audio\.currentTime \* 1_000/u,
  );
  assert.match(
    pageSource,
    /replaySceneAtV2\(runtime\.manifest, elapsedMs, runtime\.checkpoints\)/u,
  );
  assert.match(
    pageSource,
    /candidate\.sourceMessageId === message\?\.id[\s\S]*runtime\.offsetMs = beat\?\.startMs/u,
  );
});

test("Coffee faithful replay drives seated mouths and gaze from V2 speaking", () => {
  assert.match(
    pageSource,
    /coffeeActiveSeatBotIds\.find\(\(botId\): botId is string => \{[\s\S]{0,420}botId === "coffee-player"[\s\S]{0,420}participant\?\.speaking === true && participant\.audible !== false/u,
  );
  assert.match(pageSource, /setCoffeeReplaySpeakingBotId\(speakingBotId\)/u);
  assert.match(
    pageSource,
    /replayMessage\.botId[\s\S]{0,100}coffeeBotsById\.get\(replayMessage\.botId\)[\s\S]{0,220}replayMessage\.botName/u,
  );
  assert.match(
    pageSource,
    /const directedReplaySpeakingBot =[\s\S]{0,260}coffeeReplayPlaying[\s\S]{0,180}coffeeBotsById\.get\(coffeeReplaySpeakingBotId\)/u,
  );
  assert.match(
    pageSource,
    /const isTableTypingThisSeat =\s*!seatPowerMuted &&[\s\S]{0,420}!tableTypingAssistantIsSilent[\s\S]{0,160}replayAudioMasterSpeakingThisSeat/u,
  );
  assert.match(
    pageSource,
    /const replayMouthVisibleLength =[\s\S]{0,300}coffeeReplayAudioMasterElapsedMs \/\s*ZEN_LIVE_MOUTH_PHASE_MS/u,
  );
  assert.match(
    pageSource,
    /const tableStreamingSpeakerBotId =\s*tableTypingBot\?\.id \?\? null/u,
  );
});

test("master playback suppresses reconstructed voices, action SFX, and atmosphere", () => {
  assert.match(
    pageSource,
    /!coffeeReplayPlaying \|\|\s*coffeeReplayUsesAudioMaster \|\|\s*!coffeeConversation/u,
  );
  assert.match(
    pageSource,
    /!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\)[\s\S]*<SessionAtmosphereLayer|<SessionAtmosphereLayer[\s\S]*!\(coffeeReplayActive && coffeeReplayUsesAudioMaster\)/u,
  );
  assert.match(
    pageSource,
    /avatarSfx=\{\s*coffeeReplayUsesAudioMaster\s*\? null\s*:\s*botAvatarSfxForBot/u,
  );
  assert.match(
    pageSource,
    /avatarState\.sfxEnabled[\s\S]{0,120}botAvatarSfxForSignalMix/u,
  );
  assert.match(
    signalSource,
    /sfxEnabled:\s*!\(args\.replay && replayFaithful\) &&[\s\S]{0,220}signalAvatarSfxShouldPlay\(\{/u,
  );
  assert.match(
    signalSource,
    /replayAudioMaster: args\.replay && replayFaithful/u,
  );
  assert.doesNotMatch(pageSource, /prepareReplayAudio/u);
  assert.doesNotMatch(clientSource, /\/api\/voices\/synthesize/u);
  assert.doesNotMatch(rendererSource, /Worker|claimReplayRecording|renderClaimedReplay/u);
  assert.match(rendererSource, /return null;/u);
});

test("Signal and Coffee log thinking from committed presentation state", () => {
  assert.match(
    pageSource,
    /useLayoutEffect\(\(\) => \{[\s\S]*coffeeTurnRhythmState === "botThinking"[\s\S]*syncReplayThinkingPresentations/u,
  );
  assert.match(
    signalSource,
    /const livePresentedThinkingRole[\s\S]*useLayoutEffect\(\(\) => \{[\s\S]*syncReplayThinkingPresentations/u,
  );
  assert.doesNotMatch(
    pageSource,
    /job\.phase === "thinking"[\s\S]{0,500}markReplayDirectionEvent/u,
  );
});
