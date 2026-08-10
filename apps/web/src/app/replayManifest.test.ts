import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  compileReplayTimelineV2,
  replayManifestV1IsValid,
  replayManifestV2IsValid,
  type BotcastEpisode,
  type BotcastShow,
} from "@localai/shared";
import {
  buildCoffeeReplayManifestV1,
  buildCoffeeReplayManifestV2,
  buildSignalReplayManifestV1,
  buildSignalReplayManifestV2,
  COFFEE_REPLAY_RENDER_CONTRACT,
} from "./replayManifest.ts";

describe("replay manifests", () => {
  it("seats the Coffee player as Default Prism with the pot", () => {
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
    assert.equal(manifest.visual.metadata?.playerPerspective, "third-person-prism");
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
      "prism",
    );
    const player = manifest.participants.find(
      (participant) => participant.id === "coffee-player",
    );
    assert.equal(player?.visible, true);
    assert.equal(player?.seatIndex, 1);
    assert.equal(player?.color, "#55ddff");
    assert.equal(player?.glyph, "△");
    assert.equal(player?.metadata?.carriesCoffeePot, true);
    assert.equal(player?.metadata?.offCamera, undefined);
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
      capturedMouthTracks: [
        {
          participantId: "bot-1",
          cues: [
            { atMs: 0, shape: "closed" },
            { atMs: 900, shape: "open-wide" },
            { atMs: 2_100, shape: "closed" },
          ],
        },
      ],
      capturedVoiceLightTracks: [
        {
          participantId: "bot-1",
          cues: [
            { atMs: 900, level: 0.18 },
            { atMs: 1_000, level: 0.63 },
            { atMs: 2_100, level: 0 },
          ],
        },
      ],
      voiceSelection: {
        voiceMode: "english",
        englishVoiceEngine: "builtin",
      },
    });
    assert.equal(manifestV2.v, 2);
    assert.equal(replayManifestV2IsValid(manifestV2), true);
    assert.equal(manifestV2.direction[0]?.kind, "scene_snapshot");
    assert.equal(manifestV2.direction[1]?.kind, "speech");
    assert.deepEqual(manifestV2.presentation, {
      mouthTracks: [
        {
          participantId: "bot-1",
          cues: [
            { atMs: 0, shape: "closed" },
            { atMs: 900, shape: "open-wide" },
            { atMs: 2_100, shape: "closed" },
          ],
        },
      ],
      voiceLightTracks: [
        {
          participantId: "bot-1",
          cues: [
            { atMs: 900, level: 0.18 },
            { atMs: 1_000, level: 0.63 },
            { atMs: 2_100, level: 0 },
          ],
        },
      ],
      voiceSelection: {
        voiceMode: "english",
        englishVoiceEngine: "builtin",
      },
    });
  });

  it("adds transcript-only Coffee interruption utterances without duplicate replay speech", () => {
    const messages = [
      {
        id: "fragment-1",
        role: "assistant" as const,
        content: "The point I was making—",
        botId: "speaker",
        createdAt: "2026-07-24T20:00:01.000Z",
      },
      {
        id: "pause-1",
        role: "assistant" as const,
        content: "...",
        botId: "speaker",
        createdAt: "2026-07-24T20:00:02.000Z",
        coffeeInterruption: {
          kind: "botInterruptsBot" as const,
          interruptedBotId: "speaker",
          interrupterBotId: "interrupter",
          pauseBeat: true,
          interrupterCue: "Hold on." as const,
          interruptedSpeakerCue: "... sure. Go ahead." as const,
          socialConsequences: [],
        },
      },
      {
        id: "follow-on-1",
        role: "assistant" as const,
        content: "Here is the rest of the answer.",
        botId: "speaker",
        createdAt: "2026-07-24T20:00:03.000Z",
      },
      {
        id: "action-1",
        role: "user" as const,
        content: "*raises a hand*",
        createdAt: "2026-07-24T20:00:04.000Z",
        coffeeUserAction: {
          v: 1,
          name: "coffeeUserAction",
          action: "raises a hand",
        },
      },
    ];
    const args = {
      conversation: {
        id: "coffee-interruption-replay",
        title: "Interrupted table",
        createdAt: "2026-07-24T20:00:00.000Z",
        updatedAt: "2026-07-24T20:00:05.000Z",
        botGroupIds: ["speaker", "interrupter"],
        coffeeSeatBotIds: ["speaker", "interrupter"],
        messages,
      },
      bots: [
        { id: "speaker", name: "Speaker", color: "#ffffff" },
        { id: "interrupter", name: "Interrupter", color: "#ff0000" },
      ],
      playerName: "Jared",
      prismColor: "#55ddff",
      prismGlyph: "△",
      theme: "dark" as const,
      capturedReplayEvents: [
        {
          id: "capture:pause-1:speech_start",
          kind: "capture_timing",
          sourceMessageId: "pause-1",
          occurredAt: "2026-07-24T20:00:02.000Z",
          payload: {
            phase: "speech_start",
            messageId: "pause-1",
            atMs: 2_000,
          },
        },
      ],
    };
    const manifest = buildCoffeeReplayManifestV1(args);

    assert.deepEqual(
      manifest.utterances.map((utterance) => utterance.id),
      [
        "fragment-1",
        "pause-1:coffee-interruption:interrupter",
        "pause-1:coffee-interruption:interrupted",
        "follow-on-1",
      ],
    );
    const interruptionUtterances = manifest.utterances.slice(1, 3);
    assert.deepEqual(
      interruptionUtterances.map((utterance) => utterance.speakerId),
      ["interrupter", "speaker"],
    );
    assert.equal(
      interruptionUtterances.every(
        (utterance) =>
          utterance.createdAt === "2026-07-24T20:00:02.000Z" &&
          utterance.audible === false &&
          utterance.visible === true &&
          utterance.metadata?.sourceInterruptionMessageId === "pause-1",
      ),
      true,
    );
    const manifestV2 = buildCoffeeReplayManifestV2(args);
    assert.equal(
      manifestV2.direction.some(
        (event) =>
          event.kind === "speech" &&
          (event.sourceMessageId === "pause-1" ||
            event.sourceMessageId?.startsWith(
              "pause-1:coffee-interruption:",
            )),
      ),
      false,
    );
  });

  it("keeps Prism in Signal's control room when the guest is a bot", () => {
    const episode = {
      id: "signal-1",
      title: "Refractions",
      hostBotId: "host-1",
      guestBotId: "guest-1",
      guestKind: "bot",
      responseMode: "local",
      messages: [
        {
          id: "signal-silence-1",
          episodeId: "signal-1",
          speakerRole: "guest",
          botId: "guest-1",
          content: "...",
          stageActionText: null,
          voicePerformanceText: null,
          moodKey: "guarded",
          socialSilence: {
            v: 1,
            name: "socialSilence",
            provenance: "social",
            mode: "signal",
            seed: "signal-social-silence:signal-1:guest-1:1",
            volleyTurn: 1,
            holdMs: 900,
          },
          createdAt: "2026-07-21T00:00:02.000Z",
        },
      ],
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
      cameraFraming: {
        left: { zoom: 1.56, panX: -4, panY: 2 },
        right: { zoom: 1.48, panX: 5, panY: -1 },
        wide: { zoom: 1.08, panX: 0, panY: 1.5 },
      },
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
      "signal-studio-playwright-v2",
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
    assert.equal(manifest.utterances[0]?.text, "...");
    assert.equal(manifest.utterances[0]?.audible, false);
    assert.deepEqual(
      manifest.utterances[0]?.metadata?.socialSilence,
      episode.messages[0]?.socialSilence,
    );
    assert.deepEqual(manifest.visual.metadata?.studioGlowTuning, {
      dark: { opacity: 0.78, blendMode: "screen" },
      light: { opacity: 0.52, blendMode: "overlay" },
    });
    assert.deepEqual(manifest.visual.metadata?.cameraFraming, show.cameraFraming);
  });

  it("keeps captured Signal direction authoritative over server-time semantics", () => {
    const episode = {
      id: "signal-faithful-clock",
      title: "Captured clock",
      hostBotId: "host-1",
      guestBotId: "guest-1",
      guestKind: "bot",
      responseMode: "online",
      messages: [
        {
          id: "message-1",
          episodeId: "signal-faithful-clock",
          speakerRole: "host",
          botId: "host-1",
          content: "First captured line.",
          stageActionText: null,
          voicePerformanceText: null,
          moodKey: "neutral",
          createdAt: "2026-07-27T00:00:10.000Z",
        },
        {
          id: "message-2",
          episodeId: "signal-faithful-clock",
          speakerRole: "guest",
          botId: "guest-1",
          content: "Final captured line.",
          stageActionText: null,
          voicePerformanceText: null,
          moodKey: "neutral",
          createdAt: "2026-07-27T00:05:20.000Z",
        },
      ],
      events: [
        {
          id: "segment-opening",
          episodeId: "signal-faithful-clock",
          sequence: 1,
          kind: "segment",
          payload: { ordinal: 0, segment: "opening" },
          occurredAt: "2026-07-27T00:00:00.000Z",
        },
        {
          id: "camera-server",
          episodeId: "signal-faithful-clock",
          sequence: 2,
          kind: "camera_suggestion",
          payload: {
            atMs: 800,
            messageId: "message-1",
            shot: "left",
          },
          occurredAt: "2026-07-27T00:00:10.000Z",
        },
        {
          id: "utterance-1",
          episodeId: "signal-faithful-clock",
          sequence: 3,
          kind: "utterance",
          payload: { messageId: "message-1" },
          occurredAt: "2026-07-27T00:00:10.000Z",
        },
        {
          id: "reaction-server",
          episodeId: "signal-faithful-clock",
          sequence: 4,
          kind: "listener_reaction",
          payload: {
            plan: {
              messageId: "message-1",
              speakerBotId: "host-1",
              listenerBotId: "guest-1",
              visualAction: "nod",
            },
          },
          occurredAt: "2026-07-27T00:05:00.000Z",
        },
        {
          id: "segment-closing",
          episodeId: "signal-faithful-clock",
          sequence: 5,
          kind: "segment",
          payload: { ordinal: 2, segment: "closing" },
          occurredAt: "2026-07-27T00:05:19.000Z",
        },
        {
          id: "utterance-2",
          episodeId: "signal-faithful-clock",
          sequence: 6,
          kind: "utterance",
          payload: { messageId: "message-2" },
          occurredAt: "2026-07-27T00:05:20.000Z",
        },
        {
          id: "reaction-server-unrendered",
          episodeId: "signal-faithful-clock",
          sequence: 7,
          kind: "listener_reaction",
          payload: {
            plan: {
              messageId: "message-2",
              speakerBotId: "guest-1",
              listenerBotId: "host-1",
              visualAction: "head_tilt",
            },
          },
          occurredAt: "2026-07-27T00:05:25.000Z",
        },
        {
          id: "departure-server",
          episodeId: "signal-faithful-clock",
          sequence: 8,
          kind: "departure",
          payload: { botId: "guest-1", speakerRole: "guest" },
          occurredAt: "2026-07-27T00:05:20.000Z",
        },
        {
          id: "departure-camera-server",
          episodeId: "signal-faithful-clock",
          sequence: 9,
          kind: "camera_suggestion",
          payload: {
            atMs: 320_000,
            messageId: "message-2",
            reason: "departure",
            shot: "wide",
            speakerRole: "guest",
          },
          occurredAt: "2026-07-27T00:05:20.000Z",
        },
        {
          id: "completed-server",
          episodeId: "signal-faithful-clock",
          sequence: 10,
          kind: "episode_completed",
          payload: { outcome: "completed", runtimeMs: 320_000 },
          occurredAt: "2026-07-27T00:05:30.000Z",
        },
      ],
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:05:30.000Z",
      completedAt: "2026-07-27T00:05:30.000Z",
    } as unknown as BotcastEpisode;
    const show = {
      id: "show-1",
      hostBotId: "host-1",
      name: "Captured Show",
      accentColor: "#55ddff",
      atmosphereMix: {
        background: 0.16,
        grain: 0,
        foley: 1,
        filmGrain: 0.65,
      },
      studioLayout: {},
      cameraFraming: {
        left: { zoom: 1.42, panX: 0, panY: 0 },
        right: { zoom: 1.42, panX: 0, panY: 0 },
        wide: { zoom: 1, panX: 0, panY: 0 },
      },
      studioGlowTuning: {
        dark: { opacity: 0.78, blendMode: "screen" },
        light: { opacity: 0.52, blendMode: "overlay" },
      },
      logo: { imageUrl: null },
      dayAtmosphere: { imageUrl: null },
      nightAtmosphere: { imageUrl: null },
    } as unknown as BotcastShow;
    const capturedReactionPlan = {
      messageId: "message-1",
      speakerBotId: "host-1",
      listenerBotId: "guest-1",
      visualAction: "nod",
    };
    const manifest = buildSignalReplayManifestV2({
      episode,
      show,
      bots: [
        { id: "host-1", name: "Host" },
        { id: "guest-1", name: "Guest" },
      ],
      producerName: "Jared",
      theme: "dark",
      capturedDirection: [
        {
          sequence: 1,
          atMs: 100,
          kind: "camera",
          sourceMessageId: null,
          payload: { shot: "wide" },
        },
        {
          sequence: 2,
          atMs: 1_000,
          endMs: 2_000,
          kind: "speech",
          sourceMessageId: "message-1",
          payload: { speakerId: "host-1", audible: true, channel: "primary" },
        },
        {
          sequence: 3,
          atMs: 1_500,
          kind: "action",
          sourceMessageId: null,
          payload: { plan: capturedReactionPlan },
        },
        {
          sequence: 4,
          atMs: 3_000,
          kind: "camera",
          sourceMessageId: "message-2",
          payload: { shot: "right" },
        },
        {
          sequence: 5,
          atMs: 3_200,
          endMs: 4_000,
          kind: "speech",
          sourceMessageId: "message-2",
          payload: { speakerId: "guest-1", audible: true, channel: "primary" },
        },
        {
          sequence: 6,
          atMs: 4_000,
          kind: "departure",
          sourceMessageId: "message-2",
          payload: { botId: "guest-1", speakerRole: "guest" },
        },
        {
          sequence: 7,
          atMs: 4_500,
          kind: "outro",
          sourceMessageId: null,
          payload: { active: true },
        },
      ],
    });

    assert.deepEqual(
      manifest.direction
        .filter((event) => event.kind === "camera")
        .map((event) => event.atMs),
      [100, 3_000],
    );
    assert.deepEqual(
      manifest.direction
        .filter((event) => event.kind === "action")
        .map((event) => event.atMs),
      [1_500],
    );
    assert.deepEqual(
      manifest.direction
        .filter((event) => event.kind === "segment")
        .map((event) => [event.payload.segment, event.atMs]),
      [
        ["opening", 0],
        ["closing", 3_000],
      ],
    );
    assert.deepEqual(
      manifest.direction
        .filter((event) => event.kind === "outro")
        .map((event) => event.atMs),
      [4_500],
    );
    assert.deepEqual(
      manifest.direction
        .filter((event) => event.kind === "departure")
        .map((event) => [event.sourceMessageId, event.atMs]),
      [["message-2", 4_000]],
    );
    assert.equal(
      Math.max(
        ...manifest.direction.map((event) => event.endMs ?? event.atMs),
      ),
      4_500,
    );
    assert.equal(compileReplayTimelineV2(manifest).durationMs, 4_500);
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
