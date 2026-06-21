import { utimesSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getAppConfig } from "@localai/config";
import {
  createDatabase,
  loadPrismMoodState,
  upsertPrismMoodState,
} from "./db.ts";
import { clearCookie, HttpError, json, readJsonBody, setCookie, setCorsHeaders } from "./utils.http.ts";
import { decryptJson, decryptText, deriveMasterKey, encryptText, hashPassword, randomId, verifyPassword } from "./security.ts";
import type { RouteDefinition, RequestContext } from "./types.ts";
import {
  requireValidSession,
  resolveSessionToken,
} from "./auth.ts";
import { buildHealthResponse } from "./health.ts";
import {
  validateApiKeyCredential,
  type ApiKeyValidationProvider,
} from "./api-key-validation.ts";
import {
  getOllamaSetupStatus,
  installOllamaCliAndRequiredModel,
  runAutoSetup,
} from "./setup-automation.ts";
import { startPrismDiscovery, type StopDiscovery } from "./discovery.ts";
import {
  normalizeSessionResumeContext,
  processChatMessage,
  readBotOpinion,
  refreshConversationTitle,
  upsertBotOpinion,
} from "./chat.ts";
import {
  peekActiveImageJobForUser,
  pollImageJobForUser,
  releaseImageSlot,
  tryAcquireImageSlot,
} from "./image-job-slot.ts";
import {
  collectCoffeePollVotes,
  createCoffeePoll,
  createCoffeePreset,
  createCoffeeGroupWithGeneratedName,
  createCoffeeConversation,
  createCoffeeConversationFromGroup,
  deleteCoffeeGroup,
  deleteCoffeePreset,
  getCoffeeSessionPoll,
  generateCoffeeSessionSynopsis,
  listCoffeeGroups,
  listCoffeePresets,
  parseStoredCoffeeSessionSettings,
  processCoffeeAutonomousTurn,
  processCoffeeTurn,
  setCoffeeConversationTopic,
  setCoffeePollPlayerVote,
  updateCoffeePreset,
  updateCoffeeGroup,
  updateCoffeeConversationSettings,
} from "./coffee.ts";
import {
  createDevSeedMemories,
  demoteMemoryToShortTerm,
  deleteMemoriesForBotScope,
  deleteMemoryById,
  deleteOrphanedBotMemories,
  filterConflictingMemories,
  normalizeMemoryDurability,
  retrieveRecentMemoriesForStarter,
  restoreMemory
} from "./memory.ts";
import { parseMemoryListQueryOptions } from "./memory-list-query.ts";
import { inferAndStoreBotMemories } from "./memory-inference.ts";
import {
  deleteZenSessionMemoryById,
  loadZenSessionMemoryOverview,
} from "./zen-session-memory.ts";
import {
  buildZenWallpaperHistoryForGeneratedImage,
  clearConversationMessages,
  createDevSeedConversations,
  deleteAllConversations,
  deleteConversation,
  deleteConversationMessage,
  deleteConversationsByBot,
  getConversationSweepState,
  listConversationSummaries,
  mapZenWallpaperMetadata,
  normalizeZenWallpaperStatus,
  pruneZenWallpaperHistoryForMessageCount,
  rebaseZenWallpaperMetadataForVisibleWindow,
  recoverStaleZenWallpaperGenerationStatus,
  rewindConversation,
  serializeZenWallpaperHistory,
  setZenStarterConversationSuppression,
  sweepConversations,
  undoLatestConversationSweep,
} from "./conversations.ts";
import {
  chooseStorySessionChoice,
  createStorySession,
  deleteStorySession,
  generateStorySessionEpisode,
  getStorySessionDetail,
  listStorySessions,
  loadStoryBotProfiles,
  normalizeStoryCreateBotIds,
  pickupStorySessionItem,
  travelStorySession,
} from "./story.ts";
import {
  composeBotSystemPrompt,
  deleteAllBots,
  deleteBot,
  deleteBots,
  deleteSelectedBots,
  normalizeBotExportHash,
  resolveBotExportHashForCreate,
  setSelectedBotsDeleteProtection,
} from "./bots.ts";
import { queueBotSemanticFacetsRefresh } from "./bot-facets.ts";
import {
  normalizeComfyUiHostForStatusCheck,
  normalizeOllamaHostForStatusCheck,
  normalizeZenFreshStartGapMs,
  normalizeZenMoodSensitivity,
  normalizeZenRecentContextMessages,
  normalizeZenSessionIdleGapMs,
  normalizeZenWallpaperOpacity,
  normalizeZenWallpaperRegenMessageInterval,
  normalizeZenWallpaperRevealDelayMessageCount,
  normalizeZenWallpaperRevealSpanMessageCount,
  normalizeZenWallpaperTextMaskEnabled,
  parseHiddenBotModelIds,
  parseHiddenComfyUiWorkflowIds,
  resolveNextSettings,
  sanitizeAnthropicKeyInput,
  sanitizeElevenLabsKeyInput,
  sanitizeOpenAiKeyInput,
} from "./settings.ts";
import { normalizeMemoryDisplayText } from "./memory-validation.ts";
import {
  buildModelCatalog,
  checkDualOllamaWorkloadStatus,
  checkLocalModelHostStatus,
  checkOpenAiApiKeyStatus,
  getAuxiliaryProvider,
  selectProvider,
} from "./providers.ts";
import type { GenerateOptions, ProviderMessage, ProviderName } from "./providers.ts";
import {
  cleanupComposerTextWithModel,
  cleanupResolvedPromptWithModel,
  readComposerCleanupText,
} from "./composer-cleanup.ts";
import {
  normalizeComposerWildcardValueResponse,
  promptWildcardNames,
  resolvePromptWildcardsWithModel,
} from "./prompt-wildcards.ts";
import {
  defaultHiddenModelIdsForCatalog,
  MODEL_VISIBILITY_DEFAULTS_VERSION,
  resolveAutoModel,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
} from "./model-routing.ts";
import { LocalOnlyBackupAdapter, exportUserSnapshot, importUserSnapshot, type BackupSnapshot } from "./backup.ts";
import {
  composeVerbatimFirstImagePrompt,
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  encodeComfyUiRemoteWorkflowModelId,
  formatComfyUiRemoteWorkflowLabel,
  hydrateAssistantMessageParts,
  isAllowedInAppOllamaPullModelName,
  getBuiltInPromptWildcardSlot,
  normalizePromptShortcutMetadata,
  normalizePromptWildcardRunMetadata,
  reasoningEffortForRequest,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  parseStoredComfyUiWorkflows,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
  applyPrismMoodExpiredIgnoreCooldown,
  applyPrismMoodInterruption,
  createDefaultPrismMoodState,
  debugPatchPrismMood,
  resetPrismMood,
  type PrismMoodInterruptionInput,
  type PrismMoodMode,
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
  listComfyUiWorkflowJsonRelPaths,
  probeComfyUiHostReachable,
} from "./comfyui-image.ts";
import {
  botBelongsToUser,
  resolveImageGeneratePersistence,
} from "./image-generate-resolve.ts";
import {
  clampZenWallpaperPromptText,
  composeZenWallpaperPrompt,
} from "./zen-wallpaper-prompt.ts";
import {
  buildGeneratedImageRelativePath,
  downloadRemoteImage,
  readGeneratedImageBytes,
  removeGeneratedImagesDirectoryForUser,
  tryUnlinkGeneratedImageFile,
  writeGeneratedImageBytes,
} from "./image-storage.ts";
import { readOrCreateThumbBytes, tryGenerateThumbAfterPngWrite } from "./image-thumb.ts";
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
import { restoreFactoryDefaultsInDatabase } from "./account-reset.ts";
import { deleteVectorsForUser } from "./qdrant.ts";
const config = getAppConfig();
const db = createDatabase();
const masterKey = deriveMasterKey(config.encryptionMasterKey);
const backupAdapter = new LocalOnlyBackupAdapter();
const LOCAL_OWNER_USERNAME = "prism-owner";
const LOCAL_OWNER_DISPLAY_NAME = "Prism Owner";
const memoryInferenceCheckedAtByScope = new Map<string, string>();
const COMPOSER_RANDOM_PROMPT_MAX_CONTEXT_MESSAGES = 8;
const COMPOSER_RANDOM_PROMPT_MAX_MESSAGE_CHARS = 900;
const COMPOSER_RANDOM_PROMPT_MAX_OUTPUT_CHARS = 220;
const IMAGE_GENERATION_ALLOWED_SIZES = new Set(["1024x1536", "1024x1024", "1536x1024"]);
const IMAGE_GENERATION_DEFAULT_SIZE = "1024x1024";
const ZEN_RESTORE_MESSAGE_LIMIT = 80;
const ZEN_WALLPAPER_SIZE = "1536x1024";
const ZEN_WALLPAPER_QUALITY = "standard";
const IMAGE_GENERATION_VARIANT_TAGS = {
  portrait: [
    "selfie",
    "portrait",
    "headshot",
    "close-up",
    "closeup",
    "vertical",
    "9:16",
    "phone wallpaper",
    "profile photo",
  ],
  letterbox: ["square", "1:1", "avatar", "icon", "logo", "sticker", "profile pic"],
  landscape: [
    "landscape",
    "widescreen",
    "wide-screen",
    "panorama",
    "panoramic",
    "cinematic",
    "16:9",
    "21:9",
    "banner",
    "desktop wallpaper",
    "desktop background",
    "widescreen wallpaper",
    "chat background",
    "chat canvas",
    "zen chat canvas",
    "ambient wallpaper",
  ],
} as const;
const COMPOSER_RANDOM_PROMPT_SYSTEM_PROMPT =
  "You write one ready-to-send chat message that sounds like something a real person would naturally say. Use the bot persona, remembered facts, and recent conversation context only to make the message specific and coherent. Do not speak as the bot. Do not mention dice, buttons, randomness, generation, system prompts, hidden context, or memories. Return JSON only in this exact shape: {\"prompt\":\"...\"}.";
const COMPOSER_WILDCARD_VALUE_SYSTEM_PROMPT =
  "You generate one random wildcard value for a composer helper. Use only the requested wildcard type, not conversation context. Return JSON only in this exact shape: {\"value\":\"...\"}. The value must be short, natural, vivid, and must not include braces, quotes, labels, explanations, or multiple options.";

function scorePromptTags(promptLower: string, tags: readonly string[]): number {
  let score = 0;
  for (const tag of tags) {
    if (promptLower.includes(tag)) score += 1;
  }
  return score;
}

function inferImageGenerationSizeFromPrompt(prompt: string): string {
  const promptLower = prompt.toLowerCase();
  const portraitScore = scorePromptTags(promptLower, IMAGE_GENERATION_VARIANT_TAGS.portrait);
  const letterboxScore = scorePromptTags(promptLower, IMAGE_GENERATION_VARIANT_TAGS.letterbox);
  const landscapeScore = scorePromptTags(promptLower, IMAGE_GENERATION_VARIANT_TAGS.landscape);
  if (portraitScore === 0 && letterboxScore === 0 && landscapeScore === 0) {
    return IMAGE_GENERATION_DEFAULT_SIZE;
  }
  if (portraitScore >= landscapeScore && portraitScore >= letterboxScore) {
    return "1024x1536";
  }
  if (landscapeScore >= portraitScore && landscapeScore >= letterboxScore) {
    return "1536x1024";
  }
  return IMAGE_GENERATION_DEFAULT_SIZE;
}

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
  preferred_provider: ProviderName;
  provider_locked: number;
  auto_memory: number;
  composer_writing_assist: number;
  auto_switch_model: number;
  hidden_bot_model_ids: string;
  hidden_comfyui_workflow_ids: string;
  model_visibility_defaults_version: number;
  fallback_model_message_stripe: number;
  preferred_local_model: string | null;
  preferred_online_model: string | null;
  lenient_local_fallback_model: string | null;
  lenient_local_image_fallback_model: string | null;
  secondary_ollama_host: string | null;
  experimental_dual_ollama_enabled: number;
  comfyui_host: string | null;
  preferred_local_image_model: string | null;
  preferred_openai_image_model: string | null;
  preferred_zen_wallpaper_local_image_model: string | null;
  preferred_zen_wallpaper_openai_image_model: string | null;
  zen_wallpaper_opacity: number | null;
  zen_wallpaper_text_mask_enabled: number | null;
  zen_session_idle_gap_ms: number | null;
  zen_fresh_start_gap_ms: number | null;
  zen_recent_context_messages: number | null;
  zen_wallpaper_regen_message_interval: number | null;
  zen_wallpaper_reveal_delay_message_count: number | null;
  zen_wallpaper_reveal_span_message_count: number | null;
  zen_mood_sensitivity: number | null;
  comfyui_workflows: string | null;
  prism_default_llm_model: string | null;
  prism_image_tool_llm_model: string | null;
  dev_memories_enabled: number;
  dev_memories_text: string;
  openai_key_ciphertext: string | null;
  openai_key_iv: string | null;
  openai_key_tag: string | null;
  anthropic_key_ciphertext: string | null;
  anthropic_key_iv: string | null;
  anthropic_key_tag: string | null;
  elevenlabs_key_ciphertext: string | null;
  elevenlabs_key_iv: string | null;
  elevenlabs_key_tag: string | null;
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

function isLoopbackRequest(ctx: RequestContext): boolean {
  const address = ctx.req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function requireLoopback(ctx: RequestContext): void {
  if (!isLoopbackRequest(ctx)) {
    throw new Error("Local pairing codes can only be generated on this Mac.");
  }
}

function requireLocalDeveloperRequest(ctx: RequestContext): void {
  if (!isLoopbackRequest(ctx)) {
    throw new Error("Developer server commands can only be requested from this computer.");
  }
}

function isNodeWatchMode(): boolean {
  return process.execArgv.some(
    (arg) =>
      arg === "--watch" ||
      arg.startsWith("--watch=") ||
      arg === "--watch-path" ||
      arg.startsWith("--watch-path=")
  );
}

function scheduleApiWatchRestart(): boolean {
  if (!isNodeWatchMode()) {
    return false;
  }
  setTimeout(() => {
    try {
      const serverEntryPath = fileURLToPath(import.meta.url);
      const now = new Date();
      utimesSync(serverEntryPath, now, now);
    } catch (error) {
      console.error("Failed to trigger Prism API watch restart.", error);
    }
  }, 150).unref();
  return true;
}

function getOrCreateLocalOwnerUser(): string {
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(LOCAL_OWNER_USERNAME) as { id?: string } | undefined;
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
    LOCAL_OWNER_USERNAME,
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
      "SELECT id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, theme, preferred_provider, provider_locked, auto_memory, composer_writing_assist, experimental_dual_ollama_enabled, auto_switch_model, hidden_bot_model_ids, hidden_comfyui_workflow_ids, model_visibility_defaults_version, fallback_model_message_stripe, preferred_local_model, preferred_online_model, lenient_local_fallback_model, lenient_local_image_fallback_model, secondary_ollama_host, comfyui_host, comfyui_workflows, preferred_local_image_model, preferred_openai_image_model, preferred_zen_wallpaper_local_image_model, preferred_zen_wallpaper_openai_image_model, zen_wallpaper_opacity, zen_wallpaper_text_mask_enabled, zen_session_idle_gap_ms, zen_fresh_start_gap_ms, zen_recent_context_messages, zen_wallpaper_regen_message_interval, zen_wallpaper_reveal_delay_message_count, zen_wallpaper_reveal_span_message_count, zen_mood_sensitivity, prism_default_llm_model, prism_image_tool_llm_model, dev_memories_enabled, dev_memories_text, openai_key_ciphertext, openai_key_iv, openai_key_tag, anthropic_key_ciphertext, anthropic_key_iv, anthropic_key_tag, elevenlabs_key_ciphertext, elevenlabs_key_iv, elevenlabs_key_tag, created_at, last_active_at FROM users WHERE id = ?"
    )
    .get(userId) as UserDbRow | undefined;
  if (!row) {
    throw new Error("User not found.");
  }
  return row;
}

function dualOllamaWorkloadOptions(user: UserDbRow): {
  secondaryOllamaHost: string | null;
  experimentalDualOllama: boolean;
} {
  return {
    secondaryOllamaHost: user.secondary_ollama_host,
    experimentalDualOllama: user.experimental_dual_ollama_enabled === 1,
  };
}

