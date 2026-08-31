import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildMansionAmbienceManifestV1,
  debateMysteryHouseStyleV2,
  WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
  type MansionPackageManifestV1,
} from "@localai/shared";
import {
  DebateMysteryMansionCodecError,
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
  exportInternalMansionPackageFromDbV1,
  importInternalMansionPackageToDbV1,
  upgradeInstalledMansionRoomArtFromPackageV1,
} from "../debate-mystery-mansion-codec.ts";
import {
  freezeDebateMysteryMansionSnapshotV2,
  getDebateMysteryMansionBundleV2,
} from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";
import { decryptBytes, encryptBytes } from "../security.ts";
import { portableOggOpusDurationMsV1 } from "../debate-mystery-package-safety.ts";

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

function mansionPackageWithPropTheme(): {
  manifest: MansionPackageManifestV1;
  assets: Map<string, Uint8Array>;
} {
  const themed = manifest();
  themed.formatVersion.minor = 1;
  const assets = new Map<string, Uint8Array>([[roomPath, roomBytes]]);
  themed.propTheme = {
    version: 1,
    registryVersion: 1,
    variants: WHODUNNIT_PROP_ARCHETYPE_IDS_V1.map((archetypeId) => {
      const bytes = Buffer.from(`prop theme bytes:${archetypeId}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const archivePath = `assets/${digest}.webp`;
      const packageAssetId = `prop-${archetypeId}`;
      themed.assets.push({
        id: packageAssetId,
        role: "prop",
        archivePath,
        sha256: digest,
        byteLength: bytes.byteLength,
        mimeType: "image/webp",
        width: 512,
        height: 512,
        durationMs: null,
      });
      assets.set(archivePath, bytes);
      return {
        archetypeId,
        displayName: `Jungle ${archetypeId}`,
        appearanceDescription: `A rain-worn ${archetypeId} from the Jungle Mansion.`,
        packageAssetId,
      };
    }),
  };
  return { manifest: themed, assets };
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

  it("upgrades an installed legacy mansion to authored Pixel Art while preserving its Realistic plate", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-31T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('recipient', 'recipient@example.com', 'Player', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(now, now);
    const key = Buffer.alloc(32, 7);
    const bundleId = importInternalMansionPackageToDbV1({
      db,
      userKey: key,
      userId: "recipient",
      archive: encodeInternalMansionPackageV1({
        manifest: manifest(),
        assets: new Map([[roomPath, roomBytes]]),
      }),
    });
    const installed = getDebateMysteryMansionBundleV2(db, "recipient", bundleId);
    const installedRoomId = installed.rooms[0]!.id;

    const pixelBytes = Buffer.from("authored low-resolution room master");
    const pixelHash = createHash("sha256").update(pixelBytes).digest("hex");
    const pixelPath = `assets/${pixelHash}.webp`;
    const upgradedManifest = manifest();
    upgradedManifest.rooms[0]!.roomAssetId = "pixel-room";
    upgradedManifest.rooms[0]!.illustratedRoomAssetId = "asset-room";
    upgradedManifest.assets.push({
      id: "pixel-room",
      role: "room",
      archivePath: pixelPath,
      sha256: pixelHash,
      byteLength: pixelBytes.byteLength,
      mimeType: "image/webp",
      width: 1920,
      height: 1080,
      durationMs: null,
    });
    upgradeInstalledMansionRoomArtFromPackageV1({
      db,
      userKey: key,
      userId: "recipient",
      bundleId,
      archive: encodeInternalMansionPackageV1({
        manifest: upgradedManifest,
        assets: new Map([[roomPath, roomBytes], [pixelPath, pixelBytes]]),
      }),
    });

    const refs = db.prepare(
      `SELECT refs.logical_id, refs.asset_id, assets.sha256, assets.ciphertext,
              assets.cipher_iv, assets.cipher_tag
         FROM debate_mystery_mansion_asset_refs AS refs
         JOIN debate_mystery_mansion_assets AS assets ON assets.id = refs.asset_id
        WHERE refs.bundle_id = ? AND refs.role = 'room'
        ORDER BY refs.logical_id`,
    ).all(bundleId) as Array<{
      logical_id: string;
      asset_id: string;
      sha256: string;
      ciphertext: Buffer;
      cipher_iv: Buffer;
      cipher_tag: Buffer;
    }>;
    assert.equal(
      refs.find((ref) => ref.logical_id === installedRoomId)?.sha256,
      pixelHash,
    );
    assert.equal(
      refs.find((ref) => ref.logical_id === `${installedRoomId}:accepted-v2`)?.sha256,
      pixelHash,
    );
    assert.equal(
      refs.find((ref) => ref.logical_id === `${installedRoomId}:illustrated-v1`)?.sha256,
      roomHash,
    );
    const accepted = refs.find((ref) => ref.logical_id === `${installedRoomId}:accepted-v2`)!;
    assert.deepEqual(
      decryptBytes({
        ciphertext: accepted.ciphertext,
        iv: accepted.cipher_iv,
        tag: accepted.cipher_tag,
      }, key),
      pixelBytes,
    );
    const upgradedSnapshot = freezeDebateMysteryMansionSnapshotV2(
      getDebateMysteryMansionBundleV2(db, "recipient", bundleId),
    );
    assert.equal(
      upgradedSnapshot.layoutV2?.entities.find(
        (entity) => entity.kind === "room" && entity.id === installedRoomId,
      )?.acceptedRoomAssetId,
      accepted.asset_id,
    );
  });

  it("imports complete prop themes as protected archetype refs and re-exports them intact", () => {
    const db = initializeDatabase(new DatabaseSync(":memory:"));
    const now = "2026-08-30T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('recipient', 'recipient@example.com', 'Player', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(now, now);
    const source = mansionPackageWithPropTheme();
    const key = Buffer.alloc(32, 9);
    const bundleId = importInternalMansionPackageToDbV1({
      db,
      userKey: key,
      userId: "recipient",
      archive: encodeInternalMansionPackageV1(source),
    });
    const variantRows = db.prepare(
      `SELECT archetype_id, status, display_name, asset_id
         FROM debate_mystery_mansion_prop_variants
        WHERE user_id = ? AND bundle_id = ?
        ORDER BY archetype_id`,
    ).all("recipient", bundleId) as Array<{
      archetype_id: string;
      status: string;
      display_name: string;
      asset_id: string | null;
    }>;
    assert.equal(variantRows.length, 16);
    assert.ok(variantRows.every((row) => row.status === "ready" && row.asset_id));
    const themeRefs = db.prepare(
      `SELECT logical_id FROM debate_mystery_mansion_asset_refs
        WHERE user_id = ? AND bundle_id = ? AND logical_id LIKE 'theme:%'`,
    ).all("recipient", bundleId) as Array<{ logical_id: string }>;
    assert.equal(themeRefs.length, 16);

    const reexported = decodeInternalMansionPackageV1(
      exportInternalMansionPackageFromDbV1({
        db,
        userKey: key,
        userId: "recipient",
        bundleId,
        prismVersion: "0.15.1",
      }),
    );
    assert.equal(reexported.manifest.formatVersion.minor, 1);
    assert.deepEqual(
      reexported.manifest.propTheme?.variants.map((variant) => variant.archetypeId),
      WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
    );
    assert.equal(new Set(
      reexported.manifest.propTheme?.variants.map((variant) => variant.packageAssetId),
    ).size, 16);
    assert.ok(reexported.manifest.rooms.every((room) => room.propAssetIds.length === 0));

    db.prepare(
      `DELETE FROM debate_mystery_mansion_prop_variants
        WHERE user_id = ? AND bundle_id = ? AND archetype_id = 'key'`,
    ).run("recipient", bundleId);
    const partial = decodeInternalMansionPackageV1(
      exportInternalMansionPackageFromDbV1({
        db,
        userKey: key,
        userId: "recipient",
        bundleId,
        prismVersion: "0.15.1",
      }),
    );
    assert.equal(partial.manifest.propTheme, undefined);
    assert.equal(partial.manifest.assets.some((asset) => asset.role === "prop"), false);
    assert.ok(partial.manifest.rooms.every((room) => room.propAssetIds.length === 0));
  });

  it("preserves mansion-unique ambience while remapping room and asset identities", () => {
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(`
      CREATE TABLE debate_mystery_mansion_assets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        ciphertext BLOB NOT NULL,
        cipher_iv BLOB NOT NULL,
        cipher_tag BLOB NOT NULL,
        sha256 TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK(byte_size > 0),
        mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png', 'image/webp', 'audio/mpeg')),
        width INTEGER,
        height INTEGER,
        duration_ms INTEGER,
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, sha256)
      );
    `);
    const db = initializeDatabase(legacy);
    const now = "2026-08-27T00:00:00.000Z";
    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('recipient', 'recipient@example.com', 'Player', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(now, now);
    const audio = readFileSync(new URL(
      "../../../web/public/audio/debate/whodunnit/shared/rain-storm-v1.ogg",
      import.meta.url,
    ));
    const audioHash = createHash("sha256").update(audio).digest("hex");
    const audioPath = `audio/${audioHash}.ogg`;
    const portable = manifest();
    const houseStyle = {
      ...debateMysteryHouseStyleV2("Blackwood Gothic rainstorm at night"),
      bespokeAmbienceRequested: true,
    };
    const ambience = buildMansionAmbienceManifestV1({
      houseStyle,
      rooms: [{ id: "library", name: "Library", floor: 1 }],
      promptContractHash: createHash("sha256").update(portable.houseStyle.promptContract).digest("hex"),
      variationSeed: "bespoke-fixture",
    });
    ambience.assets[0] = {
      ...ambience.assets[0]!,
      scope: "mansion",
      sharedAssetId: null,
      packageAssetId: "asset-ambience",
      contentSha256: audioHash,
      fallbackSharedAssetId: "prism.shared.weather.rain-storm.v1",
    };
    portable.ambience = ambience;
    portable.assets.push({
      id: "asset-ambience",
      role: "ambience",
      archivePath: audioPath,
      sha256: audioHash,
      byteLength: audio.byteLength,
      mimeType: "audio/ogg",
      width: null,
      height: null,
      durationMs: portableOggOpusDurationMsV1(audio),
    });
    const archive = encodeInternalMansionPackageV1({
      manifest: portable,
      assets: new Map([[roomPath, roomBytes], [audioPath, audio]]),
    });
    const key = Buffer.alloc(32, 7);
    const bundleId = importInternalMansionPackageToDbV1({
      db, userKey: key, userId: "recipient", archive,
    });
    const installed = getDebateMysteryMansionBundleV2(db, "recipient", bundleId);
    const installedReference = installed.houseStyle.ambience?.assets[0];
    assert.notEqual(installedReference?.packageAssetId, "asset-ambience");
    assert.equal(installedReference?.contentSha256, audioHash);
    assert.equal(installed.houseStyle.ambience?.roomProfiles[0]?.roomId, installed.rooms[0]?.id);
    assert.equal(
      (db.prepare("SELECT mime_type FROM debate_mystery_mansion_assets WHERE sha256 = ?")
        .get(audioHash) as { mime_type: string }).mime_type,
      "audio/mpeg",
      "legacy schemas retain Ogg bytes behind the compatibility MIME while export and playback sniff OggS",
    );

    const reexported = decodeInternalMansionPackageV1(exportInternalMansionPackageFromDbV1({
      db, userKey: key, userId: "recipient", bundleId, prismVersion: "0.15.0",
    }));
    const reexportedReference = reexported.manifest.ambience?.assets[0];
    assert.equal(reexportedReference?.contentSha256, audioHash);
    assert.equal(
      reexported.manifest.assets.find((asset) => asset.id === reexportedReference?.packageAssetId)?.role,
      "ambience",
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
    assert.equal(decoded.manifest.ambience?.themePaletteId, "jungle-wilderness-v1");
    assert.equal(decoded.manifest.ambience?.assets[0]?.packageAssetId, null);
    assert.equal(
      decoded.manifest.previewAssetId,
      null,
      "new exports must not promote an interior room into the mansion cover",
    );

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
    assert.equal(imported.houseStyle.ambience?.roomProfiles[0]?.roomId, imported.rooms[0]!.id);
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
