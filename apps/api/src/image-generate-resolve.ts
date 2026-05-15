import type { DatabaseSync } from "node:sqlite";

export type ConversationImageGateRow =
  | { ok: true; lockedBotId: string | null }
  | { ok: false; message: string };

/** Loads the conversation row and allows thread-linked persona images in Zen + Chat (playground) modes. */
export function resolveConversationForSandboxImageGenerate(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): ConversationImageGateRow {
  const row = db
    .prepare(
      "SELECT conversation_mode AS mode, bot_id AS lockedBotId FROM conversations WHERE id = ? AND user_id = ?"
    )
    .get(conversationId, userId) as
    | { mode: string; lockedBotId: string | null }
    | undefined;
  if (!row) {
    return { ok: false, message: "That conversation was not found for your account." };
  }
  if (row.mode !== "sandbox" && row.mode !== "chat") {
    return {
      ok: false,
      message: "Linked image generation works in Zen and Chat threads only.",
    };
  }
  return { ok: true, lockedBotId: row.lockedBotId };
}

export function botBelongsToUser(
  db: DatabaseSync,
  userId: string,
  botId: string
): boolean {
  const row = db
    .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { id?: string } | undefined;
  return Boolean(row?.id);
}

export function conversationHasAssistantWithBotId(
  db: DatabaseSync,
  conversationId: string,
  botId: string
): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM messages
       WHERE conversation_id = ? AND role = 'assistant' AND bot_id = ?
       LIMIT 1`
    )
    .get(conversationId, botId) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

export type ResolveSandboxImageBotResult =
  | { ok: true; persistedBotId: string | null; personaBotId: string | null }
  | { ok: false; message: string };

/**
 * Resolves which bot id to store on the image row and which bot profile to
 * fold into the DALL·E prompt. The client's gallery filter may follow
 * `activeBot` while this follows the thread lock + optional explicit `botId`;
 * they should match in normal use.
 */
export function resolveSandboxImageBotAttribution(options: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  conversationLockedBotId: string | null;
  bodyBotId: string | null | undefined;
}): ResolveSandboxImageBotResult {
  const raw = options.bodyBotId;
  if (raw == null || String(raw).trim() === "") {
    return {
      ok: true,
      persistedBotId: options.conversationLockedBotId,
      personaBotId: options.conversationLockedBotId,
    };
  }
  const botId = String(raw).trim();
  if (!botBelongsToUser(options.db, options.userId, botId)) {
    return { ok: false, message: "Unknown bot for this account." };
  }
  const locksToThread =
    options.conversationLockedBotId != null &&
    options.conversationLockedBotId === botId;
  const spokeInThread = conversationHasAssistantWithBotId(
    options.db,
    options.conversationId,
    botId
  );
  if (!locksToThread && !spokeInThread) {
    return {
      ok: false,
      message:
        "That bot is not part of this thread. Use a bot locked to this conversation or one that has already replied here.",
    };
  }
  return { ok: true, persistedBotId: botId, personaBotId: botId };
}

/** Upsert targets for `images` after validation (conversation optional). */
export type ImageGeneratePersistenceResolved =
  | {
      ok: true;
      conversationIdForInsert: string | null;
      persistedBotId: string | null;
      personaBotId: string | null;
    }
  | { ok: false; message: string };

/**
 * Validates persistence targets for POST `/api/images/generate`.
 * - With `conversationId`: Sandbox gate + existing bot/thread attribution.
 * - Without conversation: optional `botId` for this user (`conversation_id` NULL).
 *   When `botId` is omitted, the row is stored with `bot_id` NULL (PRISM general bucket).
 */
export function resolveStandaloneBotImageForGenerate(
  db: DatabaseSync,
  userId: string,
  bodyBotId: string | undefined
): ImageGeneratePersistenceResolved {
  const raw = bodyBotId;
  if (raw == null || String(raw).trim() === "") {
    // Standalone gallery: allow uncategorized rows (`bot_id` NULL). Persona
    // augmentation is skipped; images appear under PRISM (general) in the UI.
    return {
      ok: true,
      conversationIdForInsert: null,
      persistedBotId: null,
      personaBotId: null,
    };
  }
  const botId = String(raw).trim();
  if (!botBelongsToUser(db, userId, botId)) {
    return { ok: false, message: "Unknown bot for this account." };
  }
  return {
    ok: true,
    conversationIdForInsert: null,
    persistedBotId: botId,
    personaBotId: botId,
  };
}

export function resolveImageGeneratePersistence(options: {
  db: DatabaseSync;
  userId: string;
  conversationIdRaw: string;
  bodyBotId: string | undefined;
}): ImageGeneratePersistenceResolved {
  const cid = options.conversationIdRaw.trim();
  if (cid.length === 0) {
    return resolveStandaloneBotImageForGenerate(
      options.db,
      options.userId,
      options.bodyBotId
    );
  }
  const conv = resolveConversationForSandboxImageGenerate(
    options.db,
    options.userId,
    cid
  );
  if (!conv.ok) {
    return conv;
  }
  const resolved = resolveSandboxImageBotAttribution({
    db: options.db,
    userId: options.userId,
    conversationId: cid,
    conversationLockedBotId: conv.lockedBotId,
    bodyBotId: options.bodyBotId,
  });
  if (!resolved.ok) {
    return resolved;
  }
  return {
    ok: true,
    conversationIdForInsert: cid,
    persistedBotId: resolved.persistedBotId,
    personaBotId: resolved.personaBotId,
  };
}
