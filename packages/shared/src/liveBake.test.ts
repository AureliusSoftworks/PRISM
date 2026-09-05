import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyLiveBakeArtifact,
  createLiveBakePlannedSynthesisTiming,
  estimateSpokenDurationMs,
  humanizeLiveBakePhaseLabel,
  isLiveBakeArtifactV1,
  LIVE_BAKE_PREMIUM_UPGRADE_SEAM,
  LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE,
  LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
  LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES,
  LIVE_BAKE_UNLOCK_BUFFER_MS,
  LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
  LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE,
  LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL,
  liveBakeArtifactIsPlayable,
  liveBakeBufferedPlaybackMs,
  liveBakeMayStartWatch,
  liveBakePlannedSynthesisRunwayMs,
  liveBakeRequiredBufferMs,
  liveBakeShouldResumeOnOpen,
  liveBakeVoiceIsPremium,
  type LiveBakeUtteranceV1,
} from "./liveBake.ts";

function makeUtterance(
  overrides: Partial<LiveBakeUtteranceV1> & { id: string; text: string },
): LiveBakeUtteranceV1 {
  return {
    sourceEventId: overrides.sourceEventId ?? overrides.id,
    speakerId: "bot",
    speakerRole: "speaker",
    spokenText: overrides.spokenText ?? overrides.text,
    voiceEngine: "local",
    isPremium: false,
    audioUrl: null,
    durationMs: overrides.durationMs ?? null,
    ...overrides,
  };
}

