import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  IMAGE_ASSET_KINDS,
  IMAGE_ASSET_KIND_LABELS,
  BOT_IMAGE_ASSET_LIBRARY_KIND_ORDER,
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
  type BotImageAssetLibraryIndex,
} from "@localai/shared";
import { normalizeImageRelatedBotIds } from "./image-provenance.ts";
import { imageAssetUsageLabels } from "./image-asset-cleanup.ts";
import { heuristicSmartTags } from "./image-asset-smart-memory.ts";
import { itemCapabilityCardsForAssetSets } from "./image-asset-capability-cards.ts";
import {
  buildGeneratedImageCompressUndoRelativePath,
  generatedImageStorageSizeBytes,
  listGeneratedImageRecoveryBatchesForUser,
  markGeneratedImageQuarantineCommitted,
  quarantineGeneratedImageFiles,
  readGeneratedImageBytes,
  resolveAbsoluteUnderDataRoot,
  restoreQuarantinedGeneratedImageFiles,
} from "./image-storage.ts";
import { existsSync, statSync } from "node:fs";

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
  storage_tier?: string | null;
  access_count?: number | bigint | null;
  last_accessed_at?: string | null;
  reuse_score?: number | bigint | null;
  compress_undo_available?: number | bigint | null;
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
  botId?: string | null;
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

/**
 * Local metadata Case Forge may use to decide whether an Item can be safely
 * recast as case evidence. The caller must still make a case-specific,
 * relevance-gated choice; the catalog deliberately does not make that call.
 */
export interface ImageAssetItemReuseCandidate {
  assetSetId: string;
  imageId: string;
  localRelPath: string;
  title: string;
  prompt: string;
  revisedPrompt: string | null;
  automaticTags: string[];
  playerTags: string[];
  sourceContext: Record<string, unknown>;
  createdAt: string;
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

function readNestedArray(
  value: Record<string, unknown>,
  path: readonly string[],
): unknown[] {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return [];
    }
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : [];
}

function exactRecordId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

export function ensureImageAssetLibrarySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_asset_generation_preferences (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('local', 'openai')),
      model TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, kind),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
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
    CREATE TABLE IF NOT EXISTS image_bot_associations (
      user_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      bot_id TEXT NOT NULL,
      relation TEXT NOT NULL CHECK (relation IN ('owner', 'participant')),
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, image_id, bot_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(image_id) REFERENCES images(id) ON DELETE CASCADE,
      FOREIGN KEY(bot_id) REFERENCES bots(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_image_bot_associations_user_bot_image
      ON image_bot_associations(user_id, bot_id, image_id);
    CREATE TABLE IF NOT EXISTS image_asset_magenta_revisions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      set_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'committed'
        CHECK (status IN ('committed', 'undone')),
      created_at TEXT NOT NULL,
      undone_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(set_id) REFERENCES image_asset_sets(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS image_asset_magenta_revision_items (
      revision_id TEXT NOT NULL,
      image_id TEXT NOT NULL,
      role TEXT NOT NULL,
      ciphertext BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      PRIMARY KEY(revision_id, image_id),
      FOREIGN KEY(revision_id)
        REFERENCES image_asset_magenta_revisions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_image_asset_magenta_revisions_latest
      ON image_asset_magenta_revisions(
        user_id, set_id, status, created_at DESC, id DESC
      );
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
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS image_asset_catalog_state (
      user_id TEXT PRIMARY KEY,
      dirty INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1))
    );
  `);
  const addColumnIfMissing = (
    _database: typeof db,
    table: string,
    name: string,
    definition: string,
  ): void => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (columns.some((column) => column.name === name)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
  };
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

  const hasBotsTable = Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bots'")
      .get(),
  );
  if (hasBotsTable) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS image_bot_associations_after_insert
      AFTER INSERT ON images
      BEGIN
        INSERT OR IGNORE INTO image_bot_associations
          (user_id, image_id, bot_id, relation, created_at)
        SELECT NEW.user_id, NEW.id, bots.id, 'participant', NEW.created_at
          FROM bots
          JOIN json_each(
            CASE
              WHEN json_valid(NEW.related_bot_ids) THEN NEW.related_bot_ids
              ELSE '[]'
            END
          ) AS related_bot ON related_bot.value = bots.id
         WHERE bots.user_id = NEW.user_id;
        INSERT OR REPLACE INTO image_bot_associations
          (user_id, image_id, bot_id, relation, created_at)
        SELECT NEW.user_id, NEW.id, bots.id, 'owner', NEW.created_at
          FROM bots
         WHERE bots.user_id = NEW.user_id AND bots.id = NEW.bot_id;
      END;

      CREATE TRIGGER IF NOT EXISTS image_bot_associations_after_provenance_update
      AFTER UPDATE OF user_id, bot_id, related_bot_ids ON images
      BEGIN
        DELETE FROM image_bot_associations
         WHERE user_id = OLD.user_id AND image_id = OLD.id;
        INSERT OR IGNORE INTO image_bot_associations
          (user_id, image_id, bot_id, relation, created_at)
        SELECT NEW.user_id, NEW.id, bots.id, 'participant', NEW.created_at
          FROM bots
          JOIN json_each(
            CASE
              WHEN json_valid(NEW.related_bot_ids) THEN NEW.related_bot_ids
              ELSE '[]'
            END
          ) AS related_bot ON related_bot.value = bots.id
         WHERE bots.user_id = NEW.user_id;
        INSERT OR REPLACE INTO image_bot_associations
          (user_id, image_id, bot_id, relation, created_at)
        SELECT NEW.user_id, NEW.id, bots.id, 'owner', NEW.created_at
          FROM bots
         WHERE bots.user_id = NEW.user_id AND bots.id = NEW.bot_id;
      END;
    `);
  }

  const installDirtyTriggers = (
    table: string,
    updateColumns: readonly string[],
  ): void => {
    if (!tableExists(db, table)) return;
    const targetIsVaultView = Boolean(
      db
        .prepare(
          "SELECT 1 FROM temp.sqlite_temp_schema WHERE type = 'view' AND name = ?",
        )
        .get(table),
    );
    // Reopened Vault databases expose account tables through TEMP views before
    // this additive schema pass runs. SQLite permits only INSTEAD OF triggers
    // on those views; fresh/legacy databases still use AFTER triggers on the
    // physical tables. Both forms are observational and roll back with a
    // failed owner-bound mutation.
    const timing = targetIsVaultView ? "INSTEAD OF" : "AFTER";
    const triggerPrefix = `image_asset_catalog_dirty_${table}`;
    db.exec(`
      CREATE TEMP TRIGGER IF NOT EXISTS ${triggerPrefix}_insert
      ${timing} INSERT ON ${table}
      BEGIN
        INSERT INTO image_asset_catalog_state (user_id, dirty)
        VALUES (NEW.user_id, 1)
        ON CONFLICT(user_id) DO UPDATE SET dirty = 1;
      END;
      CREATE TEMP TRIGGER IF NOT EXISTS ${triggerPrefix}_update
      ${timing} UPDATE OF ${updateColumns.join(", ")} ON ${table}
      BEGIN
        INSERT INTO image_asset_catalog_state (user_id, dirty)
        SELECT OLD.user_id, 1
         WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
        ON CONFLICT(user_id) DO UPDATE SET dirty = 1;
        INSERT INTO image_asset_catalog_state (user_id, dirty)
        VALUES (NEW.user_id, 1)
        ON CONFLICT(user_id) DO UPDATE SET dirty = 1;
      END;
      CREATE TEMP TRIGGER IF NOT EXISTS ${triggerPrefix}_delete
      ${timing} DELETE ON ${table}
      BEGIN
        INSERT INTO image_asset_catalog_state (user_id, dirty)
        SELECT OLD.user_id, 1
         WHERE EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
        ON CONFLICT(user_id) DO UPDATE SET dirty = 1;
      END;
    `);
  };
  for (const [table, updateColumns] of [
    [
      "images",
      [
        "user_id",
        "bot_id",
        "related_bot_ids",
        "origin",
        "prompt",
        "revised_prompt",
        "provider",
        "local_rel_path",
        "purpose",
        "content_sha256",
      ],
    ],
    ["bots", ["user_id", "name", "chat_atmosphere_image_id"]],
    ["conversations", ["user_id", "title", "zen_wallpaper_image_id"]],
    ["botcast_shows", ["user_id", "name", "host_bot_id", "atmosphere_json"]],
    ["library_groups", ["user_id", "name", "atmosphere_json"]],
    ["coffee_groups", ["user_id", "name", "atmosphere_json"]],
    ["slate_projects", ["user_id", "title", "cover_json"]],
    ["slate_visual_references", ["user_id", "project_id", "image_id"]],
  ] as const) {
    installDirtyTriggers(table, updateColumns);
  }

  if (tableExists(db, "users")) {
    const usersTriggerTiming = db
      .prepare(
        "SELECT 1 FROM temp.sqlite_temp_schema WHERE type = 'view' AND name = 'users'",
      )
      .get()
      ? "INSTEAD OF"
      : "AFTER";
    db.exec(`
      CREATE TEMP TRIGGER IF NOT EXISTS image_asset_catalog_dirty_users_update
      ${usersTriggerTiming} UPDATE OF display_name, hub_atmosphere_image_id ON users
      BEGIN
        INSERT INTO image_asset_catalog_state (user_id, dirty)
        VALUES (NEW.id, 1)
        ON CONFLICT(user_id) DO UPDATE SET dirty = 1;
      END;
    `);
  }
}

