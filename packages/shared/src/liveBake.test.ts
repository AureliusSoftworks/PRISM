import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyLiveBakeArtifact,
  isLiveBakeArtifactV1,
  LIVE_BAKE_PREMIUM_UPGRADE_SEAM,
  liveBakeArtifactIsPlayable,
  liveBakeVoiceIsPremium,
} from "./liveBake.js";

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
    artifact.utterances.push({
      id: "u1",
      sourceEventId: "e1",
      speakerId: "host",
      speakerRole: "host",
      text: "Hello",
      spokenText: "Hello",
      voiceEngine: "local",
      isPremium: false,
      audioUrl: null,
      durationMs: null,
    });
    assert.equal(liveBakeArtifactIsPlayable(artifact), true);
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
