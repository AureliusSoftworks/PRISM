import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import { embedTextLocal, type LlmProvider } from "./providers.ts";
import { upsertVector, ensureCollection, searchVectors } from "./qdrant.ts";
import { persistMemoryCandidates } from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";
import type { ChatMode } from "@localai/shared";

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
const CHAT_VISIBLE_RECAP_PROMPT = `Rewrite the technical summary into a warm, natural recap for the user. Focus on the user's asks and goals first. Mention what the assistant helped with briefly, only as supporting context. Write in first person assistant voice and second person user voice, present tense. Keep it to 1-2 sentences, conversational, and grounded in "right now" continuity. Start naturally (for example: "We were just talking about..."). Do not use markdown, bullets, or labels.`;

/**
 * How many most-recent messages stay verbatim in the live prompt window.
 * Summarization kicks in when the conversation grows beyond this, so
 * anything older than the tail has been compacted into a rolling summary
 * instead of rolling off silently.
 */
const RECENT_WINDOW_SIZE = 30;
const SUMMARY_KIND_CHAT_FACTS = "chat_facts";
const SUMMARY_KIND_THREAD_COMPACT = "thread_compact";

type EncodedSummaryRecord = {
  v: 1;
  kind: typeof SUMMARY_KIND_CHAT_FACTS | typeof SUMMARY_KIND_THREAD_COMPACT;
  summary: string;
  displaySummary?: string;
  mode?: ChatMode;
  reason?: "milestone" | "mode_exit" | "manual";
  createdAt?: string;
};

type ThreadSummaryDebug = {
  mode: ChatMode;
  conversationId: string;
  inProgress: boolean;
  latestSummary: string | null;
  latestSummaryAt: string | null;
  summaryCount: number;
  totalMessages: number;
  messagesSinceLastCompaction: number;
};

const threadSummaryInFlight = new Set<string>();

function threadSummaryKey(userId: string, conversationId: string, mode: ChatMode): string {
  return `${userId}:${conversationId}:${mode}`;
}

function encodeSummaryRecord(record: EncodedSummaryRecord): string {
  return JSON.stringify(record);
}

function decodeSummaryRecord(payload: string): EncodedSummaryRecord | null {
  const raw = payload.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EncodedSummaryRecord>;
    if (
      parsed.v === 1 &&
      (parsed.kind === SUMMARY_KIND_CHAT_FACTS || parsed.kind === SUMMARY_KIND_THREAD_COMPACT) &&
      typeof parsed.summary === "string" &&
      parsed.summary.trim().length > 0
    ) {
      if (parsed.kind === SUMMARY_KIND_THREAD_COMPACT) {
        const mode = parsed.mode === "chat" ? "chat" : "sandbox";
        return {
          v: 1,
          kind: SUMMARY_KIND_THREAD_COMPACT,
          mode,
          summary: parsed.summary.trim(),
          displaySummary:
            typeof parsed.displaySummary === "string" && parsed.displaySummary.trim().length > 0
              ? parsed.displaySummary.trim()
              : undefined,
          reason: parsed.reason,
          createdAt: parsed.createdAt,
        };
      }
      return {
        v: 1,
        kind: SUMMARY_KIND_CHAT_FACTS,
        summary: parsed.summary.trim(),
        reason: parsed.reason,
        createdAt: parsed.createdAt,
      };
    }
  } catch {
    // Legacy text payloads are decoded below.
  }
  const legacyChatPrefix = `[${SUMMARY_KIND_CHAT_FACTS}] `;
  if (raw.startsWith(legacyChatPrefix)) {
    const summary = raw.slice(legacyChatPrefix.length).trim();
    return summary
      ? { v: 1, kind: SUMMARY_KIND_CHAT_FACTS, summary }
      : null;
  }
  const legacySandboxPrefix = "[sandbox_thread] ";
  if (raw.startsWith(legacySandboxPrefix)) {
    const summary = raw.slice(legacySandboxPrefix.length).trim();
    return summary
      ? { v: 1, kind: SUMMARY_KIND_THREAD_COMPACT, mode: "sandbox", summary }
      : null;
  }
  // Legacy sandbox compaction rows were stored as plain paragraph text.
  return { v: 1, kind: SUMMARY_KIND_THREAD_COMPACT, mode: "sandbox", summary: raw };
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
    encodeSummaryRecord({
      v: 1,
      kind: SUMMARY_KIND_CHAT_FACTS,
      summary: summary.trim(),
      mode: "chat",
      reason: "milestone",
      createdAt: now,
    }),
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
  conversationId: string,
  options?: {
    mode?: ChatMode;
    reason?: "milestone" | "mode_exit" | "manual";
    force?: boolean;
  }
): Promise<{ triggered: boolean; latestSummary?: string; latestSummaryAt?: string }> {
  const mode = options?.mode === "chat" ? "chat" : "sandbox";
  const reason = options?.reason ?? "milestone";
  const force = options?.force === true;
  const key = threadSummaryKey(userId, conversationId, mode);
  const allMessages = db
    .prepare(
      "SELECT role, content, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
    )
    .all(conversationId, userId) as Array<{
    role: string;
    content: string;
    created_at: string;
  }>;

  if (allMessages.length === 0) {
    return { triggered: false };
  }

  // Forced runs (manual button + mode-exit) summarize whatever exists so
  // operators can validate compaction without first crossing the rolling
  // window threshold.
  const olderMessages = force
    ? allMessages
    : allMessages.slice(0, -RECENT_WINDOW_SIZE);
  // Non-forced runs still no-op if nothing sits outside the live window.
  if (olderMessages.length === 0) {
    return { triggered: false };
  }

  const priorSummary = getLatestThreadSummary(db, userId, conversationId, mode);
  const priorBlock = priorSummary
    ? `[Prior summary]\n${priorSummary}\n\n`
    : "";
  const messagesBlock = olderMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  if (threadSummaryInFlight.has(key) && !force) {
    return { triggered: false };
  }
  threadSummaryInFlight.add(key);
  let compact: string;
  try {
    compact = await auxiliaryProvider.generateResponse([
      { role: "system", content: ROLLING_COMPACT_PROMPT },
      {
        role: "user",
        content: `${priorBlock}[Earlier messages to fold in]\n${messagesBlock}`,
      },
    ]);
  } finally {
    threadSummaryInFlight.delete(key);
  }

  if (!compact || compact.trim().length === 0) {
    return { triggered: false };
  }
  let displaySummary: string | undefined;
  if (mode === "chat") {
    try {
      const recapRaw = await auxiliaryProvider.generateResponse([
        { role: "system", content: CHAT_VISIBLE_RECAP_PROMPT },
        { role: "user", content: compact.trim() },
      ]);
      const recap = recapRaw.trim();
      if (recap.length > 0) {
        displaySummary = recap;
      }
    } catch {
      // Fallback below keeps chat UI resilient even if recap rewrite fails.
    }
    if (!displaySummary) {
      const firstSentence = compact
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/)[0]
        ?.trim();
      displaySummary = firstSentence && firstSentence.length > 0
        ? `We were just talking about this: ${firstSentence}`
        : "We were just in the middle of your conversation, and I can pick it right back up.";
    }
  }

  const summaryId = randomId(12);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    summaryId,
    userId,
    conversationId,
    encodeSummaryRecord({
      v: 1,
      kind: SUMMARY_KIND_THREAD_COMPACT,
      mode,
      summary: compact.trim(),
      ...(displaySummary ? { displaySummary } : {}),
      reason,
      createdAt: now,
    }),
    now
  );
  // Chat-mode now persists conversation transcripts by default, matching
  // normal saved Prism conversation behavior.
  return { triggered: true, latestSummary: compact.trim(), latestSummaryAt: now };
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
  conversationId: string,
  mode: ChatMode = "sandbox"
): string | null {
  const rows = db
    .prepare(
      "SELECT summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 25"
    )
    .all(userId, conversationId) as Array<{ summary?: string }>;
  for (const row of rows) {
    if (typeof row.summary !== "string") continue;
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded) continue;
    if (decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) continue;
    const decodedMode = decoded.mode === "chat" ? "chat" : "sandbox";
    if (decodedMode !== mode) continue;
    return decoded.summary;
  }
  return null;
}