function seedModelVisibilityDefaultsIfNeeded(
  user: UserDbRow,
  catalog: Awaited<ReturnType<typeof buildModelCatalog>>
): string[] {
  if (
    user.model_visibility_defaults_version >=
    MODEL_VISIBILITY_DEFAULTS_VERSION
  ) {
    return parseHiddenBotModelIds(user.hidden_bot_model_ids);
  }

  const currentHidden = parseHiddenBotModelIds(user.hidden_bot_model_ids);
  const defaultHidden = defaultHiddenModelIdsForCatalog(catalog);
  if (currentHidden.length > 0) {
    const mergedHidden = Array.from(new Set([...currentHidden, ...defaultHidden]));
    db.prepare(
      "UPDATE users SET hidden_bot_model_ids = ?, model_visibility_defaults_version = ? WHERE id = ?"
    ).run(
      JSON.stringify(mergedHidden),
      MODEL_VISIBILITY_DEFAULTS_VERSION,
      user.id
    );
    user.hidden_bot_model_ids = JSON.stringify(mergedHidden);
    user.model_visibility_defaults_version = MODEL_VISIBILITY_DEFAULTS_VERSION;
    return mergedHidden;
  }

  if (defaultHidden.length === 0) {
    return currentHidden;
  }

  db.prepare(
    "UPDATE users SET hidden_bot_model_ids = ?, model_visibility_defaults_version = ? WHERE id = ?"
  ).run(
    JSON.stringify(defaultHidden),
    MODEL_VISIBILITY_DEFAULTS_VERSION,
    user.id
  );
  user.hidden_bot_model_ids = JSON.stringify(defaultHidden);
  user.model_visibility_defaults_version = MODEL_VISIBILITY_DEFAULTS_VERSION;
  return defaultHidden;
}

function toUserProfile(row: UserDbRow): Record<string, unknown> {
  return {
    id: row.id,
    username: row.email,
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

function getAnthropicApiKeyForUser(userId: string, userKey: Buffer): string | undefined {
  const user = getUserRow(userId);
  if (!user.anthropic_key_ciphertext || !user.anthropic_key_iv || !user.anthropic_key_tag) {
    return undefined;
  }
  return decryptText(
    {
      ciphertext: user.anthropic_key_ciphertext,
      iv: user.anthropic_key_iv,
      tag: user.anthropic_key_tag,
    },
    userKey
  );
}

function getElevenLabsApiKeyForUser(userId: string, userKey: Buffer): string | undefined {
  const user = getUserRow(userId);
  if (!user.elevenlabs_key_ciphertext || !user.elevenlabs_key_iv || !user.elevenlabs_key_tag) {
    return undefined;
  }
  return decryptText(
    {
      ciphertext: user.elevenlabs_key_ciphertext,
      iv: user.elevenlabs_key_iv,
      tag: user.elevenlabs_key_tag,
    },
    userKey
  );
}

function readProvider(value: unknown): ProviderName | undefined {
  return value === "local" || value === "openai" || value === "anthropic"
    ? value
    : undefined;
}

function readApiKeyValidationProvider(value: unknown): ApiKeyValidationProvider {
  if (value === "openai" || value === "anthropic" || value === "elevenlabs") {
    return value;
  }
  throw new Error("provider is required.");
}

function sanitizeApiKeyForProvider(
  provider: ApiKeyValidationProvider,
  value: string
): string {
  if (provider === "anthropic") return sanitizeAnthropicKeyInput(value);
  if (provider === "elevenlabs") return sanitizeElevenLabsKeyInput(value);
  return sanitizeOpenAiKeyInput(value);
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

function readPrismMoodMode(value: unknown): PrismMoodMode {
  if (value === "chat") return "zen";
  return value === "coffee" || value === "sandbox" || value === "zen" ? value : "zen";
}

function readPrismInterruption(value: unknown): PrismMoodInterruptionInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const kind = record.kind === "pending_reply" ? "pending_reply" : "assistant_reveal";
  return {
    kind,
    ...(typeof record.assistantMessageId === "string" && record.assistantMessageId.trim().length > 0
      ? { assistantMessageId: record.assistantMessageId.trim() }
      : {}),
    ...(typeof record.visibleTokenCount === "number" && Number.isFinite(record.visibleTokenCount)
      ? { visibleTokenCount: Math.max(1, Math.floor(record.visibleTokenCount)) }
      : {}),
    ...(typeof record.totalTokenCount === "number" && Number.isFinite(record.totalTokenCount)
      ? { totalTokenCount: Math.max(1, Math.floor(record.totalTokenCount)) }
      : {}),
  };
}

function devMoodDebugAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PRISM_DEV_TOOLS === "1";
}

function readComposerRecentMessages(value: unknown): Array<{ role: "user" | "assistant"; content: string; botName?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
      if (!role || typeof record.content !== "string") return null;
      const content = record.content.trim().replace(/\s+/g, " ");
      if (!content) return null;
      const botName =
        typeof record.botName === "string" && record.botName.trim().length > 0
          ? record.botName.trim().slice(0, 80)
          : undefined;
      return {
        role,
        content:
          content.length > COMPOSER_RANDOM_PROMPT_MAX_MESSAGE_CHARS
            ? `${content.slice(0, COMPOSER_RANDOM_PROMPT_MAX_MESSAGE_CHARS).trim()}...`
            : content,
        ...(botName ? { botName } : {}),
      };
    })
    .filter((item): item is { role: "user" | "assistant"; content: string; botName?: string } => item !== null)
    .slice(-COMPOSER_RANDOM_PROMPT_MAX_CONTEXT_MESSAGES);
}

function clampComposerContextText(text: string, maxChars: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars).trim()}...`
    : normalized;
}

function extractComposerRandomPromptValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["prompt", "message", "text", "suggestion", "value"]) {
    const candidate = record[key];
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

function normalizeComposerRandomPromptResponse(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) {
    throw new Error("Random prompt returned an empty result.");
  }
  const fenced = cleaned.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```$/);
  const unwrapped = fenced?.[1]?.trim() ?? cleaned;
  let candidate: string | null = null;
  try {
    const parsed = JSON.parse(unwrapped) as unknown;
    candidate = Array.isArray(parsed)
      ? extractComposerRandomPromptValue(parsed[0])
      : extractComposerRandomPromptValue(parsed);
  } catch {
    candidate = unwrapped;
  }
  const normalized = (candidate ?? "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/^\s*(?:prompt|user|message|suggestion)\s*:\s*/i, "")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    throw new Error("Random prompt returned an empty result.");
  }
  return normalized.length > COMPOSER_RANDOM_PROMPT_MAX_OUTPUT_CHARS
    ? normalized.slice(0, COMPOSER_RANDOM_PROMPT_MAX_OUTPUT_CHARS).trim()
    : normalized;
}

function readBotSemanticFacetSummary(raw: string | null | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lines: string[] = [];
    for (const key of ["domains", "values", "tensions", "starterSeeds", "canonAnchors"]) {
      const values = parsed[key];
      if (!Array.isArray(values)) continue;
      const compact = values
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 4)
        .map((item) => item.trim());
      if (compact.length > 0) {
        lines.push(`${key}: ${compact.join(", ")}`);
      }
    }
    return lines.slice(0, 6);
  } catch {
    return [];
  }
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

async function restoreUserFactoryDefaults(userId: string): Promise<void> {
  restoreFactoryDefaultsInDatabase(db, userId);

  try {
    removeGeneratedImagesDirectoryForUser(userId);
  } catch {
    // Best-effort filesystem cleanup after SQLite removes image rows.
  }

  try {
    await deleteVectorsForUser(userId);
  } catch {
    // Qdrant cleanup is best-effort; account data is already reset in SQLite.
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
  purpose?: string | null;
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
    purpose: row.purpose ?? "gallery",
    createdAt: row.created_at,
    url: row.url,
    localRelPath: row.local_rel_path,
    displayUrl,
    hasLocalFile,
  };
}

type ZenWallpaperDbRow = {
  zen_wallpaper_enabled?: number | null;
  zen_wallpaper_image_id?: string | null;
  zen_wallpaper_prompt_seed?: string | null;
  zen_wallpaper_message_count?: number | null;
  zen_wallpaper_status?: string | null;
  zen_wallpaper_history?: string | null;
};

function resetZenWallpaperMetadataForEmptyConversation<T extends ZenWallpaperDbRow>(
  conversationId: string,
  row: T,
  totalMessageCount: number
): T {
  if (totalMessageCount !== 0) return row;
  const storedHistory = row.zen_wallpaper_history?.trim() ?? "";
  const hasWallpaperMetadata = Boolean(
    row.zen_wallpaper_image_id ||
      row.zen_wallpaper_prompt_seed ||
      (row.zen_wallpaper_message_count !== null &&
        row.zen_wallpaper_message_count !== undefined) ||
      row.zen_wallpaper_status === "ready" ||
      row.zen_wallpaper_status === "generating" ||
      (storedHistory.length > 0 && storedHistory !== "[]")
  );
  if (!hasWallpaperMetadata) return row;
  db.prepare(
    `UPDATE conversations
        SET zen_wallpaper_image_id = NULL,
            zen_wallpaper_prompt_seed = NULL,
            zen_wallpaper_message_count = NULL,
            zen_wallpaper_status = 'idle',
            zen_wallpaper_history = '[]'
      WHERE id = ?`
  ).run(conversationId);
  return {
    ...row,
    zen_wallpaper_image_id: null,
    zen_wallpaper_prompt_seed: null,
    zen_wallpaper_message_count: null,
    zen_wallpaper_status: "idle",
    zen_wallpaper_history: "[]",
  };
}

function zenWallpaperResponseForConversation(conversationId: string): ReturnType<typeof mapZenWallpaperMetadata> {
  const row = db
    .prepare(
      `SELECT zen_wallpaper_enabled, zen_wallpaper_image_id,
              zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
              zen_wallpaper_status, zen_wallpaper_history
         FROM conversations
        WHERE id = ?`
    )
    .get(conversationId) as
    | ZenWallpaperDbRow
    | undefined;
  const totalMessageCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?")
      .get(conversationId) as { n?: number } | undefined
  )?.n ?? 0;
  const metadata = mapZenWallpaperMetadata(
    row
      ? resetZenWallpaperMetadataForEmptyConversation(
          conversationId,
          row,
          totalMessageCount
        )
      : {}
  );
  return rebaseZenWallpaperMetadataForVisibleWindow(
    metadata,
    totalMessageCount,
    Math.min(totalMessageCount, ZEN_RESTORE_MESSAGE_LIMIT)
  );
}

function recoverStaleZenWallpaperStatusForRequest(
  userId: string,
  conversationId?: string
): void {
  const activeJob = peekActiveImageJobForUser(userId);
  recoverStaleZenWallpaperGenerationStatus(db, userId, {
    conversationId,
    activeZenWallpaperConversationId:
      activeJob?.source === "zen_wallpaper" ? activeJob.conversationId : null,
  });
}

function apiKeySource(
  userCiphertext: string | null,
  serverKey?: string
): "saved" | "server" | "none" {
  if (userCiphertext) return "saved";
  return serverKey ? "server" : "none";
}

type ImageInsertPersistence = {
  conversationIdForInsert: string | null;
  persistedBotId: string | null;
};

