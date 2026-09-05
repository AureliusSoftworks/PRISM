import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botcastReplayTimeline,
  replayCameraPresentationAtV2,
  replayMouthShapeAtV2,
  type BotcastEpisode,
  type ReplayManifestV2,
  type ReplayParticipantSceneV2,
  type ReplaySceneSnapshotV2,
  type ReplayTimelineV1,
} from "@localai/shared";
import {
  signalFaithfulReplayCameraState,
  signalReplayCameraClockFrame,
  signalReplayClockCrossedBoundary,
  signalReplayBookendAt,
  signalReplayDefaultIntroDurationMs,
  signalReplayEventElapsedMs,
  signalReplayIntroBounds,
  signalReplayIntroCardHoldMs,
  signalReplayIntroDurationMs,
  signalReplayIntroIsLanding,
  signalReplayIntroLandingFadeMs,
  signalReplayIntroLandingRemainingMs,
  signalReplayCapturedPresentationElapsedMs,
  signalReplayMediaElapsedMs,
  signalReplayMouthSampleElapsedMs,
  signalReplayIntroVisualElapsedMs,
  signalReplayIntroVisualOffsetMs,
  signalReplayVideoEventElapsedMs,
  signalReplayVideoFrameState,
} from "./signalReplayVideoFrame.ts";

const episode = {
  id: "episode-1",
  hostBotId: "host-1",
  guestBotId: "guest-1",
  startedAt: "2026-07-21T00:00:00.000Z",
  completedAt: "2026-07-21T00:01:00.000Z",
  updatedAt: "2026-07-21T00:01:00.000Z",
  runtimeMs: 60_000,
  events: [],
  messages: [
    {
      id: "message-1",
      speakerRole: "host",
      content: "Welcome to the real studio.",
    },
    {
      id: "message-2",
      speakerRole: "guest",
      content: "I can see it now.",
    },
  ],
} as unknown as BotcastEpisode;

const timeline: ReplayTimelineV1 = {
  v: 1,
  durationMs: 12_000,
  beats: [
    {
      id: "title",
      kind: "title",
      startMs: 0,
      endMs: 2_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "Episode",
      channel: null,
    },
    {
      id: "one",
      kind: "utterance",
      startMs: 2_000,
      endMs: 6_000,
      utteranceId: "one",
      sourceMessageId: "message-1",
      speakerId: "host-1",
      speakerName: "Host",
      text: "Welcome to the real studio.",
      channel: "primary",
    },
    {
      id: "two",
      kind: "utterance",
      startMs: 6_500,
      endMs: 10_000,
      utteranceId: "two",
      sourceMessageId: "message-2",
      speakerId: "guest-1",
      speakerName: "Guest",
      text: "I can see it now.",
      channel: "primary",
    },
    {
      id: "end",
      kind: "end",
      startMs: 10_000,
      endMs: 12_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "End",
      channel: null,
    },
  ],
};

