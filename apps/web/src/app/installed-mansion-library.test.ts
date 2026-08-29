import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DebateMysteryMansionBundleSummaryV1 } from "@localai/shared";

import {
  installedMansionOriginV1,
  installedMansionExteriorPreviewV1,
  installedMansionThumbnailSourceV1,
  randomInstalledMansionIdV1,
  resolveInstalledMansionPresentationV1,
} from "./installedMansionLibrary.ts";

function mansion(
  overrides: Partial<DebateMysteryMansionBundleSummaryV1> = {},
): DebateMysteryMansionBundleSummaryV1 {
  return {
    version: 1,
    id: "blackwood",
    name: "Blackwood House",
    sourceSessionId: null,
    floors: 2,
    totalRooms: 10,
    suspectCount: 5,
    houseStyle: { label: "Gothic" },
    rooms: [],
    assets: [{ id: "room-art", role: "room", logicalId: "foyer" }],
    portable: { description: "The file description." },
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    ...overrides,
  } as DebateMysteryMansionBundleSummaryV1;
}

describe("installed mansion library", () => {
  it("resolves local overrides while retaining immutable file defaults", () => {
    const presentation = resolveInstalledMansionPresentationV1(mansion({
      library: {
        version: 1,
        defaults: {
          title: "Blackwood House",
          description: "The file description.",
          thumbnailAssetId: "room-art",
        },
        overrides: {
          title: "My Blackwood",
          description: "My local description.",
          thumbnailAssetId: "custom-thumbnail",
        },
      },
    }));
    assert.equal(presentation.title, "My Blackwood");
    assert.equal(presentation.description, "My local description.");
    assert.equal(presentation.thumbnailAssetId, "custom-thumbnail");
    assert.equal(presentation.defaultTitle, "Blackwood House");
    assert.equal(presentation.defaultDescription, "The file description.");
    assert.equal(presentation.defaultThumbnailAssetId, null);
  });

  it("keeps legacy installed mansions browsable without library metadata", () => {
    const presentation = resolveInstalledMansionPresentationV1(mansion());
    assert.equal(presentation.title, "Blackwood House");
    assert.equal(presentation.description, "The file description.");
    assert.equal(presentation.thumbnailAssetId, null);
  });

  it("uses a theme-matched exterior when a saved house has no exterior asset", () => {
    const saved = mansion({
      portable: null,
      assets: [],
      rooms: [
        {
          id: "foyer-room",
          templateId: "foyer",
          name: "Foyer",
          floor: 1,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          neighborIds: [],
          assignedSuspectSeatId: null,
          emoji: "◇",
          imageId: null,
          bundledAssetPath: "/debate/mystery/rooms/foyer.webp",
        },
      ],
    });
    assert.equal(
      installedMansionThumbnailSourceV1(saved, null),
      "/debate/mystery/exteriors/gothic-old-house-standard-v1.webp",
    );
    assert.equal(installedMansionOriginV1(saved).label, "Created here");
    assert.equal(installedMansionOriginV1(mansion()).label, "Imported");
  });

  it("labels a source-preserving Mansion Editor copy as derived", () => {
    const derived = mansion({
      portable: null,
      derivation: {
        version: 1,
        sourceBundleId: "blackwood",
        sourceTitle: "Blackwood House",
        sourcePackageId: "blackwood-package",
        acceptedExteriorScaleClass: "standard",
        createdAt: "2026-08-28T01:00:00.000Z",
      },
    });
    assert.deepEqual(installedMansionOriginV1(derived), {
      kind: "derived",
      label: "Derived",
      description: "Editable copy of Blackwood House",
    });
  });

  it("switches included exterior families immediately while retaining a custom cover as stale", () => {
    const bundled = mansion({ portable: null, assets: [], scaleClass: "grand" });
    assert.deepEqual(
      installedMansionExteriorPreviewV1({
        mansion: bundled,
        assetId: null,
        scaleClass: "compact",
      }),
      {
        url: "/debate/mystery/exteriors/gothic-old-house-compact-v1.webp",
        scaleClass: "compact",
        switchesWithTopology: true,
        stale: false,
      },
    );
    const custom = mansion({
      scaleClass: "grand",
      assets: [{
        id: "accepted-exterior",
        role: "presentation",
        logicalId: "mansion-exterior-v1",
        mimeType: "image/webp",
        sha256: "a".repeat(64),
        byteLength: 123_456,
      }],
    });
    const preview = installedMansionExteriorPreviewV1({
      mansion: custom,
      assetId: "accepted-exterior",
      scaleClass: "standard",
    });
    assert.match(preview.url, /accepted-exterior\/file$/u);
    assert.equal(preview.switchesWithTopology, false);
    assert.equal(preview.stale, true);
  });

  it("selects an installed mansion randomly without immediately repeating the current one", () => {
    const installed = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.equal(randomInstalledMansionIdV1(installed, "a", 0), "b");
    assert.equal(randomInstalledMansionIdV1(installed, "a", 1), "c");
    assert.equal(randomInstalledMansionIdV1([{ id: "a" }], "a", 7), "a");
    assert.equal(randomInstalledMansionIdV1([], "", 0), null);
  });

  it("presents dedicated selection, randomization, and reversible metadata controls", () => {
    const component = readFileSync(new URL("./InstalledMansionLibraryPanel.tsx", import.meta.url), "utf8");
    const topologyEditor = readFileSync(new URL("./MansionEditorDialog.tsx", import.meta.url), "utf8");
    const dialog = readFileSync(new URL("./WhodunnitSetupDialog.tsx", import.meta.url), "utf8");
    const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
    assert.match(component, /Installed Mansions/u);
    assert.match(component, /data-tutorial-target="whodunnit-installed-mansions"/u);
    assert.match(component, /data-tutorial-target="whodunnit-random-mansion"/u);
    assert.match(component, /Random installed mansion/u);
    assert.match(component, /Use this mansion/u);
    assert.match(component, /className=\{styles\.installedMansionOrigin\}/u);
    assert.match(component, /origin\.kind === "derived" \? "↗" : "✦"/u);
    assert.match(component, /data-tutorial-target="whodunnit-edit-mansion"/u);
    assert.match(component, /Choose exterior cover/u);
    assert.match(component, /title="Edit mansion details"/u);
    assert.match(component, /Duplicate & edit mansion/u);
    assert.match(component, /Open Mansion Editor/u);
    assert.match(component, /data-tutorial-target="whodunnit-mansion-soundscape"/u);
    assert.match(component, /role="tablist" aria-label="Mansion soundscape"/u);
    assert.match(component, /data-soundscape-panel="music"/u);
    assert.match(component, /data-soundscape-panel="atmosphere"/u);
    assert.match(component, /<SanctumAudioPlayer/u);
    assert.match(component, /The Midnight Clue/u);
    assert.match(component, /Synthesize music/u);
    assert.match(component, /Resynthesize music/u);
    assert.match(component, /Atmosphere/u);
    assert.match(component, /Synthesize atmosphere/u);
    assert.match(component, /Resynthesize atmosphere/u);
    assert.doesNotMatch(component, />\s*(?:Shadow|Pulse|Refract)\s*</u);
    assert.match(component, /Use this version/u);
    assert.match(component, /Discard/u);
    assert.match(component, /Undo previous version/u);
    assert.match(component, /LOCAL stays fully offline/u);
    assert.match(component, /mysteryMansionAmbienceAssetV1/u);
    assert.match(component, /Only non-semantic environmental layers may play automatically/u);
    assert.match(component, /data-tutorial-target="whodunnit-open-mansion-editor"/u);
    assert.match(component, /<MansionEditorDialog/u);
    assert.match(component, /Use \{editingMansion\.portable \? "package" : "original"\} title/u);
    assert.match(component, /Use \{editingMansion\.portable \? "package" : "original"\} description/u);
    assert.match(component, /thumbnailAction: "default"/u);
    assert.match(component, /<WhodunnitSetupDialog[\s\S]*?id="installed-mansion-editor"/u);
    assert.match(component, /id="installed-mansion-editor"[\s\S]*?size="wide"/u);
    assert.match(component, /open=\{!removeConfirmation\}/u);
    assert.match(component, /role="alertdialog"/u);
    assert.match(dialog, /createPortal/u);
    assert.match(dialog, /aria-modal="true"/u);
    assert.match(dialog, /event\.key === "Escape"/u);
    assert.match(dialog, /event\.key !== "Tab"/u);
    assert.match(dialog, /document\.body\.style\.overflow = "hidden"/u);
    assert.match(dialog, /previouslyFocused\?\.focus\(\)/u);
    assert.match(component, /const title = event\.currentTarget\.value;[\s\S]*?title, titleUsesDefault: false/u);
    assert.match(component, /const description = event\.currentTarget\.value;[\s\S]*?description, descriptionUsesDefault: false/u);
    assert.match(experience, /randomInstalledMansionIdV1/u);
    assert.match(experience, /method: "PATCH"/u);
    assert.match(experience, /mystery-mansions\/\$\{encodeURIComponent\(mansion\.id\)\}\/clone/u);
    assert.match(experience, /mystery-mansions\/\$\{encodeURIComponent\(mansion\.id\)\}\/topology/u);
    assert.match(experience, /setMysteryNonce\(nextMysteryRecipeNonce\(\)\)/u);
    assert.match(styles, /\.installedMansionGrid > article\[data-selected="true"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="imported"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="created"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="derived"\]/u);
    assert.match(styles, /\.installedMansionEditor/u);
    assert.match(styles, /\.installedMansionSoundscapeTabs/u);
    assert.match(styles, /\.installedMansionAtmosphereFacts/u);
    assert.match(styles, /\.mansionTopologyEditor/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-mansion-editor"/u);
    assert.match(topologyEditor, /data-layout-version="2"/u);
    assert.match(topologyEditor, /Save mansion plan/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_COLUMNS/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_ROWS/u);
    assert.match(topologyEditor, /fixed silhouettes/u);
    assert.match(topologyEditor, /mansionLayoutV2PlacementIsLegal/u);
    assert.match(topologyEditor, /snapMansionLayoutV2Entity/u);
    assert.match(topologyEditor, /Invalid drop—returned to the last legal connected position/u);
    assert.match(topologyEditor, /Geometry-derived doors/u);
    assert.match(topologyEditor, /slideMansionLayoutV2Door/u);
    assert.match(topologyEditor, /removeMansionLayoutV2Door/u);
    assert.match(topologyEditor, /\+ Corridor/u);
    assert.match(topologyEditor, /\+ Infill/u);
    assert.match(topologyEditor, /disabled=\{floor === 3 && !thirdFloorAccessible\}/u);
    assert.match(topologyEditor, /Floor 2 needs at least four semantic rooms/u);
    assert.match(topologyEditor, /roomAssetUrl\(mansion, entity, true\)/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-editor"/u);
    assert.match(topologyEditor, /Editor breadcrumb/u);
    assert.match(topologyEditor, /Mansion Editor/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-mosaic-preview"/u);
    assert.match(topologyEditor, /Mosaic changes this preview only/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-anchors"/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM/u);
    assert.match(topologyEditor, /Authoring context · not hotspots/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-lights"/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_MAX_LIGHTS/u);
    assert.match(topologyEditor, /\["fire", "omni", "directional", "neon"\]/u);
    assert.match(topologyEditor, /Stable IDs seed animation; Reduced Motion freezes it/u);
    assert.match(topologyEditor, /Generate room-art candidate · ONLINE/u);
    assert.match(topologyEditor, /Accept candidate/u);
    assert.match(topologyEditor, /Retry candidate/u);
    assert.match(topologyEditor, /Discard candidate/u);
    assert.match(topologyEditor, /LOCAL is server-rejected/u);
    assert.match(experience, /room-art\/\$\{encodeURIComponent\(roomId\)\}\/\$\{action\}/u);
    assert.match(styles, /\.mansionRoomOverlay/u);
    assert.match(styles, /\.mansionDynamicLight\[data-light-kind="fire"\]/u);
    assert.match(styles, /\.mansionDynamicLight\[data-light-kind="omni"\]/u);
    assert.match(styles, /\.mansionDynamicLight\[data-light-kind="directional"\]/u);
    assert.match(styles, /\.mansionDynamicLight\[data-light-kind="neon"\]/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mansionDynamicLight,[\s\S]*?animation: none !important/u);
    assert.match(styles, /\.whodunnitDialogScrim/u);
    assert.match(styles, /\.whodunnitDialog\s*\{[\s\S]*?max-height:/u);
    assert.match(styles, /\.whodunnitDialog\[data-size="wide"\]\s*\{[\s\S]*?width:\s*min\(88rem/u);
    assert.match(styles, /\.whodunnitDialog\[data-size="wide"\][\s\S]*?\.whodunnitDialogHeader h2\s*\{[^}]*font-size:\s*clamp\(1\.75rem/u);
    assert.match(styles, /\.installedMansionEditorFields label\s*\{[^}]*font-size:\s*0\.9rem/u);
  });
});
