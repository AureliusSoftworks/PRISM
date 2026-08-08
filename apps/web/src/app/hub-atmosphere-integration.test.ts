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
const storageSource = readFileSync(
  new URL("./StorageSettings.tsx", import.meta.url),
  "utf8",
);
const surfaceRouterSource = readFileSync(
  new URL("./resolveAtmosphereSurface.ts", import.meta.url),
  "utf8",
);

describe("Chat / Prism atmosphere integration", () => {
  it("uses one account-level style catalog in setup and Appearance settings", () => {
    assert.match(pageSource, /activeStep\.id === "atmosphere"/u);
    assert.match(pageSource, /data-atmosphere-style-selector="true"/u);
    assert.equal(pageSource.match(/HUB_ATMOSPHERE_STYLES\.map/gu)?.length, 2);
    assert.match(pageSource, /Atmosphere & graphics/u);
    assert.match(pageSource, /data-home-atmosphere-settings="true"/u);
    assert.match(pageSource, /Home atmosphere/u);
    assert.match(pageSource, /Home wallpaper model/u);
    assert.doesNotMatch(pageSource, /Home Atmosphere wallpaper/u);
    assert.doesNotMatch(
      pageSource,
      /Per-bot Chat atmospheres still generate/u,
    );
  });

  it("prepares one shared Home wallpaper without mounting it on collapsed Chat home", () => {
    assert.match(pageSource, /purpose: HUB_ATMOSPHERE_IMAGE_PURPOSE/u);
    assert.match(pageSource, /resolveAtmosphereSurface/u);
    assert.match(pageSource, /data-bot-home-tint/u);
    assert.match(pageSource, /homeAtmosphereDayKey/u);
    assert.match(pageSource, /hubAtmosphereGeneratedOn/u);
    assert.doesNotMatch(
      pageSource,
      /void ensureChatAtmosphereForBot\(focusedBotId\)/u,
    );
    assert.match(
      apiSource,
      /prompt = composeHubAtmospherePrompt\(hubAtmosphereStyle, randomId\(\)\)/u,
    );
    assert.match(
      apiSource,
      /Prism session atmosphere generation cannot be attributed to a bot or conversation/u,
    );
    assert.match(
      apiSource,
      /hubAtmosphereGeneratedOn: hubAtmosphereCache\.generatedOn/u,
    );
    assert.match(surfaceRouterSource, /zenConversation/u);
    assert.match(surfaceRouterSource, /homeBot/u);
    assert.match(
      surfaceRouterSource,
      /presentation === "chat"[\s\S]{0,80}return "none"/u,
    );
    assert.doesNotMatch(surfaceRouterSource, /chatBot/u);
  });

  it("mounts atmosphere via the surface router without forcing hub wallpaper on Chat home", () => {
    assert.match(pageSource, /loading="eager"/u);
    assert.match(pageSource, /fetchPriority="high"/u);
    assert.match(pageSource, /data-atmosphere-surface=\{atmosphereSurface\}/u);
    assert.match(pageSource, /atmosphereBackdropImageId/u);
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
    assert.match(pageSource, /label="Zen Atmospheres"/u);
    assert.match(
      pageSource,
      /data-tutorial-target=\{\s*view === "chat" \? "zen-atmosphere" : undefined\s*\}/u,
    );
    assert.doesNotMatch(
      pageSource,
      /id: "atmosphere",[\s\S]{0,180}kind: "toggle"/u,
    );
  });

  it("protects active Prism session and Chat atmosphere pointers from cleanup", () => {
    assert.match(
      cleanupSource,
      /addExactReference\(row\.hub_atmosphere_image_id, "Current Prism session atmosphere"\)/u,
    );
    assert.match(
      cleanupSource,
      /Current Chat atmosphere/u,
    );
  });

  it("groups Home atmospheres under the Chat Space Lens applet", () => {
    assert.match(storageSource, /id: "chat"/u);
    assert.match(storageSource, /label: "Home atmospheres"/u);
    assert.match(storageSource, /kinds: \["home_atmosphere"\]/u);
    assert.doesNotMatch(storageSource, /id: "home"/u);
    assert.match(storageSource, /id: "general"/u);
    assert.match(storageSource, /label: "General"/u);
    assert.match(storageSource, /id: "audio"/u);
    assert.match(storageSource, /label: "Audio"/u);
    assert.match(storageSource, /label: "Sound Effects"/u);
    assert.match(storageSource, /label: "Music"/u);
    assert.match(storageSource, /AudioLibraryModal/u);
  });
});
