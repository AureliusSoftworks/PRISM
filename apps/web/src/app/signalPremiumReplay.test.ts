import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signal = readFileSync(new URL("BotcastExperience.tsx", import.meta.url), "utf8");
const replayAudio = readFileSync(new URL("replayAudio.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("ReplayRecordingPanel.tsx", import.meta.url), "utf8");
const renderer = readFileSync(
  new URL("ReplayRenderCoordinator.tsx", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Signal local replay and Premium production contracts", () => {
  it("archives without rendering and opens the local replay immediately", () => {
    assert.match(signal, /queueReplayManifest\(manifest, \{ render: false \}\)/u);
    assert.match(signal, /setReplayEpisode\(detail\)/u);
    assert.match(signal, /includeProductionAssets: false/u);
    assert.match(signal, /data-local-replay="true"/u);
    assert.doesNotMatch(
      signal,
      /!signalReplayRecordingHasVideo\(existingRecording\)[\s\S]{0,240}prepareSignal/u,
    );
  });

  it("forces every missing local replay take through built-in speech", () => {
    assert.match(replayAudio, /engine: "builtin"/u);
    assert.match(replayAudio, /explicitOnlineContext: false/u);
    assert.match(replayAudio, /captured voice was missing; local speech fallback used/u);
  });

  it("requires visible credit confirmation and blocks LOCAL on both sides", () => {
    assert.match(panel, /selected voice IDs will be sent to ElevenLabs and may consume credits/u);
    assert.match(panel, /preferredProvider === "local"/u);
    assert.match(server, /body\.confirm !== "send-to-elevenlabs"/u);
    assert.match(server, /user\.preferred_provider === "local"/u);
  });

  it("pauses local playback coherently before Premium mastering and rendering", () => {
    const handlerStart = signal.indexOf(
      "onProducePremium={async (regenerate) => {",
    );
    assert.notEqual(handlerStart, -1);
    const handler = signal.slice(handlerStart, handlerStart + 1_200);
    const stopIndexes = Array.from(handler.matchAll(/stopReplayPlayback\(\);/gu)).map(
      (match) => match.index,
    );
    const preparationIndex = handler.indexOf("await prepareSignalPremiumVideo(");
    assert.equal(stopIndexes.length, 2);
    assert.ok((stopIndexes[0] ?? Number.MAX_SAFE_INTEGER) < preparationIndex);
    assert.ok((stopIndexes[1] ?? -1) > preparationIndex);
    assert.match(signal, /setReplayPlaying\(false\);\s*setReplayVoicePending\(false\);\s*setReplaySpeechActive\(false\);/u);
    assert.match(signal, /disabled=\{Boolean\(replayRenderTarget\)\}/u);
    assert.match(panel, /Starting Premium production…/u);
    assert.match(panel, /Local replay is paused at its current position/u);
  });

  it("resumes video work from the cached mixed master and Premium timeline", () => {
    assert.match(replayAudio, /recording\.premiumProduction\?\.audioUrl/u);
    assert.match(replayAudio, /recording\.premiumProduction\.timeline/u);
    assert.match(renderer, /storeReplayPremiumTimeline/u);
    assert.match(renderer, /!recording\.premiumProduction\.timeline/u);
  });
});
