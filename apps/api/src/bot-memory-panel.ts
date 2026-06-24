import type { DatabaseSync } from "node:sqlite";
import type {
  BotOpinion,
  MemoryCategory,
  MemoryTier,
  OpinionTrend,
  SessionOpinion,
  UserMemory,
} from "@localai/shared";
import {
  filterConflictingMemories,
  normalizeMemoryDurability,
} from "./memory.ts";
import { normalizeMemoryDisplayText } from "./memory-validation.ts";
import { decryptJson } from "./security.ts";
import { HttpError } from "./utils.http.ts";
import { getLatestSandboxBotStatusSummary } from "./memory-summarizer.ts";

type MemorySource = NonNullable<UserMemory["source"]>;

interface MemoryPanelRow {
  id: string;
  conversation_id: string | null;
  bot_id: string | null;
  confidence: number;
  category: MemoryCategory;
  tier: MemoryTier;
  durability: number | null;
  source: MemorySource;
  certainty: number | null;
  source_message_ids: string;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
}

interface SessionOpinionRow {
  score: number;
  band: string;
  trend: string;
  last_reason: string;
  recent_reasons: string;
  updated_at: string;
}

interface BotOpinionRow extends SessionOpinionRow {
  boundary_level: string;
  repair_count: number;
}

export interface BotMemoryPanelCounts {
  total: number;
  visible: number;
  protectedAboutYou: number;
  bySource: Record<MemorySource, number>;
  byTier: Record<MemoryTier, number>;
  byCategory: Record<MemoryCategory, number>;
}

export interface BotMemoryPanelPayload {
  botId: string;
  memories: UserMemory[];
  aboutYouMemories: UserMemory[];
  botOpinion: BotOpinion | null;
  sessionOpinion: SessionOpinion | null;
  botStatusSummary: string | null;
  counts: BotMemoryPanelCounts;
}

const MEMORY_PANEL_LIMIT = 100;
const OPINION_REASON_LIMIT = 4;

function opinionScopeKey(botId: string | null | undefined): string {
  return botId ?? "__default__";
}

function clampOpinionScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
}

function opinionBandFromScore(score: number): SessionOpinion["band"] {
  const clamped = clampOpinionScore(score);
  if (clamped >= 68) return "trusting";
  if (clamped <= 34) return "guarded";
  return "warming";
}

function botOpinionBandFromScore(score: number): BotOpinion["band"] {
  const clamped = clampOpinionScore(score);
  if (clamped >= 78) return "bonded";
  if (clamped >= 52) return "open";
  if (clamped >= 28) return "careful";
  return "wounded";
}

function botOpinionBoundaryFromScore(score: number): BotOpinion["boundaryLevel"] {
  const clamped = clampOpinionScore(score);
  if (clamped <= 22) return "firm";
  if (clamped <= 42) return "gentle";
  return "none";
}

function normalizeOpinionTrend(value: string): OpinionTrend {
  if (value === "up" || value === "down" || value === "steady") return value;
  return "steady";
}

function normalizeSessionOpinionBand(value: string, score: number): SessionOpinion["band"] {
  if (value === "guarded" || value === "warming" || value === "trusting") return value;
  return opinionBandFromScore(score);
}

function normalizeBotOpinionBand(value: string, score: number): BotOpinion["band"] {
  if (value === "wounded" || value === "careful" || value === "open" || value === "bonded") {
    return value;
  }
  return botOpinionBandFromScore(score);
}

function normalizeBotOpinionBoundary(
  value: string,
  score: number
): BotOpinion["boundaryLevel"] {
  if (value === "none" || value === "gentle" || value === "firm") return value;
  return botOpinionBoundaryFromScore(score);
}

function parseRecentOpinionReasons(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, OPINION_REASON_LIMIT);
  } catch {
    return [];
  }
}

function parseSourceMessageIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function memoryCategory(value: string | null | undefined): MemoryCategory {
  if (value === "user" || value === "bot_relation" || value === "general") return value;
  return "general";
}

function memoryTier(value: string | null | undefined): MemoryTier {
  if (value === "long_term" || value === "short_term") return value;
  return "short_term";
}

function memorySource(value: string | null | undefined): MemorySource {
  if (value === "inferred" || value === "compiled" || value === "about_you") return value;
  return "direct";
}

function decryptMemoryRow(row: MemoryPanelRow, userId: string, userKey: Buffer): UserMemory {
  const payload = decryptJson(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
    },
    userKey
  ) as { text?: string };
  const text = normalizeMemoryDisplayText(payload.text ?? "");
  const source = memorySource(row.source);
  const category = memoryCategory(row.category);
  const tier = memoryTier(row.tier);
  const durability = normalizeMemoryDurability(row.durability, text);
  return {
    id: row.id,
    userId,
    conversationId: row.conversation_id ?? undefined,
    botId: row.bot_id ?? undefined,
    createdAt: row.created_at,
    confidence: row.confidence,
    category,
    tier,
    source,
    certainty: row.certainty ?? row.confidence,
    durability,
    sourceMessageIds: parseSourceMessageIds(row.source_message_ids),
    text,
  };
}

