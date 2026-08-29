import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { AudioNeedV1 } from "@localai/shared";
import {
  decideCatalogAudioReuseV1,
  deleteColdAudioAssetCandidatesV1,
  ensureAudioAssetCatalogSchema,
  getCanonicalAudioAssetV1,
  listCanonicalAudioAssetsV1,
  readCanonicalAudioAssetBytesV1,
  registerAudioAssetV1,
  summarizeCanonicalAudioAssetCategoryBytesV1,
  summarizeCanonicalAudioAssetStorageV1,
  updateAudioAssetPlayerTagsV1,
  upsertAudioAssetUsageV1,
} from "../audio-asset-catalog.ts";

function fixture(): { db: DatabaseSync; key: Buffer } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY);");
  db.prepare("INSERT INTO users (id) VALUES (?), (?)").run("owner", "other");
  ensureAudioAssetCatalogSchema(db);
  return { db, key: Buffer.alloc(32, 5) };
}

function addPaperFold(
  db: DatabaseSync,
  key: Buffer,
  userId = "owner",
  scope: "universal" | "theme" | "identity" = "universal",
) {
  return registerAudioAssetV1({
    db,
    userKey: key,
    userId,
    bytes: Buffer.from("decoded paper fold fixture"),
    category: "effects",
    scope,
    status: "accepted",
    source: "generated",
    title: "Envelope fold",
    semanticRole: "paper_fold",
    automaticTags: ["Paper", "Fold", "Envelope"],
    context: { object: "paper", action: "fold" },
    safety: "nonsemantic",
    mimeType: "audio/ogg",
    durationMs: 900,
    loopable: false,
    applet: "whodunnit",
    provider: "elevenlabs",
    model: "eleven_text_to_sound_v2",
  });
}

const paperFoldNeed: AudioNeedV1 = {
  version: 1,
  category: "effects",
  semanticRole: "paper_fold",
  requiredTags: ["paper", "fold"],
  preferredTags: ["envelope"],
  allowedScopes: ["universal", "theme"],
  applet: "whodunnit",
  context: { object: "paper", action: "fold" },
  durationMs: { min: 400, max: 2_000 },
  loopable: false,
  stageCueAuthorized: false,
};

