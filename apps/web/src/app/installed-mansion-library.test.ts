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
    const dialog = readFileSync(new URL("./WhodunnitSetupDialog.tsx", import.meta.url), "utf8");
    const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
    assert.match(component, /Installed Mansions/u);
    assert.match(component, /data-tutorial-target="whodunnit-installed-mansions"/u);
    assert.match(component, /data-tutorial-target="whodunnit-random-mansion"/u);
    assert.match(component, /Random installed mansion/u);
    assert.match(component, /Use this mansion/u);
    assert.match(component, /className=\{styles\.installedMansionOrigin\}/u);
    assert.match(component, /origin\.kind === "imported" \? "↓" : "✦"/u);
    assert.match(component, /data-tutorial-target="whodunnit-edit-mansion"/u);
    assert.match(component, /Choose exterior cover/u);
    assert.match(component, /title="Edit mansion details"/u);
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
    assert.match(experience, /setMysteryNonce\(nextMysteryRecipeNonce\(\)\)/u);
    assert.match(styles, /\.installedMansionGrid > article\[data-selected="true"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="imported"\]/u);
    assert.match(styles, /\.installedMansionOrigin\[data-origin="created"\]/u);
    assert.match(styles, /\.installedMansionEditor/u);
    assert.match(styles, /\.whodunnitDialogScrim/u);
    assert.match(styles, /\.whodunnitDialog\s*\{[\s\S]*?max-height:/u);
    assert.match(styles, /\.whodunnitDialog\[data-size="wide"\]\s*\{[\s\S]*?width:\s*min\(88rem/u);
    assert.match(styles, /\.whodunnitDialog\[data-size="wide"\][\s\S]*?\.whodunnitDialogHeader h2\s*\{[^}]*font-size:\s*clamp\(1\.75rem/u);
    assert.match(styles, /\.installedMansionEditorFields label\s*\{[^}]*font-size:\s*0\.9rem/u);
  });
});
