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
import {
  createMemoryAcquisitionReceipt,
  ensureMemoryEcologyMemorySchema,
  linkDerivedMemoryEvidence,
  materializeShortTermMemoryDecay,
  memoryEvidenceIds,
  memoryExpiryAt,
  readMemoryEcologySettings,
  memoryCandidatePassesAcquisition,
} from "./memory-ecology.ts";

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

type MemoryRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  bot_id: string | null;
  target_bot_id?: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  confidence: number;
  base_confidence?: number | null;
  lifecycle?: "short_term" | "long_term" | "derived" | null;
  last_reinforced_at?: string | null;
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
  targetBotId?: string | null;
  evidenceMemoryIds?: string[];
  createReceipt?: boolean;
  automatic?: boolean;
}

interface RestoreMemoryOptions {
  conversationId?: string | null;
  botId?: string | null;
  targetBotId?: string | null;
  text: string;
  confidence?: number;
  category?: MemoryCategory;
  tier?: MemoryTier;
  durability?: number;
  source?: "direct" | "inferred" | "compiled" | "about_you";
  certainty?: number;
  sourceMessageIds?: string[];
  evidenceMemoryIds?: string[];
  createReceipt?: boolean;
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

function normalizeMemoryTierForUser(
  db: DatabaseSync,
  userId: string,
  tier: MemoryTier | string | null | undefined,
  confidence: number,
  certainty: number,
  source: MemorySource | string | null,
): MemoryTier {
  if (source === "inferred") return "short_term";
  if (tier === "short_term") return "short_term";
  if (source === ABOUT_YOU_MEMORY_SOURCE) return "long_term";
  const settings = readMemoryEcologySettings(db, userId);
  const truthScore = (clampUnit(confidence) + clampUnit(certainty)) / 2;
  return truthScore >= settings.longTermPromotionThreshold
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
  return rows.some((row) => normalizedMemoryText(decryptMemoryRow(row, userKey, db).text) === normalizedTarget);
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
      AND (
        (
          bot_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM bots
            WHERE bots.id = memories.bot_id
              AND bots.user_id = memories.user_id
          )
        )
        OR (
          target_bot_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM bots
            WHERE bots.id = memories.target_bot_id
              AND bots.user_id = memories.user_id
          )
        )
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

export interface AppletSessionMemoryCleanupResult {
  deletedMemories: number;
  deletedReceipts: number;
  deletedEvidenceLinks: number;
  removedDerivedMemories: number;
}

/**
 * Revokes every memory acquired inside an applet session.
 *
 * New rows are owned by `conversation_id`; source-message and receipt matching
 * keep older Signal/Coffee rows cleanable after those provenance fields were
 * introduced. Unlike an ordinary message undo, session deletion intentionally
 * removes long-term and About You rows too: they would not exist without the
 * deleted experience.
 */
export function deleteMemoriesAcquiredDuringAppletSessions(
  db: DatabaseSync,
  userId: string,
  sessionIds: readonly string[],
  sourceMessageIds: readonly string[] = [],
): AppletSessionMemoryCleanupResult {
  const memoryColumns = new Set(
    (db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );
  if (memoryColumns.size === 0) {
    return {
      deletedMemories: 0,
      deletedReceipts: 0,
      deletedEvidenceLinks: 0,
      removedDerivedMemories: 0,
    };
  }

  ensureMemoryEcologyMemorySchema(db);
  const targetSessionIds = new Set(normalizeSourceMessageIds([...sessionIds]));
  const targetSourceIds = new Set(normalizeSourceMessageIds([...sourceMessageIds]));
  if (targetSessionIds.size === 0 && targetSourceIds.size === 0) {
    return {
      deletedMemories: 0,
      deletedReceipts: 0,
      deletedEvidenceLinks: 0,
      removedDerivedMemories: 0,
    };
  }

  const conversationSelect = memoryColumns.has("conversation_id")
    ? "conversation_id"
    : "NULL AS conversation_id";
  const sourceSelect = memoryColumns.has("source_message_ids")
    ? "source_message_ids"
    : "'[]' AS source_message_ids";
  const rows = db
    .prepare(
      `SELECT id, ${conversationSelect}, ${sourceSelect}
         FROM memories
        WHERE user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    conversation_id: string | null;
    source_message_ids: string;
  }>;
  const memoryIds = new Set(
    rows
      .filter(
        (row) =>
          (row.conversation_id != null && targetSessionIds.has(row.conversation_id)) ||
          sourceIdsOverlap(row.source_message_ids, targetSourceIds),
      )
      .map((row) => row.id),
  );

  const receiptRows = db
    .prepare(
      `SELECT id, memory_id, conversation_id
         FROM memory_acquisition_receipts
        WHERE user_id = ?`,
    )
    .all(userId) as Array<{
    id: string;
    memory_id: string;
    conversation_id: string | null;
  }>;
  for (const receipt of receiptRows) {
    if (receipt.conversation_id && targetSessionIds.has(receipt.conversation_id)) {
      memoryIds.add(receipt.memory_id);
    }
  }

  const deleteReceipt = db.prepare(
    "DELETE FROM memory_acquisition_receipts WHERE user_id = ? AND memory_id = ?",
  );
  const deleteEvidence = db.prepare(
    `DELETE FROM memory_evidence_links
      WHERE user_id = ? AND (inferred_memory_id = ? OR evidence_memory_id = ?)`,
  );
  const deleteMemory = db.prepare(
    "DELETE FROM memories WHERE user_id = ? AND id = ?",
  );
  let deletedReceipts = 0;
  let deletedEvidenceLinks = 0;
  let deletedMemories = 0;
  for (const memoryId of memoryIds) {
    deletedReceipts += Number(deleteReceipt.run(userId, memoryId).changes ?? 0);
    deletedEvidenceLinks += Number(
      deleteEvidence.run(userId, memoryId, memoryId).changes ?? 0,
    );
    deletedMemories += Number(deleteMemory.run(userId, memoryId).changes ?? 0);
  }

  const decay = materializeShortTermMemoryDecay(db, userId);
  deletedReceipts += Number(
    db
      .prepare(
        `DELETE FROM memory_acquisition_receipts
          WHERE user_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM memories
               WHERE memories.user_id = memory_acquisition_receipts.user_id
                 AND memories.id = memory_acquisition_receipts.memory_id
            )`,
      )
      .run(userId).changes ?? 0,
  );
  deletedEvidenceLinks += Number(
    db
      .prepare(
        `DELETE FROM memory_evidence_links
          WHERE user_id = ?
            AND (
              NOT EXISTS (
                SELECT 1 FROM memories
                 WHERE memories.user_id = memory_evidence_links.user_id
                   AND memories.id = memory_evidence_links.inferred_memory_id
              )
              OR NOT EXISTS (
                SELECT 1 FROM memories
                 WHERE memories.user_id = memory_evidence_links.user_id
                   AND memories.id = memory_evidence_links.evidence_memory_id
              )
            )`,
      )
      .run(userId).changes ?? 0,
  );

  return {
    deletedMemories,
    deletedReceipts,
    deletedEvidenceLinks,
    removedDerivedMemories: decay.removedDerived,
  };
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

export function readMemoryById(
  db: DatabaseSync,
  userId: string,
  memoryId: string,
  userKey: Buffer,
): UserMemory | null {
  materializeShortTermMemoryDecay(db, userId);
  const row = db
    .prepare(
      `SELECT id, user_id, conversation_id, bot_id, target_bot_id, ciphertext,
              iv, tag, confidence, base_confidence, category, tier, lifecycle,
              durability, source, certainty, source_message_ids,
              last_reinforced_at, created_at
         FROM memories
        WHERE id = ? AND user_id = ?`,
    )
    .get(memoryId, userId) as MemoryRow | undefined;
  if (!row) return null;
  const { embedding: _embedding, ...memory } = decryptMemoryRow(row, userKey, db);
  return memory;
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
           lifecycle = 'short_term',
           confidence = ?,
           base_confidence = ?,
           certainty = ?,
           last_reinforced_at = ?
       WHERE id = ?
         AND user_id = ?
         AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'`
    )
    .run(
      clampedConfidence,
      clampedConfidence,
      clampedConfidence,
      new Date().toISOString(),
      memoryId,
      userId,
    );
  return Number(result.changes ?? 0) > 0;
}

export async function restoreMemory(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  options: RestoreMemoryOptions
): Promise<UserMemory> {
  ensureMemoryEcologyMemorySchema(db);
  materializeShortTermMemoryDecay(db, userId);
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
  const tier = normalizeMemoryTierForUser(
    db,
    userId,
    options.tier,
    confidence,
    certainty,
    source,
  );
  const lifecycle = source === "inferred" ? "derived" : tier;
  const sourceMessageIds = normalizeSourceMessageIds(options.sourceMessageIds);
  const encrypted = encryptJson(
    { text: options.text, embedding } as unknown as Record<string, unknown>,
    userKey
  );
  db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, target_bot_id,
      ciphertext, iv, tag, confidence, base_confidence, category, tier,
      lifecycle, durability, source, certainty, source_message_ids,
      last_reinforced_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    options.conversationId ?? null,
    options.botId ?? null,
    options.targetBotId ?? null,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    confidence,
    confidence,
    category,
    tier,
    lifecycle,
    durability,
    source,
    certainty,
    sourceMessageIdsJson(sourceMessageIds),
    createdAt,
    createdAt
  );
  if (lifecycle === "derived" && (options.evidenceMemoryIds?.length ?? 0) > 0) {
    linkDerivedMemoryEvidence({
      db,
      userId,
      inferredMemoryId: id,
      evidenceMemoryIds: options.evidenceMemoryIds ?? [],
      createdAt,
    });
  }
  if (options.createReceipt) {
    createMemoryAcquisitionReceipt({
      db,
      userId,
      memoryId: id,
      learnerBotId: options.botId ?? null,
      targetBotId: options.targetBotId ?? null,
      conversationId: options.conversationId ?? null,
      kind: category === "bot_relation" ? "bot_relation" : "player_memory",
      createdAt,
    });
  }
  return {
    id,
    userId,
    conversationId: options.conversationId ?? undefined,
    botId: options.botId ?? undefined,
    targetBotId: options.targetBotId ?? undefined,
    confidence,
    baseConfidence: confidence,
    lifecycle,
    lastReinforcedAt: createdAt,
    expiresAt:
      lifecycle === "short_term"
        ? memoryExpiryAt(
            createdAt,
            readMemoryEcologySettings(db, userId).shortTermRetentionDays,
          )
        : undefined,
    evidenceMemoryIds: options.evidenceMemoryIds ?? [],
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

function decryptMemoryRow(
  row: MemoryRow,
  userKey: Buffer,
  db?: DatabaseSync,
): StoredMemoryWithEmbedding {
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

  const source = row.source;
  const tier = row.tier === "long_term" || row.tier === "short_term"
    ? row.tier
    : normalizeMemoryTier(
      undefined,
      row.confidence,
      row.certainty ?? row.confidence,
      row.durability ?? undefined,
      source
    );
  const lifecycle =
    row.lifecycle === "derived" || source === "inferred"
      ? "derived"
      : row.lifecycle === "long_term" || tier === "long_term"
        ? "long_term"
        : "short_term";
  const lastReinforcedAt = row.last_reinforced_at ?? row.created_at;
  const retentionDays = db
    ? readMemoryEcologySettings(db, row.user_id).shortTermRetentionDays
    : 30;
  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    botId: row.bot_id ?? undefined,
    targetBotId: row.target_bot_id ?? undefined,
    confidence: row.confidence,
    baseConfidence: row.base_confidence ?? row.confidence,
    lifecycle,
    lastReinforcedAt,
    expiresAt:
      lifecycle === "short_term"
        ? memoryExpiryAt(lastReinforcedAt, retentionDays)
        : undefined,
    evidenceMemoryIds:
      db && lifecycle === "derived"
        ? memoryEvidenceIds(db, row.user_id, row.id)
        : [],
    category: normalizeMemoryCategory(row.category, decrypted.text),
    tier,
    durability: normalizeMemoryDurability(row.durability, decrypted.text),
    source,
    certainty: row.certainty ?? row.confidence,
    sourceMessageIds: parseSourceMessageIds(row.source_message_ids),
    createdAt: row.created_at,
    text: decrypted.text,
    embedding,
  };
}

/**
 * Stores one deterministic, encrypted narrative memory owned by one bot and
 * explicitly scoped to one peer. Pair memories never enter ordinary Chat/Zen
 * recall; callers must request the exact source -> target edge.
 */
export function persistBotPairNarrativeMemory(args: {
  db: DatabaseSync;
  userId: string;
  conversationId?: string | null;
  sourceBotId: string;
  targetBotId: string;
  text: string;
  sourceMessageIds?: readonly string[];
  userKey: Buffer;
  createdAt?: string;
  /** A completed episode contained repeated audience-visible behavior with a lasting consequence. */
  salient?: boolean;
}): UserMemory | null {
  ensureMemoryEcologyMemorySchema(args.db);
  const sourceBotId = args.sourceBotId.trim();
  const targetBotId = args.targetBotId.trim();
  const text = args.text.replace(/\s+/gu, " ").trim().slice(0, 2_000);
  if (!sourceBotId || !targetBotId || sourceBotId === targetBotId || !text) {
    return null;
  }
  reconcileLegacySignalPairNarrativeMemories({
    db: args.db,
    userId: args.userId,
    sourceBotId,
    targetBotId,
    userKey: args.userKey,
  });
  materializeShortTermMemoryDecay(args.db, args.userId);
  const id = randomId(12);
  const createdAt = args.createdAt ?? new Date().toISOString();
  const conversationId = args.conversationId?.trim() || null;
  const sourceMessageIds = normalizeSourceMessageIds([
    ...(args.sourceMessageIds ?? []),
  ]);
  const encrypted = encryptJson(
    { text, embedding: fallbackEmbedding(text) } as unknown as Record<string, unknown>,
    args.userKey,
  );
  const confidence = 0.98;
  const tier = shouldPromoteSignalPairNarrativeMemory({
    db: args.db,
    userId: args.userId,
    sourceBotId,
    targetBotId,
    salient: args.salient === true,
  })
    ? "long_term"
    : "short_term";
  args.db.prepare(
    `INSERT INTO memories
      (id, user_id, conversation_id, bot_id, target_bot_id, ciphertext, iv, tag,
       confidence, base_confidence, category, tier, lifecycle, durability,
       source, certainty, source_message_ids, last_reinforced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bot_relation', ?, ?,
             0.95, 'direct', ?, ?, ?, ?)`,
  ).run(
    id,
    args.userId,
    conversationId,
    sourceBotId,
    targetBotId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    confidence,
    confidence,
    tier,
    tier,
    confidence,
    sourceMessageIdsJson(sourceMessageIds),
    createdAt,
    createdAt,
  );
  createMemoryAcquisitionReceipt({
    db: args.db,
    userId: args.userId,
    memoryId: id,
    learnerBotId: sourceBotId,
    targetBotId,
    conversationId,
    kind: "bot_relation",
    createdAt,
  });
  return {
    id,
    userId: args.userId,
    conversationId: conversationId ?? undefined,
    botId: sourceBotId,
    targetBotId,
    confidence,
    baseConfidence: confidence,
    lifecycle: tier,
    lastReinforcedAt: createdAt,
    expiresAt:
      tier === "short_term"
        ? memoryExpiryAt(
            createdAt,
            readMemoryEcologySettings(args.db, args.userId)
              .shortTermRetentionDays,
          )
        : undefined,
    category: "bot_relation",
    tier,
    durability: 0.95,
    source: "direct",
    certainty: confidence,
    sourceMessageIds,
    createdAt,
    text,
  };
}

/** Three completed pair encounters are enough to make later exact-pair history durable. */
export const SIGNAL_PAIR_NARRATIVE_PROMOTION_ENCOUNTERS = 3;

function signalPairNarrativeEncounterCount(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
}): number {
  const row = args.db.prepare(
    `SELECT COUNT(DISTINCT memory.conversation_id) AS count
       FROM memories AS memory
       JOIN botcast_episodes AS episode
         ON episode.id = memory.conversation_id
        AND episode.user_id = memory.user_id
      WHERE memory.user_id = ?
        AND memory.bot_id = ?
        AND memory.target_bot_id = ?
        AND memory.category = 'bot_relation'
        AND memory.source = 'direct'
        AND episode.status = 'completed'
        AND episode.guest_kind = 'bot'
        AND ((episode.host_bot_id = memory.bot_id AND episode.guest_bot_id = memory.target_bot_id)
          OR (episode.guest_bot_id = memory.bot_id AND episode.host_bot_id = memory.target_bot_id))`,
  ).get(args.userId, args.sourceBotId, args.targetBotId) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function signalPairNarrativeIsSalient(text: string): boolean {
  return /\brepeated interruptions?\b|\brepeatedly interrupted\b|\b(?:left|walked out|departure)\b[\s\S]{0,120}\binterrupting\b|\binterrupting\b[\s\S]{0,120}\b(?:left|walked out|departure)\b|\bstole\b[\s\S]{0,120}\bpublic identity\b[\s\S]{0,120}\bimpost(?:or|er)\b|\bknowingly wore\b[\s\S]{0,120}\bpublic presentation\b[\s\S]{0,120}\bcopied eligible public Powers\b/iu.test(
    text,
  );
}

function signalPairNarrativePromotionAllowed(
  db: DatabaseSync,
  userId: string,
): boolean {
  return readMemoryEcologySettings(db, userId).longTermPromotionThreshold <= 0.98;
}

function shouldPromoteSignalPairNarrativeMemory(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
  salient: boolean;
  encounterCount?: number;
}): boolean {
  if (!signalPairNarrativePromotionAllowed(args.db, args.userId)) return false;
  if (args.salient) return true;
  const encounterCount = args.encounterCount ?? signalPairNarrativeEncounterCount(args);
  return encounterCount + 1 >= SIGNAL_PAIR_NARRATIVE_PROMOTION_ENCOUNTERS;
}

