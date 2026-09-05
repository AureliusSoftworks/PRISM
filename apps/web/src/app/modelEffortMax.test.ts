import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveModelReasoningEffortCapability } from "@localai/shared";
import {
  modelEffortRequestValue,
  modelEffortSliderLevels,
} from "./modelEffortControl.ts";

describe("native Max effort overdrive", () => {
  const maxCapability = resolveModelReasoningEffortCapability({
    provider: "openai",
    modelId: "gpt-5.6-sol",
  });

  it("keeps Max out of the ordinary slider while allowing request-only overdrive", () => {
    assert.deepEqual(modelEffortSliderLevels(maxCapability), [
      "auto",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    assert.equal(modelEffortRequestValue(maxCapability, "xhigh", true), "max");
    assert.equal(modelEffortRequestValue(maxCapability, "high", true), "high");
    assert.equal(modelEffortRequestValue(maxCapability, "xhigh", false), "xhigh");
  });

  it("cannot enable Max for simulated or non-Max native models", () => {
    const simulated = resolveModelReasoningEffortCapability({
      provider: "local",
      modelId: "qwen3:14b",
    });
    const olderNative = resolveModelReasoningEffortCapability({
      provider: "openai",
      modelId: "gpt-5.5",
    });
    assert.equal(modelEffortRequestValue(simulated, "xhigh", true), "xhigh");
    assert.equal(modelEffortRequestValue(olderNative, "xhigh", true), "xhigh");
  });

  it("unlocks Max above each Claude ladder's real top rung", () => {
    const capped = resolveModelReasoningEffortCapability({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
    });
    const distinct = resolveModelReasoningEffortCapability({
      provider: "anthropic",
      modelId: "claude-opus-4-8",
    });

    assert.deepEqual(modelEffortSliderLevels(capped), [
      "auto",
      "low",
      "medium",
      "high",
    ]);
    assert.equal(capped.supportsMax, true);
    assert.equal(modelEffortRequestValue(capped, "high", true), "max");
    assert.equal(modelEffortRequestValue(capped, "xhigh", true), "xhigh");
    assert.equal(distinct.supportsMax, true);
    assert.equal(modelEffortRequestValue(distinct, "high", true), "high");
    assert.equal(modelEffortRequestValue(distinct, "xhigh", true), "max");
  });

  it("wires transient clearing, request transport, provenance, and accessible UI", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
    assert.match(page, /const \[maxEffortTargetKey, setMaxEffortTargetKey\]/u);
    assert.match(
      page,
      /if \(nextValue !== modelReasoningEffortMaxUnlockLevel\(target\.capability\)\)[\s\S]*clearMaxEffortOverdrive/u,
    );
    assert.match(page, /requestReasoningEffort === "max"/u);
    assert.match(page, /aria-pressed=\{maxEffortActive\}/u);
    assert.match(page, /disabled=\{!maxEffortUnlocked\}/u);
    assert.match(page, /data-max-effort=\{maxEffortActive \? "true"/u);
    assert.match(page, /maxEffortActive \? \([\s\S]*composeModelMaxElectricity/u);
    assert.match(page, /key=\{`max-electric-\$\{renderTheme\}`\}/u);
    assert.match(page, /reasoningEffort: "max"/u);
    assert.match(page, /effectiveModelReasoningEffortForRequest\([\s\S]*maxEffortTargetKey/u);
    assert.match(page, /foregroundReasoningEffort=\{sharedAccountForegroundReasoningEffort\(\)\}/u);
    assert.match(
      css,
      /body\[data-prism-theme="light"\][\s\S]*composeModelMaxToggle/u,
    );
    assert.match(css, /\.composeModelMaxElectricity\s*\{[^}]*pointer-events:\s*none/u);
  });
});
