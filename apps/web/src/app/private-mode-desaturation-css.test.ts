import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("private mode style contract", () => {
  it("forces wallpapers fully desaturated in private mode", () => {
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.hubAtmosphereBackdrop\s+img[\s\S]*?grayscale\(1\)/,
    );
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.zenAtmosphereBackdrop[\s\S]*?--zen-atmosphere-grayscale-amount:\s*1/,
    );
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.botGroupRoomAtmosphereBackdrop[\s\S]*?--bot-group-room-atmosphere-grayscale:\s*1/,
    );
    assert.match(
      pageSource,
      /appWidePrivateMode\s*\?\s*"1"\s*:\s*zenAtmosphereGrayscaleAmount/,
    );
  });

  it("desaturates chrome without touching navbar side panels or hue lens", () => {
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\[data-shared-app-navbar="true"\][\s\S]*?filter:\s*grayscale\(1\)/,
    );
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.compose[\s\S]*?filter:\s*grayscale\(1\)/,
    );
    assert.match(
      css,
      /hue lens keeps its spectrum track/,
    );
    assert.doesNotMatch(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.hueLensSlider[\s\S]*?background-image:\s*none/,
    );
    assert.doesNotMatch(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.panel\b[\s\S]{0,80}filter:\s*grayscale\(1\)/,
    );
  });

  it("flattens chrome rainbow marks to white in dark and black in light", () => {
    assert.match(css, /--private-chrome-rainbow:\s*#ffffff/);
    assert.match(
      css,
      /\.themeLight\.appLayout\[data-private-active="true"\][\s\S]*?--private-chrome-rainbow:\s*#000000/,
    );
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]:not\(\.themeLight\)\s+\.brandWordmark[\s\S]*?brightness\(0\)\s*invert\(1\)/,
    );
  });

  it("keeps full bot-color saturation and upside-down glyphs", () => {
    assert.match(
      pageSource,
      /Private mode keeps full bot-color saturation/,
    );
    assert.doesNotMatch(
      css,
      /\.chatBotPickerFrame[\s\S]*?filter:\s*saturate\(0\.5\)/,
    );
    assert.match(
      css,
      /\.appLayout\[data-private-active="true"\]\s+\.chatBotTileBotGlyph\s+>\s+svg[\s\S]*?rotate\(180deg\)/,
    );
  });

  it("renders the private default Prism mark as an inverted glowing triangle", () => {
    assert.match(pageSource, /styles\.emptyStatePrivatePrismTriangle/);
    assert.match(
      css,
      /\.emptyStatePrivatePrismTriangle\s*\{[\s\S]*?rotate\(180deg\)/,
    );
    assert.match(
      css,
      /\.emptyStatePrivatePrismTriangle\s*\{[\s\S]*?#ffffff/,
    );
    assert.match(
      css,
      /\.themeLight\s+\.emptyStatePrivatePrismTriangle\s*\{[\s\S]*?#0f0f0f/,
    );
  });
});
