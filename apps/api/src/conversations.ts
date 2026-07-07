import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import { upsertPrismMoodState } from "./db.ts";
import {
  getConversationHubMetadataMap,
  type ConversationHubMetadata,
} from "./conversation-hubs.ts";
import {
  applyPrismMoodIgnoredQuestion,
  applyPrismMoodIgnoreCooldown,
  applyPrismMoodInterruption,
  applyPrismMoodNegativeTurn,
  applyPrismMoodPositiveTurn,
  COFFEE_SESSION_DURATION_MINUTES_MAX,
  COFFEE_SESSION_DURATION_MINUTES_MIN,
  createDefaultPrismMoodState,
  decayPrismMood,
  shouldPrismMoodStartIgnoreCooldown,
  type CoffeeSessionDurationMinutes,
  type PrismMoodIgnoredQuestionPenaltyLevel,
  type PrismMoodInterruptionInput,
  type PrismMoodMode,
  type PrismMoodSnapshot,
} from "@localai/shared";

export type ZenWallpaperStatus = "idle" | "generating" | "ready" | "error";

export interface ZenWallpaperMetadata {
  enabled: boolean;
  imageId: string | null;
  promptSeed: string | null;
  generationMessageCount: number | null;
  status: ZenWallpaperStatus;
  history: ZenWallpaperHistoryEntry[];
}

export interface ZenWallpaperHistoryEntry {
  imageId: string;
  promptSeed: string | null;
  generationMessageCount: number;
  revealStartMessageCount?: number;
  revealFullMessageCount?: number;
  createdAt?: string;
}