describe("signalReplayCapturedPresentationElapsedMs", () => {
  it("uses the calibrated 8.75-second intro as the replay default", () => {
    assert.equal(signalReplayDefaultIntroDurationMs(timeline), 8_750);
    assert.equal(
      signalReplayDefaultIntroDurationMs({
        ...timeline,
        durationMs: 4_000,
      }),
      4_000,
    );
    assert.equal(signalReplayDefaultIntroDurationMs(undefined), 8_750);
  });

  it("keeps the first captured host frame on the audio-master clock", () => {
    const calibratedTimeline: ReplayTimelineV1 = {
      ...timeline,
      durationMs: 240_580,
      beats: [
        {
          ...timeline.beats[0],
          endMs: 8_180,
        },
        {
          ...timeline.beats[1],
          startMs: 9_327,
          endMs: 31_192,
        },
        {
          ...timeline.beats[3],
          startMs: 240_580,
          endMs: 240_580,
        },
      ],
    };
    const firstAnimatedMouthFrameAudioMs = 9_390;

    assert.equal(
      signalReplayDefaultIntroDurationMs(calibratedTimeline),
      8_750,
    );
    assert.equal(
      signalReplayCapturedPresentationElapsedMs({
        timeline: calibratedTimeline,
        replayElapsedMs: firstAnimatedMouthFrameAudioMs,
      }),
      firstAnimatedMouthFrameAudioMs,
    );
    assert.equal(firstAnimatedMouthFrameAudioMs - 9_327, 63);
  });

  it("keeps a long recorded provider wait on the faithful audio and camera clock", () => {
    const delayedFirstTurnTimeline: ReplayTimelineV1 = {
      ...timeline,
      durationMs: 292_571,
      beats: [
        {
          ...timeline.beats[0],
          endMs: 8_750,
        },
        {
          ...timeline.beats[1],
          startMs: 28_445,
          endMs: 57_130,
        },
        {
          ...timeline.beats[3],
          startMs: 292_571,
          endMs: 292_571,
        },
      ],
    };

    assert.equal(
      signalReplayCapturedPresentationElapsedMs({
        timeline: delayedFirstTurnTimeline,
        replayElapsedMs: 28_500,
      }),
      28_500,
    );
  });

  it("preserves the audio-master rate through opening and later turns", () => {
    const earlierFrameMs = signalReplayCapturedPresentationElapsedMs({
      timeline,
      replayElapsedMs: 4_000,
    });
    const laterFrameMs = signalReplayCapturedPresentationElapsedMs({
      timeline,
      replayElapsedMs: 7_500,
    });
    assert.equal(laterFrameMs - earlierFrameMs, 3_500);
  });

  it("calibrates a shorter WebM transport onto the saved presentation clock", () => {
    const capturedDurationMs = 100_467;
    const mediaDurationMs = 97_555;
    const calibratedTimeline: ReplayTimelineV1 = {
      ...timeline,
      durationMs: capturedDurationMs,
    };

    assert.equal(
      signalReplayCapturedPresentationElapsedMs({
        timeline: calibratedTimeline,
        replayElapsedMs: mediaDurationMs,
        mediaDurationMs,
        capturedDurationMs,
      }),
      capturedDurationMs,
    );
    assert.equal(
      Math.round(
        signalReplayCapturedPresentationElapsedMs({
          timeline: calibratedTimeline,
          replayElapsedMs: mediaDurationMs / 2,
          mediaDurationMs,
          capturedDurationMs,
        }),
      ),
      Math.round(capturedDurationMs / 2),
    );
  });

  it("maps saved transcript seeks back to the shorter media transport", () => {
    assert.equal(
      Math.round(
        signalReplayMediaElapsedMs({
          capturedElapsedMs: 49_035,
          mediaDurationMs: 97_555,
          capturedDurationMs: 100_467,
        }),
      ),
      47_614,
    );
    assert.equal(
      signalReplayMediaElapsedMs({ capturedElapsedMs: 4_200 }),
      4_200,
    );
  });

  it("clamps the captured presentation clock to the audio timeline", () => {
    assert.equal(
      signalReplayCapturedPresentationElapsedMs({
        timeline,
        replayElapsedMs: -100,
      }),
      0,
    );
    assert.equal(
      signalReplayCapturedPresentationElapsedMs({
        timeline,
        replayElapsedMs: 12_900,
      }),
      timeline.durationMs,
    );
  });
});

const v2BookendTimeline: ReplayTimelineV1 = {
  v: 1,
  durationMs: 12_000,
  beats: [
    {
      id: "v2-utterance",
      kind: "utterance",
      startMs: 2_000,
      endMs: 9_000,
      utteranceId: "one",
      sourceMessageId: "message-1",
      speakerId: "host-1",
      speakerName: "Host",
      text: "Welcome to the real studio.",
      channel: "primary",
    },
    {
      id: "end",
      kind: "end",
      startMs: 12_000,
      endMs: 12_000,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: "End",
      channel: null,
    },
  ],
};

const v2BookendManifest = {
  direction: [
    {
      sequence: 1,
      atMs: 0,
      kind: "intro",
      sourceMessageId: null,
      payload: { active: true },
    },
    {
      sequence: 2,
      atMs: 9_500,
      kind: "outro",
      sourceMessageId: null,
      payload: { active: true },
    },
  ],
  visual: {
    metadata: { introPresentationDurationMs: 2_000 },
  },
} as unknown as ReplayManifestV2;

