import { createServer } from "node:http";
import { getAppConfig } from "@localai/config";
import { createDatabase } from "./db.ts";
import { clearCookie, json, parseCookies, readJsonBody, setCookie, setCorsHeaders } from "./utils.http.ts";
import { decryptJson, decryptText, deriveMasterKey, encryptText, hashPassword, randomId, verifyPassword } from "./security.ts";
import type { RouteDefinition, RequestContext } from "./types.ts";
import { processChatMessage } from "./chat.ts";
import { deleteAllConversations, deleteConversation, rewindConversation } from "./conversations.ts";
import {
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  resolveBotChatEnabled,
} from "./bots.ts";
import { resolveNextSettings } from "./settings.ts";
import type { GenerateOptions } from "./providers.ts";
import { LocalOnlyBackupAdapter, exportUserSnapshot, importUserSnapshot, type BackupSnapshot } from "./backup.ts";
import { generateImage } from "./image-provider.ts";
import {
  INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS,
  getInactiveAccountCutoff
} from "./account-retention.ts";
import {
  GENERATED_IMAGE_CLEANUP_INTERVAL_MS,
  purgeExpiredImages
} from "./image-retention.ts";
import { deleteVectorsForUser } from "./qdrant.ts";

const config = getAppConfig();
const db = createDatabase();
const masterKey = deriveMasterKey(config.encryptionMasterKey);
const backupAdapter = new LocalOnlyBackupAdapter();

interface UserDbRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  wrapped_user_key: string;
  wrapped_user_key_iv: string;
  wrapped_user_key_tag: string;
  theme: "light" | "dark" | "system";
  preferred_provider: "local" | "openai";
  provider_locked: number;
  auto_memory: number;
  auto_switch_model: number;
  openai_key_ciphertext: string | null;
  openai_key_iv: string | null;
  openai_key_tag: string | null;
  created_at: string;
  last_active_at: string;
}

function route(method: string, pathTemplate: string, handler: RouteDefinition["handler"]): RouteDefinition {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      pathTemplate
        .replace(/\//g, "\\/")
        .replace(/:([A-Za-z0-9_]+)/g, (_full, key: string) => {
          keys.push(key);
          return "([^/]+)";
        }) +
      "$"
  );
  return { method, pattern, keys, handler };
}

function parseParams(definition: RouteDefinition, pathname: string): Record<string, string> {
  const match = pathname.match(definition.pattern);
  if (!match) {
    return {};
  }
  return definition.keys.reduce<Record<string, string>>((acc, key, index) => {
    acc[key] = decodeURIComponent(match[index + 1]);
    return acc;
  }, {});
}

function getSessionToken(ctx: RequestContext): string | null {
  const cookies = parseCookies(ctx.req.headers.cookie);
  return cookies[config.sessionCookieName] ?? null;
}

function requireAuth(ctx: RequestContext): string {
  const sessionToken = getSessionToken(ctx);
  if (!sessionToken) {
    throw new Error("Authentication required.");
  }
  const session = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(sessionToken) as { user_id?: string; expires_at?: string } | undefined;
  if (!session?.user_id || !session.expires_at) {
    throw new Error("Invalid session.");
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(sessionToken);
    throw new Error("Session expired.");
  }
  ctx.sessionToken = sessionToken;
  ctx.userId = session.user_id;
  touchUserActivity(session.user_id);
  return session.user_id;
}

function getUserRow(userId: string): UserDbRow {
  const row = db
    .prepare(
      "SELECT id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, theme, preferred_provider, provider_locked, auto_memory, auto_switch_model, openai_key_ciphertext, openai_key_iv, openai_key_tag, created_at, last_active_at FROM users WHERE id = ?"
    )
    .get(userId) as UserDbRow | undefined;
  if (!row) {
    throw new Error("User not found.");
  }
  return row;
}

function decryptUserKey(userId: string): Buffer {
  const row = getUserRow(userId);
  const userKeyBase64 = decryptText(
    {
      ciphertext: row.wrapped_user_key,
      iv: row.wrapped_user_key_iv,
      tag: row.wrapped_user_key_tag
    },
    masterKey
  );
  return Buffer.from(userKeyBase64, "base64");
}

