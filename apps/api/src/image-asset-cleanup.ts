import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const IMAGE_ASSET_CLEANUP_PREVIEW_VERSION = 1;
export const IMAGE_ASSET_CLEANUP_PREVIEW_LIMIT = 200;

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
}

export interface ImageAssetCleanupPreview {
  version: typeof IMAGE_ASSET_CLEANUP_PREVIEW_VERSION;
  readOnly: true;
  scanned: number;
  generatedLocalAssets: number;
  candidateCount: number;
  protectedByReferenceCount: number;
  protectedPlayerAssetCount: number;
  protectedUnverifiableCount: number;
  remoteOnlyCount: number;
  truncated: boolean;
  snapshot: string;
  candidates: ImageAssetCleanupCandidate[];
  checks: string[];
}

interface ImageAssetRow {
  id: string;
  bot_id: string | null;
  related_bot_ids: string | null;
  origin: string | null;
  prompt: string;
  provider: string | null;
  model: string | null;
  local_rel_path: string | null;
  purpose: string | null;
  created_at: string;
}

const IMAGE_FILE_URL_PATTERN = /\/api\/images\/([^/\s?#]+)\/(?:file|thumb)\b/giu;

function readRows<T>(db: DatabaseSync, sql: string, userId: string): T[] {
  try {
    return db.prepare(sql).all(userId) as T[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/no such (?:table|column)/iu.test(detail)) return [];
    throw error;
  }
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
  if (origin === "zen_wallpaper" || purpose === "wallpaper") return "Zen";
  if (origin === "bot_profile_picture" || purpose === "bot_profile_picture") {
    return "bot profile";
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
  return (
    provider === "upload" ||
    origin.includes("upload") ||
    origin.includes("import")
  );
}

function unverifiableClientAsset(row: ImageAssetRow): boolean {
  return row.purpose?.trim().toLowerCase() === "group-room-wallpaper";
}

export function previewUnreferencedImageAssets(
  db: DatabaseSync,
  userId: string,
): ImageAssetCleanupPreview {
  const rows = readRows<ImageAssetRow>(
    db,
    `SELECT id, bot_id, related_bot_ids, origin, prompt, provider, model,
            local_rel_path, purpose, created_at
       FROM images
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC`,
    userId,
  );
  const knownImageIds = new Set(rows.map((row) => row.id));
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
  for (const row of readRows<{
    zen_wallpaper_image_id: string | null;
    zen_wallpaper_history: string | null;
  }>(
    db,
    `SELECT zen_wallpaper_image_id, zen_wallpaper_history
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
  }
  for (const row of readRows<{ tool_payload: string | null }>(
    db,
    "SELECT tool_payload FROM messages WHERE user_id = ? AND tool_payload IS NOT NULL",
    userId,
  )) {
    collectImageReferencesFromText(
      row.tool_payload,
      knownImageIds,
      references,
      "Conversation message",
    );
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
  let protectedPlayerAssetCount = 0;
  let protectedUnverifiableCount = 0;
  let remoteOnlyCount = 0;
  const allCandidates: ImageAssetCleanupCandidate[] = [];
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
    if (unverifiableClientAsset(row)) {
      protectedUnverifiableCount += 1;
      continue;
    }
    if ((references.get(row.id)?.size ?? 0) > 0) {
      protectedByReferenceCount += 1;
      continue;
    }
    const modeLabel = modeLabelForImage(row);
    allCandidates.push({
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
      reason:
        modeLabel === "Image Library"
          ? "No current or historical applet reference was found. This generated file is saved only in the Image Library."
          : `No current or historical ${modeLabel} reference was found. This generated file is saved only in the Image Library.`,
    });
  }

  const snapshot = createHash("sha256")
    .update(
      allCandidates
        .map((candidate) => `${candidate.id}:${candidate.createdAt}`)
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 20);
  return {
    version: IMAGE_ASSET_CLEANUP_PREVIEW_VERSION,
    readOnly: true,
    scanned: rows.length,
    generatedLocalAssets,
    candidateCount: allCandidates.length,
    protectedByReferenceCount,
    protectedPlayerAssetCount,
    protectedUnverifiableCount,
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
      "Player uploads and imports",
      "Group-room assets with browser-local references",
    ],
  };
}
