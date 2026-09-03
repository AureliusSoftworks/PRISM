import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  canonicalMansionLayoutV2,
  createBlankMansionLayoutV2,
  mansionLayoutV2ToLegacyRooms,
  mansionLayoutV2TraversalRoute,
  remapMansionLayoutV2Ids,
  validateMansionLayoutV2,
  type MansionPackageManifestV1,
} from "@localai/shared";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
  importInternalMansionPackageToDbDetailedV1,
} from "../debate-mystery-mansion-codec.ts";
import { getDebateMysteryMansionBundleV2 } from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";

function fixture(): MansionPackageManifestV1 {
  const layoutV2 = createBlankMansionLayoutV2();
  return {
    schema: "prism-mansion-package-v1", formatVersion: { major: 1, minor: 1 },
    packageId: "source-infill-fixture", title: "Fixture Estate", description: "Public portable geometry fixture.",
    creator: { name: "Fixture", id: null, url: null },
    provenance: { createdAt: "2026-09-03T00:00:00.000Z", prismVersion: "0.15.1", generatedWith: [] },
    license: { name: "Test fixture", url: null, allowsRedistribution: true }, contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: "0.15.1" },
    floorCount: 2, layoutV2,
    rooms: mansionLayoutV2ToLegacyRooms(layoutV2).map((room) => ({
      id: room.id, templateId: room.templateId, name: room.name, floor: room.floor,
      x: room.x, y: room.y, width: room.width, height: room.height,
      neighborIds: [...room.neighborIds], emoji: room.emoji,
      slots: [{ id: `slot:${room.id}`, x: 0.5, y: 0.5 }], roomAssetId: null, propAssetIds: [],
    })),
    houseStyle: { id: "fixture", label: "Fixture", promptContract: "A quiet estate." },
    assets: [], previewAssetId: null, investigationThemeAssetId: null,
  };
}

test("mansion payload hashing is independent of wall-clock time", (t) => {
  const input = { manifest: fixture(), assets: new Map<string, Uint8Array>() };
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2020-01-02T03:04:05Z") });
  const first = encodeInternalMansionPackageV1(input);
  t.mock.timers.setTime(new Date("2035-12-30T15:45:00Z").getTime());
  const second = encodeInternalMansionPackageV1(input);
  assert.deepEqual(second, first);
  assert.deepEqual(decodeInternalMansionPackageV1(second).manifest, input.manifest);
});

test("authored infill survives separate in-memory import, tenant remapping and re-export without touching the source", () => {
  // Only an ephemeral database; no existing accounts, installations or files.
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  try {
    const now = "2026-09-03T00:00:00.000Z";
    db.prepare(`INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider, created_at, last_active_at)
      VALUES ('infill-recipient', 'infill@example.com', 'Fixture', 'hash', 'salt',
              'cipher', 'iv', 'tag', 'local', ?, ?)`
    ).run(now, now);
    const userKey = Buffer.alloc(32, 7);
    const source = fixture();
    const revised = structuredClone(source);
    revised.packageId = "distinct-ambient-edition-fixture";
    revised.title = `${source.title} — Ambient Edition`;
    revised.provenance.generatedWith.push(`Source package: ${source.packageId}`);
    revised.layoutV2!.entities.push(
      { id: "ambient:f1:01", kind: "infill", floor: 1, x: 0, y: 5, width: 3, height: 2 },
      { id: "ambient:f2:01", kind: "infill", floor: 2, x: 3, y: 3, width: 3, height: 2 },
    );
    const install = (manifest: MansionPackageManifestV1) => {
      const archive = encodeInternalMansionPackageV1({ manifest, assets: new Map() });
      return importInternalMansionPackageToDbDetailedV1({
        db, userKey, userId: "infill-recipient", archive,
        portableMetadata: {
          packageId: manifest.packageId, payloadSha256: createHash("sha256").update(archive).digest("hex"),
          description: manifest.description, creator: manifest.creator, provenance: manifest.provenance,
          license: manifest.license, contentWarnings: manifest.contentWarnings,
          encryptionMode: "spoiler_seal", creatorSignature: null,
        },
      });
    };
    const originalImport = install(source);
    const originalBefore = db.prepare("SELECT * FROM debate_mystery_mansion_bundles WHERE id = ?").get(originalImport.bundleId);
    const revisionImport = install(revised);
    const originalAfter = db.prepare("SELECT * FROM debate_mystery_mansion_bundles WHERE id = ?").get(originalImport.bundleId);
    assert.deepEqual(originalAfter, originalBefore);
    assert.notEqual(revisionImport.bundleId, originalImport.bundleId);
    const bundle = getDebateMysteryMansionBundleV2(db, "infill-recipient", revisionImport.bundleId);
    assert.equal(bundle.name, revised.title);
    assert.equal(bundle.portable?.packageId, revised.packageId);
    assert.deepEqual(bundle.portable?.provenance, revised.provenance);
    assert.equal(bundle.rooms.length, source.rooms.length);
    assert.ok(bundle.layoutV2);
    const infill = bundle.layoutV2.entities.filter((entity) => entity.kind === "infill");
    assert.equal(infill.length, 2);
    assert.ok(infill.every((entity) => !revised.layoutV2!.entities.some((original) => original.id === entity.id)));
    assert.deepEqual(infill.map(({ floor, x, y, width, height }) => ({ floor, x, y, width, height })).sort((a, b) => a.floor - b.floor), [
      { floor: 1, x: 0, y: 5, width: 3, height: 2 }, { floor: 2, x: 3, y: 3, width: 3, height: 2 },
    ]);
    assert.deepEqual(validateMansionLayoutV2(bundle.layoutV2), []);
    for (const block of infill) assert.equal(mansionLayoutV2TraversalRoute(bundle.layoutV2, bundle.rooms[0]!.id, block.id), null);
    const exported = decodeInternalMansionPackageV1(exportInternalMansionPackageFromDbV1({
      db, userKey, userId: "infill-recipient", bundleId: revisionImport.bundleId, prismVersion: "0.15.1",
    })).manifest;
    assert.equal(exported.title, revised.title);
    assert.equal(exported.rooms.length, source.rooms.length);
    assert.equal(exported.layoutV2?.entities.filter((entity) => entity.kind === "infill").length, 2);
    const geometryKey = (layout: NonNullable<MansionPackageManifestV1["layoutV2"]>) => canonicalMansionLayoutV2(
      remapMansionLayoutV2Ids(layout, (_id, entity) => `${entity.kind}:f${entity.floor}:${entity.x}:${entity.y}`),
    );
    assert.equal(geometryKey(exported.layoutV2!), geometryKey(bundle.layoutV2));
    assert.deepEqual(db.prepare("SELECT * FROM debate_mystery_mansion_bundles WHERE id = ?").get(originalImport.bundleId), originalBefore);
  } finally {
    db.close();
  }
});
