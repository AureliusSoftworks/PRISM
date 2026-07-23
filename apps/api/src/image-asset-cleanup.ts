import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  generatedImageStorageSizeBytes,
  listGeneratedImageRecoveryBatchesForUser,
  markGeneratedImageQuarantineCommitted,
  markGeneratedImageRecoveryBatchRestoring,
  purgeGeneratedImageRecoveryBatch,
  purgeGeneratedImageQuarantine,
  quarantineGeneratedImageFiles,
  requarantineGeneratedImageRecoveryBatch,
  restoreQuarantinedGeneratedImageFiles,
  type GeneratedImageRecoveryBatch,
  type GeneratedImageQuarantineResult,
} from "./image-storage.ts";

export const IMAGE_ASSET_CLEANUP_PREVIEW_VERSION = 3;
export const IMAGE_ASSET_CLEANUP_PREVIEW_LIMIT = 200;
export const IMAGE_ASSET_CLEANUP_SELECTION_LIMIT = 200;
export const IMAGE_ASSET_CLEANUP_MINIMUM_AGE_MS = 15 * 60 * 1_000;

export interface ImageAssetCleanupCandidate {
  id: string;
  createdAt: string;
  origin: string;
  purpose: string;
  provider: string;
  model: string | null;
  botIds: string[];
  promptExcerpt: string;
  modeLabel: string;
  reason: string;
  storageBytes: number;
}

export interface ImageAssetCleanupPreview {
  version: typeof IMAGE_ASSET_CLEANUP_PREVIEW_VERSION;
  readOnly: true;
  cleanupAvailable: true;
  scanned: number;
  generatedLocalAssets: number;
  candidateCount: number;
  candidateStorageBytes: number;
  protectedByReferenceCount: number;
  protectedIntentionalAssetCount: number;
  protectedPlayerAssetCount: number;
  protectedUnverifiableCount: number;
  protectedSharedFileCount: number;
  protectedRecentCount: number;
  remoteOnlyCount: number;
  truncated: boolean;
  snapshot: string;
  candidates: ImageAssetCleanupCandidate[];
  checks: string[];
}

export interface ImageAssetCleanupRequest {
  snapshot: string;
  imageIds: string[];
  permanent: boolean;
}

export interface ImageAssetCleanupResult {
  deletedCount: number;
  quarantinedAssetCount: number;
  quarantinedFileCount: number;
  missingAssetFileCount: number;
  selectedStorageBytes: number;
  reclaimedBytes: number;
  permanentDeleteCompleted: boolean;
  recoveryRetained: boolean;
  recoveryId: string | null;
  recoveryRelativePath: string | null;
  imageIds: string[];
  preview: ImageAssetCleanupPreview;
}

export type ImageAssetCleanupErrorCode =
  | "invalid_request"
  | "stale_preview"
  | "unsafe_selection";

export class ImageAssetCleanupError extends Error {
  readonly code: ImageAssetCleanupErrorCode;

  constructor(
    code: ImageAssetCleanupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageAssetCleanupError";
    this.code = code;
  }
}

interface ImageAssetRow {
  id: string;
  conversation_id: string | null;
  bot_id: string | null;
  related_bot_ids: string | null;
  origin: string | null;
  prompt: string;
  revised_prompt: string | null;
  url: string;
  size: string;
  quality: string;
  provider: string | null;
  model: string | null;
  local_rel_path: string | null;
  purpose: string | null;
  created_at: string;
}

export interface ImageAssetCleanupRecoverySummary {
  recoveryId: string;
  quarantinedAt: string;
  imageCount: number;
  fileCount: number;
  sizeBytes: number;
  recoveryRelativePath: string;
}

export interface ImageAssetCleanupRecoveryRestoreResult {
  recoveryId: string;
  restoredCount: number;
}

interface ImageAssetCleanupGraph {
  preview: ImageAssetCleanupPreview;
  candidateRows: Map<string, ImageAssetRow & { local_rel_path: string }>;
}

