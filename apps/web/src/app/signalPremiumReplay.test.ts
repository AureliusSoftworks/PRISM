import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const signal = readFileSync(new URL("BotcastExperience.tsx", import.meta.url), "utf8");
const replayAudio = readFileSync(new URL("replayAudio.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("ReplayRecordingPanel.tsx", import.meta.url), "utf8");
const renderChild = readFileSync(
  new URL("../../../api/src/replay-render-child.ts", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("Signal local replay and video export contracts", () => {
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

  it("exports captured audio without a provider call and keeps Premium separate", () => {
    assert.match(panel, /Export video/u);
    assert.match(panel, /captured audio and makes no new voice call/u);
    assert.match(panel, /Export Premium video/u);
    assert.match(signal, /onExportVideo=\{async \(\) => \{/u);
    assert.match(signal, /await prepareSignalVideo\(replayEpisode, selectedShow\)/u);
    assert.match(signal, /encodeReplayRenderAudio/u);
    assert.match(renderChild, /page\.screencast\.start/u);
  });

  it("keeps local replay controls independent while background export runs", () => {
    const handlerStart = signal.indexOf(
      "onExportPremium={async (regenerate) => {",
    );
    assert.notEqual(handlerStart, -1);
    const handler = signal.slice(handlerStart, handlerStart + 1_200);
    assert.match(handler, /await prepareSignalPremiumVideo\(/u);
    assert.doesNotMatch(handler, /stopReplayPlayback|setReplayRenderTarget/u);
    const standardStart = signal.indexOf("onExportVideo={async () => {");
    const standardHandler = signal.slice(standardStart, standardStart + 400);
    assert.doesNotMatch(standardHandler, /stopReplayPlayback|setReplayRenderTarget/u);
    assert.match(signal, /separate background renderer/u);
    assert.match(panel, /selected voice IDs will be sent to ElevenLabs/u);
  });

  it("resumes video work from the cached mixed master and Premium timeline", () => {
    assert.match(replayAudio, /recording\.premiumProduction\?\.audioUrl/u);
    assert.match(replayAudio, /recording\.premiumProduction\.timeline/u);
    assert.match(signal, /storeReplayPremiumTimeline/u);
    assert.match(signal, /!detail\.recording\.premiumProduction\.timeline/u);
  });
});
