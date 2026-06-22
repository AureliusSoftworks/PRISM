import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateZenAtmosphereLayerOpacitiesForReader,
  maxZenAtmosphereLayerOpacity,
} from "./zenAtmosphere.ts";

describe("calculateZenAtmosphereLayerOpacitiesForReader", () => {
  const messageCountToY = (messageCount: number): number => messageCount * 100;

  it("keeps the first Atmosphere layer invisible before its reveal point", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 2,
        revealStartMessageCount: 4,
        revealFullMessageCount: 8,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 350,
        revealDelayMessageCount: 2,
        revealSpanMessageCount: 4,
        messageCountToY,
      }),
      { first: 0 }
    );
  });

  it("ramps the first Atmosphere layer through its reveal span", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 2,
        revealStartMessageCount: 4,
        revealFullMessageCount: 8,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 600,
        revealDelayMessageCount: 2,
        revealSpanMessageCount: 4,
        messageCountToY,
      }),
      { first: 0.5 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 900,
        revealDelayMessageCount: 2,
        revealSpanMessageCount: 4,
        messageCountToY,
      }),
      { first: 1 }
    );
  });
});

describe("maxZenAtmosphereLayerOpacity", () => {
  it("uses the strongest visible wallpaper layer for the readability overlay", () => {
    assert.equal(
      maxZenAtmosphereLayerOpacity({ hidden: -1, visible: 0.45, tooHigh: 1.2 }),
      1
    );
    assert.equal(maxZenAtmosphereLayerOpacity({ hidden: 0, fading: 0.35 }), 0.35);
  });
});
