import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { MansionPackageManifestV1 } from "@localai/shared";
import {
  DebateMysteryMansionCodecError,
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
  importInternalMansionPackageToDbV1,
} from "../debate-mystery-mansion-codec.ts";
import { getDebateMysteryMansionBundleV2 } from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";
import { decryptBytes, encryptBytes } from "../security.ts";

const roomBytes = Buffer.from("deterministic room bytes");
const roomHash = createHash("sha256").update(roomBytes).digest("hex");
const roomPath = `assets/${roomHash}.webp`;

function manifest(): MansionPackageManifestV1 {
  return {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "portable-jungle",
    title: "Jungle Mansion",
    description: "Internal round-trip fixture.",
    creator: { name: "Prism", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 1,
    rooms: [{
      id: "library",
      templateId: "library",
      name: "Library",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      slots: [{ id: "slot-1", x: 0.5, y: 0.5 }],
      emoji: "📚",
      roomAssetId: "asset-room",
      propAssetIds: [],
    }],
    houseStyle: { id: "jungle", label: "Jungle", promptContract: "A wet pulp mystery house." },
    assets: [{
      id: "asset-room",
      role: "room",
      archivePath: roomPath,
      sha256: roomHash,
      byteLength: roomBytes.byteLength,
      mimeType: "image/webp",
      width: 1536,
      height: 1024,
      durationMs: null,
    }],
    previewAssetId: "asset-room",
    investigationThemeAssetId: null,
  };
}

describe("internal mansion codec", () => {
  it("encodes byte-identically and validates every decoded content hash", () => {
    const input = { manifest: manifest(), assets: new Map([[roomPath, roomBytes]]) };
    const first = encodeInternalMansionPackageV1(input);
    const second = encodeInternalMansionPackageV1(input);
    assert.deepEqual(first, second);

    const decoded = decodeInternalMansionPackageV1(first);
    assert.deepEqual(decoded.manifest, input.manifest);
    assert.deepEqual(Buffer.from(decoded.assets.get(roomPath)!), roomBytes);
  });

  it("rejects missing, undeclared, and hash-mismatched assets", () => {
    assert.throws(
      () => encodeInternalMansionPackageV1({ manifest: manifest(), assets: new Map() }),
      DebateMysteryMansionCodecError,
    );
    assert.throws(
      () => encodeInternalMansionPackageV1({
        manifest: manifest(),
        assets: new Map([[roomPath, Buffer.from("tampered")]]),
      }),
      /integrity failed/u,
    );
    assert.throws(
      () => encodeInternalMansionPackageV1({
        manifest: manifest(),
        assets: new Map([[roomPath, roomBytes], [`assets/${"b".repeat(64)}.png`, Buffer.from("extra")]]),
      }),
      /undeclared asset/u,
    );
  });

  it("round-trips through fresh storage and re-encrypts under the recipient key", () => {
    const source = initializeDatabase(new DatabaseSync(":memory:"));
    const target = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-27T00:00:00.000Z";
    const addUser = (db: DatabaseSync, id: string, email: string): void => {
      db.prepare(
        `INSERT INTO users
           (id, email, display_name, password_hash, password_salt,
            wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
            preferred_provider, created_at, last_active_at)
         VALUES (?, ?, 'Player', 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?)`,
      ).run(id, email, now, now);
    };
    addUser(source, "creator", "creator@example.com");
    addUser(target, "recipient", "recipient@example.com");
    source.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, created_at, updated_at)
       VALUES ('bundle-source', 'creator', NULL, 'Private case title mansion', 1, 1,
               1, ?, ?, ?, ?)`,
    ).run(
      JSON.stringify({ version: 1, id: "jungle", label: "Jungle", promptContract: "Wet pulp." }),
      JSON.stringify([{
        id: "library",
        templateId: "library",
        name: "Library",
        floor: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        neighborIds: [],
        assignedSuspectSeatId: "creator-case-seat",
        emoji: "📚",
        imageId: null,
        bundledAssetPath: null,
      }]),
      now,
      now,
    );
    const creatorKey = Buffer.alloc(32, 1);
    const recipientKey = Buffer.alloc(32, 2);
    const encrypted = encryptBytes(roomBytes, creatorKey);
    source.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, provider, model, created_at, updated_at)
       VALUES ('stored-room', 'creator', ?, ?, ?, ?, ?, 'image/webp', 'test', 'test', ?, ?)`,
    ).run(encrypted.ciphertext, encrypted.iv, encrypted.tag, roomHash, roomBytes.length, now, now);
    source.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs
         (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES ('bundle-source', 'creator', 'stored-room', 'room', 'library', ?)`,
    ).run(now);

    const archive = exportInternalMansionPackageFromDbV1({
      db: source,
      userKey: creatorKey,
      userId: "creator",
      bundleId: "bundle-source",
      prismVersion: "0.15.0",
    });
    const decoded = decodeInternalMansionPackageV1(archive);
    assert.equal(JSON.stringify(decoded.manifest).includes("Private case title"), false);
    assert.equal(JSON.stringify(decoded.manifest).includes("creator-case-seat"), false);

    const importedId = importInternalMansionPackageToDbV1({
      db: target,
      userKey: recipientKey,
      userId: "recipient",
      archive,
    });
    assert.notEqual(importedId, "bundle-source");
    const imported = getDebateMysteryMansionBundleV2(target, "recipient", importedId);
    assert.equal(imported.suspectCount, 1);
    assert.equal(imported.rooms.length, 1);
    assert.notEqual(imported.rooms[0]!.id, "library");
    const stored = target.prepare(
      `SELECT ciphertext, cipher_iv, cipher_tag, sha256
         FROM debate_mystery_mansion_assets WHERE user_id = ?`,
    ).get("recipient") as { ciphertext: Buffer; cipher_iv: Buffer; cipher_tag: Buffer; sha256: string };
    assert.notDeepEqual(stored.ciphertext, encrypted.ciphertext);
    assert.deepEqual(
      decryptBytes({ ciphertext: stored.ciphertext, iv: stored.cipher_iv, tag: stored.cipher_tag }, recipientKey),
      roomBytes,
    );
    assert.equal(stored.sha256, roomHash);
  });
});
