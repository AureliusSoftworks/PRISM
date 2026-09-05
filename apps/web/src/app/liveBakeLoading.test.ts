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
    assert.equal(liveBakeProgressLabel(artifact.progress), "For side opening");
    assert.equal(liveBakeProgressPercent(artifact.progress), 20);
    assert.equal(liveBakeStatusCopy(artifact), "For side opening");
    assert.equal(
      liveBakeProgressLabel({
        completedSteps: 3,
        totalStepsEstimate: 10,
        phaseLabel: "opening_against",
      }),
      "Against side opening",
    );
    assert.equal(
      liveBakeProgressLabel({
        completedSteps: 4,
        totalStepsEstimate: 10,
        phaseLabel: "rebuttal_for_1",
      }),
      "For rebuttal · round 1",
    );
    assert.equal(liveBakeSurfaceTitle("signal"), "Preparing the broadcast");
  });

  it("exposes a terminal Signal bake error instead of a misleading pending label", () => {
    const artifact = createEmptyLiveBakeArtifact({
      surface: "signal",
      sourceId: "signal-image-run",
      title: "Image-led interview",
    });
    artifact.status = "failed";
    artifact.error = "Signal could not prepare the attached image.";

    assert.equal(
      liveBakeStatusCopy(artifact),
      "Signal could not prepare the attached image.",
    );
  });
});