function getOpenAiApiKeyForUser(userId: string, userKey: Buffer): string | undefined {
  const user = getUserRow(userId);
  if (!user.openai_key_ciphertext || !user.openai_key_iv || !user.openai_key_tag) {
    return undefined;
  }
  return decryptText(
    {
      ciphertext: user.openai_key_ciphertext,
      iv: user.openai_key_iv,
      tag: user.openai_key_tag
    },
    userKey
  );
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
  return value.trim();
}

function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomId(24);
  const expiresAt = new Date(
    Date.now() + config.sessionTtlHours * 60 * 60 * 1000
  ).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt
  );
  return { token, expiresAt };
}

function touchUserActivity(userId: string): void {
  db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    userId
  );
}

async function deleteUserAccount(userId: string): Promise<void> {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM conversation_exports WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM images WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM bots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM memory_summaries WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM memories WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  try {
    await deleteVectorsForUser(userId);
  } catch {
    // Qdrant cleanup is best-effort; account data is already removed from SQLite.
  }
}

async function purgeInactiveAccounts(): Promise<void> {
  const cutoffIso = getInactiveAccountCutoff().toISOString();
  const inactiveUsers = db
    .prepare(
      "SELECT id FROM users WHERE COALESCE(last_active_at, created_at) < ?"
    )
    .all(cutoffIso) as Array<{ id: string }>;

  for (const user of inactiveUsers) {
    await deleteUserAccount(user.id);
  }
}

