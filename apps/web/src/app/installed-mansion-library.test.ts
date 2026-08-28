import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { DebateMysteryMansionBundleSummaryV1 } from "@localai/shared";

import {
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
    assert.equal(presentation.defaultThumbnailAssetId, "room-art");
  });

  it("keeps legacy installed mansions browsable without library metadata", () => {
    const presentation = resolveInstalledMansionPresentationV1(mansion());
    assert.equal(presentation.title, "Blackwood House");
    assert.equal(presentation.description, "The file description.");
    assert.equal(presentation.thumbnailAssetId, "room-art");
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
    const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
    const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
    assert.match(component, /Installed Mansions/u);
    assert.match(component, /data-tutorial-target="whodunnit-installed-mansions"/u);
    assert.match(component, /data-tutorial-target="whodunnit-random-mansion"/u);
    assert.match(component, /Random installed mansion/u);
    assert.match(component, /Use this mansion/u);
    assert.match(component, /data-tutorial-target="whodunnit-edit-mansion"/u);
    assert.match(component, /Use \{editingMansion\.portable \? "file" : "saved"\} title/u);
    assert.match(component, /Use \{editingMansion\.portable \? "file" : "saved"\} description/u);
    assert.match(component, /thumbnailAction: "default"/u);
    assert.match(component, /const title = event\.currentTarget\.value;[\s\S]*?title, titleUsesDefault: false/u);
    assert.match(component, /const description = event\.currentTarget\.value;[\s\S]*?description, descriptionUsesDefault: false/u);
    assert.match(experience, /randomInstalledMansionIdV1/u);
    assert.match(experience, /method: "PATCH"/u);
    assert.match(experience, /setMysteryNonce\(nextMysteryRecipeNonce\(\)\)/u);
    assert.match(styles, /\.installedMansionGrid > article\[data-selected="true"\]/u);
    assert.match(styles, /\.installedMansionEditor/u);
  });
});