export interface ImageAssetCleanupFileOperations {
  recoveryId?: () => string;
  quarantine?: (
    userId: string,
    localRelPaths: readonly string[],
    recoveryId: string,
    recoveryManifest?: string,
  ) => GeneratedImageQuarantineResult;
  restore?: (quarantine: GeneratedImageQuarantineResult) => void;
  purge?: (
    userId: string,
    quarantine: GeneratedImageQuarantineResult,
  ) => void;
}

const IMAGE_FILE_URL_PATTERN = /\/api\/images\/([^/\s?#]+)\/(?:file|thumb)\b/giu;
const SYSTEM_MANAGED_IMAGE_ORIGINS = new Set([
  "botcast",
  "coffee_bar",
  "hub_atmosphere",
  "slate_cover",
  "zen_wallpaper",
  "bot_profile_picture",
]);

function readRows<T>(db: DatabaseSync, sql: string, userId: string): T[] {
  return db.prepare(sql).all(userId) as T[];
}

function readAllRows<T>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
      : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}

function decodedImageId(value: string): string | null {
  try {
    return decodeURIComponent(value).trim() || null;
  } catch {
    return value.trim() || null;
  }
}

function collectImageReferencesFromValue(
  value: unknown,
  knownImageIds: ReadonlySet<string>,
  references: Map<string, Set<string>>,
  label: string,
  keyHint = "",
): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/image/iu.test(keyHint) && knownImageIds.has(trimmed)) {
      references.get(trimmed)?.add(label);
    }
    for (const match of trimmed.matchAll(IMAGE_FILE_URL_PATTERN)) {
      const imageId = match[1] ? decodedImageId(match[1]) : null;
      if (imageId && knownImageIds.has(imageId)) {
        references.get(imageId)?.add(label);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageReferencesFromValue(
        item,
        knownImageIds,
        references,
        label,
        keyHint,
      );
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    collectImageReferencesFromValue(
      item,
      knownImageIds,
      references,
      label,
      key,
    );
  }
}

function collectImageReferencesFromText(
  raw: string | null | undefined,
  knownImageIds: ReadonlySet<string>,
  references: Map<string, Set<string>>,
  label: string,
): void {
  if (!raw) return;
  try {
    collectImageReferencesFromValue(
      JSON.parse(raw) as unknown,
      knownImageIds,
      references,
      label,
    );
  } catch {
    collectImageReferencesFromValue(
      raw,
      knownImageIds,
      references,
      label,
    );
  }
}

function modeLabelForImage(row: ImageAssetRow): string {
  const origin = row.origin?.trim().toLowerCase() ?? "";
  const purpose = row.purpose?.trim().toLowerCase() ?? "";
  if (origin === "botcast") return "Signal";
  if (origin === "hub_atmosphere" || purpose === "hub_atmosphere") {
    return "Home";
  }
  if (origin === "zen_wallpaper" || purpose === "wallpaper") return "Zen";
  if (origin === "bot_profile_picture" || purpose === "bot_profile_picture") {
    return "Bot profile";
  }
  if (origin.startsWith("bot_group_room") || purpose === "group-room-wallpaper") {
    return "Group room";
  }
  if (origin.startsWith("slate")) return "Slate";
  if (origin.includes("chat")) return "Chat";
  return "Image Library";
}

function playerAuthoredAsset(row: ImageAssetRow): boolean {
  const provider = row.provider?.trim().toLowerCase() ?? "";
  const origin = row.origin?.trim().toLowerCase() ?? "";
  const purpose = row.purpose?.trim().toLowerCase() ?? "";
  return (
    provider === "upload" ||
    origin.includes("upload") ||
    origin.includes("import") ||
    purpose.includes("upload") ||
    purpose.includes("import")
  );
}

function unverifiableClientAsset(row: ImageAssetRow): boolean {
  return row.purpose?.trim().toLowerCase() === "group-room-wallpaper";
}

