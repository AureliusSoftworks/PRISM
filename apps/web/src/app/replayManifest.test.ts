import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  replayManifestV1IsValid,
  replayManifestV2IsValid,
  type BotcastEpisode,
  type BotcastShow,
} from "@localai/shared";
import {
  buildCoffeeReplayManifestV1,
  buildCoffeeReplayManifestV2,
  buildSignalReplayManifestV1,
  COFFEE_REPLAY_RENDER_CONTRACT,
} from "./replayManifest.ts";

describe("replay manifests", () => {
  it("keeps the Coffee player off camera with the pot", () => {
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
          {
            id: "departure-1",
            role: "system",
            content: "Aster departs.",
            createdAt: "2026-07-21T00:00:03.000Z",
            coffeeReplayEvents: [{ kind: "botDeparture" }],
          },
        ],
      },
      bots: [
        {
          id: "bot-1",
          name: "Aster",
          color: "#8844ff",
          glyph: "✦",
          replayVisualSnapshot: {
            v: 1,
            faceStyle: { eyes: "dot", mouth: "flat" },
            avatarDetails: null,
            voicePreset: "alto",
            screenMaterialSeed: "aster-screen",
            frameMaterialSeed: "aster-frame",
          } as never,
        },
      ],
      playerName: "Jared",
      prismColor: "#55ddff",
      prismGlyph: "△",
      theme: "dark",
      capturedReplayEvents: [
        {
          id: "capture:coffee-1:speech_start:user-1:800",
          kind: "capture_timing",
          sourceMessageId: "user-1",
          occurredAt: "2026-07-21T00:00:01.000Z",
          payload: {
            phase: "speech_start",
            messageId: "user-1",
            atMs: 800,
          },
        },
      ],
    });
    assert.equal(manifest.surface, "coffee");
    assert.equal(manifest.visual.metadata?.playerPerspective, "off-camera-pot");
    assert.equal(
      manifest.visual.metadata?.renderContract,
      COFFEE_REPLAY_RENDER_CONTRACT,
    );
    assert.equal(
      (
        manifest.participants.find((participant) => participant.id === "bot-1")
          ?.metadata?.visualSnapshot as { screenMaterialSeed?: string }
      )?.screenMaterialSeed,
      "aster-screen",
    );
    assert.equal(
      manifest.participants.find((participant) => participant.id === "coffee-player")?.kind,
      "player",
    );
    const player = manifest.participants.find(
      (participant) => participant.id === "coffee-player",
    );
    assert.equal(player?.visible, false);
    assert.equal(player?.seatIndex, null);
    assert.equal(player?.metadata?.carriesCoffeePot, true);
    assert.equal(manifest.utterances[0]?.speakerId, "coffee-player");
    assert.equal(manifest.utterances.length, 2);
    assert.equal(
      manifest.events.some((event) => event.kind === "botDeparture"),
      true,
    );
    assert.equal(
      manifest.events.some((event) => event.kind === "capture_timing"),
      true,
    );
    assert.equal(replayManifestV1IsValid(manifest), true);
    const manifestV2 = buildCoffeeReplayManifestV2({
      conversation: {
        id: "coffee-1",
        title: "Late table",
        createdAt: "2026-07-21T00:00:00.000Z",
        updatedAt: "2026-07-21T00:05:00.000Z",
        botGroupIds: ["bot-1"],
        coffeeSeatBotIds: ["bot-1"],
        messages: [
          {
            id: "bot-line-1",
            role: "assistant",
            botId: "bot-1",
            botName: "Aster",
            content: "Then the room changes with you.",
            createdAt: "2026-07-21T00:00:02.000Z",
          },
        ],
      },
      bots: [{ id: "bot-1", name: "Aster" }],
      playerName: "Jared",
      prismColor: "#55ddff",
      prismGlyph: "△",
      theme: "dark",
      capturedDirection: [
        {
          sequence: 1,
          atMs: 900,
          endMs: 2_100,
          kind: "speech",
          sourceMessageId: "bot-line-1",
          payload: {
            speakerId: "bot-1",
            voiceMode: "english",
            audible: true,
            gain: 0.8,
            pan: 0.2,
            effects: ["coffee-room"],
          },
        },
      ],
    });
    assert.equal(manifestV2.v, 2);
    assert.equal(replayManifestV2IsValid(manifestV2), true);
    assert.equal(manifestV2.direction[0]?.kind, "scene_snapshot");
    assert.equal(manifestV2.direction[1]?.kind, "speech");
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
      audioEnabled: true,
      audioVolume: 0.72,
      capturedReplayEvents: [
        {
          id: "local-soundboard",
          episodeId: "signal-1",
          sequence: 1,
          kind: "soundboard_cue",
          payload: {
            kind: "applause",
            atMs: 1_200,
            variantIndex: 2,
            gain: 0.31,
          },
          occurredAt: "2026-07-21T00:00:01.000Z",
        },
      ],
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
    assert.deepEqual(manifest.visual.metadata?.signalAudioMix, {
      v: 1,
      enabled: true,
      masterVolume: 0.72,
    });
    assert.deepEqual(manifest.events[0]?.payload, {
      kind: "applause",
      atMs: 1_200,
      variantIndex: 2,
      gain: 0.31,
    });
    assert.deepEqual(manifest.visual.metadata?.studioGlowTuning, {
      dark: { opacity: 0.78, blendMode: "screen" },
      light: { opacity: 0.52, blendMode: "overlay" },
    });
  });
});

