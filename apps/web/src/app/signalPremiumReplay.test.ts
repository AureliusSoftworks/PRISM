import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signal = readFileSync(
  new URL("BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const replayAudio = readFileSync(
  new URL("replayAudio.ts", import.meta.url),
  "utf8",
);
const panel = readFileSync(
  new URL("ReplayRecordingPanel.tsx", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const recordings = readFileSync(
  new URL("../../../api/src/replay-recordings.ts", import.meta.url),
  "utf8",
);
const audioMaster = readFileSync(
  new URL("signalAudioMasterCapture.ts", import.meta.url),
  "utf8",
);

describe("Signal faithful replay and enhanced audio contracts", () => {
  it("captures the flattened live output and uses reconstruction only as fallback", () => {
    assert.match(signal, /queueReplayManifest\(manifest, \{ render: false \}\)/u);
    assert.match(signal, /setReplayEpisode\(detail\)/u);
    assert.match(signal, /includeProductionAssets: true/u);
    assert.match(signal, /data-local-replay="true"/u);
    assert.match(signal, /startSignalAudioMasterCapture\(opening\.episode\.id\)/u);
    assert.match(signal, /uploadReplayFaithfulAudio/u);
    assert.match(audioMaster, /new MediaRecorder/u);
    assert.match(audioMaster, /createMediaStreamDestination/u);
    assert.match(audioMaster, /route\.output\.connect\(destination\)/u);
    assert.match(replayAudio, /recording\.audioUrl/u);
    assert.match(replayAudio, /event\.kind !== "audio_cue"/u);
    assert.match(replayAudio, /SESSION_FOLEY_URLS\.coffeeSip/u);
    assert.match(replayAudio, /SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE/u);
    assert.match(replayAudio, /signalSoundboardPlaybackPlan/u);
    assert.match(replayAudio, /resolvePreSpeechBreathPlan/u);
    assert.match(replayAudio, /playWhileThinking/u);
    assert.match(replayAudio, /SIGNAL_STUDIO_FOLEY_ROOM_SEND/u);
    assert.match(replayAudio, /event\.payload\.gain/u);
    assert.match(replayAudio, /event\.payload\.variantIndex/u);
    assert.match(signal, /renderReplayBookend/u);
    assert.match(signal, /Signal presents/u);
  });

  it("forces missing faithful replay speech through the built-in engine", () => {
    assert.match(replayAudio, /engine: "builtin"/u);
    assert.match(replayAudio, /explicitOnlineContext: false/u);
    assert.match(
      replayAudio,
      /captured voice was missing; local speech fallback used/u,
    );
  });

  it("requires visible credit confirmation and blocks hard LOCAL on both sides", () => {
    assert.match(
      panel,
      /exact spoken transcript and selected voice IDs will be sent to ElevenLabs and may consume credits/u,
    );
    assert.match(panel, /blocksOnlineCapabilities/u);
    assert.match(panel, /Switch to AUTO or ONLINE to enhance/u);
    assert.match(server, /body\.confirm !== "send-to-elevenlabs"/u);
    assert.match(server, /userBlocksOnlineCapabilities\(user\)/u);
  });

  it("offers audio enhancement without exposing Signal video export", () => {
    assert.match(panel, /Enhance recording/u);
    assert.match(panel, /Download faithful audio/u);
    assert.match(panel, /Download enhanced audio/u);
    assert.match(panel, /faithful recording will remain unchanged/iu);
    assert.doesNotMatch(panel, /Export Premium video|Export video/u);
    assert.match(signal, /onEnhanceAudio=\{async \(regenerate\) => \{/u);
    assert.match(signal, /await prepareSignalEnhancedAudio\(/u);
    assert.match(signal, /uploadReplayPremiumAudio/u);
    assert.match(signal, /storeReplayPremiumTimeline/u);
    assert.match(
      replayAudio,
      /primaryTakeByMessageId\.get\(timing\.sourceMessageId\)[\s\S]{0,900}take\?\.snapshot\.gain[\s\S]{0,900}take\?\.snapshot\.stereoPan/u,
    );
  });

  it("marks enhanced audio ready after its mixed audio and timeline are stored", () => {
    assert.match(
      recordings,
      /SET timeline_json = \?, phase = \?, progress = \?/u,
    );
    assert.match(recordings, /ready \? "ready" : "mixing_episode"/u);
    assert.match(recordings, /status = 'queued' AND surface = 'coffee'/u);
    assert.doesNotMatch(
      server.slice(
        server.indexOf('route("POST", "/api/replays/:id/premium"'),
        server.indexOf('route("POST", "/api/replays/:id/premium/retry"'),
      ),
      /wakeReplayBackgroundRender/u,
    );
  });
});
