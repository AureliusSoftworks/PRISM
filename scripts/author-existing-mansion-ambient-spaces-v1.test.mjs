import assert from "node:assert/strict";
import test from "node:test";
import { createBlankMansionLayoutV2, mansionLayoutV2ToLegacyRooms } from "../packages/shared/src/mansionLayoutV2.ts";
import {
  authorAmbientMansionManifestV1,
  verifyAmbientMansionPreservationV1,
} from "./author-existing-mansion-ambient-spaces-v1.mjs";

function fixture() {
  const layoutV2 = createBlankMansionLayoutV2();
  const manifest = {
    schema: "prism-mansion-package-v1", formatVersion: { major: 1, minor: 1 },
    packageId: "public-authoring-fixture", title: "Fixture Estate", description: "Public reusable estate only.",
    creator: { name: "Fixture", id: null, url: null },
    provenance: { createdAt: "2026-09-03T00:00:00.000Z", prismVersion: "0.15.1", generatedWith: [] },
    license: { name: "Fixture", url: null, allowsRedistribution: true }, contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 2, layoutV2,
    rooms: mansionLayoutV2ToLegacyRooms(layoutV2).map((room) => ({
      id: room.id, templateId: room.templateId, name: room.name, floor: room.floor,
      x: room.x, y: room.y, width: room.width, height: room.height, neighborIds: room.neighborIds,
      emoji: room.emoji, slots: [{ id: `slot:${room.id}`, x: 0.5, y: 0.5 }], roomAssetId: null, propAssetIds: [],
    })),
    houseStyle: { id: "fixture", label: "Fixture", promptContract: "A quiet estate." },
    assets: [], previewAssetId: null, investigationThemeAssetId: null,
  };
  const edition = {
    sourceId: manifest.packageId, title: manifest.title, roomCount: 4, assetCount: 0,
    floors: [[[0, 5, 3, 2]], [[3, 3, 3, 2]]],
    preservedVoids: [{ floor: 1, x: 0, y: 0, width: 16, height: 3 }],
  };
  return { manifest, edition };
}

test("ambient authoring is deterministic, additive and preserves explicit original lineage", () => {
  const { manifest, edition } = fixture();
  const before = JSON.stringify(manifest);
  const revised = authorAmbientMansionManifestV1(manifest, edition, "a".repeat(64));
  assert.equal(JSON.stringify(manifest), before);
  assert.deepEqual(authorAmbientMansionManifestV1(manifest, edition, "a".repeat(64)), revised);
  assert.notEqual(revised.packageId, manifest.packageId);
  assert.equal(revised.title, "Fixture Estate — Ambient Edition");
  assert.ok(revised.provenance.generatedWith.some((line) => line.includes(manifest.packageId)));
  const report = verifyAmbientMansionPreservationV1(manifest, revised, edition);
  assert.equal(report.traversalPairsChecked, 16);
  assert.equal(report.ambientCount, 2);
  assert.equal(report.originalSemanticManifestSha256, report.revisedSemanticManifestSha256);
  assert.equal(report.originalLayoutSha256, report.originalLayoutRecoveredFromRevisionSha256);
  assert.notEqual(authorAmbientMansionManifestV1(manifest, edition, "b".repeat(64)).packageId, revised.packageId);
});

test("authoring refuses wrong sources, overlapping blocks and previously authored input", () => {
  const { manifest, edition } = fixture();
  assert.throws(() => authorAmbientMansionManifestV1({ ...manifest, packageId: "another" }, edition, "a".repeat(64)), /source package identity/u);
  assert.throws(() => authorAmbientMansionManifestV1(manifest, { ...edition, floors: [[[3, 5, 3, 2]]] }, "a".repeat(64)), /overlaps/u);
  const authored = authorAmbientMansionManifestV1(manifest, edition, "a".repeat(64));
  assert.throws(() => authorAmbientMansionManifestV1({ ...authored, title: manifest.title, packageId: manifest.packageId }, edition, "a".repeat(64)), /already has authored infill/u);
});

test("preservation audit rejects changed room semantics, media metadata and a filled courtyard", () => {
  const { manifest, edition } = fixture();
  const revised = authorAmbientMansionManifestV1(manifest, edition, "a".repeat(64));
  const changedRoom = structuredClone(revised);
  changedRoom.rooms[0].name = "Changed";
  assert.throws(() => verifyAmbientMansionPreservationV1(manifest, changedRoom, edition), /allowlist/u);
  const changedMusic = structuredClone(revised);
  changedMusic.investigationThemeTitle = "Changed";
  assert.throws(() => verifyAmbientMansionPreservationV1(manifest, changedMusic, edition), /allowlist/u);
  assert.throws(() => verifyAmbientMansionPreservationV1(manifest, revised, {
    ...edition, preservedVoids: [{ floor: 1, x: 0, y: 5, width: 3, height: 2 }],
  }), /void was filled/u);
});
