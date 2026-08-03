import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelReasoningEffortCapabilityV1 } from "@localai/shared";
import {
  MODEL_EFFORT_ICON_PATHS,
  modelEffortBaseline,
  modelEffortSliderLevels,
  modelEffortSliderProgress,
  modelEffortStep,
  modelEffortValueForCapability,
  modelEffortWheelDirection,
} from "./modelEffortControl.ts";

const modernCapability: ModelReasoningEffortCapabilityV1 = {
  mode: "native",
  levels: ["none", "minimal", "low", "medium", "high", "xhigh"],
  supportsNone: true,
};

describe("model effort slider", () => {
  it("maps every effort stop to Jared's supplied icon", () => {
    assert.deepEqual(Object.keys(MODEL_EFFORT_ICON_PATHS), [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("keeps the slider capability-aware and evenly positioned", () => {
    const levels = modelEffortSliderLevels(modernCapability);
    assert.deepEqual(levels, [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    assert.equal(modelEffortSliderProgress(levels, "auto"), 0);
    assert.equal(modelEffortSliderProgress(levels, "low"), 50);
    assert.equal(modelEffortSliderProgress(levels, "xhigh"), 100);
  });

  it("uses None as the baseline for simulated non-thinking models", () => {
    const simulatedCapability: ModelReasoningEffortCapabilityV1 = {
      mode: "simulated",
      levels: ["none", "minimal", "low", "medium", "high", "xhigh"],
      supportsNone: true,
    };
    const levels = modelEffortSliderLevels(simulatedCapability);
    assert.equal(modelEffortBaseline(simulatedCapability), "none");
    assert.equal(
      modelEffortValueForCapability(simulatedCapability, undefined),
      "none",
    );
    assert.equal(modelEffortValueForCapability(simulatedCapability, "auto"), "none");
    assert.equal(modelEffortValueForCapability(simulatedCapability, "high"), "high");
    assert.deepEqual(levels, [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    assert.equal(levels.includes("auto"), false);
    assert.equal(modelEffortSliderProgress(levels, "none"), 0);
    assert.equal(modelEffortSliderProgress(levels, "xhigh"), 100);
  });

  it("clamps wheel and keyboard-style stepping to available levels", () => {
    const levels = modelEffortSliderLevels({
      mode: "native",
      levels: ["low", "medium", "high"],
      supportsNone: false,
    });
    assert.equal(modelEffortStep(levels, "auto", -1), "auto");
    assert.equal(modelEffortStep(levels, "auto", 1), "low");
    assert.equal(modelEffortStep(levels, "medium", 1), "high");
    assert.equal(modelEffortStep(levels, "high", 1), "high");
    assert.equal(modelEffortWheelDirection(0, -12), -1);
    assert.equal(modelEffortWheelDirection(0, 12), 1);
    assert.equal(modelEffortWheelDirection(12, 1), 1);
  });
});
