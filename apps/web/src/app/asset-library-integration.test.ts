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
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);
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
    assert.match(assetSource, /viewAllLabel = "View all"/u);
    assert.match(assetSource, /\{viewAllLabel\}/u);
  });

  it("keeps Upload separate from an explicit Synthesize target", () => {
    assert.match(assetSource, /kind: "magic"/u);
    assert.match(assetSource, /PrismRefractTarget target=\{synthesizeTarget\}/u);
    assert.match(assetSource, /onClick=\{onUpload\}/u);
    assert.match(assetSource, /<small>Upload<\/small>/u);
    assert.match(assetSource, /<small>Synthesize<\/small>/u);
    assert.match(
      assetSource,
      /await onSynthesize\(direction, generation\?\.selection \?\? undefined\)/u,
    );
    assert.match(assetSource, /data-tutorial-target=\{`asset-add-\$\{kind\}`\}/u);
    assert.match(assetSource, /requestPrismRefract\(targetId, "focused-shortcut"\)/u);
    assert.doesNotMatch(assetSource, /touchActionsOpen|activateAdd/u);
  });

  it("keeps a compact remembered model selector on typed rails only", () => {
    assert.match(assetSource, /generation\?: AssetRailGenerationControl/u);
    assert.match(
      assetSource,
      /className=\{styles\.synthesisControl\}[\s\S]*?PrismRefractTarget[\s\S]*?generationSelector/u,
    );
    assert.match(assetStyles, /\.synthesisControl[\s\S]*grid-template-rows/u);
    assert.match(assetSource, /generation\.onChange/u);
    assert.match(assetSource, /await onSynthesize\(direction, generation\?\.selection/u);
    assert.match(pageSource, /kind="general_image"[\s\S]{0,700}onSynthesize=\{synthesizeGeneralImage\}/u);
    assert.doesNotMatch(
      pageSource.match(/kind="general_image"[\s\S]{0,700}/u)?.[0] ?? "",
      /generation=\{/u,
    );
    assert.match(debateSource, /assetRailGeneration\?\.\("debate_exhibit"\)/u);
    assert.match(signalSource, /assetRailGeneration\?\.\("signal_studio"\)/u);
    assert.match(signalSource, /assetRailGeneration\?\.\("signal_logo"\)/u);
    assert.match(slateSource, /assetRailGeneration\?\.\("slate_cover"\)/u);
    assert.match(studiesSource, /assetRailGeneration\?\.\("slate_visual_study"\)/u);
  });

  it("persists typed model choices and carries them into each asset generator", () => {
    assert.match(serverSource, /image_asset_generation_preferences/u);
    assert.match(serverSource, /\/api\/assets\/generation-preferences/u);
    assert.match(serverSource, /requestedImageModel/u);
    assert.match(debateSource, /preferredProvider: selection\?\.provider/u);
    assert.match(signalSource, /\{ model: selection\.model \}/u);
    assert.match(slateSource, /\{ preferredProvider: selection\.provider, model: selection\.model \}/u);
    assert.match(studiesSource, /\{ preferredProvider: selection\.provider, model: selection\.model \}/u);
    assert.match(
      pageSource,
      /zenWallpaperImageGenerationAvailable\([\s\S]{0,180}savedZenAtmosphereSelection\?\.provider/u,
    );
    for (const kind of [
      "debate_exhibit",
      "signal_studio",
      "signal_logo",
      "slate_cover",
      "slate_visual_study",
      "zen_atmosphere",
      "home_atmosphere",
      "group_room_atmosphere",
    ]) {
      assert.match(serverSource, new RegExp(`"${kind}"`, "u"));
    }
    assert.match(serverSource, /resolveTypedAssetGenerationSelection/u);
    assert.match(
      serverSource,
      /if \(requestedProvider && requestedModel\) \{[\s\S]*?return \{ provider: requestedProvider, model: requestedModel \}/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/images\/generate"[\s\S]*?typedAssetKind[\s\S]*?resolveTypedAssetGenerationSelection/u,
    );
    assert.match(
      serverSource,
      /route\("POST", "\/api\/botcast\/shows\/:id\/artwork-job"[\s\S]*?kind === "logo" \? "signal_logo" : "signal_studio"/u,
    );
    const zenGeneration = pageSource.slice(
      pageSource.indexOf("async function requestZenWallpaperUpdate"),
      pageSource.indexOf("function addImageKeywordTags"),
    );
    assert.match(
      zenGeneration,
      /assetGenerationPreferences\.zen_atmosphere[\s\S]*?if \(options\.selection\)[\s\S]*?body\.model = options\.selection\.model/u,
    );
    assert.doesNotMatch(zenGeneration, /else if \(effectiveImageProvider/u);
    const groupRoomGeneration = pageSource.slice(
      pageSource.indexOf("async function generateBotGroupRoomAtmosphere"),
      pageSource.indexOf("function cancelBotGroupRoomAtmosphereSynthesis"),
    );
    assert.match(
      groupRoomGeneration,
      /assetGenerationPreferences\.group_room_atmosphere[\s\S]*?if \(selection\)[\s\S]*?body\.model = selection\.model/u,
    );
    assert.doesNotMatch(groupRoomGeneration, /else if \(groupImageProvider/u);
    assert.match(tutorialSource, /generation model directly beneath Synthesize/u);
  });

  it("locks the fullscreen browser to one kind with local filters and Light/Dark previews", () => {
    assert.match(assetSource, /data-asset-library-kind=\{kind\}/u);
    assert.match(assetSource, /params\.set\("q", query\.trim\(\)\)/u);
    assert.match(
      assetSource,
      /const effectiveSource = sourceFilter \?\? source;[\s\S]*params\.set\("source", effectiveSource\)/u,
    );
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
    assert.match(
      assetStyles,
      /\.detailActions[\s\S]*margin-top: 0\.75rem[\s\S]*border-top:/u,
    );
    assert.match(assetStyles, /\.magentaPass[\s\S]*display: grid/u);
  });

  it("keeps one reachable equip action directly beneath the detail preview", () => {
    assert.equal(
      assetSource.match(/data-asset-equip-action=/gu)?.length ?? 0,
      1,
    );
    assert.equal(assetSource.match(/"Use this asset"/gu)?.length ?? 0, 1);
    assert.ok(
      assetSource.indexOf('data-asset-equip-action="true"') >
        assetSource.indexOf("<AssetPreview asset={detail} />"),
    );
    assert.ok(
      assetSource.indexOf('data-asset-equip-action="true"') <
        assetSource.indexOf("Magenta cleanup"),
    );
    assert.match(
      assetStyles,
      /\.detailPrimaryAction[\s\S]*position: sticky[\s\S]*top: 0/u,
    );
  });

  it("supports exact bot-scoped browsing and opens an initial asset in normal details", () => {
    assert.match(assetSource, /botId\?: string \| null/u);
    assert.match(assetSource, /initialAssetId\?: string \| null/u);
    assert.match(
      assetSource,
      /if \(botId\?\.trim\(\)\) params\.set\("botId", botId\.trim\(\)\)/u,
    );
    assert.match(
      assetSource,
      /resolveAssetLibraryInitialSelection\(\{/u,
    );
    assert.match(assetSource, /\/api\/assets\/\$\{encodeURIComponent\(assetId\)\}\/detail/u);
    assert.match(assetSource, /new URLSearchParams\(\{ kind \}\)/u);
    assert.match(assetSource, /setAssetDetailState\(initialAsset/u);
    assert.match(
      assetSource,
      /data-asset-library-bot-id=\{botId\?\.trim\(\) \|\| undefined\}/u,
    );
  });

  it("provides read-only bot asset rails that open the exact filtered library", () => {
    assert.match(assetSource, /export function BotAssetLibraryIndex/u);
    assert.match(assetSource, /index: BotImageAssetLibraryIndex \| null/u);
    assert.match(assetSource, /\.filter\(\(section\) => section\.totalCount > 0 && section\.assets\.length > 0\)/u);
    assert.match(assetSource, /section\.assets\.slice\(0, 6\)\.map/u);
    assert.match(assetSource, /data-bot-asset-library-kind=\{section\.kind\}/u);
    assert.match(assetSource, /botId=\{index\.botId\}/u);
    assert.match(
      assetSource,
      /initialAssetId=\{openLibrary\.initialAssetId\}/u,
    );
    const botIndex = assetSource.slice(
      assetSource.indexOf("export function BotAssetLibraryIndex"),
      assetSource.indexOf("export interface AssetLibraryModalProps"),
    );
    assert.doesNotMatch(botIndex, /onSynthesize|onUpload|PrismRefract/u);
    assert.match(assetStyles, /\.botAssetLibraryThumbs[\s\S]*overflow-x: auto/u);
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
    assert.match(generalImageRail, /viewAllLabel="Asset Library"/u);
    assert.match(
      generalImageRail,
      /onOpenStorageSettings=\{\(\) => openSettingsPanel\("storage"\)\}/u,
    );
    assert.match(assetSource, /data-asset-storage-settings-shortcut=\{kind\}/u);
    assert.match(assetSource, /data-asset-library-shortcut=\{kind\}/u);
    assert.match(assetSource, />\s*Storage Settings\s*</u);
    assert.doesNotMatch(generalImageRail, /onUpload/u);
    assert.doesNotMatch(pageSource, /generalImageUploadRef|uploadGeneralImage/u);
    assert.match(assetSource, /onUpload\?: \(\) => void/u);
    assert.match(assetSource, /onClick=\{onUpload\}[\s\S]*?<small>Upload<\/small>/u);
    assert.match(assetSource, /<small>Synthesize<\/small>/u);
  });

  it("keeps storage and mutation interfaces local and set-aware", () => {
    assert.match(storageSource, /\/api\/assets\/storage/u);
    assert.match(storageSource, /Recovery trash/u);
    assert.match(storageSource, /Generated/u);
    assert.match(storageSource, /synthesized or uploaded clips/u);
    assert.match(storageSource, /Audit unused/u);
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
    assert.match(magentaPassSource, /AUTOMATIC_MAGENTA_CLEANUP_PASSES = 5/u);
    assert.match(magentaPassSource, /applyAutomaticMagentaCleanupPasses/u);
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
