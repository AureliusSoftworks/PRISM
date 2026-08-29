import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  deriveMansionMusicIdentityV1,
  type MansionPackageManifestV1,
} from "@localai/shared";
import sharp from "sharp";
import {
  encodeInternalMansionPackageV1,
} from "../debate-mystery-mansion-codec.ts";
import {
  exportPortableMansionPackageV1,
  importPortableMansionPackageV1,
  inspectPortableMansionPackageV1,
  previewPortableMansionPackageV1,
} from "../debate-mystery-mansion-package.ts";
import { sealPortableMysteryEnvelopeV1 } from "../debate-mystery-package-envelope.ts";
import { preflightPortableMysteryArchiveV1 } from "../debate-mystery-package-safety.ts";
import { getDebateMysteryMansionBundleV2 } from "../debate-mystery-mansion-bundles.ts";
import { initializeDatabase } from "../db.ts";
import { encryptBytes } from "../security.ts";

const now = "2026-08-27T00:00:00.000Z";

function addUser(db: DatabaseSync, id: string): void {
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES (?, ?, 'Player', 'hash', 'salt', 'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(id, `${id}@example.com`, now, now);
}

async function sourceFixture(): Promise<{
  db: DatabaseSync;
  key: Buffer;
  bundleId: string;
}> {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  addUser(db, "creator");
  const key = Buffer.alloc(32, 1);
  const bundleId = "source-bundle";
  db.prepare(
    `INSERT INTO debate_mystery_mansion_bundles
       (id, user_id, source_session_id, name, floors, total_rooms,
        suspect_count, style_json, layout_json, created_at, updated_at)
     VALUES (?, 'creator', NULL, 'Jungle Conservatory', 1, 1, 1, ?, ?, ?, ?)`,
  ).run(
    bundleId,
    JSON.stringify({
      version: 1,
      id: "jungle-conservatory",
      label: "Jungle Conservatory",
      promptContract: "A humid glasshouse mansion overtaken by dense tropical foliage.",
    }),
    JSON.stringify([{
      id: "library",
      templateId: "library",
      name: "Archive Greenhouse",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      assignedSuspectSeatId: "private-seat",
      emoji: "📚",
      imageId: null,
      bundledAssetPath: null,
    }]),
    now,
    now,
  );
  const image = await sharp({
    create: { width: 1536, height: 1024, channels: 4, background: "#6a3bb7" },
  }).webp({ quality: 25 }).toBuffer();
  const digest = createHash("sha256").update(image).digest("hex");
  const encrypted = encryptBytes(image, key);
  db.prepare(
    `INSERT INTO debate_mystery_mansion_assets
       (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
        mime_type, provider, model, created_at, updated_at)
     VALUES ('room-image', 'creator', ?, ?, ?, ?, ?, 'image/webp', 'test', 'test', ?, ?)`,
  ).run(encrypted.ciphertext, encrypted.iv, encrypted.tag, digest, image.byteLength, now, now);
  db.prepare(
    `INSERT INTO debate_mystery_mansion_asset_refs
       (bundle_id, user_id, asset_id, role, logical_id, created_at)
     VALUES (?, 'creator', 'room-image', 'room', 'library', ?)`,
  ).run(bundleId, now);
  return { db, key, bundleId };
}

function emptyTarget(): { db: DatabaseSync; key: Buffer } {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  addUser(db, "recipient");
  return { db, key: Buffer.alloc(32, 2) };
}

function rowCount(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

describe("portable mansion package", () => {
  it("exports, inspects, and imports a password-protected mansion fully offline", async () => {
    const source = await sourceFixture();
    const target = emptyTarget();
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = (() => {
      fetchCount += 1;
      throw new Error("Portable package operations must stay offline.");
    }) as typeof fetch;
    try {
      const envelope = await exportPortableMansionPackageV1({
        db: source.db,
        userKey: source.key,
        userId: "creator",
        bundleId: source.bundleId,
        prismVersion: "0.15.0",
        creatorName: "Package Creator",
        mode: "password",
        password: "correct horse battery staple",
      });
      const header = inspectPortableMansionPackageV1(envelope);
      assert.equal(header.packageType, "mansion");
      assert.equal(header.creatorName, "Package Creator");
      assert.equal(header.assetCount, 1);
      assert.equal(header.title, "Jungle Conservatory Mansion");
      const preview = await previewPortableMansionPackageV1({
        envelope,
        password: "correct horse battery staple",
      });
      assert.equal(preview.manifest.scaleClass, "compact");
      const sourceSha = (source.db.prepare(
        "SELECT sha256 FROM debate_mystery_mansion_assets WHERE user_id = 'creator'",
      ).get() as { sha256: string }).sha256;
      source.db.close();

      await assert.rejects(
        importPortableMansionPackageV1({
          db: target.db,
          userKey: target.key,
          userId: "recipient",
          envelope,
          password: "wrong password",
        }),
        /authentication failed/u,
      );
      assert.equal(rowCount(target.db, "debate_mystery_mansion_bundles"), 0);
      assert.equal(rowCount(target.db, "debate_mystery_mansion_assets"), 0);

      const bundleId = await importPortableMansionPackageV1({
        db: target.db,
        userKey: target.key,
        userId: "recipient",
        envelope,
        password: "correct horse battery staple",
      });
      const imported = getDebateMysteryMansionBundleV2(target.db, "recipient", bundleId);
      assert.equal(imported.rooms.length, 1);
      assert.equal(imported.suspectCount, 1);
      assert.equal(imported.scaleClass, "compact");
      const importedSha = (target.db.prepare(
        "SELECT sha256 FROM debate_mystery_mansion_assets WHERE user_id = 'recipient'",
      ).get() as { sha256: string }).sha256;
      assert.notEqual(importedSha, sourceSha);
      assert.equal(fetchCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects authenticated malformed media without leaving partial DB rows", async () => {
    const target = emptyTarget();
    const fakeImage = Buffer.from("RIFF0000WEBPnot-an-image");
    const digest = createHash("sha256").update(fakeImage).digest("hex");
    const archivePath = `assets/${digest}.webp`;
    const manifest: MansionPackageManifestV1 = {
      schema: "prism-mansion-package-v1",
      formatVersion: { major: 1, minor: 0 },
      packageId: "hostile-media",
      title: "Hostile media fixture",
      description: "Authenticated but malformed.",
      creator: { name: "Fixture", id: null, url: null },
      provenance: { createdAt: now, prismVersion: "0.15.0", generatedWith: [] },
      license: { name: "Private use", url: null, allowsRedistribution: false },
      contentWarnings: [],
      compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
      floorCount: 1,
      rooms: [{
        id: "room",
        templateId: "room",
        name: "Room",
        floor: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        neighborIds: [],
        slots: [{ id: "slot", x: 0.5, y: 0.5 }],
        emoji: "🔎",
        roomAssetId: "image",
        propAssetIds: [],
      }],
      houseStyle: { id: "test", label: "Test", promptContract: "Test." },
      assets: [{
        id: "image",
        role: "room",
        archivePath,
        sha256: digest,
        byteLength: fakeImage.byteLength,
        mimeType: "image/webp",
        width: 1536,
        height: 1024,
        durationMs: null,
      }],
      previewAssetId: "image",
      investigationThemeAssetId: null,
    };
    const payload = encodeInternalMansionPackageV1({
      manifest,
      assets: new Map([[archivePath, fakeImage]]),
    });
    const preflight = preflightPortableMysteryArchiveV1(payload);
    const envelope = sealPortableMysteryEnvelopeV1({
      payload,
      mode: "spoiler_seal",
      metadata: {
        packageType: "mansion",
        title: manifest.title,
        creatorName: manifest.creator.name,
        compatibility: manifest.compatibility,
        expandedBytes: preflight.expandedBytes,
        assetCount: 1,
        contentWarnings: [],
      },
    });
    await assert.rejects(
      importPortableMansionPackageV1({
        db: target.db,
        userKey: target.key,
        userId: "recipient",
        envelope,
      }),
      /could not be decoded/u,
    );
    assert.equal(rowCount(target.db, "debate_mystery_mansion_bundles"), 0);
    assert.equal(rowCount(target.db, "debate_mystery_mansion_assets"), 0);
    assert.equal(rowCount(target.db, "debate_mystery_mansion_asset_refs"), 0);
  });

  it("exports only the accepted mansion theme and preserves its title and identity on import", async () => {
    const source = await sourceFixture();
    const target = emptyTarget();
    const audio = Buffer.from(readFileSync(new URL(
      "../../../web/public/audio/debate/whodunnit/the-midnight-clue.mp3",
      import.meta.url,
    )));
    const digest = createHash("sha256").update(audio).digest("hex");
    const encrypted = encryptBytes(audio, source.key);
    const durationMs = 180_036;
    source.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, duration_ms, provider, model, created_at, updated_at)
       VALUES ('theme', 'creator', ?, ?, ?, ?, ?, 'audio/mpeg', ?, 'elevenlabs', 'music_v2', ?, ?)`,
    ).run(
      encrypted.ciphertext, encrypted.iv, encrypted.tag, digest, audio.byteLength,
      durationMs, now, now,
    );
    for (const logicalId of [
      "investigation-theme-v1",
      "investigation-theme-candidate-v1",
      "investigation-theme-previous-v1",
    ]) {
      source.db.prepare(
        `INSERT INTO debate_mystery_mansion_asset_refs
           (bundle_id, user_id, asset_id, role, logical_id, created_at)
         VALUES (?, 'creator', 'theme', 'music', ?, ?)`,
      ).run(source.bundleId, logicalId, now);
    }
    const identity = deriveMansionMusicIdentityV1({
      title: "Jungle Conservatory",
      houseStyleLabel: "Jungle Conservatory",
      houseStylePromptContract: "A grounded rain-soaked botanical manor.",
    });
    source.db.prepare(
      `UPDATE debate_mystery_mansion_bundles
          SET style_json = ?, library_metadata_json = ?
        WHERE id = ? AND user_id = 'creator'`,
    ).run(
      JSON.stringify({
        version: 1,
        id: "jungle-conservatory",
        label: "Jungle Conservatory",
        promptContract: "A grounded rain-soaked botanical manor.",
        musicIdentity: identity,
      }),
      JSON.stringify({
        version: 1,
        music: {
          version: 1,
          activeTitle: "Lanterns Beneath the Monsoon",
          activeLoop: {
            version: 1,
            loopStartMs: 1_000,
            loopEndMs: 179_000,
            crossfadeMs: 1_500,
            silenceRatio: 0.52,
          },
          candidateTitle: "Discarded preview",
          candidateLens: "shadow",
          previousTitle: "Previous version",
        },
      }),
      source.bundleId,
    );

    const envelope = await exportPortableMansionPackageV1({
      db: source.db,
      userKey: source.key,
      userId: "creator",
      bundleId: source.bundleId,
      prismVersion: "0.15.0",
      creatorName: "Package Creator",
      mode: "spoiler_seal",
    });
    const preview = await previewPortableMansionPackageV1({ envelope });
    assert.equal(preview.manifest.investigationThemeTitle, "Lanterns Beneath the Monsoon");
    assert.deepEqual(preview.manifest.musicIdentity, identity);
    assert.deepEqual(preview.manifest.investigationThemeLoop, {
      version: 1,
      loopStartMs: 1_000,
      loopEndMs: 179_000,
      crossfadeMs: 1_500,
      silenceRatio: 0.52,
    });
    assert.equal(preview.manifest.assets.filter((asset) => asset.role === "music").length, 1);

    const importedId = await importPortableMansionPackageV1({
      db: target.db,
      userKey: target.key,
      userId: "recipient",
      envelope,
    });
    const imported = getDebateMysteryMansionBundleV2(target.db, "recipient", importedId);
    assert.equal(imported.music?.active?.title, "Lanterns Beneath the Monsoon");
    assert.deepEqual(imported.music?.active?.loop, preview.manifest.investigationThemeLoop);
    assert.equal(imported.music?.candidate, null);
    assert.equal(imported.music?.previous, null);
    assert.equal(imported.music?.identity.noirSubgenre, "botanical chamber noir");
  });
});