function systemManagedAppletAsset(row: ImageAssetRow): boolean {
  return SYSTEM_MANAGED_IMAGE_ORIGINS.has(
    row.origin?.trim().toLowerCase() ?? "",
  );
}

function verifiedGeneratedLocalPath(
  row: ImageAssetRow,
  userId: string,
): string | null {
  const localRelPath = row.local_rel_path?.trim() ?? "";
  const expected = `generated-images/${userId}/${row.id}.png`;
  return localRelPath === expected ? localRelPath : null;
}

function buildImageAssetCleanupGraph(
  db: DatabaseSync,
  userId: string,
): ImageAssetCleanupGraph {
  const rows = readRows<ImageAssetRow>(
    db,
    `SELECT id, conversation_id, bot_id, related_bot_ids, origin, prompt, revised_prompt, url,
            size, quality, provider, model,
            local_rel_path, purpose, created_at
       FROM images
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC`,
    userId,
  );
  const knownImageIds = new Set(rows.map((row) => row.id));
  const localPathReferenceCounts = new Map<string, number>();
  for (const row of readAllRows<{ local_rel_path: string | null }>(
    db,
    "SELECT local_rel_path FROM images WHERE local_rel_path IS NOT NULL",
  )) {
    const localRelPath = row.local_rel_path?.trim();
    if (!localRelPath) continue;
    localPathReferenceCounts.set(
      localRelPath,
      (localPathReferenceCounts.get(localRelPath) ?? 0) + 1,
    );
  }
  const references = new Map(
    rows.map((row) => [row.id, new Set<string>()] as const),
  );
  const addExactReference = (
    imageId: string | null | undefined,
    label: string,
  ): void => {
    const normalized = imageId?.trim();
    if (normalized && knownImageIds.has(normalized)) {
      references.get(normalized)?.add(label);
    }
  };

  for (const row of readRows<{ profile_picture_image_id: string | null }>(
    db,
    "SELECT profile_picture_image_id FROM bots WHERE user_id = ?",
    userId,
  )) {
    addExactReference(row.profile_picture_image_id, "Bot profile picture");
  }
  for (const row of readRows<{ hub_atmosphere_image_id: string | null }>(
    db,
    "SELECT hub_atmosphere_image_id FROM users WHERE id = ?",
    userId,
  )) {
    addExactReference(row.hub_atmosphere_image_id, "Current Home atmosphere");
  }
  for (const row of readRows<{
    zen_wallpaper_image_id: string | null;
    zen_wallpaper_history: string | null;
    coffee_settings: string | null;
  }>(
    db,
    `SELECT zen_wallpaper_image_id, zen_wallpaper_history, coffee_settings
       FROM conversations WHERE user_id = ?`,
    userId,
  )) {
    addExactReference(row.zen_wallpaper_image_id, "Current Zen wallpaper");
    collectImageReferencesFromText(
      row.zen_wallpaper_history,
      knownImageIds,
      references,
      "Zen wallpaper history",
    );
    collectImageReferencesFromText(
      row.coffee_settings,
      knownImageIds,
      references,
      "Coffee drink surface",
    );
  }
  for (const row of readRows<{
    content: string | null;
    tool_payload: string | null;
  }>(
    db,
    `SELECT content, tool_payload FROM messages
      WHERE user_id = ? AND (content IS NOT NULL OR tool_payload IS NOT NULL)`,
    userId,
  )) {
    for (const value of [row.content, row.tool_payload]) {
      collectImageReferencesFromText(
        value,
        knownImageIds,
        references,
        "Conversation message",
      );
    }
  }
  for (const row of readRows<{ atmosphere_json: string }>(
    db,
    "SELECT atmosphere_json FROM botcast_shows WHERE user_id = ?",
    userId,
  )) {
    collectImageReferencesFromText(
      row.atmosphere_json,
      knownImageIds,
      references,
      "Signal show artwork",
    );
  }
  for (const row of readRows<{ cover_json: string }>(
    db,
    "SELECT cover_json FROM slate_projects WHERE user_id = ?",
    userId,
  )) {
    collectImageReferencesFromText(
      row.cover_json,
      knownImageIds,
      references,
      "Slate cover",
    );
  }
  for (const row of readRows<{ markdown: string }>(
    db,
    "SELECT markdown FROM conversation_exports WHERE user_id = ?",
    userId,
  )) {
    collectImageReferencesFromText(
      row.markdown,
      knownImageIds,
      references,
      "Saved conversation export",
    );
  }
  for (const row of readRows<{
    episode_json: string | null;
    progress_json: string | null;
    transcript_json: string | null;
  }>(
    db,
    "SELECT episode_json, progress_json, transcript_json FROM story_sessions WHERE user_id = ?",
    userId,
  )) {
    for (const value of [row.episode_json, row.progress_json, row.transcript_json]) {
      collectImageReferencesFromText(
        value,
        knownImageIds,
        references,
        "Story session",
      );
    }
  }

  let generatedLocalAssets = 0;
  let protectedByReferenceCount = 0;
  let protectedIntentionalAssetCount = 0;
  let protectedPlayerAssetCount = 0;
  let protectedUnverifiableCount = 0;
  let protectedSharedFileCount = 0;
  let protectedRecentCount = 0;
  let remoteOnlyCount = 0;
  const allCandidates: ImageAssetCleanupCandidate[] = [];
  const candidateRows = new Map<
    string,
    ImageAssetRow & { local_rel_path: string }
  >();
  for (const row of rows) {
    if (!row.local_rel_path?.trim()) {
      remoteOnlyCount += 1;
      continue;
    }
    if (playerAuthoredAsset(row)) {
      protectedPlayerAssetCount += 1;
      continue;
    }
    generatedLocalAssets += 1;
    const verifiedLocalPath = verifiedGeneratedLocalPath(row, userId);
    if (unverifiableClientAsset(row) || !verifiedLocalPath) {
      protectedUnverifiableCount += 1;
      continue;
    }
    if (!systemManagedAppletAsset(row)) {
      protectedIntentionalAssetCount += 1;
      continue;
    }
    if ((localPathReferenceCounts.get(verifiedLocalPath) ?? 0) !== 1) {
      protectedSharedFileCount += 1;
      continue;
    }
    const createdAtMs = Date.parse(row.created_at);
    if (
      !Number.isFinite(createdAtMs) ||
      Date.now() - createdAtMs < IMAGE_ASSET_CLEANUP_MINIMUM_AGE_MS
    ) {
      protectedRecentCount += 1;
      continue;
    }
    if ((references.get(row.id)?.size ?? 0) > 0) {
      protectedByReferenceCount += 1;
      continue;
    }
    const modeLabel = modeLabelForImage(row);
    const storageBytes = generatedImageStorageSizeBytes(verifiedLocalPath);
    const candidate: ImageAssetCleanupCandidate = {
      id: row.id,
      createdAt: row.created_at,
      origin: row.origin?.trim() || "unknown",
      purpose: row.purpose?.trim() || "gallery",
      provider: row.provider?.trim() || "unknown",
      model: row.model?.trim() || null,
      botIds: uniqueStrings([
        row.bot_id,
        ...parseStringArray(row.related_bot_ids),
      ]),
      promptExcerpt: row.prompt.trim().replace(/\s+/gu, " ").slice(0, 180),
      modeLabel,
      reason: `No current or historical ${modeLabel} reference was found. This PRISM-managed asset has been replaced or its owning experience was removed.`,
      storageBytes,
    };
    allCandidates.push(candidate);
    candidateRows.set(row.id, {
      ...row,
      local_rel_path: verifiedLocalPath,
    });
  }

  const snapshot = createHash("sha256")
    .update(
      allCandidates
        .map((candidate) => {
          const row = candidateRows.get(candidate.id);
          return JSON.stringify([
            row?.id ?? candidate.id,
            row?.conversation_id ?? null,
            row?.bot_id ?? null,
            row?.related_bot_ids ?? null,
            row?.origin ?? null,
            row?.prompt ?? "",
            row?.revised_prompt ?? null,
            row?.url ?? "",
            row?.size ?? "",
            row?.quality ?? "",
            row?.provider ?? null,
            row?.model ?? null,
            row?.local_rel_path ?? "",
            row?.purpose ?? null,
            row?.created_at ?? candidate.createdAt,
            candidate.storageBytes,
          ]);
        })
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 20);
  const preview: ImageAssetCleanupPreview = {
    version: IMAGE_ASSET_CLEANUP_PREVIEW_VERSION,
    readOnly: true,
    cleanupAvailable: true,
    scanned: rows.length,
    generatedLocalAssets,
    candidateCount: allCandidates.length,
    candidateStorageBytes: allCandidates.reduce(
      (total, candidate) => total + candidate.storageBytes,
      0,
    ),
    protectedByReferenceCount,
    protectedIntentionalAssetCount,
    protectedPlayerAssetCount,
    protectedUnverifiableCount,
    protectedSharedFileCount,
    protectedRecentCount,
    remoteOnlyCount,
    truncated: allCandidates.length > IMAGE_ASSET_CLEANUP_PREVIEW_LIMIT,
    snapshot,
    candidates: allCandidates.slice(0, IMAGE_ASSET_CLEANUP_PREVIEW_LIMIT),
    checks: [
      "Bot profile pictures",
      "Current and historical Zen wallpapers",
      "Conversation image messages and saved exports",
      "Signal show artwork",
      "Slate covers",
      "Story sessions",
      "Intentional Image Library and chat generations",
      "Player uploads and imports",
      "Group-room assets with browser-local references",
      "Generated files shared by more than one database row or account",
      "Images generated within the last 15 minutes",
    ],
  };
  return { preview, candidateRows };
}