function readSessionOpinionForBot(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string
): SessionOpinion | null {
  const row = db
    .prepare(
      `SELECT score, band, trend, last_reason, recent_reasons, updated_at
       FROM session_opinions
       WHERE user_id = ? AND conversation_id = ? AND bot_scope_key = ?
       LIMIT 1`
    )
    .get(userId, conversationId, opinionScopeKey(botId)) as SessionOpinionRow | undefined;
  if (!row) return null;
  const score = Math.round(clampOpinionScore(row.score));
  return {
    score,
    band: normalizeSessionOpinionBand(row.band, score),
    trend: normalizeOpinionTrend(row.trend),
    lastReason: row.last_reason || "No opinion shift yet.",
    recentReasons: parseRecentOpinionReasons(row.recent_reasons),
    updatedAt: row.updated_at,
  };
}

function readBotOpinionForBot(
  db: DatabaseSync,
  userId: string,
  botId: string
): BotOpinion | null {
  const row = db
    .prepare(
      `SELECT score, band, boundary_level, trend, last_reason, recent_reasons, repair_count, updated_at
       FROM bot_opinions
       WHERE user_id = ? AND bot_scope_key = ?
       LIMIT 1`
    )
    .get(userId, opinionScopeKey(botId)) as BotOpinionRow | undefined;
  if (!row) return null;
  const score = Math.round(clampOpinionScore(row.score));
  return {
    score,
    band: normalizeBotOpinionBand(row.band, score),
    boundaryLevel: normalizeBotOpinionBoundary(row.boundary_level, score),
    trend: normalizeOpinionTrend(row.trend),
    lastReason: row.last_reason || "No long-term relationship shift yet.",
    recentReasons: parseRecentOpinionReasons(row.recent_reasons),
    repairCount: Math.max(0, Math.round(row.repair_count ?? 0)),
    updatedAt: row.updated_at,
  };
}

function createEmptyCounts(): BotMemoryPanelCounts {
  return {
    total: 0,
    visible: 0,
    protectedAboutYou: 0,
    bySource: {
      direct: 0,
      inferred: 0,
      compiled: 0,
      about_you: 0,
    },
    byTier: {
      short_term: 0,
      long_term: 0,
    },
    byCategory: {
      general: 0,
      user: 0,
      bot_relation: 0,
    },
  };
}

function buildMemoryPanelCounts(
  memories: UserMemory[],
  aboutYouMemories: UserMemory[]
): BotMemoryPanelCounts {
  const counts = createEmptyCounts();
  const allMemories = [...memories, ...aboutYouMemories];
  counts.total = allMemories.length;
  counts.visible = memories.length;
  counts.protectedAboutYou = aboutYouMemories.length;
  for (const memory of allMemories) {
    const source = memorySource(memory.source);
    const tier = memoryTier(memory.tier);
    const category = memoryCategory(memory.category);
    counts.bySource[source] += 1;
    counts.byTier[tier] += 1;
    counts.byCategory[category] += 1;
  }
  return counts;
}

export function loadBotMemoryPanelPayload(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  botId: string;
  conversationId?: string | null;
  limit?: number;
}): BotMemoryPanelPayload {
  const { db, userId, userKey, botId } = args;
  const bot = db
    .prepare("SELECT id FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { id?: string } | undefined;
  if (!bot?.id) {
    throw new HttpError(404, "Bot not found.");
  }

  const conversationId = args.conversationId?.trim() || null;
  let sessionOpinion: SessionOpinion | null = null;
  if (conversationId) {
    const conversation = db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .get(conversationId, userId) as { id?: string } | undefined;
    if (!conversation?.id) {
      throw new HttpError(404, "Conversation not found.");
    }
    sessionOpinion = readSessionOpinionForBot(db, userId, conversationId, botId);
  }

  const limit = Math.max(1, Math.min(MEMORY_PANEL_LIMIT, Math.floor(args.limit ?? MEMORY_PANEL_LIMIT)));
  const rows = db
    .prepare(
      `SELECT id, conversation_id, bot_id, confidence, category, tier, durability, source, certainty,
              source_message_ids, ciphertext, iv, tag, created_at
       FROM memories
       WHERE user_id = ? AND bot_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, botId, limit) as unknown as MemoryPanelRow[];

  const decrypted = rows.map((row) => decryptMemoryRow(row, userId, userKey));
  const normalMemories = filterConflictingMemories(
    decrypted.filter((memory) => memory.source !== "about_you")
  );
  const aboutYouMemories = filterConflictingMemories(
    decrypted.filter((memory) => memory.source === "about_you")
  );

  return {
    botId,
    memories: normalMemories,
    aboutYouMemories,
    botOpinion: readBotOpinionForBot(db, userId, botId),
    sessionOpinion,
    botStatusSummary: getLatestSandboxBotStatusSummary(db, userId, botId),
    counts: buildMemoryPanelCounts(normalMemories, aboutYouMemories),
  };
}
