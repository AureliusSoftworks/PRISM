import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_LIBRARY_GROUP_MEMBER_MAX,
  PRISM_ORCHESTRATION_VERSION,
  normalizePrismJsonObject,
  type PrismEntityReferenceV1,
  type PrismJsonObject,
} from "@localai/shared";
import { randomId } from "./security.ts";

export const LIBRARY_FAVORITES_GROUP_ID = "builtin:favorites";
export const LIBRARY_GROUP_MEMBER_LIMIT = BOT_LIBRARY_GROUP_MEMBER_MAX;
const LIBRARY_GROUP_LIMIT = 100;

export interface LibraryGroupV1 {
  id: string;
  name: string;
  description: string;
  botIds: string[];
  roomAtmosphere?: PrismJsonObject;
  marketplaceThemeId?: string | null;
  glyph?: { version: 1; seed: string } | null;
  leaderBotId?: string | null;
  deleteProtected: boolean;
  deleteProtectionByBotId: Record<string, boolean | null>;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LibraryGroupRow {
  id: string;
  name: string;
  description: string;
  delete_protected_default: number;
  built_in: number;
  marketplace_theme_id: string | null;
  atmosphere_json: string;
  glyph_json: string;
  leader_bot_id: string | null;
  created_at: string;
  updated_at: string;
}

interface LibraryMemberRow {
  group_id: string;
  bot_id: string;
  delete_protected_override: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function parseJsonObject(value: string): PrismJsonObject {
  try {
    return normalizePrismJsonObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function normalizeGlyph(value: unknown): { version: 1; seed: string } | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const seed = boundedText(value.seed, 160);
  return seed ? { version: 1, seed } : null;
}

function parseGlyph(value: string): { version: 1; seed: string } | null {
  try {
    return normalizeGlyph(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizeLibraryGroups(
  value: unknown,
  validBotIds: ReadonlySet<string>,
  now = new Date(),
): LibraryGroupV1[] {
  const input = Array.isArray(value) ? value : [];
  const byId = new Map<string, LibraryGroupV1>();
  for (const candidate of input.slice(0, LIBRARY_GROUP_LIMIT)) {
    if (!isRecord(candidate)) continue;
    const rawId = boundedText(candidate.id, 160);
    if (!rawId) continue;
    const id =
      rawId === LIBRARY_FAVORITES_GROUP_ID
        ? LIBRARY_FAVORITES_GROUP_ID
        : rawId.startsWith("group:") || rawId.startsWith("starter:")
          ? rawId
          : `group:${randomId()}`;
    const createdAt =
      boundedText(candidate.createdAt, 40) || now.toISOString();
    const updatedAt =
      boundedText(candidate.updatedAt, 40) || now.toISOString();
    const botIds = Array.isArray(candidate.botIds)
      ? Array.from(
          new Set(
            candidate.botIds
              .map((botId) => boundedText(botId, 160))
              .filter((botId) => botId && validBotIds.has(botId)),
          ),
        ).slice(0, LIBRARY_GROUP_MEMBER_LIMIT)
      : [];
    const rawOverrides = isRecord(candidate.deleteProtectionByBotId)
      ? candidate.deleteProtectionByBotId
      : {};
    const deleteProtectionByBotId = Object.fromEntries(
      botIds.map((botId) => [
        botId,
        typeof rawOverrides[botId] === "boolean"
          ? rawOverrides[botId]
          : null,
      ]),
    );
    const atmosphere = normalizePrismJsonObject(candidate.roomAtmosphere);
    const glyph = normalizeGlyph(candidate.glyph);
    const requestedLeaderBotId = boundedText(candidate.leaderBotId, 160);
    const leaderBotId =
      id !== LIBRARY_FAVORITES_GROUP_ID && botIds.includes(requestedLeaderBotId)
      ? requestedLeaderBotId
      : null;
    byId.set(id, {
      id,
      name:
        id === LIBRARY_FAVORITES_GROUP_ID
          ? "Favorites"
          : boundedText(candidate.name, 120) || "Untitled group",
      description:
        id === LIBRARY_FAVORITES_GROUP_ID
          ? "Pinned bots you want to keep close."
          : boundedText(candidate.description, 1_000),
      botIds,
      ...(Object.keys(atmosphere).length > 0
        ? { roomAtmosphere: atmosphere }
        : {}),
      ...(glyph ? { glyph } : {}),
      leaderBotId,
      marketplaceThemeId: boundedText(candidate.marketplaceThemeId, 160) || null,
      deleteProtected: candidate.deleteProtected === true,
      deleteProtectionByBotId,
      builtIn:
        id === LIBRARY_FAVORITES_GROUP_ID || candidate.builtIn === true,
      createdAt,
      updatedAt,
    });
  }
  if (!byId.has(LIBRARY_FAVORITES_GROUP_ID)) {
    const timestamp = now.toISOString();
    byId.set(LIBRARY_FAVORITES_GROUP_ID, {
      id: LIBRARY_FAVORITES_GROUP_ID,
      name: "Favorites",
      description: "Pinned bots you want to keep close.",
      botIds: [],
      marketplaceThemeId: null,
      deleteProtected: false,
      deleteProtectionByBotId: {},
      builtIn: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return Array.from(byId.values()).sort((left, right) => {
    if (left.id === LIBRARY_FAVORITES_GROUP_ID) return -1;
    if (right.id === LIBRARY_FAVORITES_GROUP_ID) return 1;
    return left.name.localeCompare(right.name);
  });
}

function ownedBotIds(db: DatabaseSync, userId: string): Set<string> {
  const rows = db
    .prepare("SELECT id FROM bots WHERE user_id = ?")
    .all(userId) as unknown as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id));
}

export function ensureLibraryFavoritesGroup(
  db: DatabaseSync,
  userId: string,
  now = new Date(),
): void {
  const timestamp = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO library_groups
      (id, user_id, name, description, delete_protected_default, built_in,
       atmosphere_json, glyph_json, created_at, updated_at)
     VALUES (?, ?, 'Favorites', 'Pinned bots you want to keep close.', 0, 1,
             '{}', '{}', ?, ?)`,
  ).run(LIBRARY_FAVORITES_GROUP_ID, userId, timestamp, timestamp);
}

export function listLibraryGroups(
  db: DatabaseSync,
  userId: string,
): LibraryGroupV1[] {
  ensureLibraryFavoritesGroup(db, userId);
  const groups = db
    .prepare(
      `SELECT id, name, description, delete_protected_default, built_in,
              marketplace_theme_id, atmosphere_json, glyph_json, leader_bot_id,
              created_at, updated_at
         FROM library_groups
        WHERE user_id = ?
        ORDER BY built_in DESC, name COLLATE NOCASE`,
    )
    .all(userId) as unknown as LibraryGroupRow[];
  const members = db
    .prepare(
      `SELECT group_id, bot_id, delete_protected_override
         FROM library_group_members
        WHERE user_id = ?
        ORDER BY added_at`,
    )
    .all(userId) as unknown as LibraryMemberRow[];
  const membersByGroup = new Map<string, LibraryMemberRow[]>();
  for (const member of members) {
    const groupMembers = membersByGroup.get(member.group_id) ?? [];
    groupMembers.push(member);
    membersByGroup.set(member.group_id, groupMembers);
  }
  return groups.map((group) => {
    const groupMembers = membersByGroup.get(group.id) ?? [];
    const atmosphere = parseJsonObject(group.atmosphere_json);
    const glyph = parseGlyph(group.glyph_json);
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      botIds: groupMembers.map((member) => member.bot_id),
      ...(Object.keys(atmosphere).length > 0
        ? { roomAtmosphere: atmosphere }
        : {}),
      ...(glyph ? { glyph } : {}),
      leaderBotId: groupMembers.some(
        (member) => member.bot_id === group.leader_bot_id,
      )
        ? group.leader_bot_id
        : null,
      marketplaceThemeId: group.marketplace_theme_id,
      deleteProtected: Boolean(group.delete_protected_default),
      deleteProtectionByBotId: Object.fromEntries(
        groupMembers.map((member) => [
          member.bot_id,
          member.delete_protected_override === null
            ? null
            : Boolean(member.delete_protected_override),
        ]),
      ),
      builtIn: Boolean(group.built_in),
      createdAt: group.created_at,
      updatedAt: group.updated_at,
    };
  });
}

function persistLibraryGroups(
  db: DatabaseSync,
  userId: string,
  groups: LibraryGroupV1[],
): void {
  db.prepare("DELETE FROM library_groups WHERE user_id = ?").run(userId);
  const insertGroup = db.prepare(
    `INSERT INTO library_groups
      (id, user_id, name, description, delete_protected_default, built_in,
       marketplace_theme_id, atmosphere_json, glyph_json, leader_bot_id,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMember = db.prepare(
    `INSERT INTO library_group_members
      (user_id, group_id, bot_id, delete_protected_override, added_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const group of groups) {
    insertGroup.run(
      group.id,
      userId,
      group.name,
      group.description,
      group.deleteProtected ? 1 : 0,
      group.builtIn ? 1 : 0,
      group.marketplaceThemeId ?? null,
      JSON.stringify(group.roomAtmosphere ?? {}),
      JSON.stringify(group.glyph ?? {}),
      group.leaderBotId ?? null,
      group.createdAt,
      group.updatedAt,
    );
    for (const botId of group.botIds) {
      const override = group.deleteProtectionByBotId[botId];
      insertMember.run(
        userId,
        group.id,
        botId,
        typeof override === "boolean" ? (override ? 1 : 0) : null,
        group.createdAt,
        group.updatedAt,
      );
    }
  }
  projectLibraryProtectionToBots(db, userId);
}

export function replaceLibraryGroups(args: {
  db: DatabaseSync;
  userId: string;
  groups: unknown;
  manageTransaction?: boolean;
  now?: Date;
}): LibraryGroupV1[] {
  const groups = normalizeLibraryGroups(
    args.groups,
    ownedBotIds(args.db, args.userId),
    args.now,
  );
  const manageTransaction = args.manageTransaction !== false;
  if (manageTransaction) args.db.exec("BEGIN IMMEDIATE");
  try {
    persistLibraryGroups(args.db, args.userId, groups);
    if (manageTransaction) args.db.exec("COMMIT");
  } catch (error) {
    if (manageTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
  return listLibraryGroups(args.db, args.userId);
}

export function importLegacyLibraryGroupsOnce(args: {
  db: DatabaseSync;
  userId: string;
  sourceKey: string;
  groups: unknown;
  now?: Date;
}): { imported: boolean; groups: LibraryGroupV1[] } {
  const existing = args.db
    .prepare(
      "SELECT 1 FROM library_group_imports WHERE user_id = ? AND source_key = ?",
    )
    .get(args.userId, args.sourceKey);
  if (existing) return { imported: false, groups: listLibraryGroups(args.db, args.userId) };
  const payload = JSON.stringify(args.groups ?? []);
  const payloadHash = createHash("sha256").update(payload).digest("hex");
  const now = args.now ?? new Date();
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const currentNonFavoriteCount = (
      args.db
        .prepare(
          `SELECT COUNT(*) AS count
             FROM library_groups
            WHERE user_id = ? AND id <> ?`,
        )
        .get(args.userId, LIBRARY_FAVORITES_GROUP_ID) as { count: number }
    ).count;
    if (currentNonFavoriteCount === 0) {
      const groups = normalizeLibraryGroups(
        args.groups,
        ownedBotIds(args.db, args.userId),
        now,
      );
      persistLibraryGroups(args.db, args.userId, groups);
    }
    args.db
      .prepare(
        `INSERT INTO library_group_imports
          (user_id, source_key, payload_hash, imported_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(args.userId, args.sourceKey, payloadHash, now.toISOString());
    args.db.exec("COMMIT");
    return { imported: true, groups: listLibraryGroups(args.db, args.userId) };
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }
}

export function projectLibraryProtectionToBots(
  db: DatabaseSync,
  userId: string,
): void {
  db.prepare(
    `UPDATE bots
        SET delete_protected = CASE
          WHEN EXISTS (
            SELECT 1
              FROM library_group_members AS member
              JOIN library_groups AS library_group
                ON library_group.user_id = member.user_id
               AND library_group.id = member.group_id
             WHERE member.user_id = bots.user_id
               AND member.bot_id = bots.id
               AND COALESCE(
                 member.delete_protected_override,
                 library_group.delete_protected_default
               ) = 1
          ) THEN 1
          ELSE 0
        END
      WHERE user_id = ?`,
  ).run(userId);
}

export function setLibraryFavorites(args: {
  db: DatabaseSync;
  userId: string;
  botIds: readonly string[];
  favorite: boolean;
  now?: Date;
}): {
  previousBotIds: string[];
  groups: LibraryGroupV1[];
  entities: PrismEntityReferenceV1[];
} {
  ensureLibraryFavoritesGroup(args.db, args.userId, args.now);
  const validBotIds = ownedBotIds(args.db, args.userId);
  const botIds = Array.from(
    new Set(args.botIds.filter((botId) => validBotIds.has(botId))),
  ).slice(0, LIBRARY_GROUP_MEMBER_LIMIT);
  const previousBotIds = listLibraryGroups(args.db, args.userId).find(
    (group) => group.id === LIBRARY_FAVORITES_GROUP_ID,
  )?.botIds ?? [];
  const timestamp = (args.now ?? new Date()).toISOString();
  const insert = args.db.prepare(
    `INSERT OR IGNORE INTO library_group_members
      (user_id, group_id, bot_id, delete_protected_override, added_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?)`,
  );
  const remove = args.db.prepare(
    `DELETE FROM library_group_members
      WHERE user_id = ? AND group_id = ? AND bot_id = ?`,
  );
  for (const botId of botIds) {
    if (args.favorite) {
      insert.run(
        args.userId,
        LIBRARY_FAVORITES_GROUP_ID,
        botId,
        timestamp,
        timestamp,
      );
    } else {
      remove.run(args.userId, LIBRARY_FAVORITES_GROUP_ID, botId);
    }
  }
  return {
    previousBotIds,
    groups: listLibraryGroups(args.db, args.userId),
    entities: botIds.map((botId) => ({
      schemaVersion: PRISM_ORCHESTRATION_VERSION,
      entityType: "bot",
      id: botId,
      label: botId,
      revision: null,
    })),
  };
}

export function setLibraryMembershipProtection(args: {
  db: DatabaseSync;
  userId: string;
  groupId: string;
  botIds?: readonly string[];
  protected: boolean;
  now?: Date;
}): {
  previous: Record<string, boolean | null>;
  groups: LibraryGroupV1[];
} {
  const group = listLibraryGroups(args.db, args.userId).find(
    (candidate) => candidate.id === args.groupId,
  );
  if (!group) throw new Error("Library group not found.");
  const targetIds = new Set(
    (args.botIds && args.botIds.length > 0 ? args.botIds : group.botIds).filter(
      (botId) => group.botIds.includes(botId),
    ),
  );
  const previous: Record<string, boolean | null> = {};
  const update = args.db.prepare(
    `UPDATE library_group_members
        SET delete_protected_override = ?, updated_at = ?
      WHERE user_id = ? AND group_id = ? AND bot_id = ?`,
  );
  const timestamp = (args.now ?? new Date()).toISOString();
  for (const botId of targetIds) {
    previous[botId] = group.deleteProtectionByBotId[botId] ?? null;
    update.run(
      args.protected ? 1 : 0,
      timestamp,
      args.userId,
      group.id,
      botId,
    );
  }
  projectLibraryProtectionToBots(args.db, args.userId);
  return { previous, groups: listLibraryGroups(args.db, args.userId) };
}
