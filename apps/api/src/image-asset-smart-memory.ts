/**
 * Smart asset memory: reuse telemetry, fidelity-preserving cold storage,
 * curated-junk scoring, create-time tags (local aux + heuristics), and
 * player Compress + Undo (lossy, file-backed).
 */
import { existsSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  IMAGE_ASSET_SMART_TAG_MAX,
  IMAGE_ASSET_SMART_TAG_MIN,
  type ImageAssetKind,
  type ImageAssetSmartTidyPreview,
  type ImageAssetSmartTidyResult,
  type ImageAssetStorageTier,
} from "@localai/shared";
import {
  buildGeneratedImageColdRelativePath,
  buildGeneratedImageCompressUndoRelativePath,
  buildGeneratedImageRelativePath,
  contentTypeForGeneratedImageRelativePath,
  generatedImageStorageSizeBytes,
  isColdGeneratedImageRelativePath,
  readGeneratedImageBytes,
  replaceGeneratedImageBytesAtomically,
  resolveAbsoluteUnderDataRoot,
  writeGeneratedImageBytes,
} from "./image-storage.ts";
import { tryGenerateThumbAfterPngWrite } from "./image-thumb.ts";
import { getAuxiliaryProvider } from "./providers.ts";

export const IMAGE_ASSET_ACCESS_TELEMETRY_THROTTLE_MS = 15 * 60 * 1000;
export const IMAGE_ASSET_COLD_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const IMAGE_ASSET_COLD_MIN_IDLE_MS = 14 * 24 * 60 * 60 * 1000;
export const IMAGE_ASSET_REUSE_PROTECT_SCORE = 3;
export const IMAGE_ASSET_SMART_TIDY_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const IMAGE_ASSET_COMPRESS_MIN_EDGE_PX = 1536;
export const IMAGE_ASSET_COMPRESS_SCALE = 0.5;
/** Max longest edge for temporary vision / prompt attachments (Phase 2). */
export const IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX = 1024;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "from",
  "into",
  "as",
  "by",
  "at",
  "is",
  "are",
  "be",
  "this",
  "that",
  "it",
  "its",
  "image",
  "photo",
  "picture",
  "portrait",
  "scene",
  "style",
  "high",
  "quality",
  "detailed",
  "very",
  "really",
]);

const KIND_SEED_TAGS: Record<ImageAssetKind, readonly string[]> = {
  general_image: ["gallery", "image", "library"],
  debate_exhibit: ["debate", "exhibit", "evidence"],
  signal_studio: ["signal", "studio", "set"],
  signal_logo: ["signal", "logo", "brand"],
  slate_cover: ["slate", "cover", "story"],
  slate_visual_study: ["slate", "visual", "study"],
  zen_atmosphere: ["zen", "atmosphere", "wallpaper"],
  home_atmosphere: ["home", "atmosphere", "hub"],
  group_room_atmosphere: ["group", "room", "atmosphere"],
};

export class ImageAssetSmartMemoryError extends Error {
  readonly code: "not_found" | "invalid" | "unavailable" | "in_use";

  constructor(code: ImageAssetSmartMemoryError["code"], message: string) {
    super(message);
    this.name = "ImageAssetSmartMemoryError";
    this.code = code;
  }
}

