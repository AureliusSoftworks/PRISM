import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateZenAtmosphereLayerOpacitiesForReader,
  calculateZenAtmosphereLayerStatesForReader,
  maxZenAtmosphereLayerOpacity,
  zenAtmosphereGrayscaleAmount,
} from "./zenAtmosphere.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("zenAtmosphereGrayscaleAmount", () => {
  it("always desaturates persona Atmosphere wallpapers", () => {
    assert.equal(zenAtmosphereGrayscaleAmount(true), "1");
  });

  it("keeps default Prism Atmosphere wallpapers in full color", () => {
    assert.equal(zenAtmosphereGrayscaleAmount(false), "0");
  });

  it("does not expose the legacy grayscale preference in Zen settings", () => {
    assert.doesNotMatch(pageSource, />\s*Grayscale atmosphere\s*</);
    assert.doesNotMatch(
      pageSource,
      /settings-control-info-zen-wallpaper-grayscale/
    );
  });

  it("does not let the stored legacy preference drive wallpaper rendering", () => {
    const backdropStyleSource = pageSource.slice(
      pageSource.indexOf("const zenAtmosphereBackdropStyle ="),
      pageSource.indexOf("const zenFirstReplyPending")
    );

    assert.match(
      backdropStyleSource,
      /zenAtmosphereGrayscaleAmount\(\s*composeBotAccentId !== null/
    );
    assert.doesNotMatch(
      backdropStyleSource,
      /zenWallpaperGrayscaleEnabled/
    );
  });
});

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

  it("fades a generated-only Atmosphere layer by scrolled distance", () => {
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

  it("keeps a starting wallpaper visible as the baseline layer", () => {
    const timeline = [
      {
        imageId: "baseline",
        generationMessageCount: 0,
        startsVisible: true,
      },
      {
        imageId: "first",
        generationMessageCount: 4,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 0,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { baseline: 1, first: 0 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 600,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { baseline: 0.5, first: 0.5 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 800,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { baseline: 0, first: 1 }
    );
  });

  it("fades later generated Atmosphere layers by scrolled distance", () => {
    const timeline = [
      {
        imageId: "first",
        generationMessageCount: 2,
      },
      {
        imageId: "second",
        generationMessageCount: 7,
      },
    ];

    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 700,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 1, second: 0 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 900,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0.5, second: 0.5 }
    );
    assert.deepEqual(
      calculateZenAtmosphereLayerOpacitiesForReader({
        timeline,
        readerY: 1200,
        revealScrollDistancePx: 400,
        messageCountToY,
      }),
      { first: 0, second: 1 }
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

describe("calculateZenAtmosphereLayerStatesForReader", () => {
  const messageCountToY = (messageCount: number): number => messageCount * 100;

  it("returns bounded parallax with layer opacity", () => {
    const states = calculateZenAtmosphereLayerStatesForReader({
      timeline: [
        {
          imageId: "baseline",
          generationMessageCount: 0,
          startsVisible: true,
        },
      ],
      readerY: 1200,
      revealScrollDistancePx: 400,
      messageCountToY,
      parallaxRate: 0.2,
      parallaxMaxPx: 24,
    });

    assert.deepEqual(states, {
      baseline: {
        opacity: 1,
        parallaxY: -24,
      },
    });
  });

  it("does not move a hidden upcoming layer before its anchor", () => {
    const states = calculateZenAtmosphereLayerStatesForReader({
      timeline: [
        {
          imageId: "first",
          generationMessageCount: 6,
        },
      ],
      readerY: 500,
      revealScrollDistancePx: 400,
      messageCountToY,
      parallaxRate: 0.2,
      parallaxMaxPx: 24,
    });

    assert.deepEqual(states, {
      first: {
        opacity: 0,
        parallaxY: 0,
      },
    });
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
