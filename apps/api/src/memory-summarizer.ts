import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import { embedTextLocal, type LlmProvider } from "./providers.ts";
import { upsertVector, ensureCollection, searchVectors } from "./qdrant.ts";
import { persistMemoryCandidates } from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";

/**
 * Chat-mode summarizer prompt: extracts cross-thread personal facts the
 * model should remember about the user even in unrelated conversations.
 * Output feeds `memory_summaries` AND Qdrant for similarity retrieval.
 */
const FACT_EXTRACTION_PROMPT = `You are a memory extraction assistant. Given a conversation thread, extract 1-3 concise factual bullet points about the user's preferences, facts about them, or key decisions. Respond ONLY with the bullet points, one per line. If there is nothing worth remembering, respond with "NONE".`;

/**
 * Sandbox-mode thread-compaction prompt: rolls earlier messages (plus any
 * prior rolling summary) into ONE compact paragraph that lets the model
 * keep threading context once older turns roll off the live window. Scope
 * is strictly the current conversation — output is never indexed into
 * Qdrant and never surfaced in the sidebar.
 */
const ROLLING_COMPACT_PROMPT = `You are compacting an ongoing conversation thread so the model can keep threading it even after older turns roll out of its live context window. You will receive an optional prior summary followed by a block of earlier messages. Produce ONE short dense paragraph (4-8 sentences) that preserves, in rough order of importance: (1) names, roles, entities, and project/file references; (2) concrete decisions, agreements, or commitments; (3) the user's stated preferences and constraints; (4) the emotional arc or intent of the conversation so far. Write in third person, present tense. Omit pleasantries and narration. Never quote messages verbatim. Respond with ONLY the paragraph — no preamble, no bullets, no "Summary:" prefix.`;

/**
 * How many most-recent messages stay verbatim in the live prompt window.
 * Summarization kicks in when the conversation grows beyond this, so
 * anything older than the tail has been compacted into a rolling summary
 * instead of rolling off silently.
 */
const RECENT_WINDOW_SIZE = 30;
const SUMMARY_KIND_CHAT_FACTS = "chat_facts";
const SUMMARY_KIND_SANDBOX_THREAD = "sandbox_thread";

function encodeSummary(kind: string, summary: string): string {
  return `[${kind}] ${summary.trim()}`;
}