export interface RememberedZenWallpaper {
  imageId: string;
  promptSeed: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: "zen" | "chat" | "sandbox" | "coffee";
  botId: string | null;
  hubRole?: ConversationHubMetadata["hubRole"];
  hubBotId?: string | null;
  parentHubId?: string | null;
  /** Coffee-only — the 2-5 bot ids participating in this group thread. */
  botGroupIds?: string[];
  /** Coffee-only — invited bot ids that did not attend this session. */
  coffeeAbsentBotIds?: string[];
  /** Coffee-only — durable parent group for recurring table sessions. */
  coffeeGroupId?: string | null;
  /** Coffee-only — timed session duration once group-owned sessions are used. */
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes;
  incognito: boolean;
  lastBotId: string | null;
  lastBotColor: string | null;
  hasAssistantReply: boolean;
  zenWallpaper: ZenWallpaperMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSweepResult {
  batchId: string | null;
  sweptGroups: number;
  archivedConversationCount: number;
  summaryConversationCount: number;
  undoExpiresAt: string | null;
}

export interface ConversationSweepState {
  canUndo: boolean;
  latestBatchId: string | null;
  latestSweepAt: string | null;
}

export interface UndoLatestConversationMessagesResult {
  conversationId: string;
  conversationMode: string | null;
  messageIds: string[];
  deletedMessages: number;
  deletedMemories: number;
  updatedMemories: number;
  deletedSummaries: number;
  deletedSummaryIds: string[];
  deletedZenSessionMemories: number;
  deletedMoodEvents: number;
  deletedImages: number;
  deletedImageRelPaths: string[];
  prismMood: PrismMoodSnapshot;
}

const DEV_SEED_CHAT_USER_MESSAGE = "Dev tools seeded this sidebar chat.";
const DEV_SEED_CHAT_ASSISTANT_MESSAGE =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const SWEEP_UNDO_WINDOW_MS = 15000;

function inClausePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function clampSnippet(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function parseIdList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

function uniqueIdList(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function sentGeneratedImageIdFromToolPayload(raw: string | null | undefined): string | null {
  const parsed = parseJsonObject(raw);
  const sent = parsed?.sentGeneratedImage;
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) return null;
  const imageId = (sent as { imageId?: unknown }).imageId;
  return typeof imageId === "string" && imageId.trim().length > 0
    ? imageId.trim()
    : null;
}

function repairMemoriesLinkedToUndo(
  db: DatabaseSync,
  userId: string,
  messageIds: readonly string[]
): { deleted: number; updated: number } {
  const undoneIds = new Set(uniqueIdList(messageIds));
  if (undoneIds.size === 0) return { deleted: 0, updated: 0 };
  const rows = db
    .prepare("SELECT id, source_message_ids FROM memories WHERE user_id = ?")
    .all(userId) as Array<{ id: string; source_message_ids: string }>;
  let deleted = 0;
  let updated = 0;
  const deleteStmt = db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?");
  const updateStmt = db.prepare(
    "UPDATE memories SET source_message_ids = ? WHERE id = ? AND user_id = ?"
  );
  for (const row of rows) {
    const sourceIds = uniqueIdList(parseIdList(row.source_message_ids));
    if (!sourceIds.some((id) => undoneIds.has(id))) continue;
    const survivingIds = sourceIds.filter((id) => !undoneIds.has(id));
    if (survivingIds.length === 0) {
      deleted += Number(deleteStmt.run(row.id, userId).changes ?? 0);
      continue;
    }
    updated += Number(
      updateStmt.run(JSON.stringify(survivingIds), row.id, userId).changes ?? 0
    );
  }
  return { deleted, updated };
}

function normalizeUndoPrismMoodMode(value: string | null | undefined): PrismMoodMode {
  if (value === "chat") return "chat";
  if (value === "sandbox") return "sandbox";
  if (value === "coffee") return "coffee";
  return "zen";
}

const UNDO_MOOD_POSITIVE_PHRASES = [
  "thank",
  "thanks",
  "appreciate",
  "please",
  "sorry",
  "my bad",
  "that helped",
  "great",
  "good job",
] as const;

const UNDO_MOOD_NEGATIVE_PHRASES = [
  "stupid",
  "dumb",
  "useless",
  "annoying",
  "hate",
  "shut up",
  "wrong again",
  "terrible",
] as const;

const UNDO_MOOD_BRUSQUE_PHRASES = [
  "whatever",
  "nevermind",
  "forget it",
  "just do it",
] as const;

function countUndoMoodPhraseHits(text: string, phrases: readonly string[]): number {
  return phrases.reduce((count, phrase) => count + (text.includes(phrase) ? 1 : 0), 0);
}

function evaluateUndoMoodTurn(message: string): number {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return 0;
  let delta = 0;
  delta += Math.min(countUndoMoodPhraseHits(normalized, UNDO_MOOD_POSITIVE_PHRASES) * 3, 6);
  delta -= Math.min(countUndoMoodPhraseHits(normalized, UNDO_MOOD_NEGATIVE_PHRASES) * 7, 14);
  delta -= Math.min(countUndoMoodPhraseHits(normalized, UNDO_MOOD_BRUSQUE_PHRASES) * 3, 6);
  if (normalized.includes("?")) delta += 2;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2 && !normalized.includes("?")) delta -= 2;
  return delta;
}

function readIgnoredQuestionPenaltyLevel(
  rawPayload: string | null | undefined
): PrismMoodIgnoredQuestionPenaltyLevel {
  const payload = parseJsonObject(rawPayload);
  const level = payload?.penaltyLevel;
  return level === "light" || level === "elevated" ? level : "normal";
}

function readInterruptionPayload(rawPayload: string | null | undefined): PrismMoodInterruptionInput {
  const payload = parseJsonObject(rawPayload);
  const kind = payload?.kind === "pending_reply" ? "pending_reply" : "assistant_reveal";
  const assistantMessageId =
    typeof payload?.assistantMessageId === "string"
      ? payload.assistantMessageId
      : undefined;
  const visibleTokenCount =
    typeof payload?.visibleTokenCount === "number" && Number.isFinite(payload.visibleTokenCount)
      ? payload.visibleTokenCount
      : undefined;
  const totalTokenCount =
    typeof payload?.totalTokenCount === "number" && Number.isFinite(payload.totalTokenCount)
      ? payload.totalTokenCount
      : undefined;
  return {
    kind,
    ...(assistantMessageId ? { assistantMessageId } : {}),
    ...(visibleTokenCount !== undefined ? { visibleTokenCount } : {}),
    ...(totalTokenCount !== undefined ? { totalTokenCount } : {}),
  };
}

function rebuildPrismMoodAfterUndo(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  conversationMode: string | null,
  nowIso: string
): PrismMoodSnapshot {
  const mode = normalizeUndoPrismMoodMode(conversationMode);
  const sensitivityRow = db
    .prepare("SELECT zen_mood_sensitivity FROM users WHERE id = ?")
    .get(userId) as { zen_mood_sensitivity?: number | null } | undefined;
  const sensitivity =
    typeof sensitivityRow?.zen_mood_sensitivity === "number"
      ? sensitivityRow.zen_mood_sensitivity
      : undefined;
  const messages = db
    .prepare(
      `SELECT id, role, content, created_at
         FROM messages
        WHERE user_id = ? AND conversation_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .all(userId, conversationId) as Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
    }>;
  const events = db
    .prepare(
      `SELECT message_id, event_type, created_at, payload_json
         FROM prism_mood_events
        WHERE user_id = ? AND conversation_id = ?
        ORDER BY created_at ASC, message_id ASC, event_type ASC`
    )
    .all(userId, conversationId) as Array<{
      message_id: string;
      event_type: string;
      created_at: string;
      payload_json: string | null;
    }>;

  type MoodAction =
    | { kind: "message"; at: string; content: string }
    | { kind: "event"; at: string; eventType: string; payloadJson: string | null };
  const actions: MoodAction[] = [
    ...messages
      .filter((message) => message.role === "user")
      .map((message) => ({
        kind: "message" as const,
        at: message.created_at,
        content: message.content,
      })),
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.created_at,
      eventType: event.event_type,
      payloadJson: event.payload_json,
    })),
  ].sort((a, b) => {
    const byTime = a.at.localeCompare(b.at);
    if (byTime !== 0) return byTime;
    return a.kind === b.kind ? 0 : a.kind === "message" ? -1 : 1;
  });

  let mood = createDefaultPrismMoodState(mode, messages[0]?.created_at ?? nowIso);
  for (const action of actions) {
    if (action.kind === "message") {
      mood = decayPrismMood(mood, action.at);
      const delta = evaluateUndoMoodTurn(action.content);
      if (delta < 0) {
        mood = applyPrismMoodNegativeTurn(
          mood,
          Math.min(1, Math.max(0.2, Math.abs(delta) / 8)),
          action.at,
          sensitivity
        );
        if (
          mood.mode === "zen" &&
          shouldPrismMoodStartIgnoreCooldown(mood, sensitivity)
        ) {
          mood = applyPrismMoodIgnoreCooldown(mood, action.at);
        }
      } else if (delta > 0) {
        mood = applyPrismMoodPositiveTurn(
          mood,
          Math.min(1, Math.max(0.2, delta / 8)),
          action.at
        );
      }
      continue;
    }
    if (action.eventType === "ignored_question") {
      mood = applyPrismMoodIgnoredQuestion(
        mood,
        action.at,
        sensitivity,
        readIgnoredQuestionPenaltyLevel(action.payloadJson)
      );
    } else if (action.eventType === "interruption") {
      mood = applyPrismMoodInterruption(
        mood,
        readInterruptionPayload(action.payloadJson),
        action.at,
        sensitivity
      );
    }
  }
  return upsertPrismMoodState(db, userId, conversationId, {
    ...mood,
    lastUpdatedAt: actions.at(-1)?.at ?? nowIso,
  });
}

export function normalizeZenWallpaperStatus(value: unknown): ZenWallpaperStatus {
  return value === "generating" || value === "ready" || value === "error"
    ? value
    : "idle";
}

function normalizeZenWallpaperHistoryEntry(raw: unknown): ZenWallpaperHistoryEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const imageId = typeof o.imageId === "string" ? o.imageId.trim() : "";
  if (!imageId) return null;
  const promptSeed =
    typeof o.promptSeed === "string" && o.promptSeed.trim().length > 0
      ? o.promptSeed.trim()
      : null;
  const count =
    typeof o.generationMessageCount === "number" &&
    Number.isFinite(o.generationMessageCount)
      ? Math.max(0, Math.floor(o.generationMessageCount))
      : null;
  if (count === null) return null;
  const revealStartMessageCount =
    typeof o.revealStartMessageCount === "number" &&
    Number.isFinite(o.revealStartMessageCount)
      ? Math.max(0, Math.floor(o.revealStartMessageCount))
      : undefined;
  const revealFullMessageCount =
    typeof o.revealFullMessageCount === "number" &&
    Number.isFinite(o.revealFullMessageCount)
      ? Math.max(
          revealStartMessageCount ?? 0,
          Math.floor(o.revealFullMessageCount)
        )
      : undefined;
  const createdAt =
    typeof o.createdAt === "string" && o.createdAt.trim().length > 0
      ? o.createdAt.trim()
      : undefined;
  return {
    imageId,
    promptSeed,
    generationMessageCount: count,
    ...(revealStartMessageCount !== undefined ? { revealStartMessageCount } : {}),
    ...(revealFullMessageCount !== undefined ? { revealFullMessageCount } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export function parseZenWallpaperHistory(raw: string | null | undefined): ZenWallpaperHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeZenWallpaperHistory(parsed);
  } catch {
    return [];
  }
}

export function normalizeZenWallpaperHistory(
  entries: readonly ZenWallpaperHistoryEntry[]
): ZenWallpaperHistoryEntry[];
export function normalizeZenWallpaperHistory(entries: readonly unknown[]): ZenWallpaperHistoryEntry[];
export function normalizeZenWallpaperHistory(entries: readonly unknown[]): ZenWallpaperHistoryEntry[] {
  const byImageId = new Map<string, ZenWallpaperHistoryEntry>();
  for (const raw of entries) {
    const entry = normalizeZenWallpaperHistoryEntry(raw);
    if (!entry) continue;
    byImageId.set(entry.imageId, entry);
  }
  return [...byImageId.values()]
    .sort((a, b) => {
      const countDelta = a.generationMessageCount - b.generationMessageCount;
      if (countDelta !== 0) return countDelta;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    })
    .slice(-40);
}

export function appendZenWallpaperHistoryEntry(
  rawHistory: string | null | undefined,
  entry: ZenWallpaperHistoryEntry
): ZenWallpaperHistoryEntry[] {
  const normalizedEntry = normalizeZenWallpaperHistoryEntry(entry);
  if (!normalizedEntry) return parseZenWallpaperHistory(rawHistory);
  const history = parseZenWallpaperHistory(rawHistory);
  const existing = history.find((item) => item.imageId === normalizedEntry.imageId);
  const mergedEntry: ZenWallpaperHistoryEntry = existing
    ? {
        ...existing,
        ...normalizedEntry,
        revealStartMessageCount:
          normalizedEntry.revealStartMessageCount ?? existing.revealStartMessageCount,
        revealFullMessageCount:
          normalizedEntry.revealFullMessageCount ?? existing.revealFullMessageCount,
        createdAt: normalizedEntry.createdAt ?? existing.createdAt,
      }
    : normalizedEntry;
  const previous = history.filter((item) => item.imageId !== mergedEntry.imageId);
  return normalizeZenWallpaperHistory([...previous, mergedEntry]);
}

export function serializeZenWallpaperHistory(entries: readonly ZenWallpaperHistoryEntry[]): string {
  return JSON.stringify(normalizeZenWallpaperHistory(entries));
}

export function getLatestRememberedZenWallpaperForBot(
  db: DatabaseSync,
  userId: string,
  botId: string | null | undefined
): RememberedZenWallpaper | null {
  const normalizedBotId = botId?.trim();
  if (!normalizedBotId) return null;
  const row = db
    .prepare(
      `SELECT id, prompt, created_at
         FROM images
        WHERE user_id = ?
          AND bot_id = ?
          AND COALESCE(purpose, 'gallery') = 'wallpaper'
        ORDER BY created_at DESC, id DESC
        LIMIT 1`
    )
    .get(userId, normalizedBotId) as
    | { id: string; prompt: string | null; created_at: string }
    | undefined;
  if (!row?.id) return null;
  return {
    imageId: row.id,
    promptSeed: row.prompt?.trim() || null,
    createdAt: row.created_at,
  };
}

export function buildRememberedZenWallpaperHistory(
  wallpaper: RememberedZenWallpaper
): ZenWallpaperHistoryEntry[] {
  return normalizeZenWallpaperHistory([
    {
      imageId: wallpaper.imageId,
      promptSeed: wallpaper.promptSeed,
      generationMessageCount: 0,
      createdAt: wallpaper.createdAt,
    },
  ]);
}

export function buildZenWallpaperHistoryForGeneratedImage(
  rawHistory: string | null | undefined,
  entry: ZenWallpaperHistoryEntry,
  options: {
    latestMessageCount: number;
    restoreMessageLimit: number;
    replaceImmediately?: boolean;
  }
): ZenWallpaperHistoryEntry[] {
  const normalizedEntry = normalizeZenWallpaperHistoryEntry(entry);
  if (!normalizedEntry) return parseZenWallpaperHistory(rawHistory);
  const prunedHistory = pruneZenWallpaperHistoryForRestoreWindow(
    serializeZenWallpaperHistory(
      appendZenWallpaperHistoryEntry(rawHistory, normalizedEntry)
    ),
    options.latestMessageCount,
    options.restoreMessageLimit
  );
  const generatedEntryIncluded = prunedHistory.some(
    (historyEntry) => historyEntry.imageId === normalizedEntry.imageId
  );
  return generatedEntryIncluded
    ? prunedHistory
    : normalizeZenWallpaperHistory([...prunedHistory, normalizedEntry]);
}

export function pruneZenWallpaperHistoryForMessageCount(
  rawHistory: string | null | undefined,
  maxMessageCount: number
): ZenWallpaperHistoryEntry[] {
  const count = Math.max(0, Math.floor(maxMessageCount));
  return parseZenWallpaperHistory(rawHistory).filter(
    (entry) => entry.generationMessageCount <= count
  );
}

export function pruneZenWallpaperHistoryForRestoreWindow(
  rawHistory: string | null | undefined,
  latestMessageCount: number,
  restoreMessageLimit: number
): ZenWallpaperHistoryEntry[] {
  const latest = Math.max(0, Math.floor(latestMessageCount));
  const windowStart = Math.max(0, latest - Math.max(0, Math.floor(restoreMessageLimit)));
  const history = parseZenWallpaperHistory(rawHistory).filter(
    (entry) => entry.generationMessageCount <= latest
  );
  const visibleEntries = history.filter(
    (entry) => entry.generationMessageCount >= windowStart
  );
  const baselineEntry =
    history
      .filter((entry) => entry.generationMessageCount < windowStart)
      .at(-1) ?? null;
  return normalizeZenWallpaperHistory(
    baselineEntry ? [baselineEntry, ...visibleEntries] : visibleEntries
  );
}

export function mapZenWallpaperMetadata(row: {
  zen_wallpaper_enabled?: number | null;
  zen_wallpaper_image_id?: string | null;
  zen_wallpaper_prompt_seed?: string | null;
  zen_wallpaper_message_count?: number | null;
  zen_wallpaper_status?: string | null;
  zen_wallpaper_history?: string | null;
}): ZenWallpaperMetadata {
  const imageId = row.zen_wallpaper_image_id?.trim() || null;
  const promptSeed = row.zen_wallpaper_prompt_seed?.trim() || null;
  const messageCount =
    typeof row.zen_wallpaper_message_count === "number" &&
    Number.isFinite(row.zen_wallpaper_message_count)
      ? Math.max(0, Math.floor(row.zen_wallpaper_message_count))
      : null;
  const storedHistory = parseZenWallpaperHistory(row.zen_wallpaper_history);
  const history =
    imageId && messageCount !== null
      ? appendZenWallpaperHistoryEntry(row.zen_wallpaper_history, {
          imageId,
          promptSeed,
          generationMessageCount: messageCount,
        })
      : storedHistory;
  return {
    enabled: row.zen_wallpaper_enabled === 1,
    imageId,
    promptSeed,
    generationMessageCount: messageCount,
    status: normalizeZenWallpaperStatus(row.zen_wallpaper_status),
    history,
  };
}

function normalizeMessageCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

/**
 * Stored Zen wallpaper timelines use absolute message counts, but Zen detail
 * responses only hydrate the latest restore window. Rebase the metadata to the
 * visible message slice so the browser can anchor backdrop reveals to DOM rows
 * that actually exist, while leaving the persisted timeline unchanged.
 */
export function rebaseZenWallpaperMetadataForVisibleWindow(
  metadata: ZenWallpaperMetadata,
  totalMessageCountRaw: number,
  visibleMessageCountRaw: number
): ZenWallpaperMetadata {
  const totalMessageCount = normalizeMessageCount(totalMessageCountRaw);
  const visibleMessageCount = Math.min(
    totalMessageCount,
    normalizeMessageCount(visibleMessageCountRaw)
  );
  const windowStartMessageCount = Math.max(
    0,
    totalMessageCount - visibleMessageCount
  );
  const rebaseCount = (count: number): number =>
    Math.max(0, normalizeMessageCount(count) - windowStartMessageCount);
  const currentImageId = metadata.imageId?.trim() || null;
  const currentGenerationMessageCount =
    metadata.generationMessageCount === null
      ? null
      : Math.min(normalizeMessageCount(metadata.generationMessageCount), totalMessageCount);

  let history = normalizeZenWallpaperHistory(metadata.history);
  if (currentImageId && currentGenerationMessageCount !== null) {
    const hasCurrentImageEntry = history.some((entry) => entry.imageId === currentImageId);
    if (!hasCurrentImageEntry) {
      history = normalizeZenWallpaperHistory([
        ...history,
        {
          imageId: currentImageId,
          promptSeed: metadata.promptSeed,
          generationMessageCount: currentGenerationMessageCount,
        },
      ]);
    }
  }

  const preparedEntries = history
    .map((entry) => ({
      ...entry,
      generationMessageCount: Math.min(
        normalizeMessageCount(entry.generationMessageCount),
        totalMessageCount
      ),
    }))
    .filter((entry) => entry.generationMessageCount <= totalMessageCount);
  const selectedByImageId = new Map<string, ZenWallpaperHistoryEntry>();
  const baselineEntry =
    preparedEntries
      .filter((entry) => entry.generationMessageCount < windowStartMessageCount)
      .at(-1) ?? null;

  for (const entry of preparedEntries) {
    if (entry.generationMessageCount >= windowStartMessageCount) {
      selectedByImageId.set(entry.imageId, entry);
    }
  }

  if (baselineEntry && !selectedByImageId.has(baselineEntry.imageId)) {
    selectedByImageId.set(baselineEntry.imageId, baselineEntry);
  }
  if (
    selectedByImageId.size === 0 &&
    currentImageId &&
    currentGenerationMessageCount !== null
  ) {
    selectedByImageId.set(currentImageId, {
      imageId: currentImageId,
      promptSeed: metadata.promptSeed,
      generationMessageCount: currentGenerationMessageCount,
    });
  }

  const rebasedHistory = normalizeZenWallpaperHistory(
    [...selectedByImageId.values()].map((entry) => ({
      imageId: entry.imageId,
      promptSeed: entry.promptSeed,
      generationMessageCount: rebaseCount(entry.generationMessageCount),
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
    }))
  );

  return {
    ...metadata,
    generationMessageCount:
      currentGenerationMessageCount === null
        ? null
        : rebaseCount(currentGenerationMessageCount),
    history: rebasedHistory,
  };
}

export function recoverStaleZenWallpaperGenerationStatus(
  db: DatabaseSync,
  userId: string,
  options: {
    conversationId?: string;
    activeZenWallpaperConversationId?: string | null;
  } = {}
): void {
  if (
    options.activeZenWallpaperConversationId &&
    (!options.conversationId ||
      options.activeZenWallpaperConversationId === options.conversationId)
  ) {
    return;
  }
  const conversationClause = options.conversationId ? " AND id = ?" : "";
  const params = options.conversationId
    ? [userId, options.conversationId]
    : [userId];
  db.prepare(
    `UPDATE conversations
        SET zen_wallpaper_status = CASE
          WHEN zen_wallpaper_image_id IS NOT NULL THEN 'ready'
          ELSE 'idle'
        END
      WHERE user_id = ?
        AND zen_wallpaper_status = 'generating'
        ${conversationClause}`
  ).run(...params);
}

export function dedupeActiveZenWallpaperGeneration(
  db: DatabaseSync,
  userId: string,
  options: {
    conversationId: string;
    activeZenWallpaperConversationId?: string | null;
    enabled?: boolean;
  }
): boolean {
  if (options.enabled === false) return false;
  const conversationId = options.conversationId.trim();
  const activeConversationId = options.activeZenWallpaperConversationId?.trim();
  if (!conversationId || activeConversationId !== conversationId) return false;
  db.prepare(
    `UPDATE conversations
        SET zen_wallpaper_enabled = 1,
            zen_wallpaper_status = 'generating'
      WHERE id = ? AND user_id = ?`
  ).run(conversationId, userId);
  return true;
}

export function deleteCoffeePollsForConversations(
  db: DatabaseSync,
  userId: string,
  conversationIds: string[]
): void {
  if (conversationIds.length === 0) return;
  const placeholders = inClausePlaceholders(conversationIds.length);
  const topOffTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coffee_cup_top_offs'")
    .get() as { name?: string } | undefined;
  if (topOffTable?.name) {
    db.prepare(
      `DELETE FROM coffee_cup_top_offs WHERE user_id = ? AND conversation_id IN (${placeholders})`
    ).run(userId, ...conversationIds);
  }

  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'coffee_polls'")
    .get() as { name?: string } | undefined;
  if (!table?.name) return;

  db.prepare(
    `DELETE FROM coffee_poll_votes WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `DELETE FROM coffee_polls WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
}

function deleteConversationsByIds(
  db: DatabaseSync,
  userId: string,
  conversationIds: string[]
): number {
  if (conversationIds.length === 0) return 0;
  const placeholders = inClausePlaceholders(conversationIds.length);
  const scopedInClause = `user_id = ? AND id IN (${placeholders})`;
  const messageScopedInClause = `user_id = ? AND conversation_id IN (${placeholders})`;

  deleteCoffeePollsForConversations(db, userId, conversationIds);

  db.prepare(
    `UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `UPDATE zen_session_memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `DELETE FROM conversation_exports WHERE user_id = ? AND conversation_id IN (${placeholders})`
  ).run(userId, ...conversationIds);
  db.prepare(
    `DELETE FROM messages WHERE ${messageScopedInClause}`
  ).run(userId, ...conversationIds);
  const deleted = db.prepare(
    `DELETE FROM conversations WHERE ${scopedInClause}`
  ).run(userId, ...conversationIds);
  return Number(deleted.changes ?? 0);
}

function composeSweepSummaryText(
  db: DatabaseSync,
  userId: string,
  groupName: string,
  conversationRows: Array<{ id: string; title: string }>
): string {
  const lines: string[] = [];
  lines.push(`Sweep summary for ${groupName}.`);
  lines.push(`Archived ${conversationRows.length} chats into this single recap.`);
  lines.push("");
  lines.push("Conversation highlights:");

  for (const row of conversationRows.slice(0, 8)) {
    const latestMessages = db
      .prepare(
        `SELECT role, content
           FROM messages
          WHERE user_id = ? AND conversation_id = ?
          ORDER BY created_at DESC
          LIMIT 4`
      )
      .all(userId, row.id) as Array<{ role: string; content: string }>;
    const latestUser = latestMessages.find((message) => message.role === "user");
    const latestAssistant = latestMessages.find((message) => message.role === "assistant");
    const parts: string[] = [];
    if (latestUser?.content) {
      parts.push(`you: "${clampSnippet(latestUser.content, 96)}"`);
    }
    if (latestAssistant?.content) {
      parts.push(`assistant: "${clampSnippet(latestAssistant.content, 96)}"`);
    }
    const suffix = parts.length > 0 ? ` (${parts.join(" | ")})` : "";
    lines.push(`- ${row.title}${suffix}`);
  }

  if (conversationRows.length > 8) {
    lines.push(`- +${conversationRows.length - 8} additional archived chats`);
  }

  lines.push("");
  lines.push("Use Undo Sweep to restore the previous chat list.");
  return lines.join("\n");
}

/**
 * Create saved, bot-attributed placeholder chats for Developer Tools.
 *
 * These rows deliberately bypass the normal LLM pipeline: they are only seeded
 * UI fixtures for sidebar density checks, so a static lorem assistant reply is
 * enough and avoids provider/network side effects.
 */
export function createDevSeedConversations(
  db: DatabaseSync,
  userId: string,
  count: number
): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Chat seed count must be a positive integer.");
  }

  const botRows = db
    .prepare(
      "SELECT id FROM bots WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC, name ASC"
    )
    .all(userId) as Array<{ id: string }>;

  const insertConversation = db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, 'sandbox', ?, 0, ?, ?)"
  );
  const insertMessage = db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const baseTime = Date.now();
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (let index = 0; index < count; index += 1) {
      const conversationId = randomId(12);
      const botId = botRows.length > 0
        ? botRows[index % botRows.length]?.id ?? null
        : null;
      const createdAt = new Date(baseTime + index * 2).toISOString();
      const updatedAt = new Date(baseTime + index * 2 + 1).toISOString();
      const ordinal = index + 1;

      insertConversation.run(
        conversationId,
        userId,
        `Dev chat ${ordinal}`,
        botId,
        createdAt,
        updatedAt
      );
      insertMessage.run(
        randomId(12),
        conversationId,
        userId,
        "user",
        DEV_SEED_CHAT_USER_MESSAGE,
        null,
        createdAt
      );
      insertMessage.run(
        randomId(12),
        conversationId,
        userId,
        "assistant",
        DEV_SEED_CHAT_ASSISTANT_MESSAGE,
        botId,
        updatedAt
      );
    }
    db.exec("COMMIT");
    return count;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Return saved conversations for the sidebar/history list.
 *
 * Private/incognito rows are deliberately excluded here. Current private chats
 * are ephemeral and never persist; this filter hides older rows that may have
 * been saved before that contract existed.
 */
export function listConversationSummaries(
  db: DatabaseSync,
  userId: string
): ConversationSummary[] {
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  const conversationColumnNames = new Set(conversationColumns.map((column) => column.name));
  const zenWallpaperSelect = conversationColumnNames.has("zen_wallpaper_enabled")
    ? `c.zen_wallpaper_enabled, c.zen_wallpaper_image_id,
              c.zen_wallpaper_prompt_seed, c.zen_wallpaper_message_count,
              c.zen_wallpaper_status,
              ${conversationColumnNames.has("zen_wallpaper_history") ? "c.zen_wallpaper_history" : "'[]' AS zen_wallpaper_history"},`
    : `0 AS zen_wallpaper_enabled, NULL AS zen_wallpaper_image_id,
              NULL AS zen_wallpaper_prompt_seed, NULL AS zen_wallpaper_message_count,
              'idle' AS zen_wallpaper_status, '[]' AS zen_wallpaper_history,`;
  // last_bot_id / last_bot_color come from the MOST RECENT assistant message on
  // the conversation, regardless of the conversation's locked bot_id.
  const coffeeAbsentBotIdsSelect = conversationColumnNames.has("coffee_absent_bot_ids")
    ? "c.coffee_absent_bot_ids"
    : "'[]' AS coffee_absent_bot_ids";
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.conversation_mode, c.bot_id, c.bot_group_ids,
              c.coffee_group_id, c.coffee_duration_minutes, ${coffeeAbsentBotIdsSelect},
              c.incognito, c.created_at, c.updated_at,
              ${zenWallpaperSelect}
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
          AND COALESCE(c.incognito, 0) = 0
          AND c.archived_at IS NULL
     ORDER BY c.updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    conversation_mode: string | null;
    bot_id: string | null;
    bot_group_ids: string | null;
    coffee_absent_bot_ids: string | null;
    coffee_group_id: string | null;
    coffee_duration_minutes: number | null;
    incognito: number;
    created_at: string;
    updated_at: string;
    zen_wallpaper_enabled: number | null;
    zen_wallpaper_image_id: string | null;
    zen_wallpaper_prompt_seed: string | null;
    zen_wallpaper_message_count: number | null;
    zen_wallpaper_status: string | null;
    zen_wallpaper_history: string | null;
    last_bot_id: string | null;
    last_bot_color: string | null;
    has_assistant_reply: number;
  }>;

  const hubMetadataByConversationId = getConversationHubMetadataMap(
    db,
    userId,
    rows.map((row) => row.id)
  );

  return rows.map((row) => {
    const mode: "zen" | "chat" | "sandbox" | "coffee" =
      row.conversation_mode === "zen"
        ? "zen"
        : row.conversation_mode === "chat"
          ? "chat"
          : row.conversation_mode === "coffee"
            ? "coffee"
            : "sandbox";
    const botGroupIds = parseBotGroupIdsForSummary(row.bot_group_ids);
    const coffeeAbsentBotIds = parseBotGroupIdsForSummary(row.coffee_absent_bot_ids);
    const hubMetadata = hubMetadataByConversationId.get(row.id);
    return {
      id: row.id,
      title: row.title,
      mode,
      botId: row.bot_id ?? null,
      ...(hubMetadata
        ? {
            hubRole: hubMetadata.hubRole,
            hubBotId: hubMetadata.hubBotId,
            parentHubId: hubMetadata.parentHubId,
          }
        : {}),
      ...(botGroupIds.length > 0 ? { botGroupIds } : {}),
      ...(mode === "coffee" && coffeeAbsentBotIds.length > 0
        ? { coffeeAbsentBotIds }
        : {}),
      ...(mode === "coffee" ? { coffeeGroupId: row.coffee_group_id ?? null } : {}),
      ...(mode === "coffee" && isCoffeeSessionDurationMinutes(row.coffee_duration_minutes)
        ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
        : {}),
      incognito: row.incognito === 1,
      lastBotId: row.last_bot_id ?? null,
      lastBotColor: row.last_bot_color ?? null,
      hasAssistantReply: row.has_assistant_reply === 1,
      zenWallpaper: mapZenWallpaperMetadata(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function isCoffeeSessionDurationMinutes(value: unknown): value is CoffeeSessionDurationMinutes {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= COFFEE_SESSION_DURATION_MINUTES_MIN &&
    value <= COFFEE_SESSION_DURATION_MINUTES_MAX
  );
}

function parseBotGroupIdsForSummary(raw: string | null): string[] {
  if (!raw) return [];
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

export function getConversationSweepState(
  db: DatabaseSync,
  userId: string
): ConversationSweepState {
  const latest = db
    .prepare(
      `SELECT id, created_at
         FROM conversation_sweep_batches
        WHERE user_id = ?
          AND undone_at IS NULL
          AND undo_expires_at > ?
        ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(userId, new Date().toISOString()) as { id: string; created_at: string } | undefined;
  return {
    canUndo: Boolean(latest?.id),
    latestBatchId: latest?.id ?? null,
    latestSweepAt: latest?.created_at ?? null,
  };
}

export function sweepConversations(
  db: DatabaseSync,
  userId: string,
  mode: "chat" | "sandbox"
): ConversationSweepResult {
  const rows = db
    .prepare(
      `SELECT id, title, bot_id, updated_at
         FROM conversations
        WHERE user_id = ?
          AND COALESCE(incognito, 0) = 0
          AND archived_at IS NULL
          AND conversation_mode = ?
        ORDER BY updated_at DESC`
    )
    .all(userId, mode) as Array<{
    id: string;
    title: string;
    bot_id: string | null;
    updated_at: string;
  }>;
  if (rows.length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const botRows = db
    .prepare("SELECT id, name FROM bots WHERE user_id = ?")
    .all(userId) as Array<{ id: string; name: string }>;
  const botNameById = new Map(botRows.map((row) => [row.id, row.name]));
  const groups = new Map<string, { botId: string | null; name: string; conversations: typeof rows }>();
  for (const row of rows) {
    const botId = row.bot_id ?? null;
    const key = botId ?? "__default__";
    const existing = groups.get(key);
    if (existing) {
      existing.conversations.push(row);
      continue;
    }
    groups.set(key, {
      botId,
      name: botId ? botNameById.get(botId) ?? "Bot" : "Prism",
      conversations: [row],
    });
  }
  const eligibleGroups = Array.from(groups.values()).filter(
    (group) => group.conversations.length > 1
  );
  if (eligibleGroups.length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const nowMs = Date.now();
  const batchId = randomId(12);
  const archivedConversationIds = eligibleGroups.flatMap((group) =>
    group.conversations.map((row) => row.id)
  );
  const summaryConversationIds: string[] = [];

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const closePriorBatchesAt = new Date(nowMs - 1).toISOString();
    db.prepare(
      "UPDATE conversation_sweep_batches SET undone_at = ? WHERE user_id = ? AND undone_at IS NULL"
    ).run(closePriorBatchesAt, userId);

    const archivedAt = new Date(nowMs).toISOString();
    const archivePlaceholders = inClausePlaceholders(archivedConversationIds.length);
    db.prepare(
      `UPDATE conversations
          SET archived_at = ?, archive_batch_id = ?
        WHERE user_id = ? AND id IN (${archivePlaceholders})`
    ).run(archivedAt, batchId, userId, ...archivedConversationIds);

    let summaryIndex = 0;
    for (const group of eligibleGroups) {
      const conversationId = randomId(12);
      summaryConversationIds.push(conversationId);
      const createdAt = new Date(nowMs + summaryIndex * 2 + 1).toISOString();
      const messageAt = new Date(nowMs + summaryIndex * 2 + 2).toISOString();
      const title = `Sweep Summary - ${group.name}`;
      const summaryText = composeSweepSummaryText(
        db,
        userId,
        group.name,
        group.conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
        }))
      );

      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        conversationId,
        userId,
        title,
        mode,
        group.botId,
        createdAt,
        messageAt
      );
      db.prepare(
        `INSERT INTO messages (
          id, conversation_id, user_id, role, content, bot_id, created_at
        ) VALUES (?, ?, ?, 'assistant', ?, ?, ?)`
      ).run(randomId(12), conversationId, userId, summaryText, group.botId, messageAt);
      summaryIndex += 1;
    }