/**
 * Reconciles only the authenticated directed Signal edge, rather than running
 * an opaque database-wide rewrite. Old ordinary 0.98 rows become short-term;
 * records that already satisfy today's repeated-encounter or salient-event
 * policy remain durable.
 */
export function reconcileLegacySignalPairNarrativeMemories(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
  userKey: Buffer;
}): number {
  ensureMemoryEcologyMemorySchema(args.db);
  const sourceBotId = args.sourceBotId.trim();
  const targetBotId = args.targetBotId.trim();
  if (!sourceBotId || !targetBotId || sourceBotId === targetBotId) return 0;
  const rows = args.db.prepare(
    `SELECT memory.id AS id, memory.user_id AS user_id,
            memory.conversation_id AS conversation_id, memory.bot_id AS bot_id,
            memory.target_bot_id AS target_bot_id, memory.ciphertext AS ciphertext,
            memory.iv AS iv, memory.tag AS tag, memory.confidence AS confidence,
            memory.base_confidence AS base_confidence,
            memory.category AS category, memory.tier AS tier,
            memory.lifecycle AS lifecycle, memory.durability AS durability,
            memory.source AS source, memory.certainty AS certainty,
            memory.source_message_ids AS source_message_ids,
            memory.last_reinforced_at AS last_reinforced_at,
            memory.created_at AS created_at
       FROM memories AS memory
       JOIN botcast_episodes AS episode
         ON episode.id = memory.conversation_id
        AND episode.user_id = memory.user_id
      WHERE memory.user_id = ?
        AND memory.bot_id = ?
        AND memory.target_bot_id = ?
        AND memory.category = 'bot_relation'
        AND memory.source = 'direct'
        AND (memory.tier = 'long_term' OR memory.lifecycle = 'long_term')
        AND episode.status = 'completed'
        AND episode.guest_kind = 'bot'
        AND ((episode.host_bot_id = memory.bot_id AND episode.guest_bot_id = memory.target_bot_id)
          OR (episode.guest_bot_id = memory.bot_id AND episode.host_bot_id = memory.target_bot_id))`,
  ).all(args.userId, sourceBotId, targetBotId) as MemoryRow[];
  if (rows.length === 0) return 0;
  const encounterCount = signalPairNarrativeEncounterCount({
    db: args.db,
    userId: args.userId,
    sourceBotId,
    targetBotId,
  });
  const demote = args.db.prepare(
    `UPDATE memories
        SET tier = 'short_term',
            lifecycle = 'short_term',
            base_confidence = COALESCE(base_confidence, confidence),
            last_reinforced_at = COALESCE(last_reinforced_at, created_at)
      WHERE id = ? AND user_id = ?`,
  );
  let changed = 0;
  for (const row of rows) {
    let salient = false;
    try {
      salient = signalPairNarrativeIsSalient(
        decryptMemoryRow(row, args.userKey, args.db).text,
      );
    } catch {
      // A corrupt encrypted row remains untouched; ordinary retrieval will
      // surface its existing decryption failure instead of silently deleting it.
      continue;
    }
    if (
      shouldPromoteSignalPairNarrativeMemory({
        db: args.db,
        userId: args.userId,
        sourceBotId,
        targetBotId,
        salient,
        encounterCount,
      })
    ) {
      continue;
    }
    changed += Number(demote.run(row.id, args.userId).changes ?? 0);
  }
  return changed;
}