/** Persists a ComfyUI or Ollama image and returns the standard JSON success body. */
async function finalizeComfyOrOllamaGeneratedImageResponse(
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
): Promise<void> {
  try {
    writeGeneratedImageBytes(args.localRelPath, args.imageBytes);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "write failed";
    throw new Error(`Could not save generated image (${detail}).`);
  }

  await tryGenerateThumbAfterPngWrite(args.localRelPath);

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

async function readOpenAiGeneratedImageBytes(
  result: Awaited<ReturnType<typeof generateImage>>,
  signal: AbortSignal
): Promise<Buffer> {
  if (result.imageBytes) {
    return result.imageBytes;
  }
  if (!result.url) {
    throw new Error("OpenAI returned no downloadable image URL.");
  }
  return downloadRemoteImage(result.url, { signal });
}

function buildRoutes(): RouteDefinition[] {
  return [
    route("GET", "/api/setup/ollama-status", async (ctx) => {
      requireLoopback(ctx);
      const status = await getOllamaSetupStatus(config);
      json(ctx.res, 200, {
        ok: true,
        status,
      });
    }),
    route("POST", "/api/setup/ollama-install", async (ctx) => {
      requireLoopback(ctx);
      const result = await installOllamaCliAndRequiredModel(config);
      const health = await buildHealthResponse(db, config, process.uptime());
      json(ctx.res, 200, {
        ok: true,
        steps: result.steps,
        status: result.status,
        health,
      });
    }),
    route("POST", "/api/setup/auto", async (ctx) => {
      requireLoopback(ctx);
      const report = await runAutoSetup(config);
      const health = await buildHealthResponse(db, config, process.uptime());
      json(ctx.res, 200, {
        ok: true,
        report,
        health,
      });
    }),
    route("POST", "/api/auth/register", async (ctx) => {
      const body = ctx.body as Record<string, unknown>;
      const username = readString(body.username, "username").toLowerCase();
      const password = readString(body.password, "password");
      const displayName = readOptionalString(body.displayName) ?? username;

      const existing = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(username) as { id?: string } | undefined;
      if (existing?.id) {
        throw new Error("Username is already registered.");
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
        username,
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
          username,
          email: username,
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
      const username = readString(body.username, "username").toLowerCase();
      const password = readString(body.password, "password");
      const user = db
        .prepare(
          "SELECT id, password_hash, password_salt FROM users WHERE email = ?"
        )
        .get(username) as
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
    route("POST", "/api/account/factory-reset", async (ctx) => {
      const userId = requireAuth(ctx);
      await restoreUserFactoryDefaults(userId);
      json(ctx.res, 200, { ok: true });
    }),
    route("GET", "/api/auth/me", async (ctx) => {
      const hasAnyAccounts =
        (
          db
            .prepare("SELECT 1 AS present FROM users LIMIT 1")
            .get() as { present?: number } | undefined
        )?.present === 1;
      const sessionToken = getSessionToken(ctx);
      if (!sessionToken) {
        json(ctx.res, 200, { ok: true, user: null, hasAnyAccounts });
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
        json(ctx.res, 200, { ok: true, user: null, hasAnyAccounts });
        return;
      }
      const row = getUserRow(userId);
      json(ctx.res, 200, {
        ok: true,
        user: toUserProfile(row),
        hasAnyAccounts,
      });
    }),
    route("GET", "/api/client-access/me", async (ctx) => {
      // Standalone desktop mode no longer requires separate native-client access tokens.
      // Keep endpoint alive for legacy callers.
      json(ctx.res, 200, { ok: true, pairingRequired: false });
    }),
    route("POST", "/api/pairing/codes", async (ctx) => {
      requireAuth(ctx);
      throw new HttpError(410, "Pairing codes are disabled in standalone Prism Desktop.");
    }),
    route("POST", "/api/local/pairing/codes", async (ctx) => {
      requireLoopback(ctx);
      getOrCreateLocalOwnerUser();
      throw new HttpError(410, "Local pairing codes are disabled in standalone Prism Desktop.");
    }),
    route("POST", "/api/pairing/exchange", async (ctx) => {
      // Explicitly disable code exchange to avoid stale clients silently succeeding.
      throw new HttpError(410, "Pairing exchange is disabled in standalone Prism Desktop.");
    }),
    route("GET", "/api/conversations", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        conversations: listConversationSummaries(db, userId)
      });
    }),
    route("GET", "/api/story/sessions", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        sessions: listStorySessions(db, userId),
      });
    }),
    route("POST", "/api/story/sessions", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const botIds = normalizeStoryCreateBotIds(body.botIds);
      const storyBots = loadStoryBotProfiles(db, userId, botIds);
      const user = getUserRow(userId);
      const requestedProvider = readProvider(body.preferredProvider);
      const anyOfflineProtected = storyBots.some((bot) => !bot.onlineEnabled);
      let effectiveProvider: ProviderName =
        anyOfflineProtected ? "local" : requestedProvider ?? user.preferred_provider;
      const explicitModelOverride = anyOfflineProtected ? null : readOptionalString(body.modelOverride);
      const requestedReasoningEffort = reasoningEffortForRequest(body.reasoningEffort);
      const storyModelOverride =
        effectiveProvider === "local" ? REQUIRED_PRIMARY_LOCAL_MODEL_ID : explicitModelOverride;
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const resolvedAuto = resolveAutoModel({
        provider: effectiveProvider,
        explicitModelOverride: storyModelOverride,
        botPreferredModel:
          effectiveProvider === "local"
            ? REQUIRED_PRIMARY_LOCAL_MODEL_ID
            : readOptionalString(user.preferred_online_model),
        hiddenModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
        catalog,
      });
      effectiveProvider = resolvedAuto.provider;
      const provider = selectProvider(
        effectiveProvider,
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const session = createStorySession(db, userId, {
        botIds,
        premise: readOptionalString(body.premise),
        provider: effectiveProvider,
        model: resolvedAuto.model,
      });
      void generateStorySessionEpisode(db, userId, session.id, {
        provider,
        providerName: effectiveProvider,
        model: resolvedAuto.model,
        bots: storyBots,
        premise: readOptionalString(body.premise),
        ...(requestedReasoningEffort ? { reasoningEffort: requestedReasoningEffort } : {}),
      }).catch((error) => {
        console.warn("[story] generation job failed", error);
      });
      json(ctx.res, 200, { ok: true, session });
    }),
    route("GET", "/api/story/sessions/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        session: getStorySessionDetail(db, userId, ctx.params.id),
      });
    }),
    route("POST", "/api/story/sessions/:id/choices", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const choiceId = readString(body.choiceId, "choiceId");
      json(ctx.res, 200, {
        ok: true,
        session: chooseStorySessionChoice(db, userId, ctx.params.id, choiceId),
      });
    }),
    route("POST", "/api/story/sessions/:id/travel", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const locationId = readString(body.locationId, "locationId");
      json(ctx.res, 200, {
        ok: true,
        session: travelStorySession(db, userId, ctx.params.id, locationId),
      });
    }),
    route("POST", "/api/story/sessions/:id/items", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const itemId = readString(body.itemId, "itemId");
      json(ctx.res, 200, {
        ok: true,
        session: pickupStorySessionItem(db, userId, ctx.params.id, itemId),
      });
    }),
    route("DELETE", "/api/story/sessions/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      deleteStorySession(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true });
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
    route("POST", "/api/conversations/zen/open", async (ctx) => {
      const userId = requireAuth(ctx);
      const existing = db
        .prepare(
          `SELECT id, conversation_mode
             FROM conversations c
            WHERE c.user_id = ?
              AND COALESCE(c.incognito, 0) = 0
              AND c.archived_at IS NULL
              AND c.conversation_mode IN ('zen', 'chat')
              AND (
                NOT EXISTS (
                  SELECT 1 FROM messages m_any
                   WHERE m_any.conversation_id = c.id
                     AND m_any.user_id = c.user_id
                )
                OR EXISTS (
                  SELECT 1 FROM messages m_assistant
                   WHERE m_assistant.conversation_id = c.id
                     AND m_assistant.user_id = c.user_id
                     AND m_assistant.role = 'assistant'
                )
              )
            ORDER BY c.updated_at DESC
            LIMIT 1`
        )
        .get(userId) as
        | { id?: string; conversation_mode?: string | null }
        | undefined;
      if (existing?.id) {
        if (existing.conversation_mode === "chat") {
          db.prepare(
            "UPDATE conversations SET conversation_mode = 'zen' WHERE id = ? AND user_id = ?"
          ).run(existing.id, userId);
        }
        json(ctx.res, 200, { ok: true, conversationId: existing.id });
        return;
      }
      const now = new Date().toISOString();
      const conversationId = randomId(12);
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
        ) VALUES (?, ?, 'Zen', 'zen', NULL, 0, ?, ?)`
      ).run(conversationId, userId, now, now);
      json(ctx.res, 200, { ok: true, conversationId });
    }),
    route("POST", "/api/conversations/:id/zen-starter-replay", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const action = body.action;
      if (action !== "suppress" && action !== "promote") {
        throw new HttpError(400, "Expected action to be suppress or promote.");
      }
      const result = setZenStarterConversationSuppression(
        db,
        userId,
        ctx.params.id,
        action === "suppress"
      );
      json(ctx.res, 200, { ok: true, ...result });
    }),
    route("GET", "/api/conversations/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      recoverStaleZenWallpaperStatusForRequest(userId, conversationId);
      // Same last_bot_* + has_assistant_reply triple as the list
      // endpoint so the ConversationDetail payload stays in lockstep —
      // client consumers can read either GET shape and resolve row tint
      // + composer-dropdown sync the same way.
      const conversation = db
        .prepare(
          `SELECT c.id, c.title, c.conversation_mode, c.bot_id, c.bot_group_ids,
                  c.coffee_settings, c.coffee_group_id, c.coffee_duration_minutes,
                  c.coffee_topic,
                  c.zen_wallpaper_enabled, c.zen_wallpaper_image_id,
                  c.zen_wallpaper_prompt_seed, c.zen_wallpaper_message_count,
                  c.zen_wallpaper_status, c.zen_wallpaper_history,
                  c.incognito, c.created_at, c.updated_at,
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
            coffee_group_id: string | null;
            coffee_duration_minutes: number | null;
            coffee_topic: string | null;
            zen_wallpaper_enabled: number | null;
            zen_wallpaper_image_id: string | null;
            zen_wallpaper_prompt_seed: string | null;
            zen_wallpaper_message_count: number | null;
            zen_wallpaper_status: string | null;
            zen_wallpaper_history: string | null;
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
      const conversationModeForMessages =
        conversation.conversation_mode === "zen" || conversation.conversation_mode === "chat"
          ? "zen"
          : conversation.conversation_mode === "coffee"
            ? "coffee"
            : "sandbox";
      const messageRowsRaw = db
        .prepare(
          `SELECT m.id, m.role, m.content, m.provider, m.model, m.tool_payload, m.created_at,
                  b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
           FROM messages m
           LEFT JOIN bots b ON b.id = m.bot_id
           WHERE m.conversation_id = ? AND m.user_id = ?
           ORDER BY m.created_at ${conversationModeForMessages === "zen" ? "DESC" : "ASC"}
           LIMIT ?`
        )
        .all(
          conversationId,
          userId,
          conversationModeForMessages === "zen" ? ZEN_RESTORE_MESSAGE_LIMIT : 100000
        ) as Array<{
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
      const messageRows =
        conversationModeForMessages === "zen"
          ? messageRowsRaw.slice().reverse()
          : messageRowsRaw;
      const totalMessageCount =
        conversationModeForMessages === "zen"
          ? (
              db
                .prepare(
                  "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
                )
                .get(conversationId, userId) as { n: number }
            ).n
          : messageRows.length;
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
        if (row.role === "user") {
          const promptShortcut = parseStoredPromptShortcutPayload(row.tool_payload);
          const promptShortcutWithResolvedPrompt = withPromptShortcutResolvedPrompt(
            promptShortcut,
            promptShortcut?.resolvedPrompt ?? row.content
          );
          const promptWildcards = parseStoredPromptWildcardPayload(row.tool_payload);
          const promptWildcardsWithResolvedPrompt = withPromptWildcardResolvedPrompt(
            promptWildcards,
            promptWildcards?.resolvedPrompt ?? row.content
          );
          return {
            ...shared,
            ...(promptShortcutWithResolvedPrompt
              ? { promptShortcut: promptShortcutWithResolvedPrompt }
              : {}),
            ...(promptWildcardsWithResolvedPrompt
              ? { promptWildcards: promptWildcardsWithResolvedPrompt }
              : {}),
          };
        }
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
      const conversationModeOut: "zen" | "chat" | "sandbox" | "coffee" =
        conversation.conversation_mode === "zen" || conversation.conversation_mode === "chat"
          ? "zen"
          : conversation.conversation_mode === "coffee"
            ? "coffee"
            : "sandbox";
      const botGroupIdsOut = parseConversationBotGroupIds(conversation.bot_group_ids);
      const coffeeSeatBotIdsOut = parseConversationCoffeeSeatBotIds(conversation.bot_group_ids);
      let prismMoodOut =
        conversationModeOut === "coffee"
          ? null
          : loadPrismMoodState(db, userId, conversation.id, conversationModeOut);
      if (prismMoodOut && conversationModeOut === "zen") {
        const settledMood = applyPrismMoodExpiredIgnoreCooldown(
          prismMoodOut,
          new Date().toISOString()
        );
        if (settledMood.recentDeltas[0]?.kind === "ignore_expired") {
          prismMoodOut = upsertPrismMoodState(db, userId, conversation.id, settledMood);
        }
      }
      const coffeeSettingsOut =
        conversationModeOut === "coffee"
          ? parseStoredCoffeeSessionSettings(conversation.coffee_settings)
          : undefined;
      const conversationForWallpaper =
        conversationModeOut === "zen"
          ? resetZenWallpaperMetadataForEmptyConversation(
              conversation.id,
              conversation,
              totalMessageCount
            )
          : conversation;
      const zenWallpaperOut = mapZenWallpaperMetadata(conversationForWallpaper);
      if (conversationModeOut === "zen") {
        Object.assign(
          zenWallpaperOut,
          rebaseZenWallpaperMetadataForVisibleWindow(
            zenWallpaperOut,
            totalMessageCount,
            messageRows.length
          )
        );
      }
      json(ctx.res, 200, {
        ok: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          mode: conversationModeOut,
          botId: conversationModeOut === "zen" ? null : conversation.bot_id ?? null,
          ...(botGroupIdsOut.length > 0 ? { botGroupIds: botGroupIdsOut } : {}),
          ...(conversationModeOut === "coffee"
            ? { coffeeGroupId: conversation.coffee_group_id ?? null }
            : {}),
          ...(coffeeSeatBotIdsOut.length > 0 ? { coffeeSeatBotIds: coffeeSeatBotIdsOut } : {}),
          ...(coffeeSettingsOut !== undefined ? { coffeeSettings: coffeeSettingsOut } : {}),
          ...(conversationModeOut === "coffee" &&
          (conversation.coffee_duration_minutes === 2 ||
            conversation.coffee_duration_minutes === 3 ||
            conversation.coffee_duration_minutes === 5)
            ? { coffeeSessionDurationMinutes: conversation.coffee_duration_minutes }
            : {}),
          ...(conversationModeOut === "coffee" &&
          typeof conversation.coffee_topic === "string" &&
          conversation.coffee_topic.trim().length > 0
            ? { coffeeTopic: conversation.coffee_topic.trim() }
            : {}),
          incognito: conversationModeOut === "zen" ? false : conversation.incognito === 1,
          lastBotId: conversation.last_bot_id ?? null,
          lastBotColor: conversation.last_bot_color ?? null,
          hasAssistantReply: conversation.has_assistant_reply === 1,
          ...(conversationModeOut === "zen" ? { zenWallpaper: zenWallpaperOut } : {}),
          ...(prismMoodOut ? { prismMood: prismMoodOut } : {}),
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          messages,
        },
        ...(opinion ? { opinion } : {}),
        ...(botOpinion ? { botOpinion } : {}),
      });
    }),
    route("POST", "/api/conversations/:id/zen-wallpaper", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      recoverStaleZenWallpaperStatusForRequest(userId, conversationId);
      const body = ctx.body as Record<string, unknown>;
      const enabled = body.enabled !== false;
      const generationRequested = body.generate !== false;
      const replaceImmediately = generationRequested && body.replaceImmediately === true;
      const force = generationRequested && (body.force === true || replaceImmediately);
      const requestedProvider =
        body.preferredProvider === "openai" || body.preferredProvider === "local"
          ? body.preferredProvider
          : undefined;
      const bodyModel =
        typeof body.model === "string" && body.model.trim().length > 0
          ? body.model.trim()
          : undefined;
      const promptOverride =
        typeof body.promptOverride === "string"
          ? clampZenWallpaperPromptText(body.promptOverride, 3000)
          : "";
      if (body.promptOverride !== undefined && promptOverride.length === 0) {
        throw new HttpError(400, "Type a custom Atmosphere prompt before generating.");
      }
      const conversation = db
        .prepare(
          `SELECT c.id, c.conversation_mode, c.bot_id,
                  c.zen_wallpaper_enabled, c.zen_wallpaper_image_id,
                  c.zen_wallpaper_prompt_seed, c.zen_wallpaper_message_count,
                  c.zen_wallpaper_status, c.zen_wallpaper_history,
                  b.name AS bot_name, b.system_prompt AS bot_system_prompt,
                  b.local_image_model AS bot_local_image_model,
                  b.openai_image_model AS bot_openai_image_model,
                  b.online_enabled AS bot_online_enabled
             FROM conversations c
             LEFT JOIN bots b ON b.id = c.bot_id AND b.user_id = c.user_id
            WHERE c.id = ? AND c.user_id = ?`
        )
        .get(conversationId, userId) as
        | {
            id: string;
            conversation_mode: string | null;
            bot_id: string | null;
            zen_wallpaper_enabled: number | null;
            zen_wallpaper_image_id: string | null;
            zen_wallpaper_prompt_seed: string | null;
            zen_wallpaper_message_count: number | null;
            zen_wallpaper_status: string | null;
            zen_wallpaper_history: string | null;
            bot_name: string | null;
            bot_system_prompt: string | null;
            bot_local_image_model: string | null;
            bot_openai_image_model: string | null;
            bot_online_enabled: number | null;
          }
        | undefined;
      if (!conversation) {
        throw new HttpError(404, "Conversation not found.");
      }
      if (conversation.conversation_mode !== "zen" && conversation.conversation_mode !== "chat") {
        throw new HttpError(400, "Zen Atmosphere is only available for Zen chats.");
      }
      if (conversation.conversation_mode === "chat") {
        db.prepare(
          "UPDATE conversations SET conversation_mode = 'zen' WHERE id = ? AND user_id = ?"
        ).run(conversationId, userId);
      }

      if (!enabled) {
        db.prepare(
          `UPDATE conversations
              SET zen_wallpaper_enabled = 0,
                  zen_wallpaper_status = 'idle'
            WHERE id = ? AND user_id = ?`
        ).run(conversationId, userId);
        json(ctx.res, 200, {
          ok: true,
          zenWallpaper: zenWallpaperResponseForConversation(conversationId),
        });
        return;
      }

      const messages = db
        .prepare(
          `SELECT id, role, content
             FROM messages
            WHERE conversation_id = ? AND user_id = ?
            ORDER BY created_at ASC`
        )
        .all(conversationId, userId) as Array<{ id: string; role: string; content: string }>;
      const messageCount = messages.length;
      const latestMessageIdAtGeneration = messages[messages.length - 1]?.id ?? null;
      db.prepare(
        `UPDATE conversations
            SET zen_wallpaper_enabled = 1,
                zen_wallpaper_status = CASE
                  WHEN zen_wallpaper_image_id IS NOT NULL THEN 'ready'
                  ELSE 'idle'
                END
          WHERE id = ? AND user_id = ?`
      ).run(conversationId, userId);
      if (messageCount === 0) {
        json(ctx.res, 200, {
          ok: true,
          zenWallpaper: zenWallpaperResponseForConversation(conversationId),
        });
        return;
      }
      if (!generationRequested) {
        json(ctx.res, 200, {
          ok: true,
          zenWallpaper: zenWallpaperResponseForConversation(conversationId),
        });
        return;
      }

      const user = getUserRow(userId);
      const existingWallpaper = mapZenWallpaperMetadata(conversation);
      const lastGeneratedAt = existingWallpaper.generationMessageCount ?? 0;
      const zenWallpaperRegenMessageInterval =
        normalizeZenWallpaperRegenMessageInterval(
          user.zen_wallpaper_regen_message_interval
        );
      const needsGeneration =
        force ||
        !existingWallpaper.imageId ||
        messageCount - lastGeneratedAt >= zenWallpaperRegenMessageInterval ||
        normalizeZenWallpaperStatus(conversation.zen_wallpaper_status) === "error";
      if (!needsGeneration) {
        json(ctx.res, 200, {
          ok: true,
          zenWallpaper: zenWallpaperResponseForConversation(conversationId),
        });
        return;
      }

      const firstUserMessage =
        messages.find((message) => message.role === "user")?.content ?? "";
      const recentContext = messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-8)
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
      const prompt =
        promptOverride ||
        composeZenWallpaperPrompt({
          initialUserPrompt: firstUserMessage,
          recentContext,
          botName: conversation.bot_name,
          botSystemPrompt: conversation.bot_system_prompt,
        });

      const botForcesLocal = conversation.bot_online_enabled === 0;
      const effectiveProvider =
        botForcesLocal
          ? "local"
          : requestedProvider ?? (user.preferred_provider === "local" ? "local" : "openai");
      const resolvedLocalImageModel =
        (bodyModel && effectiveProvider === "local" ? bodyModel : "") ||
        (conversation.bot_local_image_model?.trim() ?? "") ||
        (user.preferred_zen_wallpaper_local_image_model?.trim() ?? "") ||
        (user.preferred_local_image_model?.trim() ?? "");
      const resolvedOpenAiImageModel =
        (bodyModel && effectiveProvider !== "local" ? bodyModel : "") ||
        (conversation.bot_openai_image_model?.trim() ?? "") ||
        (user.preferred_zen_wallpaper_openai_image_model?.trim() ?? "") ||
        (user.preferred_openai_image_model?.trim() ?? "");
      if (effectiveProvider === "local" && !resolvedLocalImageModel) {
        db.prepare(
          `UPDATE conversations
              SET zen_wallpaper_status = 'error'
            WHERE id = ? AND user_id = ?`
        ).run(conversationId, userId);
        throw new HttpError(
          400,
          "Pick a local Atmosphere wallpaper model in Settings before generating Zen Atmosphere."
        );
      }

      const acqWallpaper = await tryAcquireImageSlot({
        userId,
        conversationId,
        botId: null,
        mode: "zen",
        incognito: false,
        captionPrompt: prompt,
        userMessage: promptOverride
          ? `[Zen wallpaper custom prompt] ${promptOverride.slice(0, 500)}`
          : `[Zen wallpaper] ${firstUserMessage.slice(0, 500)}`,
        source: "zen_wallpaper",
        requestedSize: ZEN_WALLPAPER_SIZE,
      });
      if (!acqWallpaper.ok) {
        throw new HttpError(
          503,
          "Another image is generating right now. Wait for it to finish, then try Atmosphere again."
        );
      }

      const imageGenAbort = new AbortController();
      const onImageGenClientClose = () => imageGenAbort.abort();
      ctx.req.once("close", onImageGenClientClose);
      db.prepare(
        `UPDATE conversations
            SET zen_wallpaper_enabled = 1,
                zen_wallpaper_status = 'generating'
          WHERE id = ? AND user_id = ?`
      ).run(conversationId, userId);
      const zenWallpaperRevealDelayMessageCount =
        normalizeZenWallpaperRevealDelayMessageCount(
          user.zen_wallpaper_reveal_delay_message_count
        );
      const zenWallpaperRevealSpanMessageCount =
        normalizeZenWallpaperRevealSpanMessageCount(
          user.zen_wallpaper_reveal_span_message_count
        );
      const nextWallpaperHistoryJson = (imageId: string, createdAt: string): string =>
        serializeZenWallpaperHistory(
          buildZenWallpaperHistoryForGeneratedImage(
            conversation.zen_wallpaper_history,
            {
              imageId,
              promptSeed: prompt,
              generationMessageCount: messageCount,
              revealStartMessageCount:
                messageCount + zenWallpaperRevealDelayMessageCount,
              revealFullMessageCount:
                messageCount +
                zenWallpaperRevealDelayMessageCount +
                zenWallpaperRevealSpanMessageCount,
              createdAt,
            },
            {
              latestMessageCount: messageCount,
              restoreMessageLimit: ZEN_RESTORE_MESSAGE_LIMIT,
              replaceImmediately,
            }
          )
        );
      const sendGeneratedZenWallpaperResponse = (
        imageId: string,
        wallpaperCreatedAt: string
      ): void => {
        const currentTarget = db
          .prepare(
            `SELECT zen_wallpaper_enabled
               FROM conversations
              WHERE id = ? AND user_id = ?`
          )
          .get(conversationId, userId) as
          | { zen_wallpaper_enabled: number | null }
          | undefined;
        const anchorStillPresent =
          !latestMessageIdAtGeneration ||
          Boolean(
            db
              .prepare(
                `SELECT id
                   FROM messages
                  WHERE id = ? AND conversation_id = ? AND user_id = ?`
              )
              .get(latestMessageIdAtGeneration, conversationId, userId)
          );
        if (currentTarget?.zen_wallpaper_enabled !== 1 || !anchorStillPresent) {
          db.prepare(
            "UPDATE images SET conversation_id = NULL WHERE id = ? AND user_id = ?"
          ).run(imageId, userId);
          db.prepare(
            `UPDATE conversations
                SET zen_wallpaper_status = CASE
                  WHEN zen_wallpaper_enabled = 1 AND zen_wallpaper_image_id IS NOT NULL THEN 'ready'
                  ELSE 'idle'
                END
              WHERE id = ? AND user_id = ?`
          ).run(conversationId, userId);
          json(ctx.res, 200, {
            ok: true,
            zenWallpaper: zenWallpaperResponseForConversation(conversationId),
          });
          return;
        }
        db.prepare(
          `UPDATE conversations
              SET zen_wallpaper_enabled = 1,
                  zen_wallpaper_image_id = ?,
                  zen_wallpaper_prompt_seed = ?,
                  zen_wallpaper_message_count = ?,
                  zen_wallpaper_history = ?,
                  zen_wallpaper_status = 'ready'
            WHERE id = ? AND user_id = ?`
        ).run(
          imageId,
          prompt,
          messageCount,
          nextWallpaperHistoryJson(imageId, wallpaperCreatedAt),
          conversationId,
          userId
        );
        json(ctx.res, 200, {
          ok: true,
          image: { id: imageId },
          zenWallpaper: zenWallpaperResponseForConversation(conversationId),
        });
      };

      try {
        const imageId = randomId(12);
        const localRelPath = buildGeneratedImageRelativePath(userId, imageId);
        const promptForModel = prompt;

        if (effectiveProvider === "local") {
          const lenientImageFb = user.lenient_local_image_fallback_model?.trim() ?? "";
          const runLocalBytes = (modelId: string) =>
            generateLocalImageBytesByModelId({
              modelId,
              promptForModel,
              size: ZEN_WALLPAPER_SIZE,
              signal: imageGenAbort.signal,
              comfyUiHost: user.comfyui_host,
              comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
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
          try {
            writeGeneratedImageBytes(localRelPath, localOut.imageBytes);
          } catch (error) {
            const detail = error instanceof Error ? error.message : "write failed";
            throw new Error(`Could not save Zen wallpaper (${detail}).`);
          }
          await tryGenerateThumbAfterPngWrite(localRelPath);
          const storedUrl = `/api/images/${encodeURIComponent(imageId)}/file`;
          const wallpaperCreatedAt = new Date().toISOString();
          try {
            db.prepare(
              "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wallpaper', ?)"
            ).run(
              imageId,
              userId,
              conversationId,
              null,
              prompt,
              prompt,
              storedUrl,
              ZEN_WALLPAPER_SIZE,
              ZEN_WALLPAPER_QUALITY,
              localOut.provider,
              localOut.modelUsed,
              localRelPath,
              wallpaperCreatedAt
            );
          } catch (error) {
            tryUnlinkGeneratedImageFile(localRelPath);
            throw error;
          }
          sendGeneratedZenWallpaperResponse(imageId, wallpaperCreatedAt);
          return;
        }

        const userKey = decryptUserKey(userId);
        const apiKey = getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
        const lenientImageFbOnline = user.lenient_local_image_fallback_model?.trim() ?? "";
        let openAiResult: Awaited<ReturnType<typeof generateImage>> | null = null;
        try {
          openAiResult = await generateImage(promptForModel, apiKey, {
            model: resolvedOpenAiImageModel || undefined,
            size: ZEN_WALLPAPER_SIZE,
            quality: ZEN_WALLPAPER_QUALITY,
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
              size: ZEN_WALLPAPER_SIZE,
              signal: imageGenAbort.signal,
              comfyUiHost: user.comfyui_host,
              comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
              secondaryOllamaHost: user.secondary_ollama_host,
              primaryOllamaHost: config.ollamaHost,
            });
            try {
              writeGeneratedImageBytes(localRelPath, localOut.imageBytes);
            } catch (error) {
              const detail = error instanceof Error ? error.message : "write failed";
              throw new Error(`Could not save Zen wallpaper (${detail}).`);
            }
            await tryGenerateThumbAfterPngWrite(localRelPath);
            const storedUrl = `/api/images/${encodeURIComponent(imageId)}/file`;
            const wallpaperCreatedAt = new Date().toISOString();
            try {
              db.prepare(
                "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'wallpaper', ?)"
              ).run(
                imageId,
                userId,
                conversationId,
                null,
                prompt,
                prompt,
                storedUrl,
                ZEN_WALLPAPER_SIZE,
                ZEN_WALLPAPER_QUALITY,
                localOut.provider,
                localOut.modelUsed,
                localRelPath,
                wallpaperCreatedAt
              );
            } catch (error) {
              tryUnlinkGeneratedImageFile(localRelPath);
              throw error;
            }
            sendGeneratedZenWallpaperResponse(imageId, wallpaperCreatedAt);
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
          imageBytes = await readOpenAiGeneratedImageBytes(result, imageGenAbort.signal);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "download failed";
          throw new Error(`Could not download Zen wallpaper for local storage (${detail}).`);
        }
        try {
          writeGeneratedImageBytes(localRelPath, imageBytes);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "write failed";
          throw new Error(`Could not save Zen wallpaper (${detail}).`);
        }
        await tryGenerateThumbAfterPngWrite(localRelPath);
        const storedUrl = result.url || `/api/images/${encodeURIComponent(imageId)}/file`;
        const wallpaperCreatedAt = new Date().toISOString();
        try {
          db.prepare(
            "INSERT INTO images (id, user_id, conversation_id, bot_id, prompt, revised_prompt, url, size, quality, provider, model, local_rel_path, purpose, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'openai', ?, ?, 'wallpaper', ?)"
          ).run(
            imageId,
            userId,
            conversationId,
            null,
            prompt,
            result.revisedPrompt,
            storedUrl,
            ZEN_WALLPAPER_SIZE,
            ZEN_WALLPAPER_QUALITY,
            result.model,
            localRelPath,
            wallpaperCreatedAt
          );
        } catch (error) {
          tryUnlinkGeneratedImageFile(localRelPath);
          throw error;
        }
        sendGeneratedZenWallpaperResponse(imageId, wallpaperCreatedAt);
      } catch (error) {
        db.prepare(
          `UPDATE conversations
              SET zen_wallpaper_status = 'error'
            WHERE id = ? AND user_id = ?`
        ).run(conversationId, userId);
        throw error;
      } finally {
        ctx.req.off("close", onImageGenClientClose);
        await releaseImageSlot(userId);
      }
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
      const mode =
        ctx.query.get("mode") === "zen" || ctx.query.get("mode") === "chat"
          ? "zen"
          : "sandbox";
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
      const mode =
        ctx.query.get("mode") === "zen" || ctx.query.get("mode") === "chat"
          ? "zen"
          : "sandbox";
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
      const user = getUserRow(userId);
      // Always run a refresh pass so display-copy improvements and format
      // updates can roll forward without requiring message activity.
      await summarizeSandboxBotStatus(
        db,
        getAuxiliaryProvider(
          user.prism_default_llm_model,
          dualOllamaWorkloadOptions(user)
        ),
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
      const mode =
        ctx.query.get("mode") === "zen" || ctx.query.get("mode") === "chat"
          ? "zen"
          : "sandbox";
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
        body.mode === "zen" ||
        body.mode === "chat" ||
        ctx.query.get("mode") === "zen" ||
        ctx.query.get("mode") === "chat"
          ? "zen"
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
      const user = getUserRow(userId);
      const compacted = await summarizeThreadCompact(
        db,
        getAuxiliaryProvider(
          user.prism_default_llm_model,
          dualOllamaWorkloadOptions(user)
        ),
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
            getAuxiliaryProvider(
              user.prism_default_llm_model,
              dualOllamaWorkloadOptions(user)
            ),
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
    route("POST", "/api/conversations/:id/clear", async (ctx) => {
      const userId = requireAuth(ctx);
      const result = clearConversationMessages(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true, ...result });
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
    route("POST", "/api/conversations/:id/mood-debug", async (ctx) => {
      if (!devMoodDebugAllowed()) {
        throw new HttpError(403, "Mood debug controls are disabled.");
      }
      const userId = requireAuth(ctx);
      const conversation = db
        .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
        .get(ctx.params.id, userId) as
        | { id: string; conversation_mode: string | null }
        | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      const body = ctx.body as Record<string, unknown>;
      const mode = readPrismMoodMode(body.mode ?? conversation.conversation_mode);
      const now = new Date().toISOString();
      const current = loadPrismMoodState(db, userId, conversation.id, mode) ??
        resetPrismMood(mode, now);
      const action = typeof body.action === "string" ? body.action : "nudge";
      const mood =
        action === "reset"
          ? resetPrismMood(mode, now)
          : debugPatchPrismMood(
              current,
              {
                annoyanceDelta:
                  typeof body.annoyanceDelta === "number" ? body.annoyanceDelta : 0,
                warmthDelta: typeof body.warmthDelta === "number" ? body.warmthDelta : 0,
                engagementDelta:
                  typeof body.engagementDelta === "number" ? body.engagementDelta : 0,
                restraintDelta:
                  typeof body.restraintDelta === "number" ? body.restraintDelta : 0,
                reason: readOptionalString(body.reason) ?? "Developer Tools nudged mood.",
                ...(typeof body.freeze === "boolean" ? { freeze: body.freeze } : {}),
              },
              now
            );
      const persisted = upsertPrismMoodState(db, userId, conversation.id, mood);
      json(ctx.res, 200, { ok: true, prismMood: persisted });
    }),
    route("POST", "/api/conversations/:id/prism-mood/reset", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversation = db
        .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
        .get(ctx.params.id, userId) as
        | { id: string; conversation_mode: string | null }
        | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      if (conversation.conversation_mode !== "zen" && conversation.conversation_mode !== "chat") {
        throw new Error("Only Zen conversations can reset Prism mood.");
      }
      const now = new Date().toISOString();
      const mode = readPrismMoodMode(conversation.conversation_mode);
      const persisted = upsertPrismMoodState(
        db,
        userId,
        conversation.id,
        resetPrismMood(mode, now)
      );
      json(ctx.res, 200, { ok: true, prismMood: persisted });
    }),
    route("POST", "/api/conversations/:id/prism-mood/interrupt", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversation = db
        .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
        .get(ctx.params.id, userId) as
        | { id: string; conversation_mode: string | null }
        | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      if (conversation.conversation_mode !== "zen" && conversation.conversation_mode !== "chat") {
        throw new Error("Only Zen conversations can be interrupted.");
      }
      const body = ctx.body as Record<string, unknown>;
      const mode = readPrismMoodMode(conversation.conversation_mode);
      const now = new Date().toISOString();
      const prismInterruption =
        readPrismInterruption(body.prismInterruption) ?? { kind: "pending_reply" };
      const currentMood = loadPrismMoodState(db, userId, conversation.id, mode) ??
        createDefaultPrismMoodState(mode, now);
      const user = getUserRow(userId);
      const persisted = upsertPrismMoodState(
        db,
        userId,
        conversation.id,
        applyPrismMoodInterruption(
          currentMood,
          prismInterruption,
          now,
          normalizeZenMoodSensitivity(user.zen_mood_sensitivity)
        )
      );
      json(ctx.res, 200, { ok: true, prismMood: persisted });
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
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      let effectiveProvider = forceLocal ? "local" : user.preferred_provider;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
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
        user.secondary_ollama_host,
        anthropicApiKey
      );
      try {
        const cleanedText = await cleanupComposerTextWithModel({
          text,
          provider,
          model: resolvedAuto.model,
        });
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
    route("POST", "/api/composer/wildcard-value", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const slot = getBuiltInPromptWildcardSlot(
        body.key ?? body.slotKey ?? body.label ?? body.name
      );
      if (!slot) {
        throw new HttpError(400, "Unknown wildcard slot.");
      }
      if (slot.key === "NUM") {
        json(ctx.res, 200, {
          ok: true,
          key: slot.key,
          value: String(1 + Math.floor(Math.random() * 100)),
        });
        return;
      }
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      let effectiveProvider = readProvider(body.preferredProvider) ?? user.preferred_provider;
      const explicitModelOverride = readOptionalString(body.modelOverride);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const resolvedAuto = resolveAutoModel({
        provider: effectiveProvider,
        explicitModelOverride,
        botPreferredModel:
          effectiveProvider === "local"
            ? readOptionalString(user.prism_default_llm_model) ??
              readOptionalString(user.preferred_local_model)
            : readOptionalString(user.preferred_online_model),
        hiddenModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
        catalog,
      });
      effectiveProvider = resolvedAuto.provider;
      const provider = selectProvider(
        effectiveProvider,
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const raw = await provider.generateResponse(
        [
          {
            role: "system",
            content: COMPOSER_WILDCARD_VALUE_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: [
              `Wildcard key: ${slot.key}`,
              `Display label: ${slot.label}`,
              `Generation rule: ${slot.generationHint}`,
              "Choose one genuinely random value that fits the wildcard type.",
              "Do not use conversation context, user context, current prompt text, or adjacent words.",
              `Random nonce: ${randomId(10)}`,
              "Return JSON only: {\"value\":\"...\"}",
            ].join("\n"),
          },
        ],
        {
          model: resolvedAuto.model,
          temperature: 1.08,
          maxTokens: 80,
          jsonMode: true,
        }
      );
      const value = normalizeComposerWildcardValueResponse(raw, slot);
      json(ctx.res, 200, {
        ok: true,
        key: slot.key,
        value,
        provider: effectiveProvider,
        model: resolvedAuto.model,
      });
    }),
    route("POST", "/api/composer/random-prompt", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const mode =
        body.mode === "zen" || body.mode === "chat"
          ? "zen"
          : "sandbox";
      const botId: string | null | undefined =
        typeof body.botId === "string"
          ? body.botId
          : body.botId === null
            ? null
            : undefined;
      const effectiveBotId = botId;
      const recentMessages = readComposerRecentMessages(body.recentMessages);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      let effectiveProvider = readProvider(body.preferredProvider) ?? user.preferred_provider;
      const explicitModelOverride = readOptionalString(body.modelOverride);
      let botPreferredModel: string | null = null;
      let botName = "Prism";
      let botSystemPrompt: string | undefined;
      let botForcesLocalProvider = false;
      const generationOverrides: GenerateOptions = {};
      const facetLines: string[] = [];
      if (typeof effectiveBotId === "string" && effectiveBotId.trim().length > 0) {
        const bot = db
          .prepare(
            "SELECT name, system_prompt, semantic_facets, model, local_model, online_model, online_enabled, flirt_enabled, temperature, max_tokens FROM bots WHERE id = ? AND (user_id = ? OR visibility = 'public')"
          )
          .get(effectiveBotId, userId) as
          | {
              name?: string;
              system_prompt?: string;
              semantic_facets?: string | null;
              model?: string | null;
              local_model?: string | null;
              online_model?: string | null;
              online_enabled?: number | null;
              flirt_enabled?: number | null;
              temperature?: number | null;
              max_tokens?: number | null;
            }
          | undefined;
        if (bot) {
          botName = bot.name?.trim() || "this bot";
          botSystemPrompt = composeBotSystemPrompt(
            botName,
            bot.system_prompt,
            bot.flirt_enabled === 1
          );
          facetLines.push(...readBotSemanticFacetSummary(bot.semantic_facets));
          if (bot.online_enabled === 0 && effectiveProvider !== "local") {
            effectiveProvider = "local";
            botForcesLocalProvider = true;
          }
          botPreferredModel =
            effectiveProvider === "local"
              ? readOptionalString(bot.local_model) ?? readOptionalString(bot.model)
              : readOptionalString(bot.online_model);
          if (typeof bot.temperature === "number") {
            generationOverrides.temperature = bot.temperature;
          }
        }
      }

      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
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
      const provider = selectProvider(
        effectiveProvider,
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const memoryLines = retrieveRecentMemoriesForStarter(
        db,
        userId,
        userKey,
        typeof effectiveBotId === "string" ? effectiveBotId : null,
        5
      ).map((memory) => memory.text);
      const recentContextLines = recentMessages.map((message) => {
        const speaker =
          message.role === "assistant"
            ? message.botName?.trim() || botName || "Assistant"
            : "User";
        return `${speaker}: ${message.content}`;
      });
      const latestRecentMessage = recentMessages[recentMessages.length - 1] ?? null;
      const randomPromptMode =
        recentMessages.length === 0
          ? "opening"
          : latestRecentMessage?.role === "assistant"
            ? "reply"
            : "followup";
      const randomPromptTask =
        randomPromptMode === "opening"
          ? [
              "Task: Write the first user message for a brand-new conversation.",
              "Invent something genuinely random but coherent: curious, playful, practical, reflective, or lightly weird is fine; nonsense is not.",
              "It should feel like a real person starting a conversation, not like a writing prompt template.",
            ]
          : randomPromptMode === "reply"
            ? [
                "Task: Write the user's next reply to the assistant's latest message.",
                "Privately answer this: What would be a good response to this prompt?",
                "The message may answer the assistant, ask a follow-up, choose a direction, or push back naturally.",
              ]
            : [
                "Task: Write one natural additional user message that continues the current thread.",
                "It should add a useful detail, clarify intent, or ask the next obvious thing a person might ask.",
              ];
      const promptMessages: ProviderMessage[] = [
        {
          role: "system",
          content: COMPOSER_RANDOM_PROMPT_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            `Active surface: ${mode}.`,
            `Active bot/persona: ${botName}.`,
            botSystemPrompt
              ? `Bot persona instructions:\n${clampComposerContextText(botSystemPrompt, 1800)}`
              : "Bot persona instructions: Default Prism.",
            facetLines.length > 0
              ? `Bot facets:\n${facetLines.map((line) => `- ${line}`).join("\n")}`
              : "Bot facets: none recorded.",
            memoryLines.length > 0
              ? `Relevant remembered facts:\n${memoryLines
                  .map((line) => `- ${clampComposerContextText(line, 260)}`)
                  .join("\n")}`
              : "Relevant remembered facts: none available.",
            recentContextLines.length > 0
              ? `Recent conversation:\n${recentContextLines
                  .map((line) => `- ${clampComposerContextText(line, 420)}`)
                  .join("\n")}`
              : "Recent conversation: none yet.",
            `Generation mode: ${randomPromptMode}.`,
            ...randomPromptTask,
            "Keep it short: one conversational message, roughly 5-28 words.",
            "Avoid generic prompts like 'Tell me something interesting.'",
            "Do not include labels, explanations, quotation marks, or multiple options.",
          ].join("\n\n"),
        },
      ];
      const raw = await provider.generateResponse(promptMessages, {
        ...generationOverrides,
        model: resolvedAuto.model,
        temperature: Math.max(0.72, generationOverrides.temperature ?? 0.78),
        maxTokens: 220,
        jsonMode: true,
      });
      const prompt = normalizeComposerRandomPromptResponse(raw);
      json(ctx.res, 200, {
        ok: true,
        prompt,
        provider: effectiveProvider,
        model: resolvedAuto.model,
      });
    }),
    route("POST", "/api/chat", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const starterPrompt = body.starterPrompt === true;
      const starterPromptWarrantsIntro =
        starterPrompt && body.starterPromptWarrantsIntro === true;
      const message = starterPrompt ? "" : readString(body.message, "message");
      const promptShortcut = normalizePromptShortcutMetadata(body.promptShortcut);
      const promptWildcards = normalizePromptWildcardRunMetadata(body.promptWildcards);
      const commandCenterPrompt = body.commandCenterPrompt === true || Boolean(promptShortcut);
      const resolvedCommandCenterPrompt =
        !starterPrompt && commandCenterPrompt
          ? readOptionalString(body.resolvedCommandCenterPrompt)
          : null;
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
      const mode =
        body.mode === "zen" || body.mode === "chat"
          ? "zen"
          : "sandbox";
      // Zen is a continuous PRISM-only lane: no private/incognito turns.
      // Sandbox ignores incognito as before.
      const incognito = false;
      // Per-request provider/model override so a fresh playground/Zen switch
      // takes effect immediately. Zen remains PRISM-only, but users can still
      // choose how PRISM replies.
      const explicitModelOverride = readOptionalString(body.modelOverride);
      const requestedReasoningEffort = reasoningEffortForRequest(body.reasoningEffort);
      const providerOverride = readProvider(body.preferredProvider);
      const requestedProvider = providerOverride ?? undefined;
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      let effectiveProvider = requestedProvider ?? user.preferred_provider;
      const effectiveBotId = mode === "zen" ? null : botId;
      const ephemeralMessages = Array.isArray(body.ephemeralMessages)
        ? body.ephemeralMessages as ChatMessage[]
        : undefined;
      const sessionResumeContext =
        mode === "zen"
          ? normalizeSessionResumeContext(body.sessionResumeContext)
          : null;
      const prismInterruption =
        mode === "zen" ? readPrismInterruption(body.prismInterruption) : undefined;

      let botSystemPrompt: string | undefined;
      let starterPromptLabel: string | undefined;
      let botForcesLocalProvider = false;
      let botPreferredModel: string | null = null;
      const generationOverrides: GenerateOptions = {};
      if (effectiveBotId) {
        const bot = db
          .prepare(
            "SELECT name, system_prompt, model, local_model, online_model, online_enabled, flirt_enabled, temperature, max_tokens FROM bots WHERE id = ? AND (user_id = ? OR visibility = 'public')"
          )
          .get(effectiveBotId, userId) as
          | {
              name?: string;
              system_prompt?: string;
              model?: string | null;
              local_model?: string | null;
              online_model?: string | null;
              online_enabled?: number | null;
              flirt_enabled?: number | null;
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
          botSystemPrompt = composeBotSystemPrompt(
            bot.name,
            bot.system_prompt,
            bot.flirt_enabled === 1
          );
          if (bot.online_enabled === 0 && effectiveProvider !== "local") {
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
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
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
      if (requestedReasoningEffort) {
        generationOverrides.reasoningEffort = requestedReasoningEffort;
      }
      const botOverrides =
        Object.keys(generationOverrides).length > 0
          ? generationOverrides
          : undefined;

      const chatAbort = new AbortController();
      const onChatClientClose = () => {
        if (!ctx.res.writableEnded) {
          chatAbort.abort();
        }
      };
      ctx.req.once("close", onChatClientClose);
      ctx.req.once("aborted", onChatClientClose);
      ctx.res.once("close", onChatClientClose);
      let messageForChat = resolvedCommandCenterPrompt ?? message;
      let promptShortcutForChat = promptShortcut;
      let promptWildcardsForChat = promptWildcards;
      let resolvedWildcardReplacements =
        promptShortcut?.wildcardReplacements ?? promptWildcards?.wildcardReplacements ?? [];
      const hasTrueWildcardSlots = promptWildcardNames(messageForChat).length > 0;
      if (
        !starterPrompt &&
        (commandCenterPrompt || promptWildcards) &&
        hasTrueWildcardSlots
      ) {
        const wildcardProvider = selectProvider(
          effectiveProvider,
          openAiApiKey,
          user.secondary_ollama_host,
          anthropicApiKey
        );
        const wildcardResolution = await resolvePromptWildcardsWithModel({
          prompt: messageForChat,
          provider: wildcardProvider,
          generationOverrides,
          existingReplacements:
            promptShortcut?.wildcardReplacements ?? promptWildcards?.wildcardReplacements,
          signal: chatAbort.signal,
        });
        messageForChat = wildcardResolution.prompt;
        resolvedWildcardReplacements = wildcardResolution.replacements;
      }
      if (
        !starterPrompt &&
        (commandCenterPrompt || promptWildcards) &&
        user.composer_writing_assist !== 0 &&
        resolvedWildcardReplacements.length > 0 &&
        messageForChat.trim().length > 0
      ) {
        const cleanupProvider = selectProvider(
          effectiveProvider,
          openAiApiKey,
          user.secondary_ollama_host,
          anthropicApiKey
        );
        try {
          const cleanup = await cleanupResolvedPromptWithModel({
            prompt: messageForChat,
            replacements: resolvedWildcardReplacements,
            provider: cleanupProvider,
            model: resolvedAuto.model,
            signal: chatAbort.signal,
          });
          messageForChat = cleanup.prompt;
          resolvedWildcardReplacements = cleanup.replacements;
        } catch (error) {
          if (chatAbort.signal.aborted) {
            throw error;
          }
          console.warn(
            "[composer-cleanup] leaving resolved prompt uncorrected:",
            error instanceof Error ? error.message : error
          );
        }
      }
      promptShortcutForChat = withPromptShortcutResolvedPrompt(
        promptShortcut
          ? {
              ...promptShortcut,
              wildcardReplacements: resolvedWildcardReplacements,
            }
          : undefined,
        messageForChat
      );
      promptWildcardsForChat = withPromptWildcardResolvedPrompt(
        promptWildcards
          ? {
              ...promptWildcards,
              wildcardReplacements: resolvedWildcardReplacements,
            }
          : undefined,
        messageForChat
      );
      let result: Awaited<ReturnType<typeof processChatMessage>>;
      try {
        result = await processChatMessage(
          db,
          userId,
          message,
          userKey,
          {
            preferredProvider: effectiveProvider,
            autoMemory: !commandCenterPrompt && !incognito && Boolean(user.auto_memory),
            openAiApiKey,
            anthropicApiKey,
            userDisplayName: user.display_name,
            starterPrompt,
            starterPromptWarrantsIntro,
            starterPromptLabel,
            secondaryOllamaHost: user.secondary_ollama_host,
            lenientLocalFallbackModel: user.lenient_local_fallback_model,
            prismDefaultLlmModel: user.prism_default_llm_model,
            prismImageToolLlmModel: user.prism_image_tool_llm_model,
            recentContextMessageLimit: normalizeZenRecentContextMessages(
              user.zen_recent_context_messages
            ),
            zenMoodSensitivity: normalizeZenMoodSensitivity(
              user.zen_mood_sensitivity
            ),
            experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
            devMemoriesEnabled: user.dev_memories_enabled === 1,
            devMemoriesText: user.dev_memories_text,
            assistantImageUserPrefs: {
              preferredLocalImageModel: user.preferred_local_image_model,
              preferredOpenAiImageModel: user.preferred_openai_image_model,
              lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
              comfyuiHost: user.comfyui_host,
              comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
              secondaryOllamaHost: user.secondary_ollama_host,
            },
            botId: effectiveBotId,
            incognito,
            ephemeralMessages,
            botSystemPrompt,
            botOverrides,
            mode,
            sessionEnding,
            sessionResumeContext,
            forceNewConversation,
            prismInterruption,
            signal: chatAbort.signal,
            ...(commandCenterPrompt ? { commandCenterPrompt: true } : {}),
            ...(messageForChat !== message ? { promptInputOverride: messageForChat } : {}),
            ...(promptShortcutForChat ? { promptShortcut: promptShortcutForChat } : {}),
            ...(promptWildcardsForChat ? { promptWildcards: promptWildcardsForChat } : {}),
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
      } finally {
        ctx.req.off("close", onChatClientClose);
        ctx.req.off("aborted", onChatClientClose);
        ctx.res.off("close", onChatClientClose);
      }
      const {
        conversation,
        conversationStarters,
        fallbackInvocation,
        memoryLearned,
        opinion,
        botOpinion,
        prismMood,
        summaryCompaction,
        pendingImageJob,
        toolCalls,
        backendEvents,
      } = result;
      json(ctx.res, 200, {
        ok: true,
        conversation,
        ...(fallbackInvocation ? { fallbackInvocation } : {}),
        ...(opinion ? { opinion } : {}),
        ...(botOpinion ? { botOpinion } : {}),
        ...(prismMood ? { prismMood } : {}),
        ...(summaryCompaction ? { summaryCompaction } : {}),
        ...(memoryLearned ? { memoryLearned } : {}),
        ...(conversationStarters ? { conversationStarters } : {}),
        ...(pendingImageJob ? { pendingImageJob } : {}),
        ...(toolCalls ? { toolCalls } : {}),
        ...(backendEvents ? { backendEvents } : {}),
      });
    }),
    route("GET", "/api/image-jobs/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const jobId = decodeURIComponent((ctx.params.id ?? "").trim());
      if (!jobId) {
        throw new HttpError(400, "Missing job id.");
      }
      const result = pollImageJobForUser(userId, jobId);
      if (!result.ok) {
        if (result.error === "forbidden") {
          throw new HttpError(403, "Forbidden.");
        }
        throw new HttpError(404, "Image job not found.");
      }
      if (result.status === "running") {
        json(ctx.res, 200, { ok: true, status: "running" });
        return;
      }
      if (result.status === "succeeded") {
        json(ctx.res, 200, { ok: true, status: "succeeded", messages: result.messages });
        return;
      }
      json(ctx.res, 200, { ok: true, status: "failed", error: result.error });
    }),
    // Coffee mode (timed live sessions for 3-5 reactive bots). Lives on its own
    // endpoint rather than inside /api/chat so the lighter coffee
    // pipeline (router LLM + per-bot reply, no cross-thread memory) can
    // evolve independently of the heavier Chat/Sandbox flow.
    route("GET", "/api/coffee/groups", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        groups: listCoffeeGroups(db, userId),
      });
    }),
    route("GET", "/api/coffee/presets", async (ctx) => {
      const userId = requireAuth(ctx);
      json(ctx.res, 200, {
        ok: true,
        presets: listCoffeePresets(db, userId),
      });
    }),
    route("POST", "/api/coffee/presets", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const preset = createCoffeePreset(db, userId, {
        name: body.name,
        coffeeSettings: body.coffeeSettings,
      });
      json(ctx.res, 201, {
        ok: true,
        preset,
      });
    }),
    route("PATCH", "/api/coffee/presets/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const preset = updateCoffeePreset(db, userId, ctx.params.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.coffeeSettings !== undefined ? { coffeeSettings: body.coffeeSettings } : {}),
      });
      json(ctx.res, 200, {
        ok: true,
        preset,
      });
    }),
    route("DELETE", "/api/coffee/presets/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      deleteCoffeePreset(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true });
    }),
    route("POST", "/api/coffee/groups", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      const body = ctx.body as Record<string, unknown>;
      const groupBotIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : undefined;
      const group = await createCoffeeGroupWithGeneratedName(db, userId, {
        name: body.name,
        groupBotIds,
        coffeeSettings: body.coffeeSettings,
        ...(body.modelChoiceByProvider !== undefined
          ? { modelChoiceByProvider: body.modelChoiceByProvider }
          : {}),
      }, {
        prismDefaultLlmModel: user.prism_default_llm_model,
        secondaryOllamaHost: user.secondary_ollama_host,
        experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
      });
      json(ctx.res, 201, {
        ok: true,
        group,
      });
    }),
    route("PATCH", "/api/coffee/groups/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const groupBotIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : undefined;
      const group = updateCoffeeGroup(db, userId, ctx.params.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(groupBotIds !== undefined ? { groupBotIds } : {}),
        ...(body.coffeeSettings !== undefined ? { coffeeSettings: body.coffeeSettings } : {}),
        ...(body.presetMode !== undefined ? { presetMode: body.presetMode } : {}),
        ...(body.topicSelectionMode !== undefined ? { topicSelectionMode: body.topicSelectionMode } : {}),
        ...(body.modelChoiceByProvider !== undefined
          ? { modelChoiceByProvider: body.modelChoiceByProvider }
          : {}),
      });
      json(ctx.res, 200, {
        ok: true,
        group,
      });
    }),
    route("DELETE", "/api/coffee/groups/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      deleteCoffeeGroup(db, userId, ctx.params.id);
      json(ctx.res, 200, { ok: true });
    }),
    route("POST", "/api/coffee/groups/:id/sessions", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const initialPoll =
        body.initialPoll && typeof body.initialPoll === "object" && !Array.isArray(body.initialPoll)
          ? {
              question: (body.initialPoll as Record<string, unknown>).question,
              options: (body.initialPoll as Record<string, unknown>).options,
            }
          : undefined;
      const result = await createCoffeeConversationFromGroup(
        db,
        userId,
        ctx.params.id,
        {
          coffeeSettings: body.coffeeSettings,
          durationMinutes: body.durationMinutes,
          presetId: body.presetId,
          initialPoll,
        },
        {
          prismDefaultLlmModel: user.prism_default_llm_model,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userKey,
        }
      );
      json(ctx.res, 201, {
        ok: true,
        ...result,
      });
    }),
    route("POST", "/api/coffee/sessions", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const body = ctx.body as Record<string, unknown>;
      const groupBotIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : undefined;
      const initialPoll =
        body.initialPoll && typeof body.initialPoll === "object" && !Array.isArray(body.initialPoll)
          ? {
              question: (body.initialPoll as Record<string, unknown>).question,
              options: (body.initialPoll as Record<string, unknown>).options,
            }
          : undefined;
      const result = await createCoffeeConversation(
        db,
        userId,
        {
          groupBotIds,
          coffeeSettings: body.coffeeSettings,
          initialPoll,
        },
        {
          prismDefaultLlmModel: user.prism_default_llm_model,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userKey,
        }
      );
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/topic", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const conversation = await setCoffeeConversationTopic(
        db,
        userId,
        ctx.params.id,
        body.topic
      );
      json(ctx.res, 200, {
        ok: true,
        conversation,
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
    route("GET", "/api/coffee/sessions/:id/polls/active", async (ctx) => {
      const userId = requireAuth(ctx);
      const poll = getCoffeeSessionPoll(db, userId, ctx.params.id);
      json(ctx.res, 200, {
        ok: true,
        poll,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/polls", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const poll = createCoffeePoll(db, userId, ctx.params.id, {
        question: body.question,
        options: body.options,
      });
      json(ctx.res, 201, {
        ok: true,
        poll,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/polls/:pollId/collect", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const requestedProvider = readProvider(body.preferredProvider);
      const sessionRemainingMs =
        typeof body.sessionRemainingMs === "number" &&
        Number.isFinite(body.sessionRemainingMs)
          ? Math.max(0, body.sessionRemainingMs)
          : null;
      if (typeof body.optionIndex === "number" && Number.isFinite(body.optionIndex)) {
        setCoffeePollPlayerVote(
          db,
          userId,
          ctx.params.id,
          ctx.params.pollId,
          body.optionIndex,
          sessionRemainingMs
        );
      }
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const sessionSpeakerModel = readOptionalString(body.modelOverride);
      const result = await collectCoffeePollVotes(
        db,
        userId,
        ctx.params.id,
        ctx.params.pollId,
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          anthropicApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userDisplayName: user.display_name,
          userKey,
          prismDefaultLlmModel: user.prism_default_llm_model,
          assistantImageUserPrefs: {
            preferredLocalImageModel: user.preferred_local_image_model,
            preferredOpenAiImageModel: user.preferred_openai_image_model,
            lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
            comfyuiHost: user.comfyui_host,
            comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
            secondaryOllamaHost: user.secondary_ollama_host,
          },
          sessionRemainingMs,
          ...(sessionSpeakerModel ? { sessionSpeakerModel } : {}),
        }
      );
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/polls/:pollId/vote", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const sessionRemainingMs =
        typeof body.sessionRemainingMs === "number" &&
        Number.isFinite(body.sessionRemainingMs)
          ? Math.max(0, body.sessionRemainingMs)
          : null;
      const poll = setCoffeePollPlayerVote(
        db,
        userId,
        ctx.params.id,
        ctx.params.pollId,
        body.optionIndex,
        sessionRemainingMs
      );
      json(ctx.res, 200, {
        ok: true,
        poll,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/continue", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const requestedProvider = readProvider(body.preferredProvider);
      const directedSpeakerBotId =
        typeof body.directedSpeakerBotId === "string"
          ? body.directedSpeakerBotId
          : undefined;
      const userIsComposing = body.userIsComposing === true;
      const sessionRemainingMs =
        typeof body.sessionRemainingMs === "number" &&
        Number.isFinite(body.sessionRemainingMs)
          ? Math.max(0, body.sessionRemainingMs)
          : null;
      const sessionSpeakerModel = readOptionalString(body.modelOverride);
      const requestedReasoningEffort = reasoningEffortForRequest(body.reasoningEffort);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const result = await processCoffeeAutonomousTurn(
        db,
        userId,
        ctx.params.id,
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          anthropicApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userDisplayName: user.display_name,
          userKey,
          prismDefaultLlmModel: user.prism_default_llm_model,
          assistantImageUserPrefs: {
            preferredLocalImageModel: user.preferred_local_image_model,
            preferredOpenAiImageModel: user.preferred_openai_image_model,
            lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
            comfyuiHost: user.comfyui_host,
            comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
            secondaryOllamaHost: user.secondary_ollama_host,
          },
          sessionRemainingMs,
          ...(sessionSpeakerModel ? { sessionSpeakerModel } : {}),
          ...(requestedReasoningEffort ? { reasoningEffort: requestedReasoningEffort } : {}),
        },
        userIsComposing,
        directedSpeakerBotId
      );
      json(ctx.res, 200, {
        ok: true,
        ...result,
      });
    }),
    route("POST", "/api/coffee/sessions/:id/synopsis", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const requestedProvider = readProvider(body.preferredProvider);
      const sessionSpeakerModel = readOptionalString(body.modelOverride);
      const requestedReasoningEffort = reasoningEffortForRequest(body.reasoningEffort);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const conversation = await generateCoffeeSessionSynopsis(
        db,
        userId,
        ctx.params.id,
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          anthropicApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userDisplayName: user.display_name,
          userKey,
          prismDefaultLlmModel: user.prism_default_llm_model,
          ...(sessionSpeakerModel ? { sessionSpeakerModel } : {}),
          ...(requestedReasoningEffort ? { reasoningEffort: requestedReasoningEffort } : {}),
        }
      );
      json(ctx.res, 200, {
        ok: true,
        conversation,
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
      const directedSpeakerBotId =
        typeof body.directedSpeakerBotId === "string"
          ? body.directedSpeakerBotId
          : undefined;
      const sessionRemainingMs =
        typeof body.sessionRemainingMs === "number" &&
        Number.isFinite(body.sessionRemainingMs)
          ? Math.max(0, body.sessionRemainingMs)
          : null;
      // Per-request provider override matches Sandbox's /api/chat semantics:
      // the client toggle wins over the user's saved preferred_provider for
      // this single turn. Anything else (including absent or malformed)
      // falls back to the saved preference.
      const requestedProvider = readProvider(body.preferredProvider);
      const user = getUserRow(userId);
      const userKey = decryptUserKey(userId);
      const openAiApiKey =
        getOpenAiApiKeyForUser(userId, userKey) ?? config.openAiApiKey;
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const effectiveProvider = requestedProvider ?? user.preferred_provider;
      const sessionSpeakerModel = readOptionalString(body.modelOverride);
      const requestedReasoningEffort = reasoningEffortForRequest(body.reasoningEffort);
      const result = await processCoffeeTurn(
        db,
        userId,
        {
          conversationId,
          groupBotIds,
          message,
          playerInterruption,
          directedSpeakerBotId,
        },
        {
          preferredProvider: effectiveProvider,
          openAiApiKey,
          anthropicApiKey,
          secondaryOllamaHost: user.secondary_ollama_host,
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          userDisplayName: user.display_name,
          userKey,
          prismDefaultLlmModel: user.prism_default_llm_model,
          assistantImageUserPrefs: {
            preferredLocalImageModel: user.preferred_local_image_model,
            preferredOpenAiImageModel: user.preferred_openai_image_model,
            lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
            comfyuiHost: user.comfyui_host,
            comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
            secondaryOllamaHost: user.secondary_ollama_host,
          },
          sessionRemainingMs,
          ...(sessionSpeakerModel ? { sessionSpeakerModel } : {}),
          ...(requestedReasoningEffort ? { reasoningEffort: requestedReasoningEffort } : {}),
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
      const { conversationId, botId, scope, inferBotMemories, limit } =
        parseMemoryListQueryOptions(ctx.query);
      deleteOrphanedBotMemories(db, userId);
      if (botId && inferBotMemories) {
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
            const prismModel = (
              db.prepare("SELECT prism_default_llm_model AS m FROM users WHERE id = ?").get(userId) as
                | { m: string | null }
                | undefined
            )?.m;
            const memoryUser = getUserRow(userId);
            const auxiliaryProvider = getAuxiliaryProvider(
              prismModel,
              dualOllamaWorkloadOptions(memoryUser)
            );
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
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND bot_id = ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(userId, botId, limit) as MemoryRow[]
        : scope === "default"
        ? db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND bot_id IS NULL ORDER BY created_at DESC LIMIT ?"
            )
            .all(userId, limit) as MemoryRow[]
        : conversationId
        ? db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(userId, conversationId, limit) as MemoryRow[]
        : db
            .prepare(
              "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty, source_message_ids, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(userId, limit) as MemoryRow[];
      const memoryCountRows = db
        .prepare(
          `SELECT bot_id, COUNT(*) AS count
           FROM memories
           WHERE user_id = ?
             AND COALESCE(source, 'direct') != 'about_you'
           GROUP BY bot_id`
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
      const visibleMemories = decryptedMemories.filter(
        (memory) => memory.source !== "about_you"
      );
      json(ctx.res, 200, {
        ok: true,
        memories: filterConflictingMemories(visibleMemories),
        memoryCountsByBotId,
        defaultMemoryCount,
        directCountsByBotId: memoryCountsByBotId,
        defaultDirectCount: defaultMemoryCount
      });
    }),
    route("GET", "/api/zen/session-memory", async (ctx) => {
      const userId = requireAuth(ctx);
      const userKey = decryptUserKey(userId);
      const conversationId = readOptionalString(ctx.query.get("conversationId"));
      const overview = loadZenSessionMemoryOverview({
        db,
        userId,
        userKey,
        activeConversationId: conversationId,
      });
      json(ctx.res, 200, {
        ok: true,
        ...overview,
      });
    }),
    route("DELETE", "/api/zen/session-memory/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const id = decodeURIComponent((ctx.params.id ?? "").trim());
      if (!id) {
        throw new HttpError(400, "Missing session memory id.");
      }
      const deleted = deleteZenSessionMemoryById(db, userId, id);
      if (!deleted) {
        throw new HttpError(404, "Session memory not found.");
      }
      json(ctx.res, 200, { ok: true, deleted: true });
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
    route("POST", "/api/dev/clear-bot-memory", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const requestedBotId = readOptionalString(body.botId);
      if (requestedBotId) {
        const bot = db
          .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
          .get(requestedBotId, userId) as { id?: string } | undefined;
        if (!bot?.id) {
          throw new Error("Bot not found.");
        }
      }
      const deletedMemories = deleteMemoriesForBotScope(db, userId, requestedBotId);
      json(ctx.res, 200, {
        ok: true,
        scope: requestedBotId ? "bot" : "default",
        botId: requestedBotId,
        deletedMemories,
      });
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
      let deletedZenSessionMemories = 0;
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
        const zenSessionResult = db
          .prepare("DELETE FROM zen_session_memories WHERE user_id = ?")
          .run(userId);
        deletedMemories = Number(memoryResult.changes ?? 0);
        deletedSummaries = Number(summaryResult.changes ?? 0);
        deletedZenSessionMemories = Number(zenSessionResult.changes ?? 0);
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
        deletedZenSessionMemories,
        includeAboutYou,
        vectorsCleared,
      });
    }),
    route("POST", "/api/dev/restart", async (ctx) => {
      requireAuth(ctx);
      requireLocalDeveloperRequest(ctx);
      const scheduled = scheduleApiWatchRestart();
      if (!scheduled) {
        json(ctx.res, 409, {
          ok: false,
          error: "Prism API restart requires Node watch mode.",
        });
        return;
      }
      json(ctx.res, 202, {
        ok: true,
        restarting: true,
        mode: "watch",
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
               c.conversation_mode
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
          conversation_mode: string | null;
        }
        | undefined;

      if (!message) {
        throw new Error("Message not found.");
      }
      if (message.role !== "user") {
        throw new Error("Only user messages can be edited.");
      }
      if (message.conversation_mode === "zen" || message.conversation_mode === "chat") {
        throw new Error("Zen messages cannot be edited.");
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
    route("POST", "/api/messages/:id/interrupt", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const content = readString(body.content, "Interruption text");
      const messageId = ctx.params.id;
      const message = db.prepare(`
        SELECT m.id, m.conversation_id, m.role, m.created_at,
               c.conversation_mode
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id AND c.user_id = m.user_id
        WHERE m.id = ? AND m.user_id = ?
      `).get(messageId, userId) as
        | {
          id: string;
          conversation_id: string;
          role: string;
          created_at: string;
          conversation_mode: string | null;
        }
        | undefined;

      if (!message) {
        throw new Error("Message not found.");
      }
      if (message.role !== "assistant") {
        throw new Error("Only assistant messages can be interrupted.");
      }
      if (message.conversation_mode !== "zen" && message.conversation_mode !== "chat") {
        throw new Error("Only Zen assistant messages can be interrupted.");
      }
      const laterMessage = db.prepare(
        "SELECT id FROM messages WHERE conversation_id = ? AND user_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1"
      ).get(message.conversation_id, userId, message.created_at) as { id: string } | undefined;
      if (laterMessage) {
        throw new Error("Only the latest Zen assistant message can be interrupted.");
      }

      const mode = readPrismMoodMode(message.conversation_mode);
      const now = new Date().toISOString();
      const parsedPrismInterruption = readPrismInterruption(
        body.prismInterruption ?? {
          kind: "assistant_reveal",
          assistantMessageId: message.id,
          visibleTokenCount: body.visibleTokenCount,
          totalTokenCount: body.totalTokenCount,
        }
      );
      const prismInterruption: PrismMoodInterruptionInput = {
        kind: parsedPrismInterruption?.kind ?? "assistant_reveal",
        assistantMessageId: parsedPrismInterruption?.assistantMessageId ?? message.id,
        ...(parsedPrismInterruption?.visibleTokenCount !== undefined
          ? { visibleTokenCount: parsedPrismInterruption.visibleTokenCount }
          : {}),
        ...(parsedPrismInterruption?.totalTokenCount !== undefined
          ? { totalTokenCount: parsedPrismInterruption.totalTokenCount }
          : {}),
      };
      const currentMood = loadPrismMoodState(db, userId, message.conversation_id, mode) ??
        createDefaultPrismMoodState(mode, now);
      const user = getUserRow(userId);
      let persistedMood: ReturnType<typeof upsertPrismMoodState> | undefined;
      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        db.prepare(
          "UPDATE messages SET content = ?, tool_payload = NULL WHERE id = ? AND user_id = ?"
        ).run(content, messageId, userId);
        db.prepare(
          "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ?"
        ).run(userId, message.conversation_id);
        db.prepare(
          "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
        ).run(now, message.conversation_id, userId);
        persistedMood = upsertPrismMoodState(
          db,
          userId,
          message.conversation_id,
          applyPrismMoodInterruption(
            currentMood,
            prismInterruption,
            now,
            normalizeZenMoodSensitivity(user.zen_mood_sensitivity)
          )
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      json(ctx.res, 200, {
        ok: true,
        prismMood: persistedMood,
      });
    }),
    route("DELETE", "/api/messages/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const messageId = ctx.params.id;
      const result = deleteConversationMessage(db, userId, messageId);
      json(ctx.res, 200, {
        ok: true,
        deleted: true,
        conversationId: result.conversationId,
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
          experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled === 1,
          fallbackModelMessageStripe: user.fallback_model_message_stripe !== 0,
          hiddenBotModelIds: parseHiddenBotModelIds(user.hidden_bot_model_ids),
          hiddenComfyUiWorkflowIds: parseHiddenComfyUiWorkflowIds(
            user.hidden_comfyui_workflow_ids
          ),
          preferredLocalModel: user.preferred_local_model ?? "",
          preferredOnlineModel: user.preferred_online_model ?? "",
          lenientLocalFallbackModel: user.lenient_local_fallback_model ?? "",
          lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model ?? "",
          prismDefaultLlmModel: user.prism_default_llm_model ?? "",
          prismImageToolLlmModel: user.prism_image_tool_llm_model ?? "",
          hasOpenAiApiKey: Boolean(user.openai_key_ciphertext),
          hasAnthropicApiKey: Boolean(user.anthropic_key_ciphertext),
          hasElevenLabsApiKey: Boolean(user.elevenlabs_key_ciphertext),
          openAiApiKeySource: apiKeySource(
            user.openai_key_ciphertext,
            config.openAiApiKey
          ),
          anthropicApiKeySource: apiKeySource(
            user.anthropic_key_ciphertext,
            config.anthropicApiKey
          ),
          elevenLabsApiKeySource: apiKeySource(
            user.elevenlabs_key_ciphertext,
            config.elevenLabsApiKey
          ),
          // Surface the server's configured local model so the sidebar can
          // show users which Ollama model they're hitting in LOCAL mode.
          ollamaModel: config.ollamaModel,
          ollamaAuxiliaryModel: config.ollamaAuxiliaryModel || "llama3.2",
          secondaryOllamaHost: user.secondary_ollama_host ?? "",
          comfyUiHost: user.comfyui_host ?? "",
          preferredLocalImageModel: user.preferred_local_image_model ?? "",
          preferredOpenAiImageModel: user.preferred_openai_image_model ?? "",
          preferredZenWallpaperLocalImageModel:
            user.preferred_zen_wallpaper_local_image_model ?? "",
          preferredZenWallpaperOpenAiImageModel:
            user.preferred_zen_wallpaper_openai_image_model ?? "",
          zenWallpaperOpacity: normalizeZenWallpaperOpacity(
            user.zen_wallpaper_opacity
          ),
          zenWallpaperTextMaskEnabled: normalizeZenWallpaperTextMaskEnabled(
            user.zen_wallpaper_text_mask_enabled
          ),
          zenSessionIdleGapMs: normalizeZenSessionIdleGapMs(
            user.zen_session_idle_gap_ms
          ),
          zenFreshStartGapMs: normalizeZenFreshStartGapMs(
            user.zen_fresh_start_gap_ms,
            undefined,
            user.zen_session_idle_gap_ms ?? undefined
          ),
          zenRecentContextMessages: normalizeZenRecentContextMessages(
            user.zen_recent_context_messages
          ),
          zenWallpaperRegenMessageInterval: normalizeZenWallpaperRegenMessageInterval(
            user.zen_wallpaper_regen_message_interval
          ),
          zenWallpaperRevealDelayMessageCount:
            normalizeZenWallpaperRevealDelayMessageCount(
              user.zen_wallpaper_reveal_delay_message_count
            ),
          zenWallpaperRevealSpanMessageCount:
            normalizeZenWallpaperRevealSpanMessageCount(
              user.zen_wallpaper_reveal_span_message_count
            ),
          zenMoodSensitivity: normalizeZenMoodSensitivity(
            user.zen_mood_sensitivity
          ),
          comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
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
      const anthropicApiKey =
        getAnthropicApiKeyForUser(userId, userKey) ?? config.anthropicApiKey;
      const catalog = await buildModelCatalog(
        openAiApiKey,
        user.secondary_ollama_host,
        anthropicApiKey
      );
      const hiddenBotModelIds = seedModelVisibilityDefaultsIfNeeded(
        user,
        catalog
      );
      // Prefer draft URL from query (matches Settings status probe before save); else persisted column.
      const comfyHostFromQuery = normalizeComfyUiHostForStatusCheck(
        ctx.query.get("comfyUiHost")
      );
      const comfyHostRaw =
        comfyHostFromQuery && comfyHostFromQuery.length > 0
          ? comfyHostFromQuery
          : user.comfyui_host?.trim() ?? "";
      let comfyUi: {
        configured: boolean;
        reachable: boolean;
        checkpoints: Array<{
          id: string;
          label: string;
          provider: "local";
          imageSource: "comfyui-remote";
        }>;
        allCheckpoints: Array<{
          id: string;
          label: string;
          provider: "local";
          imageSource: "comfyui-remote";
        }>;
      };
      if (comfyHostRaw) {
        const reachable = await probeComfyUiHostReachable(comfyHostRaw);
        const hiddenComfyUiWorkflowIds = new Set(
          parseHiddenComfyUiWorkflowIds(user.hidden_comfyui_workflow_ids)
        );
        let remoteDiskRows: Array<{
          id: string;
          label: string;
          provider: "local";
          imageSource: "comfyui-remote";
        }> = [];
        try {
          const relPaths = await listComfyUiWorkflowJsonRelPaths(comfyHostRaw);
          remoteDiskRows = relPaths.map((path) => ({
            id: encodeComfyUiRemoteWorkflowModelId(path),
            label: formatComfyUiRemoteWorkflowLabel(path),
            provider: "local" as const,
            imageSource: "comfyui-remote" as const,
          }));
        } catch {
          remoteDiskRows = [];
        }
        comfyUi = {
          configured: true,
          reachable,
          checkpoints: remoteDiskRows.filter((row) => !hiddenComfyUiWorkflowIds.has(row.id)),
          allCheckpoints: remoteDiskRows,
        };
      } else {
        comfyUi = {
          configured: false,
          reachable: false,
          checkpoints: [],
          allCheckpoints: [],
        };
      }
      json(ctx.res, 200, {
        ok: true,
        catalog,
        comfyUi,
        hiddenBotModelIds,
        hiddenComfyUiWorkflowIds: parseHiddenComfyUiWorkflowIds(
          user.hidden_comfyui_workflow_ids
        ),
      });
    }),
    route("GET", "/api/settings/secondary-ollama-status", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      let hostToCheck: string | null = user.secondary_ollama_host;
      if (ctx.query.has("host")) {
        hostToCheck = normalizeOllamaHostForStatusCheck(ctx.query.get("host"));
      }
      const status = await checkLocalModelHostStatus(hostToCheck);
      const dualWorkload = await checkDualOllamaWorkloadStatus(hostToCheck);
      json(ctx.res, 200, { ok: true, status, dualWorkload });
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
    route("POST", "/api/settings/api-key-status", async (ctx) => {
      requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const provider = readApiKeyValidationProvider(body.provider);
      if (typeof body.apiKey !== "string") {
        throw new Error("apiKey is required.");
      }
      const sanitized = sanitizeApiKeyForProvider(provider, body.apiKey);
      if (!sanitized) {
        json(ctx.res, 200, {
          ok: true,
          status: {
            provider,
            configured: false,
            reachable: false,
            detail: "API key is empty.",
          },
        });
        return;
      }
      const validation = await validateApiKeyCredential(provider, sanitized);
      json(ctx.res, 200, {
        ok: true,
        status: {
          provider,
          configured: true,
          reachable: validation.valid,
          statusCode: validation.status ?? null,
          detail: validation.detail ?? null,
        },
      });
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
        experimentalDualOllamaEnabled: user.experimental_dual_ollama_enabled,
        fallbackModelMessageStripe: user.fallback_model_message_stripe,
        hiddenBotModelIds: user.hidden_bot_model_ids,
        hiddenComfyUiWorkflowIds: user.hidden_comfyui_workflow_ids,
        preferredLocalModel: user.preferred_local_model,
        preferredOnlineModel: user.preferred_online_model,
        lenientLocalFallbackModel: user.lenient_local_fallback_model,
        lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model,
        secondaryOllamaHost: user.secondary_ollama_host,
        comfyUiHost: user.comfyui_host,
        preferredLocalImageModel: user.preferred_local_image_model,
        preferredOpenAiImageModel: user.preferred_openai_image_model,
        preferredZenWallpaperLocalImageModel:
          user.preferred_zen_wallpaper_local_image_model,
        preferredZenWallpaperOpenAiImageModel:
          user.preferred_zen_wallpaper_openai_image_model,
        zenWallpaperOpacity: user.zen_wallpaper_opacity,
        zenWallpaperTextMaskEnabled: user.zen_wallpaper_text_mask_enabled,
        zenSessionIdleGapMs: user.zen_session_idle_gap_ms,
        zenFreshStartGapMs: user.zen_fresh_start_gap_ms,
        zenRecentContextMessages: user.zen_recent_context_messages,
        zenWallpaperRegenMessageInterval:
          user.zen_wallpaper_regen_message_interval,
        zenWallpaperRevealDelayMessageCount:
          user.zen_wallpaper_reveal_delay_message_count,
        zenWallpaperRevealSpanMessageCount:
          user.zen_wallpaper_reveal_span_message_count,
        zenMoodSensitivity: user.zen_mood_sensitivity,
        comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
        prismDefaultLlmModel: user.prism_default_llm_model,
        prismImageToolLlmModel: user.prism_image_tool_llm_model,
        primaryOllamaHost: config.ollamaHost,
      });

      let openAiCipher = user.openai_key_ciphertext;
      let openAiIv = user.openai_key_iv;
      let openAiTag = user.openai_key_tag;
      let anthropicCipher = user.anthropic_key_ciphertext;
      let anthropicIv = user.anthropic_key_iv;
      let anthropicTag = user.anthropic_key_tag;
      let elevenLabsCipher = user.elevenlabs_key_ciphertext;
      let elevenLabsIv = user.elevenlabs_key_iv;
      let elevenLabsTag = user.elevenlabs_key_tag;
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
      if (next.anthropicKeyIntent.action === "replace") {
        const encrypted = encryptText(next.anthropicKeyIntent.plaintext, userKey);
        anthropicCipher = encrypted.ciphertext;
        anthropicIv = encrypted.iv;
        anthropicTag = encrypted.tag;
      } else if (next.anthropicKeyIntent.action === "clear") {
        anthropicCipher = null;
        anthropicIv = null;
        anthropicTag = null;
      }
      if (next.elevenLabsKeyIntent.action === "replace") {
        const encrypted = encryptText(next.elevenLabsKeyIntent.plaintext, userKey);
        elevenLabsCipher = encrypted.ciphertext;
        elevenLabsIv = encrypted.iv;
        elevenLabsTag = encrypted.tag;
      } else if (next.elevenLabsKeyIntent.action === "clear") {
        elevenLabsCipher = null;
        elevenLabsIv = null;
        elevenLabsTag = null;
      }

      // `auto_switch_model` is intentionally not updated here. The old
      // cross-mode escalation setting has been retired; the DB column
      // stays so a future intra-mode model switcher can adopt it without
      // another migration.
      const modelVisibilityDefaultsVersion =
        body.hiddenBotModelIds === undefined
          ? user.model_visibility_defaults_version
          : MODEL_VISIBILITY_DEFAULTS_VERSION;
      db.prepare(`
        UPDATE users
        SET display_name = ?, theme = ?, preferred_provider = ?, provider_locked = ?, auto_memory = ?, composer_writing_assist = ?, fallback_model_message_stripe = ?, hidden_bot_model_ids = ?, hidden_comfyui_workflow_ids = ?, model_visibility_defaults_version = ?,
            experimental_dual_ollama_enabled = ?, preferred_local_model = ?, preferred_online_model = ?, lenient_local_fallback_model = ?, lenient_local_image_fallback_model = ?, secondary_ollama_host = ?, comfyui_host = ?,
            preferred_local_image_model = ?, preferred_openai_image_model = ?, preferred_zen_wallpaper_local_image_model = ?, preferred_zen_wallpaper_openai_image_model = ?, zen_wallpaper_opacity = ?, zen_wallpaper_text_mask_enabled = ?,
            zen_session_idle_gap_ms = ?, zen_fresh_start_gap_ms = ?, zen_recent_context_messages = ?, zen_wallpaper_regen_message_interval = ?, zen_wallpaper_reveal_delay_message_count = ?, zen_wallpaper_reveal_span_message_count = ?, zen_mood_sensitivity = ?,
            comfyui_workflows = ?, prism_default_llm_model = ?, prism_image_tool_llm_model = ?,
            dev_memories_enabled = ?, dev_memories_text = ?,
            openai_key_ciphertext = ?, openai_key_iv = ?, openai_key_tag = ?,
            anthropic_key_ciphertext = ?, anthropic_key_iv = ?, anthropic_key_tag = ?,
            elevenlabs_key_ciphertext = ?, elevenlabs_key_iv = ?, elevenlabs_key_tag = ?
        WHERE id = ?
      `).run(
        next.displayName,
        next.theme,
        next.preferredProvider,
        next.providerLocked,
        next.autoMemory,
        next.composerWritingAssist,
        next.fallbackModelMessageStripe,
        JSON.stringify(next.hiddenBotModelIds),
        JSON.stringify(next.hiddenComfyUiWorkflowIds),
        modelVisibilityDefaultsVersion,
        next.experimentalDualOllamaEnabled,
        next.preferredLocalModel,
        next.preferredOnlineModel,
        next.lenientLocalFallbackModel,
        next.lenientLocalImageFallbackModel,
        next.secondaryOllamaHost,
        next.comfyUiHost,
        next.preferredLocalImageModel,
        next.preferredOpenAiImageModel,
        next.preferredZenWallpaperLocalImageModel,
        next.preferredZenWallpaperOpenAiImageModel,
        next.zenWallpaperOpacity,
        next.zenWallpaperTextMaskEnabled ? 1 : 0,
        next.zenSessionIdleGapMs,
        next.zenFreshStartGapMs,
        next.zenRecentContextMessages,
        next.zenWallpaperRegenMessageInterval,
        next.zenWallpaperRevealDelayMessageCount,
        next.zenWallpaperRevealSpanMessageCount,
        next.zenMoodSensitivity,
        JSON.stringify(next.comfyUiWorkflows),
        next.prismDefaultLlmModel,
        next.prismImageToolLlmModel,
        devMemoriesEnabled,
        devMemoriesText,
        openAiCipher,
        openAiIv,
        openAiTag,
        anthropicCipher,
        anthropicIv,
        anthropicTag,
        elevenLabsCipher,
        elevenLabsIv,
        elevenLabsTag,
        userId
      );
      json(ctx.res, 200, {
        ok: true,
        settings: {
          displayName: next.displayName,
          hasOpenAiApiKey: Boolean(openAiCipher),
          hasAnthropicApiKey: Boolean(anthropicCipher),
          hasElevenLabsApiKey: Boolean(elevenLabsCipher),
          openAiApiKeySource: apiKeySource(openAiCipher, config.openAiApiKey),
          anthropicApiKeySource: apiKeySource(
            anthropicCipher,
            config.anthropicApiKey
          ),
          elevenLabsApiKeySource: apiKeySource(
            elevenLabsCipher,
            config.elevenLabsApiKey
          ),
        },
      });
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
      const user = getUserRow(userId);
      const suggestions = await inferBotImagePromptSuggestions(
        getAuxiliaryProvider(
          user.prism_default_llm_model,
          dualOllamaWorkloadOptions(user)
        ),
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
      const user = getUserRow(userId);
      const prompt = await inferRandomImageSceneLine(
        getAuxiliaryProvider(
          user.prism_default_llm_model,
          dualOllamaWorkloadOptions(user)
        ),
        {
          botName,
          systemPrompt,
        }
      );
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
      const requestedSize =
        typeof body.size === "string" ? body.size.trim() : IMAGE_GENERATION_DEFAULT_SIZE;
      const size = IMAGE_GENERATION_ALLOWED_SIZES.has(requestedSize)
        ? requestedSize
        : inferImageGenerationSizeFromPrompt(prompt);
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
      const effectiveProvider =
        requestedProvider ?? (user.preferred_provider === "local" ? "local" : "openai");

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
          promptForModel = composeVerbatimFirstImagePrompt({
            userPrompt: prompt,
            botName: botPersona.name,
            systemPrompt: botPersona.system_prompt,
            mode: "strict_verbatim",
          });
        }
      }

      const resolvedLocalImageModel =
        (bodyModel && effectiveProvider === "local" ? bodyModel.trim() : "") ||
        (botPersona?.local_image_model?.trim() ?? "") ||
        (user.preferred_local_image_model?.trim() ?? "");

      const resolvedOpenAiImageModel =
        (bodyModel && effectiveProvider !== "local" ? bodyModel.trim() : "") ||
        (botPersona?.openai_image_model?.trim() ?? "") ||
        (user.preferred_openai_image_model?.trim() ?? "");
      if (effectiveProvider === "local" && !resolvedLocalImageModel) {
        throw new Error(
          "Pick a local image model in the Images panel header, then try again."
        );
      }

      const acqPanel = await tryAcquireImageSlot({
        userId,
        conversationId: conversationIdRaw.length > 0 ? conversationIdRaw : null,
        botId: bodyBotId ?? null,
        mode: "sandbox",
        incognito: false,
        captionPrompt: prompt,
        userMessage: `[Images panel] ${prompt.slice(0, 500)}`,
        source: "images_panel",
      });
      if (!acqPanel.ok) {
        throw new HttpError(
          503,
          "Another image is generating right now. Wait for it to finish, then try again."
        );
      }

      const imageId = randomId(12);
      const localRelPath = buildGeneratedImageRelativePath(userId, imageId);

      if (effectiveProvider === "local") {
        const lenientImageFb = user.lenient_local_image_fallback_model?.trim() ?? "";
        const runLocalBytes = (modelId: string) =>
          generateLocalImageBytesByModelId({
            modelId,
            promptForModel,
            size,
            signal: imageGenAbort.signal,
            comfyUiHost: user.comfyui_host,
            comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
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

        await finalizeComfyOrOllamaGeneratedImageResponse(ctx, {
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
            comfyUiWorkflows: parseStoredComfyUiWorkflows(user.comfyui_workflows),
            secondaryOllamaHost: user.secondary_ollama_host,
            primaryOllamaHost: config.ollamaHost,
          });
          await finalizeComfyOrOllamaGeneratedImageResponse(ctx, {
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
        imageBytes = await readOpenAiGeneratedImageBytes(result, imageGenAbort.signal);
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

      await tryGenerateThumbAfterPngWrite(localRelPath);
      const displayUrl = `/api/images/${encodeURIComponent(imageId)}/file`;
      const storedUrl = result.url || displayUrl;

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
          storedUrl,
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

      json(ctx.res, 200, {
        ok: true,
        image: {
          id: imageId,
          url: storedUrl,
          revisedPrompt: result.revisedPrompt,
          displayUrl,
          hasLocalFile: true,
          model: result.model,
        },
      });
      } finally {
        ctx.req.off("close", onImageGenClientClose);
        await releaseImageSlot(userId);
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
              `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model, purpose
               FROM images WHERE user_id = ? AND bot_id IS NULL AND COALESCE(purpose, 'gallery') != 'wallpaper'
               ORDER BY created_at DESC LIMIT ?`
            )
            .all(userId, limit)
        : filterBotId
          ? db
              .prepare(
                `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model, purpose
                 FROM images WHERE user_id = ? AND bot_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'
                 ORDER BY created_at DESC LIMIT ?`
              )
              .all(userId, filterBotId, limit)
          : db
              .prepare(
                `SELECT id, prompt, revised_prompt, url, size, quality, provider, bot_id, created_at, local_rel_path, model, purpose
                 FROM images WHERE user_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'
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
        purpose: string | null;
      }>).map((row) => mapImageRowToClient(row));
      json(ctx.res, 200, { ok: true, images });
    }),
    route("GET", "/api/images/:id/thumb", async (ctx) => {
      const userId = requireAuth(ctx);
      const imageId = ctx.params.id;
      const row = db
        .prepare("SELECT user_id, local_rel_path FROM images WHERE id = ?")
        .get(imageId) as
        | { user_id: string; local_rel_path: string | null }
        | undefined;
      if (!row || row.user_id !== userId) {
        throw new HttpError(404, "Image not found.");
      }
      const rel = row.local_rel_path?.trim();
      if (!rel) {
        throw new HttpError(404, "Image thumbnail not available.");
      }
      let bytes: Buffer;
      try {
        bytes = await readOrCreateThumbBytes(rel);
      } catch {
        throw new HttpError(404, "Image thumbnail not found.");
      }
      ctx.res.statusCode = 200;
      ctx.res.setHeader("content-type", "image/webp");
      ctx.res.setHeader("cache-control", "private, max-age=3600");
      ctx.res.end(bytes);
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
    route("DELETE", "/api/images", async (ctx) => {
      const userId = requireAuth(ctx);
      const filterBotId = readOptionalString(ctx.query.get("botId"));
      const rows = (
        filterBotId
          ? db
              .prepare(
                "SELECT id, local_rel_path FROM images WHERE user_id = ? AND bot_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'"
              )
              .all(userId, filterBotId)
          : db
              .prepare("SELECT id, local_rel_path FROM images WHERE user_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'")
              .all(userId)
      ) as Array<{ id: string; local_rel_path: string | null }>;
      if (rows.length === 0) {
        json(ctx.res, 200, { ok: true, deleted: 0 });
        return;
      }
      if (filterBotId) {
        db.prepare(
          "DELETE FROM images WHERE user_id = ? AND bot_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'"
        ).run(
          userId,
          filterBotId
        );
      } else {
        db.prepare("DELETE FROM images WHERE user_id = ? AND COALESCE(purpose, 'gallery') != 'wallpaper'").run(userId);
      }
      for (const row of rows) {
        const rel = row.local_rel_path?.trim();
        if (!rel) continue;
        try {
          tryUnlinkGeneratedImageFile(rel);
        } catch (error) {
          console.error(
            `[images] orphan file after bulk delete imageId=${row.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      json(ctx.res, 200, { ok: true, deleted: rows.length });
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
          tryUnlinkGeneratedImageFile(rel);
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
      const user = getUserRow(userId);
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
      const flirtEnabled = body.flirtEnabled === true ? 1 : 0;
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
        "INSERT INTO bots (id, user_id, name, system_prompt, export_hash, model, local_model, online_model, local_image_model, openai_image_model, online_enabled, delete_protected, flirt_enabled, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', ?, ?)"
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
        flirtEnabled,
        temperature,
        maxTokens,
        color,
        glyph,
        chatEnabled,
        now,
        now
      );
      queueBotSemanticFacetsRefresh({
        db,
        userId,
        botId,
        prismDefaultLlmModel: user.prism_default_llm_model,
      });
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
          flirt_enabled: flirtEnabled,
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
        "SELECT id, name, system_prompt, export_hash, model, local_model, online_model, local_image_model, openai_image_model, online_enabled, delete_protected, flirt_enabled, temperature, max_tokens, color, glyph, chat_enabled, visibility, created_at, updated_at FROM bots WHERE user_id = ? OR visibility = 'public' ORDER BY updated_at DESC"
      ).all(userId);
      json(ctx.res, 200, { ok: true, bots: rows });
    }),
    route("PATCH", "/api/bots/selected/delete-protection", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const idsRaw = body.ids;
      if (!Array.isArray(idsRaw)) {
        throw new Error("Selected bot ids are required.");
      }
      if (typeof body.deleteProtected !== "boolean") {
        throw new Error("Delete protection must be a boolean.");
      }
      const ids = idsRaw.filter((id): id is string => typeof id === "string");
      const result = setSelectedBotsDeleteProtection(
        db,
        userId,
        ids,
        body.deleteProtected
      );
      json(ctx.res, 200, { ok: true, ...result });
    }),
    route("PATCH", "/api/bots/:id", async (ctx) => {
      const userId = requireAuth(ctx);
      const user = getUserRow(userId);
      const botId = ctx.params.id;
      const existing = db.prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?").get(botId, userId) as { id?: string } | undefined;
      if (!existing?.id) {
        throw new Error("Bot not found.");
      }
      const body = ctx.body as Record<string, unknown>;
      const fields: string[] = [];
      const values: Array<string | number | null> = [];
      let shouldRefreshFacets = false;
      if (typeof body.name === "string") {
        fields.push("name = ?");
        values.push(body.name);
        shouldRefreshFacets = true;
      }
      if (typeof body.systemPrompt === "string") {
        fields.push("system_prompt = ?");
        values.push(body.systemPrompt);
        shouldRefreshFacets = true;
      }
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
      if (typeof body.flirtEnabled === "boolean") {
        fields.push("flirt_enabled = ?");
        values.push(body.flirtEnabled ? 1 : 0);
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
        if (shouldRefreshFacets) {
          fields.push("semantic_facets = NULL");
          fields.push("semantic_facets_source_hash = NULL");
          fields.push("semantic_facets_updated_at = NULL");
        }
        fields.push("updated_at = ?");
        values.push(new Date().toISOString());
        values.push(botId, userId);
        db.prepare(`UPDATE bots SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
      }
      if (shouldRefreshFacets) {
        queueBotSemanticFacetsRefresh({
          db,
          userId,
          botId,
          prismDefaultLlmModel: user.prism_default_llm_model,
        });
      }
      json(ctx.res, 200, { ok: true });
    }),
    route("DELETE", "/api/bots/selected", async (ctx) => {
      const userId = requireAuth(ctx);
      const body = ctx.body as Record<string, unknown>;
      const idsRaw = body.ids;
      if (!Array.isArray(idsRaw)) {
        throw new Error("Selected bot ids are required.");
      }
      const ids = idsRaw.filter((id): id is string => typeof id === "string");
      const result = deleteSelectedBots(db, userId, ids);
      json(ctx.res, 200, { ok: true, ...result });
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
      const includeProtected =
        ctx.query.get("includeProtected") === "1" ||
        ctx.query.get("includeProtected") === "true";
      const deleted = deleteAllBots(db, userId, { includeProtected });
      json(ctx.res, 200, { ok: true, deleted });
    }),
    route("POST", "/api/conversations/:id/export", async (ctx) => {
      const userId = requireAuth(ctx);
      const conversationId = ctx.params.id;
      const conversation = db.prepare(
        "SELECT id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, coffee_group_id, coffee_duration_minutes, coffee_preset_id, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?"
      ).get(conversationId, userId) as {
        id: string;
        title: string;
        conversation_mode: string | null;
        bot_id: string | null;
        bot_group_ids: string | null;
        coffee_settings: string | null;
        coffee_group_id: string | null;
        coffee_duration_minutes: number | null;
        coffee_preset_id: string | null;
        created_at: string;
        updated_at: string;
      } | undefined;
      if (!conversation) {
        throw new Error("Conversation not found.");
      }
      if (conversation.conversation_mode === "zen" || conversation.conversation_mode === "chat") {
        throw new HttpError(400, "Zen conversations cannot be exported from the chat surface.");
      }
      const messages = db.prepare(
        `SELECT m.role, m.content, m.created_at, b.name AS bot_name, b.color AS bot_color
           FROM messages m
           LEFT JOIN bots b ON b.id = m.bot_id
          WHERE m.conversation_id = ? AND m.user_id = ?
          ORDER BY m.created_at ASC`
      ).all(conversationId, userId) as Array<{
        role: string;
        content: string;
        created_at: string;
        bot_name: string | null;
        bot_color: string | null;
      }>;
      const lines = [
        `# ${conversation.title}`,
        `> Exported ${new Date().toISOString()}`,
        "",
      ];
      if (conversation.conversation_mode === "coffee") {
        const botIds = parseConversationBotGroupIds(conversation.bot_group_ids);
        const assistantMessages = messages.filter((message) => message.role === "assistant");
        const speakerCounts = new Map<string, number>();
        for (const message of assistantMessages) {
          const name = message.bot_name ?? "Assistant";
          speakerCounts.set(name, (speakerCounts.get(name) ?? 0) + 1);
        }
        lines.push("## Coffee Session");
        lines.push("");
        lines.push(`- Duration: ${conversation.coffee_duration_minutes ?? "legacy"} minute(s)`);
        lines.push(`- Coffee Group: ${conversation.coffee_group_id ?? "legacy / ungrouped"}`);
        lines.push(`- Preset: ${conversation.coffee_preset_id ?? "group defaults / legacy"}`);
        lines.push(`- Bots: ${botIds.length > 0 ? botIds.join(", ") : "unknown"}`);
        lines.push(`- Messages: ${messages.length}`);
        lines.push(`- Bot replies: ${assistantMessages.length}`);
        lines.push(
          `- Speaker balance: ${
            speakerCounts.size > 0
              ? Array.from(speakerCounts.entries()).map(([name, count]) => `${name} ${count}`).join(", ")
              : "none"
          }`
        );
        lines.push(`- Started: ${conversation.created_at}`);
        lines.push(`- Updated: ${conversation.updated_at}`);
        lines.push("");
        lines.push("## Transcript");
        lines.push("");
      }
      for (const msg of messages) {
        const speaker =
          msg.role === "assistant"
            ? msg.bot_name ?? "Assistant"
            : msg.role === "user"
              ? "You"
              : "System";
        lines.push(`**${speaker}** _(${msg.created_at})_`);
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
      const parent = db
        .prepare(
          `SELECT id, title, conversation_mode, bot_id, incognito,
                  zen_wallpaper_enabled, zen_wallpaper_image_id,
                  zen_wallpaper_prompt_seed, zen_wallpaper_history
             FROM conversations
            WHERE id = ? AND user_id = ?`
        )
        .get(parentId, userId) as
        | {
            id: string;
            title: string;
            conversation_mode: string | null;
            bot_id: string | null;
            incognito: number;
            zen_wallpaper_enabled: number | null;
            zen_wallpaper_image_id: string | null;
            zen_wallpaper_prompt_seed: string | null;
            zen_wallpaper_history: string | null;
          }
        | undefined;
      if (!parent) {
        throw new Error("Parent conversation not found.");
      }
      if (parent.conversation_mode === "zen" || parent.conversation_mode === "chat") {
        throw new HttpError(400, "Zen conversations cannot be forked.");
      }
      const forkId = randomId(12);
      const now = new Date().toISOString();
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
      const forkMode = parent.conversation_mode === "chat" ? "chat" : "sandbox";
      const forkWallpaperEnabled =
        forkMode === "chat" && parent.zen_wallpaper_enabled === 1 ? 1 : 0;
      const forkWallpaperHistory =
        forkWallpaperEnabled === 1
          ? pruneZenWallpaperHistoryForMessageCount(
              parent.zen_wallpaper_history,
              messages.length
            )
          : [];
      const legacyForkWallpaper =
        forkWallpaperEnabled === 1 &&
        forkWallpaperHistory.length === 0 &&
        parent.zen_wallpaper_image_id
          ? [
              {
                imageId: parent.zen_wallpaper_image_id,
                promptSeed: parent.zen_wallpaper_prompt_seed,
                generationMessageCount: messages.length,
                createdAt: now,
              },
            ]
          : [];
      const forkWallpaperTimeline =
        forkWallpaperHistory.length > 0 ? forkWallpaperHistory : legacyForkWallpaper;
      const latestForkWallpaper = forkWallpaperTimeline[forkWallpaperTimeline.length - 1] ?? null;
      const forkWallpaperImageId = latestForkWallpaper?.imageId ?? null;
      const forkWallpaperPromptSeed = latestForkWallpaper?.promptSeed ?? null;
      const forkWallpaperMessageCount = latestForkWallpaper?.generationMessageCount ?? null;
      const forkWallpaperStatus =
        forkWallpaperEnabled === 1 && forkWallpaperImageId ? "ready" : "idle";
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, parent_id,
          fork_message_id, incognito, zen_wallpaper_enabled,
          zen_wallpaper_image_id, zen_wallpaper_prompt_seed,
          zen_wallpaper_message_count, zen_wallpaper_status, zen_wallpaper_history,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        forkId,
        userId,
        `Fork of ${parent.title}`,
        forkMode,
        parent.bot_id,
        parentId,
        forkMessageId,
        parent.incognito,
        forkWallpaperEnabled,
        forkWallpaperImageId,
        forkWallpaperPromptSeed,
        forkWallpaperMessageCount,
        forkWallpaperStatus,
        serializeZenWallpaperHistory(forkWallpaperTimeline),
        now,
        now
      );
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
      method === "POST" || method === "PATCH" || method === "DELETE"
        ? await readJsonBody(req)
        : {};
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
    if (res.writableEnded || res.destroyed) {
      return;
    }
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

const apiHost = process.env.API_HOST || "0.0.0.0";
server.listen(config.apiPort, apiHost, () => {
  console.log(`API ready at http://${apiHost}:${config.apiPort}`);
  stopDiscovery = startPrismDiscovery(config);
});