    db.prepare(
      `INSERT INTO conversation_sweep_batches (
        id, user_id, archived_conversation_ids, summary_conversation_ids, created_at, undo_expires_at, undone_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      batchId,
      userId,
      JSON.stringify(archivedConversationIds),
      JSON.stringify(summaryConversationIds),
      new Date(nowMs + summaryIndex * 2 + 3).toISOString(),
      new Date(nowMs + SWEEP_UNDO_WINDOW_MS).toISOString()
    );

    db.exec("COMMIT");
    return {
      batchId,
      sweptGroups: eligibleGroups.length,
      archivedConversationCount: archivedConversationIds.length,
      summaryConversationCount: summaryConversationIds.length,
      undoExpiresAt: new Date(nowMs + SWEEP_UNDO_WINDOW_MS).toISOString(),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function undoLatestConversationSweep(
  db: DatabaseSync,
  userId: string,
  batchId: string | null
): ConversationSweepResult {
  if (!batchId || batchId.trim().length === 0) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }
  const latestBatch = db
    .prepare(
      `SELECT id, archived_conversation_ids, summary_conversation_ids, undo_expires_at
         FROM conversation_sweep_batches
        WHERE user_id = ?
          AND id = ?
          AND undone_at IS NULL
          AND undo_expires_at > ?
        LIMIT 1`
    )
    .get(userId, batchId.trim(), new Date().toISOString()) as
    | {
        id: string;
        archived_conversation_ids: string;
        summary_conversation_ids: string;
        undo_expires_at: string;
      }
    | undefined;
  if (!latestBatch?.id) {
    return {
      batchId: null,
      sweptGroups: 0,
      archivedConversationCount: 0,
      summaryConversationCount: 0,
      undoExpiresAt: null,
    };
  }

  const archivedConversationIds = parseIdList(latestBatch.archived_conversation_ids);
  const summaryConversationIds = parseIdList(latestBatch.summary_conversation_ids);
  const archivedCount = archivedConversationIds.length;
  const summaryCount = summaryConversationIds.length;

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    if (archivedConversationIds.length > 0) {
      const placeholders = inClausePlaceholders(archivedConversationIds.length);
      db.prepare(
        `UPDATE conversations
            SET archived_at = NULL,
                archive_batch_id = NULL
          WHERE user_id = ?
            AND archive_batch_id = ?
            AND id IN (${placeholders})`
      ).run(userId, latestBatch.id, ...archivedConversationIds);
    }
    deleteConversationsByIds(db, userId, summaryConversationIds);
    db.prepare(
      "UPDATE conversation_sweep_batches SET undone_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), latestBatch.id, userId);
    db.exec("COMMIT");
    return {
      batchId: latestBatch.id,
      sweptGroups: 0,
      archivedConversationCount: archivedCount,
      summaryConversationCount: summaryCount,
      undoExpiresAt: latestBatch.undo_expires_at,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove a single chat owned by `userId`.
 *
 * Behaviour:
 *   - Throws if the conversation does not exist or belongs to another user.
 *   - Runs inside an IMMEDIATE transaction so partial failures roll back.
 *   - Cascade-deletes the messages and markdown exports tied to the chat.
 *   - Preserves user-owned artifacts (generated images and derived memory
 *     summaries) by untying them (`conversation_id = NULL`) instead of
 *     destroying them. Images and summaries outlive the chat they came from
 *     because the gallery / memories UI still show them meaningfully.
 */
export function deleteConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): void {
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  const hasParentIdColumn = conversationColumns.some((column) => column.name === "parent_id");
  const existing = db
    .prepare(
      `SELECT id, conversation_mode${hasParentIdColumn ? ", parent_id" : ""}
         FROM conversations
        WHERE id = ? AND user_id = ?`
    )
    .get(conversationId, userId) as
    | { id?: string; conversation_mode?: string | null; parent_id?: string | null }
    | undefined;
  if (!existing?.id) {
    throw new Error("Conversation not found.");
  }
  const conversationIdsToDelete = [conversationId];
  if (hasParentIdColumn && !existing.parent_id) {
    const childRows = db
      .prepare("SELECT id FROM conversations WHERE user_id = ? AND parent_id = ?")
      .all(userId, conversationId) as Array<{ id: string }>;
    for (const child of childRows) {
      if (!conversationIdsToDelete.includes(child.id)) {
        conversationIdsToDelete.push(child.id);
      }
    }
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    deleteConversationsByIds(db, userId, conversationIdsToDelete);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Empty a single saved chat without deleting the conversation row.
 *
 * This is the durable half of the `/clear` command: the transcript, exports,
 * and thread-scoped summaries are removed so future model prompts cannot see
 * previous turns. User artifacts that may still matter outside this thread
 * (images and long-term memories) are preserved but detached from the chat.
 * Conversation-scoped wallpaper metadata is cleared so a fresh Zen start does
 * not keep rendering the prior session's Atmosphere.
 */
export function clearConversationMessages(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): { deletedMessages: number; deletedSummaries: number; deletedExports: number } {
  const existing = db
    .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
    .get(conversationId, userId) as
    | { id?: string; conversation_mode?: string | null }
    | undefined;
  if (!existing?.id) {
    throw new Error("Conversation not found.");
  }
  if (existing.conversation_mode === "coffee") {
    throw new Error("Coffee conversations cannot be cleared from the chat surface.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    db.prepare(
      "UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    const exportDelete = db.prepare(
      "DELETE FROM conversation_exports WHERE conversation_id = ? AND user_id = ?"
    ).run(conversationId, userId);
    const summaryDelete = db.prepare(
      "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    db.prepare(
      "DELETE FROM zen_session_memories WHERE user_id = ? AND conversation_id = ?"
    ).run(userId, conversationId);
    const messageDelete = db.prepare(
      "DELETE FROM messages WHERE conversation_id = ? AND user_id = ?"
    ).run(conversationId, userId);
    const sessionOpinionsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_opinions'")
      .get() as { name?: string } | undefined;
    if (sessionOpinionsTable?.name) {
      db.prepare(
        "DELETE FROM session_opinions WHERE conversation_id = ? AND user_id = ?"
      ).run(conversationId, userId);
    }
    db.prepare(
      `UPDATE conversations
          SET title = ?,
              updated_at = ?,
              zen_wallpaper_image_id = NULL,
              zen_wallpaper_prompt_seed = NULL,
              zen_wallpaper_message_count = NULL,
              zen_wallpaper_status = 'idle',
              zen_wallpaper_history = '[]'
        WHERE id = ? AND user_id = ?`
    ).run("New chat", new Date().toISOString(), conversationId, userId);
    db.exec("COMMIT");
    return {
      deletedMessages: Number(messageDelete.changes ?? 0),
      deletedSummaries: Number(summaryDelete.changes ?? 0),
      deletedExports: Number(exportDelete.changes ?? 0),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setZenStarterConversationSuppression(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  suppressed: boolean
): { conversationId: string; suppressed: boolean } {
  const conversation = db
    .prepare(
      `SELECT c.id,
              c.conversation_mode,
              c.incognito,
              c.archived_at
         FROM conversations c
        WHERE c.id = ?
          AND c.user_id = ?`
    )
    .get(conversationId, userId) as
    | {
        id?: string;
        conversation_mode?: string | null;
        incognito?: number | null;
        archived_at?: string | null;
      }
    | undefined;
  if (!conversation?.id) {
    throw new Error("Conversation not found.");
  }
  if (
    conversation.conversation_mode !== "zen" &&
    conversation.conversation_mode !== "chat"
  ) {
    throw new Error("Only saved Zen conversations can be suppressed.");
  }
  if (conversation.incognito === 1) {
    throw new Error("Only saved Zen conversations can be suppressed.");
  }
  const nextArchivedAt = suppressed ? (conversation.archived_at ?? new Date().toISOString()) : null;
  db.prepare(
    "UPDATE conversations SET archived_at = ? WHERE id = ? AND user_id = ?"
  ).run(nextArchivedAt, conversationId, userId);
  return { conversationId, suppressed };
}

/**
 * Permanently remove all saved chats in one bot/default conversation group.
 *
 * `botId === null` targets Default Prism chats (`conversations.bot_id IS NULL`).
 * Private/incognito rows are excluded to match the sidebar's visible saved-chat
 * surface. Linked user artifacts follow the same preservation contract as
 * {@link deleteConversation}: images and memories survive with their
 * conversation pointer nulled, while messages and exports are deleted.
 */
export function deleteConversationsByBot(
  db: DatabaseSync,
  userId: string,
  botId: string | null
): number {
  const botPredicate = botId === null ? "bot_id IS NULL" : "bot_id = ?";
  const groupSubquery = `SELECT id FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND conversation_mode != 'zen' AND ${botPredicate}`;
  const groupParams: Array<string | null> = botId === null ? [userId] : [userId, botId];

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND conversation_mode != 'zen' AND ${botPredicate}`
      )
      .get(...groupParams) as { n: number };
    const conversationCount = Number(countRow.n ?? 0);

