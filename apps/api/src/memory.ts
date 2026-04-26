import type { DatabaseSync } from "node:sqlite";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import type { LlmProvider } from "./providers.ts";
import type { UserMemory } from "@localai/shared";
import type { MemoryCandidate } from "./memory-extraction.ts";
import { extractMemoryCandidates } from "./memory-extraction.ts";

export { extractMemoryCandidates };

interface StoredMemoryPayload {
  text: string;
  embedding: number[];
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
  created_at: string;
};

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

export async function persistMemoryCandidates(
  db: DatabaseSync,
  provider: LlmProvider,
  userId: string,
  conversationId: string,
  botId: string | null,
  candidates: MemoryCandidate[],
  userKey: Buffer
): Promise<void> {
  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const candidate of candidates) {
    const embedding = await provider.embedText(candidate.text);
    const payload: StoredMemoryPayload = { text: candidate.text, embedding };
    const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
    insertMemory.run(
      randomId(12),
      userId,
      conversationId,
      botId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      candidate.confidence,
      new Date().toISOString()
    );
  }
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
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at FROM memories WHERE user_id = ? AND (bot_id IS NULL OR bot_id = ?) ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId, normalizedBotId) as MemoryRow[]
    : db
        .prepare(
          "SELECT id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at FROM memories WHERE user_id = ? AND bot_id IS NULL ORDER BY created_at DESC LIMIT 100"
        )
        .all(userId) as MemoryRow[];
  const queryEmbedding = await provider.embedText(query);
  const scored = rows.map((row) => {
    const decrypted = decryptJson(
      {
        ciphertext: row.ciphertext,
        iv: row.iv,
        tag: row.tag
      },
      userKey
    ) as unknown as StoredMemoryPayload;
    return {
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id ?? undefined,
      botId: row.bot_id ?? undefined,
      confidence: row.confidence,
      createdAt: row.created_at,
      text: decrypted.text,
      score: cosineSimilarity(queryEmbedding, decrypted.embedding)
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _unused, ...memory }) => memory);
}
