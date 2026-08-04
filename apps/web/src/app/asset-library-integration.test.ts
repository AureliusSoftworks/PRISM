import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const assetSource = readFileSync(
  new URL("./AssetLibrary.tsx", import.meta.url),
  "utf8",
);
const storageSource = readFileSync(
  new URL("./StorageSettings.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const slateSource = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const studiesSource = readFileSync(
  new URL("./SlateCreativeStudiosDesk.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("typed local asset library", () => {
  it("keeps the recent rail exact-type, context-ranked, and capped at five", () => {
    assert.match(
      assetSource,
      /new URLSearchParams\(\{ kind, limit: "5", sort: "recency" \}\)/u,
    );
    assert.match(assetSource, /query\.set\("context", context\.trim\(\)\)/u);
    assert.match(assetSource, /currentImageIds/u);
    assert.match(assetSource, /assetSourceLabel\(asset\)/u);
    assert.match(assetSource, /View all/u);
  });

  it("uses one dual-purpose + target with an accessible touch fallback", () => {
    assert.match(assetSource, /kind: "magic"/u);
    assert.match(assetSource, /PrismRefractTarget target=\{synthesizeTarget\}/u);
    assert.match(assetSource, /onClick=\{activateAdd\}/u);
    assert.match(assetSource, /onUpload\(\)/u);
    assert.match(assetSource, /await onSynthesize\(direction\)/u);
    assert.match(assetSource, /data-tutorial-target=\{`asset-add-\$\{kind\}`\}/u);
    assert.match(assetSource, /Synthesize with Prism/u);
    assert.match(assetSource, /requestPrismRefract\(targetId, "focused-shortcut"\)/u);
  });

  it("locks the fullscreen browser to one kind with local filters and Light/Dark previews", () => {
    assert.match(assetSource, /data-asset-library-kind=\{kind\}/u);
    assert.match(assetSource, /params\.set\("q", query\.trim\(\)\)/u);
    assert.match(assetSource, /params\.set\("source", source\)/u);
    assert.match(assetSource, /params\.set\("usage", usage\)/u);
    assert.match(assetSource, /new URLSearchParams\(\{ kind, limit: "24", sort \}\)/u);
    assert.match(assetSource, /asset\.kind === "signal_studio" && light && dark/u);
    assert.match(assetSource, /<small>Light<\/small>/u);
    assert.match(assetSource, /<small>Dark<\/small>/u);
    assert.match(assetSource, /loading="lazy"/u);
    assert.match(assetSource, /Save tags/u);
    assert.match(assetSource, /Used by/u);
    assert.match(assetSource, /Provider/u);
    assert.match(assetSource, /Model/u);
    assert.match(assetSource, /Prompt/u);
    assert.match(assetSource, /Open Signal to retry synthesis/u);
    assert.match(assetSource, /window\.confirm/u);
    assert.match(assetSource, /createPortal/u);
    assert.match(assetSource, /element\.setAttribute\("inert", ""\)/u);
    assert.match(assetSource, /event\.key !== "Tab"/u);
    assert.match(assetSource, /previouslyFocused\.focus/u);
  });

  it("migrates every requested image surface to its declared asset kind", () => {
    assert.match(debateSource, /kind="debate_exhibit"/u);
    assert.match(signalSource, /kind="signal_studio"/u);
    assert.match(signalSource, /kind="signal_logo"/u);
    assert.match(slateSource, /kind="slate_cover"/u);
    assert.match(studiesSource, /kind="slate_visual_study"/u);
    assert.match(pageSource, /kind="zen_atmosphere"/u);
    assert.match(pageSource, /kind="home_atmosphere"/u);
    assert.match(pageSource, /kind="group_room_atmosphere"/u);
    assert.match(pageSource, /kind="general_image"/u);
  });

  it("keeps storage and mutation interfaces local and set-aware", () => {
    assert.match(storageSource, /\/api\/assets\/storage/u);
    assert.match(storageSource, /Recovery trash/u);
    assert.match(storageSource, /Generated/u);
    assert.match(storageSource, /Uploaded/u);
    assert.match(storageSource, /Audit unused assets/u);
    assert.match(storageSource, /includeIncomplete/u);
    assert.match(storageSource, /allowDelete/u);
    assert.match(serverSource, /route\("POST", "\/api\/assets\/upload"/u);
    assert.match(serverSource, /route\("GET", "\/api\/assets\/storage"/u);
    assert.match(serverSource, /route\("PATCH", "\/api\/assets\/:id"/u);
    assert.match(serverSource, /route\("DELETE", "\/api\/assets\/:id"/u);
  });

  it("passes bounded Refract direction to providers without making it canonical", () => {
    assert.match(
      serverSource,
      /const refractDirection = normalizePrismRefractDirection\(body\.direction\)/u,
    );
    assert.match(
      serverSource,
      /Creative direction for this pass: \$\{refractDirection\}/u,
    );
    assert.match(
      serverSource,
      /promptForPersistence = refractDirection[\s\S]*?composedPrompt \?\? prompt/u,
    );
    assert.match(signalSource, /direction\.trim\(\) \? \{ direction: direction\.trim\(\) \}/u);
    assert.match(serverSource, /args\.persistencePrompt \? null : revisedPrompt/u);
    const signalAssetFunctions = signalSource.slice(
      signalSource.indexOf("const regenerateStudio"),
      signalSource.indexOf("const generateShowIntroAudio"),
    );
    assert.doesNotMatch(signalAssetFunctions, /atmosphere\/refresh|logo-direction/u);
    assert.match(signalAssetFunctions, /startSignalArtworkJob\([\s\S]*?direction/u);
    assert.doesNotMatch(assetSource, /direction.*tags|tags.*direction/iu);
  });
});
