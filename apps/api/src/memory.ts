import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import { embedTextLocal, fallbackEmbedding } from "./providers.ts";
import type { MemoryCategory, MemorySource, MemoryTier, UserMemory } from "@localai/shared";
import {
  classifyMemoryCategoryFromText,
  memoryLongTermScore as sharedMemoryLongTermScore,
  memoryQualifiesLongTerm as sharedMemoryQualifiesLongTerm,
} from "@localai/shared";
import type { MemoryCandidate } from "./memory-extraction.ts";
import {
  analyzeMemoryIntent,
  extractBotPreferredAddressMemoryCandidates,
  estimateMemoryDurability,
  extractBotJudgmentMemoryCandidates,
  extractCoffeeObserverMemoryCandidates,
  extractMemoryCandidates,
} from "./memory-extraction.ts";

export {
  analyzeMemoryIntent,
  extractBotPreferredAddressMemoryCandidates,
  extractCoffeeObserverMemoryCandidates,
  extractBotJudgmentMemoryCandidates,
  extractMemoryCandidates,
};

interface StoredMemoryPayload {
  text: string;
  embedding: number[];
}

interface DevSeedMemoryOptions {
  randomizeAcrossBots?: boolean;
  random?: () => number;
  source?: "direct" | "inferred" | "compiled" | "about_you";
  certainty?: number;
  category?: MemoryCategory;
  tier?: MemoryTier;
  durability?: number;
}

type MemoryRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  bot_id: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  category: MemoryCategory;
  tier: MemoryTier;
  durability: number | null;
  source: "direct" | "inferred" | "compiled" | "about_you";
  certainty: number | null;
  source_message_ids: string;
  created_at: string;
};

interface PersistMemoryOptions {
  source?: "direct" | "inferred" | "compiled" | "about_you";
  certainty?: number;
  category?: MemoryCategory;
  tier?: MemoryTier;
  durability?: number;
  sourceMessageIds?: string[];
}

interface RestoreMemoryOptions {
  conversationId?: string | null;
  botId?: string | null;
  text: string;
  confidence?: number;
  category?: MemoryCategory;
  tier?: MemoryTier;
  durability?: number;
  source?: "direct" | "inferred" | "compiled" | "about_you";
  certainty?: number;
  sourceMessageIds?: string[];
}

interface StoredMemoryWithEmbedding extends UserMemory {
  source: "direct" | "inferred" | "compiled" | "about_you";
  certainty: number;
  durability: number;
  sourceMessageIds: string[];
  embedding: number[];
}

interface MemoryCulminationResult {
  compiledMemory: UserMemory;
  deletedIds: Set<string>;
}

type MemorySourceLinkRow = {
  id: string;
  source_message_ids: string;
};

type ComparableMemory = Pick<
  UserMemory,
  "id" | "text" | "confidence" | "createdAt"
>;

const SINGLE_VALUE_MEMORY_SUBJECT_CUES = [
  "favorite",
  "favourite",
  "preferred",
  "default",
  "current",
  "name",
] as const;