function addColumnIfMissing(
  db: DatabaseSync,
  table: string,
  name: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((column) => column.name === name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
}

/** Extends image_asset_sets with smart-memory columns (idempotent). */
export function ensureImageAssetSmartMemorySchema(db: DatabaseSync): void {
  // Columns are created in ensureImageAssetLibrarySchema; keep this export for
  // call sites / tests that want an explicit smart-memory ensure hook.
  addColumnIfMissing(
    db,
    "image_asset_sets",
    "storage_tier",
    "TEXT NOT NULL DEFAULT 'hot'",
  );
  addColumnIfMissing(
    db,
    "image_asset_sets",
    "access_count",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(db, "image_asset_sets", "last_accessed_at", "TEXT");
  addColumnIfMissing(
    db,
    "image_asset_sets",
    "reuse_score",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "image_asset_sets",
    "compress_undo_available",
    "INTEGER NOT NULL DEFAULT 0",
  );
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_image_asset_sets_smart_memory
      ON image_asset_sets(user_id, storage_tier, reuse_score, last_accessed_at);
  `);
}

export function normalizeSmartTags(values: readonly unknown[]): string[] {
  const cleaned = [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/gu, " ")
            .replace(/\s+/gu, " ")
            .slice(0, 32),
        )
        .filter((value) => value.length >= 2 && !STOP_WORDS.has(value)),
    ),
  ];
  if (cleaned.length >= IMAGE_ASSET_SMART_TAG_MIN) {
    return cleaned.slice(0, IMAGE_ASSET_SMART_TAG_MAX);
  }
  const padded = [...cleaned];
  for (const fallback of ["asset", "local", "prism", "media", "library"]) {
    if (padded.length >= IMAGE_ASSET_SMART_TAG_MIN) break;
    if (!padded.includes(fallback)) padded.push(fallback);
  }
  return padded.slice(0, IMAGE_ASSET_SMART_TAG_MAX);
}

export function heuristicSmartTags(input: {
  kind: ImageAssetKind;
  title?: string | null;
  prompt?: string | null;
  revisedPrompt?: string | null;
  extra?: readonly string[];
}): string[] {
  const tokens: string[] = [...(KIND_SEED_TAGS[input.kind] ?? ["asset"])];
  const blob = [input.title, input.prompt, input.revisedPrompt, ...(input.extra ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  for (const raw of blob.toLowerCase().match(/[a-z][a-z0-9-]{2,}/gu) ?? []) {
    if (STOP_WORDS.has(raw)) continue;
    tokens.push(raw);
  }
  return normalizeSmartTags(tokens);
}

async function refineTagsWithLocalAux(
  seed: readonly string[],
  context: { title: string; prompt: string; kind: ImageAssetKind },
  prismDefaultLlmModel?: string | null,
): Promise<string[] | null> {
  try {
    const provider = getAuxiliaryProvider(prismDefaultLlmModel ?? undefined);
    const text = await provider.generateResponse(
      [
        {
          role: "system",
          content:
            `You label creative image assets. Reply with ONLY a JSON array of ${IMAGE_ASSET_SMART_TAG_MIN} to ${IMAGE_ASSET_SMART_TAG_MAX} short lowercase English tags (1-2 words each). No markdown.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            kind: context.kind,
            title: context.title,
            prompt: context.prompt.slice(0, 600),
            seedTags: seed,
          }),
        },
      ],
      { temperature: 0.2, maxTokens: 120 },
    );
    const match = text.trim().match(/\[[\s\S]*\]/u);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    return normalizeSmartTags(parsed);
  } catch {
    return null;
  }
}

/**
 * Builds 3–6 automatic tags. Uses local Ollama auxiliary when available;
 * never calls OpenAI. Heuristics always provide a safe fallback.
 */
export async function generateSmartAutomaticTags(input: {
  kind: ImageAssetKind;
  title: string;
  prompt?: string | null;
  revisedPrompt?: string | null;
  extra?: readonly string[];
  prismDefaultLlmModel?: string | null;
  /** When true, skip the aux LLM (tests / offline forced heuristic). */
  heuristicOnly?: boolean;
}): Promise<string[]> {
  const seed = heuristicSmartTags(input);
  if (input.heuristicOnly) return seed;
  const refined = await refineTagsWithLocalAux(
    seed,
    {
      kind: input.kind,
      title: input.title,
      prompt: input.prompt ?? input.revisedPrompt ?? input.title,
    },
    input.prismDefaultLlmModel,
  );
  return refined && refined.length >= IMAGE_ASSET_SMART_TAG_MIN ? refined : seed;
}

