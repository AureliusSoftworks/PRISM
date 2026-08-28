import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ModelReasoningEffortCapabilityV1 } from "@localai/shared";
import {
  MODEL_EFFORT_ICON_PATHS,
  MODEL_EFFORT_DEFAULT_ICON_PATH,
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
  supportsMax: false,
};

const autoIconSource = readFileSync(
  new URL("../../public/reasoning-effort/auto.svg", import.meta.url),
  "utf8",
);
const defaultIconSource = readFileSync(
  new URL("../../public/reasoning-effort/default.svg", import.meta.url),
  "utf8",
);
const minimalIconSource = readFileSync(
  new URL("../../public/reasoning-effort/minimal.svg", import.meta.url),
  "utf8",
);

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
    assert.equal(MODEL_EFFORT_ICON_PATHS.auto, MODEL_EFFORT_DEFAULT_ICON_PATH);
    assert.equal(MODEL_EFFORT_ICON_PATHS.auto, "/reasoning-effort/default.svg");
    assert.equal(
      MODEL_EFFORT_ICON_PATHS.minimal,
      "/reasoning-effort/minimal.svg",
    );
    assert.notEqual(
      MODEL_EFFORT_ICON_PATHS.auto,
      MODEL_EFFORT_ICON_PATHS.minimal,
    );
  });

  it("keeps Default filled, Auto triangular, and Minimal on its local glyph", () => {
    const defaultCircleMatch = defaultIconSource.match(/<circle[^>]*>/u)?.[0];
    assert.ok(defaultCircleMatch);
    assert.ok(!defaultCircleMatch.includes("points="));
    const noneCircleMatch = readFileSync(
      new URL("../../public/reasoning-effort/none.svg", import.meta.url),
      "utf8",
    ).match(/<path[^>]*>/u)?.[0];
    assert.ok(noneCircleMatch);
    assert.notEqual(noneCircleMatch, defaultCircleMatch);
    const minimalPoints = minimalIconSource.match(/points="([^"]+)"/u)?.[1];
    const autoPoints = autoIconSource.match(/points="([^"]+)"/u)?.[1];
    assert.ok(minimalPoints);
    assert.equal(autoPoints, "48.425 0 96.85 83.87 0 83.87");
    assert.match(minimalIconSource, /rotate\(180 48\.425 41\.935\)/u);
    assert.notEqual(MODEL_EFFORT_ICON_PATHS.none, MODEL_EFFORT_ICON_PATHS.minimal);
    assert.doesNotMatch(MODEL_EFFORT_ICON_PATHS.minimal, /default\.svg$/u);
    assert.match(defaultIconSource, /<circle[^>]*>/u);
    assert.notEqual(autoPoints, minimalPoints);
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
      supportsMax: false,
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

  it("uses Default then Minimal through High for Ollama thinking models", () => {
    const thinkingCapability: ModelReasoningEffortCapabilityV1 = {
      mode: "native-thinking",
      levels: ["minimal", "low", "medium", "high"],
      supportsNone: false,
      supportsMax: false,
    };
    const levels = modelEffortSliderLevels(thinkingCapability);
    assert.equal(modelEffortBaseline(thinkingCapability), "auto");
    assert.equal(
      modelEffortValueForCapability(thinkingCapability, undefined),
      "auto",
    );
    assert.equal(
      modelEffortValueForCapability(thinkingCapability, "none"),
      "auto",
    );
    assert.equal(modelEffortValueForCapability(thinkingCapability, "minimal"), "minimal");
    assert.equal(modelEffortValueForCapability(thinkingCapability, "high"), "high");
    assert.deepEqual(levels, [
      "auto",
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    assert.equal(levels.includes("none"), false);
    assert.equal(levels.includes("xhigh"), false);
  });

  it("clamps wheel and keyboard-style stepping to available levels", () => {
    const levels = modelEffortSliderLevels({
      mode: "native",
      levels: ["low", "medium", "high"],
      supportsNone: false,
      supportsMax: false,
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
