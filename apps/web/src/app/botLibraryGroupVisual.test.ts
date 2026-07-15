import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  botLibraryGroupGradientColors,
  buildBotLibraryGroupGradient,
  buildBotLibraryGroupVisualVariables,
  normalizeBotLibraryGroupOklch,
} from "./botLibraryGroupVisual.ts";

describe("bot library group visual atmosphere", () => {
  const bots = [
    { color: "#8b5cf6" },
    { color: "#06b6d4" },
    { color: "#f59e0b" },
    { color: "#ef4444" },
    { color: "#22c55e" },
  ];

  it("normalizes member colors in bounded perceptual OKLCH space", () => {
    const light = normalizeBotLibraryGroupOklch("#ffff00", "light");
    const dark = normalizeBotLibraryGroupOklch("#000033", "dark");

    assert.ok(light);
    assert.ok(dark);
    assert.ok(light.lightness >= 0.46 && light.lightness <= 0.68);
    assert.ok(light.chroma >= 0 && light.chroma <= 0.15);
    assert.ok(dark.lightness >= 0.52 && dark.lightness <= 0.72);
    assert.ok(dark.chroma >= 0 && dark.chroma <= 0.18);
  });

  it("uses every valid member color for compact two-to-five-bot groups", () => {
    assert.equal(botLibraryGroupGradientColors(bots.slice(0, 2), "dark").length, 2);
    assert.equal(botLibraryGroupGradientColors(bots, "light").length, 5);
  });

  it("builds deterministic theme-aware OKLCH gradients", () => {
    const dark = buildBotLibraryGroupGradient("group:friends", bots, "dark");
    const repeated = buildBotLibraryGroupGradient("group:friends", bots, "dark");
    const light = buildBotLibraryGroupGradient("group:friends", bots, "light");

    assert.equal(dark, repeated);
    assert.notEqual(dark, light);
    assert.match(dark, /oklch\(/);
    assert.doesNotMatch(dark, /#[0-9a-f]{6}/i);
  });

  it("falls back safely when a group has no valid member colors", () => {
    const variables = buildBotLibraryGroupVisualVariables(
      "group:legacy",
      [{ color: "invalid" }, { color: null }],
      "dark",
    );

    assert.match(variables["--bot-library-group-gradient"], /oklch\(/);
    assert.match(variables["--bot-library-group-accent"], /^#[0-9a-f]{6}$/i);
  });
});