export function previewUnreferencedImageAssets(
  db: DatabaseSync,
  userId: string,
): ImageAssetCleanupPreview {
  return buildImageAssetCleanupGraph(db, userId).preview;
}

function recoveryRows(
  batch: GeneratedImageRecoveryBatch,
  userId: string,
): Array<ImageAssetRow & { local_rel_path: string }> | null {
  if (batch.journal.userId !== userId || batch.journal.images.length === 0) {
    return null;
  }
  const rows: Array<ImageAssetRow & { local_rel_path: string }> = [];
  for (const value of batch.journal.images) {
    const row = value as Partial<ImageAssetRow>;
    if (
      typeof row.id !== "string" ||
      typeof row.local_rel_path !== "string" ||
      row.local_rel_path !== `generated-images/${userId}/${row.id}.png` ||
      typeof row.prompt !== "string" ||
      typeof row.url !== "string" ||
      typeof row.size !== "string" ||
      typeof row.quality !== "string" ||
      typeof row.provider !== "string" ||
      typeof row.origin !== "string" ||
      typeof row.purpose !== "string" ||
      typeof row.created_at !== "string"
    ) {
      return null;
    }
    rows.push(row as ImageAssetRow & { local_rel_path: string });
  }
  return rows;
}

function existingRecoveryImageState(
  db: DatabaseSync,
  userId: string,
  rows: readonly ImageAssetRow[],
): { matchingIds: Set<string>; collision: boolean } {
  const statement = db.prepare(
    `SELECT id, conversation_id, bot_id, related_bot_ids, origin, prompt,
            revised_prompt, url, size, quality, provider, model,
            local_rel_path, purpose, created_at
       FROM images WHERE id = ? AND user_id = ?`,
  );
  const matchingIds = new Set<string>();
  let collision = false;
  for (const row of rows) {
    const existing = statement.get(row.id, userId) as ImageAssetRow | undefined;
    if (!existing) continue;
    const fields: Array<keyof ImageAssetRow> = [
      "id", "conversation_id", "bot_id", "related_bot_ids", "origin",
      "prompt", "revised_prompt", "url", "size", "quality", "provider",
      "model", "local_rel_path", "purpose", "created_at",
    ];
    if (fields.every((field) => existing[field] === row[field])) {
      matchingIds.add(row.id);
    } else {
      collision = true;
    }
  }
  return { matchingIds, collision };
}