function decodeSummary(payload: string, expectedKind: string): string | null {
  const prefix = `[${expectedKind}] `;
  if (!payload.startsWith(prefix)) return null;
  const decoded = payload.slice(prefix.length).trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Chat-mode (cross-thread) summarizer. Folds the conversation so far into
 * 1-3 bullet points of personal facts and indexes them into Qdrant so
 * future turns on OTHER conversations can recall them. Keeps its original
 * 40-message horizon since its goal is long-lived personal memory, not
 * thread-compaction.
 */
export async function summarizeAndStoreMemories(
  db: DatabaseSync,
  auxiliaryProvider: LlmProvider,
  userId: string,
  conversationId: string,
  userKey?: Buffer
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

  const summary = await auxiliaryProvider.generateResponse([
    { role: "system", content: FACT_EXTRACTION_PROMPT },
    { role: "user", content: thread },
  ]);

  if (!summary || summary.trim().toUpperCase() === "NONE") {
    return;
  }

  const summaryId = randomId(12);
  const now = new Date().toISOString();

  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    summaryId,
    userId,
    conversationId,
    encodeSummary(SUMMARY_KIND_CHAT_FACTS, summary),
    now
  );

  // Optionally persist extracted bullet facts as low-certainty compiled
  // assumptions so the UI can render them alongside direct memories.
  if (userKey) {
    const compiledFacts = summary
      .split("\n")
      .map((line) => line.replace(/^[\s>*-]+/, "").trim())
      .filter((line) => line.length > 0)
      .filter((line) => line.toUpperCase() !== "NONE")
      .slice(0, 3);
    if (compiledFacts.length > 0) {
      const validation = await validateMemoryCandidates(auxiliaryProvider, {
        source: "compiled",
        scope: "global",
        rawContext: thread,
        candidates: compiledFacts.map((text, index) => ({
          text,
          confidence: Math.max(0.34, 0.52 - index * 0.06),
        })),
      });
      await persistMemoryCandidates(
        db,
        userId,
        conversationId,
        null,
        validation.candidates,
        userKey,
        {
          source: "compiled",
          certainty: 0.45,
        }
      );
    }
  }

  try {
    await ensureCollection();
    const embedding = await embedTextLocal(summary);
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

/**
 * Cross-thread retrieval via Qdrant. Chat mode only — Sandbox never reads
 * from this path because its memory is strictly thread-scoped.
 */
export async function retrieveMemorySummaries(
  userId: string,
  query: string,
  limit = 4
): Promise<Array<{ id: string; text: string; score: number }>> {
  try {
    await ensureCollection();
    const queryEmbedding = await embedTextLocal(query);
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

/**
 * Sandbox-mode rolling thread compaction. Produces a single short
 * paragraph covering everything in the thread EXCEPT the most recent
 * RECENT_WINDOW_SIZE messages (which stay verbatim in the live prompt).
 * Each call folds the previous summary together with every message
 * currently outside the window, trusting the LLM to compress redundancy
 * — a deliberately simple contract so we don't need a per-row cutoff
 * column to track what the prior summary already covered. Writes only
 * to SQLite, scoped by conversation_id; deliberately NOT indexed into
 * Qdrant so it can never be retrieved by a different thread.
 *
 * No-ops cheaply when the thread still fits verbatim in the live
 * window, so it's safe to call at every summarization milestone.
 */
export async function summarizeThreadCompact(
  db: DatabaseSync,
  auxiliaryProvider: LlmProvider,
  userId: string,
  conversationId: string
): Promise<void> {
  const allMessages = db
    .prepare(
      "SELECT role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
    )
    .all(conversationId, userId) as Array<{
    role: string;
    content: string;
    created_at: string;
  }>;

  // Nothing to compact yet — the whole thread still fits in the live
  // window, so rolling context is a no-op.
  if (allMessages.length <= RECENT_WINDOW_SIZE) {
    return;
  }

  const olderMessages = allMessages.slice(0, -RECENT_WINDOW_SIZE);
  // Slice length is total - RECENT_WINDOW_SIZE; the guard above already
  // ensured this is > 0, but we re-check to keep the branch obvious.
  if (olderMessages.length === 0) {
    return;
  }

  const priorSummary = db
    .prepare(
      "SELECT summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(userId, conversationId) as { summary: string } | undefined;

  const priorBlock = priorSummary
    ? `[Prior summary]\n${priorSummary.summary}\n\n`
    : "";
  const messagesBlock = olderMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const compact = await auxiliaryProvider.generateResponse([
    { role: "system", content: ROLLING_COMPACT_PROMPT },
    {
      role: "user",
      content: `${priorBlock}[Earlier messages to fold in]\n${messagesBlock}`,
    },
  ]);

  if (!compact || compact.trim().length === 0) {
    return;
  }

  const summaryId = randomId(12);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(summaryId, userId, conversationId, compact.trim(), now);
  // Intentional: no Qdrant write. Thread-scoped summaries must stay
  // unreachable from cross-thread similarity search.
}

/**
 * Latest thread-scoped summary for this conversation, or null when none
 * has been written yet. Sandbox-mode prompt assembly uses this as a
 * rolling system prefix; Chat mode retrieves summaries through Qdrant
 * instead.
 */
export function getLatestThreadSummary(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string | null {
  const rows = db
    .prepare(
      "SELECT summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 25"
    )
    .all(userId, conversationId) as Array<{ summary?: string }>;
  for (const row of rows) {
    if (typeof row.summary !== "string") continue;
    const chatFact = decodeSummary(row.summary, SUMMARY_KIND_CHAT_FACTS);
    if (chatFact !== null) {
      continue;
    }
    const decoded = decodeSummary(row.summary, SUMMARY_KIND_SANDBOX_THREAD);
    if (decoded) return decoded;
    const legacy = row.summary.trim();
    if (legacy.length > 0) return legacy;
  }
  return null;
}

export { RECENT_WINDOW_SIZE };
