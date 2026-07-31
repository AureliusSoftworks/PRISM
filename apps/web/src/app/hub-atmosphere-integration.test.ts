import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const cleanupSource = readFileSync(
  new URL("../../../api/src/image-asset-cleanup.ts", import.meta.url),
  "utf8",
);

describe("Home atmosphere integration", () => {
  it("uses one account-level style catalog in setup and Appearance settings", () => {
    assert.match(pageSource, /activeStep\.id === "atmosphere"/u);
    assert.match(pageSource, /data-atmosphere-style-selector="true"/u);
    assert.equal(pageSource.match(/HUB_ATMOSPHERE_STYLES\.map/gu)?.length, 2);
    assert.match(pageSource, /Atmosphere & graphics/u);
    assert.match(pageSource, /data-home-atmosphere-settings="true"/u);
    assert.match(pageSource, /Home Atmosphere wallpaper/u);
  });

  it("prepares a server-owned prompt without player or bot context", () => {
    assert.match(pageSource, /purpose: HUB_ATMOSPHERE_IMAGE_PURPOSE/u);
    const requestStart = pageSource.indexOf(
      "const requestHubAtmosphereGeneration =",
    );
    const requestEnd = pageSource.indexOf(
      "async function saveAndAdvanceDesktopFirstRunStep",
      requestStart,
    );
    assert.notEqual(requestStart, -1);
    assert.notEqual(requestEnd, -1);
    assert.doesNotMatch(
      pageSource.slice(requestStart, requestEnd),
      /preferredProvider/u,
    );
    assert.match(
      apiSource,
      /prompt = composeHubAtmospherePrompt\(hubAtmosphereStyle, randomId\(\)\)/u,
    );
    assert.match(
      apiSource,
      /Home Atmosphere generation cannot be attributed to a bot or conversation/u,
    );
    assert.match(
      pageSource.slice(requestStart, requestEnd),
      /if \(!generatedImageId\)/u,
    );
  });

  it("shows a cached Home image automatically with a reduced-motion fallback", () => {
    assert.match(pageSource, /loading="eager"/u);
    assert.match(pageSource, /fetchPriority="high"/u);
    assert.match(
      pageSource,
      /settings\?\.hubAtmosphereEnabled && hubAtmosphereImageId/u,
    );
    assert.match(pageSource, /data-visible="true"/u);
    assert.match(cssSource, /@keyframes hubAtmospherePrismReveal/u);
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hubAtmosphereBackdrop/u,
    );
  });

  it("keeps Home quick toggles out of navigation and Zen Atmosphere in Settings", () => {
    const requestStart = pageSource.indexOf(
      "const requestHubAtmosphereGeneration =",
    );
    const requestEnd = pageSource.indexOf(
      "async function saveAndAdvanceDesktopFirstRunStep",
      requestStart,
    );
    assert.match(
      pageSource.slice(requestStart, requestEnd),
      /!settings\.hubAtmosphereEnabled/u,
    );
    assert.doesNotMatch(pageSource, /showAtmosphere && !hubAtmosphereSurface/u);
    assert.doesNotMatch(
      pageSource,
      /showZenAtmosphereButton && !hubAtmosphereSurface/u,
    );
    assert.doesNotMatch(pageSource, /Reveal Home Atmosphere/u);
    assert.doesNotMatch(pageSource, /Hide Home Atmosphere/u);
    assert.doesNotMatch(pageSource, /Turn on Zen Atmosphere/u);
    assert.doesNotMatch(pageSource, /Turn off Zen Atmosphere/u);
    assert.match(
      pageSource,
      /Enable Atmosphere for this conversation/u,
    );
    assert.match(pageSource, /Generate Atmosphere now/u);
    assert.match(
      pageSource,
      /data-tutorial-target=\{\s*view === "chat" \? "zen-atmosphere" : undefined\s*\}/u,
    );
    assert.doesNotMatch(
      pageSource,
      /id: "atmosphere",[\s\S]{0,180}kind: "toggle"/u,
    );
  });

  it("protects the selected Home image from generated-image cleanup", () => {
    assert.match(
      cleanupSource,
      /addExactReference\(row\.hub_atmosphere_image_id, "Current Home atmosphere"\)/u,
    );
  });
});