describe("canonical audio asset catalog", () => {
  it("encrypts once per tenant hash and keeps metadata records independently reusable", () => {
    const { db, key } = fixture();
    const first = addPaperFold(db, key);
    const second = addPaperFold(db, key);

    assert.notEqual(first.id, second.id);
    assert.equal(first.contentSha256, second.contentSha256);
    assert.equal((db.prepare(
      "SELECT COUNT(*) AS count FROM audio_asset_blobs WHERE user_id = 'owner'",
    ).get() as { count: number }).count, 1);
    assert.equal(listCanonicalAudioAssetsV1(db, "owner", { category: "effects" }).length, 2);
    assert.equal(
      summarizeCanonicalAudioAssetCategoryBytesV1(db, "owner", "effects"),
      Buffer.byteLength("decoded paper fold fixture"),
    );
    assert.deepEqual(readCanonicalAudioAssetBytesV1(db, key, "owner", first.id)?.bytes, Buffer.from("decoded paper fold fixture"));
  });

  it("enforces tenant isolation for metadata, tags, usages, and encrypted bytes", () => {
    const { db, key } = fixture();
    const asset = addPaperFold(db, key);

    assert.equal(getCanonicalAudioAssetV1(db, "other", asset.id), null);
    assert.equal(readCanonicalAudioAssetBytesV1(db, key, "other", asset.id), null);
    assert.equal(updateAudioAssetPlayerTagsV1(db, "other", asset.id, ["private"]), null);
    assert.throws(() => upsertAudioAssetUsageV1(db, "other", {
      assetId: asset.id,
      ownerType: "mansion",
      ownerId: "other-house",
      role: "pickup",
      active: true,
    }), /unavailable/u);

    const updated = updateAudioAssetPlayerTagsV1(db, "owner", asset.id, [" Envelope ", "PAPER", "paper"]);
    assert.deepEqual(updated?.playerTags, ["envelope", "paper"]);
    upsertAudioAssetUsageV1(db, "owner", {
      assetId: asset.id,
      ownerType: "mansion",
      ownerId: "blackwood",
      role: "envelope_pickup",
      active: true,
    });
    assert.equal(getCanonicalAudioAssetV1(db, "owner", asset.id)?.usageCount, 1);
  });

  it("auto-reuses only an exact accepted universal match", () => {
    const { db, key } = fixture();
    const universal = addPaperFold(db, key);
    registerAudioAssetV1({
      db,
      userKey: key,
      userId: "owner",
      bytes: Buffer.from("generic rustle"),
      category: "effects",
      scope: "universal",
      status: "accepted",
      source: "generated",
      title: "Paper rustle",
      semanticRole: "paper_rustle",
      automaticTags: ["paper", "rustle"],
      context: { object: "paper", action: "rustle" },
      safety: "nonsemantic",
      mimeType: "audio/ogg",
      durationMs: 800,
      loopable: false,
      applet: "whodunnit",
    });
    const decision = decideCatalogAudioReuseV1(db, "owner", paperFoldNeed);
    assert.equal(decision.action, "reuse");
    assert.equal(decision.assetId, universal.id);
  });

  it("requires audition for themed matches and ignores cold candidates", () => {
    const { db, key } = fixture();
    const themed = addPaperFold(db, key, "owner", "theme");
    const preview = decideCatalogAudioReuseV1(db, "owner", {
      ...paperFoldNeed,
      allowedScopes: ["theme"],
    });
    assert.equal(preview.action, "preview");
    assert.equal(preview.assetId, themed.id);

    db.prepare("UPDATE audio_assets SET status = 'candidate' WHERE id = ?").run(themed.id);
    assert.equal(decideCatalogAudioReuseV1(db, "owner", {
      ...paperFoldNeed,
      allowedScopes: ["theme"],
    }).action, "generate");
  });

  it("cleans only unreferenced cold candidates and reclaims only orphaned blobs", () => {
    const { db, key } = fixture();
    const accepted = addPaperFold(db, key);
    const candidate = registerAudioAssetV1({
      db,
      userKey: key,
      userId: "owner",
      bytes: Buffer.from("unused generated take"),
      category: "effects",
      scope: "universal",
      status: "candidate",
      source: "generated",
      title: "Candidate fold",
      semanticRole: "paper_fold",
      automaticTags: ["paper", "fold"],
      safety: "nonsemantic",
      mimeType: "audio/ogg",
      applet: "whodunnit",
    });
    const protectedCandidate = registerAudioAssetV1({
      db,
      userKey: key,
      userId: "owner",
      bytes: Buffer.from("referenced candidate"),
      category: "ambience",
      scope: "identity",
      status: "candidate",
      source: "generated",
      title: "Pending bed",
      semanticRole: "world_bed",
      automaticTags: ["rain"],
      safety: "nonsemantic",
      mimeType: "audio/ogg",
      loopable: true,
      applet: "whodunnit",
    });
    upsertAudioAssetUsageV1(db, "owner", {
      assetId: protectedCandidate.id,
      ownerType: "mansion",
      ownerId: "blackwood",
      role: "pending_preview",
      active: true,
    });

    const before = summarizeCanonicalAudioAssetStorageV1(db, "owner");
    assert.equal(before.coldCandidateCount, 1);
    const cleaned = deleteColdAudioAssetCandidatesV1(db, "owner");
    assert.equal(cleaned.deletedAssets, 1);
    assert.ok(cleaned.reclaimedBytes > 0);
    assert.equal(getCanonicalAudioAssetV1(db, "owner", candidate.id), null);
    assert.ok(getCanonicalAudioAssetV1(db, "owner", accepted.id));
    assert.ok(getCanonicalAudioAssetV1(db, "owner", protectedCandidate.id));
  });
});
