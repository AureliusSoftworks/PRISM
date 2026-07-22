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
      studioLayout: {},
      logo: { imageUrl: null },
      dayAtmosphere: { imageUrl: null },
      nightAtmosphere: { imageUrl: null },
    } as unknown as BotcastShow;
    const manifest = buildSignalReplayManifestV1({
      episode,
      show,
      bots: [
        { id: "host-1", name: "Host" },
        { id: "guest-1", name: "Guest" },
      ],
      producerName: "Jared",
      theme: "dark",
    });
    assert.equal(
      manifest.participants.find((participant) => participant.role === "producer")?.id,
      "prism-player",
    );
  });
});

describe("replay implementation contracts", () => {
  it("keeps replay compilation free of chat/LLM provider calls", () => {
    const sources = [
      "replayAudio.ts",
      "replayClient.ts",
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
    const source = readFileSync(
      new URL("ReplayRenderCoordinator.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /getFirstEncodableVideoCodec\(\["avc"\]/u);
    assert.match(source, /new media\.Mp4OutputFormat/u);
    assert.match(source, /new media\.WebMOutputFormat/u);
    assert.match(source, /new media\.StreamTarget/u);
    assert.match(source, /chunkSize: 4 \* 1024 \* 1024/u);
    assert.match(source, /REPLAY_VIDEO_FPS/u);
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
  });
});