const MEMORY_CUE_PREFIX_PATTERN =
  /^(?:please\s+)?(?:(?:do\s+not|don't)\s+forget(?:\s+that)?|remember\s+that|keep\s+in\s+mind(?:\s+that)?|make\s+a\s+note(?:\s+that)?)\s+/;

const CULMINATION_MIN_EVIDENCE = 3;
const CULMINATION_MIN_AVERAGE_CERTAINTY = 0.82;
const CULMINATION_MIN_SIMILARITY = 0.55;
const CULMINATION_CONTRADICTION_SIMILARITY = 0.78;
const CULMINATION_LOOKBACK_LIMIT = 80;
const CULMINATION_MAX_DETAILS = 4;
export const ABOUT_YOU_MEMORY_SOURCE = "about_you";
export const DEMOTED_LONG_TERM_CONFIDENCE = 0.34;
const MEMORY_TARGET_LOOKBACK_LIMIT = 20;
const MEMORY_TARGET_SCORE_THRESHOLD = 0.55;
const SAME_CONVERSATION_MEMORY_BOOST = 0.05;
const RECENT_MEMORY_BOOST = 0.02;
const RECENT_MEMORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MEMORY_TARGET_TOKEN_BOOST = 0.3;
const DIRECT_MEMORY_INITIAL_CONFIDENCE_DISCOUNT = 0.08;
const DIRECT_MEMORY_INITIAL_CONFIDENCE_MIN = 0.45;
const DIRECT_MEMORY_REINFORCE_CONFIDENCE_BOOST = 0.14;
const DIRECT_MEMORY_REINFORCE_DURABILITY_BOOST = 0.06;
const DIRECT_MEMORY_REINFORCE_CERTAINTY_BOOST = 0.12;
const MEMORY_TARGET_STOP_WORDS = new Set([
  "about",
  "actually",
  "forget",
  "ignore",
  "mind",
  "never",
  "nevermind",
  "said",
  "that",
  "the",
  "what",
]);

const DEV_SEED_MEMORY_TEXTS = [
  "The user likes surreal but calming interface details.",
  "The user prefers short answers when testing UI changes.",
  "The user enjoys soft neon colors against dark panels.",
  "The user likes playful interactions that still feel real.",
  "The user prefers controls that can be understood without instructions.",
  "The user enjoys memory bubbles that feel physical and alive.",
  "The user likes bots to develop distinct visual identities.",
  "The user prefers gentle motion over abrupt state changes.",
  "The user enjoys compact panels that still breathe on mobile.",
  "The user likes developer tools that seed realistic test data.",
] as const;

export function normalizeMemoryCategory(
  category: MemoryCategory | string | null | undefined,
  text = ""
): MemoryCategory {
  const fromText = classifyMemoryCategoryFromText(text);
  if (category === "general" || category === "user" || category === "bot_relation") {
    if (category === "user" && fromText === "general") {
      return "general";
    }
    return category;
  }
  return fromText;
}

function clampMemoryDurability(durability: number): number {
  return Math.max(0, Math.min(1, durability));
}

export function memoryTierForConfidence(confidence: number): MemoryTier {
  return memoryQualifiesLongTerm(confidence, confidence, 0)
    ? "long_term"
    : "short_term";
}

export function normalizeMemoryDurability(
  durability: number | null | undefined,
  text = ""
): number {
  const estimated = estimateMemoryDurability(text);
  if (typeof durability === "number" && Number.isFinite(durability)) {
    return clampMemoryDurability(Math.max(durability, estimated));
  }
  return estimated;
}

function explicitMemoryDurability(durability: number | undefined): number | undefined {
  return typeof durability === "number" && Number.isFinite(durability)
    ? clampMemoryDurability(durability)
    : undefined;
}

export function memoryLongTermScore(
  confidence: number,
  certainty = confidence,
  durability = 0
): number {
  return sharedMemoryLongTermScore(confidence, certainty, durability);
}

export function memoryQualifiesLongTerm(
  confidence: number,
  certainty = confidence,
  durability = 0,
  source: MemorySource | string | null = "direct"
): boolean {
  return sharedMemoryQualifiesLongTerm({ confidence, certainty, durability, source });
}

export function normalizeMemoryTier(
  tier: MemoryTier | string | null | undefined,
  confidence: number,
  certainty = confidence,
  durability = 0,
  source: MemorySource | string | null = "direct"
): MemoryTier {
  if (tier === "short_term") return "short_term";
  return memoryQualifiesLongTerm(confidence, certainty, durability, source)
    ? "long_term"
    : "short_term";
}

function normalizedMemoryText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(MEMORY_CUE_PREFIX_PATTERN, "")
    .trim();
}

export function hasMemoryTextForBot(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  botId: string | null,
  text: string
): boolean {
  const normalizedTarget = normalizedMemoryText(text);
  if (!normalizedTarget) return false;
  const rows = botId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND bot_id = ?
        ORDER BY created_at DESC
        LIMIT 200
      `).all(userId, botId) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND bot_id IS NULL
        ORDER BY created_at DESC
        LIMIT 200
      `).all(userId) as MemoryRow[];
  return rows.some((row) => normalizedMemoryText(decryptMemoryRow(row, userKey).text) === normalizedTarget);
}

function normalizeSourceMessageIds(sourceMessageIds?: string[]): string[] {
  const seen = new Set<string>();
  for (const id of sourceMessageIds ?? []) {
    const trimmed = id.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isHighConfidenceDirectMemory(candidateConfidence: number): boolean {
  return Number.isFinite(candidateConfidence) && candidateConfidence >= 0.95;
}

function initialStoredConfidence(source: string, candidateConfidence: number): number {
  if (source !== "direct" || isHighConfidenceDirectMemory(candidateConfidence)) {
    return clampUnit(candidateConfidence);
  }
  return clampUnit(
    Math.max(
      DIRECT_MEMORY_INITIAL_CONFIDENCE_MIN,
      candidateConfidence - DIRECT_MEMORY_INITIAL_CONFIDENCE_DISCOUNT
    )
  );
}

function parseSourceMessageIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeSourceMessageIds(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : []
    );
  } catch {
    return [];
  }
}

function sourceMessageIdsJson(sourceMessageIds?: string[]): string {
  return JSON.stringify(normalizeSourceMessageIds(sourceMessageIds));
}

function sourceIdsOverlap(raw: string, targetIds: Set<string>): boolean {
  return parseSourceMessageIds(raw).some((id) => targetIds.has(id));
}

function getSingleValueMemoryKey(text: string): string | null {
  const normalized = normalizedMemoryText(text);
  const preferredNameMatch = normalized.match(
    /^you\s+(?:prefer|want)(?:\s+to)?\s+be\s+(?:called|referred\s+to\s+as)\s+(.+)$/
  );
  const preferredNameWithLeadMatch = normalized.match(
    /^([a-z0-9][a-z0-9'\-]*(?:\s+[a-z0-9][a-z0-9'\-]*){0,2})\s+(?:prefers|wants)(?:\s+to)?\s+be\s+(?:called|referred\s+to\s+as)\s+(.+)$/
  );
  if (preferredNameMatch?.[1]) {
    return "single-value:preferred-name:self";
  }
  const thirdPersonSubject = preferredNameWithLeadMatch?.[1]?.trim();
  if (thirdPersonSubject) {
    return `single-value:preferred-name:${thirdPersonSubject}`;
  }
  const match = normalized.match(
    /^(?:my|your|the user's)\s+(.+?)\s+(?:is|are|was|were)\s+.+$/
  );
  if (!match) return null;

  const subject = match[1]?.trim();
  if (!subject) return null;

  const isSingleValueSubject = SINGLE_VALUE_MEMORY_SUBJECT_CUES.some((cue) =>
    subject.split(/\s+/).includes(cue)
  );

  return isSingleValueSubject ? `single-value:${subject}` : null;
}