export function getLatestThreadDisplaySummary(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: ChatMode = "sandbox"
): string | null {
  const rows = db
    .prepare(
      "SELECT summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 25"
    )
    .all(userId, conversationId) as Array<{ summary?: string }>;
  for (const row of rows) {
    if (typeof row.summary !== "string") continue;
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded) continue;
    if (decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) continue;
    const decodedMode = decoded.mode === "chat" ? "chat" : "sandbox";
    if (decodedMode !== mode) continue;
    if (mode === "chat") {
      return decoded.displaySummary ?? decoded.summary;
    }
    return decoded.summary;
  }
  return null;
}

export function clearThreadCompactions(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: ChatMode
): number {
  const rows = db
    .prepare(
      "SELECT id, summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC"
    )
    .all(userId, conversationId) as Array<{ id: string; summary: string }>;
  const targetIds = rows
    .filter((row) => {
      const decoded = decodeSummaryRecord(row.summary);
      if (!decoded || decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) return false;
      const decodedMode = decoded.mode === "chat" ? "chat" : "sandbox";
      return decodedMode === mode;
    })
    .map((row) => row.id);
  if (targetIds.length === 0) return 0;
  const deleteStatement = db.prepare(
    "DELETE FROM memory_summaries WHERE id = ? AND user_id = ? AND conversation_id = ?"
  );
  let deleted = 0;
  for (const id of targetIds) {
    const result = deleteStatement.run(id, userId, conversationId);
    deleted += Number(result.changes ?? 0);
  }
  return deleted;
}

export function getThreadCompactionDebug(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: ChatMode
): ThreadSummaryDebug {
  const rows = db
    .prepare(
      "SELECT summary, created_at FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 80"
    )
    .all(userId, conversationId) as Array<{ summary: string; created_at: string }>;
  const matchingRows = rows.filter((row) => {
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded || decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) return false;
    const decodedMode = decoded.mode === "chat" ? "chat" : "sandbox";
    return decodedMode === mode;
  });
  const latest = matchingRows[0];
  const latestDecoded = latest ? decodeSummaryRecord(latest.summary) : null;
  const totalMessages = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND conversation_id = ?"
      )
      .get(userId, conversationId) as { n: number }
  ).n;
  const messagesSinceLastCompaction = latest
    ? (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND conversation_id = ? AND created_at > ?"
          )
          .get(userId, conversationId, latest.created_at) as { n: number }
      ).n
    : totalMessages;
  return {
    mode,
    conversationId,
    inProgress: threadSummaryInFlight.has(threadSummaryKey(userId, conversationId, mode)),
    latestSummary:
      latestDecoded && latestDecoded.kind === SUMMARY_KIND_THREAD_COMPACT
        ? latestDecoded.summary
        : null,
    latestSummaryAt: latest?.created_at ?? null,
    summaryCount: matchingRows.length,
    totalMessages,
    messagesSinceLastCompaction,
  };
}

export function isThreadCompactionInProgress(
  userId: string,
  conversationId: string,
  mode: ChatMode
): boolean {
  return threadSummaryInFlight.has(threadSummaryKey(userId, conversationId, mode));
}

export { RECENT_WINDOW_SIZE };
