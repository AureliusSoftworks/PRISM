import type { DatabaseSync } from "node:sqlite";
import { DISABLED_MODEL_CHOICE, stripBotProfileMetaSuffix } from "@localai/shared";
import { randomId } from "./security.ts";

const BOT_EXPORT_HASH_PATTERN = /^[a-f0-9]{32}$/i;
const BOT_FLIRT_DISABLED_POLICY =
  "Interaction boundary: If the user makes romantic, sexual, or flirtatious advances, decline gently in character and redirect to a non-romantic direction. Keep the tone warm and natural, speak from the bot's own preference or comfort, and avoid policy-style refusal wording such as \"I can't help with that request.\"";
const BOT_FLIRT_ENABLED_POLICY =
  "Interaction policy: You may engage in consensual flirt or romantic roleplay when invited, as long as it stays respectful and in character. Build chemistry through warmth, playful tension, reciprocal curiosity, and pacing instead of jumping straight to explicit detail. Keep boundaries clear, speak from the bot's own comfort when declining, and do not claim real-world intimacy beyond this conversation. Avoid policy-style refusal wording; if a line is needed, make it sound like the bot's choice.";

/**
 * Build the system-prompt string sent to the model for a selected bot.
 *
 * Why this exists: the bot's *name* is meaningful context the user picked
 * deliberately ("Tim", "Frank", a custom persona) — but without this
 * helper, only the user-authored `system_prompt` is ever forwarded to the
 * model. That meant a bot named "Tim" with an empty prompt would introduce
 * itself as a generic "assistant" and deny being Tim, which reads as a bug.
 *
 * Behaviour:
 *   - With a non-empty name, we always prepend a short identity preamble
 *     ("You are <name>...") so the model adopts the persona even when the
 *     user didn't write a prompt.
 *   - If a system prompt is present, it follows the preamble. Because the
 *     user's prompt comes last, it still wins when it contradicts the
 *     preamble (e.g. "Respond as a pirate" overrides the identity tone).
 *   - Structured bot-editor metadata (`<<<PRISM_BOT_META>>>` …), when present,
 *     is stripped before this helper runs so providers never see JSON tails.
 *   - Optional flirt-roleplay routing policy can be appended from the per-bot
 *     `flirt_enabled` toggle.
 *   - Returns undefined when neither a usable name nor prompt is present,
 *     so callers pass no bot-owned persona; `buildPromptMessages` still ships
 *     the Prism tool appendix alone for Default chats.
 */