function culminationCertainty(memory: Pick<UserMemory, "confidence" | "certainty">): number {
  const certainty = Number.isFinite(memory.certainty)
    ? memory.certainty as number
    : memory.confidence;
  return Math.max(0, Math.min(1, certainty));
}

function getCulminationTopicKey(text: string): string | null {
  if (getSingleValueMemoryKey(text)) return null;

  const normalized = normalizedMemoryText(text);
  const match = normalized.match(
    /^(?:(?:.+?)\s+remembers\s+)?(?:the user|user|i|you)\s+(?:generally\s+|usually\s+|often\s+)?(like|likes|enjoy|enjoys|prefer|prefers|love|loves|value|values|appreciate|appreciates|care about|cares about|dislike|dislikes|hate|hates|avoid|avoids|want|wants|need|needs|use|uses|work with|works with)\b/
  );
  const verb = match?.[1];
  if (!verb) return null;

  const positive = ["like", "likes", "enjoy", "enjoys", "prefer", "prefers", "love", "loves", "value", "values", "appreciate", "appreciates", "care about", "cares about"];
  const negative = ["dislike", "dislikes", "hate", "hates", "avoid", "avoids"];
  const desire = ["want", "wants", "need", "needs"];

  if (positive.includes(verb)) return "preference:positive";
  if (negative.includes(verb)) return "preference:negative";
  if (desire.includes(verb)) return "need";
  return "usage";
}

function oppositeCulminationTopicKey(key: string): string | null {
  if (key === "preference:positive") return "preference:negative";
  if (key === "preference:negative") return "preference:positive";
  return null;
}