/**
 * Repairs crash-interrupted cleanup/restore batches using SQLite row presence
 * as the authoritative commit record. Mixed or invalid batches stay untouched.
 */
export function reconcileAssetCleanupRecoveryForUser(
  db: DatabaseSync,
  userId: string,
): { restored: number; retained: number; unresolved: number } {
  let restored = 0;
  let retained = 0;
  let unresolved = 0;
  for (const batch of listGeneratedImageRecoveryBatchesForUser(userId)) {
    const rows = recoveryRows(batch, userId);
    if (!rows) {
      unresolved += 1;
      continue;
    }
    const existing = existingRecoveryImageState(db, userId, rows);
    if (existing.collision) {
      unresolved += 1;
      continue;
    }
    if (existing.matchingIds.size === rows.length) {
      try {
        restoreQuarantinedGeneratedImageFiles(batch.quarantine);
        restored += 1;
      } catch {
        unresolved += 1;
      }
      continue;
    }
    if (existing.matchingIds.size !== 0) {
      unresolved += 1;
      continue;
    }
    if (batch.journal.state === "restoring") {
      try {
        requarantineGeneratedImageRecoveryBatch(batch);
        markGeneratedImageQuarantineCommitted(batch.quarantine);
      } catch {
        unresolved += 1;
        continue;
      }
    }
    retained += 1;
  }
  return { restored, retained, unresolved };
}

