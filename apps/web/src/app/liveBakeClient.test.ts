import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBakeProgressRatio } from "./liveBakeClient.ts";
import {
  createLiveBakePlannedSynthesisTiming,
  LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS,
  LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL,
  LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL,
  type LiveBakeArtifactV1,
} from "@localai/shared";

describe("liveBakeClient", () => {
  it("maps bake progress into a 0–1 ratio", () => {
    const artifact = {
      progress: { completedSteps: 3, totalStepsEstimate: 12, phaseLabel: "Baking" },
    } as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), 0.25);
  });

  it("falls back to unlock progress while total steps are unknown", () => {
    // Servers only write totalStepsEstimate once a bake finishes, so the
    // pre-start loader would otherwise sit with a dead bar for the whole hold.
    const artifact = {
      surface: "signal",
      status: "baking",
      progress: {
        completedSteps: LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL,
        totalStepsEstimate: null,
        phaseLabel: "Baking",
      },
      utterances: [
        {
          durationMs: LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL / 2,
          spokenText: "",
          text: "",
        },
      ],
    } as unknown as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), 0.5);
  });

  it("includes bounded planned Premium runway in pre-watch progress", () => {
    const artifact = {
      surface: "signal",
      status: "baking",
      plannedSynthesisTiming:
        createLiveBakePlannedSynthesisTiming("elevenlabs"),
      progress: {
        completedSteps: LIVE_BAKE_UNLOCK_MIN_STEPS_SIGNAL,
        totalStepsEstimate: null,
        phaseLabel: "Baking",
      },
      utterances: [
        {
          audioUrl: null,
          voiceEngine: "unknown",
          isPremium: false,
          durationMs:
            (LIVE_BAKE_UNLOCK_BUFFER_MS_SIGNAL +
              LIVE_BAKE_PREMIUM_SYNTHESIS_MAX_RUNWAY_MS) /
            2,
          spokenText: "",
          text: "",
        },
      ],
    } as unknown as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), 0.5);
  });

  it("reads a bake with no utterances yet as zero, not a crash", () => {
    const artifact = {
      surface: "signal",
      status: "baking",
      progress: { completedSteps: 0, totalStepsEstimate: null, phaseLabel: "Baking" },
    } as unknown as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), 0);
  });
});