function extractCulminationDetail(text: string): string {
  const stripped = text
    .trim()
    .replace(
      /^(?:please[\s,]+)?(?:(?:do\s+not|don't)[\s,]+forget(?:[\s,]+that)?|remember(?:[\s,]+that)?|please[\s,]+remember|keep[\s,]+in[\s,]+mind(?:[\s,]+that)?|make[\s,]+a[\s,]+note(?:[\s,]+that)?)[\s,]+/i,
      ""
    );
  const trimmed = stripped.trim().replace(/[.!?]+$/, "");
  const match = trimmed.match(
    /^(?:(?:.+?)\s+remembers\s+)?(?:the user|user|i|you)\s+(?:generally\s+|usually\s+|often\s+)?(?:like|likes|enjoy|enjoys|prefer|prefers|love|loves|value|values|appreciate|appreciates|care about|cares about|dislike|dislikes|hate|hates|avoid|avoids|want|wants|need|needs|use|uses|work with|works with)\s+(.+)$/i
  );
  return (match?.[1] ?? trimmed).trim();
}

function formatCulminationList(details: string[]): string {
  if (details.length <= 1) return details[0] ?? "";
  if (details.length === 2) return `${details[0]} and ${details[1]}`;
  return `${details.slice(0, -1).join(", ")}, and ${details[details.length - 1]}`;
}

function buildCompiledMemoryText(topicKey: string, memories: StoredMemoryWithEmbedding[]): string {
  const details: string[] = [];
  const seen = new Set<string>();
  for (const memory of memories) {
    const detail = extractCulminationDetail(memory.text);
    const normalized = normalizedMemoryText(detail);
    if (!detail || seen.has(normalized)) continue;
    seen.add(normalized);
    details.push(detail);
    if (details.length >= CULMINATION_MAX_DETAILS) break;
  }

  const list = formatCulminationList(details);
  if (topicKey === "preference:negative") {
    return `You consistently dislike or avoid ${list}.`;
  }
  if (topicKey === "need") {
    return `You consistently want or need ${list}.`;
  }
  if (topicKey === "usage") {
    return `You consistently use or work with ${list}.`;
  }
  return `You consistently like or value ${list}.`;
}

function memoryConfidence(memory: ComparableMemory): number {
  return Number.isFinite(memory.confidence) ? memory.confidence : 0;
}

function memoryCreatedAtMs(memory: ComparableMemory): number {
  const createdAtMs = new Date(memory.createdAt).getTime();
  return Number.isFinite(createdAtMs) ? createdAtMs : 0;
}

function compareMemoryPriority(a: ComparableMemory, b: ComparableMemory): number {
  const confidenceDelta = memoryConfidence(a) - memoryConfidence(b);
  if (confidenceDelta !== 0) return confidenceDelta;

  return memoryCreatedAtMs(a) - memoryCreatedAtMs(b);
}

export function filterConflictingMemories<T extends ComparableMemory>(
  memories: T[]
): T[] {
  const groups = new Map<string, T[]>();

  for (const memory of memories) {
    const key = getSingleValueMemoryKey(memory.text);
    if (!key) continue;

    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }

  const hiddenIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const winner = group.reduce((best, memory) =>
      compareMemoryPriority(memory, best) > 0 ? memory : best
    );
    for (const memory of group) {
      if (memory.id !== winner.id) {
        hiddenIds.add(memory.id);
      }
    }
  }

  return memories.filter((memory) => !hiddenIds.has(memory.id));
}

export function deleteOrphanedBotMemories(
  db: DatabaseSync,
  userId: string
): number {
  const result = db.prepare(`
    DELETE FROM memories
    WHERE user_id = ?
      AND bot_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM bots
        WHERE bots.id = memories.bot_id
          AND bots.user_id = memories.user_id
      )
      AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'
  `).run(userId);

  return Number(result.changes ?? 0);
}

export function memorySourceMessageIds(memory: UserMemory): string[] {
  return normalizeSourceMessageIds(memory.sourceMessageIds);
}

export function hasLongTermUserMemoriesForBot(
  db: DatabaseSync,
  userId: string,
  botId: string
): boolean {
  const row = db.prepare(
    `SELECT 1 AS exists_flag
     FROM memories
     WHERE user_id = ?
       AND bot_id = ?
       AND category = 'user'
       AND COALESCE(tier, 'short_term') = 'long_term'
     LIMIT 1`
  ).get(userId, botId) as { exists_flag?: number } | undefined;
  return Boolean(row);
}

export function hasAboutYouMemoryForBot(
  db: DatabaseSync,
  userId: string,
  botId: string
): boolean {
  const row = db.prepare(
    `SELECT 1 AS exists_flag
     FROM memories
     WHERE user_id = ?
       AND bot_id = ?
       AND COALESCE(source, 'direct') = '${ABOUT_YOU_MEMORY_SOURCE}'
     LIMIT 1`
  ).get(userId, botId) as { exists_flag?: number } | undefined;
  return Boolean(row);
}

export function deleteMemoriesForBotScope(
  db: DatabaseSync,
  userId: string,
  botId: string | null
): number {
  const trimmedBotId =
    typeof botId === "string" && botId.trim().length > 0 ? botId.trim() : null;
  const result = trimmedBotId
    ? db.prepare("DELETE FROM memories WHERE user_id = ? AND bot_id = ?").run(userId, trimmedBotId)
    : db.prepare("DELETE FROM memories WHERE user_id = ? AND bot_id IS NULL").run(userId);
  return Number(result.changes ?? 0);
}

function firstNameFromDisplayName(displayName: string | null | undefined): string | null {
  const trimmed = typeof displayName === "string" ? displayName.trim() : "";
  if (!trimmed) return null;
  const firstToken = trimmed.split(/\s+/)[0]?.trim() ?? "";
  const cleaned = firstToken.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'-]+$/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

export function buildInitialAboutYouMemoryText(
  displayName: string | null | undefined
): string {
  const firstName = firstNameFromDisplayName(displayName);
  if (firstName) {
    return `You prefer to be called ${firstName}.`;
  }
  return "You prefer to be called by your first name.";
}

export function listMemoryIdsLinkedToMessages(
  db: DatabaseSync,
  userId: string,
  messageIds: string[]
): string[] {
  const targetIds = new Set(normalizeSourceMessageIds(messageIds));
  if (targetIds.size === 0) return [];

  const rows = db
    .prepare("SELECT id, source_message_ids FROM memories WHERE user_id = ?")
    .all(userId) as MemorySourceLinkRow[];

  return rows
    .filter((row) => sourceIdsOverlap(row.source_message_ids, targetIds))
    .map((row) => row.id);
}

export function deleteMemoriesLinkedToMessages(
  db: DatabaseSync,
  userId: string,
  messageIds: string[]
): number {
  const linkedIds = listMemoryIdsLinkedToMessages(db, userId, messageIds);
  if (linkedIds.length === 0) return 0;

  const placeholders = linkedIds.map(() => "?").join(", ");
  const result = db.prepare(
    `DELETE FROM memories
     WHERE user_id = ?
       AND id IN (${placeholders})
       AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'
       AND COALESCE(tier, 'short_term') != 'long_term'`
  ).run(userId, ...linkedIds);

  return Number(result.changes ?? 0);
}

interface DeleteMemoryOptions {
  allowLongTerm?: boolean;
  /** User explicitly removed an “about you” line from the Memories panel. */
  allowAboutYou?: boolean;
}

export function deleteMemoryById(
  db: DatabaseSync,
  userId: string,
  memoryId: string,
  options: DeleteMemoryOptions = {}
): boolean {
  const allowAboutYou = options.allowAboutYou ? 1 : 0;
  const allowLongTerm = options.allowLongTerm ? 1 : 0;
  const result = db
    .prepare(
      `DELETE FROM memories
       WHERE id = ?
         AND user_id = ?
         AND (? = 1 OR COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}')
         AND (? = 1 OR COALESCE(tier, 'short_term') != 'long_term')`
    )
    .run(memoryId, userId, allowAboutYou, allowLongTerm);
  return Number(result.changes ?? 0) > 0;
}

export function demoteMemoryToShortTerm(
  db: DatabaseSync,
  userId: string,
  memoryId: string,
  confidence = DEMOTED_LONG_TERM_CONFIDENCE
): boolean {
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const result = db
    .prepare(
      `UPDATE memories
       SET tier = 'short_term',
           confidence = ?,
           certainty = ?
       WHERE id = ?
         AND user_id = ?
         AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'`
    )
    .run(clampedConfidence, clampedConfidence, memoryId, userId);
  return Number(result.changes ?? 0) > 0;
}

export async function restoreMemory(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  options: RestoreMemoryOptions
): Promise<UserMemory> {
  let embedding: number[];
  try {
    embedding = await embedTextLocal(options.text);
  } catch {
    embedding = fallbackEmbedding(options.text);
  }

  const id = randomId(12);
  const createdAt = new Date().toISOString();
  const source = options.source ?? "direct";
  const confidence = options.confidence ?? options.certainty ?? 0.9;
  const certainty = options.certainty ?? confidence;
  const category = normalizeMemoryCategory(options.category, options.text);
  const durability = explicitMemoryDurability(options.durability) ?? normalizeMemoryDurability(undefined, options.text);
  const tier = normalizeMemoryTier(options.tier, confidence, certainty, durability, source);
  const sourceMessageIds = normalizeSourceMessageIds(options.sourceMessageIds);
  const encrypted = encryptJson(
    { text: options.text, embedding } as unknown as Record<string, unknown>,
    userKey
  );
  db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    options.conversationId ?? null,
    options.botId ?? null,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    confidence,
    category,
    tier,
    durability,
    source,
    certainty,
    sourceMessageIdsJson(sourceMessageIds),
    createdAt
  );
  return {
    id,
    userId,
    conversationId: options.conversationId ?? undefined,
    botId: options.botId ?? undefined,
    confidence,
    category,
    tier,
    durability,
    source,
    certainty,
    sourceMessageIds,
    createdAt,
    text: options.text,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return -1;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB) || 1;
  return dot / denom;
}

function decryptMemoryRow(row: MemoryRow, userKey: Buffer): StoredMemoryWithEmbedding {
  const decrypted = decryptJson(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
    },
    userKey
  ) as unknown as StoredMemoryPayload;

  const embedding = Array.isArray(decrypted.embedding)
    ? decrypted.embedding.filter((value): value is number => typeof value === "number")
    : fallbackEmbedding(decrypted.text);

  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    botId: row.bot_id ?? undefined,
    confidence: row.confidence,
    category: normalizeMemoryCategory(row.category, decrypted.text),
    tier: row.tier === "long_term" || row.tier === "short_term"
      ? row.tier
      : normalizeMemoryTier(
        undefined,
        row.confidence,
        row.certainty ?? row.confidence,
        row.durability ?? undefined,
        row.source
      ),
    durability: normalizeMemoryDurability(row.durability, decrypted.text),
    source: row.source,
    certainty: row.certainty ?? row.confidence,
    sourceMessageIds: parseSourceMessageIds(row.source_message_ids),
    createdAt: row.created_at,
    text: decrypted.text,
    embedding,
  };
}

