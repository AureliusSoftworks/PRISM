import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateZenAtmosphereLayerOpacitiesForReader,
  maxZenAtmosphereLayerOpacity,
} from "./zenAtmosphere.ts";

describe("calculateZenAtmosphereLayerOpacitiesForReader", () => {
  const messageCountToY = (messageCount: number): number => messageCount * 100;

  it("starts factory-default Zen with no wallpaper layers", () => {
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline: [],
        readerY: 300,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      {}
    );
  });

  it("keeps the first Atmosphere layer invisible before its generated message", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 4,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 350,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0 }
    );
  });

  it("fades a generated Atmosphere layer by scrolled distance", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 2,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 200,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 400,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0.5 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 700,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 1 }
    );
  });

  it("keeps the previous wallpaper visible until the next scroll-distance crossfade", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 2,
      },
      {
        imageId: "second",
        generationMessageCount: 10,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 900,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 1, second: 0 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 1200,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0.5, second: 0.5 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 1500,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0, second: 1 }
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