export function composeBotSystemPrompt(
  name: string | null | undefined,
  systemPrompt: string | null | undefined,
  flirtEnabled?: boolean
): string | undefined {
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedPrompt =
    typeof systemPrompt === "string"
      ? stripBotProfileMetaSuffix(systemPrompt).trim()
      : "";

  if (!trimmedName && !trimmedPrompt) return undefined;
  const preamble = trimmedName.length > 0
    ? `You are ${trimmedName}. When the user addresses you as ${trimmedName}, respond as ${trimmedName}.`
    : "";
  const interactionPolicy = flirtEnabled === undefined
    ? ""
    : flirtEnabled
      ? BOT_FLIRT_ENABLED_POLICY
      : BOT_FLIRT_DISABLED_POLICY;
  const sections = [preamble, interactionPolicy, trimmedPrompt].filter(
    (value) => value.length > 0
  );
  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

/** Generates the persistent identity hash stored on each bot row. */
export function createBotExportHash(): string {
  return randomId(16);
}

/**
 * Normalizes a user-supplied export hash. Accepts only 32-char hex tokens so
 * imports can't inject arbitrary identifiers into the uniqueness key.
 */
export function normalizeBotExportHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!BOT_EXPORT_HASH_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Resolve which export hash a newly-created bot should store.
 * - `incomingHash` undefined/null => legacy path, generate a fresh hash.
 * - malformed `incomingHash` => reject as invalid.
 * - duplicate incoming hash => reject as already present.
 */
export function resolveBotExportHashForCreate(options: {
  incomingHash?: unknown;
  hasExistingHash: (hash: string) => boolean;
  createHash?: () => string;
}): string {
  const createHash = options.createHash ?? createBotExportHash;
  const incomingProvided =
    options.incomingHash !== undefined && options.incomingHash !== null;
  const normalizedIncoming = normalizeBotExportHash(options.incomingHash);
  if (incomingProvided && normalizedIncoming === null) {
    throw new Error("Invalid bot export hash.");
  }
  if (normalizedIncoming) {
    if (options.hasExistingHash(normalizedIncoming)) {
      throw new Error("This bot is already in your library!");
    }
    return normalizedIncoming;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = createHash();
    if (!options.hasExistingHash(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique bot export hash.");
}

export function readBotPreferredModelForCreate(value: unknown): string | null {
  if (value === undefined) return DISABLED_MODEL_CHOICE;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Permanently remove a single bot owned by `userId`.
 *
 * Behaviour:
 *   - Throws if the bot does not exist, belongs to another user, or has
 *     delete protection enabled.
 *   - Runs inside an IMMEDIATE transaction so partial failures roll back.
 *   - Nulls out `bot_id` on past messages and conversations that pointed at
 *     this bot. Historical replies stay in the thread and fall back to the
 *     generic "Assistant" label via the LEFT JOIN in the chat read path.
 *   - Deletes memories scoped to this bot. Bot memories are only meaningful
 *     while their owner bot exists; otherwise the Memories panel would show
 *     orphaned/default Prism memory clusters.
 *   - Public bots can still only be deleted by their owner; other users that
 *     have interacted with the public bot keep their message history intact
 *     (their `bot_id` is left pointing at the now-deleted row, which the
 *     LEFT JOIN resolves to NULL the same way).
 */
export function deleteBot(
  db: DatabaseSync,
  userId: string,
  botId: string
): void {
  const existing = db
    .prepare("SELECT id, delete_protected FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { id?: string; delete_protected?: number } | undefined;
  if (!existing?.id) {
    throw new Error("Bot not found.");
  }
  if (existing.delete_protected === 1) {
    throw new Error("This bot is protected. Allow deletion from its group dashboard first.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare(
      "UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id = ?"
    ).run(userId, botId);
    db.prepare(
      "DELETE FROM memories WHERE user_id = ? AND bot_id = ? AND COALESCE(source, 'direct') != 'about_you'"
    ).run(userId, botId);
    db.prepare(
      "DELETE FROM bot_relationships WHERE user_id = ? AND (source_bot_id = ? OR target_bot_id = ?)"
    ).run(userId, botId, botId);
    db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?").run(
      botId,
      userId
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove up to `limit` of the caller's most recently updated bots.
 *
 * This powers the Developer Tools density controls. It skips protected bots,
 * preserves historical chats by nulling bot references before deleting the bot
 * rows, and removes bot-scoped memories for those deleted bots.
 */
export function deleteBots(
  db: DatabaseSync,
  userId: string,
  limit: number
): number {
  const normalizedLimit = Math.floor(limit);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return 0;

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const botIds = db
      .prepare(
        "SELECT id FROM bots WHERE user_id = ? AND delete_protected = 0 ORDER BY updated_at DESC, id DESC LIMIT ?"
      )
      .all(userId, normalizedLimit) as Array<{ id: string }>;

    if (botIds.length === 0) {
      db.exec("COMMIT");
      return 0;
    }

    const ids = botIds.map(({ id }) => id);
    const placeholders = ids.map(() => "?").join(", ");

    db.prepare(
      `UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM memories
       WHERE user_id = ?
         AND bot_id IN (${placeholders})
         AND COALESCE(source, 'direct') != 'about_you'`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM bot_relationships
       WHERE user_id = ?
         AND (source_bot_id IN (${placeholders}) OR target_bot_id IN (${placeholders}))`
    ).run(userId, ...ids, ...ids);
    db.prepare(
      `DELETE FROM bots WHERE user_id = ? AND id IN (${placeholders})`
    ).run(userId, ...ids);
    db.exec("COMMIT");
    return ids.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove every bot owned by `userId` in a single transaction.
 *
 * Behaviour mirrors {@link deleteBot} applied in bulk:
 *   - Runs inside an IMMEDIATE transaction so either every bot is gone
 *     or the database is untouched.
 *   - Skips protected bots unless `includeProtected` is explicitly true.
 *   - Nulls out `bot_id` on the user's past messages and conversations
 *     for deleted bots first, so historical threads keep their content and
 *     fall back to the generic "Assistant" label via the chat read path's
 *     LEFT JOIN.
 *   - Deletes bot-scoped memories for the deleted bots. Global/default
 *     memories with `bot_id IS NULL` are preserved.
 *   - Strictly scoped to `userId` via `WHERE user_id = ?` on every
 *     statement so other users' bots (including public bots they don't
 *     own) are never touched.
 *   - Returns the count of bots removed (0 if the user had none).
 *
 * Intended for the user-facing Bots panel press-and-hold "delete all" flow;
 * Developer Tools can opt into deleting protected bots for fixture cleanup.
 */
export function deleteAllBots(
  db: DatabaseSync,
  userId: string,
  options: { includeProtected?: boolean } = {}
): number {
  const includeProtected = options.includeProtected === true;
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const botIds = db
      .prepare(
        includeProtected
          ? "SELECT id FROM bots WHERE user_id = ?"
          : "SELECT id FROM bots WHERE user_id = ? AND delete_protected = 0"
      )
      .all(userId) as Array<{ id: string }>;

    if (botIds.length === 0) {
      db.exec("COMMIT");
      return 0;
    }

    const ids = botIds.map(({ id }) => id);
    const placeholders = ids.map(() => "?").join(", ");

    db.prepare(
      `UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${placeholders})`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM memories
       WHERE user_id = ?
         AND bot_id IN (${placeholders})
         AND COALESCE(source, 'direct') != 'about_you'`
    ).run(userId, ...ids);
    db.prepare(
      `DELETE FROM bot_relationships
       WHERE user_id = ?
         AND (source_bot_id IN (${placeholders}) OR target_bot_id IN (${placeholders}))`
    ).run(userId, ...ids, ...ids);
    db.prepare(
      `DELETE FROM bots WHERE user_id = ? AND id IN (${placeholders})`
    ).run(userId, ...ids);
    db.exec("COMMIT");
    return ids.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setSelectedBotsDeleteProtection(
  db: DatabaseSync,
  userId: string,
  selectedBotIds: string[],
  deleteProtected: boolean
): { updated: number } {
  const uniqueIds = Array.from(
    new Set(
      selectedBotIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );
  if (!uniqueIds.length) {
    return { updated: 0 };
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const result = db.prepare(
      `UPDATE bots
       SET delete_protected = ?, updated_at = ?
       WHERE user_id = ? AND id IN (${placeholders})`
    ).run(deleteProtected ? 1 : 0, new Date().toISOString(), userId, ...uniqueIds);
    db.exec("COMMIT");
    return { updated: Number(result.changes ?? 0) };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteSelectedBots(
  db: DatabaseSync,
  userId: string,
  selectedBotIds: string[]
): { deleted: number; protectedSkipped: number } {
  const uniqueIds = Array.from(
    new Set(
      selectedBotIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );
  if (!uniqueIds.length) {
    return { deleted: 0, protectedSkipped: 0 };
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT id, delete_protected
         FROM bots
         WHERE user_id = ? AND id IN (${placeholders})`
      )
      .all(userId, ...uniqueIds) as Array<{ id: string; delete_protected: number }>;
    const deletableIds = rows
      .filter((row) => row.delete_protected !== 1)
      .map((row) => row.id);
    const protectedSkipped = rows.length - deletableIds.length;

    if (!deletableIds.length) {
      db.exec("COMMIT");
      return { deleted: 0, protectedSkipped };
    }

    const deletablePlaceholders = deletableIds.map(() => "?").join(", ");
    db.prepare(
      `UPDATE messages SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${deletablePlaceholders})`
    ).run(userId, ...deletableIds);
    db.prepare(
      `UPDATE conversations SET bot_id = NULL WHERE user_id = ? AND bot_id IN (${deletablePlaceholders})`
    ).run(userId, ...deletableIds);
    db.prepare(
      `DELETE FROM memories
       WHERE user_id = ?
         AND bot_id IN (${deletablePlaceholders})
         AND COALESCE(source, 'direct') != 'about_you'`
    ).run(userId, ...deletableIds);
    db.prepare(
      `DELETE FROM bots WHERE user_id = ? AND id IN (${deletablePlaceholders})`
    ).run(userId, ...deletableIds);
    db.exec("COMMIT");
    return { deleted: deletableIds.length, protectedSkipped };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