function loadSameScopeDirectMemories(
  db: DatabaseSync,
  userId: string,
  botId: string | null,
  userKey: Buffer
): StoredMemoryWithEmbedding[] {
  const rows = botId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND bot_id = ? AND source = 'direct' AND COALESCE(tier, 'short_term') != 'long_term'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, botId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND bot_id IS NULL AND source = 'direct' AND COALESCE(tier, 'short_term') != 'long_term'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[];

  return rows.map((row) => decryptMemoryRow(row, userKey));
}

async function resolveMemoryCulmination(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null,
  newMemory: StoredMemoryWithEmbedding,
  userKey: Buffer
): Promise<MemoryCulminationResult | null> {
  if (newMemory.source !== "direct") return null;

  const topicKey = getCulminationTopicKey(newMemory.text);
  if (!topicKey) return null;

  const sameScopeMemories = loadSameScopeDirectMemories(db, userId, botId, userKey);
  const aligned = sameScopeMemories.filter((memory) => {
    if (getCulminationTopicKey(memory.text) !== topicKey) return false;
    return cosineSimilarity(newMemory.embedding, memory.embedding) >= CULMINATION_MIN_SIMILARITY;
  });

  if (aligned.length < CULMINATION_MIN_EVIDENCE) return null;

  const averageCertainty =
    aligned.reduce((sum, memory) => sum + culminationCertainty(memory), 0) / aligned.length;
  if (averageCertainty < CULMINATION_MIN_AVERAGE_CERTAINTY) return null;

  const oppositeKey = oppositeCulminationTopicKey(topicKey);
  if (oppositeKey) {
    const hasContradiction = sameScopeMemories.some((memory) => {
      if (getCulminationTopicKey(memory.text) !== oppositeKey) return false;
      return aligned.some(
        (alignedMemory) =>
          cosineSimilarity(alignedMemory.embedding, memory.embedding) >=
          CULMINATION_CONTRADICTION_SIMILARITY
      );
    });
    if (hasContradiction) return null;
  }

  const compiledText = buildCompiledMemoryText(
    topicKey,
    aligned.sort((a, b) => memoryCreatedAtMs(a) - memoryCreatedAtMs(b))
  );
  let compiledEmbedding: number[];
  try {
    compiledEmbedding = await embedTextLocal(compiledText);
  } catch {
    compiledEmbedding = fallbackEmbedding(compiledText);
  }

  const confidence = Math.min(0.98, Math.max(0.86, averageCertainty + 0.04));
  const id = randomId(12);
  const createdAt = new Date().toISOString();
  const encrypted = encryptJson(
    { text: compiledText, embedding: compiledEmbedding } as unknown as Record<string, unknown>,
    userKey
  );
  const sourceMessageIds = normalizeSourceMessageIds(
    aligned.flatMap((memory) => memory.sourceMessageIds)
  );

  db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'compiled', ?, ?, ?)
  `).run(
    id,
    userId,
    conversationId,
    botId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    confidence,
    normalizeMemoryCategory(newMemory.category, compiledText),
    normalizeMemoryTier(undefined, confidence, confidence, newMemory.durability, "compiled"),
    newMemory.durability,
    confidence,
    sourceMessageIdsJson(sourceMessageIds),
    createdAt
  );

  const deletedIds = new Set(aligned.map((memory) => memory.id));
  const placeholders = [...deletedIds].map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM memories
     WHERE user_id = ?
       AND id IN (${placeholders})
       AND COALESCE(tier, 'short_term') != 'long_term'`
  ).run(userId, ...deletedIds);

  return {
    deletedIds,
    compiledMemory: {
      id,
      userId,
      conversationId,
      botId: botId ?? undefined,
      confidence,
      category: normalizeMemoryCategory(newMemory.category, compiledText),
      tier: normalizeMemoryTier(undefined, confidence, confidence, newMemory.durability, "compiled"),
      durability: newMemory.durability,
      source: "compiled",
      certainty: confidence,
      sourceMessageIds,
      createdAt,
      text: compiledText,
    },
  };
}

