import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { DebateMysteryMansionBundleRoomV1 } from "@localai/shared";
import {
  cloneDebateMysteryMansionBundleV1,
  createBlankDebateMysteryMansionBundleV1,
  getDebateMysteryMansionAssetFileV1,
  getDebateMysteryMansionBundleV2,
  updateDebateMysteryMansionTopologyV1,
} from "../debate-mystery-mansion-bundles.ts";
import {
  decodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
} from "../debate-mystery-mansion-codec.ts";
import { initializeDatabase } from "../db.ts";
import { encryptBytes } from "../security.ts";

function room(
  id: string,
  templateId: string,
  floor: number,
  x: number,
  neighborIds: string[],
): DebateMysteryMansionBundleRoomV1 {
  return {
    id,
    templateId,
    name: templateId === "foyer" ? "Foyer" : id,
    floor,
    x,
    y: 0,
    width: 2,
    height: 2,
    neighborIds,
    assignedSuspectSeatId: null,
    emoji: "◇",
    imageId: null,
    bundledAssetPath: null,
  };
}

function sourceRooms(): DebateMysteryMansionBundleRoomV1[] {
  return [
    room("foyer", "foyer", 1, 0, ["parlor"]),
    room("parlor", "parlor", 1, 2, ["foyer", "library"]),
    room("library", "library", 1, 4, ["parlor", "study"]),
    room("study", "study", 1, 6, ["library", "bathroom"]),
    room("bathroom", "bathroom", 1, 8, ["study"]),
  ];
}

function editedRooms(): DebateMysteryMansionBundleRoomV1[] {
  return [
    room("foyer", "foyer", 1, 0, ["parlor", "study"]),
    room("parlor", "parlor", 1, 2, ["foyer", "library"]),
    room("library", "library", 1, 4, ["parlor"]),
    room("study", "study", 2, 0, ["foyer", "bathroom"]),
    room("bathroom", "bathroom", 2, 2, ["study"]),
  ];
}