export function computeReuseScore(input: {
  accessCount: number;
  usageCount: number;
  lastAccessedAt: string | null;
  nowMs?: number;
}): number {
  const now = input.nowMs ?? Date.now();
  let score = Math.min(20, Math.max(0, input.accessCount) + Math.max(0, input.usageCount) * 2);
  if (input.lastAccessedAt) {
    const ageMs = Math.max(0, now - Date.parse(input.lastAccessedAt));
    if (Number.isFinite(ageMs) && ageMs < 7 * 24 * 60 * 60 * 1000) {
      score += 2;
    }
  }
  return score;
}

export function recordImageAssetAccess(
  db: DatabaseSync,
  userId: string,
  imageId: string,
  options?: { force?: boolean; now?: Date },
): boolean {
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();
  const row = db
    .prepare(
      `SELECT sets.id AS set_id, sets.access_count, sets.last_accessed_at, sets.reuse_score
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
        WHERE sets.user_id = ? AND items.image_id = ?
        LIMIT 1`,
    )
    .get(userId, imageId) as
    | {
        set_id: string;
        access_count: number | bigint;
        last_accessed_at: string | null;
        reuse_score: number | bigint;
      }
    | undefined;
  if (!row) return false;
  const last = row.last_accessed_at ? Date.parse(row.last_accessed_at) : 0;
  if (
    !options?.force &&
    Number.isFinite(last) &&
    now.getTime() - last < IMAGE_ASSET_ACCESS_TELEMETRY_THROTTLE_MS
  ) {
    return false;
  }
  const accessCount = Number(row.access_count) + 1;
  const usageCount = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM image_asset_set_items items
             JOIN images ON images.id = items.image_id
            WHERE items.set_id = ?`,
        )
        .get(row.set_id) as { count: number | bigint }
    ).count,
  );
  // usageCount above is member count; reuse score uses access + reference proxy.
  const referenceProxy = Number(row.reuse_score) > 0 ? 0 : 0;
  const reuseScore = computeReuseScore({
    accessCount,
    usageCount: referenceProxy,
    lastAccessedAt: nowIso,
    nowMs: now.getTime(),
  });
  db.prepare(
    `UPDATE image_asset_sets
        SET access_count = ?, last_accessed_at = ?, reuse_score = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(accessCount, nowIso, Math.max(reuseScore, accessCount), nowIso, row.set_id, userId);
  return true;
}

export function recordImageAssetAttach(
  db: DatabaseSync,
  userId: string,
  imageId: string,
): void {
  recordImageAssetAccess(db, userId, imageId, { force: true });
  const row = db
    .prepare(
      `SELECT sets.id AS set_id, sets.access_count, sets.reuse_score
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
        WHERE sets.user_id = ? AND items.image_id = ?
        LIMIT 1`,
    )
    .get(userId, imageId) as
    | { set_id: string; access_count: number | bigint; reuse_score: number | bigint }
    | undefined;
  if (!row) return;
  const reuseScore = Math.max(
    Number(row.reuse_score) + 2,
    Number(row.access_count) + 2,
  );
  db.prepare(
    `UPDATE image_asset_sets SET reuse_score = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
  ).run(reuseScore, new Date().toISOString(), row.set_id, userId);
}

export function applyAutomaticTagsToSet(
  db: DatabaseSync,
  userId: string,
  setId: string,
  tags: readonly string[],
): void {
  const normalized = normalizeSmartTags(tags);
  db.prepare(
    `UPDATE image_asset_sets
        SET automatic_tags_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(JSON.stringify(normalized), new Date().toISOString(), setId, userId);
}

async function encodeLosslessColdWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: "error" })
    .rotate()
    .webp({ lossless: true, effort: 4 })
    .toBuffer();
}