describe("replay implementation contracts", () => {
  it("keeps faithful replay free of chat, synthesis, and paid provider calls", () => {
    const sources = [
      "replayClient.ts",
      "replayManifest.ts",
      "ReplayRenderCoordinator.tsx",
      "ReplayRecordingPanel.tsx",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
    assert.doesNotMatch(
      sources,
      /selectProvider|chat\/completions|generateResponse|responses\.create|\/api\/voices\/synthesize/u,
    );
    assert.match(sources, /audio\.currentTime|currentTime/u);
  });

  it("removes the active video encoder and leaves the compatibility coordinator inert", () => {
    const coordinator = readFileSync(
      new URL("ReplayRenderCoordinator.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      coordinator,
      /Worker|claimReplayRecording|completeReplayRender|prepareReplayAudio/u,
    );
    assert.match(coordinator, /return null;/u);
    assert.equal(
      existsSync(new URL("replayEncoder.worker.ts", import.meta.url)),
      false,
    );
  });

  it("offers authenticated playback and exactly one transcript download", () => {
    const source = readFileSync(
      new URL("ReplayRecordingPanel.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /recording\.availability === "faithful"/u);
    assert.match(source, /recording\.transcriptMarkdownUrl/u);
    assert.equal((source.match(/download>/gu) ?? []).length, 1);
    assert.doesNotMatch(
      source,
      /<video|Enhance recording|Premium|transcriptVttUrl|Download audio/iu,
    );
  });

  it("adds capture hooks without restoring a Signal or Coffee video lane", () => {
    const signal = readFileSync(
      new URL("BotcastExperience.tsx", import.meta.url),
      "utf8",
    );
    const coffee = readFileSync(new URL("page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(
      signal,
      /queueReplayManifest|backgroundReplayRender|__PRISM_SIGNAL_BACKGROUND_RENDER__/u,
    );
    assert.doesNotMatch(coffee, /coffeeBackgroundReplayRender/u);
    assert.doesNotMatch(coffee, /__PRISM_COFFEE_BACKGROUND_RENDER__/u);
    assert.doesNotMatch(coffee, /data-coffee-background-render/u);
    assert.match(coffee, /coffeeReplayVideoFrameState/u);
    assert.match(coffee, /startReplayAudioMasterCapture/u);
    assert.match(coffee, /saveFaithfulReplaySession/u);
    assert.match(signal, /saveFaithfulReplaySession/u);
    assert.match(signal, /audio\.currentTime \* 1_000/u);
  });
});
