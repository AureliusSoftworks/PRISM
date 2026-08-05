import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyLiveBakeArtifact,
  estimateSpokenDurationMs,
  isLiveBakeArtifactV1,
  LIVE_BAKE_PREMIUM_UPGRADE_SEAM,
  LIVE_BAKE_UNLOCK_BUFFER_MS,
  LIVE_BAKE_UNLOCK_MIN_STEPS_DEBATE,
  liveBakeArtifactIsPlayable,
  liveBakeBufferedPlaybackMs,
  liveBakeMayStartWatch,
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

  it("documents the Premium upgrade seam for deferred surfaces", () => {
    assert.equal(LIVE_BAKE_PREMIUM_UPGRADE_SEAM.referenceSurface, "signal");
    assert.deepEqual(LIVE_BAKE_PREMIUM_UPGRADE_SEAM.deferredSurfaces, [
      "coffee",
      "debate",
    ]);
  });
});
