import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyGraphicsQualityToDocument,
  prismSceneQualityCeilingForGraphicsQuality,
} from "./graphicsQuality.ts";
import { PrismAdaptiveQualityController } from "./prismSceneRuntime.ts";

describe("player graphics quality", () => {
  it("maps the Settings tiers to their scene ceilings and document gate", () => {
    const target = { documentElement: { dataset: {} as Record<string, string> } };
    assert.equal(applyGraphicsQualityToDocument(target, "medium"), "medium");
    assert.equal(target.documentElement.dataset.prismGraphicsQuality, "medium");
    assert.equal(prismSceneQualityCeilingForGraphicsQuality("high"), "full");
    assert.equal(
      prismSceneQualityCeilingForGraphicsQuality("medium"),
      "balanced",
    );
    assert.equal(prismSceneQualityCeilingForGraphicsQuality("low"), "minimal");
  });

  it("keeps High adaptive, caps Medium at balanced, and pins Low to minimal", () => {
    const high = new PrismAdaptiveQualityController(0, "full");
    const medium = new PrismAdaptiveQualityController(0, "balanced");
    const low = new PrismAdaptiveQualityController(0, "minimal");
    assert.equal(high.quality, "full");
    assert.equal(medium.quality, "balanced");
    assert.equal(low.quality, "minimal");

    assert.equal(low.setCeiling("full", 3_000), "full");
    assert.equal(low.quality, "full");
    assert.equal(low.setCeiling("balanced", 6_000), "balanced");
    assert.equal(low.quality, "balanced");
  });
});
