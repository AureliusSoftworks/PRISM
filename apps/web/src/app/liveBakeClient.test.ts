import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBakeProgressRatio } from "./liveBakeClient.ts";
import type { LiveBakeArtifactV1 } from "@localai/shared";

describe("liveBakeClient", () => {
  it("maps bake progress into a 0–1 ratio", () => {
    const artifact = {
      progress: { completedSteps: 3, totalStepsEstimate: 12, phaseLabel: "Baking" },
    } as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), 0.25);
  });

  it("returns null when total steps are unknown", () => {
    const artifact = {
      progress: { completedSteps: 3, totalStepsEstimate: null, phaseLabel: "Baking" },
    } as LiveBakeArtifactV1;
    assert.equal(liveBakeProgressRatio(artifact), null);
  });
});