    db.prepare(
      `UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `UPDATE zen_session_memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM conversation_exports WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM messages WHERE user_id = ? AND conversation_id IN (${groupSubquery})`
    ).run(userId, ...groupParams);
    db.prepare(
      `DELETE FROM conversations WHERE user_id = ? AND COALESCE(incognito, 0) = 0 AND archived_at IS NULL AND conversation_mode != 'zen' AND ${botPredicate}`
    ).run(...groupParams);
    db.exec("COMMIT");
    return conversationCount;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Truncate a conversation back to just before a given user message so the
 * caller can resubmit that message under fresh settings (Cursor-like
 * mid-conversation revert).
 *
 * Behaviour:
 *   - Throws if the conversation doesn't belong to `userId` or the target
 *     message doesn't live in it.
 *   - Throws if the target message is not a `user` message — Resend is
 *     only meaningful as a rewind point for the user's own turn; clicking
 *     it on an assistant reply would be ambiguous ("do I keep my previous
 *     question?"). Assistant bubbles use Fork instead.
 *   - Returns the original message text so the caller can hand it to the
 *     normal /api/chat pipeline — avoiding a round-trip where the client
 *     stashes the text locally before asking us to delete it.
 *   - Runs inside an IMMEDIATE transaction. Deletes use `created_at >=`
 *     so the target user message itself is removed (a fresh row with a
 *     new id + timestamp will be written by the subsequent /api/chat
 *     turn, matching "the checkpoint IS the new turn").
 *   - Purges `memory_summaries` whose `conversation_id` matches and
 *     whose `created_at >= cutoff` so the thread-scoped compaction is
 *     rewound alongside the visible history.
 *   - Leaves the cross-thread `memories` table strictly untouched. Facts
 *     learned in this thread may also apply to unrelated conversations,
 *     so message rewind is not a memory-management gesture.
 */
export function rewindConversation(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  messageId: string
): { content: string; deletedMessages: number; deletedMemories: number } {
  const conversation = db
    .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
    .get(conversationId, userId) as
    | { id?: string; conversation_mode?: string | null }
    | undefined;
  if (!conversation?.id) {
    throw new Error("Conversation not found.");
  }
  if (conversation.conversation_mode === "zen") {
    throw new Error("Zen messages cannot be rewound.");
  }

  const target = db
    .prepare(
      "SELECT id, role, content, created_at FROM messages WHERE id = ? AND conversation_id = ? AND user_id = ?"
    )
    .get(messageId, conversationId, userId) as
    | { id: string; role: string; content: string; created_at: string }
    | undefined;
  if (!target) {
    throw new Error("Message not found in conversation.");
  }
  if (target.role !== "user") {
    throw new Error("Only user messages can be rewound.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const deletedMessages = db.prepare(
      "DELETE FROM messages WHERE conversation_id = ? AND user_id = ? AND created_at >= ?"
    ).run(conversationId, userId, target.created_at);
    db.prepare(
      "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ? AND created_at >= ?"
    ).run(userId, conversationId, target.created_at);
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), conversationId, userId);
    db.exec("COMMIT");
    return {
      content: target.content,
      deletedMessages: Number(deletedMessages.changes ?? 0),
      deletedMemories: 0,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function undoLatestConversationMessages(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  count = 1,
  nowIso = new Date().toISOString()
): UndoLatestConversationMessagesResult {
  const undoCount = count === 2 ? 2 : 1;
  const conversation = db
    .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
    .get(conversationId, userId) as
    | { id: string; conversation_mode: string | null }
    | undefined;
  if (!conversation?.id) {
    throw new Error("Conversation not found.");
  }

  const targets = db
    .prepare(
      `SELECT id, role, created_at, tool_payload
         FROM messages
        WHERE conversation_id = ? AND user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`
    )
    .all(conversationId, userId, undoCount) as Array<{
      id: string;
      role: string;
      created_at: string;
      tool_payload: string | null;
    }>;
  if (targets.length === 0) {
    throw new Error("Nothing to undo.");
  }

  const messageIds = targets.map((target) => target.id);
  const cutoff = targets.reduce(
    (earliest, target) => target.created_at < earliest ? target.created_at : earliest,
    targets[0]!.created_at
  );
  const imageIds = uniqueIdList(
    targets.flatMap((target) => {
      const imageId = sentGeneratedImageIdFromToolPayload(target.tool_payload);
      return imageId ? [imageId] : [];
    })
  );

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const deletedSummaryRows = db
      .prepare(
        `SELECT id
           FROM memory_summaries
          WHERE user_id = ? AND conversation_id = ? AND created_at >= ?
          ORDER BY created_at ASC, id ASC`
      )
      .all(userId, conversationId, cutoff) as Array<{ id: string }>;
    const deletedSummaryIds = deletedSummaryRows.map((row) => row.id);
    const summaryDelete = db
      .prepare(
        "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ? AND created_at >= ?"
      )
      .run(userId, conversationId, cutoff);
    const zenSessionDelete = db
      .prepare(
        "DELETE FROM zen_session_memories WHERE user_id = ? AND conversation_id = ? AND created_at >= ?"
      )
      .run(userId, conversationId, cutoff);
    const memoryRepair = repairMemoriesLinkedToUndo(db, userId, messageIds);

    let deletedImageRelPaths: string[] = [];
    let deletedImages = 0;
    if (imageIds.length > 0) {
      const imagePlaceholders = inClausePlaceholders(imageIds.length);
      const imageRows = db
        .prepare(
          `SELECT id, local_rel_path
             FROM images
            WHERE user_id = ? AND id IN (${imagePlaceholders})`
        )
        .all(userId, ...imageIds) as Array<{ id: string; local_rel_path: string | null }>;
      deletedImageRelPaths = imageRows
        .map((row) => row.local_rel_path?.trim() ?? "")
        .filter((value) => value.length > 0);
      deletedImages = Number(
        db
          .prepare(
            `DELETE FROM images
              WHERE user_id = ? AND id IN (${imagePlaceholders})`
          )
          .run(userId, ...imageIds).changes ?? 0
      );
    }

    const messagePlaceholders = inClausePlaceholders(messageIds.length);
    const moodEventDelete = db
      .prepare(
        `DELETE FROM prism_mood_events
          WHERE user_id = ? AND conversation_id = ? AND message_id IN (${messagePlaceholders})`
      )
      .run(userId, conversationId, ...messageIds);
    const messageDelete = db
      .prepare(
        `DELETE FROM messages
          WHERE user_id = ? AND conversation_id = ? AND id IN (${messagePlaceholders})`
      )
      .run(userId, conversationId, ...messageIds);
    const latestRemaining = db
      .prepare(
        `SELECT created_at
           FROM messages
          WHERE user_id = ? AND conversation_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1`
      )
      .get(userId, conversationId) as { created_at: string } | undefined;
    const nextUpdatedAt = latestRemaining?.created_at ?? nowIso;
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(nextUpdatedAt, conversationId, userId);
    const prismMood = rebuildPrismMoodAfterUndo(
      db,
      userId,
      conversationId,
      conversation.conversation_mode,
      nowIso
    );
    db.exec("COMMIT");
    return {
      conversationId,
      conversationMode: conversation.conversation_mode,
      messageIds,
      deletedMessages: Number(messageDelete.changes ?? 0),
      deletedMemories: memoryRepair.deleted,
      updatedMemories: memoryRepair.updated,
      deletedSummaries: Number(summaryDelete.changes ?? 0),
      deletedSummaryIds,
      deletedZenSessionMemories: Number(zenSessionDelete.changes ?? 0),
      deletedMoodEvents: Number(moodEventDelete.changes ?? 0),
      deletedImages,
      deletedImageRelPaths,
      prismMood,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Remove a single message from a conversation while preserving long-term memory rows.
 *
 * Behavior:
 *   - Throws if the message is missing or not owned by `userId`.
 *   - Deletes only the targeted message row.
 *   - Invalidates conversation-scoped summaries so future context is rebuilt
 *     from surviving messages.
 *   - Leaves `memories` untouched, even when they reference the deleted message.
 */
export function deleteConversationMessage(
  db: DatabaseSync,
  userId: string,
  messageId: string
): { conversationId: string; deletedSummaries: number } {
  const target = db
    .prepare(
      "SELECT id, conversation_id FROM messages WHERE id = ? AND user_id = ?"
    )
    .get(messageId, userId) as { id: string; conversation_id: string } | undefined;
  if (!target) {
    throw new Error("Message not found.");
  }

  const conversation = db
    .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
    .get(target.conversation_id, userId) as
    | { id?: string; conversation_mode?: string | null }
    | undefined;
  if (!conversation?.id) {
    throw new Error("Conversation not found.");
  }
  if (conversation.conversation_mode === "zen") {
    throw new Error("Zen messages cannot be deleted.");
  }

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare("DELETE FROM messages WHERE id = ? AND user_id = ?").run(messageId, userId);
    const summaryDelete = db
      .prepare(
        "DELETE FROM memory_summaries WHERE user_id = ? AND conversation_id = ?"
      )
      .run(userId, target.conversation_id);
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(new Date().toISOString(), target.conversation_id, userId);
    db.exec("COMMIT");
    return {
      conversationId: target.conversation_id,
      deletedSummaries: Number(summaryDelete.changes ?? 0),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Permanently remove every chat owned by `userId`.
 *
 * Behaviour:
 *   - Returns the number of conversations removed (0 if the user had none).
 *   - Runs inside a single IMMEDIATE transaction so either every chat is
 *     gone or the database is untouched.
 *   - Follows the same preservation contract as {@link deleteConversation}:
 *     images and memory summaries survive with `conversation_id = NULL`;
 *     messages and markdown exports are hard-deleted alongside their chats.
 *   - Strictly scoped to `userId` via `WHERE user_id = ?` on every statement
 *     so other users' data is never touched.
 */
export function deleteAllConversations(
  db: DatabaseSync,
  userId: string
): number {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    const { n: conversationCount } = db
      .prepare(
        `SELECT COUNT(*) AS n
           FROM conversations
          WHERE user_id = ?
            AND NOT (
              conversation_mode = 'zen'
              OR (conversation_mode = 'chat' AND bot_id IS NULL)
            )`
      )
      .get(userId) as { n: number };

    db.prepare(
      "UPDATE images SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "UPDATE memory_summaries SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "UPDATE zen_session_memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "UPDATE memories SET conversation_id = NULL WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "DELETE FROM conversation_exports WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "DELETE FROM messages WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL)))"
    ).run(userId, userId);
    db.prepare(
      "DELETE FROM conversations WHERE user_id = ? AND NOT (conversation_mode = 'zen' OR (conversation_mode = 'chat' AND bot_id IS NULL))"
    ).run(userId);
    db.exec("COMMIT");
    return conversationCount;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