function addRoomAssetRef(
  db: DatabaseSync,
  assetId: string,
  logicalId: string,
  now: string,
): void {
  const encrypted = encryptBytes(Buffer.from(assetId), Buffer.alloc(32, 7));
  db.prepare(
    `INSERT INTO debate_mystery_mansion_assets
       (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
        mime_type, provider, model, created_at, updated_at)
     VALUES (?, 'owner', ?, ?, ?, ?, ?, 'image/webp', 'fixture', 'fixture', ?, ?)`,
  ).run(
    assetId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    createHash("sha256").update(assetId).digest("hex"),
    Buffer.byteLength(assetId),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     VALUES ('source', 'owner', ?, 'room', ?, ?)`,
  ).run(assetId, logicalId, now);
}

describe("source-preserving Mansion Editor storage", () => {
  it("creates a tenant-owned blank draft without a mutable source bundle", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-29T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('owner', 'owner@example.com', 'Owner', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(now, now);
    const draft = createBlankDebateMysteryMansionBundleV1(db, "owner");
    assert.equal(draft.floors, 2);
    assert.equal(draft.totalRooms, 4);
    assert.equal(draft.suspectCount, 4);
    assert.equal(draft.derivation?.sourceBundleId, null);
    assert.equal(draft.derivation?.sourceTitle, "Blank slate");
    assert.equal(draft.layoutV2?.verticalConnectors.length, 1);
    assert.equal(draft.assets?.length, 0);
    assert.throws(
      () => getDebateMysteryMansionBundleV2(db, "other", draft.id),
      /not found/u,
    );
  });

  it("clones provenance and saves only the derivative topology", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-28T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('owner', 'owner@example.com', 'Owner', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, library_metadata_json,
          portable_metadata_json, portable_payload_sha256, created_at, updated_at)
       VALUES ('source', 'owner', NULL, 'Violet House', 1, 5, 4, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      JSON.stringify({ version: 1, id: "gothic", label: "Private case prompt", promptContract: "Spoiler-free Gothic architecture." }),
      JSON.stringify(sourceRooms()),
      JSON.stringify({ version: 1, title: "My Violet House", description: "A retained local description.", thumbnailAssetId: null }),
      JSON.stringify({
        packageId: "violet-package",
        payloadSha256: "a".repeat(64),
        description: "Portable Violet House.",
        creator: { name: "Creator", id: null, url: null },
        provenance: { createdAt: now, prismVersion: "0.15.0", generatedWith: [] },
        license: { name: "Private use", url: null, allowsRedistribution: false },
        contentWarnings: [],
        encryptionMode: "spoiler_seal",
        creatorSignature: null,
      }),
      "a".repeat(64),
      now,
      now,
    );
    addRoomAssetRef(db, "foyer-legacy", "foyer", now);
    addRoomAssetRef(db, "foyer-accepted", "foyer:accepted-v2", now);
    addRoomAssetRef(db, "parlor-legacy", "parlor", now);
    addRoomAssetRef(db, "library-candidate", "library:candidate-v2", now);

    const clone = cloneDebateMysteryMansionBundleV1(db, "owner", "source");
    assert.notEqual(clone.id, "source");
    assert.equal(clone.name, "My Violet House Copy");
    assert.equal(clone.portable, null);
    assert.equal(clone.derivation?.sourceBundleId, "source");
    assert.equal(clone.derivation?.sourcePackageId, "violet-package");
    assert.equal(clone.library?.overrides.description, "A retained local description.");
    assert.equal(clone.layoutV2?.version, 2);
    assert.equal(clone.floors, 2);
    assert.equal(clone.layoutV2?.entities.filter((entity) => entity.kind === "room").length, 5);
    assert.equal(getDebateMysteryMansionBundleV2(db, "owner", "source").layoutV2, null);
    const clonedRooms = new Map(
      clone.layoutV2?.entities
        .filter((entity) => entity.kind === "room")
        .map((entity) => [entity.id, entity.acceptedRoomAssetId]),
    );
    assert.equal(clonedRooms.get("foyer"), "foyer-accepted");
    assert.equal(clonedRooms.get("parlor"), "parlor-legacy");
    assert.equal(clonedRooms.get("library"), null);
    assert.deepEqual(
      getDebateMysteryMansionAssetFileV1(
        db,
        Buffer.alloc(32, 7),
        "owner",
        clone.id,
        "foyer-accepted",
      ),
      { mimeType: "image/webp", bytes: Buffer.from("foyer-accepted") },
    );
    assert.deepEqual(
      clone.assets.filter((asset) => asset.role === "room").map((asset) => ({
        id: asset.id,
        logicalId: asset.logicalId,
      })),
      [
        { id: "foyer-legacy", logicalId: "foyer" },
        { id: "foyer-accepted", logicalId: "foyer:accepted-v2" },
        { id: "library-candidate", logicalId: "library:candidate-v2" },
        { id: "parlor-legacy", logicalId: "parlor" },
      ],
    );
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM debate_mystery_mansion_assets WHERE user_id = 'owner'",
      ).get() as { count: number }).count,
      4,
    );
    assert.ok(clone.layoutV2);
    db.prepare(
      "UPDATE debate_mystery_mansion_bundles SET layout_json = ? WHERE id = ? AND user_id = 'owner'",
    ).run(
      JSON.stringify({
        ...clone.layoutV2,
        entities: clone.layoutV2.entities.map((entity) => entity.kind === "room"
          ? { ...entity, acceptedRoomAssetId: null }
          : entity),
      }),
      clone.id,
    );
    const recoveredRooms = new Map(
      getDebateMysteryMansionBundleV2(db, "owner", clone.id).layoutV2?.entities
        .filter((entity) => entity.kind === "room")
        .map((entity) => [entity.id, entity.acceptedRoomAssetId]),
    );
    assert.equal(recoveredRooms.get("foyer"), "foyer-accepted");
    assert.equal(recoveredRooms.get("parlor"), "parlor-legacy");
    assert.equal(recoveredRooms.get("library"), null);
    assert.throws(
      () => updateDebateMysteryMansionTopologyV1(db, "owner", "source", { rooms: editedRooms() }),
      /Duplicate this mansion/u,
    );
    assert.throws(
      () => cloneDebateMysteryMansionBundleV1(db, "another-user", "source"),
      /not found/u,
    );

    const saved = updateDebateMysteryMansionTopologyV1(
      db,
      "owner",
      clone.id,
      { rooms: editedRooms() },
    );
    assert.equal(saved.floors, 2);
    assert.equal(saved.totalRooms, 5);
    assert.equal(getDebateMysteryMansionBundleV2(db, "owner", "source").floors, 1);
    assert.equal(getDebateMysteryMansionBundleV2(db, "owner", "source").rooms[3]?.floor, 1);

    const archive = decodeInternalMansionPackageV1(exportInternalMansionPackageFromDbV1({
      db,
      userKey: Buffer.alloc(32, 7),
      userId: "owner",
      bundleId: clone.id,
      prismVersion: "0.15.0",
    }));
    assert.equal(archive.manifest.title, "My Violet House Copy");
    assert.equal(JSON.stringify(archive.manifest).includes("Private case prompt Mansion"), false);
  });
});
