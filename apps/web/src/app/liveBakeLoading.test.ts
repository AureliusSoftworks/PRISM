import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  liveBakeProgressLabel,
  liveBakeProgressPercent,
  liveBakeStatusCopy,
  liveBakeSurfaceTitle,
} from "./liveBakeLoading.ts";
import { createEmptyLiveBakeArtifact } from "@localai/shared";

describe("liveBakeLoading", () => {
  it("formats progress and status copy", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "debate",
      sourceId: "s1",
      title: "Gallery",
    });
    artifact.status = "baking";
    artifact.progress = {
      completedSteps: 2,
      totalStepsEstimate: 10,
      phaseLabel: "opening_for",
    };
    assert.equal(liveBakeProgressLabel(artifact.progress), "opening_for");
    assert.equal(liveBakeProgressPercent(artifact.progress), 20);
    assert.equal(liveBakeStatusCopy(artifact), "opening_for");
    assert.equal(liveBakeSurfaceTitle("signal"), "Preparing the broadcast");
  });
});
