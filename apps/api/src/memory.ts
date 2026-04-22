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
  candidates: MemoryCandidate[],
  userKey: Buffer
): Promise<void> {
  const insertMemory = db.prepare(`
    INSERT INTO memories (id, user_id, ciphertext, iv, tag, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const candidate of candidates) {
    const embedding = await provider.embedText(candidate.text);
    const payload: StoredMemoryPayload = { text: candidate.text, embedding };
    const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
    insertMemory.run(
      randomId(12),
      userId,
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
  limit = 4
): Promise<UserMemory[]> {
  const rows = db
    .prepare(
      "SELECT id, user_id, ciphertext, iv, tag, confidence, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    ciphertext: string;
    iv: string;
    tag: string;
    confidence: number;
    created_at: string;
  }>;
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