/** Reconciles the Signal pair rows shown in one authenticated bot dossier. */
export function reconcileLegacySignalPairNarrativeMemoriesForBot(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  userKey: Buffer;
}): number {
  ensureMemoryEcologyMemorySchema(args.db);
  const sourceBotId = args.sourceBotId.trim();
  if (!sourceBotId) return 0;
  const hasSignalEpisodes = args.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'botcast_episodes'",
  ).get();
  if (!hasSignalEpisodes) return 0;
  const rows = args.db.prepare(
    `SELECT DISTINCT memory.target_bot_id AS target_bot_id
       FROM memories AS memory
       JOIN botcast_episodes AS episode
         ON episode.id = memory.conversation_id
        AND episode.user_id = memory.user_id
      WHERE memory.user_id = ?
        AND memory.bot_id = ?
        AND memory.target_bot_id IS NOT NULL
        AND memory.category = 'bot_relation'
        AND memory.source = 'direct'
        AND (memory.tier = 'long_term' OR memory.lifecycle = 'long_term')
        AND episode.status = 'completed'
        AND episode.guest_kind = 'bot'`,
  ).all(args.userId, sourceBotId) as Array<{ target_bot_id: string }>;
  return rows.reduce(
    (changed, row) => changed + reconcileLegacySignalPairNarrativeMemories({
      db: args.db,
      userId: args.userId,
      sourceBotId,
      targetBotId: row.target_bot_id,
      userKey: args.userKey,
    }),
    0,
  );
}

