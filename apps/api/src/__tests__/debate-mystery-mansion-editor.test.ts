import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { DebateMysteryMansionBundleRoomV1 } from "@localai/shared";
import {
  cloneDebateMysteryMansionBundleV1,
  getDebateMysteryMansionBundleV2,
  updateDebateMysteryMansionTopologyV1,
} from "../debate-mystery-mansion-bundles.ts";
import {
  decodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
} from "../debate-mystery-mansion-codec.ts";
import { initializeDatabase } from "../db.ts";

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

describe("source-preserving Mansion Editor storage", () => {
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

    const clone = cloneDebateMysteryMansionBundleV1(db, "owner", "source");
    assert.notEqual(clone.id, "source");
    assert.equal(clone.name, "My Violet House Copy");
    assert.equal(clone.portable, null);
    assert.equal(clone.derivation?.sourceBundleId, "source");
    assert.equal(clone.derivation?.sourcePackageId, "violet-package");
    assert.equal(clone.library?.overrides.description, "A retained local description.");
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
