import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const assetSource = readFileSync(
  new URL("./AssetLibrary.tsx", import.meta.url),
  "utf8",
);
const assetStyles = readFileSync(
  new URL("./AssetLibrary.module.css", import.meta.url),
  "utf8",
);
const sharedStyles = readFileSync(
  new URL("./page.module.css", import.meta.url),
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
const magentaPassSource = readFileSync(
  new URL("../../../api/src/image-magenta-pass.ts", import.meta.url),
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
    assert.match(assetSource, /<details className=\{styles\.generationDetails\}>/u);
    assert.match(assetSource, /assetDisplayTitle\(asset\)/u);
    assert.match(assetSource, /Close asset details/u);
    assert.match(assetSource, /detailRef\.current\?\.scrollTo\(\{ top: 0 \}\)/u);
    assert.doesNotMatch(assetSource, /Finder|Photoshop|onRevealImage/u);
    assert.match(assetSource, /Magenta cleanup/u);
    assert.match(assetSource, /Reduce magenta/u);
    assert.match(assetSource, /Undo last pass/u);
    assert.match(assetSource, /Apply one pass to this entire asset set/u);
    assert.match(assetSource, /each pass remains undoable/u);
    assert.match(assetSource, /Open Signal to retry synthesis/u);
    assert.match(assetSource, /Confirm deleting unused asset/u);
    assert.match(assetSource, /deleteConfirmationId === detail\.id/u);
    assert.match(assetSource, /method: "DELETE"/u);
    assert.match(assetSource, /Selected — protected/u);
    assert.match(assetSource, /createPortal/u);
    assert.match(assetSource, /element\.setAttribute\("inert", ""\)/u);
    assert.match(assetSource, /event\.key !== "Tab"/u);
    assert.match(assetSource, /previouslyFocused\.focus/u);
    assert.match(
      assetStyles,
      /\.detail > img[\s\S]*height: auto[\s\S]*aspect-ratio: 1\.55/u,
    );
    assert.match(
      assetStyles,
      /data-asset-preview-kind="debate_exhibit"[\s\S]*object-fit: contain/u,
    );
    assert.match(assetStyles, /\.detailActions[\s\S]*position: sticky/u);
    assert.match(assetStyles, /\.magentaPass[\s\S]*display: grid/u);
  });

  it("reuses PRISM surface, form, gallery, and state primitives", () => {
    assert.match(assetSource, /import sharedStyles from "\.\/page\.module\.css"/u);
    for (const className of [
      "imageLightboxBackdrop",
      "panelHeader",
      "panelHeaderTitleText",
      "panelClose",
      "form",
      "formInModal",
      "imageGrid",
      "imageThumbWrap",
      "settingsTutorialCard",
      "error",
      "panelNotice",
      "muted",
      "btnPrimary",
      "dangerButton",
      "linkButton",
    ]) {
      assert.match(assetSource, new RegExp(`sharedStyles\\.${className}`, "u"));
      assert.match(sharedStyles, new RegExp(`\\.${className}\\b`, "u"));
    }
    assert.doesNotMatch(
      assetStyles,
      /\.filters input,[\s\S]*\.detail input\s*\{/u,
    );
    assert.doesNotMatch(assetStyles, /\.modalHeader > button\s*\{/u);
  });

  it("allows safe deletion from rail-launched modals without external-file chrome", () => {
    assert.match(
      assetSource,
      /<AssetLibraryModal[\s\S]*currentImageIds=\{\[\.\.\.currentIds\]\}[\s\S]*allowDelete/u,
    );
    assert.match(assetSource, /void loadRecent\(\)/u);
    assert.doesNotMatch(debateSource, /useRevealSynthesizedAssetContextMenu/u);
    const debateRail = debateSource.slice(
      debateSource.indexOf('<AssetRail\n              kind="debate_exhibit"'),
      debateSource.indexOf("Uploaded and synthesized images are cut"),
    );
    assert.doesNotMatch(debateRail, /onRevealImage|onContextMenu|Finder/u);
    assert.doesNotMatch(pageSource, /revealSynthesizedAssetContextMenu/u);
    assert.doesNotMatch(signalSource, /revealSynthesizedAssetContextMenu/u);
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
    const generalImageRail = pageSource.slice(
      pageSource.indexOf('<AssetRail\n                  kind="general_image"'),
      pageSource.indexOf("{imageKeywordEditorOpen &&"),
    );
    assert.doesNotMatch(generalImageRail, /onUpload/u);
    assert.doesNotMatch(pageSource, /generalImageUploadRef|uploadGeneralImage/u);
    assert.match(assetSource, /onUpload\?: \(\) => void/u);
    assert.match(assetSource, /onUpload \? "Upload" : "Synthesize"/u);
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
    assert.match(serverSource, /route\("POST", "\/api\/assets\/storage\/visible"/u);
    assert.match(serverSource, /route\("PATCH", "\/api\/assets\/:id"/u);
    assert.match(serverSource, /route\("POST", "\/api\/assets\/:id\/magenta-pass"/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/assets\/:id\/magenta-pass\/undo"/u,
    );
    assert.match(serverSource, /route\("DELETE", "\/api\/assets\/:id"/u);
    assert.match(assetSource, /\/api\/assets\/storage\/visible/u);
    assert.match(assetSource, /\{assets\.length\} shown ·/u);
    assert.match(assetSource, /Clear unused/u);
    assert.match(
      assetSource,
      /for \(const assetSetId of confirmation\.assetSetIds\)/u,
    );
    assert.match(
      assetSource,
      /fetch\(`\/api\/assets\/\$\{encodeURIComponent\(assetSetId\)\}`/u,
    );
    assert.doesNotMatch(assetSource, /\/api\/images\/cleanup-preview/u);
    assert.doesNotMatch(assetSource, /window\.confirm/u);
    assert.match(assetSource, /to recovery trash/u);
    assert.match(assetSource, /Confirm deleting unused asset/u);
    assert.match(assetSource, /Confirm clearing unused assets/u);
    assert.match(assetSource, /Move to recovery trash/u);
    assert.match(assetSource, /setCleanupConfirmation/u);
    assert.match(magentaPassSource, /reduceMagentaInPng/u);
    assert.match(magentaPassSource, /encryptBytes\(replacement\.before, args\.userKey\)/u);
    assert.match(magentaPassSource, /generateSignalStudioLightingMap/u);
    assert.match(magentaPassSource, /MAGENTA_REVISION_RETENTION = 8/u);
    assert.doesNotMatch(serverSource, /reveal-in-finder|revealLocalFileInFolder/u);
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