describe("liveBake", () => {
  it("creates an empty pending artifact", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "debate",
      sourceId: "session-1",
      title: "Gallery watch",
      privacyMode: "local",
    });
    assert.equal(artifact.kind, "liveBake");
    assert.equal(artifact.status, "pending");
    assert.equal(isLiveBakeArtifactV1(artifact), true);
    assert.equal(liveBakeArtifactIsPlayable(artifact), false);
  });

  it("treats ready artifacts with utterances as playable", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "signal",
      sourceId: "ep-1",
      title: "Watch",
    });
    artifact.status = "ready";
    artifact.utterances.push(
      makeUtterance({ id: "u1", text: "Hello", sourceEventId: "e1", speakerId: "host", speakerRole: "host" }),
    );
    assert.equal(liveBakeArtifactIsPlayable(artifact), true);
  });

  it("estimates spoken duration from text when durationMs is missing", () => {
    const short = estimateSpokenDurationMs("Hello there");
    const long = estimateSpokenDurationMs(
      "This is a longer line with enough words to stretch beyond the minimum estimate window.",
    );
    assert.ok(short >= 1_200);
    assert.ok(long > short);
  });

  it("requires both buffer and min steps before early watch unlock", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "debate",
      sourceId: "session-2",
      title: "Gallery",
    });
    artifact.status = "baking";
    for (let i = 0; i < LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE; i += 1) {
      artifact.utterances.push(
        makeUtterance({
          id: `u${i}`,
          text: "word ".repeat(20),
          durationMs: 5_000,
        }),
      );
    }
    artifact.progress.completedSteps = LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE;
    // 6 * 5s = 30s — under buffer even with min steps.
    assert.equal(liveBakeMayStartWatch(artifact, 0), false);
    assert.equal(liveBakeArtifactIsPlayable(artifact), false);

    artifact.utterances = artifact.utterances.map((row, index) => ({
      ...row,
      durationMs: Math.ceil(LIVE_BAKE_UNLOCK_BUFFER_MS / LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE) + index,
    }));
    assert.ok(liveBakeBufferedPlaybackMs(artifact) >= LIVE_BAKE_UNLOCK_BUFFER_MS);
    assert.equal(liveBakeMayStartWatch(artifact, 0), true);
    assert.equal(liveBakeArtifactIsPlayable(artifact), true);
  });

  it("holds a Signal watch until the opening stretch is really ahead", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "signal",
      sourceId: "episode-1",
      title: "Watch",
    });
    artifact.status = "baking";
    for (let index = 0; index < LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL; index += 1) {
      artifact.utterances.push(
        makeUtterance({
          id: `signal-u${index}`,
          text: "A settled Signal opening line.",
          durationMs: 1_000 + index,
        }),
      );
    }
    artifact.progress.completedSteps = LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL;
    // Enough settled steps, nowhere near enough buffered playback. Unlocking
    // here is what put the viewer on the baker's heels and reopened the
    // fullscreen loader on the first slow beat.
    assert.ok(LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL > 0);
    assert.ok(LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL < LIVE_BAKE_UNLOCK_BUFFER_MS);
    assert.ok(
      liveBakeBufferedPlaybackMs(artifact) < LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
    );
    assert.equal(liveBakeMayStartWatch(artifact, 0), false);
    assert.equal(liveBakeArtifactIsPlayable(artifact), false);

    // One very long opening line clears the time buffer but not the step floor.
    const singleLongLine = {
      ...artifact,
      utterances: [
        makeUtterance({
          id: "signal-wide",
          text: "One very long opening monologue.",
          durationMs: LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL + 5_000,
        }),
      ],
      progress: { ...artifact.progress, completedSteps: 1 },
    };
    assert.equal(liveBakeMayStartWatch(singleLongLine, 0), false);

    artifact.utterances = artifact.utterances.map((row, index) => ({
      ...row,
      durationMs:
        Math.ceil(
          LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL / LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL,
        ) + index,
    }));
    assert.ok(
      liveBakeBufferedPlaybackMs(artifact) >= LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
    );
    assert.equal(liveBakeMayStartWatch(artifact, 0), true);
    assert.equal(liveBakeArtifactIsPlayable(artifact), true);
  });

  it("resumes cancelled or stale baking jobs on open", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "debate",
      sourceId: "session-3",
      title: "Gallery",
    });
    artifact.status = "cancelled";
    assert.equal(liveBakeShouldResumeOnOpen(artifact), true);
    artifact.status = "ready";
    assert.equal(liveBakeShouldResumeOnOpen(artifact), false);
    artifact.status = "baking";
    artifact.progress.heartbeatAt = new Date(Date.now() - 60_000).toISOString();
    assert.equal(liveBakeShouldResumeOnOpen(artifact), true);
    artifact.progress.heartbeatAt = new Date().toISOString();
    assert.equal(liveBakeShouldResumeOnOpen(artifact), false);
  });

  it("marks elevenlabs takes as Premium by default", () => {
    assert.equal(liveBakeVoiceIsPremium("elevenlabs"), true);
    assert.equal(liveBakeVoiceIsPremium("local"), false);
    assert.equal(liveBakeVoiceIsPremium("elevenlabs", false), false);
  });

  it("reserves Premium synthesis runway before unlocking playback", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "signal",
      sourceId: "premium-episode",
      title: "Premium Watch",
    });
    artifact.status = "baking";
    artifact.plannedSynthesisTiming =
      createLiveBakePlannedSynthesisTiming("elevenlabs");
    artifact.utterances = Array.from(
      { length: LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL },
      (_, index) =>
        makeUtterance({
          id: `premium-${index}`,
          text: "Planned Premium line",
          voiceEngine: "unknown",
          isPremium: false,
          durationMs: 8_000,
        }),
    );
    artifact.progress.completedSteps = artifact.utterances.length;
    assert.equal(
      liveBakePlannedSynthesisRunwayMs(artifact),
      LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
    );
    assert.equal(
      LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
      LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE *
        LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES,
    );
    assert.ok(
      artifact.utterances.every(
        (utterance) =>
          utterance.audioUrl === null &&
          utterance.voiceEngine === "unknown" &&
          !utterance.isPremium,
      ),
    );
    assert.equal(liveBakeMayStartWatch(artifact), false);

    const requiredMs = liveBakeRequiredBufferMs(artifact);
    artifact.utterances = Array.from(
      { length: Math.ceil(requiredMs / 8_000) },
      (_, index) =>
        makeUtterance({
          id: `premium-runway-${index}`,
          text: "Ordinary short planned Premium line",
          voiceEngine: "unknown",
          isPremium: false,
          durationMs: 8_000,
        }),
    );
    artifact.progress.completedSteps = artifact.utterances.length;
    assert.equal(liveBakePlannedSynthesisRunwayMs(artifact), 36_000);
    assert.ok(liveBakeBufferedPlaybackMs(artifact) >= requiredMs);
    assert.equal(liveBakeMayStartWatch(artifact), true);
  });

  it("adds zero planned runway for local, browser, unknown, and legacy artifacts", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "signal",
      sourceId: "local-episode",
      title: "Local Watch",
    });
    artifact.status = "baking";
    artifact.utterances = [
      makeUtterance({
        id: "already-premium",
        text: "An actual Premium take does not imply future synthesis intent.",
        voiceEngine: "elevenlabs",
        isPremium: true,
        audioUrl: "/audio/already-premium.mp3",
        durationMs: LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
      }),
    ];
    artifact.progress.completedSteps = artifact.utterances.length;

    for (const engine of ["local", "browser", "unknown"] as const) {
      artifact.plannedSynthesisTiming =
        createLiveBakePlannedSynthesisTiming(engine);
      assert.equal(liveBakePlannedSynthesisRunwayMs(artifact), 0);
      assert.equal(
        liveBakeRequiredBufferMs(artifact),
        LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
      );
    }

    delete artifact.plannedSynthesisTiming;
    assert.equal(isLiveBakeArtifactV1(artifact), true);
    assert.equal(liveBakePlannedSynthesisRunwayMs(artifact), 0);
  });

  it("documents the Premium upgrade seam for deferred surfaces", () => {
    assert.equal(LIVE_BAKE_PREMIUM_UPGRADE_SEAM.referenceSurface, "signal");
    assert.deepEqual(LIVE_BAKE_PREMIUM_UPGRADE_SEAM.deferredSurfaces, [
      "coffee",
      "debate",
    ]);
  });

  it("humanizes Debate bake step keys for loader copy", () => {
    assert.equal(humanizeLiveBakePhaseLabel("opening_for"), "For side opening");
    assert.equal(
      humanizeLiveBakePhaseLabel("opening_against"),
      "Against side opening",
    );
    assert.equal(
      humanizeLiveBakePhaseLabel("jury_initial_0"),
      "Jury first thoughts · seat 1",
    );
    assert.equal(
      humanizeLiveBakePhaseLabel("Preparing the gallery"),
      "Preparing the gallery",
    );
    assert.equal(humanizeLiveBakePhaseLabel("interview"), "Interview");
    assert.equal(humanizeLiveBakePhaseLabel(""), "Preparing…");
  });
});