describe("signalReplayCameraClockFrame", () => {
  const cameraManifest: ReplayManifestV2 = {
    ...v2BookendManifest,
    initialScene: {
      ...v2BookendManifest.initialScene,
      camera: "wide",
    },
    direction: [
      {
        sequence: 1,
        atMs: 2_000,
        kind: "camera",
        payload: { shot: "left", transitionMode: "animated" },
      },
      {
        sequence: 2,
        atMs: 5_000,
        kind: "camera",
        payload: { shot: "right", transitionMode: "animated" },
      },
    ],
  };

  it("reconstructs transition progress from the media timestamp after a stall", () => {
    const beforeStall = signalReplayCameraClockFrame({
      manifest: cameraManifest,
      replayElapsedMs: 5_180,
    });
    const afterTwoSecondStall = signalReplayCameraClockFrame({
      manifest: cameraManifest,
      replayElapsedMs: 7_180,
    });

    assert.equal(beforeStall?.fromShot, "left");
    assert.equal(beforeStall?.toShot, "right");
    assert.equal(beforeStall?.transitionStartedAtMs, 5_000);
    assert.ok((beforeStall?.progress ?? 0) > 0.2);
    assert.ok((beforeStall?.progress ?? 1) < 1);
    assert.deepEqual(afterTwoSecondStall, {
      fromShot: "left",
      toShot: "right",
      progress: 1,
      transitionStartedAtMs: 5_000,
    });
  });

  it("reconstructs the same frame for seek and pause-resume reads", () => {
    const seeked = signalReplayCameraClockFrame({
      manifest: cameraManifest,
      replayElapsedMs: 5_450,
    });
    const paused = signalReplayCameraClockFrame({
      manifest: cameraManifest,
      replayElapsedMs: 5_450,
    });

    assert.deepEqual(seeked, paused);
    assert.ok((seeked?.progress ?? 0) > 0.5);
  });
});

describe("signalReplayClockCrossedBoundary", () => {
  it("publishes a delayed media sample once when it crosses saved cues", () => {
    assert.equal(
      signalReplayClockCrossedBoundary({
        previousElapsedMs: 27_900,
        elapsedMs: 31_900,
        boundaryTimesMs: [28_200, 30_311, 31_576],
      }),
      true,
    );
    assert.equal(
      signalReplayClockCrossedBoundary({
        previousElapsedMs: 31_900,
        elapsedMs: 31_950,
        boundaryTimesMs: [28_200, 30_311, 31_576],
      }),
      false,
    );
  });

  it("always republishes after a seek backwards", () => {
    assert.equal(
      signalReplayClockCrossedBoundary({
        previousElapsedMs: 31_900,
        elapsedMs: 28_000,
        boundaryTimesMs: [],
      }),
      true,
    );
  });
});

function participantScene(
  overrides: Partial<ReplayParticipantSceneV2> = {},
): ReplayParticipantSceneV2 {
  return {
    visible: true,
    present: true,
    speaking: false,
    thinking: false,
    mood: null,
    cupLevel: null,
    sipping: false,
    voiceMode: null,
    audible: true,
    gain: 1,
    pan: 0,
    effects: [],
    ...overrides,
  };
}

function replayScene(
  participants: ReplaySceneSnapshotV2["participants"],
): ReplaySceneSnapshotV2 {
  return {
    camera: null,
    segment: null,
    introActive: false,
    outroActive: false,
    activeAction: null,
    activeReaction: null,
    overlapMessageIds: [],
    studioMix: {},
    participants,
  };
}

function episodeWithCameraEvents(
  events: Array<{ kind: string; payload: Record<string, unknown> }>,
  overrides: Partial<BotcastEpisode> = {},
): BotcastEpisode {
  return {
    ...episode,
    ...overrides,
    events: events.map((event, index) => ({
      id: `event-${index + 1}`,
      episodeId: episode.id,
      sequence: index + 1,
      kind: event.kind,
      payload: event.payload,
      occurredAt: episode.startedAt,
    })),
  } as unknown as BotcastEpisode;
}

