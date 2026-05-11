import { createServer } from "node:http";
import { existsSync, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAppConfig } from "@localai/config";
import { createDatabase } from "./db.ts";
import { clearCookie, HttpError, json, readJsonBody, setCookie, setCorsHeaders } from "./utils.http.ts";
import { decryptJson, decryptText, deriveMasterKey, encryptText, hashPassword, randomId, verifyPassword } from "./security.ts";
import type { RouteDefinition, RequestContext } from "./types.ts";
import {
  createClientAccessToken,
  requireValidClientAccess,
  requireValidSession,
  resolveClientAccessToken,
  resolveSessionToken,
} from "./auth.ts";
import { buildHealthResponse } from "./health.ts";
import { consumePairingCode, createPairingCode } from "./pairing.ts";
import { startPrismDiscovery, type StopDiscovery } from "./discovery.ts";
import { processChatMessage, readBotOpinion, refreshConversationTitle, upsertBotOpinion } from "./chat.ts";
import {
  createCoffeeConversation,
  parseStoredCoffeeSessionSettings,
  processCoffeeAutonomousTurn,
  processCoffeeTurn,
  updateCoffeeConversationSettings,
} from "./coffee.ts";
import {
  createDevSeedMemories,
  demoteMemoryToShortTerm,
  deleteMemoryById,
  deleteOrphanedBotMemories,
  filterConflictingMemories,
  normalizeMemoryDurability,
  restoreMemory
} from "./memory.ts";
import { inferAndStoreBotMemories } from "./memory-inference.ts";
import {
  createDevSeedConversations,
  deleteAllConversations,
  deleteConversation,
  deleteConversationsByBot,
  getConversationSweepState,
  listConversationSummaries,
  rewindConversation,
  sweepConversations,
  undoLatestConversationSweep,
} from "./conversations.ts";
import {
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  normalizeBotExportHash,
  resolveBotExportHashForCreate,
} from "./bots.ts";
import {
  normalizeComfyUiHostForStatusCheck,
  normalizeOllamaHostForStatusCheck,
  parseHiddenBotModelIds,
  resolveNextSettings,
} from "./settings.ts";
import { normalizeMemoryDisplayText } from "./memory-validation.ts";
import {
  buildModelCatalog,
  checkLocalModelHostStatus,
  getAuxiliaryProvider,
  selectProvider,
} from "./providers.ts";
import type { GenerateOptions } from "./providers.ts";
import { resolveAutoModel, REQUIRED_PRIMARY_LOCAL_MODEL_ID } from "./model-routing.ts";
import { LocalOnlyBackupAdapter, exportUserSnapshot, importUserSnapshot, type BackupSnapshot } from "./backup.ts";
import {
  composeAugmentedImagePrompt,
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  encodeComfyUiModelId,
  hydrateAssistantMessageParts,
  isAllowedInAppOllamaPullModelName,
  type BotOpinion,
  type BotOpinionBoundaryLevel,
  type ChatMessage,
  type OpinionBand,
  type OpinionTrend,
  type SessionOpinion,
} from "@localai/shared";
import { generateImage } from "./image-provider.ts";
import { generateLocalImageBytesByModelId } from "./image-local-by-model.ts";
import { shouldAttemptLenientLocalImageFallback } from "./image-lenient-fallback.ts";
import {
  checkComfyUiHostStatus,
  fetchComfyUiCheckpointNames,
  probeComfyUiHostReachable,
} from "./comfyui-image.ts";
import {
  botBelongsToUser,
  resolveImageGeneratePersistence,
} from "./image-generate-resolve.ts";
import {
  buildGeneratedImageRelativePath,
  downloadRemoteImage,
  readGeneratedImageBytes,
  removeGeneratedImagesDirectoryForUser,
  resolveAbsoluteUnderDataRoot,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytes,
} from "./image-storage.ts";
import { inferBotImagePromptSuggestions, inferRandomImageSceneLine } from "./image-prompt-suggestions.ts";
import {
  clearThreadCompactions,
  getLatestSandboxBotStatusSummary,
  getLatestThreadDisplaySummary,
  getLatestThreadSummary,
  getThreadCompactionDebug,
  summarizeSandboxBotStatus,
  summarizeThreadCompact,
} from "./memory-summarizer.ts";
import {
  INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS,
  getInactiveAccountCutoff
} from "./account-retention.ts";
import { deleteVectorsForUser } from "./qdrant.ts";
const config = getAppConfig();
const db = createDatabase();
const masterKey = deriveMasterKey(config.encryptionMasterKey);
const backupAdapter = new LocalOnlyBackupAdapter();
const LOCAL_OWNER_EMAIL = "prism-owner@local.prism";
const LOCAL_OWNER_DISPLAY_NAME = "Prism Owner";
const memoryInferenceCheckedAtByScope = new Map<string, string>();
const COMPOSER_CLEANUP_MAX_INPUT_CHARS = 8000;
const COMPOSER_CLEANUP_SYSTEM_PROMPT =
  "You are Prism's composer proofreader. Correct spelling, grammar, punctuation, and obvious autocorrect mistakes only. Preserve the user's meaning, tone, markdown, line breaks, emoji, code blocks, names, and URLs. Do not add explanations, labels, quotes, or commentary. Return only the corrected text. If nothing needs correction, return the original text exactly.";

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
  composer_writing_assist: number;
  auto_switch_model: number;
  hidden_bot_model_ids: string;
  preferred_local_model: string | null;
  preferred_online_model: string | null;
  lenient_local_fallback_model: string | null;
  lenient_local_image_fallback_model: string | null;
  secondary_ollama_host: string | null;
  comfyui_host: string | null;
  preferred_local_image_model: string | null;
  preferred_openai_image_model: string | null;
  dev_memories_enabled: number;
  dev_memories_text: string;
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
  return resolveSessionToken(ctx.req.headers, config.sessionCookieName);
}

function requireAuth(ctx: RequestContext): string {
  const sessionToken = getSessionToken(ctx);
  const session = requireValidSession(db, sessionToken);
  ctx.sessionToken = session.token;
  ctx.userId = session.userId;
  touchUserActivity(session.userId);
  return session.userId;
}

function requireClientAccess(ctx: RequestContext): void {
  requireValidClientAccess(db, resolveClientAccessToken(ctx.req.headers));
}