export async function migrateImageAssetSetToCold(
  db: DatabaseSync,
  userId: string,
  setId: string,
  options?: { now?: Date; force?: boolean },
): Promise<{ setId: string; migratedMembers: number }> {
  ensureImageAssetSmartMemorySchema(db);
  const set = db
    .prepare(
      `SELECT id, storage_tier, access_count, last_accessed_at, reuse_score, created_at
         FROM image_asset_sets WHERE id = ? AND user_id = ?`,
    )
    .get(setId, userId) as
    | {
        id: string;
        storage_tier: string;
        access_count: number | bigint;
        last_accessed_at: string | null;
        reuse_score: number | bigint;
        created_at: string;
      }
    | undefined;
  if (!set) {
    throw new ImageAssetSmartMemoryError("not_found", "Asset set not found.");
  }
  if (set.storage_tier === "cold" && !options?.force) {
    return { setId, migratedMembers: 0 };
  }
  const now = options?.now ?? new Date();
  const reuseScore = Number(set.reuse_score);
  if (!options?.force) {
    if (reuseScore >= IMAGE_ASSET_REUSE_PROTECT_SCORE) {
      throw new ImageAssetSmartMemoryError(
        "in_use",
        "Frequently reused assets stay hot.",
      );
    }
    const createdMs = Date.parse(set.created_at);
    if (
      !Number.isFinite(createdMs) ||
      now.getTime() - createdMs < IMAGE_ASSET_COLD_MIN_AGE_MS
    ) {
      throw new ImageAssetSmartMemoryError(
        "invalid",
        "Asset is too new to move to cold storage.",
      );
    }
    const lastMs = set.last_accessed_at
      ? Date.parse(set.last_accessed_at)
      : createdMs;
    if (
      Number.isFinite(lastMs) &&
      now.getTime() - lastMs < IMAGE_ASSET_COLD_MIN_IDLE_MS
    ) {
      throw new ImageAssetSmartMemoryError(
        "invalid",
        "Recently accessed assets stay hot.",
      );
    }
  }
  const members = db
    .prepare(
      `SELECT images.id, images.local_rel_path
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? AND images.user_id = ?`,
    )
    .all(setId, userId) as Array<{ id: string; local_rel_path: string | null }>;
  let migrated = 0;
  for (const member of members) {
    const rel = member.local_rel_path?.trim();
    if (!rel || isColdGeneratedImageRelativePath(rel)) continue;
    if (!rel.endsWith(".png")) continue;
    const bytes = readGeneratedImageBytes(rel);
    const coldRel = buildGeneratedImageColdRelativePath(userId, member.id);
    const coldBytes = await encodeLosslessColdWebp(bytes);
    writeGeneratedImageBytes(coldRel, coldBytes);
    db.prepare(
      "UPDATE images SET local_rel_path = ?, url = ? WHERE id = ? AND user_id = ?",
    ).run(
      coldRel,
      `/api/images/${encodeURIComponent(member.id)}/file`,
      member.id,
      userId,
    );
    try {
      const abs = resolveAbsoluteUnderDataRoot(rel);
      if (existsSync(abs)) unlinkSync(abs);
    } catch {
      // leave orphan PNG if unlink fails; cold path is authoritative
    }
    migrated += 1;
  }
  db.prepare(
    `UPDATE image_asset_sets
        SET storage_tier = 'cold', updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(now.toISOString(), setId, userId);
  return { setId, migratedMembers: migrated };
}

export async function warmImageAssetSet(
  db: DatabaseSync,
  userId: string,
  setId: string,
): Promise<{ setId: string; warmedMembers: number }> {
  ensureImageAssetSmartMemorySchema(db);
  const set = db
    .prepare("SELECT id, storage_tier FROM image_asset_sets WHERE id = ? AND user_id = ?")
    .get(setId, userId) as { id: string; storage_tier: string } | undefined;
  if (!set) {
    throw new ImageAssetSmartMemoryError("not_found", "Asset set not found.");
  }
  const members = db
    .prepare(
      `SELECT images.id, images.local_rel_path
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? AND images.user_id = ?`,
    )
    .all(setId, userId) as Array<{ id: string; local_rel_path: string | null }>;
  let warmed = 0;
  for (const member of members) {
    const rel = member.local_rel_path?.trim();
    if (!rel || !isColdGeneratedImageRelativePath(rel)) continue;
    const coldBytes = readGeneratedImageBytes(rel);
    const pngBytes = await sharp(coldBytes, { failOn: "error" }).png().toBuffer();
    const hotRel = buildGeneratedImageRelativePath(userId, member.id);
    replaceGeneratedImageBytesAtomically(hotRel, pngBytes);
    await tryGenerateThumbAfterPngWrite(hotRel);
    db.prepare(
      "UPDATE images SET local_rel_path = ?, url = ? WHERE id = ? AND user_id = ?",
    ).run(
      hotRel,
      `/api/images/${encodeURIComponent(member.id)}/file`,
      member.id,
      userId,
    );
    try {
      const abs = resolveAbsoluteUnderDataRoot(rel);
      if (existsSync(abs)) unlinkSync(abs);
    } catch {
      // ignore
    }
    warmed += 1;
  }
  db.prepare(
    `UPDATE image_asset_sets
        SET storage_tier = 'hot', updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(new Date().toISOString(), setId, userId);
  return { setId, warmedMembers: warmed };
}

export async function ensureImageAssetSetHotForEdit(
  db: DatabaseSync,
  userId: string,
  setId: string,
): Promise<void> {
  const set = db
    .prepare("SELECT storage_tier FROM image_asset_sets WHERE id = ? AND user_id = ?")
    .get(setId, userId) as { storage_tier: string } | undefined;
  if (set?.storage_tier === "cold") {
    await warmImageAssetSet(db, userId, setId);
  }
}

export function previewSmartTidyCandidates(
  db: DatabaseSync,
  userId: string,
  options?: { now?: Date; limit?: number },
): ImageAssetSmartTidyPreview {
  ensureImageAssetSmartMemorySchema(db);
  const now = options?.now ?? new Date();
  const limit = Math.min(500, Math.max(1, options?.limit ?? 200));
  const rows = db
    .prepare(
      `SELECT id, title, created_at, last_accessed_at, reuse_score, access_count, storage_tier
         FROM image_asset_sets
        WHERE user_id = ?
        ORDER BY created_at ASC
        LIMIT ?`,
    )
    .all(userId, limit * 4) as Array<{
    id: string;
    title: string;
    created_at: string;
    last_accessed_at: string | null;
    reuse_score: number | bigint;
    access_count: number | bigint;
    storage_tier: string;
  }>;
  const candidates: Array<{ id: string; title: string; bytes: number }> = [];
  let protectedHighReuseCount = 0;
  for (const row of rows) {
    const reuseScore = Number(row.reuse_score);
    if (reuseScore >= IMAGE_ASSET_REUSE_PROTECT_SCORE) {
      protectedHighReuseCount += 1;
      continue;
    }
    const createdMs = Date.parse(row.created_at);
    if (
      !Number.isFinite(createdMs) ||
      now.getTime() - createdMs < IMAGE_ASSET_SMART_TIDY_MIN_AGE_MS
    ) {
      continue;
    }
    const lastMs = row.last_accessed_at
      ? Date.parse(row.last_accessed_at)
      : createdMs;
    if (
      Number.isFinite(lastMs) &&
      now.getTime() - lastMs < IMAGE_ASSET_SMART_TIDY_MIN_AGE_MS
    ) {
      continue;
    }
    if (Number(row.access_count) > 1 && reuseScore >= 2) continue;
    const memberPaths = db
      .prepare(
        `SELECT images.local_rel_path
           FROM image_asset_set_items items
           JOIN images ON images.id = items.image_id
          WHERE items.set_id = ?`,
      )
      .all(row.id) as Array<{ local_rel_path: string | null }>;
    const bytes = memberPaths.reduce(
      (total, member) =>
        total +
        (member.local_rel_path
          ? generatedImageStorageSizeBytes(member.local_rel_path)
          : 0),
      0,
    );
    candidates.push({ id: row.id, title: row.title, bytes });
    if (candidates.length >= limit) break;
  }
  return {
    candidateCount: candidates.length,
    reclaimableBytes: candidates.reduce((total, item) => total + item.bytes, 0),
    protectedHighReuseCount,
    sampleTitles: candidates.slice(0, 5).map((item) => item.title),
    assetSetIds: candidates.map((item) => item.id),
  };
}

export function applySmartTidyWithDeleter(
  db: DatabaseSync,
  userId: string,
  assetSetIds: readonly string[],
  deleteUnused: (
    db: DatabaseSync,
    userId: string,
    assetSetId: string,
  ) => {
    assetSetId: string;
    recoveryId: string;
    recoveryBytes: number;
  },
): ImageAssetSmartTidyResult {
  const ids = [...new Set(assetSetIds.map((id) => id.trim()).filter(Boolean))];
  const deleted: string[] = [];
  let recoveryBytes = 0;
  let recoveryId: string | null = null;
  for (const id of ids) {
    try {
      const result = deleteUnused(db, userId, id);
      deleted.push(result.assetSetId);
      recoveryBytes += result.recoveryBytes;
      recoveryId = result.recoveryId;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "in_use" || code === "unsafe" || code === "not_found") {
        continue;
      }
      // Soft-skip unexpected failures for individual sets.
    }
  }
  return {
    deletedCount: deleted.length,
    recoveryId,
    recoveryBytes,
    assetSetIds: deleted,
  };
}