describe("Signal replay video frames", () => {
  it("keeps host and guest mouths on their captured audio-master turns", () => {
    const bakedManifest: ReplayManifestV2 = {
      v: 2,
      surface: "signal",
      sourceId: "translated-performance",
      title: "Translated performance",
      createdAt: "2026-07-26T00:00:00.000Z",
      completedAt: "2026-07-26T00:00:12.000Z",
      privacyMode: "local",
      participants: [],
      utterances: [],
      initialScene: replayScene({
        "host-1": participantScene(),
        "guest-1": participantScene(),
      }),
      direction: [
        {
          sequence: 1,
          atMs: 3_200,
          kind: "camera",
          payload: {
            shot: "right",
            transitionMode: "instant",
            transitionPreset: "signal-camera-v1",
          },
        },
      ],
      presentation: {
        mouthTracks: [
          {
            participantId: "host-1",
            cues: [
              { atMs: 0, shape: "closed" },
              { atMs: 2_000, shape: "open-wide" },
              { atMs: 6_000, shape: "closed" },
            ],
          },
          {
            participantId: "guest-1",
            cues: [
              { atMs: 0, shape: "closed" },
              { atMs: 6_500, shape: "open-round" },
              { atMs: 10_000, shape: "closed" },
            ],
          },
        ],
      },
      visual: {
        theme: "dark",
        accentColor: null,
        atmosphereImageUrl: null,
      },
    };
    const hostAudioElapsedMs = signalReplayCapturedPresentationElapsedMs({
      timeline,
      replayElapsedMs: 2_500,
    });
    const guestAudioElapsedMs = signalReplayCapturedPresentationElapsedMs({
      timeline,
      replayElapsedMs: 7_000,
    });
    assert.equal(
      replayMouthShapeAtV2(bakedManifest, "host-1", hostAudioElapsedMs),
      "open-wide",
    );
    assert.equal(
      replayMouthShapeAtV2(bakedManifest, "guest-1", hostAudioElapsedMs),
      "closed",
    );
    assert.equal(
      replayMouthShapeAtV2(bakedManifest, "host-1", guestAudioElapsedMs),
      "closed",
      "guest audio must never drive the host mouth",
    );
    assert.equal(
      replayMouthShapeAtV2(bakedManifest, "guest-1", guestAudioElapsedMs),
      "open-round",
    );
    assert.equal(
      replayCameraPresentationAtV2(bakedManifest, guestAudioElapsedMs)
        .transitionMode,
      "instant",
    );
    assert.equal(
      replayCameraPresentationAtV2(bakedManifest, guestAudioElapsedMs).shot,
      "right",
    );
  });

  it("rebases only a provably late captured mouth start onto audible speech", () => {
    const lateMouthManifest: ReplayManifestV2 = {
      v: 2,
      surface: "signal",
      sourceId: "late-mouth",
      title: "Late mouth",
      createdAt: "2026-07-26T00:00:00.000Z",
      completedAt: "2026-07-26T00:00:12.000Z",
      privacyMode: "local",
      participants: [],
      utterances: [],
      initialScene: replayScene({ "host-1": participantScene() }),
      direction: [],
      presentation: {
        mouthTracks: [{
          participantId: "host-1",
          cues: [
            { atMs: 0, shape: "closed" },
            { atMs: 2_700, shape: "open-wide" },
            { atMs: 6_000, shape: "closed" },
          ],
        }],
        speechActivityTracks: [{
          participantId: "host-1",
          cues: [
            { atMs: 2_700, active: true },
            { atMs: 6_000, active: false },
          ],
        }],
      },
      visual: {
        theme: "dark",
        accentColor: null,
        atmosphereImageUrl: null,
      },
    };
    const correctedElapsedMs = signalReplayMouthSampleElapsedMs({
      manifest: lateMouthManifest,
      participantId: "host-1",
      replayElapsedMs: 2_000,
      speechStartMs: 2_000,
      speechEndMs: 6_000,
    });
    assert.equal(correctedElapsedMs, 2_700);
    assert.equal(
      replayMouthShapeAtV2(lateMouthManifest, "host-1", correctedElapsedMs),
      "open-wide",
      "the first audible host frame must not wait for a delayed React capture",
    );
    assert.equal(
      signalReplayMouthSampleElapsedMs({
        manifest: lateMouthManifest,
        participantId: "host-1",
        replayElapsedMs: 6_100,
        speechStartMs: 2_000,
        speechEndMs: 6_000,
      }),
      6_100,
      "the correction remains within the spoken beat",
    );
    assert.equal(
      signalReplayMouthSampleElapsedMs({
        manifest: lateMouthManifest,
        participantId: "host-1",
        replayElapsedMs: 2_640,
        speechStartMs: 2_640,
        speechEndMs: 6_000,
      }),
      2_640,
      "normal one-frame mouth settling remains faithful",
    );
  });

  it("measures the intro block from zero to the first recorded utterance", () => {
    assert.equal(signalReplayIntroDurationMs(timeline), 2_000);
    assert.equal(signalReplayIntroDurationMs(undefined), 0);
  });

  it("starts compacted recordings in the saved intro landing section", () => {
    const compactedTimeline = {
      ...v2BookendTimeline,
      durationMs: 30_000,
      beats: v2BookendTimeline.beats.map((beat) =>
        beat.kind === "utterance"
          ? { ...beat, startMs: 778, endMs: 779 }
          : { ...beat, startMs: 30_000, endMs: 30_000 },
      ),
    } satisfies ReplayTimelineV1;
    const extendedIntroManifest = {
      ...v2BookendManifest,
      visual: {
        ...v2BookendManifest.visual,
        metadata: { introPresentationDurationMs: 7_980 },
      },
    } as unknown as ReplayManifestV2;

    const initialVisualElapsedMs = signalReplayIntroVisualElapsedMs({
      timeline: compactedTimeline,
      manifest: extendedIntroManifest,
      replayElapsedMs: 0,
    });
    assert.equal(initialVisualElapsedMs, 5_530);
    assert.equal(
      signalReplayIntroVisualOffsetMs({
        timeline: compactedTimeline,
        manifest: extendedIntroManifest,
      }),
      5_530,
    );
    assert.equal(
      signalReplayIntroVisualElapsedMs({
        timeline: compactedTimeline,
        manifest: extendedIntroManifest,
        replayElapsedMs: 0,
        visualOffsetMs: 2_750,
      }),
      2_750,
    );
    const initialBookend = signalReplayBookendAt(
      compactedTimeline,
      initialVisualElapsedMs,
      extendedIntroManifest,
    );
    assert.deepEqual(initialBookend, {
      kind: "intro",
      startMs: 0,
      endMs: 6_180,
    });
    assert.equal(
      signalReplayIntroIsLanding({
        bookend: initialBookend,
        elapsedMs: initialVisualElapsedMs,
      }),
      true,
    );
    const defaultIntro = signalReplayIntroBounds(
      compactedTimeline,
      extendedIntroManifest,
    );
    assert.ok(defaultIntro);
    const automaticFade = signalReplayIntroLandingFadeMs(defaultIntro);
    const automaticHold = signalReplayIntroCardHoldMs(
      defaultIntro,
      automaticFade,
    );
    assert.equal(automaticHold, defaultIntro.endMs - automaticFade);
    assert.deepEqual(
      signalReplayBookendAt(
        compactedTimeline,
        automaticHold + 10,
        extendedIntroManifest,
        { introEndMs: automaticHold + automaticFade + 1_000 },
      ),
      {
        kind: "intro",
        startMs: 0,
        endMs: automaticHold + automaticFade + 1_000,
      },
    );
    assert.equal(
      signalReplayIntroLandingRemainingMs({
        bookend: {
          kind: "intro",
          startMs: 0,
          endMs: automaticHold + automaticFade,
        },
        elapsedMs: automaticHold + 10,
        fadeMs: automaticFade,
      }),
      automaticFade - 10,
    );
    assert.equal(
      signalReplayBookendAt(
        compactedTimeline,
        initialVisualElapsedMs + 650,
        extendedIntroManifest,
      ),
      null,
    );
  });

  it("keeps the branded intro and outro on the replay picture timeline", () => {
    assert.deepEqual(signalReplayBookendAt(timeline, 1_000), {
      kind: "intro",
      startMs: 0,
      endMs: 1_100,
    });
    assert.equal(signalReplayBookendAt(timeline, 1_500), null);
    assert.equal(signalReplayBookendAt(timeline, 7_000), null);
    assert.equal(signalReplayBookendAt(timeline, 11_000)?.kind, "outro");
    assert.equal(
      signalReplayIntroIsLanding({
        bookend: signalReplayBookendAt(timeline, 900),
        elapsedMs: 900,
      }),
      true,
    );
  });

  it("derives bounded bookends from V2 speech and direction timing", () => {
    assert.deepEqual(
      signalReplayBookendAt(
        v2BookendTimeline,
        1_000,
        v2BookendManifest,
      ),
      { kind: "intro", startMs: 0, endMs: 1_100 },
    );
    assert.equal(
      signalReplayBookendAt(
        v2BookendTimeline,
        1_500,
        v2BookendManifest,
      ),
      null,
    );
    assert.equal(
      signalReplayBookendAt(
        v2BookendTimeline,
        9_200,
        v2BookendManifest,
      ),
      null,
    );
    assert.deepEqual(
      signalReplayBookendAt(
        v2BookendTimeline,
        10_000,
        v2BookendManifest,
      ),
      { kind: "outro", startMs: 9_500, endMs: 12_000 },
    );
    assert.equal(
      signalReplayBookendAt(v2BookendTimeline, 10_500)?.kind,
      "outro",
    );
  });

  it("maps frozen voice timing onto the episode director clock per message", () => {
    const director = botcastReplayTimeline(episode.messages, episode.events);
    const mapped = signalReplayVideoEventElapsedMs({
      episode,
      timeline,
      videoElapsedMs: 4_000,
    });
    const expected =
      ((director.messageStartMs[0] ?? 0) +
        (director.messageEndMs[0] ?? 0)) /
      2;
    assert.equal(mapped, expected);
  });

  it("holds director cuts through the padded intro, then advances with speech", () => {
    const directedEpisode = episodeWithCameraEvents([
      {
        kind: "camera_suggestion",
        payload: { atMs: 0, shot: "wide", reason: "opening" },
      },
      {
        kind: "camera_suggestion",
        payload: { atMs: 1_400, shot: "right", reason: "speaker" },
      },
    ]);
    const intro = signalFaithfulReplayCameraState({
      episode: directedEpisode,
      timeline,
      replayElapsedMs: 1_000,
      scene: null,
      activeMessage: null,
    });
    const studioReveal = signalFaithfulReplayCameraState({
      episode: directedEpisode,
      timeline,
      replayElapsedMs: 1_500,
      scene: null,
      activeMessage: null,
    });
    const firstSpeech = signalFaithfulReplayCameraState({
      episode: directedEpisode,
      timeline,
      replayElapsedMs: 5_500,
      scene: null,
      activeMessage: directedEpisode.messages[0] ?? null,
    });

    assert.equal(
      signalReplayEventElapsedMs({
        episode: directedEpisode,
        timeline,
        replayElapsedMs: 1_000,
      }),
      0,
    );
    assert.deepEqual(intro, { eventElapsedMs: 0, shot: "wide" });
    assert.deepEqual(studioReveal, { eventElapsedMs: 0, shot: "wide" });
    assert.ok(firstSpeech.eventElapsedMs >= 1_400);
    assert.equal(firstSpeech.shot, "right");
  });

  it("keeps Auto framing wide until the first utterance even if a close-up was saved early", () => {
    const earlyCloseUp = episodeWithCameraEvents([
      {
        kind: "camera_suggestion",
        payload: { atMs: 0, shot: "left", reason: "opening" },
      },
    ]);
    const beforeSpeech = signalFaithfulReplayCameraState({
      episode: earlyCloseUp,
      timeline,
      replayElapsedMs: 1_800,
      scene: null,
      activeMessage: null,
    });
    assert.deepEqual(beforeSpeech, { eventElapsedMs: 0, shot: "wide" });
  });

  it("rebuilds Auto speaking and thinking shots on the audio clock", () => {
    const automaticEpisode = episodeWithCameraEvents([
      {
        kind: "camera_suggestion",
        payload: { atMs: 0, shot: "left", reason: "opening" },
      },
    ]);
    const guestSpeaking = signalFaithfulReplayCameraState({
      episode: automaticEpisode,
      timeline,
      replayElapsedMs: 7_000,
      scene: replayScene({
        "guest-1": participantScene({ speaking: true }),
      }),
      activeMessage: automaticEpisode.messages[1] ?? null,
    });
    const botThinking = signalFaithfulReplayCameraState({
      episode: automaticEpisode,
      timeline,
      replayElapsedMs: 4_000,
      scene: replayScene({
        "host-1": participantScene({ thinking: true }),
      }),
      activeMessage: null,
    });
    const producerEpisode = episodeWithCameraEvents(
      [
        {
          kind: "camera_suggestion",
          payload: { atMs: 0, shot: "left", reason: "opening" },
        },
      ],
      { guestKind: "producer" },
    );
    const producerThinking = signalFaithfulReplayCameraState({
      episode: producerEpisode,
      timeline,
      replayElapsedMs: 7_000,
      scene: replayScene({
        "prism-player": participantScene({ thinking: true }),
      }),
      activeMessage: null,
    });

    assert.equal(guestSpeaking.shot, "right");
    assert.equal(botThinking.shot, "wide");
    assert.equal(producerThinking.shot, "right");
  });

  it("frames two audible replay performers in Wide while keeping fixed cameras authoritative", () => {
    const automaticEpisode = episodeWithCameraEvents([
      {
        kind: "camera_suggestion",
        payload: { atMs: 0, shot: "left", reason: "opening" },
      },
    ]);
    const crosstalk = signalFaithfulReplayCameraState({
      episode: automaticEpisode,
      timeline,
      replayElapsedMs: 7_000,
      scene: replayScene({
        "host-1": participantScene({ speaking: true, audible: true }),
        "guest-1": participantScene({ speaking: true, audible: true }),
      }),
      activeMessage: automaticEpisode.messages[1] ?? null,
    });
    assert.equal(crosstalk.shot, "wide");
    for (const shot of ["left", "right", "wide"] as const) {
      const fixedEpisode = episodeWithCameraEvents([
        {
          kind: "camera_mode",
          payload: { atMs: 0, mode: shot, shot },
        },
      ]);
      const fixed = signalFaithfulReplayCameraState({
        episode: fixedEpisode,
        timeline,
        replayElapsedMs: 7_000,
        scene: replayScene({
          "host-1": participantScene({ speaking: true, audible: true }),
          "guest-1": participantScene({ speaking: true, audible: true }),
        }),
        activeMessage: fixedEpisode.messages[1] ?? null,
      });
      assert.equal(fixed.shot, shot);
    }
  });

  it("prefers the camera shot captured from the live Signal stage", () => {
    const manifest = {
      ...v2BookendManifest,
      direction: [
        {
          sequence: 1,
          atMs: 3_000,
          kind: "camera",
          sourceMessageId: "message-1",
          payload: { shot: "right" },
        },
      ],
    } as ReplayManifestV2;
    const capturedScene = {
      ...replayScene({
        "host-1": participantScene({ speaking: true }),
        "guest-1": participantScene(),
      }),
      camera: "right" as const,
    };
    const captured = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 4_000,
      manifest,
      scene: capturedScene,
      activeMessage: episode.messages[0] ?? null,
      preferDirectedCamera: true,
    });

    assert.equal(captured.shot, "right");
  });

  it("rejects a stale captured cue owned by the prior turn and follows the audible speaker", () => {
    const staleManifest = {
      ...v2BookendManifest,
      direction: [
        {
          sequence: 1,
          atMs: 3_000,
          kind: "camera",
          sourceMessageId: "message-1",
          payload: { shot: "left" },
        },
      ],
    } as ReplayManifestV2;
    const reconstructed = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 7_000,
      manifest: staleManifest,
      scene: {
        ...replayScene({
          "host-1": participantScene(),
          "guest-1": participantScene({ speaking: true, audible: true }),
        }),
        camera: "left",
      },
      activeMessage: episode.messages[1] ?? null,
      preferDirectedCamera: true,
    });

    assert.equal(reconstructed.shot, "right");
  });

  it("treats an unowned legacy cue from the prior turn as stale", () => {
    const legacyManifest = {
      ...v2BookendManifest,
      direction: [
        {
          sequence: 1,
          atMs: 3_000,
          kind: "camera",
          sourceMessageId: null,
          payload: { shot: "left" },
        },
      ],
    } as ReplayManifestV2;
    const reconstructed = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 7_000,
      manifest: legacyManifest,
      scene: {
        ...replayScene({
          "guest-1": participantScene({ speaking: true, audible: true }),
        }),
        camera: "left",
      },
      activeMessage: episode.messages[1] ?? null,
      preferDirectedCamera: true,
    });

    assert.equal(reconstructed.shot, "right");
  });

  it("reconstructs cue ownership after seeks while preserving valid in-turn cutaways", () => {
    const seekManifest = {
      ...v2BookendManifest,
      direction: [
        {
          sequence: 1,
          atMs: 3_000,
          kind: "camera",
          sourceMessageId: "message-1",
          payload: { shot: "left" },
        },
        {
          sequence: 2,
          atMs: 7_100,
          kind: "camera",
          sourceMessageId: "message-2",
          payload: { shot: "wide" },
        },
      ],
    } as ReplayManifestV2;
    const sceneAt = (camera: "left" | "right" | "wide") => ({
      ...replayScene({
        "host-1": participantScene(),
        "guest-1": participantScene({ speaking: true, audible: true }),
      }),
      camera,
    });
    const beforeCutaway = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 7_000,
      manifest: seekManifest,
      scene: sceneAt("left"),
      activeMessage: episode.messages[1] ?? null,
      preferDirectedCamera: true,
    });
    const duringCutaway = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 7_200,
      manifest: seekManifest,
      scene: sceneAt("wide"),
      activeMessage: episode.messages[1] ?? null,
      preferDirectedCamera: true,
    });
    const seekBack = signalFaithfulReplayCameraState({
      episode,
      timeline,
      replayElapsedMs: 7_000,
      manifest: seekManifest,
      scene: sceneAt("left"),
      activeMessage: episode.messages[1] ?? null,
      preferDirectedCamera: true,
    });

    assert.equal(beforeCutaway.shot, "right");
    assert.equal(duringCutaway.shot, "wide");
    assert.deepEqual(seekBack, beforeCutaway);
  });

  it("keeps fixed camera modes fixed during replay speech and thinking", () => {
    const fixedEpisode = episodeWithCameraEvents([
      {
        kind: "camera_mode",
        payload: { atMs: 0, mode: "left", shot: "left" },
      },
    ]);
    const fixed = signalFaithfulReplayCameraState({
      episode: fixedEpisode,
      timeline,
      replayElapsedMs: 7_000,
      scene: replayScene({
        "host-1": participantScene({ thinking: true }),
        "guest-1": participantScene({ speaking: true }),
      }),
      activeMessage: fixedEpisode.messages[1] ?? null,
    });

    assert.equal(fixed.shot, "left");
  });

  it("drives the canonical stage from the active frozen utterance", () => {
    const frame = signalReplayVideoFrameState({
      episode,
      timeline,
      videoElapsedMs: 7_000,
    });
    assert.equal(frame.messageIndex, 1);
    assert.deepEqual(frame.activeMessageIndexes, [1]);
    assert.equal(frame.shot, "wide");
    assert.equal(frame.guestDeparted, false);
    assert.equal(frame.hostDeparted, false);
  });
});