function buildRoutes(): RouteDefinition[] {
  return [
    route("POST", "/api/auth/register", async (ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const email = readString(body.email, "email").toLowerCase();
      const password = readString(body.password, "password");
      const displayName = readString(body.displayName, "displayName");

      const existing = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email) as { id?: string } | undefined;
      if (existing?.id) {
        throw new Error("Email is already registered.");
      }

      // Seed the new user's theme from the client's pre-auth choice so the
      // auth-screen toggle carries through into the account. Falls back to
      // "system" (OS preference) to match the DB default.
      const requestedTheme =
        body.theme === "light" || body.theme === "dark" || body.theme === "system"
          ? body.theme
          : "system";

      const userId = randomId(12);
      const salt = randomId(8);
      const passwordHash = hashPassword(password, salt);
      const userKey = Buffer.from(randomId(32), "hex");
      const wrappedUserKey = encryptText(userKey.toString("base64"), masterKey);
      const createdAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (
          id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          theme, preferred_provider, auto_memory, auto_switch_model, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 1, 0, ?, ?)
      `).run(
        userId,
        email,
        displayName,
        passwordHash,
        salt,
        wrappedUserKey.ciphertext,
        wrappedUserKey.iv,
        wrappedUserKey.tag,
        requestedTheme,
        createdAt,
        createdAt
      );

      const { token } = createSession(userId);
      setCookie(
        ctx.res,
        config.sessionCookieName,
        token,
        config.sessionTtlHours * 60 * 60
      );
      json(ctx.res, 201, {
        ok: true,
        user: {
          id: userId,
          email,
          displayName,
          role: "user",
          createdAt,
          theme: requestedTheme,
          preferredProvider: "local"
        }
      });
    }),
    route("POST", "/api/auth/login", async (ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const email = readString(body.email, "email").toLowerCase();
      const password = readString(body.password, "password");
      const user = db
        .prepare(
          "SELECT id, password_hash, password_salt FROM users WHERE email = ?"
        )
        .get(email) as
        | { id?: string; password_hash?: string; password_salt?: string }
        | undefined;
      if (!user?.id || !user.password_hash || !user.password_salt) {
        throw new Error("Invalid credentials.");
      }
      if (!verifyPassword(password, user.password_salt, user.password_hash)) {
        throw new Error("Invalid credentials.");
      }
      const { token } = createSession(user.id);
      touchUserActivity(user.id);
      setCookie(
        ctx.res,
        config.sessionCookieName,
        token,
        config.sessionTtlHours * 60 * 60
      );
      json(ctx.res, 200, { ok: true });
    }),
    route("POST", "/api/auth/logout", async (ctx) => {
      const token = getSessionToken(ctx);
      if (token) {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      }
      clearCookie(ctx.res, config.sessionCookieName);
      json(ctx.res, 200, { ok: true });
    }),
    route("DELETE", "/api/account", async (ctx) => {
      const userId = requireAuth(ctx);
      await deleteUserAccount(userId);
      clearCookie(ctx.res, config.sessionCookieName);
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/auth/me", async (ctx) => {
      const userId = requireAuth(ctx);
      const row = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        user: {
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          role: "user",
          createdAt: row.created_at,
          theme: row.theme,
          preferredProvider: row.preferred_provider
        }
      });
    }),
    route("GET", "/api/conversations", async (ctx) => {
      const userId = requireAuth(ctx);
      // bot_id + incognito ride along in the list response so the sidebar
      // can render private-chat markers and bot-colored accents without a
      // second roundtrip per row.
      //
      // last_bot_id / last_bot_color come from the MOST RECENT assistant
      // message on the conversation — no bot_id filter. That means when
      // the user picks "Default" mid-thread in Sandbox, subsequent
      // Default replies show up as last_bot_id = NULL, which the client
      // interprets as "Default is the current bot" and paints the row
      // WHITE. Before this change, Default replies were invisible to the
      // sidebar and the row stayed colored by whichever bot had spoken
      // previously — a lie about who's "active" in the thread.
      //
      // has_assistant_reply disambiguates "Default was last" (reply
      // exists but has no bot_id) from "no reply yet" (conversation row
      // exists but no assistant message — only reachable via a failed
      // send that errored after the user msg was inserted). The first
      // case wants WHITE; the second wants the locked-bot fallback. We
      // can't tell them apart from last_bot_id alone.
      //
      // Correlated subqueries are cheap here: SQLite optimizes the
      // LIMIT 1 DESC scan with the existing messages(conversation_id,
      // created_at) locality, so ordering on updated_at doesn't force a
      // full messages table scan per row.
      const rows = db
        .prepare(
          `SELECT c.id, c.title, c.bot_id, c.incognito, c.created_at, c.updated_at,
                  (SELECT m.bot_id FROM messages m
                     WHERE m.conversation_id = c.id
                       AND m.role = 'assistant'
                     ORDER BY m.created_at DESC LIMIT 1) AS last_bot_id,
                  (SELECT b.color FROM messages m
                     LEFT JOIN bots b ON b.id = m.bot_id
                     WHERE m.conversation_id = c.id
                       AND m.role = 'assistant'
                     ORDER BY m.created_at DESC LIMIT 1) AS last_bot_color,
                  EXISTS (SELECT 1 FROM messages m
                            WHERE m.conversation_id = c.id
                              AND m.role = 'assistant') AS has_assistant_reply
             FROM conversations c
            WHERE c.user_id = ?
         ORDER BY c.updated_at DESC`
        )
        .all(userId) as Array<{
        id: string;
        title: string;
        bot_id: string | null;
        incognito: number;
        created_at: string;
        updated_at: string;
        last_bot_id: string | null;
        last_bot_color: string | null;
        has_assistant_reply: number;
      }>;
      json(ctx.res, 200, {
        ok: true,
        conversations: rows.map((row) => ({
          id: row.id,
          title: row.title,
          botId: row.bot_id ?? null,
          incognito: row.incognito === 1,
          lastBotId: row.last_bot_id ?? null,
          lastBotColor: row.last_bot_color ?? null,
          hasAssistantReply: row.has_assistant_reply === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    }),
    route("GET", "/api/conversations/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      // Same last_bot_* + has_assistant_reply triple as the list
      // endpoint so the ConversationDetail payload stays in lockstep —
      // client consumers can read either GET shape and resolve row tint
      // + composer-dropdown sync the same way.
      const conversation = db
        .prepare(
          `SELECT c.id, c.title, c.bot_id, c.incognito, c.created_at, c.updated_at,
                  (SELECT m.bot_id FROM messages m
                     WHERE m.conversation_id = c.id
                       AND m.role = 'assistant'
                     ORDER BY m.created_at DESC LIMIT 1) AS last_bot_id,
                  (SELECT b.color FROM messages m
                     LEFT JOIN bots b ON b.id = m.bot_id
                     WHERE m.conversation_id = c.id
                       AND m.role = 'assistant'
                     ORDER BY m.created_at DESC LIMIT 1) AS last_bot_color,
                  EXISTS (SELECT 1 FROM messages m
                            WHERE m.conversation_id = c.id
                              AND m.role = 'assistant') AS has_assistant_reply
             FROM conversations c
            WHERE c.id = ? AND c.user_id = ?`
        )
        .get(conversationId, userId) as
        | {
            id: string;
            title: string;
            bot_id: string | null;
            incognito: number;
            created_at: string;
            updated_at: string;
            last_bot_id: string | null;
            last_bot_color: string | null;
            has_assistant_reply: number;
          }
        | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      const messageRows = db
        .prepare(
          `SELECT m.id, m.role, m.content, m.provider, m.created_at,
                  b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
           FROM messages m
           LEFT JOIN bots b ON b.id = m.bot_id
           WHERE m.conversation_id = ? AND m.user_id = ?
           ORDER BY m.created_at ASC`
        )
        .all(conversationId, userId) as Array<{
        id: string;
        role: "user" | "assistant" | "system";
        content: string;
        provider: string | null;
        bot_name: string | null;
        bot_color: string | null;
        bot_glyph: string | null;
        created_at: string;
      }>;
      // Match the shared ChatMessage shape used by POST /api/chat and the
      // web UI so both endpoints agree.
      const messages = messageRows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
        provider:
          row.provider === "local" || row.provider === "openai"
            ? row.provider
            : undefined,
        botName: row.bot_name ?? undefined,
        botColor: row.bot_color ?? undefined,
        botGlyph: row.bot_glyph ?? undefined,
      }));
      json(ctx.res, 200, {
        ok: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          botId: conversation.bot_id ?? null,
          incognito: conversation.incognito === 1,
          lastBotId: conversation.last_bot_id ?? null,
          lastBotColor: conversation.last_bot_color ?? null,
          hasAssistantReply: conversation.has_assistant_reply === 1,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          messages,
        },
      });
    }),
    route("DELETE", "/api/conversations/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      deleteConversation(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true });
    }),
    // Bulk-clear — removes every chat the caller owns in one atomic
    // transaction. Powers the web client's hold-to-delete-all gesture on
    // the sidebar × buttons; keeping it strictly scoped to the authed
    // userId means there's no footgun for an admin/shared-DB scenario.
    route("DELETE", "/api/conversations", async (ctx) => {
      const userId = requireAuth(ctx);
      const deleted = deleteAllConversations(db, userId);
      json(ctx.res, 200, { ok: true, deleted });
    }),
    route("POST", "/api/chat", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const message = readString(body.message, "message");
      const conversationId =
        typeof body.conversationId === "string" ? body.conversationId : undefined;
      // Three-valued parse so the server can distinguish:
      //   - absent key           → leave conversation's bot alone
      //   - explicit null        → switch to Default persona (no bot)
      //   - string               → switch to that specific bot
      // The Chat-mode client ALWAYS sends botId (string or null) so a
      // mid-thread dropdown flip either persists a new bot or demotes
      // the conversation back to Default. Sandbox callers still omit
      // the key for the no-bot case; they get the legacy behavior.
      const botId: string | null | undefined =
        typeof body.botId === "string"
          ? body.botId
          : body.botId === null
            ? null
            : undefined;
      // Which post-auth surface this turn came from. Default to "sandbox"
      // so that any client that forgets to send `mode` gets the safer
      // no-side-effects posture (no memory writes) rather than silently
      // leaking a sandbox turn into cross-session storage. processChatMessage
      // enforces the same default as defense in depth.
      const mode = body.mode === "chat" ? "chat" : "sandbox";
      // Incognito is a Chat-mode concept (see chat.ts): it flips the turn
      // offline AND skips memory. We deliberately ignore any `incognito`
      // flag for Sandbox requests so the two modes stay semantically
      // distinct even if a stale client still sends the field.
      const incognito = mode === "chat" && body.incognito === true;
      // Per-request provider override so a fresh sidebar switch takes effect
      // immediately, even if the settings PATCH is still in flight.
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);

      let botSystemPrompt: string | undefined;
      let botOverrides: GenerateOptions | undefined;
      if (botId) {
        const bot = db
          .prepare(
            "SELECT name, system_prompt, model, temperature, max_tokens, chat_enabled FROM bots WHERE id = ? AND (user_id = ? OR visibility = 'public')"
          )
          .get(botId, userId) as
          | {
              name?: string;
              system_prompt?: string;
              model?: string | null;
              temperature?: number | null;
              max_tokens?: number | null;
              chat_enabled?: number | null;
            }
          | undefined;
        if (bot) {
          const alreadyLockedToConversation =
            mode === "chat" &&
            conversationId !== undefined &&
            Boolean(
              db
                .prepare(
                  "SELECT id FROM conversations WHERE id = ? AND user_id = ? AND bot_id = ?"
                )
                .get(conversationId, userId, botId)
            );
          if (mode === "chat" && bot.chat_enabled !== 1 && !alreadyLockedToConversation) {
            throw new Error("Bot is not enabled for Chat mode.");
          }
          // Name is folded into the system prompt by composeBotSystemPrompt so
          // the model actually knows who it's supposed to be, even when the
          // user left the prompt field blank. Unit-tested in
          // `__tests__/bots.test.ts`.
          botSystemPrompt = composeBotSystemPrompt(bot.name, bot.system_prompt);
          const overrides: GenerateOptions = {};
          if (typeof bot.model === "string" && bot.model.trim()) {
            overrides.model = bot.model.trim();
          }
          if (typeof bot.temperature === "number") {
            overrides.temperature = bot.temperature;
          }
          if (typeof bot.max_tokens === "number") {
            overrides.maxTokens = bot.max_tokens;
          }
          if (Object.keys(overrides).length > 0) {
            botOverrides = overrides;
          }
        }
      }

      // Prefer the user's saved key; fall back to the server-wide env key so a
      // single OPENAI_API_KEY in .env makes chat work without double-entry.
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;

      const conversation = await processChatMessage(
        db,
        userId,
        message,
        userKey,
        {
          preferredProvider: requestedProvider ?? user.preferred_provider,
          autoMemory: !incognito && Boolean(user.auto_memory),
          openAiApiKey,
          botId,
          incognito,
          botSystemPrompt,
          botOverrides,
          mode,
        },
        conversationId
      );
      json(ctx.res, 200, { ok: true, conversation });
    }),
    route("GET", "/api/memories", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const rows = db
        .prepare(
          "SELECT id, confidence, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as Array<{
        id: string;
        confidence: number;
        ciphertext: string;
        iv: string;
        tag: string;
        created_at: string;
      }>;
      json(ctx.res, 200, {
        ok: true,
        memories: rows.map((row) => {
          const payload = decryptJson(
            {
              ciphertext: row.ciphertext,
              iv: row.iv,
              tag: row.tag
            },
            userKey
          ) as { text?: string };
          return {
            id: row.id,
            confidence: row.confidence,
            text: payload.text ?? "",
            createdAt: row.created_at
          };
        })
      });
    }),
    route("DELETE", "/api/memories/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(
        ctx.params.id,
        userId
      );
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/settings", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        settings: {
          theme: user.theme,
          preferredProvider: user.preferred_provider,
          providerLocked: Boolean(user.provider_locked),
          autoMemory: Boolean(user.auto_memory),
          hasOpenAiApiKey: Boolean(user.openai_key_ciphertext),
          // Surface the server's configured local model so the sidebar can
          // show users which Ollama model they're hitting in LOCAL mode.
          ollamaModel: config.ollamaModel,
        },
      });
    }),
    route("PATCH", "/api/settings", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const user = getUserRow(userId);

      // Validation + merge live in `./settings.ts` so the semantics are pinned
      // by unit tests. See `__tests__/settings.test.ts` for the contract.
      const next = resolveNextSettings(body, {
        theme: user.theme,
        preferredProvider: user.preferred_provider,
        providerLocked: user.provider_locked,
        autoMemory: user.auto_memory,
      });

      let openAiCipher = user.openai_key_ciphertext;
      let openAiIv = user.openai_key_iv;
      let openAiTag = user.openai_key_tag;
      if (next.openAiKeyIntent.action === "replace") {
        const encrypted = encryptText(next.openAiKeyIntent.plaintext, userKey);
        openAiCipher = encrypted.ciphertext;
        openAiIv = encrypted.iv;
        openAiTag = encrypted.tag;
      } else if (next.openAiKeyIntent.action === "clear") {
        openAiCipher = null;
        openAiIv = null;
        openAiTag = null;
      }

      // `auto_switch_model` is intentionally not updated here. The old
      // cross-mode escalation setting has been retired; the DB column
      // stays so a future intra-mode model switcher can adopt it without
      // another migration.
      db.prepare(`
        UPDATE users
        SET theme = ?, preferred_provider = ?, provider_locked = ?, auto_memory = ?,
            openai_key_ciphertext = ?, openai_key_iv = ?, openai_key_tag = ?
        WHERE id = ?
      `).run(
        next.theme,
        next.preferredProvider,
        next.providerLocked,
        next.autoMemory,
        openAiCipher,
        openAiIv,
        openAiTag,
        userId
      );
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/backup/export", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const snapshot = exportUserSnapshot(db, userId, userKey);
      await backupAdapter.upload(userId, snapshot);
      json(ctx.res, 200, { ok: true, snapshot });
    }),
    route("POST", "/api/backup/import", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as { snapshot?: BackupSnapshot };
      if (!body.snapshot) {
        throw new Error("snapshot is required.");
      }
      const userKey = decryptUserKey(userId);
      importUserSnapshot(db, userId, body.snapshot, userKey);
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/backup/versions", async (ctx) => {
      const userId = requireAuth(ctx);
      const versions = await backupAdapter.listVersions(userId);
      json(ctx.res, 200, { ok: true, versions });
    }),
    route("POST", "/api/images/generate", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const prompt = readString(body.prompt, "prompt");
      const size = (body.size as string) ?? "1024x1024";
      const quality = (body.quality as string) ?? "standard";
      const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

      // Privacy gate: image generation always calls OpenAI DALL-E, so it
      // must never fire while the user has LOCAL mode selected. Mirror the
      // chat route's per-request override: the body can carry a
      // `preferredProvider` for per-send intent, falling back to the user's
      // stored mode.
      const user = getUserRow(userId);
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      if (effectiveProvider === "local") {
        throw new Error(
          "Image generation requires ONLINE mode. Switch to ONLINE in the sidebar or compose toggle and try again."
        );
      }

      const userKey = decryptUserKey(userId);
      const apiKey = getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const result = await generateImage(
        prompt,
        apiKey,
        size as "1024x1024" | "1024x1792" | "1792x1024",
        quality as "standard" | "hd"
      );
      const imageId = randomId(12);
      db.prepare(
        "INSERT INTO images (id, user_id, conversation_id, prompt, revised_prompt, url, size, quality, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'openai', ?)"
      ).run(imageId, userId, conversationId, prompt, result.revisedPrompt, result.url, size, quality, new Date().toISOString());
      json(ctx.res, 200, { ok: true, image: { id: imageId, ...result } });
    }),
    route("GET", "/api/images", async (ctx) => {
      const userId = requireAuth(ctx);
      const rows = db.prepare(
        "SELECT id, prompt, revised_prompt, url, size, quality, created_at FROM images WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      ).all(userId);
      json(ctx.res, 200, { ok: true, images: rows });
    }),
    route("POST", "/api/bots", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const name = readString(body.name, "name");
      const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : "";
      const model = typeof body.model === "string" ? body.model : null;
      const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
      const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : 2048;
      // Accept any non-empty string for color (CSS parses the value at render
      // time). Native HTML5 color inputs always emit "#RRGGBB".
      const color =
        typeof body.color === "string" && body.color.trim().length > 0
          ? body.color.trim()
          : null;
      // Glyph is an opaque identifier for the icon the UI should render
      // (e.g. "bot", "sparkles"). The frontend's glyph registry resolves
      // it; unknown keys fall back to a default icon client-side.
      const glyph =
        typeof body.glyph === "string" && body.glyph.trim().length > 0
          ? body.glyph.trim()
          : null;
      const chatEnabled = resolveBotChatEnabled(body.chatEnabled);
      const botId = randomId(12);
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO bots (id, user_id, name, system_prompt, model, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)"
      ).run(botId, userId, name, systemPrompt, model, temperature, maxTokens, color, glyph, chatEnabled, now, now);
      json(ctx.res, 201, {
        ok: true,
        bot: { id: botId, name, systemPrompt, model, temperature, maxTokens, color, glyph, chat_enabled: chatEnabled },
      });
    }),
    route("GET", "/api/bots", async (ctx) => {
      const userId = requireAuth(ctx);
      const rows = db.prepare(
        "SELECT id, name, system_prompt, model, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at FROM bots WHERE user_id = ? OR visibility = 'public' ORDER BY updated_at DESC"
      ).all(userId);
      json(ctx.res, 200, { ok: true, bots: rows });
    }),
    route("PATCH", "/api/bots/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const botId = ctx.params.id;
      const existing = db.prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?").get(botId, userId) as { id?: string } | undefined;
      if (!existing?.id) {
        throw new Error("Bot not found.");
      }
      const body = ctx.body as Record<string, unknown>;
      const fields: string[] = [];
      const values: Array<string | number | null> = [];
      if (typeof body.name === "string") { fields.push("name = ?"); values.push(body.name); }
      if (typeof body.systemPrompt === "string") { fields.push("system_prompt = ?"); values.push(body.systemPrompt); }
      if (typeof body.model === "string") { fields.push("model = ?"); values.push(body.model); }
      if (typeof body.temperature === "number") { fields.push("temperature = ?"); values.push(body.temperature); }
      if (typeof body.maxTokens === "number") { fields.push("max_tokens = ?"); values.push(body.maxTokens); }
      // Color update semantics: non-empty string updates, explicit null clears,
      // empty string or missing field leaves it unchanged.
      if (typeof body.color === "string" && body.color.trim().length > 0) {
        fields.push("color = ?");
        values.push(body.color.trim());
      } else if (body.color === null) {
        fields.push("color = ?");
        values.push(null);
      }
      // Glyph update semantics mirror color: non-empty string updates,
      // explicit null clears, empty/missing leaves unchanged.
      if (typeof body.glyph === "string" && body.glyph.trim().length > 0) {
        fields.push("glyph = ?");
        values.push(body.glyph.trim());
      } else if (body.glyph === null) {
        fields.push("glyph = ?");
        values.push(null);
      }
      if (typeof body.chatEnabled === "boolean") {
        fields.push("chat_enabled = ?");
        values.push(resolveBotChatEnabled(body.chatEnabled));
      }
      if (fields.length > 0) {
        fields.push("updated_at = ?");
        values.push(new Date().toISOString());
        values.push(botId, userId);
        db.prepare(`UPDATE bots SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
      }
      json(ctx.res, 200, { ok: true });
    }),
    route("DELETE", "/api/bots/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      deleteBot(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true });
    }),
    route("DELETE", "/api/bots/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?").run(ctx.params.id, userId);
      json(ctx.res, 200, { ok: true });
    }),
    // Bulk-clear — removes every bot the caller owns in one atomic
    // transaction, or the newest `limit` bots when the Developer Tools
    // panel asks for a bounded cleanup. Historical messages/conversations
    // keep their rows — only `bot_id` is nulled out, mirroring the
    // single-bot delete contract.
    route("DELETE", "/api/bots", async (ctx) => {
      const userId = requireAuth(ctx);
      const rawLimit = ctx.query.get("limit");
      if (rawLimit !== null) {
        const limit = Number(rawLimit);
        if (!Number.isInteger(limit) || limit < 1) {
          throw new Error("Bot delete limit must be a positive integer.");
        }
        const deleted = deleteBots(db, userId, limit);
        json(ctx.res, 200, { ok: true, deleted });
        return;
      }
      const deleted = deleteAllBots(db, userId);
      json(ctx.res, 200, { ok: true, deleted });
    }),
    route("POST", "/api/conversations/:id/export", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const conversation = db.prepare(
        "SELECT id, title, bot_id, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?"
      ).get(conversationId, userId) as { id: string; title: string; bot_id: string | null; created_at: string; updated_at: string } | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      const messages = db.prepare(
        "SELECT role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      ).all(conversationId, userId) as Array<{ role: string; content: string; created_at: string }>;
      const lines = [
        `# ${conversation.title}`,
        `> Exported ${new Date().toISOString()}`,
        "",
      ];
      for (const msg of messages) {
        lines.push(`**${msg.role === "assistant" ? "Assistant" : "You"}** _(${msg.created_at})_`);
        lines.push("");
        lines.push(msg.content);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
      const markdown = lines.join("\n");
      const exportId = randomId(12);
      db.prepare(
        "INSERT INTO conversation_exports (id, user_id, conversation_id, markdown, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(exportId, userId, conversationId, markdown, conversation.bot_id, new Date().toISOString());
      json(ctx.res, 200, { ok: true, exportId, markdown });
    }),
    route("GET", "/api/exports", async (ctx) => {
      const userId = requireAuth(ctx);
      const rows = db.prepare(
        "SELECT id, conversation_id, bot_id, created_at FROM conversation_exports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      ).all(userId);
      json(ctx.res, 200, { ok: true, exports: rows });
    }),
    route("GET", "/api/exports/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const row = db.prepare(
        "SELECT id, conversation_id, markdown, bot_id, created_at FROM conversation_exports WHERE id = ? AND user_id = ?"
      ).get(ctx.params.id, userId);
      if (!row) {
        throw new Error("Export not found.");
      }
      json(ctx.res, 200, { ok: true, export: row });
    }),
    // Rewind a conversation to just before a given user message and return
    // the original text so the client can resubmit it through /api/chat
    // under whatever bot / provider / incognito settings are currently
    // live. Server-side truncation + thread-scoped summary purge is
    // atomic; the subsequent /api/chat call is a separate step so it
    // inherits the existing autoMemory / summarization pipeline unchanged.
    route("POST", "/api/conversations/:id/rewind", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const body = ctx.body as Record<string, unknown>;
      const messageId = typeof body.messageId === "string" ? body.messageId : null;
      if (!messageId) {
        throw new Error("messageId is required.");
      }
      const { content } = rewindConversation(db, userId, conversationId, messageId);
      json(ctx.res, 200, { ok: true, message: content });
    }),
    route("POST", "/api/conversations/:id/fork", async (ctx) => {
      const userId = requireAuth(ctx);
      const parentId = ctx.params.id;
      const body = ctx.body as Record<string, unknown>;
      const forkMessageId = typeof body.messageId === "string" ? body.messageId : null;
      const parent = db.prepare("SELECT id, title, bot_id, incognito FROM conversations WHERE id = ? AND user_id = ?").get(parentId, userId) as { id: string; title: string; bot_id: string | null; incognito: number } | undefined;
      if (!parent) {
        throw new Error("Parent conversation not found.");
      }
      const forkId = randomId(12);
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO conversations (id, user_id, title, bot_id, parent_id, fork_message_id, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(forkId, userId, `Fork of ${parent.title}`, parent.bot_id, parentId, forkMessageId, parent.incognito, now, now);
      let messageQuery = "SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC";
      let messages: Array<{ id: string; role: string; content: string; created_at: string }>;
      if (forkMessageId) {
        const cutoff = db.prepare("SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?").get(forkMessageId, parentId) as { created_at: string } | undefined;
        if (cutoff) {
          messages = db.prepare(messageQuery + " ").all(parentId, userId).filter((m: any) => m.created_at <= cutoff.created_at) as any;
        } else {
          messages = db.prepare(messageQuery).all(parentId, userId) as any;
        }
      } else {
        messages = db.prepare(messageQuery).all(parentId, userId) as any;
      }
      for (const msg of messages) {
        db.prepare(
          "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(randomId(12), forkId, userId, msg.role, msg.content, msg.created_at);
      }
      json(ctx.res, 201, { ok: true, conversationId: forkId });
    }),
    route("GET", "/api/health", async (ctx) => {
      json(ctx.res, 200, { ok: true, uptime: process.uptime() });
    })
  ];
}

const routes = buildRoutes();

void purgeInactiveAccounts();
setInterval(() => {
  void purgeInactiveAccounts();
}, INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS);

// Periodic purge of generated-image rows past their 30-day retention. OpenAI
// image URLs expire on their side long before this cutoff, so the rows are
// just dead references by the time they age out.
purgeExpiredImages(db);
setInterval(() => {
  purgeExpiredImages(db);
}, GENERATED_IMAGE_CLEANUP_INTERVAL_MS);

const server = createServer(async (req, res) => {
  try {
    setCorsHeaders(res, req.headers.origin as string | undefined);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method ?? "GET";
    const body =
      method === "POST" || method === "PATCH" ? await readJsonBody(req) : {};
    const matchingRoute = routes.find(
      (candidate) => candidate.method === method && candidate.pattern.test(pathname)
    );
    if (!matchingRoute) {
      json(res, 404, { ok: false, error: "Route not found." });
      return;
    }

    await matchingRoute.handler({
      req,
      res,
      body,
      query: url.searchParams,
      params: parseParams(matchingRoute, pathname)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    json(res, 400, {
      ok: false,
      error: message
    });
  }
});

server.listen(config.apiPort, () => {
  console.log(`API ready at http://localhost:${config.apiPort}`);
});
