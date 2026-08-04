import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  IMAGE_ASSET_KINDS,
  IMAGE_ASSET_KIND_LABELS,
  imageAssetKindForImage,
  imageAssetMemberRoleForImage,
  isImageAssetKind,
  type ImageAssetCatalogPage,
  type ImageAssetKind,
  type ImageAssetMember,
  type ImageAssetMemberRole,
  type ImageAssetSet,
  type ImageAssetSetStatus,
  type ImageAssetSource,
  type ImageAssetStorageSummary,
  type ImageAssetUsage,
} from "@localai/shared";
import { imageAssetUsageLabels } from "./image-asset-cleanup.ts";
import {
  generatedImageStorageSizeBytes,
  listGeneratedImageRecoveryBatchesForUser,
  markGeneratedImageQuarantineCommitted,
  quarantineGeneratedImageFiles,
  restoreQuarantinedGeneratedImageFiles,
} from "./image-storage.ts";

interface CatalogImageRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  bot_id: string | null;
  related_bot_ids: string | null;
  origin: string | null;
  prompt: string;
  revised_prompt: string | null;
  url: string;
  size: string;
  quality: string;
  provider: string;
  local_rel_path: string | null;
  model: string | null;
  purpose: string | null;
  created_at: string;
}

interface AssetSetRow {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  title: string;
  source: string;
  source_context_json: string;
  automatic_tags_json: string;
  player_tags_json: string;
  created_at: string;
  updated_at: string;
}

interface CatalogContext {
  title?: string;
  tags: string[];
  data: Record<string, unknown>;
}

export interface ListImageAssetCatalogOptions {
  kind: ImageAssetKind;
  query?: string | null;
  cursor?: string | null;
  limit?: number;
  context?: string | null;
  source?: "generated" | "uploaded" | null;
  usage?: "used" | "unused" | null;
  sort?: "relevance" | "recency";
  includeIncomplete?: boolean;
}

export interface DeleteImageAssetSetResult {
  assetSetId: string;
  imageIds: string[];
  recoveryId: string;
  recoveryBytes: number;
}

export class ImageAssetLibraryError extends Error {
  readonly code: "not_found" | "in_use" | "unsafe" | "invalid";
  readonly usage: ImageAssetUsage[];

  constructor(
    code: ImageAssetLibraryError["code"],
    message: string,
    usage: ImageAssetUsage[] = [],
  ) {
    super(message);
    this.name = "ImageAssetLibraryError";
    this.code = code;
    this.usage = usage;
  }
}

function deterministicSetId(...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `asset-${hash.slice(0, 24)}`;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeTags(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().replace(/\s+/gu, " ").slice(0, 48))
        .filter(Boolean),
    ),
  ].slice(0, 32);
}

function titleFromPrompt(prompt: string, fallback: string): string {
  const clean = prompt.trim().replace(/\s+/gu, " ");
  if (!clean) return fallback;
  return clean.length > 88 ? `${clean.slice(0, 85).trimEnd()}…` : clean;
}

function sourceForRows(rows: readonly CatalogImageRow[]): ImageAssetSource {
  if (
    rows.some((row) => {
      const provider = row.provider.trim().toLowerCase();
      const origin = row.origin?.trim().toLowerCase() ?? "";
      return provider === "upload" || origin.includes("upload") || origin.includes("import");
    })
  ) {
    return "uploaded";
  }
  return "generated";
}

function readNestedString(
  value: Record<string, unknown>,
  path: readonly string[],
): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

export function ensureImageAssetLibrarySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_asset_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'building'
        CHECK (status IN ('building', 'ready', 'incomplete')),
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'generated'
        CHECK (source IN ('generated', 'uploaded', 'legacy')),
      source_context_json TEXT NOT NULL DEFAULT '{}',
      automatic_tags_json TEXT NOT NULL DEFAULT '[]',
      player_tags_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS image_asset_set_items (
      set_id TEXT NOT NULL,
      image_id TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      ordinal INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(set_id, image_id),
      UNIQUE(set_id, role),
      FOREIGN KEY(set_id) REFERENCES image_asset_sets(id) ON DELETE CASCADE,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_image_asset_sets_user_kind_updated
      ON image_asset_sets(user_id, kind, status, updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_image_asset_set_items_set_ordinal
      ON image_asset_set_items(set_id, ordinal, image_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS image_asset_search USING fts5(
      set_id UNINDEXED,
      user_id UNINDEXED,
      kind UNINDEXED,
      title,
      tags,
      context,
      prompts,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}

function upsertSet(
  db: DatabaseSync,
  set: {
    id: string;
    userId: string;
    kind: ImageAssetKind;
    status: ImageAssetSetStatus;
    title: string;
    source: ImageAssetSource;
    sourceContext: Record<string, unknown>;
    automaticTags: string[];
    createdAt: string;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO image_asset_sets
       (id, user_id, kind, status, title, source, source_context_json,
        automatic_tags_json, player_tags_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       status = excluded.status,
       title = excluded.title,
       source = CASE
         WHEN image_asset_sets.source = 'uploaded' THEN 'uploaded'
         ELSE excluded.source
       END,
       source_context_json = excluded.source_context_json,
       automatic_tags_json = excluded.automatic_tags_json,
       updated_at = excluded.updated_at`,
  ).run(
    set.id,
    set.userId,
    set.kind,
    set.status,
    set.title,
    set.source,
    JSON.stringify(set.sourceContext),
    JSON.stringify(normalizeTags(set.automaticTags)),
    set.createdAt,
    set.updatedAt,
  );
}

function attachItem(
  db: DatabaseSync,
  setId: string,
  imageId: string,
  role: ImageAssetMemberRole,
  ordinal: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO image_asset_set_items (set_id, image_id, role, ordinal)
     VALUES (?, ?, ?, ?)`,
  ).run(setId, imageId, role, ordinal);
}

function imageContextsForUser(
  db: DatabaseSync,
  userId: string,
  knownIds: ReadonlySet<string>,
): Map<string, CatalogContext> {
  const contexts = new Map<string, CatalogContext>();
  const merge = (
    imageId: string | null,
    context: Partial<CatalogContext> & { tags?: string[] },
  ): void => {
    if (!imageId || !knownIds.has(imageId)) return;
    const current = contexts.get(imageId) ?? { tags: [], data: {} };
    contexts.set(imageId, {
      title: context.title ?? current.title,
      tags: normalizeTags([...current.tags, ...(context.tags ?? [])]),
      data: { ...current.data, ...(context.data ?? {}) },
    });
  };

  const shows = db
    .prepare(
      `SELECT shows.id, shows.name, shows.host_bot_id, shows.atmosphere_json,
              bots.name AS host_name
         FROM botcast_shows shows
         LEFT JOIN bots ON bots.id = shows.host_bot_id AND bots.user_id = shows.user_id
        WHERE shows.user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    host_bot_id: string;
    host_name: string | null;
    atmosphere_json: string;
  }>;
  for (const show of shows) {
    const state = parseJsonObject(show.atmosphere_json);
    const base = {
      tags: normalizeTags([show.name, show.host_name]),
      data: {
        showId: show.id,
        showName: show.name,
        botId: show.host_bot_id,
        botName: show.host_name,
      },
    };
    merge(readNestedString(state, ["dayAtmosphere", "imageId"]), {
      ...base,
      title: `${show.name} studio`,
    });
    merge(readNestedString(state, ["nightAtmosphere", "imageId"]), {
      ...base,
      title: `${show.name} studio`,
    });
    merge(readNestedString(state, ["dayAtmosphere", "microphoneTintMaskImageId"]), base);
    merge(readNestedString(state, ["nightAtmosphere", "microphoneTintMaskImageId"]), base);
    merge(readNestedString(state, ["studioLighting", "imageId"]), base);
    merge(readNestedString(state, ["logo", "imageId"]), {
      ...base,
      title: `${show.name} logo`,
    });
  }

  const projects = db
    .prepare("SELECT id, title, cover_json FROM slate_projects WHERE user_id = ?")
    .all(userId) as Array<{ id: string; title: string; cover_json: string }>;
  for (const project of projects) {
    const cover = parseJsonObject(project.cover_json);
    const imageId =
      readNestedString(cover, ["imageId"]) ??
      readNestedString(cover, ["assetId"]) ??
      readNestedString(cover, ["image", "id"]);
    merge(imageId, {
      title: `${project.title} cover`,
      tags: [project.title],
      data: { projectId: project.id, projectName: project.title },
    });
  }
  const studies = db
    .prepare(
      `SELECT refs.image_id, refs.project_id, projects.title
         FROM slate_visual_references refs
         JOIN slate_projects projects
           ON projects.id = refs.project_id AND projects.user_id = refs.user_id
        WHERE refs.user_id = ? AND refs.image_id IS NOT NULL`,
    )
    .all(userId) as Array<{
    image_id: string;
    project_id: string;
    title: string;
  }>;
  for (const study of studies) {
    merge(study.image_id, {
      tags: [study.title],
      data: { projectId: study.project_id, projectName: study.title },
    });
  }
  for (const row of db
    .prepare("SELECT id, display_name, hub_atmosphere_image_id FROM users WHERE id = ?")
    .all(userId) as Array<{
    id: string;
    display_name: string;
    hub_atmosphere_image_id: string | null;
  }>) {
    merge(row.hub_atmosphere_image_id, {
      title: "Home Atmosphere",
      tags: [row.display_name, "Home"],
      data: { surface: "home" },
    });
  }
  for (const row of db
    .prepare(
      `SELECT id, title, zen_wallpaper_image_id
         FROM conversations
        WHERE user_id = ? AND zen_wallpaper_image_id IS NOT NULL`,
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    zen_wallpaper_image_id: string;
  }>) {
    merge(row.zen_wallpaper_image_id, {
      title: `${row.title} Atmosphere`,
      tags: [row.title, "Zen"],
      data: { conversationId: row.id, conversationName: row.title },
    });
  }
  return contexts;
}

function replaceSignalStudioPair(
  db: DatabaseSync,
  userId: string,
  day: CatalogImageRow,
  night: CatalogImageRow,
  associated: Array<{
    row: CatalogImageRow;
    role: Extract<ImageAssetMemberRole, "light_mask" | "dark_mask" | "lighting">;
  }>,
  context: CatalogContext,
): string {
  const setId = deterministicSetId(userId, "signal_studio", day.id, night.id);
  const memberIds = [day.id, night.id, ...associated.map(({ row }) => row.id)];
  const existingSets = db
    .prepare(
      `SELECT DISTINCT sets.id, sets.player_tags_json
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
        WHERE sets.user_id = ? AND items.image_id IN (${memberIds.map(() => "?").join(",")})`,
    )
    .all(userId, ...memberIds) as Array<{ id: string; player_tags_json: string }>;
  const playerTags = normalizeTags(
    existingSets.flatMap((row) => parseStringArray(row.player_tags_json)),
  );
  for (const existing of existingSets) {
    if (existing.id !== setId) {
      db.prepare("DELETE FROM image_asset_sets WHERE id = ? AND user_id = ?").run(
        existing.id,
        userId,
      );
    }
  }
  const rows = [day, night, ...associated.map(({ row }) => row)];
  upsertSet(db, {
    id: setId,
    userId,
    kind: "signal_studio",
    status: "ready",
    title: context.title ?? titleFromPrompt(night.prompt, "Signal studio"),
    source: sourceForRows(rows),
    sourceContext: context.data,
    automaticTags: normalizeTags([
      ...context.tags,
      day.prompt,
      night.prompt,
      "Light",
      "Dark",
    ]),
    createdAt: rows.map((row) => row.created_at).sort()[0] ?? day.created_at,
    updatedAt: rows.map((row) => row.created_at).sort().at(-1) ?? night.created_at,
  });
  if (playerTags.length > 0) {
    db.prepare(
      "UPDATE image_asset_sets SET player_tags_json = ? WHERE id = ? AND user_id = ?",
    ).run(JSON.stringify(playerTags), setId, userId);
  }
  attachItem(db, setId, day.id, "light", 0);
  attachItem(db, setId, night.id, "dark", 1);
  for (const { row, role } of associated) {
    attachItem(db, setId, row.id, role, role === "lighting" ? 4 : role === "light_mask" ? 2 : 3);
  }
  return setId;
}

function rebuildSearchIndex(db: DatabaseSync, userId: string): void {
  db.prepare("DELETE FROM image_asset_search WHERE user_id = ?").run(userId);
  const sets = db
    .prepare(
      `SELECT id, user_id, kind, title, automatic_tags_json, player_tags_json,
              source_context_json
         FROM image_asset_sets WHERE user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    kind: string;
    title: string;
    automatic_tags_json: string;
    player_tags_json: string;
    source_context_json: string;
  }>;
  const promptRows = db.prepare(
    `SELECT images.prompt, images.revised_prompt
       FROM image_asset_set_items items
       JOIN images ON images.id = items.image_id
      WHERE items.set_id = ? ORDER BY items.ordinal`,
  );
  const insert = db.prepare(
    `INSERT INTO image_asset_search
       (set_id, user_id, kind, title, tags, context, prompts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const set of sets) {
    const prompts = promptRows.all(set.id) as Array<{
      prompt: string;
      revised_prompt: string | null;
    }>;
    insert.run(
      set.id,
      set.user_id,
      set.kind,
      set.title,
      [
        ...parseStringArray(set.automatic_tags_json),
        ...parseStringArray(set.player_tags_json),
      ].join(" "),
      Object.values(parseJsonObject(set.source_context_json)).join(" "),
      prompts.flatMap((row) => [row.prompt, row.revised_prompt ?? ""]).join(" "),
    );
  }
}

/** Idempotently catalogs existing image rows without moving or copying files. */
export function synchronizeImageAssetCatalog(
  db: DatabaseSync,
  userId: string,
): void {
  ensureImageAssetLibrarySchema(db);
  db.prepare(
    `DELETE FROM image_asset_sets
      WHERE user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM image_asset_set_items items
           WHERE items.set_id = image_asset_sets.id
        )`,
  ).run(userId);
  const images = db
    .prepare(
      `SELECT id, user_id, conversation_id, bot_id, related_bot_ids, origin,
              prompt, revised_prompt, url, size, quality, provider,
              local_rel_path, model, purpose, created_at
         FROM images WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(userId) as unknown as CatalogImageRow[];
  const byId = new Map(images.map((row) => [row.id, row] as const));
  const contexts = imageContextsForUser(db, userId, new Set(byId.keys()));
  const consumed = new Set<string>();

  const shows = db
    .prepare("SELECT atmosphere_json FROM botcast_shows WHERE user_id = ?")
    .all(userId) as Array<{ atmosphere_json: string }>;
  for (const show of shows) {
    const state = parseJsonObject(show.atmosphere_json);
    const dayId = readNestedString(state, ["dayAtmosphere", "imageId"]);
    const nightId = readNestedString(state, ["nightAtmosphere", "imageId"]);
    const day = dayId ? byId.get(dayId) : undefined;
    const night = nightId ? byId.get(nightId) : undefined;
    if (
      !day ||
      !night ||
      day.purpose !== "signal_studio_day" ||
      night.purpose !== "signal_studio_night"
    ) {
      continue;
    }
    const associated = [
      {
        imageId: readNestedString(state, ["dayAtmosphere", "microphoneTintMaskImageId"]),
        role: "light_mask" as const,
      },
      {
        imageId: readNestedString(state, ["nightAtmosphere", "microphoneTintMaskImageId"]),
        role: "dark_mask" as const,
      },
      {
        imageId: readNestedString(state, ["studioLighting", "imageId"]),
        role: "lighting" as const,
      },
    ].flatMap(({ imageId, role }) => {
      const row = imageId ? byId.get(imageId) : undefined;
      return row ? [{ row, role }] : [];
    });
    replaceSignalStudioPair(
      db,
      userId,
      day,
      night,
      associated,
      contexts.get(day.id) ?? contexts.get(night.id) ?? { tags: [], data: {} },
    );
    for (const row of [day, night, ...associated.map(({ row }) => row)]) {
      consumed.add(row.id);
    }
  }

  const botNames = new Map(
    (
      db.prepare("SELECT id, name FROM bots WHERE user_id = ?").all(userId) as Array<{
        id: string;
        name: string;
      }>
    ).map((row) => [row.id, row.name] as const),
  );
  for (const image of images) {
    if (consumed.has(image.id)) continue;
    const kind = imageAssetKindForImage(image);
    if (!kind) continue;
    const context = contexts.get(image.id) ?? { tags: [], data: {} };
    const botName = image.bot_id ? botNames.get(image.bot_id) : undefined;
    const status: ImageAssetSetStatus =
      kind === "signal_studio" ? "incomplete" : "ready";
    const setId = deterministicSetId(userId, kind, image.id);
    upsertSet(db, {
      id: setId,
      userId,
      kind,
      status,
      title:
        context.title ??
        titleFromPrompt(image.prompt, IMAGE_ASSET_KIND_LABELS[kind].replace(/s$/u, "")),
      source: status === "incomplete" ? "legacy" : sourceForRows([image]),
      sourceContext: {
        ...context.data,
        ...(image.bot_id ? { botId: image.bot_id, botName } : {}),
        ...(image.conversation_id ? { conversationId: image.conversation_id } : {}),
      },
      automaticTags: normalizeTags([
        ...context.tags,
        botName,
        image.prompt,
        image.revised_prompt,
      ]),
      createdAt: image.created_at,
      updatedAt: image.created_at,
    });
    attachItem(
      db,
      setId,
      image.id,
      imageAssetMemberRoleForImage(image),
      0,
    );
  }
  rebuildSearchIndex(db, userId);
}

function offsetFromCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offset?: unknown;
    };
    return typeof decoded.offset === "number" && Number.isSafeInteger(decoded.offset)
      ? Math.max(0, decoded.offset)
      : 0;
  } catch {
    throw new ImageAssetLibraryError("invalid", "Invalid asset-library cursor.");
  }
}

function cursorForOffset(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function ftsQuery(value: string): string {
  return value
    .normalize("NFKC")
    .match(/[\p{L}\p{N}_-]+/gu)
    ?.slice(0, 12)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(" AND ") ?? "";
}

function usageForSets(
  db: DatabaseSync,
  userId: string,
  setIds: readonly string[],
): Map<string, ImageAssetUsage[]> {
  if (setIds.length === 0) return new Map();
  const itemRows = db
    .prepare(
      `SELECT set_id, image_id FROM image_asset_set_items
        WHERE set_id IN (${setIds.map(() => "?").join(",")})`,
    )
    .all(...setIds) as Array<{ set_id: string; image_id: string }>;
  const usageByImage = imageAssetUsageLabels(
    db,
    userId,
    itemRows.map((row) => row.image_id),
  );
  const result = new Map<string, ImageAssetUsage[]>();
  for (const item of itemRows) {
    const current = result.get(item.set_id) ?? [];
    const additions = (usageByImage.get(item.image_id) ?? []).map((label) => ({
      type: "reference",
      label,
    }));
    result.set(
      item.set_id,
      [...new Map([...current, ...additions].map((usage) => [usage.label, usage])).values()],
    );
  }
  return result;
}

function membersForSets(
  db: DatabaseSync,
  setIds: readonly string[],
): Map<string, ImageAssetMember[]> {
  if (setIds.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT items.set_id, items.role, images.id, images.prompt,
              images.revised_prompt, images.url, images.provider, images.model,
              images.size, images.local_rel_path, images.created_at
         FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id IN (${setIds.map(() => "?").join(",")})
        ORDER BY items.set_id, items.ordinal, images.id`,
    )
    .all(...setIds) as Array<{
    set_id: string;
    role: ImageAssetMemberRole;
    id: string;
    prompt: string;
    revised_prompt: string | null;
    url: string;
    provider: string;
    model: string;
    size: string;
    local_rel_path: string | null;
    created_at: string;
  }>;
  const result = new Map<string, ImageAssetMember[]>();
  for (const row of rows) {
    const member: ImageAssetMember = {
      imageId: row.id,
      role: row.role,
      url: row.local_rel_path
        ? `/api/images/${encodeURIComponent(row.id)}/file`
        : row.url,
      thumbnailUrl: row.local_rel_path
        ? `/api/images/${encodeURIComponent(row.id)}/thumb`
        : row.url,
      prompt: row.prompt,
      revisedPrompt: row.revised_prompt,
      provider: row.provider,
      model: row.model,
      size: row.size,
      createdAt: row.created_at,
    };
    result.set(row.set_id, [...(result.get(row.set_id) ?? []), member]);
  }
  return result;
}

function mapAssetSetRows(
  db: DatabaseSync,
  userId: string,
  rows: readonly AssetSetRow[],
): ImageAssetSet[] {
  const ids = rows.map((row) => row.id);
  const members = membersForSets(db, ids);
  const usage = usageForSets(db, userId, ids);
  return rows.map((row) => {
    const setUsage = usage.get(row.id) ?? [];
    return {
      id: row.id,
      kind: row.kind as ImageAssetKind,
      status: row.status as ImageAssetSetStatus,
      title: row.title,
      source: row.source as ImageAssetSource,
      sourceContext: parseJsonObject(row.source_context_json),
      automaticTags: parseStringArray(row.automatic_tags_json),
      playerTags: parseStringArray(row.player_tags_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      usageCount: setUsage.length,
      usage: setUsage,
      members: members.get(row.id) ?? [],
    };
  });
}

export function listImageAssetCatalog(
  db: DatabaseSync,
  userId: string,
  options: ListImageAssetCatalogOptions,
): ImageAssetCatalogPage {
  if (!isImageAssetKind(options.kind)) {
    throw new ImageAssetLibraryError("invalid", "Choose a recognized asset kind.");
  }
  synchronizeImageAssetCatalog(db, userId);
  const offset = offsetFromCursor(options.cursor);
  const limit = Math.min(60, Math.max(1, Math.floor(options.limit ?? 24)));
  const query = options.query?.trim() ?? "";
  const match = query ? ftsQuery(query) : "";
  const context = options.context?.trim() ?? "";
  const params: Array<string | number> = [];
  const clauses = ["sets.user_id = ?", "sets.kind = ?"];
  params.push(userId, options.kind);
  if (!options.includeIncomplete) clauses.push("sets.status = 'ready'");
  if (options.source) {
    clauses.push("sets.source = ?");
    params.push(options.source);
  }
  if (match) {
    clauses.push("image_asset_search MATCH ?");
    params.push(match);
  }
  const join = match
    ? "JOIN image_asset_search ON image_asset_search.set_id = sets.id"
    : "";
  const contextRank = context
    ? "CASE WHEN sets.source_context_json LIKE ? THEN 0 ELSE 1 END,"
    : "";
  if (context) params.push(`%${context.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const relevance = match && options.sort !== "recency" ? "bm25(image_asset_search)," : "";
  const rows = db
    .prepare(
      `SELECT sets.* FROM image_asset_sets sets ${join}
        WHERE ${clauses.join(" AND ")}
        ORDER BY ${contextRank} ${relevance} sets.updated_at DESC, sets.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, limit + 1, offset) as unknown as AssetSetRow[];
  let assets = mapAssetSetRows(db, userId, rows.slice(0, limit));
  if (options.usage === "used") assets = assets.filter((asset) => asset.usageCount > 0);
  if (options.usage === "unused") assets = assets.filter((asset) => asset.usageCount === 0);
  return {
    assets,
    nextCursor: rows.length > limit ? cursorForOffset(offset + limit) : null,
  };
}

export function updateImageAssetPlayerTags(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  tags: readonly unknown[],
): ImageAssetSet {
  synchronizeImageAssetCatalog(db, userId);
  const normalized = normalizeTags(tags);
  const result = db
    .prepare(
      `UPDATE image_asset_sets
          SET player_tags_json = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    )
    .run(JSON.stringify(normalized), new Date().toISOString(), assetSetId, userId);
  if (Number(result.changes) !== 1) {
    throw new ImageAssetLibraryError("not_found", "Asset set not found.");
  }
  rebuildSearchIndex(db, userId);
  const row = db
    .prepare("SELECT * FROM image_asset_sets WHERE id = ? AND user_id = ?")
    .get(assetSetId, userId) as unknown as AssetSetRow;
  return mapAssetSetRows(db, userId, [row])[0]!;
}

export function imageAssetStorageSummary(
  db: DatabaseSync,
  userId: string,
): ImageAssetStorageSummary {
  synchronizeImageAssetCatalog(db, userId);
  const rows = db
    .prepare(
      `SELECT images.id, images.local_rel_path, images.provider, sets.kind
         FROM images
         LEFT JOIN image_asset_set_items items ON items.image_id = images.id
         LEFT JOIN image_asset_sets sets ON sets.id = items.set_id
        WHERE images.user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    local_rel_path: string | null;
    provider: string;
    kind: ImageAssetKind | null;
  }>;
  const seenPaths = new Set<string>();
  const kindTotals = new Map<ImageAssetKind, { bytes: number; ids: Set<string> }>();
  let activeBytes = 0;
  let generatedBytes = 0;
  let uploadedBytes = 0;
  let systemManagedBytes = 0;
  for (const row of rows) {
    const path = row.local_rel_path?.trim();
    const bytes = path && !seenPaths.has(path) ? generatedImageStorageSizeBytes(path) : 0;
    if (path) seenPaths.add(path);
    activeBytes += bytes;
    if (row.provider.trim().toLowerCase() === "upload") uploadedBytes += bytes;
    else generatedBytes += bytes;
    if (!row.kind) {
      systemManagedBytes += bytes;
      continue;
    }
    const total = kindTotals.get(row.kind) ?? { bytes: 0, ids: new Set<string>() };
    total.bytes += bytes;
    total.ids.add(row.id);
    kindTotals.set(row.kind, total);
  }
  return {
    activeBytes,
    recoveryTrashBytes: listGeneratedImageRecoveryBatchesForUser(userId).reduce(
      (total, batch) => total + batch.sizeBytes,
      0,
    ),
    generatedBytes,
    uploadedBytes,
    systemManagedBytes,
    totalAssetCount: Number(
      (
        db.prepare("SELECT COUNT(*) AS count FROM image_asset_sets WHERE user_id = ?")
          .get(userId) as { count: number | bigint }
      ).count,
    ),
    byKind: IMAGE_ASSET_KINDS.map((kind) => ({
      kind,
      bytes: kindTotals.get(kind)?.bytes ?? 0,
      count: kindTotals.get(kind)?.ids.size ?? 0,
    })),
  };
}

export function deleteUnusedImageAssetSet(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
): DeleteImageAssetSetResult {
  synchronizeImageAssetCatalog(db, userId);
  const set = db
    .prepare("SELECT * FROM image_asset_sets WHERE id = ? AND user_id = ?")
    .get(assetSetId, userId) as AssetSetRow | undefined;
  if (!set) throw new ImageAssetLibraryError("not_found", "Asset set not found.");
  if (set.source === "legacy" || set.status !== "ready") {
    throw new ImageAssetLibraryError(
      "unsafe",
      "Incomplete legacy sets stay protected until their membership is verified.",
    );
  }
  const rows = db
    .prepare(
      `SELECT images.* FROM image_asset_set_items items
         JOIN images ON images.id = items.image_id
        WHERE items.set_id = ? ORDER BY items.ordinal`,
    )
    .all(assetSetId) as unknown as CatalogImageRow[];
  const itemMetadata = db
    .prepare(
      `SELECT image_id, role, ordinal
         FROM image_asset_set_items
        WHERE set_id = ? ORDER BY ordinal, image_id`,
    )
    .all(assetSetId) as Array<{
    image_id: string;
    role: string;
    ordinal: number | bigint;
  }>;
  const usage = usageForSets(db, userId, [assetSetId]).get(assetSetId) ?? [];
  if (usage.length > 0) {
    throw new ImageAssetLibraryError(
      "in_use",
      "This asset is still used. Replace it before deleting it from the library.",
      usage,
    );
  }
  const paths = rows.map((row) => row.local_rel_path?.trim() ?? "");
  if (
    rows.length === 0 ||
    paths.some(
      (path, index) =>
        !path || path !== `generated-images/${userId}/${rows[index]!.id}.png`,
    )
  ) {
    throw new ImageAssetLibraryError(
      "unsafe",
      "This asset has an unverifiable or remote file and cannot be safely deleted.",
    );
  }
  const pathUse = db.prepare(
    "SELECT COUNT(*) AS count FROM images WHERE local_rel_path = ?",
  );
  if (
    paths.some(
      (path) =>
        Number((pathUse.get(path) as { count: number | bigint }).count) !== 1,
    )
  ) {
    throw new ImageAssetLibraryError(
      "unsafe",
      "This asset shares a file with another record and remains protected.",
    );
  }

  const recoveryId = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`;
  const recoveryBytes = paths.reduce(
    (total, path) => total + generatedImageStorageSizeBytes(path),
    0,
  );
  let quarantine: ReturnType<typeof quarantineGeneratedImageFiles> | null = null;
  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE;");
    transactionStarted = true;
    const recheckedUsage = usageForSets(db, userId, [assetSetId]).get(assetSetId) ?? [];
    if (recheckedUsage.length > 0) {
      throw new ImageAssetLibraryError(
        "in_use",
        "This asset became used while deletion was being prepared.",
        recheckedUsage,
      );
    }
    quarantine = quarantineGeneratedImageFiles(
      userId,
      paths,
      recoveryId,
      JSON.stringify({
        version: 1,
        recoveryId,
        quarantinedAt: new Date().toISOString(),
        userId,
        images: rows,
        imageAssetSet: set,
        imageAssetSetItems: itemMetadata,
      }),
    );
    db.prepare("DELETE FROM image_asset_sets WHERE id = ? AND user_id = ?").run(
      assetSetId,
      userId,
    );
    const remove = db.prepare("DELETE FROM images WHERE id = ? AND user_id = ?");
    for (const row of rows) {
      if (Number(remove.run(row.id, userId).changes) !== 1) {
        throw new ImageAssetLibraryError("unsafe", "The asset changed during deletion.");
      }
    }
    db.exec("COMMIT;");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) db.exec("ROLLBACK;");
    if (quarantine) restoreQuarantinedGeneratedImageFiles(quarantine);
    throw error;
  }
  if (!quarantine) throw new Error("Asset deletion finished without a recovery batch.");
  markGeneratedImageQuarantineCommitted(quarantine);
  return {
    assetSetId,
    imageIds: rows.map((row) => row.id),
    recoveryId,
    recoveryBytes,
  };
}
