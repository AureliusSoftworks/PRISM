import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import type { LlmProvider } from "./providers.ts";
import { upsertVector, ensureCollection, searchVectors } from "./qdrant.ts";

const SUMMARY_SYSTEM_PROMPT = `You are a memory extraction assistant. Given a conversation thread, extract 1-3 concise factual bullet points about the user's preferences, facts about them, or key decisions. Respond ONLY with the bullet points, one per line. If there is nothing worth remembering, respond with "NONE".`;

export async function summarizeAndStoreMemories(
  db: DatabaseSync,
  provider: LlmProvider,
  userId: string,
  conversationId: string
): Promise<void> {
  const messages = db.prepare(
    "SELECT role, content FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT 40"
  ).all(conversationId, userId) as Array<{ role: string; content: string }>;

  if (messages.length < 2) {
    return;
  }

  const thread = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const summary = await provider.generateResponse([
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: thread },
  ]);

  if (!summary || summary.trim().toUpperCase() === "NONE") {
    return;
  }

  const summaryId = randomId(12);
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(summaryId, userId, conversationId, summary, now);

  try {
    await ensureCollection();
    const embedding = await provider.embedText(summary);
    await upsertVector(summaryId, embedding, {
      userId,
      conversationId,
      text: summary,
      createdAt: now,
    });
  } catch {
    // Qdrant may not be running in dev; SQLite summary is still stored
  }
}

export async function retrieveMemorySummaries(
  provider: LlmProvider,
  userId: string,
  query: string,
  limit = 4
): Promise<Array<{ id: string; text: string; score: number }>> {
  try {
    await ensureCollection();
    const queryEmbedding = await provider.embedText(query);
    const results = await searchVectors(queryEmbedding, userId, limit);
    return results.map((r) => ({
      id: r.id,
      text: (r.payload.text as string) ?? "",
      score: r.score,
    }));
  } catch {
    return [];
  }
}
