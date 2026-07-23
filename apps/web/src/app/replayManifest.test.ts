import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { BotcastEpisode, BotcastShow } from "@localai/shared";
import {
  buildCoffeeReplayManifestV1,
  buildSignalReplayManifestV1,
} from "./replayManifest.ts";

describe("replay manifests", () => {
  it("turns Coffee into a third-person table with Prism as the player", () => {
    const manifest = buildCoffeeReplayManifestV1({
      conversation: {
        id: "coffee-1",
        title: "Late table",
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:05:00.000Z",
        botGroupIds: ["bot-1"],
        coffeeSeatBotIds: ["bot-1"],
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "I lean into the light.",
            createdAt: "2026-07-21T00:00:01.000Z",
          },
          {
            id: "bot-line-1",
            role: "assistant",
            botId: "bot-1",
            botName: "Aster",
            content: "Then the room changes with you.",
            createdAt: "2026-07-21T00:00:02.000Z",
            provider: "local",
          },
        ],
      },
      bots: [{ id: "bot-1", name: "Aster", color: "#8844ff", glyph: "✦" }],
      playerName: "Jared",
      prismColor: "#55ddff",
      prismGlyph: "△",
      theme: "dark",
    });
    assert.equal(manifest.surface, "coffee");
    assert.equal(manifest.visual.metadata?.playerPerspective, "third-person-prism");
    assert.equal(
      manifest.participants.find((participant) => participant.id === "prism-player")?.kind,
      "prism",
    );
    assert.equal(manifest.utterances[0]?.speakerId, "prism-player");
  });

  it("keeps Prism in Signal's control room when the guest is a bot", () => {
    const episode = {
      id: "signal-1",
      title: "Refractions",
      hostBotId: "host-1",
      guestBotId: "guest-1",
      guestKind: "bot",
      responseMode: "local",
      messages: [],
      events: [],
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:05:00.000Z",
      completedAt: "2026-07-21T00:05:00.000Z",
    } as unknown as BotcastEpisode;
    const show = {
      name: "The Glass",
      accentColor: "#55ddff",
      atmosphereMix: {
        background: 0.16,
        grain: 0,
        foley: 1,
        filmGrain: 0.65,
      },
      studioLayout: {},
      studioGlowTuning: {
        dark: { opacity: 0.78, blendMode: "screen" },
        light: { opacity: 0.52, blendMode: "overlay" },
      },
      logo: { imageUrl: null },
      dayAtmosphere: { imageUrl: null },
      nightAtmosphere: {
        imageUrl: "/night.png",
        microphoneTintMaskUrl: "/night-microphones.png",
      },
    } as unknown as BotcastShow;
    const manifest = buildSignalReplayManifestV1({
      episode,
      show,
      bots: [
        {
          id: "host-1",
          name: "Host",
          replayVisualSnapshot: {
            v: 1,
            faceStyle: { eyes: "dot", mouth: "flat" },
            avatarDetails: null,
            voicePreset: "alto",
            screenMaterialSeed: "host-screen",
            frameMaterialSeed: "host-frame",
          } as never,
        },
        { id: "guest-1", name: "Guest" },
      ],
      producerName: "Jared",
      theme: "dark",
    });
    assert.equal(
      manifest.participants.find((participant) => participant.role === "producer")?.id,
      "prism-player",
    );
    assert.equal(
      (
        manifest.participants.find((participant) => participant.role === "host")
          ?.metadata?.visualSnapshot as { screenMaterialSeed?: string }
      )?.screenMaterialSeed,
      "host-screen",
    );
    assert.equal(
      manifest.visual.metadata?.renderContract,
      "signal-studio-playwright-v1",
    );
    assert.equal(
      manifest.visual.metadata?.microphoneTintMaskUrl,
      "/night-microphones.png",
    );
    assert.deepEqual(manifest.visual.metadata?.atmosphereMix, {
      background: 0.16,
      grain: 0,
      foley: 1,
      filmGrain: 0.65,
    });
    assert.deepEqual(manifest.visual.metadata?.studioGlowTuning, {
      dark: { opacity: 0.78, blendMode: "screen" },
      light: { opacity: 0.52, blendMode: "overlay" },
    });
  });
});

