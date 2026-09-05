import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE,
  LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
  LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES,
  LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
  liveBakePlannedSynthesisRunwayMs,
  liveBakeRequiredBufferMs,
} from "@localai/shared";
import { buildSignalLiveBakeArtifactFromEpisode } from "../live-bake.ts";
import type { getBotcastEpisode } from "../botcast.ts";

function episodeFixture(responseMode: "local" | "online") {
  return {
    id: `episode-${responseMode}`,
    title: "Live bake voice attribution",
    topic: "Timing",
    responseMode,
    status: "live",
    segment: "opening",
    messages: [
      {
        id: "message-1",
        botId: "host-1",
        speakerRole: "host",
        content: "The opening line is ready for playback.",
      },
      {
        id: "message-2",
        botId: "guest-1",
        speakerRole: "guest",
        content: "The reply is ready too.",
      },
    ],
    events: [],
  } as unknown as ReturnType<typeof getBotcastEpisode>;
}

describe("live bake voice attribution", () => {
  it("derives planned Premium timing without claiming synthesized Signal audio", () => {
    const episode = episodeFixture("online");

    for (const status of ["baking", "cancelled", "failed", "ready"] as const) {
      const artifact = buildSignalLiveBakeArtifactFromEpisode(episode, {
        status,
        plannedSynthesisEngine: "elevenlabs",
      });

      assert.ok(
        artifact.utterances.every(
          (utterance) =>
            utterance.audioUrl === null &&
            utterance.voiceEngine === "unknown" &&
            !utterance.isPremium,
        ),
      );
      assert.deepEqual(artifact.plannedSynthesisTiming, {
        engine: "elevenlabs",
        estimatedLatencyMsPerTake:
          LIVE_BAKE_PREMIUM_SYNTHESIS_LATENCY_MS_PER_TAKE,
        runwayTakeCount: LIVE_BAKE_PREMIUM_SYNTHESIS_RUNWAY_TAKES,
      });
      assert.equal(
        liveBakePlannedSynthesisRunwayMs(artifact),
        LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
      );
      assert.equal(
        liveBakeRequiredBufferMs(artifact),
        LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL +
          LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
      );
    }
  });

  it("keeps explicit local, fallback, and LOCAL-mode Signal artifacts non-Premium", () => {
    const onlineEpisode = episodeFixture("online");

    for (const voiceEngine of ["local", "browser", "unknown"] as const) {
      const artifact = buildSignalLiveBakeArtifactFromEpisode(onlineEpisode, {
        status: "baking",
        plannedSynthesisEngine: voiceEngine,
      });
      assert.ok(
        artifact.utterances.every(
          (utterance) =>
            utterance.audioUrl === null &&
            utterance.voiceEngine === "unknown" &&
            !utterance.isPremium,
        ),
      );
      assert.deepEqual(artifact.plannedSynthesisTiming, {
        engine: voiceEngine,
        estimatedLatencyMsPerTake: 0,
        runwayTakeCount: 0,
      });
      assert.equal(liveBakePlannedSynthesisRunwayMs(artifact), 0);
    }

    const localArtifact = buildSignalLiveBakeArtifactFromEpisode(
      episodeFixture("local"),
      { status: "baking", plannedSynthesisEngine: "elevenlabs" },
    );
    assert.ok(
      localArtifact.utterances.every(
        (utterance) =>
          utterance.audioUrl === null &&
          utterance.voiceEngine === "local" &&
          !utterance.isPremium,
      ),
    );
    assert.deepEqual(localArtifact.plannedSynthesisTiming, {
      engine: "local",
      estimatedLatencyMsPerTake: 0,
      runwayTakeCount: 0,
    });
    assert.equal(liveBakePlannedSynthesisRunwayMs(localArtifact), 0);
  });
});