function isLoopbackRequest(ctx: RequestContext): boolean {
  const address = ctx.req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function requireLoopback(ctx: RequestContext): void {
  if (!isLoopbackRequest(ctx)) {
    throw new Error("Local pairing codes can only be generated on this Mac.");
  }
}

function getOrCreateLocalOwnerUser(): string {
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(LOCAL_OWNER_EMAIL) as { id?: string } | undefined;
  if (existing?.id) {
    touchUserActivity(existing.id);
    return existing.id;
  }

  const userId = randomId(12);
  const salt = randomId(8);
  const passwordHash = hashPassword(randomId(32), salt);
  const userKey = Buffer.from(randomId(32), "hex");
  const wrappedUserKey = encryptText(userKey.toString("base64"), masterKey);
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (
      id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
      theme, preferred_provider, auto_memory, auto_switch_model, created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'system', 'local', 1, 0, ?, ?)
  `).run(
    userId,
    LOCAL_OWNER_EMAIL,
    LOCAL_OWNER_DISPLAY_NAME,
    passwordHash,
    salt,
    wrappedUserKey.ciphertext,
    wrappedUserKey.iv,
    wrappedUserKey.tag,
    createdAt,
    createdAt
  );

  return userId;
}

function getUserRow(userId: string): UserDbRow {
  const row = db
    .prepare(
      "SELECT id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, theme, preferred_provider, provider_locked, auto_memory, composer_writing_assist, auto_switch_model, hidden_bot_model_ids, preferred_local_model, preferred_online_model, lenient_local_fallback_model, lenient_local_image_fallback_model, secondary_ollama_host, comfyui_host, preferred_local_image_model, preferred_openai_image_model, dev_memories_enabled, dev_memories_text, openai_key_ciphertext, openai_key_iv, openai_key_tag, created_at, last_active_at FROM users WHERE id = ?"
    )
    .get(userId) as UserDbRow | undefined;
  if (!row) {
    throw new Error("User not found.");
  }
  return row;
}

function toUserProfile(row: UserDbRow): Record<string, unknown> {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: "user",
    createdAt: row.created_at,
    theme: row.theme,
    preferredProvider: row.preferred_provider,
  };
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

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readComposerCleanupText(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Composer text is required.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("Composer text is required.");
  }
  if (trimmed.length > COMPOSER_CLEANUP_MAX_INPUT_CHARS) {
    throw new Error("Composer text is too long to clean up at once.");
  }
  return trimmed;
}

function normalizeComposerCleanupResponse(raw: string, original: string): string {
  const cleaned = raw.trim();
  if (!cleaned) {
    throw new Error("Writing cleanup returned an empty result.");
  }
  const fenced = cleaned.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/);
  const unwrapped = fenced?.[1]?.trim() ?? cleaned;
  if (!unwrapped) {
    throw new Error("Writing cleanup returned an empty result.");
  }
  return unwrapped.length > COMPOSER_CLEANUP_MAX_INPUT_CHARS
    ? original
    : unwrapped;
}

function clampConnectionScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function connectionBandFromScore(score: number): OpinionBand {
  if (score >= 68) return "trusting";
  if (score <= 34) return "guarded";
  return "warming";
}

function readConnectionTrend(value: unknown): OpinionTrend {
  return value === "up" || value === "down" || value === "steady" ? value : "steady";
}

function readConnectionReasons(value: unknown, fallback: string): string[] {
  const reasons = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const cleaned = [fallback, ...reasons]
    .map((reason) => reason.trim())
    .filter((reason) => reason.length > 0);
  return Array.from(new Set(cleaned)).slice(0, 4);
}

function parseConversationBotGroupIds(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  } catch {
    return [];
  }
}

function parseConversationCoffeeSeatBotIds(raw: string | null | undefined): Array<string | null> {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.some((value) => value === null)) return [];
    const seats = parsed.slice(0, 5).map((value) =>
      typeof value === "string" && value.length > 0 ? value : null
    );
    while (seats.length < 5) seats.push(null);
    return seats;
  } catch {
    return [];
  }
}

function parseSourceMessageIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
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
    db.prepare("DELETE FROM client_access_tokens WHERE user_id = ?").run(userId);
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
    removeGeneratedImagesDirectoryForUser(userId);
  } catch {
    // Best-effort filesystem cleanup after SQLite removes image rows.
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

function mapImageRowToClient(row: {
  id: string;
  prompt: string;
  revised_prompt: string | null;
  url: string;
  size: string;
  quality: string;
  provider: string;
  bot_id: string | null;
  created_at: string;
  local_rel_path: string | null;
  model: string | null;
}): Record<string, unknown> {
  const hasLocalFile = Boolean(row.local_rel_path?.trim());
  const displayUrl = hasLocalFile
    ? `/api/images/${encodeURIComponent(row.id)}/file`
    : row.url;
  return {
    id: row.id,
    botId: row.bot_id,
    prompt: row.prompt,
    revisedPrompt: row.revised_prompt,
    size: row.size,
    quality: row.quality,
    provider: row.provider,
    model: row.model ?? DEFAULT_OPENAI_IMAGE_MODEL_ID,
    createdAt: row.created_at,
    url: row.url,
    localRelPath: row.local_rel_path,
    displayUrl,
    hasLocalFile,
  };
}

type ImageInsertPersistence = {
  conversationIdForInsert: string | null;
  persistedBotId: string | null;
};

/** Persists a ComfyUI or Ollama image and returns the standard JSON success body. */
function finalizeComfyOrOllamaGeneratedImageResponse(
  ctx: RequestContext,
  args: {
    imageId: string;
    userId: string;
    persistence: ImageInsertPersistence;
    prompt: string;
    localRelPath: string;
    size: string;
    quality: string;
    imageBytes: Buffer;
    modelUsed: string;
    provider: "comfyui" | "ollama";
  }
): void {
  try {
    writeGeneratedImageBytes(args.localRelPath, args.imageBytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "write failed";
    throw new Error(`Could not save generated image (${detail}).`);
  }

  const storedUrl = `/api/images/${encodeURIComponent(args.imageId)}/file`;

  try {
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      args.imageId,
      args.userId,
      args.persistence.conversationIdForInsert,
      args.persistence.persistedBotId,
      args.prompt,
      args.prompt,
      storedUrl,
      args.size,
      args.quality,
      args.provider,
      args.modelUsed,
      args.localRelPath,
      new Date().toISOString()
    );
  } catch (error) {
    tryUnlinkGeneratedImageFile(args.localRelPath);
    throw error;
  }

  const displayUrl = storedUrl;
  json(ctx.res, 200, {
    ok: true,
    image: {
      id: args.imageId,
      url: storedUrl,
      revisedPrompt: args.prompt,
      displayUrl,
      hasLocalFile: true,
      model: args.modelUsed,
    },
  });
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
    route("POST", "/api/auth/change-password", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const newPassword = readString(body.newPassword, "newPassword");
      const creds = db
        .prepare("SELECT password_hash, password_salt FROM users WHERE id = ?")
        .get(userId) as { password_hash?: string; password_salt?: string } | undefined;
      if (!creds?.password_hash || !creds?.password_salt) {
        throw new Error("Unable to change password for this account.");
      }
      if (verifyPassword(newPassword, creds.password_salt, creds.password_hash)) {
        throw new Error("New password must be different from your current password.");
      }
      const salt = randomId(8);
      const passwordHash = hashPassword(newPassword, salt);
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(
        passwordHash,
        salt,
        userId
      );
      touchUserActivity(userId);
      json(ctx.res, 200, { ok: true });
    }),
    route("DELETE", "/api/account", async (ctx) => {
      const userId = requireAuth(ctx);
      await deleteUserAccount(userId);
      clearCookie(ctx.res, config.sessionCookieName);
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/auth/me", async (ctx) => {
      const sessionToken = getSessionToken(ctx);
      if (!sessionToken) {
        json(ctx.res, 200, { ok: true, user: null });
        return;
      }

      let userId: string;
      try {
        const session = requireValidSession(db, sessionToken);
        ctx.sessionToken = session.token;
        ctx.userId = session.userId;
        userId = session.userId;
        touchUserActivity(session.userId);
      } catch {
        clearCookie(ctx.res, config.sessionCookieName);
        json(ctx.res, 200, { ok: true, user: null });
        return;
      }
      const row = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        user: toUserProfile(row)
      });
    }),
    route("GET", "/api/client-access/me", async (ctx) => {
      requireClientAccess(ctx);
      json(ctx.res, 200, { ok: true });
    }),
    route("POST", "/api/pairing/codes", async (ctx) => {
      const userId = requireAuth(ctx);
      const pairingCode = createPairingCode(db, userId);
      json(ctx.res, 201, { ok: true, pairingCode });
    }),
    route("POST", "/api/local/pairing/codes", async (ctx) => {
      requireLoopback(ctx);
      const userId = getOrCreateLocalOwnerUser();
      const pairingCode = createPairingCode(db, userId);
      json(ctx.res, 201, { ok: true, pairingCode });
    }),
    route("POST", "/api/pairing/exchange", async (ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const code = readString(body.code, "code");
      const { userId } = consumePairingCode(db, code);
      const { token, expiresAt } = createSession(userId);
      const clientAccess = createClientAccessToken(db, userId, config.sessionTtlHours);
      touchUserActivity(userId);
      const row = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        token,
        clientAccessToken: clientAccess.token,
        clientAccessExpiresAt: clientAccess.expiresAt,
        expiresAt,
        user: toUserProfile(row)
      });
    }),
    route("GET", "/api/conversations", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        conversations: listConversationSummaries(db, userId)
      });
    }),
    route("GET", "/api/conversations/sweep/state", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        ...getConversationSweepState(db, userId),
      });
    }),
    route("POST", "/api/conversations/sweep", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const mode = body.mode === "chat" ? "chat" : "sandbox";
      const result = sweepConversations(db, userId, mode);
      const state = getConversationSweepState(db, userId);
      json(ctx.res, 200, {
        ok: true,
        ...result,
        canUndo: state.canUndo,
      });
    }),
    route("POST", "/api/conversations/sweep/undo", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const batchId = typeof body.batchId === "string" ? body.batchId : null;
      const result = undoLatestConversationSweep(db, userId, batchId);
      const state = getConversationSweepState(db, userId);
      json(ctx.res, 200, {
        ok: true,
        ...result,
        canUndo: state.canUndo,
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
          `SELECT c.id, c.title, c.conversation_mode, c.bot_id, c.bot_group_ids, c.coffee_settings, c.incognito, c.created_at, c.updated_at,
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
            conversation_mode: string | null;
            bot_id: string | null;
            bot_group_ids: string | null;
            coffee_settings: string | null;
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
          `SELECT m.id, m.role, m.content, m.provider, m.model, m.tool_payload, m.created_at,
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
        model: string | null;
        tool_payload: string | null;
        bot_name: string | null;
        bot_color: string | null;
        bot_glyph: string | null;
        created_at: string;
      }>;
      // Match the shared ChatMessage shape used by POST /api/chat and the
      // web UI so both endpoints agree.
      const messages = messageRows.map((row): ChatMessage => {
        const shared: ChatMessage = {
          id: row.id,
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
          provider:
            row.provider === "local" || row.provider === "openai"
              ? row.provider
              : undefined,
          model: row.model ?? undefined,
          botName: row.bot_name ?? undefined,
          botColor: row.bot_color ?? undefined,
          botGlyph: row.bot_glyph ?? undefined,
        };
        if (row.role !== "assistant") return shared;
        const assembled = hydrateAssistantMessageParts({
          content: row.content,
          toolPayload: row.tool_payload,
        });
        return {
          ...shared,
          content: assembled.content,
          ...(assembled.moodKey ? { moodKey: assembled.moodKey } : {}),
          ...(assembled.moodConfidence !== undefined
            ? { moodConfidence: assembled.moodConfidence }
            : {}),
          ...(assembled.askQuestion ? { askQuestion: assembled.askQuestion } : {}),
          ...(assembled.sentGeneratedImage
            ? { sentGeneratedImage: assembled.sentGeneratedImage }
            : {}),
        };
      });
      const opinionRow = db
        .prepare(
          `SELECT score, band, trend, last_reason, recent_reasons, updated_at
           FROM session_opinions
           WHERE user_id = ? AND conversation_id = ? AND bot_scope_key = ?
           LIMIT 1`
        )
        .get(
          userId,
          conversationId,
          conversation.bot_id ?? "__default__"
        ) as
        | {
            score: number;
            band: string;
            trend: string;
            last_reason: string;
            recent_reasons: string;
            updated_at: string;
          }
        | undefined;
      const opinion = opinionRow
        ? {
            score: Math.round(opinionRow.score),
            band:
              opinionRow.band === "guarded" ||
              opinionRow.band === "warming" ||
              opinionRow.band === "trusting"
                ? opinionRow.band
                : "warming",
            trend:
              opinionRow.trend === "up" ||
              opinionRow.trend === "down" ||
              opinionRow.trend === "steady"
                ? opinionRow.trend
                : "steady",
            lastReason: opinionRow.last_reason || "No opinion shift yet.",
            recentReasons: (() => {
              try {
                const parsed = JSON.parse(opinionRow.recent_reasons) as unknown;
                if (!Array.isArray(parsed)) return [];
                return parsed
                  .filter((item): item is string => typeof item === "string")
                  .slice(0, 4);
              } catch {
                return [];
              }
            })(),
            updatedAt: opinionRow.updated_at,
          }
        : undefined;
      const botOpinion = readBotOpinion(db, userId, conversation.bot_id ?? null);
      const conversationModeOut: "chat" | "sandbox" | "coffee" =
        conversation.conversation_mode === "chat"
          ? "chat"
          : conversation.conversation_mode === "coffee"
            ? "coffee"
            : "sandbox";
      const botGroupIdsOut = parseConversationBotGroupIds(conversation.bot_group_ids);
      const coffeeSeatBotIdsOut = parseConversationCoffeeSeatBotIds(conversation.bot_group_ids);
      const coffeeSettingsOut =
        conversationModeOut === "coffee"
          ? parseStoredCoffeeSessionSettings(conversation.coffee_settings)
          : undefined;
      json(ctx.res, 200, {
        ok: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          mode: conversationModeOut,
          botId: conversation.bot_id ?? null,
          ...(botGroupIdsOut.length > 0 ? { botGroupIds: botGroupIdsOut } : {}),
          ...(coffeeSeatBotIdsOut.length > 0 ? { coffeeSeatBotIds: coffeeSeatBotIdsOut } : {}),
          ...(coffeeSettingsOut !== undefined ? { coffeeSettings: coffeeSettingsOut } : {}),
          incognito: conversation.incognito === 1,
          lastBotId: conversation.last_bot_id ?? null,
          lastBotColor: conversation.last_bot_color ?? null,
          hasAssistantReply: conversation.has_assistant_reply === 1,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          messages,
        },
        ...(opinion ? { opinion } : {}),
        ...(botOpinion ? { botOpinion } : {}),
      });
    }),
    route("POST", "/api/conversations/:id/title", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversation = await refreshConversationTitle(db, userId, ctx.params.id);
      json(ctx.res, 200, {
        ok: true,
        conversation,
      });
    }),
    route("GET", "/api/conversations/:id/summary", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const mode = ctx.query.get("mode") === "chat" ? "chat" : "sandbox";
      const owned = db
        .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
        .get(conversationId, userId) as { id?: string } | undefined;
      if (!owned?.id) {
        throw new Error("Conversation not found.");
      }
      const debug = getThreadCompactionDebug(db, userId, conversationId, mode);
      json(ctx.res, 200, {
        ok: true,
        summary: getLatestThreadDisplaySummary(db, userId, conversationId, mode),
        internalSummary: getLatestThreadSummary(db, userId, conversationId, mode),
        latestSummaryAt: debug.latestSummaryAt,
      });
    }),
    route("GET", "/api/bots/:id/summary", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const botId = ctx.params.id;
      const mode = ctx.query.get("mode") === "chat" ? "chat" : "sandbox";
      const owned = db
        .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
        .get(botId, userId) as { id?: string } | undefined;
      if (!owned?.id) {
        throw new Error("Bot not found.");
      }
      if (mode !== "sandbox") {
        json(ctx.res, 200, { ok: true, summary: null });
        return;
      }
      // Always run a refresh pass so display-copy improvements and format
      // updates can roll forward without requiring message activity.
      await summarizeSandboxBotStatus(
        db,
        getAuxiliaryProvider(),
        userId,
        botId,
        { reason: "manual", userKey }
      );
      const summary = getLatestSandboxBotStatusSummary(db, userId, botId);
      json(ctx.res, 200, {
        ok: true,
        summary,
      });
    }),
    route("GET", "/api/conversations/:id/summarization-debug", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const mode = ctx.query.get("mode") === "chat" ? "chat" : "sandbox";
      const owned = db
        .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
        .get(conversationId, userId) as { id?: string } | undefined;
      if (!owned?.id) {
        throw new Error("Conversation not found.");
      }
      json(ctx.res, 200, {
        ok: true,
        debug: getThreadCompactionDebug(db, userId, conversationId, mode),
      });
    }),
    route("POST", "/api/conversations/:id/summarization-debug", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const body = ctx.body as Record<string, unknown>;
      const mode =
        body.mode === "chat" || ctx.query.get("mode") === "chat"
          ? "chat"
          : "sandbox";
      const action = body.action === "reset" ? "reset" : "run";
      const reason =
        body.reason === "mode_exit"
          ? "mode_exit"
          : body.reason === "milestone"
            ? "milestone"
            : "manual";
      const owned = db
        .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
        .get(conversationId, userId) as { id?: string } | undefined;
      if (!owned?.id) {
        throw new Error("Conversation not found.");
      }
      if (action === "reset") {
        const deleted = clearThreadCompactions(db, userId, conversationId, mode);
        json(ctx.res, 200, {
          ok: true,
          deleted,
          debug: getThreadCompactionDebug(db, userId, conversationId, mode),
        });
        return;
      }
      const compacted = await summarizeThreadCompact(
        db,
        getAuxiliaryProvider(),
        userId,
        conversationId,
        { mode, reason, force: true }
      );
      if (mode === "sandbox" && reason === "mode_exit") {
        const conversation = db
          .prepare("SELECT bot_id, incognito FROM conversations WHERE id = ? AND user_id = ?")
          .get(conversationId, userId) as {
          bot_id: string | null;
          incognito: number;
        } | undefined;
        const conversationBotId =
          typeof conversation?.bot_id === "string" && conversation.bot_id.trim().length > 0
            ? conversation.bot_id.trim()
            : null;
        if (conversation?.incognito !== 1 && conversationBotId) {
          const userKey = decryptUserKey(userId);
          await summarizeSandboxBotStatus(
            db,
            getAuxiliaryProvider(),
            userId,
            conversationBotId,
            { reason: "mode_exit", userKey }
          );
        }
      }
      json(ctx.res, 200, {
        ok: true,
        compacted,
        debug: getThreadCompactionDebug(db, userId, conversationId, mode),
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
    route("DELETE", "/api/conversations/by-bot/:botId", async (ctx) => {
      const userId = requireAuth(ctx);
      const botId = ctx.params.botId === "_default" ? null : ctx.params.botId;
      const deleted = deleteConversationsByBot(db, userId, botId);
      json(ctx.res, 200, { ok: true, deleted });
    }),
    route("POST", "/api/conversations/dev-seed", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 2000) {
        throw new Error("Chat seed count must be between 1 and 2000.");
      }
      const created = createDevSeedConversations(db, userId, count);
      json(ctx.res, 200, { ok: true, created });
    }),
    route("POST", "/api/conversations/:id/dev-connection", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversation = db
        .prepare("SELECT id, bot_id FROM conversations WHERE id = ? AND user_id = ?")
        .get(ctx.params.id, userId) as { id: string; bot_id: string | null } | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      const body = ctx.body as Record<string, unknown>;
      const score = clampConnectionScore(Number(body.score));
      const band = connectionBandFromScore(score);
      const trend = readConnectionTrend(body.trend);
      const lastReason =
        readOptionalString(body.lastReason) ?? "Developer Tools set the connection state.";
      const recentReasons = readConnectionReasons(body.recentReasons, lastReason);
      const updatedAt = new Date().toISOString();
      const botScopeKey = conversation.bot_id ?? "__default__";

      db.prepare(
        `INSERT INTO session_opinions (
          user_id, conversation_id, bot_scope_key, bot_id, score, band, trend, last_reason, recent_reasons, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, conversation_id, bot_scope_key) DO UPDATE SET
          bot_id = excluded.bot_id,
          score = excluded.score,
          band = excluded.band,
          trend = excluded.trend,
          last_reason = excluded.last_reason,
          recent_reasons = excluded.recent_reasons,
          updated_at = excluded.updated_at`
      ).run(
        userId,
        conversation.id,
        botScopeKey,
        conversation.bot_id ?? null,
        score,
        band,
        trend,
        lastReason,
        JSON.stringify(recentReasons),
        updatedAt
      );

      const opinion: SessionOpinion = {
        score,
        band,
        trend,
        lastReason,
        recentReasons,
        updatedAt,
      };
      json(ctx.res, 200, { ok: true, opinion });
    }),
    route("POST", "/api/bots/:id/dev-opinion", async (ctx) => {
      const userId = requireAuth(ctx);
      const requestedBotId = ctx.params.id === "_default" ? null : ctx.params.id;
      if (requestedBotId) {
        const bot = db
          .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
          .get(requestedBotId, userId) as { id?: string } | undefined;
        if (!bot?.id) {
          throw new Error("Bot not found.");
        }
      }
      const body = ctx.body as Record<string, unknown>;
      const score = clampConnectionScore(Number(body.score));
      const trend = readConnectionTrend(body.trend);
      const lastReason =
        readOptionalString(body.lastReason) ?? "Developer Tools set the bot opinion state.";
      const recentReasons = readConnectionReasons(body.recentReasons, lastReason);
      const repairCount =
        typeof body.repairCount === "number" && Number.isFinite(body.repairCount)
          ? Math.max(0, Math.round(body.repairCount))
          : 0;
      const botOpinion = upsertBotOpinion({
        db,
        userId,
        botId: requestedBotId,
        score,
        trend,
        lastReason,
        recentReasons,
        repairCount,
        updatedAt: new Date().toISOString(),
      });
      json(ctx.res, 200, { ok: true, botOpinion });
    }),
    route("POST", "/api/composer/cleanup", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const text = readComposerCleanupText(body.text);
      const user = getUserRow(userId);
      if (user.composer_writing_assist === 0) {
        throw new Error("Composer writing assistance is disabled in Settings.");
      }

      const forceLocal = body.forceLocal === true;
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      let effectiveProvider = forceLocal ? "local" : user.preferred_provider;
      const catalog = await buildModelCatalog(openAiApiKey, user.secondary_ollama_host);
      const resolvedAuto = resolveAutoModel({
        provider: effectiveProvider,
        explicitModelOverride: null,
        botPreferredModel:
          effectiveProvider === "local"
            ? readOptionalString(user.preferred_local_model)
            : readOptionalString(user.preferred_online_model),
        hiddenModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
        catalog,
      });
      effectiveProvider = resolvedAuto.provider;

      const provider = selectProvider(
        effectiveProvider,
        openAiApiKey,
        user.secondary_ollama_host
      );
      const maxTokens = Math.min(1800, Math.max(160, Math.ceil(text.length / 2)));
      try {
        const raw = await provider.generateResponse(
          [
            { role: "system", content: COMPOSER_CLEANUP_SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          {
            model: resolvedAuto.model,
            temperature: 0.05,
            maxTokens,
          }
        );
        const cleanedText = normalizeComposerCleanupResponse(raw, text);
        json(ctx.res, 200, {
          ok: true,
          text: cleanedText,
          changed: cleanedText !== text,
          provider: effectiveProvider,
          model: resolvedAuto.model,
        });
      } catch (error) {
        if (resolvedAuto.usedRequiredLocalFallback) {
          throw new Error(
            `Prism Server setup problem: the required primary ${REQUIRED_PRIMARY_LOCAL_MODEL_ID} model is unavailable. Install it in Ollama, then try again.`
          );
        }
        throw error;
      }
    }),
    route("POST", "/api/chat", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const starterPrompt = body.starterPrompt === true;
      const starterPromptWarrantsIntro =
        starterPrompt && body.starterPromptWarrantsIntro === true;
      const message = starterPrompt ? "" : readString(body.message, "message");
      const conversationId =
        typeof body.conversationId === "string" ? body.conversationId : undefined;
      const forceNewConversation = body.forceNewConversation === true;
      const sessionEnding = body.sessionEnding === true;
      // Three-valued parse for bot routing:
      //   - absent key           → leave conversation's bot alone
      //   - explicit null        → switch to Default persona (no bot)
      //   - string               → switch to that specific bot
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
      // Incognito is a Chat-mode concept (see chat.ts): it keeps the turn
      // ephemeral and skips memory. We deliberately ignore any `incognito`
      // flag for Sandbox requests so the two modes stay semantically
      // distinct even if a stale client still sends the field.
      const incognito = mode === "chat" && body.incognito === true;
      // Per-request provider override so a fresh sidebar switch takes effect
      // immediately, even if the settings PATCH is still in flight.
      const requestedProvider =
        (mode === "sandbox" || incognito) &&
        (body.preferredProvider === "openai" || body.preferredProvider === "local")
          ? body.preferredProvider
          : undefined;
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      let effectiveProvider = requestedProvider ?? user.preferred_provider;
      const effectiveBotId = botId;
      const explicitModelOverride =
        mode === "sandbox" ? readOptionalString(body.modelOverride) : null;
      if (
        mode === "chat" &&
        !incognito &&
        (
          body.preferredProvider !== undefined ||
          body.modelOverride !== undefined
        )
      ) {
        console.info(
          `[chat-contract] Ignored advanced Chat controls for user ${userId} (provider/model).`
        );
      }
      const ephemeralMessages = Array.isArray(body.ephemeralMessages)
        ? body.ephemeralMessages as ChatMessage[]
        : undefined;

      let botSystemPrompt: string | undefined;
      let starterPromptLabel: string | undefined;
      let botForcesLocalProvider = false;
      let botPreferredModel: string | null = null;
      const generationOverrides: GenerateOptions = {};
      if (effectiveBotId) {
        const bot = db
          .prepare(
            "SELECT name, system_prompt, model, local_model, online_model, online_enabled, temperature, max_tokens FROM bots WHERE id = ? AND (user_id = ? OR visibility = 'public')"
          )
          .get(effectiveBotId, userId) as
          | {
              name?: string;
              system_prompt?: string;
              model?: string | null;
              local_model?: string | null;
              online_model?: string | null;
              online_enabled?: number | null;
              temperature?: number | null;
              max_tokens?: number | null;
            }
          | undefined;
        if (bot) {
          starterPromptLabel = bot.name;
          // Name is folded into the system prompt by composeBotSystemPrompt so
          // the model actually knows who it's supposed to be, even when the
          // user left the prompt field blank. Unit-tested in
          // `__tests__/bots.test.ts`.
          botSystemPrompt = composeBotSystemPrompt(bot.name, bot.system_prompt);
          if (bot.online_enabled === 0 && effectiveProvider === "openai") {
            effectiveProvider = "local";
            botForcesLocalProvider = true;
          }
          botPreferredModel = effectiveProvider === "local"
            ? readOptionalString(bot.local_model) ?? readOptionalString(bot.model)
            : readOptionalString(bot.online_model);
          if (typeof bot.temperature === "number") {
            generationOverrides.temperature = bot.temperature;
          }
          if (typeof bot.max_tokens === "number") {
            generationOverrides.maxTokens = bot.max_tokens;
          }
        }
      }
      if (!starterPromptLabel && effectiveBotId === null) {
        starterPromptLabel = "Prism";
      }

      // Prefer the user's saved key; fall back to the server-wide env key so a
      // single OPENAI_API_KEY in .env makes chat work without double-entry.
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const catalog = await buildModelCatalog(openAiApiKey, user.secondary_ollama_host);
      const resolvedAuto = resolveAutoModel({
        provider: effectiveProvider,
        explicitModelOverride: botForcesLocalProvider ? null : explicitModelOverride,
        botPreferredModel:
          botPreferredModel ??
          (effectiveProvider === "local"
            ? readOptionalString(user.preferred_local_model)
            : readOptionalString(user.preferred_online_model)),
        hiddenModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
        catalog,
      });
      effectiveProvider = resolvedAuto.provider;
      generationOverrides.model = resolvedAuto.model;
      const botOverrides =
        Object.keys(generationOverrides).length > 0
          ? generationOverrides
          : undefined;

      let result: Awaited<ReturnType<typeof processChatMessage>>;
      try {
        result = await processChatMessage(
          db,
          userId,
          message,
          userKey,
          {
            preferredProvider: effectiveProvider,
            autoMemory: !incognito && Boolean(user.auto_memory),
            openAiApiKey,
            userDisplayName: user.display_name,
            starterPrompt,
            starterPromptWarrantsIntro,
            starterPromptLabel,
            secondaryOllamaHost: user.secondary_ollama_host,
            lenientLocalFallbackModel: user.lenient_local_fallback_model,
            devMemoriesEnabled: user.dev_memories_enabled === 1,
            devMemoriesText: user.dev_memories_text,
            assistantImageUserPrefs: {
              preferredLocalImageModel: user.preferred_local_image_model,
              preferredOpenAiImageModel: user.preferred_openai_image_model,
              lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
              comfyuiHost: user.comfyui_host,
              secondaryOllamaHost: user.secondary_ollama_host,
            },
            botId: effectiveBotId,
            incognito,
            ephemeralMessages,
            botSystemPrompt,
            botOverrides,
            mode,
            sessionEnding,
            forceNewConversation,
          },
          conversationId
        );
      } catch (error) {
        if (resolvedAuto.usedRequiredLocalFallback) {
          throw new Error(
            `Prism Server setup problem: the required primary ${REQUIRED_PRIMARY_LOCAL_MODEL_ID} model is unavailable. Install it in Ollama, then try again.`
          );
        }
        throw error;
      }
      const {
        conversation,
        conversationStarters,
        fallbackInvocation,
        memoryLearned,
        opinion,
        botOpinion,
        summaryCompaction,
      } = result;
      json(ctx.res, 200, {
        ok: true,
        conversation,
        ...(fallbackInvocation ? { fallbackInvocation } : {}),
        ...(opinion ? { opinion } : {}),
        ...(botOpinion ? { botOpinion } : {}),
        ...(summaryCompaction ? { summaryCompaction } : {}),
        ...(memoryLearned ? { memoryLearned } : {}),
        ...(conversationStarters ? { conversationStarters } : {}),
      });
    }),
    // Coffee mode (timed live sessions for 3-5 reactive bots). Lives on its own
    // endpoint rather than inside /api/chat so the lighter coffee
    // pipeline (router LLM + per-bot reply, no cross-thread memory) can
    // evolve independently of the heavier Chat/Sandbox flow.
    route("POST", "/api/coffee/sessions", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const groupBotIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : undefined;
      const result = createCoffeeConversation(db, userId, {
        groupBotIds,
        coffeeSettings: body.coffeeSettings,
      });
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("PATCH", "/api/coffee/sessions/:id/settings", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const coffeeSettings = updateCoffeeConversationSettings(
        db,
        userId,
        ctx.params.id,
        body.coffeeSettings ?? body
      );
      json(ctx.res, 200, {
        ok: true,
        coffeeSettings,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/continue", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const directedSpeakerBotId =
        typeof body.directedSpeakerBotId === "string"
          ? body.directedSpeakerBotId
          : undefined;
      const userIsComposing = body.userIsComposing === true;
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const result = await processCoffeeAutonomousTurn(
        db,
        userId,
        ctx.params.id,
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          userDisplayName: user.display_name,
          userKey,
        },
        userIsComposing,
        directedSpeakerBotId
      );
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("POST", "/api/coffee/turn", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const message = readString(body.message, "message");
      const conversationId =
        typeof body.conversationId === "string" ? body.conversationId : undefined;
      const groupBotIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : undefined;
      const interruptionInput =
        body.playerInterruption && typeof body.playerInterruption === "object"
          ? (body.playerInterruption as Record<string, unknown>)
          : undefined;
      const playerInterruption =
        interruptionInput &&
        typeof interruptionInput.interruptedMessageId === "string" &&
        typeof interruptionInput.interruptedBotId === "string"
          ? {
              interruptedMessageId: interruptionInput.interruptedMessageId,
              interruptedBotId: interruptionInput.interruptedBotId,
              visibleTokenCount:
                typeof interruptionInput.visibleTokenCount === "number"
                  ? interruptionInput.visibleTokenCount
                  : 1,
            }
          : undefined;
      // Per-request provider override matches Sandbox's /api/chat semantics:
      // the client toggle wins over the user's saved preferred_provider for
      // this single turn. Anything else (including absent or malformed)
      // falls back to the saved preference.
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const result = await processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          groupBotIds,
          message,
          playerInterruption,
        },
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          userDisplayName: user.display_name,
          userKey,
        }
      );
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("GET", "/api/memories", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const conversationId = readOptionalString(ctx.query.get("conversationId"));
      const botId = readOptionalString(ctx.query.get("botId"));
      const scope = readOptionalString(ctx.query.get("scope"));
      deleteOrphanedBotMemories(db, userId);
      if (botId) {
        const inferenceState = db.prepare(`
          SELECT
            MAX(CASE WHEN source = 'direct' THEN created_at END) AS latest_direct_at,
            MAX(CASE WHEN source = 'inferred' THEN created_at END) AS latest_inferred_at
          FROM memories
          WHERE user_id = ?
            AND bot_id = ?
            AND source IN ('direct', 'inferred')
        `).get(userId, botId) as {
          latest_direct_at?: string | null;
          latest_inferred_at?: string | null;
        } | undefined;
        const latestDirectAt = inferenceState?.latest_direct_at ?? null;
        const latestInferredAt = inferenceState?.latest_inferred_at ?? null;
        const inferenceScopeKey = `${userId}:${botId}`;
        const shouldInfer =
          latestDirectAt !== null &&
          latestDirectAt > (latestInferredAt ?? "1970-01-01") &&
          memoryInferenceCheckedAtByScope.get(inferenceScopeKey) !== latestDirectAt;
        if (shouldInfer) {
          try {
            const auxiliaryProvider = getAuxiliaryProvider();
            await inferAndStoreBotMemories(db, auxiliaryProvider, userId, botId, userKey);
          } catch (error) {
            console.warn("Memory inference skipped:", error);
          } finally {
            memoryInferenceCheckedAtByScope.set(inferenceScopeKey, latestDirectAt);
          }
        }
      }
      type MemoryRow = {
        id: string;
        conversation_id: string | null;
        bot_id: string | null;
        confidence: number;
        category: "general" | "user" | "bot_relation";
        tier: "short_term" | "long_term";
        durability: number | null;
        source: "direct" | "inferred" | "compiled" | "about_you";
        certainty: number | null;
        source_message_ids: string;
        ciphertext: string;
        iv: string;
        tag: string;
        created_at: string;
      };
      const rows = botId
        ? db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND bot_id = ? ORDER BY created_at DESC LIMIT 100"
            )
            .all(userId, botId) as MemoryRow[]
        : scope === "default"
        ? db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND bot_id IS NULL ORDER BY created_at DESC LIMIT 100"
            )
            .all(userId) as MemoryRow[]
        : conversationId
        ? db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 100"
            )
            .all(userId, conversationId) as MemoryRow[]
        : db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
            )
            .all(userId) as MemoryRow[];
      const memoryCountRows = db
        .prepare(
          "SELECT bot_id, COUNT(*) AS count FROM memories WHERE user_id = ? GROUP BY bot_id"
        )
        .all(userId) as Array<{ bot_id: string | null; count: number }>;
      const memoryCountsByBotId: Record<string, number> = {};
      let defaultMemoryCount = 0;
      for (const row of memoryCountRows) {
        if (row.bot_id) {
          memoryCountsByBotId[row.bot_id] = Number(row.count ?? 0);
        } else {
          defaultMemoryCount = Number(row.count ?? 0);
        }
      }
      const decryptedMemories = rows.map((row) => {
        const payload = decryptJson(
          {
            ciphertext: row.ciphertext,
            iv: row.iv,
            tag: row.tag
          },
          userKey
        ) as { text?: string };
        const text = normalizeMemoryDisplayText(payload.text ?? "");
        const durability = normalizeMemoryDurability(row.durability, text);
        return {
          id: row.id,
          conversationId: row.conversation_id ?? undefined,
          botId: row.bot_id ?? undefined,
          confidence: row.confidence,
          category: row.category,
          tier: row.tier,
          durability,
          source: row.source,
          certainty: row.certainty ?? row.confidence,
          sourceMessageIds: parseSourceMessageIds(row.source_message_ids),
          text,
          createdAt: row.created_at
        };
      });
      json(ctx.res, 200, {
        ok: true,
        memories: filterConflictingMemories(decryptedMemories),
        memoryCountsByBotId,
        defaultMemoryCount,
        directCountsByBotId: memoryCountsByBotId,
        defaultDirectCount: defaultMemoryCount
      });
    }),
    route("POST", "/api/memories/dev-seed", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const count = Number(body.count);
      if (!Number.isInteger(count) || count < 1 || count > 2000) {
        throw new Error("Memory seed count must be between 1 and 2000.");
      }
      const requestedBotId = readOptionalString(body.botId);
      const requestedSource = readOptionalString(body.source);
      const source = requestedSource === "inferred" || requestedSource === "compiled"
        || requestedSource === "about_you"
        ? requestedSource
        : "direct";
      const requestedCategory = readOptionalString(body.category);
      const category =
        requestedCategory === "user" || requestedCategory === "bot_relation"
          ? requestedCategory
          : requestedCategory === "general"
            ? "general"
            : undefined;
      const requestedTier = readOptionalString(body.tier);
      const tier =
        requestedTier === "long_term" || requestedTier === "short_term"
          ? requestedTier
          : undefined;
      const requestedCertainty = typeof body.certainty === "number" && Number.isFinite(body.certainty)
        ? Math.max(0, Math.min(1, body.certainty))
        : undefined;
      const requestedDurability = typeof body.durability === "number" && Number.isFinite(body.durability)
        ? Math.max(0, Math.min(1, body.durability))
        : undefined;
      const botIds = requestedBotId
        ? (
            db
              .prepare("SELECT id FROM bots WHERE user_id = ? AND id = ?")
              .all(userId, requestedBotId) as Array<{ id: string }>
          ).map((row) => row.id)
        : (
            db
              .prepare("SELECT id FROM bots WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, name ASC")
              .all(userId) as Array<{ id: string }>
          ).map((row) => row.id);
      if (requestedBotId && botIds.length === 0) {
        throw new Error("Bot not found.");
      }
      const created = createDevSeedMemories(db, userId, userKey, count, botIds, {
        randomizeAcrossBots: !requestedBotId,
        source,
        category,
        tier,
        durability: requestedDurability,
        certainty: requestedCertainty,
      });
      json(ctx.res, 200, { ok: true, created });
    }),
    route("DELETE", "/api/memories", async (ctx) => {
      const userId = requireAuth(ctx);
      const result = db
        .prepare(
          "DELETE FROM memories WHERE user_id = ? AND COALESCE(source, 'direct') != 'about_you'"
        )
        .run(userId);
      json(ctx.res, 200, { ok: true, deleted: Number(result.changes ?? 0) });
    }),
    // Hard-reset per-user memory artifacts: extracted memory facts, SQLite
    // summary rows (both thread-scoped and global), and matching Qdrant
    // vectors. Powers dev slash commands:
    // - `/clear` (default): keeps `about_you` profile rows in SQLite.
    // - `/forget`: same clear path with `includeAboutYou = true`.
    // Qdrant cleanup is best-effort because the local stack often runs
    // without a vector DB attached; SQLite truth wins either way.
    route("POST", "/api/dev/clear-session-memory", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const includeAboutYou = body.includeAboutYou === true;
      let deletedMemories = 0;
      let deletedSummaries = 0;
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        const memoryResult = db
          .prepare(includeAboutYou
            ? "DELETE FROM memories WHERE user_id = ?"
            : "DELETE FROM memories WHERE user_id = ? AND COALESCE(source, 'direct') != 'about_you'"
          )
          .run(userId);
        const summaryResult = db
          .prepare("DELETE FROM memory_summaries WHERE user_id = ?")
          .run(userId);
        deletedMemories = Number(memoryResult.changes ?? 0);
        deletedSummaries = Number(summaryResult.changes ?? 0);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      let vectorsCleared = false;
      try {
        await deleteVectorsForUser(userId);
        vectorsCleared = true;
      } catch {
        vectorsCleared = false;
      }
      json(ctx.res, 200, {
        ok: true,
        deletedMemories,
        deletedSummaries,
        includeAboutYou,
        vectorsCleared,
      });
    }),
    route("POST", "/api/memories/restore", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const text = readString(body.text, "Memory text");
      const botId = readOptionalString(body.botId);
      if (botId) {
        const bot = db
          .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
          .get(botId, userId) as { id?: string } | undefined;
        if (!bot?.id) {
          throw new Error("Bot not found.");
        }
      }
      const conversationId = readOptionalString(body.conversationId);
      const requestedSource = readOptionalString(body.source);
      const source =
        requestedSource === "inferred" || requestedSource === "compiled" || requestedSource === "about_you"
          ? requestedSource
          : "direct";
      const requestedCategory = readOptionalString(body.category);
      const category =
        requestedCategory === "user" || requestedCategory === "bot_relation"
          ? requestedCategory
          : requestedCategory === "general"
            ? "general"
            : undefined;
      const requestedTier = readOptionalString(body.tier);
      const tier =
        requestedTier === "long_term" || requestedTier === "short_term"
          ? requestedTier
          : undefined;
      const confidence =
        typeof body.confidence === "number" && Number.isFinite(body.confidence)
          ? Math.max(0, Math.min(1, body.confidence))
          : undefined;
      const certainty =
        typeof body.certainty === "number" && Number.isFinite(body.certainty)
          ? Math.max(0, Math.min(1, body.certainty))
          : confidence;
      const durability =
        typeof body.durability === "number" && Number.isFinite(body.durability)
          ? Math.max(0, Math.min(1, body.durability))
          : undefined;
      const sourceMessageIds = Array.isArray(body.sourceMessageIds)
        ? body.sourceMessageIds.filter((value): value is string => typeof value === "string")
        : [];
      const memory = await restoreMemory(db, userId, userKey, {
        text,
        botId,
        conversationId,
        confidence,
        category,
        tier,
        durability,
        source,
        certainty,
        sourceMessageIds,
      });
      json(ctx.res, 200, { ok: true, memory });
    }),
    route("POST", "/api/memories/:id/demote", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const confidence =
        typeof body.confidence === "number" && Number.isFinite(body.confidence)
          ? Math.max(0, Math.min(1, body.confidence))
          : undefined;
      const demoted = demoteMemoryToShortTerm(db, userId, ctx.params.id, confidence);
      json(ctx.res, 200, { ok: true, demoted });
    }),
    route("DELETE", "/api/memories/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const allowLongTerm = ctx.query.get("allowLongTerm") === "true";
      const allowAboutYou = ctx.query.get("allowAboutYou") === "true";
      const deleted = deleteMemoryById(db, userId, ctx.params.id, {
        allowLongTerm,
        allowAboutYou,
      });
      json(ctx.res, 200, { ok: true, deleted });
    }),
    route("PATCH", "/api/messages/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const text = readString((ctx.body as Record<string, unknown>).text, "Message text");
      const messageId = ctx.params.id;
      const message = db.prepare(`
        SELECT m.id, m.conversation_id, m.role, m.content, m.created_at,
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id AND c.user_id = m.user_id
        WHERE m.id = ? AND m.user_id = ?
      `).get(messageId, userId) as
        | {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          created_at: string;
        }
        | undefined;

      if (!message) {
        throw new Error("Message not found.");
      }
      if (message.role !== "user") {
        throw new Error("Only user messages can be edited.");
      }

      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        db.prepare(
          "UPDATE messages SET content = ? WHERE id = ? AND user_id = ?"
        ).run(text, messageId, userId);
        db.prepare(
          "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
        ).run(new Date().toISOString(), message.conversation_id, userId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      json(ctx.res, 200, {
        ok: true,
      });
    }),
    route("GET", "/api/settings", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        settings: {
          displayName: user.display_name,
          theme: user.theme,
          preferredProvider: user.preferred_provider,
          providerLocked: Boolean(user.provider_locked),
          autoMemory: Boolean(user.auto_memory),
          composerWritingAssist: user.composer_writing_assist !== 0,
          hiddenBotModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
          preferredLocalModel: user.preferred_local_model ?? "",
          preferredOnlineModel: user.preferred_online_model ?? "",
          lenientLocalFallbackModel: user.lenient_local_fallback_model ?? "",
          lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model ?? "",
          hasOpenAiApiKey: Boolean(user.openai_key_ciphertext),
          // Surface the server's configured local model so the sidebar can
          // show users which Ollama model they're hitting in LOCAL mode.
          ollamaModel: config.ollamaModel,
          secondaryOllamaHost: user.secondary_ollama_host ?? "",
          comfyUiHost: user.comfyui_host ?? "",
          preferredLocalImageModel: user.preferred_local_image_model ?? "",
          preferredOpenAiImageModel: user.preferred_openai_image_model ?? "",
          devMemoriesEnabled: user.dev_memories_enabled === 1,
          devMemoriesText: user.dev_memories_text ?? "",
        },
      });
    }),
    route("GET", "/api/models", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const user = getUserRow(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const catalog = await buildModelCatalog(openAiApiKey, user.secondary_ollama_host);
      // Prefer draft URL from query (matches Settings status probe before save); else persisted column.
      const comfyHostFromQuery = normalizeComfyUiHostForStatusCheck(
        ctx.query.get("comfyUiHost")
      );
      const comfyHostRaw =
        comfyHostFromQuery && comfyHostFromQuery.length > 0
          ? comfyHostFromQuery
          : user.comfyui_host?.trim() ?? "";
      let comfyUi:
        | {
            configured: boolean;
            reachable: boolean;
            checkpoints: Array<{
              id: string;
              label: string;
              provider: "local";
              imageSource: "comfyui";
            }>;
          }
        | undefined;
      if (comfyHostRaw) {
        const names = await fetchComfyUiCheckpointNames(comfyHostRaw);
        const reachable =
          names.length > 0 || (await probeComfyUiHostReachable(comfyHostRaw));
        comfyUi = {
          configured: true,
          reachable,
          checkpoints: names.map((name) => ({
            id: encodeComfyUiModelId(name),
            label: `${name} (ComfyUI)`,
            provider: "local" as const,
            imageSource: "comfyui" as const,
          })),
        };
      } else {
        comfyUi = {
          configured: false,
          reachable: false,
          checkpoints: [],
        };
      }
      json(ctx.res, 200, { ok: true, catalog, comfyUi });
    }),
    route("GET", "/api/settings/secondary-ollama-status", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      let hostToCheck: string | null = user.secondary_ollama_host;
      if (ctx.query.has("host")) {
        hostToCheck = normalizeOllamaHostForStatusCheck(ctx.query.get("host"));
      }
      const status = await checkLocalModelHostStatus(hostToCheck);
      json(ctx.res, 200, { ok: true, status });
    }),
    route("GET", "/api/settings/comfyui-status", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      let hostToCheck: string | null = user.comfyui_host;
      if (ctx.query.has("host")) {
        hostToCheck = normalizeComfyUiHostForStatusCheck(ctx.query.get("host"));
      }
      const status = await checkComfyUiHostStatus(hostToCheck);
      json(ctx.res, 200, { ok: true, status });
    }),
    route("PATCH", "/api/settings", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const user = getUserRow(userId);
      const devMemoriesEnabled =
        typeof body.devMemoriesEnabled === "boolean"
          ? Number(body.devMemoriesEnabled)
          : user.dev_memories_enabled;
      const devMemoriesText =
        typeof body.devMemoriesText === "string"
          ? body.devMemoriesText.trim().slice(0, 8000)
          : user.dev_memories_text;

      // Validation + merge live in `./settings.ts` so the semantics are pinned
      // by unit tests. See `__tests__/settings.test.ts` for the contract.
      const next = resolveNextSettings(body, {
        displayName: user.display_name,
        theme: user.theme,
        preferredProvider: user.preferred_provider,
        providerLocked: user.provider_locked,
        autoMemory: user.auto_memory,
        composerWritingAssist: user.composer_writing_assist,
        hiddenBotModelIds: user.hidden_bot_model_ids,
        preferredLocalModel: user.preferred_local_model,
        preferredOnlineModel: user.preferred_online_model,
        lenientLocalFallbackModel: user.lenient_local_fallback_model,
        lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
        secondaryOllamaHost: user.secondary_ollama_host,
        comfyUiHost: user.comfyui_host,
        preferredLocalImageModel: user.preferred_local_image_model,
        preferredOpenAiImageModel: user.preferred_openai_image_model,
        primaryOllamaHost: config.ollamaHost,
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
        SET display_name = ?, theme = ?, preferred_provider = ?, provider_locked = ?, auto_memory = ?, composer_writing_assist = ?, hidden_bot_model_ids = ?,
            preferred_local_model = ?, preferred_online_model = ?, lenient_local_fallback_model = ?, lenient_local_image_fallback_model = ?, secondary_ollama_host = ?, comfyui_host = ?,
            preferred_local_image_model = ?, preferred_openai_image_model = ?,
            dev_memories_enabled = ?, dev_memories_text = ?,
            openai_key_ciphertext = ?, openai_key_iv = ?, openai_key_tag = ?
        WHERE id = ?
      `).run(
        next.displayName,
        next.theme,
        next.preferredProvider,
        next.providerLocked,
        next.autoMemory,
        next.composerWritingAssist,
        JSON.stringify(next.hiddenBotModelIds),
        next.preferredLocalModel,
        next.preferredOnlineModel,
        next.lenientLocalFallbackModel,
        next.lenientLocalImageFallbackModel,
        next.secondaryOllamaHost,
        next.comfyUiHost,
        next.preferredLocalImageModel,
        next.preferredOpenAiImageModel,
        devMemoriesEnabled,
        devMemoriesText,
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
    route("POST", "/api/images/prompt-suggestions", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const botId = readString(body.botId, "botId").trim();
      const row = db
        .prepare(
          "SELECT name, system_prompt FROM bots WHERE id = ? AND user_id = ?"
        )
        .get(botId, userId) as { name: string; system_prompt: string } | undefined;
      if (!row) {
        throw new HttpError(404, "Bot not found.");
      }
      const suggestions = await inferBotImagePromptSuggestions(
        getAuxiliaryProvider(),
        { botName: row.name, systemPrompt: row.system_prompt }
      );
      json(ctx.res, 200, { ok: true, suggestions });
    }),
    route("POST", "/api/images/random-prompt", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const botIdRaw =
        typeof body.botId === "string" ? body.botId.trim() : "";
      let botName: string | undefined;
      let systemPrompt: string | undefined;
      if (botIdRaw.length > 0) {
        const row = db
          .prepare(
            "SELECT name, system_prompt FROM bots WHERE id = ? AND user_id = ?"
          )
          .get(botIdRaw, userId) as
          | { name: string; system_prompt: string }
          | undefined;
        if (!row) {
          throw new HttpError(404, "Bot not found.");
        }
        botName = row.name;
        systemPrompt = row.system_prompt;
      }
      const prompt = await inferRandomImageSceneLine(getAuxiliaryProvider(), {
        botName,
        systemPrompt,
      });
      json(ctx.res, 200, { ok: true, prompt });
    }),
    route("POST", "/api/images/generate", async (ctx) => {
      const userId = requireAuth(ctx);
      const imageGenAbort = new AbortController();
      const onImageGenClientClose = () => imageGenAbort.abort();
      ctx.req.once("close", onImageGenClientClose);
      try {
      const body = ctx.body as Record<string, unknown>;
      const prompt = readString(body.prompt, "prompt");
      const size = (body.size as string) ?? "1024x1024";
      const quality = (body.quality as string) ?? "standard";
      const bodyModel =
        typeof body.model === "string" && body.model.trim().length > 0
          ? body.model.trim()
          : undefined;
      const conversationIdRaw =
        typeof body.conversationId === "string" ? body.conversationId.trim() : "";
      const bodyBotId =
        typeof body.botId === "string" && body.botId.trim().length > 0
          ? body.botId.trim()
          : undefined;

      // ONLINE → OpenAI Images API; LOCAL → Ollama image checkpoint on this Mac.
      // Body may override `preferredProvider` for this request (same pattern as chat).
      const user = getUserRow(userId);
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;

      const persistence = resolveImageGeneratePersistence({
        db,
        userId,
        conversationIdRaw,
        bodyBotId,
      });
      if (!persistence.ok) {
        throw new Error(persistence.message);
      }

      let promptForModel = prompt;
      const personaBotId = persistence.personaBotId;
      type BotPersonaImageRow = {
        name: string;
        system_prompt: string;
        local_image_model: string | null;
        openai_image_model: string | null;
      };
      let botPersona: BotPersonaImageRow | undefined;
      if (personaBotId) {
        botPersona = db
          .prepare(
            "SELECT name, system_prompt, local_image_model, openai_image_model FROM bots WHERE id = ? AND user_id = ?"
          )
          .get(personaBotId, userId) as BotPersonaImageRow | undefined;
        if (botPersona) {
          promptForModel = composeAugmentedImagePrompt({
            botName: botPersona.name,
            systemPrompt: botPersona.system_prompt,
            userPrompt: prompt,
          });
        }
      }

      const resolvedLocalImageModel =
        (bodyModel && bodyModel.trim()) ||
        (botPersona?.local_image_model?.trim() ?? "") ||
        (user.preferred_local_image_model?.trim() ?? "");

      const resolvedOpenAiImageModel =
        (bodyModel && bodyModel.trim()) ||
        (botPersona?.openai_image_model?.trim() ?? "") ||
        (user.preferred_openai_image_model?.trim() ?? "");

      const imageId = randomId(12);
      const localRelPath = buildGeneratedImageRelativePath(userId, imageId);

      if (effectiveProvider === "local") {
        if (!resolvedLocalImageModel) {
          throw new Error(
            "Pick a local image model in the Images panel header, then try again."
          );
        }

        const lenientImageFb = user.lenient_local_image_fallback_model?.trim() ?? "";
        const runLocalBytes = (modelId: string) =>
          generateLocalImageBytesByModelId({
            modelId,
            promptForModel,
            size,
            signal: imageGenAbort.signal,
            comfyUiHost: user.comfyui_host,
            secondaryOllamaHost: user.secondary_ollama_host,
            primaryOllamaHost: config.ollamaHost,
          });

        let localOut: Awaited<ReturnType<typeof generateLocalImageBytesByModelId>>;
        try {
          localOut = await runLocalBytes(resolvedLocalImageModel);
        } catch (primaryError) {
          if (
            lenientImageFb &&
            lenientImageFb !== resolvedLocalImageModel.trim() &&
            shouldAttemptLenientLocalImageFallback(primaryError)
          ) {
            localOut = await runLocalBytes(lenientImageFb);
          } else {
            throw primaryError;
          }
        }

        finalizeComfyOrOllamaGeneratedImageResponse(ctx, {
          imageId,
          userId,
          persistence: {
            conversationIdForInsert: persistence.conversationIdForInsert,
            persistedBotId: persistence.persistedBotId,
          },
          prompt,
          localRelPath,
          size,
          quality,
          imageBytes: localOut.imageBytes,
          modelUsed: localOut.modelUsed,
          provider: localOut.provider,
        });
        return;
      }

      const userKey = decryptUserKey(userId);
      const apiKey = getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const lenientImageFbOnline = user.lenient_local_image_fallback_model?.trim() ?? "";

      let openAiResult: Awaited<ReturnType<typeof generateImage>> | null = null;
      try {
        openAiResult = await generateImage(promptForModel, apiKey, {
          model: resolvedOpenAiImageModel || undefined,
          size,
          quality,
          signal: imageGenAbort.signal,
        });
      } catch (primaryError) {
        if (
          lenientImageFbOnline &&
          shouldAttemptLenientLocalImageFallback(primaryError)
        ) {
          const localOut = await generateLocalImageBytesByModelId({
            modelId: lenientImageFbOnline,
            promptForModel,
            size,
            signal: imageGenAbort.signal,
            comfyUiHost: user.comfyui_host,
            secondaryOllamaHost: user.secondary_ollama_host,
            primaryOllamaHost: config.ollamaHost,
          });
          finalizeComfyOrOllamaGeneratedImageResponse(ctx, {
            imageId,
            userId,
            persistence: {
              conversationIdForInsert: persistence.conversationIdForInsert,
              persistedBotId: persistence.persistedBotId,
            },
            prompt,
            localRelPath,
            size,
            quality,
            imageBytes: localOut.imageBytes,
            modelUsed: localOut.modelUsed,
            provider: localOut.provider,
          });
          return;
        }
        throw primaryError;
      }

      const result = openAiResult;
      if (!result) {
        throw new Error("OpenAI image generation did not return a result.");
      }

      let imageBytes: Buffer;
      try {
        imageBytes = await downloadRemoteImage(result.url, {
          signal: imageGenAbort.signal,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "download failed";
        throw new Error(`Could not download image for local storage (${detail}).`);
      }

      try {
        writeGeneratedImageBytes(localRelPath, imageBytes);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "write failed";
        throw new Error(`Could not save generated image (${detail}).`);
      }

      try {
        db.prepare(
          "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'openai', ?, ?, ?)"
        ).run(
          imageId,
          userId,
          persistence.conversationIdForInsert,
          persistence.persistedBotId,
          prompt,
          result.revisedPrompt,
          result.url,
          size,
          quality,
          result.model,
          localRelPath,
          new Date().toISOString()
        );
      } catch (error) {
        tryUnlinkGeneratedImageFile(localRelPath);
        throw error;
      }

      const displayUrl = `/api/images/${encodeURIComponent(imageId)}/file`;
      json(ctx.res, 200, {
        ok: true,
        image: {
          id: imageId,
          url: result.url,
          revisedPrompt: result.revisedPrompt,
          displayUrl,
          hasLocalFile: true,
          model: result.model,
        },
      });
      } finally {
        ctx.req.off("close", onImageGenClientClose);
      }
    }),
    route("POST", "/api/ollama/pull-primary", async (ctx) => {
      requireAuth(ctx);
      const pullName = config.ollamaInAppPullModel.trim();
      if (!isAllowedInAppOllamaPullModelName(pullName)) {
        json(ctx.res, 500, {
          ok: false,
          error: "In-app pull model is misconfigured.",
        });
        return;
      }

      let ollamaRes: Response;
      try {
        ollamaRes = await fetch(`${config.ollamaHost}/api/pull`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: pullName, stream: true }),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "network error";
        json(ctx.res, 502, {
          ok: false,
          error: `Could not reach Ollama (${detail}).`,
        });
        return;
      }

      if (!ollamaRes.ok) {
        const text = await ollamaRes.text();
        json(ctx.res, 502, {
          ok: false,
          error: text.trim() || `Ollama pull failed (${ollamaRes.status}).`,
        });
        return;
      }

      const webBody = ollamaRes.body;
      if (!webBody) {
        json(ctx.res, 502, { ok: false, error: "Ollama returned an empty body." });
        return;
      }

      ctx.res.statusCode = 200;
      ctx.res.setHeader("content-type", "application/x-ndjson; charset=utf-8");

      try {
        const nodeReadable = Readable.fromWeb(
          webBody as import("stream/web").ReadableStream
        );
        await pipeline(nodeReadable, ctx.res);
      } catch {
        if (!ctx.res.writableEnded) {
          ctx.res.destroy();
        }
      }
    }),
    route("GET", "/api/images", async (ctx) => {
      const userId = requireAuth(ctx);
      const filterBotId = readOptionalString(ctx.query.get("botId"));
      const generalOnly = ctx.query.get("general") === "1";
      if (generalOnly && filterBotId) {
        throw new Error("Cannot combine botId filter with general=1.");
      }
      if (filterBotId && !botBelongsToUser(db, userId, filterBotId)) {
        throw new Error("Unknown bot for this account.");
      }
      const limitRaw = ctx.query.get("limit");
      let limit = 120;
      if (limitRaw) {
        const n = Number(limitRaw);
        if (Number.isFinite(n)) {
          limit = Math.min(200, Math.max(1, Math.floor(n)));
        }
      }
      const rows = generalOnly
        ? db
            .prepare(
              `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model
               FROM images WHERE user_id = ? AND bot_id IS NULL
               ORDER BY created_at DESC LIMIT ?`
            )
            .all(userId, limit)
        : filterBotId
          ? db
              .prepare(
                `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model
                 FROM images WHERE user_id = ? AND bot_id = ?
                 ORDER BY created_at DESC LIMIT ?`
              )
              .all(userId, filterBotId, limit)
          : db
              .prepare(
                `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model
                 FROM images WHERE user_id = ?
                 ORDER BY created_at DESC LIMIT ?`
              )
              .all(userId, limit);
      const images = (rows as Array<{
        id: string;
        prompt: string;
        revised_prompt: string | null;
        url: string;
        size: string;
        quality: string;
        provider: string;
        bot_id: string | null;
        created_at: string;
        local_rel_path: string | null;
        model: string | null;
      }>).map((row) => mapImageRowToClient(row));
      json(ctx.res, 200, { ok: true, images });
    }),
    route("GET", "/api/images/:id/file", async (ctx) => {
      const userId = requireAuth(ctx);
      const imageId = ctx.params.id;
      const row = db
        .prepare(
          "SELECT user_id, local_rel_path FROM images WHERE id = ?"
        )
        .get(imageId) as
        | { user_id: string; local_rel_path: string | null }
        | undefined;
      if (!row || row.user_id !== userId) {
        throw new HttpError(404, "Image not found.");
      }
      const rel = row.local_rel_path?.trim();
      if (!rel) {
        throw new HttpError(404, "Image file not available.");
      }
      let bytes: Buffer;
      try {
        bytes = readGeneratedImageBytes(rel);
      } catch {
        throw new HttpError(404, "Image file not found.");
      }
      ctx.res.statusCode = 200;
      ctx.res.setHeader("content-type", "image/png");
      ctx.res.setHeader("cache-control", "private, max-age=3600");
      ctx.res.end(bytes);
    }),
    route("DELETE", "/api/images/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const imageId = ctx.params.id;
      const row = db
        .prepare(
          "SELECT user_id, local_rel_path FROM images WHERE id = ? AND user_id = ?"
        )
        .get(imageId, userId) as
        | { user_id: string; local_rel_path: string | null }
        | undefined;
      if (!row) {
        throw new HttpError(404, "Image not found.");
      }
      db.prepare("DELETE FROM images WHERE id = ? AND user_id = ?").run(
        imageId,
        userId
      );
      const rel = row.local_rel_path?.trim();
      if (rel) {
        try {
          const absolute = resolveAbsoluteUnderDataRoot(rel);
          if (existsSync(absolute)) {
            unlinkSync(absolute);
          }
        } catch (error) {
          console.error(
            `[images] orphan file after DB delete imageId=${imageId}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      json(ctx.res, 200, { ok: true });
    }),
    route("POST", "/api/bots", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const name = readString(body.name, "name");
      const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : "";
      const model = readOptionalString(body.model);
      const localModel = readOptionalString(body.localModel);
      const onlineModel = readOptionalString(body.onlineModel);
      const localImageModel = readOptionalString(body.localImageModel);
      const openaiImageModel = readOptionalString(body.openaiImageModel);
      const onlineEnabled = body.onlineEnabled === false ? 0 : 1;
      const deleteProtected = body.deleteProtected === true ? 1 : 0;
      const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;
      const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : 2048;
      const exportHash = resolveBotExportHashForCreate({
        incomingHash: body.exportHash,
        hasExistingHash: (hash) => {
          const existing = db
            .prepare("SELECT id FROM bots WHERE user_id = ? AND export_hash = ?")
            .get(userId, hash) as { id?: string } | undefined;
          return Boolean(existing?.id);
        },
      });
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
      const chatEnabled = body.chatEnabled === false ? 0 : 1;
      const botId = randomId(12);
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO bots (id, user_id, name, system_prompt, export_hash, model, local_model, online_model, local_image_model, openai_image_model, online_enabled, delete_protected, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)"
      ).run(
        botId,
        userId,
        name,
        systemPrompt,
        exportHash,
        model,
        localModel,
        onlineModel,
        localImageModel,
        openaiImageModel,
        onlineEnabled,
        deleteProtected,
        temperature,
        maxTokens,
        color,
        glyph,
        chatEnabled,
        now,
        now
      );
      json(ctx.res, 201, {
        ok: true,
        bot: {
          id: botId,
          name,
          systemPrompt,
          export_hash: exportHash,
          model,
          local_model: localModel,
          online_model: onlineModel,
          local_image_model: localImageModel,
          openai_image_model: openaiImageModel,
          online_enabled: onlineEnabled,
          delete_protected: deleteProtected,
          temperature,
          maxTokens,
          color,
          glyph,
          chat_enabled: chatEnabled,
        },
      });
    }),
    route("GET", "/api/bots", async (ctx) => {
      const userId = requireAuth(ctx);
      const rows = db.prepare(
        "SELECT id, name, system_prompt, export_hash, model, local_model, online_model, local_image_model, openai_image_model, online_enabled, delete_protected, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at FROM bots WHERE user_id = ? OR visibility = 'public' ORDER BY updated_at DESC"
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
      if (typeof body.localModel === "string") {
        fields.push("local_model = ?");
        values.push(readOptionalString(body.localModel));
      }
      if (typeof body.onlineModel === "string") {
        fields.push("online_model = ?");
        values.push(readOptionalString(body.onlineModel));
      }
      if (typeof body.localImageModel === "string") {
        fields.push("local_image_model = ?");
        values.push(readOptionalString(body.localImageModel));
      }
      if (typeof body.openaiImageModel === "string") {
        fields.push("openai_image_model = ?");
        values.push(readOptionalString(body.openaiImageModel));
      }
      if (typeof body.onlineEnabled === "boolean") {
        fields.push("online_enabled = ?");
        values.push(body.onlineEnabled ? 1 : 0);
      }
      if (typeof body.deleteProtected === "boolean") {
        fields.push("delete_protected = ?");
        values.push(body.deleteProtected ? 1 : 0);
      }
      if (typeof body.chatEnabled === "boolean") {
        fields.push("chat_enabled = ?");
        values.push(body.chatEnabled ? 1 : 0);
      }
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
      if (body.exportHash !== undefined) {
        const normalizedExportHash = normalizeBotExportHash(body.exportHash);
        if (!normalizedExportHash) {
          throw new Error("Invalid bot export hash.");
        }
        const duplicate = db
          .prepare(
            "SELECT id FROM bots WHERE user_id = ? AND export_hash = ? AND id != ?"
          )
          .get(userId, normalizedExportHash, botId) as
          | { id?: string }
          | undefined;
        if (duplicate?.id) {
          throw new Error("This bot is already in your library!");
        }
        fields.push("export_hash = ?");
        values.push(normalizedExportHash);
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
    // User-facing bulk-clear removes every bot; Developer Tools can pass
    // `limit` for bounded density-stage cleanup.
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
      const { content, deletedMessages, deletedMemories } = rewindConversation(
        db,
        userId,
        conversationId,
        messageId
      );
      json(ctx.res, 200, { ok: true, message: content, deletedMessages, deletedMemories });
    }),
    route("POST", "/api/conversations/:id/revert", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const body = ctx.body as Record<string, unknown>;
      const messageId = typeof body.messageId === "string" ? body.messageId : null;
      if (!messageId) {
        throw new Error("messageId is required.");
      }
      const { deletedMessages, deletedMemories } = rewindConversation(
        db,
        userId,
        conversationId,
        messageId
      );
      json(ctx.res, 200, { ok: true, deletedMessages, deletedMemories });
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
      let messageQuery =
        "SELECT id, role, content, provider, model, bot_id, tool_payload, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC";
      let messages: Array<{
        id: string;
        role: string;
        content: string;
        provider: string | null;
        model: string | null;
        bot_id: string | null;
        tool_payload: string | null;
        created_at: string;
      }>;
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
          "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          randomId(12),
          forkId,
          userId,
          msg.role,
          msg.content,
          msg.provider,
          msg.model,
          msg.bot_id,
          msg.tool_payload,
          msg.created_at
        );
      }
      json(ctx.res, 201, { ok: true, conversationId: forkId });
    }),
    route("GET", "/api/health", async (ctx) => {
      json(
        ctx.res,
        200,
        await buildHealthResponse(db, config, process.uptime())
      );
    })
  ];
}

const routes = buildRoutes();

void purgeInactiveAccounts();
setInterval(() => {
  void purgeInactiveAccounts();
}, INACTIVE_ACCOUNT_CLEANUP_INTERVAL_MS);

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
    const status =
      error instanceof HttpError ? error.statusCode : 400;
    json(res, status, {
      ok: false,
      error: message
    });
  }
});

let stopDiscovery: StopDiscovery | null = null;
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down Prism API.`);

  if (stopDiscovery) {
    await stopDiscovery();
    stopDiscovery = null;
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});

server.listen(config.apiPort, () => {
  console.log(`API ready at http://localhost:${config.apiPort}`);
  stopDiscovery = startPrismDiscovery(config);
});
