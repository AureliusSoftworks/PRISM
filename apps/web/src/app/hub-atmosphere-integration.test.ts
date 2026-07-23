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
  });

  it("preloads the Home image and reveals it with a reduced-motion fallback", () => {
    assert.match(pageSource, /loading="eager"/u);
    assert.match(pageSource, /fetchPriority="high"/u);
    assert.match(pageSource, /Reveal Home Atmosphere/u);
    assert.match(cssSource, /@keyframes hubAtmospherePrismReveal/u);
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hubAtmosphereBackdrop/u,
    );
  });

  it("protects the selected Home image from generated-image cleanup", () => {
    assert.match(
      cleanupSource,
      /addExactReference\(row\.hub_atmosphere_image_id, "Current Home atmosphere"\)/u,
    );
  });
});