export function listImageAssetCleanupRecoveries(
  db: DatabaseSync,
  userId: string,
): ImageAssetCleanupRecoverySummary[] {
  return listGeneratedImageRecoveryBatchesForUser(userId).flatMap((batch) => {
    const rows = recoveryRows(batch, userId);
    if (!rows || batch.journal.state === "restoring") return [];
    const existing = existingRecoveryImageState(db, userId, rows);
    if (existing.collision || existing.matchingIds.size !== 0) return [];
    return [{
      recoveryId: batch.journal.recoveryId,
      quarantinedAt: batch.journal.quarantinedAt,
      imageCount: rows.length,
      fileCount: batch.fileCount,
      sizeBytes: batch.sizeBytes,
      recoveryRelativePath: batch.quarantine.recoveryRelativePath,
    }];
  });
}

function recoveryBatchById(
  userId: string,
  recoveryId: string,
): GeneratedImageRecoveryBatch | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(recoveryId)) return null;
  return (
    listGeneratedImageRecoveryBatchesForUser(userId).find(
      (batch) => batch.journal.recoveryId === recoveryId,
    ) ?? null
  );
}

export function restoreImageAssetCleanupRecovery(
  db: DatabaseSync,
  userId: string,
  recoveryId: string,
): ImageAssetCleanupRecoveryRestoreResult | null {
  const batch = recoveryBatchById(userId, recoveryId);
  if (!batch) return null;
  const rows = recoveryRows(batch, userId);
  const existing = rows
    ? existingRecoveryImageState(db, userId, rows)
    : null;
  if (!rows || !existing || existing.collision || existing.matchingIds.size !== 0) {
    throw new ImageAssetCleanupError(
      "unsafe_selection",
      "This recovery batch conflicts with images already in the library.",
    );
  }
  const pathCollision = db.prepare(
    "SELECT 1 AS present FROM images WHERE local_rel_path = ? LIMIT 1",
  );
  if (rows.some((row) => pathCollision.get(row.local_rel_path) !== undefined)) {
    throw new ImageAssetCleanupError(
      "unsafe_selection",
      "This recovery batch conflicts with an existing generated file record.",
    );
  }

  markGeneratedImageRecoveryBatchRestoring(batch);
  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;
    const insert = db.prepare(
      `INSERT INTO images
         (id, user_id, conversation_id, bot_id, related_bot_ids, origin, prompt,
          revised_prompt, url, size, quality, provider, model, local_rel_path,
          purpose, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        row.id,
        userId,
        row.conversation_id,
        row.bot_id,
        row.related_bot_ids ?? "[]",
        row.origin,
        row.prompt,
        row.revised_prompt,
        row.url,
        row.size,
        row.quality,
        row.provider,
        row.model,
        row.local_rel_path,
        row.purpose,
        row.created_at,
      );
    }
    restoreQuarantinedGeneratedImageFiles(batch.quarantine, {
      keepManifest: true,
    });
    db.exec("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // Preserve the original recovery failure.
      }
    }
    try {
      requarantineGeneratedImageRecoveryBatch(batch);
      markGeneratedImageQuarantineCommitted(batch.quarantine);
    } catch {
      // The restoring journal remains for startup reconciliation.
    }
    throw error;
  }
  try {
    purgeGeneratedImageRecoveryBatch(batch);
  } catch {
    // Rows and source files are already restored. Startup reconciliation will
    // safely remove a leftover journal; never re-quarantine after COMMIT.
  }
  return { recoveryId, restoredCount: rows.length };
}

export function permanentlyDeleteImageAssetCleanupRecovery(
  db: DatabaseSync,
  userId: string,
  recoveryId: string,
): boolean {
  const batch = recoveryBatchById(userId, recoveryId);
  if (!batch) return false;
  const rows = recoveryRows(batch, userId);
  const existing = rows
    ? existingRecoveryImageState(db, userId, rows)
    : null;
  if (!rows || !existing || existing.collision || existing.matchingIds.size !== 0) {
    throw new ImageAssetCleanupError(
      "unsafe_selection",
      "This batch is not safe to permanently delete.",
    );
  }
  purgeGeneratedImageRecoveryBatch(batch);
  return true;
}

function validateCleanupRequest(
  request: ImageAssetCleanupRequest,
): { snapshot: string; imageIds: string[]; permanent: true } {
  const snapshot = request.snapshot?.trim() ?? "";
  if (!/^[a-f0-9]{20}$/u.test(snapshot)) {
    throw new ImageAssetCleanupError(
      "invalid_request",
      "A valid cleanup preview snapshot is required.",
    );
  }
  if (!Array.isArray(request.imageIds)) {
    throw new ImageAssetCleanupError(
      "invalid_request",
      "Select one or more cleanup candidates.",
    );
  }
  if (request.permanent !== true) {
    throw new ImageAssetCleanupError(
      "invalid_request",
      "Permanent asset cleanup requires explicit confirmation.",
    );
  }
  const imageIds = request.imageIds.map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  if (
    imageIds.length === 0 ||
    imageIds.length > IMAGE_ASSET_CLEANUP_SELECTION_LIMIT ||
    imageIds.some((value) => !value || value.length > 200) ||
    new Set(imageIds).size !== imageIds.length
  ) {
    throw new ImageAssetCleanupError(
      "invalid_request",
      `Select between 1 and ${IMAGE_ASSET_CLEANUP_SELECTION_LIMIT} unique cleanup candidates.`,
    );
  }
  return { snapshot, imageIds, permanent: true };
}

/**
 * Revalidates a selected preview under an immediate SQLite transaction, moves
 * only verified generated files into a quarantine, and removes their owning
 * rows. Database failures restore the files; committed batches are permanently
 * purged, with failed purges retained for recovery.
 */
export function cleanupUnreferencedImageAssets(
  db: DatabaseSync,
  userId: string,
  request: ImageAssetCleanupRequest,
  fileOperations: ImageAssetCleanupFileOperations = {},
): ImageAssetCleanupResult {
  const validated = validateCleanupRequest(request);
  const makeRecoveryId =
    fileOperations.recoveryId ??
    (() => `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`);
  const quarantine =
    fileOperations.quarantine ?? quarantineGeneratedImageFiles;
  const restore =
    fileOperations.restore ?? restoreQuarantinedGeneratedImageFiles;
  const purge = fileOperations.purge ?? purgeGeneratedImageQuarantine;
  const recoveryId = makeRecoveryId();
  let quarantineResult: GeneratedImageQuarantineResult | null = null;
  let nextPreview: ImageAssetCleanupPreview | null = null;
  let transactionStarted = false;
  let selectedStorageBytes = 0;

  try {
    db.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;
    const graph = buildImageAssetCleanupGraph(db, userId);
    if (graph.preview.snapshot !== validated.snapshot) {
      throw new ImageAssetCleanupError(
        "stale_preview",
        "The asset library changed after this preview. Run the audit again before cleaning up.",
      );
    }
    const selectedRows = validated.imageIds.map((imageId) => {
      if (!graph.preview.candidates.some((candidate) => candidate.id === imageId)) {
        throw new ImageAssetCleanupError(
          "unsafe_selection",
          "Select assets from the visible cleanup preview only. Run another cleanup after this batch if more candidates remain.",
        );
      }
      const row = graph.candidateRows.get(imageId);
      if (!row) {
        throw new ImageAssetCleanupError(
          "unsafe_selection",
          "One or more selected assets are now referenced or otherwise protected. Run the audit again.",
        );
      }
      return row;
    });
    selectedStorageBytes = validated.imageIds.reduce(
      (total, imageId) =>
        total +
        (graph.preview.candidates.find((candidate) => candidate.id === imageId)
          ?.storageBytes ?? 0),
      0,
    );

    quarantineResult = quarantine(
      userId,
      selectedRows.map((row) => row.local_rel_path),
      recoveryId,
      JSON.stringify(
        {
          version: 1,
          recoveryId,
          quarantinedAt: new Date().toISOString(),
          userId,
          images: selectedRows,
        },
        null,
        2,
      ),
    );
    const deleteStatement = db.prepare(
      "DELETE FROM images WHERE id = ? AND user_id = ? AND local_rel_path = ?",
    );
    for (const row of selectedRows) {
      const result = deleteStatement.run(row.id, userId, row.local_rel_path);
      if (Number(result.changes) !== 1) {
        throw new ImageAssetCleanupError(
          "stale_preview",
          "An asset changed during cleanup. No database changes were kept.",
        );
      }
    }
    nextPreview = buildImageAssetCleanupGraph(db, userId).preview;
    db.exec("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // Preserve the original cleanup error; SQLite may already have rolled back.
      }
    }
    if (quarantineResult) restore(quarantineResult);
    throw error;
  }

  if (!quarantineResult || !nextPreview) {
    throw new Error("Asset cleanup finished without a recovery batch.");
  }
  try {
    markGeneratedImageQuarantineCommitted(quarantineResult);
  } catch {
    // DB truth remains authoritative; startup reconciliation can classify a
    // prepared journal whose rows are already absent as committed recovery.
  }
  let permanentDeleteCompleted = false;
  try {
    purge(userId, quarantineResult);
    permanentDeleteCompleted = true;
  } catch {
    // The committed recovery journal remains available for retry or restore.
  }
  return {
    deletedCount: validated.imageIds.length,
    quarantinedAssetCount:
      validated.imageIds.length -
      quarantineResult.missingPrimaryRelativePaths.length,
    quarantinedFileCount: quarantineResult.movedFiles.length,
    missingAssetFileCount:
      quarantineResult.missingPrimaryRelativePaths.length,
    selectedStorageBytes,
    reclaimedBytes: permanentDeleteCompleted ? selectedStorageBytes : 0,
    permanentDeleteCompleted,
    recoveryRetained: !permanentDeleteCompleted,
    recoveryId: permanentDeleteCompleted ? null : quarantineResult.recoveryId,
    recoveryRelativePath: permanentDeleteCompleted
      ? null
      : quarantineResult.recoveryRelativePath,
    imageIds: validated.imageIds,
    preview: nextPreview,
  };
}