describe("replay implementation contracts", () => {
  it("keeps replay compilation free of chat/LLM provider calls", () => {
    const sources = [
      "replayAudio.ts",
      "replayClient.ts",
      "replayEncoder.worker.ts",
      "replayManifest.ts",
      "replayScene.ts",
      "ReplayRenderCoordinator.tsx",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
    assert.doesNotMatch(
      sources,
      /selectProvider|chat\/completions|generateResponse|responses\.create/u,
    );
    assert.match(sources, /\/api\/voices\/synthesize/u);
  });

  it("prefers MP4 and explicitly falls back to WebM with bounded chunks", () => {
    const source = ["ReplayRenderCoordinator.tsx", "replayEncoder.worker.ts"]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
    assert.match(source, /getFirstEncodableVideoCodec\(\["avc"\]/u);
    assert.match(source, /new Mp4OutputFormat/u);
    assert.match(source, /new WebMOutputFormat/u);
    assert.match(source, /new StreamTarget/u);
    assert.match(source, /chunkSize: 4 \* 1024 \* 1024/u);
    assert.match(source, /REPLAY_VIDEO_FPS/u);
    assert.match(source, /paintSignalFilmGrain/u);
    assert.match(source, /videoBitrate: replayVideoBitrateForFilmGrain/u);
  });

  it("exposes seeking, downloads, retry, and recording-only deletion", () => {
    const source = readFileSync(
      new URL("ReplayRecordingPanel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /Download video/u);
    assert.match(source, /Download transcript/u);
    assert.match(source, /Retry/u);
    assert.match(source, /Delete recording/u);
    assert.match(source, /currentTime = beat\.startMs/u);
    assert.match(source, /original session and transcript will remain/u);
    assert.match(source, /playsInline/u);
    assert.match(source, /preview\?: ReactNode/u);
    assert.match(source, /if \(surface === "signal"\)/u);
    assert.match(source, /Export video/u);
    assert.match(source, /Export Premium video/u);
    assert.match(source, /Retry Premium video from cached audio/u);
    assert.match(source, /Delete Premium media/u);
    assert.match(source, /surface === "coffee" && transcriptBeats\.length > 0/u);
    assert.doesNotMatch(source, /interactive episode/u);
    assert.doesNotMatch(source, /<track/u);
  });

  it("renders both Signal exports from the real Studio DOM in background Chromium", () => {
    const coordinator = readFileSync(
      new URL("ReplayRenderCoordinator.tsx", import.meta.url),
      "utf8",
    );
    const signal = readFileSync(
      new URL("BotcastExperience.tsx", import.meta.url),
      "utf8",
    );
    const child = readFileSync(
      new URL("../../../api/src/replay-render-child.ts", import.meta.url),
      "utf8",
    );
    const workerClient = readFileSync(
      new URL("../../../api/src/replay-render-worker-client.ts", import.meta.url),
      "utf8",
    );
    const audioEncoder = readFileSync(
      new URL("replayAudioEncoder.worker.ts", import.meta.url),
      "utf8",
    );
    assert.match(coordinator, /surface = "coffee"/u);
    assert.match(coordinator, /claimReplayRecording\(\{ surface, sourceId \}\)/u);
    assert.match(coordinator, /prismRenderRecording/u);
    assert.match(workerClient, /surface: "signal"/u);
    assert.match(child, /chromium\.launch/u);
    assert.match(child, /page\.screencast\.start/u);
    assert.match(child, /"-c:a",\s*"copy"/u);
    assert.match(audioEncoder, /new WebMOutputFormat/u);
    assert.match(audioEncoder, /getFirstEncodableAudioCodec\(\["opus"\]/u);
    assert.match(audioEncoder, /render-audio-chunk/u);
    assert.doesNotMatch(signal, /html-to-image|toCanvas\(stage/u);
    assert.match(signal, /encodeReplayRenderAudio/u);
    assert.match(signal, /replayRenderCapture\.frame\.shot/u);
    assert.match(signal, /data-signal-background-render-state/u);
    assert.match(signal, /__PRISM_SIGNAL_BACKGROUND_RENDER__/u);
    assert.match(
      signal,
      /replayRenderTarget &&[\s\S]{0,100}replayRenderCapture &&[\s\S]{0,800}currentEpisode: replayRenderTarget\.episode/u,
    );
    assert.doesNotMatch(signal, /preview=\{/u);
  });
});
