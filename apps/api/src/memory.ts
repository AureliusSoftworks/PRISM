import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import { fallbackEmbedding, type LlmProvider } from "./providers.ts";
import type { UserMemory } from "@localai/shared";
import type { MemoryCandidate } from "./memory-extraction.ts";
import { extractMemoryCandidates } from "./memory-extraction.ts";

export { extractMemoryCandidates };

interface StoredMemoryPayload {
  text: string;
  embedding: number[];
}

interface DevSeedMemoryOptions {
  randomizeAcrossBots?: boolean;
  random?: () => number;
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
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
  source: "direct" | "inferred" | "compiled";
  certainty: number | null;
  created_at: string;
};

interface PersistMemoryOptions {
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
}

interface StoredMemoryWithEmbedding extends UserMemory {
  source: "direct" | "inferred" | "compiled";
  certainty: number;
  embedding: number[];
}

interface MemoryCulminationResult {
  compiledMemory: UserMemory;
  deletedIds: Set<string>;
}

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

function getSingleValueMemoryKey(text: string): string | null {
  const normalized = normalizedMemoryText(text);
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
  `).run(userId);

  return Number(result.changes ?? 0);
}

export function updateDirectMemoryText(
  db: DatabaseSync,
  userId: string,
  memoryId: string,
  text: string,
  userKey: Buffer
): UserMemory {
  const row = db
    .prepare(
      "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at FROM memories WHERE id = ? AND user_id = ?"
    )
    .get(memoryId, userId) as MemoryRow | undefined;

  if (!row) {
    throw new Error("Memory not found.");
  }
  if (row.source === "inferred" || row.source === "compiled") {
    throw new Error("Inferred memories cannot be edited.");
  }

  const currentPayload = decryptJson(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      tag: row.tag,
    },
    userKey
  ) as unknown as StoredMemoryPayload;
  const fallback = fallbackEmbedding(text);
  const embedding =
    Array.isArray(currentPayload.embedding) && currentPayload.embedding.length !== fallback.length
      ? currentPayload.embedding
      : fallback;
  const encrypted = encryptJson({ text, embedding }, userKey);

  db.prepare(
    "UPDATE memories SET ciphertext = ?, iv = ?, tag = ? WHERE id = ? AND user_id = ?"
  ).run(encrypted.ciphertext, encrypted.iv, encrypted.tag, memoryId, userId);

  return {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id ?? undefined,
    botId: row.bot_id ?? undefined,
    confidence: row.confidence,
    source: row.source,
    certainty: row.certainty ?? row.confidence,
    createdAt: row.created_at,
    text,
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
    source: row.source,
    certainty: row.certainty ?? row.confidence,
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
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at
        FROM memories
        WHERE user_id = ? AND bot_id = ? AND source = 'direct'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, botId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[]
    : db.prepare(`
        SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at
        FROM memories
        WHERE user_id = ? AND bot_id IS NULL AND source = 'direct'
        ORDER BY created_at DESC
        LIMIT ?
      `).all(userId, CULMINATION_LOOKBACK_LIMIT) as MemoryRow[];

  return rows.map((row) => decryptMemoryRow(row, userKey));
}

async function resolveMemoryCulmination(
  db: DatabaseSync,
  provider: LlmProvider,
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
    compiledEmbedding = await provider.embedText(compiledText);
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

  db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'compiled', ?, ?)
  `).run(
    id,
    userId,
    conversationId,
    botId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    confidence,
    confidence,
    createdAt
  );

  const deletedIds = new Set(aligned.map((memory) => memory.id));
  const placeholders = [...deletedIds].map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM memories WHERE user_id = ? AND id IN (${placeholders})`
  ).run(userId, ...deletedIds);

  return {
    deletedIds,
    compiledMemory: {
      id,
      userId,
      conversationId,
      botId: botId ?? undefined,
      confidence,
      source: "compiled",
      certainty: confidence,
      createdAt,
      text: compiledText,
    },
  };
}

export async function persistMemoryCandidates(
  db: DatabaseSync,
  provider: LlmProvider,
  userId: string,
  conversationId: string,
  botId: string | null,
  candidates: MemoryCandidate[],
  userKey: Buffer,
  options: PersistMemoryOptions = {}
): Promise<UserMemory[]> {
  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let stored: UserMemory[] = [];
  const source = options.source ?? "direct";

  for (const candidate of candidates) {
    let embedding: number[];
    try {
      embedding = await provider.embedText(candidate.text);
    } catch {
      embedding = fallbackEmbedding(candidate.text);
    }
    const payload: StoredMemoryPayload = { text: candidate.text, embedding };
    const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
    const id = randomId(12);
    const createdAt = new Date().toISOString();
    insertMemory.run(
      id,
      userId,
      conversationId,
      botId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      candidate.confidence,
      source,
      options.certainty ?? candidate.confidence,
      createdAt
    );
    const memory: StoredMemoryWithEmbedding = {
      id,
      userId,
      conversationId,
      botId: botId ?? undefined,
      confidence: candidate.confidence,
      source,
      certainty: options.certainty ?? candidate.confidence,
      createdAt,
      text: candidate.text,
      embedding,
    };
    stored.push(memory);

    const culmination = await resolveMemoryCulmination(
      db,
      provider,
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
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
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
      insertMemory.run(
        randomId(12),
        userId,
        botId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        0.62 + (index % 7) * 0.05,
        options.source ?? "direct",
        options.certainty ?? (0.62 + (index % 7) * 0.05),
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

export async function retrieveRelevantMemories(
  db: DatabaseSync,
  provider: LlmProvider,
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
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, certainty, created_at FROM memories WHERE user_id = ? AND bot_id IS NULL ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];
  const queryEmbedding = await provider.embedText(query);
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