/**
 * Rebuilds the derivative ownership index from exact, tenant-owned IDs only.
 * Images remain canonical provenance; persisted applet records supply additive
 * legacy/backfill links without inspecting names, prompts, tags, or filenames.
 */
export function rebuildImageBotAssociations(
  db: DatabaseSync,
  userId: string,
): void {
  db.prepare("DELETE FROM image_bot_associations WHERE user_id = ?").run(userId);
  const rows = db
    .prepare(
      `SELECT id, bot_id, related_bot_ids
         FROM images
        WHERE user_id = ?
        ORDER BY created_at, id`,
    )
    .all(userId) as Array<{
    id: string;
    bot_id: string | null;
    related_bot_ids: string | null;
  }>;
  const insert = db.prepare(
    `INSERT INTO image_bot_associations
       (user_id, image_id, bot_id, relation, created_at)
     SELECT images.user_id, images.id, bots.id, ?, images.created_at
       FROM images
       JOIN bots
         ON bots.id = ?
        AND bots.user_id = images.user_id
      WHERE images.id = ? AND images.user_id = ?
     ON CONFLICT(user_id, image_id, bot_id) DO UPDATE SET
       relation = CASE
         WHEN excluded.relation = 'owner'
           OR image_bot_associations.relation = 'owner'
           THEN 'owner'
         ELSE 'participant'
       END,
       created_at = excluded.created_at`,
  );
  const associate = (
    imageId: string | null | undefined,
    botId: string | null | undefined,
    relation: "owner" | "participant",
  ): void => {
    const exactImageId = imageId?.trim();
    const exactBotId = botId?.trim();
    if (!exactImageId || !exactBotId) return;
    insert.run(relation, exactBotId, exactImageId, userId);
  };

  // Canonical image provenance, including shared authored participants.
  for (const row of rows) {
    for (const botId of normalizeImageRelatedBotIds(
      row.related_bot_ids,
      row.bot_id,
    )) {
      associate(
        row.id,
        botId,
        botId === row.bot_id ? "owner" : "participant",
      );
    }
  }

  // Chat and Zen are bot-locked when a persisted conversation carries bot_id.
  // The direct image conversation link and current wallpaper pointer cover old
  // rows that predate canonical image.bot_id / related_bot_ids persistence.
  if (tableExists(db, "conversations")) {
    const conversationImages = db
      .prepare(
        `SELECT DISTINCT images.id AS image_id, conversations.bot_id
           FROM conversations
           JOIN images
             ON images.user_id = conversations.user_id
            AND (
              images.conversation_id = conversations.id
              OR images.id = conversations.zen_wallpaper_image_id
            )
          WHERE conversations.user_id = ?
            AND conversations.conversation_mode IN ('chat', 'zen')
            AND conversations.bot_id IS NOT NULL`,
      )
      .all(userId) as Array<{ image_id: string; bot_id: string }>;
    for (const row of conversationImages) {
      associate(row.image_id, row.bot_id, "owner");
    }

    const wallpaperHistories = db
      .prepare(
        `SELECT bot_id, zen_wallpaper_history
           FROM conversations
          WHERE user_id = ?
            AND conversation_mode IN ('chat', 'zen')
            AND bot_id IS NOT NULL
            AND json_valid(zen_wallpaper_history)`,
      )
      .all(userId) as Array<{
      bot_id: string;
      zen_wallpaper_history: string | null;
    }>;
    for (const row of wallpaperHistories) {
      let entries: unknown[] = [];
      try {
        const parsed = JSON.parse(row.zen_wallpaper_history ?? "[]") as unknown;
        entries = Array.isArray(parsed) ? parsed : [];
      } catch {
        entries = [];
      }
      for (const entry of entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const imageId = (entry as Record<string, unknown>).imageId;
        associate(
          typeof imageId === "string" ? imageId : null,
          row.bot_id,
          "owner",
        );
      }
    }

    const coffeeConversationImages = db
      .prepare(
        `SELECT DISTINCT images.id AS image_id,
                         conversations.bot_group_ids,
                         conversations.coffee_absent_bot_ids,
                         conversations.coffee_group_id
           FROM conversations
           JOIN images
             ON images.user_id = conversations.user_id
            AND images.conversation_id = conversations.id
          WHERE conversations.user_id = ?
            AND conversations.conversation_mode = 'coffee'`,
      )
      .all(userId) as Array<{
      image_id: string;
      bot_group_ids: string | null;
      coffee_absent_bot_ids: string | null;
      coffee_group_id: string | null;
    }>;
    const coffeeSeatIds = tableExists(db, "coffee_group_seats")
      ? db.prepare(
          `SELECT bot_id
             FROM coffee_group_seats
            WHERE user_id = ? AND group_id = ? AND bot_id IS NOT NULL
            ORDER BY seat_index`,
        )
      : null;
    for (const row of coffeeConversationImages) {
      const absentBotIds = new Set(
        normalizeImageRelatedBotIds(row.coffee_absent_bot_ids),
      );
      let participantBotIds = normalizeImageRelatedBotIds(
        row.bot_group_ids,
      ).filter((botId) => !absentBotIds.has(botId));
      if (
        participantBotIds.length === 0 &&
        row.coffee_group_id &&
        coffeeSeatIds
      ) {
        participantBotIds = (
          coffeeSeatIds.all(userId, row.coffee_group_id) as Array<{
            bot_id: string;
          }>
        )
          .map((seat) => seat.bot_id)
          .filter((botId) => !absentBotIds.has(botId));
      }
      for (const botId of participantBotIds) {
        associate(row.image_id, botId, "participant");
      }
    }
  }

  // Per-bot Chat atmosphere is an exact authored ownership pointer.
  const chatAtmospheres = db
    .prepare(
      `SELECT id AS bot_id, chat_atmosphere_image_id AS image_id
         FROM bots
        WHERE user_id = ? AND chat_atmosphere_image_id IS NOT NULL`,
    )
    .all(userId) as Array<{ bot_id: string; image_id: string }>;
  for (const row of chatAtmospheres) {
    associate(row.image_id, row.bot_id, "owner");
  }

  // Signal artwork belongs to the exact saved show host. Include every stored
  // artwork pointer, including derived microphone masks and the show logo.
  if (tableExists(db, "botcast_shows")) {
    const shows = db
      .prepare(
        `SELECT host_bot_id, atmosphere_json
           FROM botcast_shows
          WHERE user_id = ?`,
      )
      .all(userId) as Array<{
      host_bot_id: string;
      atmosphere_json: string | null;
    }>;
    const signalArtworkPaths = [
      ["imageId"],
      ["dayAtmosphere", "imageId"],
      ["nightAtmosphere", "imageId"],
      ["dayAtmosphere", "microphoneTintMaskImageId"],
      ["nightAtmosphere", "microphoneTintMaskImageId"],
      ["studioLighting", "imageId"],
      ["logo", "imageId"],
    ] as const;
    for (const show of shows) {
      const atmosphere = parseJsonObject(show.atmosphere_json);
      for (const path of signalArtworkPaths) {
        associate(
          readNestedString(atmosphere, path),
          show.host_bot_id,
          "owner",
        );
      }
    }
  }

  // Saved library rooms and Coffee groups associate their exact atmosphere
  // image with the exact current member/seat IDs. Empty seats are ignored.
  if (
    tableExists(db, "library_groups") &&
    tableExists(db, "library_group_members")
  ) {
    const memberships = db
      .prepare(
        `SELECT groups.atmosphere_json, members.bot_id
           FROM library_groups groups
           JOIN library_group_members members
             ON members.user_id = groups.user_id
            AND members.group_id = groups.id
          WHERE groups.user_id = ?`,
      )
      .all(userId) as Array<{
      atmosphere_json: string | null;
      bot_id: string;
    }>;
    for (const membership of memberships) {
      associate(
        readNestedString(parseJsonObject(membership.atmosphere_json), [
          "imageId",
        ]),
        membership.bot_id,
        "participant",
      );
    }
  }
  if (
    tableExists(db, "coffee_groups") &&
    tableExists(db, "coffee_group_seats")
  ) {
    const seats = db
      .prepare(
        `SELECT groups.atmosphere_json, seats.bot_id
           FROM coffee_groups groups
           JOIN coffee_group_seats seats
             ON seats.user_id = groups.user_id
            AND seats.group_id = groups.id
          WHERE groups.user_id = ? AND seats.bot_id IS NOT NULL`,
      )
      .all(userId) as Array<{
      atmosphere_json: string | null;
      bot_id: string;
    }>;
    for (const seat of seats) {
      associate(
        readNestedString(parseJsonObject(seat.atmosphere_json), ["imageId"]),
        seat.bot_id,
        "participant",
      );
    }
  }

  // Debate exhibit sprites are attached to a frozen session by imageId. Link
  // them to the exact frozen moderator, advocates, and jurors in that snapshot.
  if (tableExists(db, "debate_sessions")) {
    const sessions = db
      .prepare(
        `SELECT session_json
           FROM debate_sessions
          WHERE user_id = ?`,
      )
      .all(userId) as Array<{ session_json: string }>;
    for (const row of sessions) {
      const session = parseJsonObject(row.session_json);
      const participantBotIds = new Set<string>();
      for (const path of [
        ["moderator", "id"],
        ["forAdvocate", "id"],
        ["againstAdvocate", "id"],
      ] as const) {
        const botId = readNestedString(session, path);
        if (botId) participantBotIds.add(botId);
      }
      for (const juror of readNestedArray(session, ["jury", "jurors"])) {
        const botId = exactRecordId(juror);
        if (botId) participantBotIds.add(botId);
      }
      for (const exhibit of readNestedArray(session, ["evidence", "exhibits"])) {
        if (!exhibit || typeof exhibit !== "object" || Array.isArray(exhibit)) {
          continue;
        }
        const imageId = (exhibit as Record<string, unknown>).imageId;
        if (typeof imageId !== "string" || !imageId.trim()) continue;
        for (const botId of participantBotIds) {
          associate(imageId, botId, "participant");
        }
      }
    }
  }
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
       updated_at = CASE
         WHEN image_asset_sets.updated_at > excluded.updated_at
           THEN image_asset_sets.updated_at
         ELSE excluded.updated_at
       END`,
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

  const groupRooms = db
    .prepare(
      `SELECT id, name, atmosphere_json
         FROM library_groups
        WHERE user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    atmosphere_json: string;
  }>;
  for (const group of groupRooms) {
    const state = parseJsonObject(group.atmosphere_json);
    merge(readNestedString(state, ["imageId"]), {
      title: `${group.name} room`,
      tags: [group.name],
      data: { groupId: group.id, groupName: group.name },
    });
  }

  const coffeeGroups = db
    .prepare(
      `SELECT id, name, atmosphere_json
         FROM coffee_groups
        WHERE user_id = ? AND atmosphere_json IS NOT NULL`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    atmosphere_json: string;
  }>;
  for (const group of coffeeGroups) {
    const state = parseJsonObject(group.atmosphere_json);
    merge(readNestedString(state, ["imageId"]), {
      title: `${group.name} atmosphere`,
      tags: [group.name],
      data: { coffeeGroupId: group.id, groupName: group.name },
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
      title: "Prism Session Atmosphere",
      tags: [row.display_name, "Prism", "session"],
      data: { surface: "prism" },
    });
  }
  for (const row of db
    .prepare(
      `SELECT id, name, chat_atmosphere_image_id
         FROM bots
        WHERE user_id = ? AND chat_atmosphere_image_id IS NOT NULL`,
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    chat_atmosphere_image_id: string;
  }>) {
    merge(row.chat_atmosphere_image_id, {
      title: `${row.name} Chat Atmosphere`,
      tags: [row.name, "chat", "atmosphere"],
      data: { surface: "chat", botId: row.id },
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
       JOIN image_asset_sets sets
         ON sets.user_id = ?
        AND sets.id = items.set_id
       JOIN images
         ON images.user_id = sets.user_id
        AND images.id = items.image_id
      WHERE items.set_id = ? ORDER BY items.ordinal`,
  );
  const insert = db.prepare(
    `INSERT INTO image_asset_search
       (set_id, user_id, kind, title, tags, context, prompts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const set of sets) {
    const prompts = promptRows.all(userId, set.id) as Array<{
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
  let state: { dirty: number | bigint } | undefined;
  try {
    state = db
      .prepare("SELECT dirty FROM image_asset_catalog_state WHERE user_id = ?")
      .get(userId) as { dirty: number | bigint } | undefined;
  } catch {
    // Existing databases create the state table during their first
    // reconciliation. Clean reads thereafter pay only the indexed lookup.
  }
  if (state && Number(state.dirty) === 0) return;
  ensureImageAssetLibrarySchema(db);
  rebuildImageBotAssociations(db, userId);
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
  const alreadyCataloged = new Map(
    (
      db.prepare(
        `SELECT items.image_id, items.set_id
           FROM image_asset_set_items items
           JOIN image_asset_sets sets ON sets.id = items.set_id
          WHERE sets.user_id = ?`,
      ).all(userId) as Array<{ image_id: string; set_id: string }>
    ).map((row) => [row.image_id, row.set_id] as const),
  );
  for (const image of images) {
    if (consumed.has(image.id)) continue;
    const kind = imageAssetKindForImage(image);
    if (!kind) continue;
    const context = contexts.get(image.id) ?? { tags: [], data: {} };
    const botName = image.bot_id ? botNames.get(image.bot_id) : undefined;
    const existingSetId = alreadyCataloged.get(image.id);
    if (existingSetId) {
      const existing = db
        .prepare(
          `SELECT sets.automatic_tags_json, sets.source_context_json,
                  COUNT(items.image_id) AS member_count
             FROM image_asset_sets sets
             JOIN image_asset_set_items items ON items.set_id = sets.id
            WHERE sets.id = ? AND sets.user_id = ?
            GROUP BY sets.id`,
        )
        .get(existingSetId, userId) as
        | {
            automatic_tags_json: string;
            source_context_json: string;
            member_count: number | bigint;
          }
        | undefined;
      if (!existing || Number(existing.member_count) !== 1) continue;
      const automaticTags = normalizeTags([
        ...parseStringArray(existing.automatic_tags_json),
        ...context.tags,
        botName,
        image.prompt,
        image.revised_prompt,
      ]);
      const sourceContext =
        Object.keys(context.data).length > 0
          ? context.data
          : parseJsonObject(existing.source_context_json);
      db.prepare(
        `UPDATE image_asset_sets
            SET kind = ?,
                status = ?,
                title = COALESCE(?, title),
                source_context_json = ?,
                automatic_tags_json = ?
          WHERE id = ? AND user_id = ?`,
      ).run(
        kind,
        kind === "signal_studio" ? "incomplete" : "ready",
        context.title ?? null,
        JSON.stringify(sourceContext),
        JSON.stringify(automaticTags),
        existingSetId,
        userId,
      );
      db.prepare(
        `UPDATE image_asset_set_items SET role = ?
          WHERE set_id = ? AND image_id = ?`,
      ).run(imageAssetMemberRoleForImage(image), existingSetId, image.id);
      continue;
    }
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
      automaticTags: heuristicSmartTags({
        kind,
        title:
          context.title ??
          titleFromPrompt(image.prompt, IMAGE_ASSET_KIND_LABELS[kind].replace(/s$/u, "")),
        prompt: image.prompt,
        revisedPrompt: image.revised_prompt,
        extra: [...context.tags, botName ?? ""],
      }),
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
  db.prepare(
    `INSERT INTO image_asset_catalog_state (user_id, dirty)
     VALUES (?, 0)
     ON CONFLICT(user_id) DO UPDATE SET
       dirty = 0`,
  ).run(userId);
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
      `SELECT items.set_id, items.image_id
         FROM image_asset_set_items items
         JOIN image_asset_sets sets
           ON sets.user_id = ?
          AND sets.id = items.set_id
         JOIN images
           ON images.user_id = sets.user_id
          AND images.id = items.image_id
        WHERE items.set_id IN (${setIds.map(() => "?").join(",")})`,
    )
    .all(userId, ...setIds) as Array<{ set_id: string; image_id: string }>;
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
  userId: string,
  setIds: readonly string[],
): Map<string, ImageAssetMember[]> {
  if (setIds.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT items.set_id, items.role, images.id, images.prompt,
              images.revised_prompt, images.url, images.provider, images.model,
              images.size, images.local_rel_path, images.created_at,
              sets.updated_at AS set_updated_at
         FROM image_asset_set_items items
         JOIN image_asset_sets sets
           ON sets.user_id = ?
          AND sets.id = items.set_id
         JOIN images
           ON images.user_id = sets.user_id
          AND images.id = items.image_id
        WHERE items.set_id IN (${setIds.map(() => "?").join(",")})
        ORDER BY items.set_id, items.ordinal, images.id`,
    )
    .all(userId, ...setIds) as Array<{
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
    set_updated_at: string;
  }>;
  const result = new Map<string, ImageAssetMember[]>();
  for (const row of rows) {
    const version = encodeURIComponent(row.set_updated_at);
    const member: ImageAssetMember = {
      imageId: row.id,
      role: row.role,
      url: row.local_rel_path
        ? `/api/images/${encodeURIComponent(row.id)}/file?v=${version}`
        : row.url,
      thumbnailUrl: row.local_rel_path
        ? `/api/images/${encodeURIComponent(row.id)}/thumb?v=${version}`
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

function magentaRevisionStateForSets(
  db: DatabaseSync,
  userId: string,
  setIds: readonly string[],
): Map<string, number> {
  if (setIds.length === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT set_id, COUNT(*) AS pass_count
         FROM image_asset_magenta_revisions
        WHERE user_id = ?
          AND status = 'committed'
          AND set_id IN (${setIds.map(() => "?").join(",")})
        GROUP BY set_id`,
    )
    .all(userId, ...setIds) as Array<{
    set_id: string;
    pass_count: number | bigint;
  }>;
  return new Map(
    rows.map((row) => [row.set_id, Number(row.pass_count)] as const),
  );
}

function usageHrefForKind(kind: ImageAssetKind): string | null {
  const destinations: Partial<Record<ImageAssetKind, string>> = {
    debate_exhibit: "/?view=debate",
    signal_studio: "/?view=signal",
    signal_logo: "/?view=signal",
    slate_cover: "/?view=slate",
    slate_visual_study: "/?view=slate",
    zen_atmosphere: "/?view=zen",
    home_atmosphere: "/?view=chat",
    group_room_atmosphere: "/?view=chat",
  };
  return destinations[kind] ?? null;
}

function navigableUsage(
  usage: readonly ImageAssetUsage[],
  kind: ImageAssetKind,
): ImageAssetUsage[] {
  const href = usageHrefForKind(kind);
  return usage.map((item) => ({
    ...item,
    ...(href ? { href } : {}),
  }));
}

function mapAssetSetRows(
  db: DatabaseSync,
  userId: string,
  rows: readonly AssetSetRow[],
): ImageAssetSet[] {
  const ids = rows.map((row) => row.id);
  const members = membersForSets(db, userId, ids);
  const usage = usageForSets(db, userId, ids);
  const magentaRevisionState = magentaRevisionStateForSets(db, userId, ids);
  const capabilityCards = itemCapabilityCardsForAssetSets(
    db,
    userId,
    rows.flatMap((row) =>
      isImageAssetKind(row.kind)
        ? [{ id: row.id, kind: row.kind as ImageAssetKind }]
        : [],
    ),
  );
  return rows.map((row) => {
    const kind = row.kind as ImageAssetKind;
    const setUsage = navigableUsage(usage.get(row.id) ?? [], kind);
    const accessCount = Number(row.access_count ?? 0);
    const reuseScore = Math.max(Number(row.reuse_score ?? 0), accessCount);
    return {
      id: row.id,
      kind,
      status: row.status as ImageAssetSetStatus,
      title: row.title,
      source: row.source as ImageAssetSource,
      sourceContext: parseJsonObject(row.source_context_json),
      automaticTags: parseStringArray(row.automatic_tags_json),
      playerTags: parseStringArray(row.player_tags_json),
      storageTier: row.storage_tier === "cold" ? "cold" : "hot",
      accessCount,
      lastAccessedAt: row.last_accessed_at ?? null,
      reuseScore,
      compressUndoAvailable: Number(row.compress_undo_available ?? 0) > 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      usageCount: setUsage.length,
      usage: setUsage,
      members: members.get(row.id) ?? [],
      magentaPassCount: magentaRevisionState.get(row.id) ?? 0,
      magentaUndoAvailable: (magentaRevisionState.get(row.id) ?? 0) > 0,
      capabilityCard: capabilityCards.get(row.id) ?? null,
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
  if (options.botId?.trim()) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM image_asset_set_items bot_items
        JOIN image_bot_associations bot_associations
          ON bot_associations.image_id = bot_items.image_id
         AND bot_associations.user_id = sets.user_id
       WHERE bot_items.set_id = sets.id
         AND bot_associations.bot_id = ?
    )`);
    params.push(options.botId.trim());
  }
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
  const fetchAllForUsageFilter = options.usage === "used" || options.usage === "unused";
  const rows = db
    .prepare(
      `SELECT sets.* FROM image_asset_sets sets ${join}
        WHERE ${clauses.join(" AND ")}
        ORDER BY ${contextRank} ${relevance} sets.updated_at DESC, sets.id DESC
        ${fetchAllForUsageFilter ? "" : "LIMIT ? OFFSET ?"}`,
    )
    .all(
      ...params,
      ...(fetchAllForUsageFilter ? [] : [limit + 1, offset]),
    ) as unknown as AssetSetRow[];
  const mapped = mapAssetSetRows(db, userId, rows);
  const filtered =
    options.usage === "used"
      ? mapped.filter((asset) => asset.usageCount > 0)
      : options.usage === "unused"
        ? mapped.filter((asset) => asset.usageCount === 0)
        : mapped;
  const assets = fetchAllForUsageFilter
    ? filtered.slice(offset, offset + limit)
    : filtered.slice(0, limit);
  const hasMore = fetchAllForUsageFilter
    ? filtered.length > offset + limit
    : rows.length > limit;
  return {
    assets,
    nextCursor: hasMore ? cursorForOffset(offset + limit) : null,
  };
}

/**
 * Returns the primary transparent Item members with the metadata needed for a
 * downstream semantic match. It never reads image bytes or mutates a case.
 */
export function listImageAssetItemReuseCandidates(
  db: DatabaseSync,
  userId: string,
  limit = 80,
): ImageAssetItemReuseCandidate[] {
  synchronizeImageAssetCatalog(db, userId);
  const boundedLimit = Math.min(160, Math.max(1, Math.floor(limit)));
  const rows = db.prepare(
    `SELECT sets.id AS asset_set_id, sets.title, sets.automatic_tags_json,
            sets.player_tags_json, sets.source_context_json, images.id AS image_id,
            images.local_rel_path, images.prompt, images.revised_prompt,
            images.created_at
       FROM image_asset_sets AS sets
       JOIN image_asset_set_items AS items ON items.set_id = sets.id
       JOIN images ON images.id = items.image_id AND images.user_id = sets.user_id
      WHERE sets.user_id = ?
        AND sets.kind = 'item'
        AND sets.status = 'ready'
        AND items.role = 'primary'
        AND TRIM(COALESCE(images.local_rel_path, '')) <> ''
      ORDER BY sets.updated_at DESC, sets.id DESC
      LIMIT ?`,
  ).all(userId, boundedLimit) as Array<{
    asset_set_id: string;
    title: string;
    automatic_tags_json: string;
    player_tags_json: string;
    source_context_json: string;
    image_id: string;
    local_rel_path: string;
    prompt: string;
    revised_prompt: string | null;
    created_at: string;
  }>;
  return rows.map((row) => ({
    assetSetId: row.asset_set_id,
    imageId: row.image_id,
    localRelPath: row.local_rel_path,
    title: row.title,
    prompt: row.prompt,
    revisedPrompt: row.revised_prompt,
    automaticTags: parseStringArray(row.automatic_tags_json),
    playerTags: parseStringArray(row.player_tags_json),
    sourceContext: parseJsonObject(row.source_context_json),
    createdAt: row.created_at,
  }));
}

export function getBotImageAssetLibraryIndex(
  db: DatabaseSync,
  userId: string,
  botId: string,
  limitPerKind = 6,
): BotImageAssetLibraryIndex {
  synchronizeImageAssetCatalog(db, userId);
  const limit = Number.isFinite(limitPerKind)
    ? Math.min(12, Math.max(1, Math.floor(limitPerKind)))
    : 6;
  const countRows = db
    .prepare(
      `SELECT sets.kind, COUNT(DISTINCT sets.id) AS total_count
         FROM image_asset_sets sets
        WHERE sets.user_id = ?
          AND sets.status = 'ready'
          AND EXISTS (
            SELECT 1
              FROM image_asset_set_items bot_items
              JOIN image_bot_associations bot_associations
                ON bot_associations.image_id = bot_items.image_id
               AND bot_associations.user_id = sets.user_id
             WHERE bot_items.set_id = sets.id
               AND bot_associations.bot_id = ?
          )
        GROUP BY sets.kind`,
    )
    .all(userId, botId) as Array<{
    kind: string;
    total_count: number | bigint;
  }>;
  const totals = new Map(
    countRows
      .filter((row) => isImageAssetKind(row.kind))
      .map((row) => [row.kind as ImageAssetKind, Number(row.total_count)] as const),
  );
  const recentRows = db.prepare(
    `SELECT sets.*
       FROM image_asset_sets sets
      WHERE sets.user_id = ?
        AND sets.kind = ?
        AND sets.status = 'ready'
        AND EXISTS (
          SELECT 1
            FROM image_asset_set_items bot_items
            JOIN image_bot_associations bot_associations
              ON bot_associations.image_id = bot_items.image_id
             AND bot_associations.user_id = sets.user_id
           WHERE bot_items.set_id = sets.id
             AND bot_associations.bot_id = ?
        )
      ORDER BY sets.updated_at DESC, sets.id DESC
      LIMIT ?`,
  );
  return {
    botId,
    sections: BOT_IMAGE_ASSET_LIBRARY_KIND_ORDER.flatMap((kind) => {
      const totalCount = totals.get(kind) ?? 0;
      if (totalCount === 0) return [];
      const rows = recentRows.all(userId, kind, botId, limit) as unknown as AssetSetRow[];
      return [{
        kind,
        totalCount,
        assets: mapAssetSetRows(db, userId, rows),
      }];
    }),
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

export function getImageAssetSet(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
): ImageAssetSet | null {
  synchronizeImageAssetCatalog(db, userId);
  const row = db
    .prepare("SELECT * FROM image_asset_sets WHERE id = ? AND user_id = ?")
    .get(assetSetId, userId) as unknown as AssetSetRow | undefined;
  return row ? mapAssetSetRows(db, userId, [row])[0] ?? null : null;
}

export function getImageAssetSetForCatalog(
  db: DatabaseSync,
  userId: string,
  assetSetId: string,
  options: Pick<
    ListImageAssetCatalogOptions,
    "kind" | "botId" | "includeIncomplete"
  >,
): ImageAssetSet | null {
  if (!isImageAssetKind(options.kind)) {
    throw new ImageAssetLibraryError("invalid", "Choose a recognized asset kind.");
  }
  synchronizeImageAssetCatalog(db, userId);
  const clauses = ["sets.id = ?", "sets.user_id = ?", "sets.kind = ?"];
  const params: string[] = [assetSetId, userId, options.kind];
  if (!options.includeIncomplete) clauses.push("sets.status = 'ready'");
  if (options.botId?.trim()) {
    clauses.push(`EXISTS (
      SELECT 1
        FROM image_asset_set_items bot_items
        JOIN image_bot_associations bot_associations
          ON bot_associations.image_id = bot_items.image_id
         AND bot_associations.user_id = sets.user_id
       WHERE bot_items.set_id = sets.id
         AND bot_associations.bot_id = ?
    )`);
    params.push(options.botId.trim());
  }
  const row = db
    .prepare(`SELECT sets.* FROM image_asset_sets sets WHERE ${clauses.join(" AND ")}`)
    .get(...params) as unknown as AssetSetRow | undefined;
  return row ? mapAssetSetRows(db, userId, [row])[0] ?? null : null;
}

export function getImageAssetSetForImage(
  db: DatabaseSync,
  userId: string,
  imageId: string,
): ImageAssetSet | null {
  synchronizeImageAssetCatalog(db, userId);
  const row = db
    .prepare(
      `SELECT sets.*
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
        WHERE sets.user_id = ? AND items.image_id = ?`,
    )
    .get(userId, imageId) as unknown as AssetSetRow | undefined;
  return row ? mapAssetSetRows(db, userId, [row])[0] ?? null : null;
}

/** Finds a tenant-owned asset of the requested kind from exact upload bytes. */
export function getImageAssetSetForContentSha256(
  db: DatabaseSync,
  userId: string,
  kind: ImageAssetKind,
  contentSha256: string,
): ImageAssetSet | null {
  if (!/^[a-f0-9]{64}$/u.test(contentSha256)) return null;
  synchronizeImageAssetCatalog(db, userId);
  const findRow = (): AssetSetRow | undefined =>
    db.prepare(
      `SELECT sets.*
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
         JOIN images ON images.id = items.image_id
        WHERE sets.user_id = ?
          AND sets.kind = ?
          AND images.content_sha256 = ?
        LIMIT 1`,
    ).get(userId, kind, contentSha256) as unknown as AssetSetRow | undefined;
  let row = findRow();
  if (!row) {
    const legacyMembers = db
      .prepare(
        `SELECT images.id, images.local_rel_path
           FROM image_asset_sets sets
           JOIN image_asset_set_items items ON items.set_id = sets.id
           JOIN images ON images.id = items.image_id
          WHERE sets.user_id = ?
            AND sets.kind = ?
            AND images.content_sha256 IS NULL
            AND TRIM(COALESCE(images.local_rel_path, '')) <> ''`,
      )
      .all(userId, kind) as Array<{ id: string; local_rel_path: string }>;
    for (const member of legacyMembers) {
      try {
        const storedSha256 = createHash("sha256")
          .update(readGeneratedImageBytes(member.local_rel_path))
          .digest("hex");
        if (storedSha256 !== contentSha256) continue;
        db.prepare(
          `UPDATE images
              SET content_sha256 = ?
            WHERE id = ? AND user_id = ? AND content_sha256 IS NULL`,
        ).run(contentSha256, member.id, userId);
        row = findRow();
        if (row) break;
      } catch {
        // Missing or quarantined legacy files are not eligible for exact reuse.
      }
    }
  }
  return row ? mapAssetSetRows(db, userId, [row])[0] ?? null : null;
}

export function imageAssetStorageSummary(
  db: DatabaseSync,
  userId: string,
): ImageAssetStorageSummary {
  synchronizeImageAssetCatalog(db, userId);
  const rows = db
    .prepare(
      `SELECT images.id, images.local_rel_path, images.provider, images.origin, sets.kind
         FROM images
         LEFT JOIN image_asset_set_items items ON items.image_id = images.id
         LEFT JOIN image_asset_sets sets ON sets.id = items.set_id
        WHERE images.user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    local_rel_path: string | null;
    provider: string;
    origin: string | null;
    kind: ImageAssetKind | null;
  }>;
  const seenPaths = new Set<string>();
  const kindTotals = new Map<ImageAssetKind, number>();
  let activeBytes = 0;
  let generatedBytes = 0;
  let uploadedBytes = 0;
  let systemManagedBytes = 0;
  let hotBytes = 0;
  let coldBytes = 0;
  for (const row of rows) {
    const path = row.local_rel_path?.trim();
    const bytes = path && !seenPaths.has(path) ? generatedImageStorageSizeBytes(path) : 0;
    if (path) seenPaths.add(path);
    activeBytes += bytes;
    if (path?.endsWith(".cold.webp")) coldBytes += bytes;
    else hotBytes += bytes;
    if (
      row.provider.trim().toLowerCase() === "upload" ||
      (row.origin?.trim().toLowerCase() ?? "").includes("upload") ||
      (row.origin?.trim().toLowerCase() ?? "").includes("import")
    ) uploadedBytes += bytes;
    else generatedBytes += bytes;
    if (!row.kind) {
      systemManagedBytes += bytes;
      continue;
    }
    kindTotals.set(row.kind, (kindTotals.get(row.kind) ?? 0) + bytes);
  }
  const kindCounts = new Map(
    (
      db
        .prepare(
          `SELECT kind, COUNT(*) AS count
             FROM image_asset_sets
            WHERE user_id = ?
            GROUP BY kind`,
        )
        .all(userId) as Array<{
        kind: ImageAssetKind;
        count: number | bigint;
      }>
    ).map((row) => [row.kind, Number(row.count)] as const),
  );
  const revisionBytes = Number(
    (
      db
        .prepare(
          `SELECT COALESCE(
                    SUM(length(items.ciphertext) + length(items.iv) + length(items.tag)),
                    0
                  ) AS bytes
             FROM image_asset_magenta_revision_items items
             JOIN image_asset_magenta_revisions revisions
               ON revisions.id = items.revision_id
            WHERE revisions.user_id = ? AND revisions.status = 'committed'`,
        )
        .get(userId) as { bytes: number | bigint }
    ).bytes,
  );
  let compressUndoBytes = 0;
  const undoPaths = db
    .prepare(
      `SELECT images.local_rel_path
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
         JOIN images ON images.id = items.image_id
        WHERE sets.user_id = ? AND sets.compress_undo_available = 1
          AND images.local_rel_path IS NOT NULL`,
    )
    .all(userId) as Array<{ local_rel_path: string }>;
  for (const entry of undoPaths) {
    try {
      const undoRel = buildGeneratedImageCompressUndoRelativePath(
        entry.local_rel_path.trim(),
      );
      const absolute = resolveAbsoluteUnderDataRoot(undoRel);
      if (existsSync(absolute)) compressUndoBytes += statSync(absolute).size;
    } catch {
      // ignore invalid paths
    }
  }
  return {
    activeBytes: activeBytes + revisionBytes,
    recoveryTrashBytes: listGeneratedImageRecoveryBatchesForUser(userId).reduce(
      (total, batch) => total + batch.sizeBytes,
      0,
    ),
    revisionBytes,
    generatedBytes,
    uploadedBytes,
    systemManagedBytes,
    hotBytes,
    coldBytes,
    compressRevisionBytes: compressUndoBytes,
    totalAssetCount: Number(
      (
        db.prepare("SELECT COUNT(*) AS count FROM image_asset_sets WHERE user_id = ?")
          .get(userId) as { count: number | bigint }
      ).count,
    ),
    byKind: IMAGE_ASSET_KINDS.map((kind) => ({
      kind,
      bytes: kindTotals.get(kind) ?? 0,
      count: kindCounts.get(kind) ?? 0,
    })),
  };
}

export function imageAssetSelectionStorageBytes(
  db: DatabaseSync,
  userId: string,
  assetSetIds: readonly string[],
): number {
  const ids = [...new Set(assetSetIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  if (ids.length > 1_000) {
    throw new ImageAssetLibraryError(
      "invalid",
      "Too many visible asset sets were supplied.",
    );
  }
  synchronizeImageAssetCatalog(db, userId);
  const rows = db
    .prepare(
      `SELECT DISTINCT images.local_rel_path
         FROM image_asset_sets sets
         JOIN image_asset_set_items items ON items.set_id = sets.id
         JOIN images ON images.id = items.image_id
        WHERE sets.user_id = ?
          AND sets.id IN (${ids.map(() => "?").join(",")})
          AND images.local_rel_path IS NOT NULL`,
    )
    .all(userId, ...ids) as Array<{ local_rel_path: string }>;
  return rows.reduce(
    (total, row) =>
      total + generatedImageStorageSizeBytes(row.local_rel_path.trim()),
    0,
  );
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
  if (set.source === "legacy") {
    throw new ImageAssetLibraryError(
      "unsafe",
      "Unmatched legacy sets stay protected until their membership is verified.",
    );
  }
  const rows = db
    .prepare(
      `SELECT images.* FROM image_asset_set_items items
         JOIN image_asset_sets sets
           ON sets.user_id = ?
          AND sets.id = items.set_id
         JOIN images
           ON images.user_id = sets.user_id
          AND images.id = items.image_id
        WHERE items.set_id = ? ORDER BY items.ordinal`,
    )
    .all(userId, assetSetId) as unknown as CatalogImageRow[];
  const itemMetadata = db
    .prepare(
      `SELECT items.image_id, items.role, items.ordinal
         FROM image_asset_set_items items
         JOIN image_asset_sets sets
           ON sets.user_id = ?
          AND sets.id = items.set_id
        WHERE items.set_id = ? ORDER BY items.ordinal, items.image_id`,
    )
    .all(userId, assetSetId) as Array<{
    image_id: string;
    role: string;
    ordinal: number | bigint;
  }>;
  const usage = navigableUsage(
    usageForSets(db, userId, [assetSetId]).get(assetSetId) ?? [],
    set.kind as ImageAssetKind,
  );
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
    paths.some((path, index) => {
      const imageId = rows[index]!.id;
      const hot = `generated-images/${userId}/${imageId}.png`;
      const cold = `generated-images/${userId}/${imageId}.cold.webp`;
      return !path || (path !== hot && path !== cold);
    })
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
    const recheckedUsage = navigableUsage(
      usageForSets(db, userId, [assetSetId]).get(assetSetId) ?? [],
      set.kind as ImageAssetKind,
    );
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
