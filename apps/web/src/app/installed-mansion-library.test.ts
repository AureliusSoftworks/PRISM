import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type {
  DebateMysteryHouseStyleV2,
  DebateMysteryMansionBundleSummaryV1,
} from "@localai/shared";

import {
  frozenMansionExteriorThumbnailAssetIdV1,
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
      assets: [
        {
          id: "room-art",
          role: "room",
          logicalId: "foyer",
          mimeType: "image/webp",
          sha256: "a".repeat(64),
          byteLength: 12_345,
          durationMs: null,
        },
        {
          id: "custom-thumbnail",
          role: "presentation",
          logicalId: "library-thumbnail-override-v1",
          mimeType: "image/webp",
          sha256: "b".repeat(64),
          byteLength: 23_456,
          durationMs: null,
        },
      ],
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

  it("keeps every bundled mansion family on an exterior at every scale", () => {
    const families = [
      ["gothic-old-house-v1", "gothic-old-house"],
      ["spacecraft-industrial-v1", "spacecraft-industrial"],
      ["jungle-wilderness-v1", "jungle-wilderness"],
      ["neutral-mansion-v1", "prism-house"],
    ] as const;
    const scales = ["compact", "standard", "grand"] as const;
    for (const [palette, pathFamily] of families) {
      for (const scaleClass of scales) {
        const saved = mansion({
          scaleClass,
          houseStyle: {
            label: palette,
            acousticThemePaletteId: palette,
          } as DebateMysteryHouseStyleV2,
        });
        assert.equal(
          installedMansionThumbnailSourceV1(saved, "room-art"),
          `/debate/mystery/exteriors/${pathFamily}-${scaleClass}-v1.webp`,
        );
      }
    }
  });

  it("rejects a room-backed library override before any thumbnail consumer sees it", () => {
    const saved = mansion({
      library: {
        version: 1,
        defaults: {
          title: "Blackwood House",
          description: "The file description.",
          thumbnailAssetId: "room-art",
        },
        overrides: {
          title: null,
          description: null,
          thumbnailAssetId: "room-art",
        },
      },
    });
    const presentation = resolveInstalledMansionPresentationV1(saved);
    assert.equal(presentation.defaultThumbnailAssetId, null);
    assert.equal(presentation.thumbnailOverrideAssetId, null);
    assert.equal(presentation.thumbnailAssetId, null);
  });

  it("rejects room interiors frozen as thumbnails by legacy case snapshots", () => {
    const base = mansion();
    const legacySnapshot = {
      version: 2 as const,
      sourceBundleId: base.id,
      rooms: [],
      layoutV2: null,
      layoutSha256: "a".repeat(64),
      presentation: {
        version: 2 as const,
        name: base.name,
        title: base.name,
        description: "Legacy snapshot",
        thumbnailAssetId: "room-art",
        scaleClass: "standard" as const,
        houseStyle: base.houseStyle,
        investigationThemeLoop: null,
        propTheme: null,
        assets: base.assets ?? [],
      },
      presentationSha256: "b".repeat(64),
      capturedAt: "2026-08-30T00:00:00.000Z",
    };
    assert.equal(
      frozenMansionExteriorThumbnailAssetIdV1(legacySnapshot),
      null,
    );
    assert.equal(
      frozenMansionExteriorThumbnailAssetIdV1({
        ...legacySnapshot,
        presentation: {
          ...legacySnapshot.presentation,
          thumbnailAssetId: "exterior-cover",
          assets: [
            ...legacySnapshot.presentation.assets,
            {
              id: "exterior-cover",
              role: "presentation" as const,
              logicalId: "mansion-exterior-v1",
              mimeType: "image/webp" as const,
              sha256: "c".repeat(64),
              byteLength: 123_456,
              durationMs: null,
            },
          ],
        },
      }),
      "exterior-cover",
    );
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
    const hold = { version: 1 as const, sessionId: "case-1", caseTitle: "Held House" };
    assert.equal(
      randomInstalledMansionIdV1(
        [{ id: "a", archiveHold: hold }, { id: "b" }, { id: "c" }],
        "a",
        0,
      ),
      "b",
    );
    assert.equal(
      randomInstalledMansionIdV1(
        [{ id: "a", archiveHold: hold }, { id: "b", archiveHold: hold }],
        "a",
        0,
      ),
      null,
    );
  });

  it("presents dedicated selection, randomization, and reversible metadata controls", () => {
    const component = readFileSync(new URL("./InstalledMansionLibraryPanel.tsx", import.meta.url), "utf8");
    const topologyEditor = readFileSync(new URL("./MansionEditorDialog.tsx", import.meta.url), "utf8");
    const dialog = readFileSync(new URL("./WhodunnitSetupDialog.tsx", import.meta.url), "utf8");
    const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
    assert.match(component, /Mystery Venues/u);
    assert.match(component, /data-tutorial-target="whodunnit-installed-mansions"/u);
    assert.match(component, /data-tutorial-target="whodunnit-random-mansion"/u);
    assert.match(component, /Random Mystery Venue/u);
    assert.match(component, /Use this venue/u);
    assert.match(component, /Work on a copy/u);
    assert.match(component, /data-held=\{held \? "true" : undefined\}/u);
    assert.match(component, /DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1/u);
    assert.match(component, /className=\{styles\.installedMansionOrigin\}/u);
    assert.match(component, /origin\.kind === "derived" \? "↗" : "✦"/u);
    assert.match(component, /data-tutorial-target="whodunnit-edit-mansion"/u);
    assert.match(component, /Choose exterior cover/u);
    assert.match(component, /title="Edit venue details"/u);
    assert.match(component, /Duplicate & edit venue/u);
    assert.match(component, /Open Venue Editor/u);
    assert.match(component, /data-tutorial-target="whodunnit-mansion-soundscape"/u);
    assert.match(component, /data-tutorial-target="whodunnit-mansion-prop-theme"/u);
    assert.match(component, /16\/16 themed props/u);
    assert.match(component, /Uses PRISM prop fallbacks/u);
    assert.match(component, /Venue evidence wardrobe/u);
    assert.match(component, /Recipients use it offline without adding it to their Asset Library/u);
    assert.match(component, /Generate themed prop pack/u);
    assert.match(component, /Retry/u);
    assert.match(component, /role="tablist" aria-label="Venue soundscape"/u);
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
    assert.match(styles, /\.installedMansionGrid > article\[data-held="true"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="imported"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="created"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="derived"\]/u);
    assert.match(
      styles,
      /\.setup\[data-theme="light"\] \.installedMansionThumbnail img\s*\{[\s\S]{0,500}(?:-webkit-)?mask-image:\s*linear-gradient/u,
    );
    assert.match(
      styles,
      /\.setup\[data-theme="light"\] \.installedMansionThumbnail img\s*\{[^}]*opacity:\s*0\.72/u,
    );
    assert.match(
      styles,
      /\.setup\[data-theme="light"\] \.installedMansionThumbnail::after\s*\{[\s\S]{0,900}var\(--mystery-panel-strong\) 100%/u,
    );
    assert.doesNotMatch(
      styles,
      /(?<!\.setup\[data-theme="light"\] )\.installedMansionThumbnail img\s*\{[^}]*mask-image/u,
      "Dark Mode must retain the authored full-bleed thumbnail",
    );
    assert.match(styles, /\.installedMansionEditor/u);
    assert.match(styles, /\.installedMansionSoundscapeTabs/u);
    assert.match(styles, /\.installedMansionAtmosphereFacts/u);
    assert.match(styles, /\.mansionTopologyEditor/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-mansion-editor"/u);
    assert.match(topologyEditor, /data-layout-version="2"/u);
    assert.match(topologyEditor, /Save venue plan/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_COLUMNS/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_ROWS/u);
    assert.match(topologyEditor, /fixed silhouettes/u);
    assert.match(topologyEditor, /mansionLayoutV2PlacementIsLegal/u);
    assert.match(topologyEditor, /snapMansionLayoutV2Entity/u);
    assert.match(topologyEditor, /That floor has no legal connected space for this room footprint/u);
    assert.match(topologyEditor, /Geometry-derived doors/u);
    assert.match(topologyEditor, /slideMansionLayoutV2Door/u);
    assert.match(topologyEditor, /removeMansionLayoutV2Door/u);
    assert.match(topologyEditor, /\+ Corridor/u);
    assert.match(topologyEditor, /disabled=\{!venueProfile && floor === 3 && !thirdFloorAccessible\}/u);
    assert.match(topologyEditor, /Floor 2 needs at least four semantic rooms/u);
    assert.match(topologyEditor, /roomAssetUrl\(mansion, entity, true\)/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-editor"/u);
    assert.match(topologyEditor, /Editor breadcrumb/u);
    assert.match(topologyEditor, /Venue Editor/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-mosaic-preview"/u);
    assert.match(topologyEditor, /Mosaic is the sole playable room-art base/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-anchors"/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM/u);
    assert.match(topologyEditor, /Authoring context · not hotspots/u);
    assert.match(topologyEditor, /data-tutorial-target="whodunnit-room-lights"/u);
    assert.match(topologyEditor, /MANSION_LAYOUT_V2_MAX_LIGHTS/u);
    assert.match(topologyEditor, /\["fire", "omni", "directional", "neon"\]/u);
    assert.match(topologyEditor, /Stable IDs seed animation; Reduced Motion freezes it/u);
    assert.match(topologyEditor, /Synthesize Mosaic · ONLINE/u);
    assert.match(topologyEditor, /Accept candidate/u);
    assert.match(topologyEditor, /Regenerate room asset/u);
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