/** Decrypt only memories on the requested directed bot pair. */
export function retrieveBotPairNarrativeMemories(args: {
  db: DatabaseSync;
  userId: string;
  sourceBotId: string;
  targetBotId: string;
  userKey: Buffer;
  limit?: number;
}): UserMemory[] {
  const sourceBotId = args.sourceBotId.trim();
  const targetBotId = args.targetBotId.trim();
  if (!sourceBotId || !targetBotId || sourceBotId === targetBotId) return [];
  reconcileLegacySignalPairNarrativeMemories({
    ...args,
    sourceBotId,
    targetBotId,
  });
  materializeShortTermMemoryDecay(args.db, args.userId);
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 4)));
  const rows = args.db.prepare(
    `SELECT id, user_id, conversation_id, bot_id, target_bot_id, ciphertext, iv,
            tag, confidence, base_confidence, category, tier, lifecycle,
            durability, source, certainty, source_message_ids,
            last_reinforced_at, created_at
       FROM memories
      WHERE user_id = ? AND bot_id = ? AND target_bot_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
  ).all(args.userId, sourceBotId, targetBotId, limit) as MemoryRow[];
  return rows.map((row) => {
    const { embedding: _embedding, ...memory } = decryptMemoryRow(
      row,
      args.userKey,
      args.db,
    );
    return memory;
  });
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
        WHERE user_id = ? AND bot_id = ? AND target_bot_id IS NULL AND source = 'direct' AND COALESCE(tier, 'short_term') != 'long_term'
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

  return rows.map((row) => decryptMemoryRow(row, userKey, db));
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
  targetBotId: string | null,
  userKey: Buffer
): StoredMemoryWithEmbedding[] {
  const rows = botId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, target_bot_id, ciphertext, iv, tag,
               confidence, base_confidence, category, tier, lifecycle, durability,
               source, certainty, source_message_ids, last_reinforced_at, created_at
        FROM memories
        WHERE user_id = ?
          AND bot_id = ?
          AND ((? IS NULL AND target_bot_id IS NULL) OR target_bot_id = ?)
        ORDER BY created_at DESC
        LIMIT ?
      `).all(
        userId,
        botId,
        targetBotId,
        targetBotId,
        CULMINATION_LOOKBACK_LIMIT,
      ) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, target_bot_id, ciphertext, iv, tag,
               confidence, base_confidence, category, tier, lifecycle, durability,
               source, certainty, source_message_ids, last_reinforced_at, created_at
        FROM memories
        WHERE user_id = ?
          AND bot_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[];

  return rows.map((row) => decryptMemoryRow(row, userKey, db));
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
  ensureMemoryEcologyMemorySchema(db);
  materializeShortTermMemoryDecay(db, userId);
  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, target_bot_id,
      ciphertext, iv, tag, confidence, base_confidence, category, tier,
      lifecycle, durability, source, certainty, source_message_ids,
      last_reinforced_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let stored: UserMemory[] = [];
  const source = options.source ?? "direct";
  const targetBotId = options.targetBotId?.trim() || null;
  const sourceMessageIds = normalizeSourceMessageIds(options.sourceMessageIds);
  const ecologySettings = readMemoryEcologySettings(db, userId);
  const eligibleCandidates = options.automatic
    ? candidates.filter((candidate) =>
        memoryCandidatePassesAcquisition(
          ecologySettings,
          options.category ?? candidate.category,
          candidate.confidence,
        ),
      )
    : candidates;
  const createReceipt = options.createReceipt ?? options.automatic === true;
  const scopeMemoriesForReinforcement =
    source === "direct"
      ? loadScopeMemoriesForReinforcement(
          db,
          userId,
          botId,
          targetBotId,
          userKey,
        )
      : [];

  for (const candidate of eligibleCandidates) {
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
    const tier = normalizeMemoryTierForUser(
      db,
      userId,
      options.tier,
      candidateConfidence,
      certainty,
      source,
    );
    const lifecycle = source === "inferred" ? "derived" : tier;
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
      const reinforcedTier = normalizeMemoryTierForUser(
        db,
        userId,
        options.tier,
        reinforcedConfidence,
        reinforcedCertainty,
        source
      );
      const reinforcedLifecycle = source === "inferred" ? "derived" : reinforcedTier;
      db.prepare(`
        UPDATE memories
        SET conversation_id = ?,
            ciphertext = ?,
            iv = ?,
            tag = ?,
            confidence = ?,
            base_confidence = ?,
            category = ?,
            tier = ?,
            lifecycle = ?,
            durability = ?,
            source = ?,
            certainty = ?,
            source_message_ids = ?,
            last_reinforced_at = ?,
            created_at = ?,
            target_bot_id = ?
        WHERE user_id = ? AND id = ?
      `).run(
        conversationId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        reinforcedConfidence,
        reinforcedConfidence,
        category,
        reinforcedTier,
        reinforcedLifecycle,
        reinforcedDurability,
        source,
        reinforcedCertainty,
        sourceMessageIdsJson(mergedSourceMessageIds),
        createdAt,
        createdAt,
        targetBotId,
        userId,
        target.id
      );
      const reinforcedMemory: StoredMemoryWithEmbedding = {
        ...target,
        conversationId,
        confidence: reinforcedConfidence,
        baseConfidence: reinforcedConfidence,
        lifecycle: reinforcedLifecycle,
        lastReinforcedAt: createdAt,
        expiresAt:
          reinforcedLifecycle === "short_term"
            ? memoryExpiryAt(
                createdAt,
                readMemoryEcologySettings(db, userId).shortTermRetentionDays,
              )
            : undefined,
        targetBotId: targetBotId ?? undefined,
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
      if (createReceipt) {
        createMemoryAcquisitionReceipt({
          db,
          userId,
          memoryId: target.id,
          learnerBotId: botId,
          targetBotId,
          conversationId,
          kind: category === "bot_relation" ? "bot_relation" : "player_memory",
          createdAt,
        });
      }
      stored.push({
        id: reinforcedMemory.id,
        userId: reinforcedMemory.userId,
        conversationId: reinforcedMemory.conversationId,
        botId: reinforcedMemory.botId,
        targetBotId: reinforcedMemory.targetBotId,
        confidence: reinforcedMemory.confidence,
        baseConfidence: reinforcedMemory.baseConfidence,
        lifecycle: reinforcedMemory.lifecycle,
        lastReinforcedAt: reinforcedMemory.lastReinforcedAt,
        expiresAt: reinforcedMemory.expiresAt,
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
      targetBotId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      candidateConfidence,
      candidateConfidence,
      category,
      tier,
      lifecycle,
      durability,
      source,
      certainty,
      sourceMessageIdsJson(sourceMessageIds),
      createdAt,
      createdAt
    );
    const memory: StoredMemoryWithEmbedding = {
      id,
      userId,
      conversationId,
      botId: botId ?? undefined,
      targetBotId: targetBotId ?? undefined,
      confidence: candidateConfidence,
      baseConfidence: candidateConfidence,
      lifecycle,
      lastReinforcedAt: createdAt,
      expiresAt:
        lifecycle === "short_term"
          ? memoryExpiryAt(
              createdAt,
              readMemoryEcologySettings(db, userId).shortTermRetentionDays,
            )
          : undefined,
      evidenceMemoryIds: options.evidenceMemoryIds ?? [],
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
    if (lifecycle === "derived" && (options.evidenceMemoryIds?.length ?? 0) > 0) {
      linkDerivedMemoryEvidence({
        db,
        userId,
        inferredMemoryId: id,
        evidenceMemoryIds: options.evidenceMemoryIds ?? [],
        createdAt,
      });
    }
    if (createReceipt) {
      createMemoryAcquisitionReceipt({
        db,
        userId,
        memoryId: id,
        learnerBotId: botId,
        targetBotId,
        conversationId,
        kind: category === "bot_relation" ? "bot_relation" : "player_memory",
        createdAt,
      });
    }
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
  materializeShortTermMemoryDecay(db, userId);
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
        FROM memories
        WHERE user_id = ? AND target_bot_id IS NULL AND (bot_id IS NULL OR bot_id = ?)
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
      const memory = decryptMemoryRow(row, userKey, db);
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
  materializeShortTermMemoryDecay(db, userId);
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND target_bot_id IS NULL AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR source = 'compiled') ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];
  const queryEmbedding = await embedWithFallback(query);
  const scored = rows.map((row) => {
    const memory = decryptMemoryRow(row, userKey, db);
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
  materializeShortTermMemoryDecay(db, userId);
  const normalizedBotId = typeof botId === "string" && botId.trim().length > 0
    ? botId.trim()
    : null;
  const rows: MemoryRow[] = normalizedBotId
    ? db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND target_bot_id IS NULL AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR source = 'compiled') ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];

  return filterConflictingMemories(
    rows.map((row) => ({
      ...decryptMemoryRow(row, userKey, db),
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
  materializeShortTermMemoryDecay(db, userId);
  const normalizedBotId = botId.trim();
  if (!normalizedBotId) return [];
  const rows = db
    .prepare(
      `SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, source, certainty, source_message_ids, created_at
       FROM memories
       WHERE user_id = ?
         AND bot_id = ?
         AND target_bot_id IS NULL
         AND COALESCE(source, 'direct') != '${ABOUT_YOU_MEMORY_SOURCE}'
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(userId, normalizedBotId) as MemoryRow[];

  return filterConflictingMemories(
    rows.map((row) => ({
      ...decryptMemoryRow(row, userKey, db),
      score: 0,
    }))
  )
    .slice(0, limit)
    .map(({ score: _unused, embedding: _embedding, ...memory }) => memory);
}