export async function compressImageAssetSet(
  db: DatabaseSync,
  userId: string,
  setId: string,
): Promise<{
  setId: string;
  changedMembers: number;
  longestEdgeBefore: number;
  longestEdgeAfter: number;
}> {
  await ensureImageAssetSetHotForEdit(db, userId, setId);
  const members = db
    .prepare(
      `SELECT images.id, images.local_rel_path, items.role
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? AND images.user_id = ?
          AND items.role IN ('primary', 'light', 'dark')`,
    )
    .all(setId, userId) as Array<{
    id: string;
    local_rel_path: string | null;
    role: string;
  }>;
  if (members.length === 0) {
    throw new ImageAssetSmartMemoryError("not_found", "Asset set not found.");
  }
  let changed = 0;
  let longestBefore = 0;
  let longestAfter = 0;
  for (const member of members) {
    const rel = member.local_rel_path?.trim();
    if (!rel || !rel.endsWith(".png")) continue;
    const before = readGeneratedImageBytes(rel);
    const meta = await sharp(before, { failOn: "error" }).metadata();
    const edge = Math.max(meta.width ?? 0, meta.height ?? 0);
    longestBefore = Math.max(longestBefore, edge);
    if (edge < IMAGE_ASSET_COMPRESS_MIN_EDGE_PX) continue;
    const targetEdge = Math.max(
      512,
      Math.round(edge * IMAGE_ASSET_COMPRESS_SCALE),
    );
    const after = await sharp(before, { failOn: "error" })
      .rotate()
      .resize(targetEdge, targetEdge, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const afterMeta = await sharp(after).metadata();
    longestAfter = Math.max(
      longestAfter,
      Math.max(afterMeta.width ?? 0, afterMeta.height ?? 0),
    );
    const undoRel = buildGeneratedImageCompressUndoRelativePath(rel);
    writeGeneratedImageBytes(undoRel, before);
    replaceGeneratedImageBytesAtomically(rel, after);
    await tryGenerateThumbAfterPngWrite(rel);
    changed += 1;
  }
  if (changed === 0) {
    throw new ImageAssetSmartMemoryError(
      "invalid",
      `Compress needs a longest edge of at least ${IMAGE_ASSET_COMPRESS_MIN_EDGE_PX}px.`,
    );
  }
  db.prepare(
    `UPDATE image_asset_sets
        SET compress_undo_available = 1, storage_tier = 'hot', updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(new Date().toISOString(), setId, userId);
  return {
    setId,
    changedMembers: changed,
    longestEdgeBefore: longestBefore,
    longestEdgeAfter: longestAfter || Math.round(longestBefore * IMAGE_ASSET_COMPRESS_SCALE),
  };
}

export async function undoCompressImageAssetSet(
  db: DatabaseSync,
  userId: string,
  setId: string,
): Promise<{ setId: string; restoredMembers: number }> {
  const set = db
    .prepare(
      `SELECT id, compress_undo_available FROM image_asset_sets WHERE id = ? AND user_id = ?`,
    )
    .get(setId, userId) as
    | { id: string; compress_undo_available: number | bigint }
    | undefined;
  if (!set) {
    throw new ImageAssetSmartMemoryError("not_found", "Asset set not found.");
  }
  if (!Number(set.compress_undo_available)) {
    throw new ImageAssetSmartMemoryError(
      "invalid",
      "No compress Undo is available for this asset.",
    );
  }
  const members = db
    .prepare(
      `SELECT images.id, images.local_rel_path
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? AND images.user_id = ?`,
    )
    .all(setId, userId) as Array<{ id: string; local_rel_path: string | null }>;
  let restored = 0;
  for (const member of members) {
    const rel = member.local_rel_path?.trim();
    if (!rel) continue;
    const undoRel = buildGeneratedImageCompressUndoRelativePath(rel);
    const undoAbs = resolveAbsoluteUnderDataRoot(undoRel);
    if (!existsSync(undoAbs)) continue;
    const bytes = readGeneratedImageBytes(undoRel);
    const hotRel = rel.endsWith(".png")
      ? rel
      : buildGeneratedImageRelativePath(userId, member.id);
    replaceGeneratedImageBytesAtomically(hotRel, bytes);
    await tryGenerateThumbAfterPngWrite(hotRel);
    if (hotRel !== rel) {
      db.prepare(
        "UPDATE images SET local_rel_path = ? WHERE id = ? AND user_id = ?",
      ).run(hotRel, member.id, userId);
    }
    try {
      unlinkSync(undoAbs);
    } catch {
      // ignore
    }
    restored += 1;
  }
  db.prepare(
    `UPDATE image_asset_sets
        SET compress_undo_available = 0, storage_tier = 'hot', updated_at = ?
      WHERE id = ? AND user_id = ?`,
  ).run(new Date().toISOString(), setId, userId);
  return { setId, restoredMembers: restored };
}

/**
 * Downscale raster bytes for temporary model / prompt attachment only.
 * Does not mutate library originals. Returns PNG so image-edit providers stay happy.
 */
export async function encodePromptAttachmentRaster(
  input: Buffer,
  maxEdgePx: number = IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX,
): Promise<{ bytes: Buffer; contentType: "image/png" }> {
  const bytes = await sharp(input, { failOn: "error" })
    .rotate()
    .resize(maxEdgePx, maxEdgePx, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return { bytes, contentType: "image/png" };
}

export async function readGeneratedImageBytesForPromptAttachment(
  localRelPath: string,
  maxEdgePx: number = IMAGE_ASSET_PROMPT_ATTACH_MAX_EDGE_PX,
): Promise<Buffer> {
  const raw = readGeneratedImageBytes(localRelPath);
  return (await encodePromptAttachmentRaster(raw, maxEdgePx)).bytes;
}

export function storageTierLabel(value: unknown): ImageAssetStorageTier {
  return value === "cold" ? "cold" : "hot";
}

export { contentTypeForGeneratedImageRelativePath };