function extractPreferenceDetailForReinforcement(text: string): string {
  const detail = extractCulminationDetail(text);
  return normalizedMemoryText(detail);
}

function detailsAreCompatibleForReinforcement(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

function canReinforceExistingMemory(
  existing: StoredMemoryWithEmbedding,
  candidateText: string
): boolean {
  const existingSingleValueKey = getSingleValueMemoryKey(existing.text);
  const candidateSingleValueKey = getSingleValueMemoryKey(candidateText);
  if (existingSingleValueKey || candidateSingleValueKey) {
    return (
      existingSingleValueKey !== null &&
      candidateSingleValueKey !== null &&
      existingSingleValueKey === candidateSingleValueKey
    );
  }

  const existingTopic = getCulminationTopicKey(existing.text);
  const candidateTopic = getCulminationTopicKey(candidateText);
  if (!existingTopic || !candidateTopic || existingTopic !== candidateTopic) {
    return false;
  }

  const existingDetail = extractPreferenceDetailForReinforcement(existing.text);
  const candidateDetail = extractPreferenceDetailForReinforcement(candidateText);
  return detailsAreCompatibleForReinforcement(existingDetail, candidateDetail);
}

function loadScopeMemoriesForReinforcement(
  db: DatabaseSync,
  userId: string,
  botId: string | null,
  userKey: Buffer
): StoredMemoryWithEmbedding[] {
  const rows = botId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ?
          AND bot_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, botId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ?
          AND bot_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[];

  return rows.map((row) => decryptMemoryRow(row, userKey));
}

function pickReinforcementTarget(
  existingScopeMemories: StoredMemoryWithEmbedding[],
  candidateText: string
): StoredMemoryWithEmbedding | null {
  const compatible = existingScopeMemories.filter((memory) =>
    canReinforceExistingMemory(memory, candidateText)
  );
  if (compatible.length === 0) return null;
  return compatible.sort((a, b) => compareMemoryPriority(a, b)).at(-1) ?? null;
}

export async function persistMemoryCandidates(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null,
  candidates: MemoryCandidate[],
  userKey: Buffer,
  options: PersistMemoryOptions = {}
): Promise<UserMemory[]> {
  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let stored: UserMemory[] = [];
  const source = options.source ?? "direct";
  const sourceMessageIds = normalizeSourceMessageIds(options.sourceMessageIds);
  const scopeMemoriesForReinforcement =
    source === "direct"
      ? loadScopeMemoriesForReinforcement(db, userId, botId, userKey)
      : [];

  for (const candidate of candidates) {
    let embedding: number[];
    try {
      embedding = await embedTextLocal(candidate.text);
    } catch {
      embedding = fallbackEmbedding(candidate.text);
    }
    const payload: StoredMemoryPayload = { text: candidate.text, embedding };
    const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
    const id = randomId(12);
    const createdAt = new Date().toISOString();
    const category = normalizeMemoryCategory(options.category ?? candidate.category, candidate.text);
    const hasExplicitCertaintyOverride =
      typeof options.certainty === "number" && Number.isFinite(options.certainty);
    const candidateConfidence = hasExplicitCertaintyOverride
      ? clampUnit(candidate.confidence)
      : initialStoredConfidence(source, candidate.confidence);
    const certainty = options.certainty ?? candidateConfidence;
    const durability =
      explicitMemoryDurability(options.durability) ??
      normalizeMemoryDurability(candidate.durability, candidate.text);
    const target = source === "direct"
      ? pickReinforcementTarget(scopeMemoriesForReinforcement, candidate.text)
      : null;
    const tier = normalizeMemoryTier(options.tier, candidateConfidence, certainty, durability, source);
    if (target) {
      const mergedSourceMessageIds = normalizeSourceMessageIds([
        ...target.sourceMessageIds,
        ...sourceMessageIds,
      ]);
      const reinforcedConfidence = clampUnit(
        Math.max(target.confidence, candidateConfidence) + DIRECT_MEMORY_REINFORCE_CONFIDENCE_BOOST
      );
      const reinforcedCertainty = clampUnit(
        Math.max(target.certainty, certainty) + DIRECT_MEMORY_REINFORCE_CERTAINTY_BOOST
      );
      const reinforcedDurability = clampMemoryDurability(
        Math.max(target.durability, durability) + DIRECT_MEMORY_REINFORCE_DURABILITY_BOOST
      );
      const reinforcedTier = normalizeMemoryTier(
        options.tier,
        reinforcedConfidence,
        reinforcedCertainty,
        reinforcedDurability,
        source
      );
      db.prepare(`
        UPDATE memories
        SET conversation_id = ?,
            ciphertext = ?,
            iv = ?,
            tag = ?,
            confidence = ?,
            category = ?,
            tier = ?,
            durability = ?,
            source = ?,
            certainty = ?,
            source_message_ids = ?,
            created_at = ?
        WHERE id = ?
      `).run(
        conversationId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        reinforcedConfidence,
        category,
        reinforcedTier,
        reinforcedDurability,
        source,
        reinforcedCertainty,
        sourceMessageIdsJson(mergedSourceMessageIds),
        createdAt,
        target.id
      );
      const reinforcedMemory: StoredMemoryWithEmbedding = {
        ...target,
        conversationId,
        confidence: reinforcedConfidence,
        category,
        tier: reinforcedTier,
        durability: reinforcedDurability,
        source,
        certainty: reinforcedCertainty,
        sourceMessageIds: mergedSourceMessageIds,
        createdAt,
        text: candidate.text,
        embedding,
      };
      scopeMemoriesForReinforcement.unshift(reinforcedMemory);
      stored.push({
        id: reinforcedMemory.id,
        userId: reinforcedMemory.userId,
        conversationId: reinforcedMemory.conversationId,
        botId: reinforcedMemory.botId,
        confidence: reinforcedMemory.confidence,
        category: reinforcedMemory.category,
        tier: reinforcedMemory.tier,
        durability: reinforcedMemory.durability,
        source: reinforcedMemory.source,
        certainty: reinforcedMemory.certainty,
        sourceMessageIds: reinforcedMemory.sourceMessageIds,
        createdAt: reinforcedMemory.createdAt,
        text: reinforcedMemory.text,
      });
      continue;
    }
    insertMemory.run(
      id,
      userId,
      conversationId,
      botId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      candidateConfidence,
      category,
      tier,
      durability,
      source,
      certainty,
      sourceMessageIdsJson(sourceMessageIds),
      createdAt
    );
    const memory: StoredMemoryWithEmbedding = {
      id,
      userId,
      conversationId,
      botId: botId ?? undefined,
      confidence: candidateConfidence,
      category,
      tier,
      durability,
      source,
      certainty,
      sourceMessageIds,
      createdAt,
      text: candidate.text,
      embedding,
    };
    stored.push(memory);
    if (source === "direct") {
      scopeMemoriesForReinforcement.unshift(memory);
    }

    const culmination = await resolveMemoryCulmination(
      db,
      userId,
      conversationId,
      botId,
      memory,
      userKey
    );
    if (culmination) {
      stored = stored.filter((item) => !culmination.deletedIds.has(item.id));
      stored.push(culmination.compiledMemory);
    }
  }
  return stored;
}

export function createDevSeedMemories(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  count: number,
  botIds: string[],
  options: DevSeedMemoryOptions = {}
): number {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Memory seed count must be a positive integer.");
  }
  if (botIds.length === 0) {
    throw new Error("Create at least one bot before seeding memories.");
  }

  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
  `);
  const baseTime = Date.now();
  const targets = devSeedMemoryTargets(count, botIds, options);

  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const botId = targets[index];
      const template = DEV_SEED_MEMORY_TEXTS[index % DEV_SEED_MEMORY_TEXTS.length];
      const variant = Math.floor(index / DEV_SEED_MEMORY_TEXTS.length) + 1;
      const text = variant === 1 ? template : `${template} (${variant})`;
      const payload: StoredMemoryPayload = {
        text,
        embedding: fallbackEmbedding(text),
      };
      const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
      const confidence = 0.62 + (index % 7) * 0.05;
      const durability = explicitMemoryDurability(options.durability) ?? normalizeMemoryDurability(undefined, text);
      insertMemory.run(
        randomId(12),
        userId,
        botId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        confidence,
        options.category ?? "user",
        normalizeMemoryTier(options.tier, confidence, options.certainty ?? confidence, durability, options.source ?? "direct"),
        durability,
        options.source ?? "direct",
        options.certainty ?? confidence,
        new Date(baseTime + index).toISOString()
      );
    }
    db.exec("COMMIT");
    return targets.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function devSeedMemoryTargets(
  count: number,
  botIds: string[],
  options: DevSeedMemoryOptions
): string[] {
  if (!options.randomizeAcrossBots || botIds.length <= 1) {
    return Array.from({ length: count }, (_unused, index) => botIds[index % botIds.length]);
  }

  const random = options.random ?? Math.random;
  const shuffled = shuffleWithRandom(botIds, random);
  const leaveEmptyCount = shuffled.length >= 3 ? 1 : 0;
  const activeBotLimit = Math.max(1, Math.min(shuffled.length - leaveEmptyCount, count));
  const minActiveBots = Math.min(activeBotLimit, Math.max(1, Math.ceil(count / 3)));
  const activeBotCount =
    minActiveBots + Math.floor(random() * (activeBotLimit - minActiveBots + 1));
  const activeBots = shuffled.slice(0, activeBotCount);
  const counts = new Map(activeBots.map((botId) => [botId, 1]));
  const protectedSingleBot = activeBots.length > 1 ? activeBots[activeBots.length - 1] : null;
  let remaining = count - activeBots.length;

  while (remaining > 0) {
    const hasBotBelowThree = activeBots.some((botId) => (counts.get(botId) ?? 0) < 3);
    const belowThreeCandidates = hasBotBelowThree
      ? activeBots.filter((botId) => (counts.get(botId) ?? 0) < 3)
      : activeBots;
    const nonProtectedCapacity = activeBots
      .filter((botId) => botId !== protectedSingleBot)
      .reduce((sum, botId) => sum + Math.max(0, 3 - (counts.get(botId) ?? 0)), 0);
    const candidates = protectedSingleBot && remaining <= nonProtectedCapacity
      ? belowThreeCandidates.filter((botId) => botId !== protectedSingleBot)
      : belowThreeCandidates;
    const botId = candidates[Math.floor(random() * candidates.length)] ?? activeBots[0];
    counts.set(botId, (counts.get(botId) ?? 0) + 1);
    remaining -= 1;
  }

  return activeBots.flatMap((botId) =>
    Array.from({ length: counts.get(botId) ?? 0 }, () => botId)
  );
}

function shuffleWithRandom<T>(source: readonly T[], random: () => number): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function memoryTargetTerms(text: string): Set<string> {
  return new Set(
    normalizedMemoryText(text)
      .split(/\s+/)
      .filter((word) => word.length >= 4)
      .filter((word) => !MEMORY_TARGET_STOP_WORDS.has(word))
  );
}

function lexicalMemoryTargetBoost(cueText: string, memoryText: string): number {
  const cueTerms = memoryTargetTerms(cueText);
  if (cueTerms.size === 0) return 0;
  const memoryTerms = memoryTargetTerms(memoryText);
  let overlap = 0;
  for (const term of cueTerms) {
    if (memoryTerms.has(term)) overlap += 1;
  }
  return (overlap / cueTerms.size) * MEMORY_TARGET_TOKEN_BOOST;
}

async function embedWithFallback(text: string): Promise<number[]> {
  try {
    return await embedTextLocal(text);
  } catch {
    return fallbackEmbedding(text);
  }
}

export async function findMemoryByCue(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null,
  cueText: string,
  userKey: Buffer
): Promise<UserMemory | null> {
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND (bot_id IS NULL OR bot_id = ?)
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, normalizedBotId, MEMORY_TARGET_LOOKBACK_LIMIT) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND (bot_id IS NULL OR source = 'compiled')
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, MEMORY_TARGET_LOOKBACK_LIMIT) as MemoryRow[];
  if (rows.length === 0) return null;

  const cueEmbedding = await embedWithFallback(cueText);
  const now = Date.now();
  const best = rows
    .map((row) => {
      const memory = decryptMemoryRow(row, userKey);
      const createdAtMs = memoryCreatedAtMs(memory);
      const sameConversationBoost =
        memory.conversationId === conversationId ? SAME_CONVERSATION_MEMORY_BOOST : 0;
      const recentBoost =
        Number.isFinite(createdAtMs) && now - createdAtMs <= RECENT_MEMORY_WINDOW_MS
          ? RECENT_MEMORY_BOOST
          : 0;
      return {
        memory,
        score:
          cosineSimilarity(cueEmbedding, memory.embedding) +
          lexicalMemoryTargetBoost(cueText, memory.text) +
          sameConversationBoost +
          recentBoost,
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < MEMORY_TARGET_SCORE_THRESHOLD) return null;
  const { embedding: _embedding, ...memory } = best.memory;
  return memory;
}

export async function retrieveRelevantMemories(
  db: DatabaseSync,
  userId: string,
  query: string,
  userKey: Buffer,
  botId?: string | null,
  limit = 4
): Promise<UserMemory[]> {
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR source = 'compiled') ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];
  const queryEmbedding = await embedWithFallback(query);
  const scored = rows.map((row) => {
    const memory = decryptMemoryRow(row, userKey);
    return {
      ...memory,
      score: cosineSimilarity(queryEmbedding, memory.embedding)
    };
  });

  return filterConflictingMemories(scored)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _unused, embedding: _embedding, ...memory }) => memory);
}

export function retrieveRecentMemoriesForStarter(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  botId?: string | null,
  limit = 4
): UserMemory[] {
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR source = 'compiled') ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];

  return filterConflictingMemories(
    rows.map((row) => ({
      ...decryptMemoryRow(row, userKey),
      score: 0,
    }))
  )
    .slice(0, limit)
    .map(({ score: _unused, embedding: _embedding, ...memory }) => memory);
}

export function retrieveRecentBotMemoriesForStarter(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  botId: string,
  limit = 4
): UserMemory[] {
  const normalizedBotId = botId.trim();
  if (!normalizedBotId) return [];
  const rows = db
    .prepare(
      `SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
       FROM memories
       WHERE user_id = ?
         AND bot_id = ?
         AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(userId, normalizedBotId) as MemoryRow[];

  return filterConflictingMemories(
    rows.map((row) => ({
      ...decryptMemoryRow(row, userKey),
      score: 0,
    }))
  )
    .slice(0, limit)
    .map(({ score: _unused, embedding: _embedding, ...memory }) => memory);
}
