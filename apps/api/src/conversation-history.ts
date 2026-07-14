import type {
  ConversationHistoryEntry,
  ConversationHistoryOriginKind,
} from "@localai/shared";
import type { DatabaseSync } from "node:sqlite";
import type { ConversationHubMetadata } from "./conversation-hubs.ts";

export interface ConversationHistoryRow {
  id: string;
  conversation_mode?: string | null;
  bot_id?: string | null;
  bot_group_ids?: string | null;
  coffee_group_id?: string | null;
  parent_id?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BuildConversationHistoryEntryOptions {
  hubMetadata?: ConversationHubMetadata | null;
  participantBotIds?: readonly (string | null | undefined)[];
  continuationConversationId?: string | null;
}

function normalizedIds(values: readonly (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const value of values) {
    const id = typeof value === "string" ? value.trim() : "";
    if (id) ids.add(id);
  }
  return [...ids];
}

function parseStoredBotIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? normalizedIds(
          parsed.map((value) => (typeof value === "string" ? value : null))
        )
      : [];
  } catch {
    return [];
  }
}

export function loadConversationParticipantBotIdsMap(
  db: DatabaseSync,
  userId: string,
  conversationIds: readonly string[]
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (conversationIds.length === 0) return result;
  const placeholders = conversationIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT conversation_id, bot_id
         FROM messages
        WHERE user_id = ?
          AND bot_id IS NOT NULL
          AND conversation_id IN (${placeholders})
        GROUP BY conversation_id, bot_id
        ORDER BY conversation_id, MIN(created_at)`
    )
    .all(userId, ...conversationIds) as Array<{
    conversation_id: string;
    bot_id: string;
  }>;
  for (const row of rows) {
    const ids = result.get(row.conversation_id);
    if (ids) ids.push(row.bot_id);
    else result.set(row.conversation_id, [row.bot_id]);
  }
  return result;
}

function relationshipEntry(
  row: ConversationHistoryRow,
  ownerBotId: string | null,
  options: BuildConversationHistoryEntryOptions
): ConversationHistoryEntry {
  const contextKey = ownerBotId ? `bot:${ownerBotId}` : "prism";
  return {
    contextKey,
    contextKind: ownerBotId ? "persona_home" : "prism_home",
    conversationId: row.id,
    rootConversationId: row.id,
    episodeId: row.id,
    ownerBotId,
    origin: { kind: "relationship", id: ownerBotId },
    participantBotIds: normalizedIds([
      ownerBotId,
      ...(options.participantBotIds ?? []),
    ]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived_at),
    continuationConversationId: options.continuationConversationId ?? row.id,
    nativeRoute: {
      view: "chat",
      conversationId: options.continuationConversationId ?? row.id,
      botId: ownerBotId,
    },
  };
}

export function buildConversationHistoryEntry(
  row: ConversationHistoryRow,
  options: BuildConversationHistoryEntryOptions = {}
): ConversationHistoryEntry {
  const mode = row.conversation_mode ?? "sandbox";
  const parentId = row.parent_id?.trim() || null;
  const hubOwnerBotId = options.hubMetadata?.hubBotId ?? null;

  if (options.hubMetadata?.hubRole === "hub") {
    return relationshipEntry(row, hubOwnerBotId, options);
  }

  if (parentId || options.hubMetadata?.hubRole === "side") {
    const rootConversationId =
      options.hubMetadata?.parentHubId?.trim() || parentId || row.id;
    return {
      contextKey: `side:${row.id}`,
      contextKind: "side_chat",
      conversationId: row.id,
      rootConversationId,
      episodeId: row.id,
      ownerBotId: hubOwnerBotId || row.bot_id?.trim() || null,
      origin: { kind: "fork", id: rootConversationId },
      participantBotIds: normalizedIds([
        hubOwnerBotId,
        row.bot_id,
        ...(options.participantBotIds ?? []),
      ]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archived: Boolean(row.archived_at),
      continuationConversationId: row.id,
      nativeRoute: { view: "chat", conversationId: row.id },
    };
  }

  if (mode === "zen" || (mode === "chat" && !row.bot_id)) {
    return relationshipEntry(row, row.bot_id?.trim() || null, options);
  }

  if (mode === "coffee") {
    const coffeeGroupId = row.coffee_group_id?.trim() || null;
    const contextKey = coffeeGroupId
      ? `coffee-group:${coffeeGroupId}`
      : `coffee:${row.id}`;
    const originKind: ConversationHistoryOriginKind = coffeeGroupId
      ? "saved_group"
      : "coffee";
    return {
      contextKey,
      contextKind: coffeeGroupId ? "coffee_group" : "coffee_session",
      conversationId: row.id,
      rootConversationId: row.id,
      episodeId: row.id,
      ownerBotId: null,
      origin: { kind: originKind, id: coffeeGroupId ?? row.id },
      participantBotIds: normalizedIds([
        ...parseStoredBotIds(row.bot_group_ids),
        ...(options.participantBotIds ?? []),
      ]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archived: Boolean(row.archived_at),
      continuationConversationId: row.id,
      nativeRoute: {
        view: "coffee",
        conversationId: row.id,
        ...(coffeeGroupId ? { coffeeGroupId } : {}),
      },
    };
  }

  if (mode === "sandbox") {
    return {
      contextKey: `sandbox:${row.id}`,
      contextKind: "sandbox",
      conversationId: row.id,
      rootConversationId: row.id,
      episodeId: row.id,
      ownerBotId: row.bot_id?.trim() || null,
      origin: { kind: "sandbox", id: row.id },
      participantBotIds: normalizedIds([
        row.bot_id,
        ...(options.participantBotIds ?? []),
      ]),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archived: Boolean(row.archived_at),
      continuationConversationId: row.id,
      nativeRoute: { view: "sandbox", conversationId: row.id },
    };
  }

  return {
    contextKey: `legacy:${row.id}`,
    contextKind: "legacy",
    conversationId: row.id,
    rootConversationId: row.id,
    episodeId: row.id,
    ownerBotId: row.bot_id?.trim() || null,
    origin: { kind: "legacy", id: row.id },
    participantBotIds: normalizedIds([
      row.bot_id,
      ...(options.participantBotIds ?? []),
    ]),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: Boolean(row.archived_at),
    continuationConversationId: row.id,
    nativeRoute: { view: "chat", conversationId: row.id },
  };
}
