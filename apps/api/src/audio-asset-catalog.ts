import { createHmac, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  decideAudioReuseV1,
  type AudioAssetCategoryV1,
  type AudioAssetSafetyV1,
  type AudioAssetScopeV1,
  type AudioAssetSourceV1,
  type AudioAssetStatusV1,
  type AudioAssetV1,
  type AudioNeedV1,
  type AudioReuseDecisionV1,
  type AudioUsageRefV1,
} from "@localai/shared";
import { decryptBytes, encryptBytes } from "./security.ts";

const AUDIO_TENANT_HASH_PREFIX_V2 = "paud2_";
const AUDIO_TENANT_HASH_DOMAIN_V2 = Buffer.from(
  "PRISM\0AUDIO-ASSET-CONTENT-HASH\0V2\0",
  "utf8",
);

type AudioAssetRowV1 = {
  id: string;
  category: string;
  scope: string;
  status: string;
  source: string;
  title: string;
  description: string;
  semantic_role: string;
  automatic_tags_json: string;
  player_tags_json: string;
  context_json: string;
  safety: string;
  content_sha256: string | null;
  mime_type: string;
  byte_size: number | bigint;
  duration_ms: number | bigint | null;
  sample_rate_hz: number | bigint | null;
  channels: number | bigint | null;
  loopable: number | bigint;
  applet: string;
  provider: string | null;
  model: string | null;
  prompt_contract_hash: string | null;
  created_at: string;
  last_accessed_at: string | null;
  usage_count: number | bigint;
};

function jsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function jsonStringRecord(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function normalizeAudioAssetTagsV1(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLocaleLowerCase().replace(/\s+/gu, " ").slice(0, 48))
        .filter(Boolean),
    ),
  ].slice(0, 32);
}

export function audioAssetTenantContentHashV2(
  userKey: Uint8Array,
  bytes: Uint8Array,
): string {
  if (!(userKey instanceof Uint8Array) || userKey.length !== 32) {
    throw new Error("Audio asset owner key is invalid.");
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("Audio asset bytes are invalid.");
  }
  return `${AUDIO_TENANT_HASH_PREFIX_V2}${createHmac("sha256", userKey)
    .update(AUDIO_TENANT_HASH_DOMAIN_V2)
    .update(bytes)
    .digest("hex")}`;
}

export function ensureAudioAssetCatalogSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audio_asset_blobs (
      user_id TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      cipher_iv BLOB NOT NULL,
      cipher_tag BLOB NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, sha256),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audio_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('music', 'effects', 'ambience')),
      scope TEXT NOT NULL CHECK(scope IN ('universal', 'theme', 'identity')),
      status TEXT NOT NULL CHECK(status IN ('candidate', 'accepted', 'discarded')),
      source TEXT NOT NULL CHECK(source IN ('generated', 'uploaded', 'legacy')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      semantic_role TEXT NOT NULL,
      automatic_tags_json TEXT NOT NULL DEFAULT '[]',
      player_tags_json TEXT NOT NULL DEFAULT '[]',
      context_json TEXT NOT NULL DEFAULT '{}',
      safety TEXT NOT NULL CHECK(safety IN ('nonsemantic', 'stage_cue_required')),
      content_sha256 TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      sample_rate_hz INTEGER,
      channels INTEGER,
      loopable INTEGER NOT NULL DEFAULT 0,
      applet TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      prompt_contract_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id, content_sha256)
        REFERENCES audio_asset_blobs(user_id, sha256) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_audio_assets_user_category_status
      ON audio_assets(user_id, category, status, updated_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_audio_assets_user_role
      ON audio_assets(user_id, category, semantic_role, scope, status);
    CREATE TABLE IF NOT EXISTS audio_asset_usages (
      asset_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY(asset_id, owner_type, owner_id, role),
      FOREIGN KEY(asset_id) REFERENCES audio_assets(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_audio_asset_usages_owner
      ON audio_asset_usages(user_id, owner_type, owner_id, active);
  `);
}

function assetFromRow(row: AudioAssetRowV1): AudioAssetV1 {
  return {
    version: 1,
    id: row.id,
    category: row.category as AudioAssetCategoryV1,
    scope: row.scope as AudioAssetScopeV1,
    status: row.status as AudioAssetStatusV1,
    source: row.source as AudioAssetSourceV1,
    title: row.title,
    description: row.description,
    semanticRole: row.semantic_role,
    automaticTags: jsonStringArray(row.automatic_tags_json),
    playerTags: jsonStringArray(row.player_tags_json),
    context: jsonStringRecord(row.context_json),
    safety: row.safety as AudioAssetSafetyV1,
    contentSha256: row.content_sha256,
    technical: {
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size) || 0,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      sampleRateHz: row.sample_rate_hz === null ? null : Number(row.sample_rate_hz),
      channels: row.channels === null ? null : Number(row.channels),
      loopable: Boolean(row.loopable),
    },
    provenance: {
      applet: row.applet,
      provider: row.provider,
      model: row.model,
      promptContractHash: row.prompt_contract_hash,
      createdAt: row.created_at,
    },
    usageCount: Number(row.usage_count) || 0,
    lastAccessedAt: row.last_accessed_at,
  };
}

const AUDIO_ASSET_SELECT_V1 = `
  SELECT assets.*,
         (SELECT COUNT(*) FROM audio_asset_usages usages
           WHERE usages.asset_id = assets.id AND usages.user_id = assets.user_id
             AND usages.active = 1) AS usage_count
    FROM audio_assets assets`;

export function listCanonicalAudioAssetsV1(
  db: DatabaseSync,
  userId: string,
  options: {
    category: AudioAssetCategoryV1;
    query?: string | null;
    status?: AudioAssetStatusV1 | null;
    limit?: number;
  },
): AudioAssetV1[] {
  ensureAudioAssetCatalogSchema(db);
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const rows = db.prepare(
    `${AUDIO_ASSET_SELECT_V1}
      WHERE assets.user_id = ? AND assets.category = ?
        AND (? IS NULL OR assets.status = ?)
      ORDER BY assets.updated_at DESC, assets.id
      LIMIT ?`,
  ).all(
    userId,
    options.category,
    options.status ?? null,
    options.status ?? null,
    limit,
  ) as unknown as AudioAssetRowV1[];
  const assets = rows.map(assetFromRow);
  if (!query) return assets;
  return assets.filter((asset) => [
    asset.title,
    asset.description,
    asset.semanticRole,
    ...asset.automaticTags,
    ...asset.playerTags,
    ...Object.values(asset.context),
  ].join(" ").toLocaleLowerCase().includes(query));
}

export function registerAudioAssetV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bytes: Buffer;
  category: AudioAssetCategoryV1;
  scope: AudioAssetScopeV1;
  status?: AudioAssetStatusV1;
  source: Exclude<AudioAssetSourceV1, "prism">;
  title: string;
  description?: string;
  semanticRole: string;
  automaticTags: string[];
  playerTags?: string[];
  context?: Record<string, string>;
  safety: AudioAssetSafetyV1;
  mimeType: string;
  durationMs?: number | null;
  sampleRateHz?: number | null;
  channels?: number | null;
  loopable?: boolean;
  applet: string;
  provider?: string | null;
  model?: string | null;
  promptContractHash?: string | null;
}): AudioAssetV1 {
  ensureAudioAssetCatalogSchema(args.db);
  if (args.bytes.byteLength < 1) throw new Error("Audio asset bytes are empty.");
  if (!args.mimeType.startsWith("audio/")) throw new Error("Audio asset MIME type is invalid.");
  migrateLegacyAudioAssetBlobHashesV2(args.db, args.userKey, args.userId);
  const sha256 = audioAssetTenantContentHashV2(args.userKey, args.bytes);
  const now = new Date().toISOString();
  const id = randomUUID();
  const encrypted = encryptBytes(args.bytes, args.userKey);
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT OR IGNORE INTO audio_asset_blobs
         (user_id, sha256, ciphertext, cipher_iv, cipher_tag, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      args.userId,
      sha256,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      args.bytes.byteLength,
      now,
    );
    args.db.prepare(
      `INSERT INTO audio_assets
         (id, user_id, category, scope, status, source, title, description,
          semantic_role, automatic_tags_json, player_tags_json, context_json,
          safety, content_sha256, mime_type, byte_size, duration_ms,
          sample_rate_hz, channels, loopable, applet, provider, model,
          prompt_contract_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      args.userId,
      args.category,
      args.scope,
      args.status ?? "candidate",
      args.source,
      args.title.trim().slice(0, 180),
      args.description?.trim().slice(0, 600) ?? "",
      args.semanticRole.trim().toLocaleLowerCase().replace(/\s+/gu, "_").slice(0, 96),
      JSON.stringify(normalizeAudioAssetTagsV1(args.automaticTags)),
      JSON.stringify(normalizeAudioAssetTagsV1(args.playerTags ?? [])),
      JSON.stringify(args.context ?? {}),
      args.safety,
      sha256,
      args.mimeType,
      args.bytes.byteLength,
      args.durationMs ?? null,
      args.sampleRateHz ?? null,
      args.channels ?? null,
      args.loopable ? 1 : 0,
      args.applet.trim().slice(0, 80),
      args.provider?.trim().slice(0, 80) ?? null,
      args.model?.trim().slice(0, 160) ?? null,
      args.promptContractHash?.trim().slice(0, 128) ?? null,
      now,
      now,
    );
    args.db.exec("COMMIT");
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  return getCanonicalAudioAssetV1(args.db, args.userId, id)!;
}

export function getCanonicalAudioAssetV1(
  db: DatabaseSync,
  userId: string,
  assetId: string,
): AudioAssetV1 | null {
  ensureAudioAssetCatalogSchema(db);
  const row = db.prepare(
    `${AUDIO_ASSET_SELECT_V1} WHERE assets.user_id = ? AND assets.id = ?`,
  ).get(userId, assetId) as unknown as AudioAssetRowV1 | undefined;
  return row ? assetFromRow(row) : null;
}

export function updateAudioAssetPlayerTagsV1(
  db: DatabaseSync,
  userId: string,
  assetId: string,
  tags: readonly unknown[],
): AudioAssetV1 | null {
  ensureAudioAssetCatalogSchema(db);
  db.prepare(
    `UPDATE audio_assets SET player_tags_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    JSON.stringify(normalizeAudioAssetTagsV1(tags)),
    new Date().toISOString(),
    assetId,
    userId,
  );
  return getCanonicalAudioAssetV1(db, userId, assetId);
}

export function setAudioAssetStatusV1(
  db: DatabaseSync,
  userId: string,
  assetId: string,
  status: AudioAssetStatusV1,
): AudioAssetV1 | null {
  ensureAudioAssetCatalogSchema(db);
  db.prepare(
    `UPDATE audio_assets SET status = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(status, new Date().toISOString(), assetId, userId);
  return getCanonicalAudioAssetV1(db, userId, assetId);
}

export function upsertAudioAssetUsageV1(
  db: DatabaseSync,
  userId: string,
  usage: Omit<AudioUsageRefV1, "version" | "createdAt">,
): void {
  ensureAudioAssetCatalogSchema(db);
  const owned = db.prepare(
    "SELECT 1 FROM audio_assets WHERE id = ? AND user_id = ?",
  ).get(usage.assetId, userId);
  if (!owned) throw new Error("Audio asset is unavailable.");
  db.prepare(
    `INSERT INTO audio_asset_usages
       (asset_id, user_id, owner_type, owner_id, role, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(asset_id, owner_type, owner_id, role) DO UPDATE SET
       active = excluded.active`,
  ).run(
    usage.assetId,
    userId,
    usage.ownerType,
    usage.ownerId,
    usage.role,
    usage.active ? 1 : 0,
    new Date().toISOString(),
  );
}

export function listAudioAssetUsagesV1(
  db: DatabaseSync,
  userId: string,
  assetId: string,
): AudioUsageRefV1[] {
  ensureAudioAssetCatalogSchema(db);
  return (db.prepare(
    `SELECT asset_id, owner_type, owner_id, role, active, created_at
       FROM audio_asset_usages
      WHERE user_id = ? AND asset_id = ? AND active = 1
      ORDER BY created_at DESC, owner_type, owner_id, role`,
  ).all(userId, assetId) as unknown as Array<{
    asset_id: string;
    owner_type: string;
    owner_id: string;
    role: string;
    active: number | bigint;
    created_at: string;
  }>).map((row) => ({
    version: 1,
    assetId: row.asset_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
  }));
}

export function decideCatalogAudioReuseV1(
  db: DatabaseSync,
  userId: string,
  need: AudioNeedV1,
): AudioReuseDecisionV1 {
  return decideAudioReuseV1(
    need,
    listCanonicalAudioAssetsV1(db, userId, {
      category: need.category,
      status: "accepted",
      limit: 200,
    }),
  );
}

export function readCanonicalAudioAssetBytesV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
  assetId: string,
): { bytes: Buffer; mimeType: string } | null {
  ensureAudioAssetCatalogSchema(db);
  migrateLegacyAudioAssetBlobHashesV2(db, userKey, userId);
  const row = db.prepare(
    `SELECT assets.mime_type, blobs.ciphertext, blobs.cipher_iv, blobs.cipher_tag
       FROM audio_assets assets
       JOIN audio_asset_blobs blobs
         ON blobs.user_id = assets.user_id AND blobs.sha256 = assets.content_sha256
      WHERE assets.id = ? AND assets.user_id = ?`,
  ).get(assetId, userId) as {
    mime_type: string;
    ciphertext: Buffer;
    cipher_iv: Buffer;
    cipher_tag: Buffer;
  } | undefined;
  if (!row) return null;
  const bytes = decryptBytes(
    { ciphertext: row.ciphertext, iv: row.cipher_iv, tag: row.cipher_tag },
    userKey,
  );
  db.prepare(
    "UPDATE audio_assets SET last_accessed_at = ? WHERE id = ? AND user_id = ?",
  ).run(new Date().toISOString(), assetId, userId);
  return { bytes, mimeType: row.mime_type };
}

let audioHashMigrationSavepointSequence = 0;

export function migrateLegacyAudioAssetBlobHashesV2(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
): number {
  ensureAudioAssetCatalogSchema(db);
  const rows = db
    .prepare(
      `SELECT sha256, ciphertext, cipher_iv, cipher_tag, byte_size, created_at
         FROM audio_asset_blobs
        WHERE user_id = ? AND sha256 NOT LIKE ?
        ORDER BY sha256`,
    )
    .all(userId, `${AUDIO_TENANT_HASH_PREFIX_V2}%`) as unknown as Array<{
    sha256: string;
    ciphertext: Buffer;
    cipher_iv: Buffer;
    cipher_tag: Buffer;
    byte_size: number | bigint;
    created_at: string;
  }>;
  if (rows.length === 0) return 0;
  const nested = db.isTransaction;
  const savepoint = `prism_audio_hash_v2_${++audioHashMigrationSavepointSequence}`;
  if (nested) db.exec(`SAVEPOINT ${savepoint}`);
  else db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const plaintext = decryptBytes(
        {
          ciphertext: row.ciphertext,
          iv: row.cipher_iv,
          tag: row.cipher_tag,
        },
        userKey,
      );
      try {
        const tenantHash = audioAssetTenantContentHashV2(userKey, plaintext);
        db.prepare(
          `INSERT OR IGNORE INTO audio_asset_blobs
             (user_id, sha256, ciphertext, cipher_iv, cipher_tag, byte_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          userId,
          tenantHash,
          row.ciphertext,
          row.cipher_iv,
          row.cipher_tag,
          row.byte_size,
          row.created_at,
        );
        db.prepare(
          `UPDATE audio_assets SET content_sha256 = ?
            WHERE user_id = ? AND content_sha256 = ?`,
        ).run(tenantHash, userId, row.sha256);
        db.prepare(
          "DELETE FROM audio_asset_blobs WHERE user_id = ? AND sha256 = ?",
        ).run(userId, row.sha256);
      } finally {
        plaintext.fill(0);
      }
    }
    if (nested) db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    else db.exec("COMMIT");
    return rows.length;
  } catch (error) {
    if (nested) {
      try {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      } finally {
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
    } else if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    throw error;
  }
}

export interface CanonicalAudioAssetStorageV1 {
  blobBytes: number;
  assetCount: number;
  acceptedCount: number;
  hotCount: number;
  coldCandidateCount: number;
  coldCandidateBytes: number;
}

export function summarizeCanonicalAudioAssetCategoryBytesV1(
  db: DatabaseSync,
  userId: string,
  category: AudioAssetCategoryV1,
): number {
  ensureAudioAssetCatalogSchema(db);
  const row = db.prepare(
    `SELECT COALESCE(SUM(blobs.byte_size), 0) AS bytes
       FROM audio_asset_blobs blobs
      WHERE blobs.user_id = ? AND EXISTS (
        SELECT 1 FROM audio_assets assets
         WHERE assets.user_id = blobs.user_id
           AND assets.content_sha256 = blobs.sha256
           AND assets.category = ?
      )`,
  ).get(userId, category) as { bytes: number | bigint };
  return Number(row.bytes) || 0;
}

export function summarizeCanonicalAudioAssetStorageV1(
  db: DatabaseSync,
  userId: string,
): CanonicalAudioAssetStorageV1 {
  ensureAudioAssetCatalogSchema(db);
  const totals = db.prepare(
    `SELECT COUNT(*) AS asset_count,
            SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
            SUM(CASE WHEN status = 'accepted' AND EXISTS (
              SELECT 1 FROM audio_asset_usages usages
               WHERE usages.asset_id = audio_assets.id
                 AND usages.user_id = audio_assets.user_id AND usages.active = 1
            ) THEN 1 ELSE 0 END) AS hot_count,
            SUM(CASE WHEN status IN ('candidate', 'discarded') AND NOT EXISTS (
              SELECT 1 FROM audio_asset_usages usages
               WHERE usages.asset_id = audio_assets.id
                 AND usages.user_id = audio_assets.user_id AND usages.active = 1
            ) THEN 1 ELSE 0 END) AS cold_count,
            SUM(CASE WHEN status IN ('candidate', 'discarded') AND NOT EXISTS (
              SELECT 1 FROM audio_asset_usages usages
               WHERE usages.asset_id = audio_assets.id
                 AND usages.user_id = audio_assets.user_id AND usages.active = 1
            ) THEN byte_size ELSE 0 END) AS cold_bytes
       FROM audio_assets WHERE user_id = ?`,
  ).get(userId) as {
    asset_count: number | bigint | null;
    accepted_count: number | bigint | null;
    hot_count: number | bigint | null;
    cold_count: number | bigint | null;
    cold_bytes: number | bigint | null;
  };
  const blobs = db.prepare(
    "SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM audio_asset_blobs WHERE user_id = ?",
  ).get(userId) as { bytes: number | bigint };
  return {
    blobBytes: Number(blobs.bytes) || 0,
    assetCount: Number(totals.asset_count) || 0,
    acceptedCount: Number(totals.accepted_count) || 0,
    hotCount: Number(totals.hot_count) || 0,
    coldCandidateCount: Number(totals.cold_count) || 0,
    coldCandidateBytes: Number(totals.cold_bytes) || 0,
  };
}

export function deleteColdAudioAssetCandidatesV1(
  db: DatabaseSync,
  userId: string,
): { deletedAssets: number; reclaimedBytes: number } {
  ensureAudioAssetCatalogSchema(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    const before = db.prepare(
      "SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM audio_asset_blobs WHERE user_id = ?",
    ).get(userId) as { bytes: number | bigint };
    const deleted = db.prepare(
      `DELETE FROM audio_assets
        WHERE user_id = ? AND status IN ('candidate', 'discarded')
          AND NOT EXISTS (
            SELECT 1 FROM audio_asset_usages usages
             WHERE usages.asset_id = audio_assets.id
               AND usages.user_id = audio_assets.user_id AND usages.active = 1
          )`,
    ).run(userId);
    db.prepare(
      `DELETE FROM audio_asset_blobs
        WHERE user_id = ? AND NOT EXISTS (
          SELECT 1 FROM audio_assets assets
           WHERE assets.user_id = audio_asset_blobs.user_id
             AND assets.content_sha256 = audio_asset_blobs.sha256
        )`,
    ).run(userId);
    const after = db.prepare(
      "SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM audio_asset_blobs WHERE user_id = ?",
    ).get(userId) as { bytes: number | bigint };
    db.exec("COMMIT");
    return {
      deletedAssets: Number(deleted.changes) || 0,
      reclaimedBytes: Math.max(0, Number(before.bytes) - Number(after.bytes)),
    };
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
