import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { randomId } from "./security.ts";
import { embedTextLocal, type LlmProvider } from "./providers.ts";
import { upsertVector, ensureCollection, searchVectors } from "./qdrant.ts";
import { persistMemoryCandidates, retrieveRecentMemoriesForStarter } from "./memory.ts";
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
const CHAT_VISIBLE_RECAP_PROMPT = `Rewrite the technical summary as one ultra-short internal thought from the assistant. Use first-person assistant voice only (I / my), present tense, and keep focus on the user's current goal. Length: 8-16 words, one sentence max. Start with "I'm". Do not use "we", "me and", or third-person references to the assistant/bot. No markdown, bullets, labels, or prefixes.`;
const SANDBOX_BOT_STATUS_RECAP_PROMPT = `Write one short internal thought from the bot's perspective about where things stand right now. Prioritize evidence in this order: (1) remembered user facts, (2) latest conversation context, (3) mood/relationship trend across sessions. Use first-person bot voice only (I / my), present tense. Length: 12-28 words, one sentence max. Start with "I'm". The sentence must be a complete thought and must not end with a dangling article/preposition (for example: "the", "a", "an", "to", "for", "with", "of"). The input includes a "User name" value — refer to that person by that exact name (or possessive form) and never as "the user" or "user". Do not use "we", "me and", or third-person references to the bot. Do not mention metadata, message counts, or that this is a summary. No markdown, bullets, labels, or prefixes.`;

/**
 * How many most-recent messages stay verbatim in the live prompt window.
 * Summarization kicks in when the conversation grows beyond this, so
 * anything older than the tail has been compacted into a rolling summary
 * instead of rolling off silently.
 */
const RECENT_WINDOW_SIZE = 30;
const SANDBOX_BOT_RECAP_SOURCE_LIMIT = 8;
const SUMMARY_KIND_CHAT_FACTS = "chat_facts";
const SUMMARY_KIND_THREAD_COMPACT = "thread_compact";
const SUMMARY_KIND_SANDBOX_BOT_STATUS = "sandbox_bot_status";
const DISPLAY_SUMMARY_MAX_WORDS = 16;
const DISPLAY_SUMMARY_MAX_CHARS = 140;
const SANDBOX_BOT_STATUS_FORMAT_VERSION = 3;

type EncodedSummaryRecord = {
  v: 1;
  kind:
    | typeof SUMMARY_KIND_CHAT_FACTS
    | typeof SUMMARY_KIND_THREAD_COMPACT
    | typeof SUMMARY_KIND_SANDBOX_BOT_STATUS;
  summary: string;
  displaySummary?: string;
  mode?: ChatMode;
  botId?: string;
  sourceFingerprint?: string;
  reason?: "milestone" | "mode_exit" | "manual";
  createdAt?: string;
};
type EncodedSandboxBotStatusRecord = EncodedSummaryRecord & {
  kind: typeof SUMMARY_KIND_SANDBOX_BOT_STATUS;
  botId: string;
};

type ThreadSummaryDebug = {
  mode: ChatMode;
  conversationId: string;
  inProgress: boolean;
  latestSummary: string | null;
  latestDisplaySummary: string | null;
  latestSummaryAt: string | null;
  summaryCount: number;
  totalMessages: number;
  messagesSinceLastCompaction: number;
};

const threadSummaryInFlight = new Set<string>();

function threadSummaryKey(userId: string, conversationId: string, mode: ChatMode): string {
  return `${userId}:${conversationId}:${mode}`;
}

function normalizeThreadSummaryMode(mode: ChatMode | undefined): "zen" | "sandbox" {
  return mode === "zen" || mode === "chat" ? "zen" : "sandbox";
}

function normalizeDisplaySummary(raw: string, fallback: string): string {
  const oneLine = raw
    .replace(/\s+/g, " ")
    .replace(/^summary:\s*/i, "")
    .trim();
  const firstSentence = oneLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const candidate = firstSentence || oneLine || fallback;
  const words = candidate.split(/\s+/).filter(Boolean);
  const wordClamped = words.slice(0, DISPLAY_SUMMARY_MAX_WORDS).join(" ").trim();
  const charClamped =
    wordClamped.length > DISPLAY_SUMMARY_MAX_CHARS
      ? `${wordClamped.slice(0, DISPLAY_SUMMARY_MAX_CHARS - 3).trimEnd()}...`
      : wordClamped;
  if (!charClamped) return fallback;
  if (!/\S/.test(charClamped)) return fallback;
  return /[.!?]$/.test(charClamped) ? charClamped : `${charClamped}.`;
}

function possessiveName(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function replaceUserReferencesWithName(text: string, userName: string): string {
  const trimmedName = userName.trim();
  if (!trimmedName || trimmedName.toLowerCase() === "you") return text;
  const possessive = possessiveName(trimmedName);
  return text
    .replace(/\bthe user's\b/gi, possessive)
    .replace(/\buser's\b/gi, possessive)
    .replace(/\bthe user\b/gi, trimmedName)
    .replace(/\buser\b/gi, trimmedName);
}

function normalizeBotThoughtSummary(raw: string, fallback: string, userName: string): string {
  const oneLine = raw
    .replace(/\s+/g, " ")
    .replace(/^summary:\s*/i, "")
    .trim();
  const base = oneLine || fallback;
  const firstSentence = base.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const sentenceCandidate = firstSentence || base;
  const withoutTerminal = sentenceCandidate.replace(/[.!?]+$/, "").trim();
  let thought = withoutTerminal
    .replace(/^I am\b/i, "I'm")
    .replace(/\bwe['’]ve\b/gi, "I've")
    .replace(/\bwe['’]re\b/gi, "I'm")
    .replace(/\bwe['’]ll\b/gi, "I'll")
    .replace(/\bwe['’]d\b/gi, "I'd");
  if (!/^I['’]m\b/i.test(thought)) {
    thought = thought.charAt(0).toLowerCase() + thought.slice(1);
    thought = `I'm ${thought}`.replace(/\s+/g, " ").trim();
  }
  thought = thought
    .replace(/\bwe\b/gi, "I")
    .replace(/\bour\b/gi, "my")
    .replace(/\bus\b/gi, "me");
  thought = replaceUserReferencesWithName(thought, userName);
  // Guard against clipped-looking endings like "ease the." even when the
  // model output is technically punctuated.
  thought = thought.replace(
    /\s+(the|a|an|to|for|with|of|on|at|in|and|or|but)\.?$/i,
    ""
  ).trim();
  if (thought.endsWith("…")) return thought;
  return /[.!?]$/.test(thought) ? thought : `${thought}.`;
}

function botStatusSourceFingerprint(args: {
  botId: string;
  latestConversationLine: string;
  sourceLines: string[];
  rememberedFactLines: string[];
  moodLines: string[];
}): string {
  const payload = JSON.stringify({
    formatVersion: SANDBOX_BOT_STATUS_FORMAT_VERSION,
    botId: args.botId,
    latestConversationLine: args.latestConversationLine,
    sourceLines: args.sourceLines,
    rememberedFactLines: args.rememberedFactLines,
    moodLines: args.moodLines,
  });
  return createHash("sha256").update(payload).digest("hex");
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
      (
        parsed.kind === SUMMARY_KIND_CHAT_FACTS ||
        parsed.kind === SUMMARY_KIND_THREAD_COMPACT ||
        parsed.kind === SUMMARY_KIND_SANDBOX_BOT_STATUS
      ) &&
      typeof parsed.summary === "string" &&
      parsed.summary.trim().length > 0
    ) {
      if (
        parsed.kind === SUMMARY_KIND_SANDBOX_BOT_STATUS &&
        typeof parsed.botId === "string" &&
        parsed.botId.trim().length > 0
      ) {
        return {
          v: 1,
          kind: SUMMARY_KIND_SANDBOX_BOT_STATUS,
          mode: "sandbox",
          botId: parsed.botId.trim(),
          summary: parsed.summary.trim(),
          displaySummary:
            typeof parsed.displaySummary === "string" && parsed.displaySummary.trim().length > 0
              ? parsed.displaySummary.trim()
              : undefined,
          sourceFingerprint:
            typeof parsed.sourceFingerprint === "string" &&
            parsed.sourceFingerprint.trim().length > 0
              ? parsed.sourceFingerprint.trim()
              : undefined,
          reason: parsed.reason,
          createdAt: parsed.createdAt,
        };
      }
      if (parsed.kind === SUMMARY_KIND_THREAD_COMPACT) {
        const mode = normalizeThreadSummaryMode(parsed.mode as ChatMode | undefined);
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
      if (parsed.kind === SUMMARY_KIND_CHAT_FACTS) {
        return {
          v: 1,
          kind: SUMMARY_KIND_CHAT_FACTS,
          summary: parsed.summary.trim(),
          reason: parsed.reason,
          createdAt: parsed.createdAt,
        };
      }
      return null;
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
      mode: "zen",
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
  const mode = normalizeThreadSummaryMode(options?.mode);
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
  if (mode === "zen") {
    try {
      const recapRaw = await auxiliaryProvider.generateResponse([
        { role: "system", content: CHAT_VISIBLE_RECAP_PROMPT },
        { role: "user", content: compact.trim() },
      ]);
      const recap = recapRaw.trim();
      if (recap.length > 0) {
        displaySummary = normalizeDisplaySummary(
          recap,
          "I'm tracking your goal and ready to continue right where we left off."
        );
      }
    } catch {
      // Fallback below keeps chat UI resilient even if recap rewrite fails.
    }
    if (!displaySummary) {
      displaySummary = normalizeDisplaySummary(
        compact,
        "I'm tracking your goal and ready to continue right where we left off."
      );
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
  const requestedMode = normalizeThreadSummaryMode(mode);
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
    const decodedMode = normalizeThreadSummaryMode(decoded.mode);
    if (decodedMode !== requestedMode) continue;
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
  const requestedMode = normalizeThreadSummaryMode(mode);
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
    const decodedMode = normalizeThreadSummaryMode(decoded.mode);
    if (decodedMode !== requestedMode) continue;
    if (requestedMode === "zen") {
      return decoded.displaySummary ?? decoded.summary;
    }
    return decoded.summary;
  }
  return null;
}

export function getLatestSandboxBotStatusSummary(
  db: DatabaseSync,
  userId: string,
  botId: string
): string | null {
  const latest = getLatestSandboxBotStatusRecord(db, userId, botId);
  if (!latest) return null;
  return latest.displaySummary ?? latest.summary;
}

function getLatestSandboxBotStatusRecord(
  db: DatabaseSync,
  userId: string,
  botId: string
): EncodedSandboxBotStatusRecord | null {
  const rows = db
    .prepare(
      "SELECT summary FROM memory_summaries WHERE user_id = ? AND conversation_id IS NULL ORDER BY created_at DESC LIMIT 120"
    )
    .all(userId) as Array<{ summary?: string }>;
  for (const row of rows) {
    if (typeof row.summary !== "string") continue;
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded || decoded.kind !== SUMMARY_KIND_SANDBOX_BOT_STATUS) continue;
    if (decoded.botId !== botId) continue;
    return decoded as EncodedSandboxBotStatusRecord;
  }
  return null;
}

function clearSandboxBotStatusSummaries(
  db: DatabaseSync,
  userId: string,
  botId: string
): number {
  const rows = db
    .prepare(
      "SELECT id, summary FROM memory_summaries WHERE user_id = ? AND conversation_id IS NULL ORDER BY created_at DESC LIMIT 120"
    )
    .all(userId) as Array<{ id?: string; summary?: string }>;
  const staleIds = rows
    .filter((row) => {
      if (typeof row.id !== "string" || typeof row.summary !== "string") return false;
      const decoded = decodeSummaryRecord(row.summary);
      return (
        decoded?.kind === SUMMARY_KIND_SANDBOX_BOT_STATUS &&
        decoded.botId === botId
      );
    })
    .map((row) => row.id as string);
  if (staleIds.length === 0) return 0;
  const placeholders = staleIds.map(() => "?").join(", ");
  const deleted = db
    .prepare(`DELETE FROM memory_summaries WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...staleIds);
  return Number(deleted.changes ?? 0);
}

export async function summarizeSandboxBotStatus(
  db: DatabaseSync,
  auxiliaryProvider: LlmProvider,
  userId: string,
  botId: string,
  options?: {
    reason?: "milestone" | "mode_exit" | "manual";
    userKey?: Buffer;
  }
): Promise<{ triggered: boolean; latestSummary?: string; latestSummaryAt?: string }> {
  const userRow = db
    .prepare("SELECT display_name FROM users WHERE id = ? LIMIT 1")
    .get(userId) as { display_name?: string } | undefined;
  const userName =
    typeof userRow?.display_name === "string" && userRow.display_name.trim().length > 0
      ? userRow.display_name.trim()
      : "you";
  const bot = db
    .prepare("SELECT name FROM bots WHERE id = ? AND user_id = ?")
    .get(botId, userId) as { name?: string } | undefined;
  const botName =
    typeof bot?.name === "string" && bot.name.trim().length > 0
      ? bot.name.trim()
      : "this bot";
  const conversations = db
    .prepare(
      `SELECT id, title
       FROM conversations
       WHERE user_id = ?
         AND bot_id = ?
         AND incognito = 0
         AND conversation_mode = 'sandbox'
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(userId, botId, SANDBOX_BOT_RECAP_SOURCE_LIMIT) as Array<{
    id: string;
    title: string;
  }>;
  const sourceLines: string[] = [];
  for (const conversation of conversations) {
    const compact = getLatestThreadDisplaySummary(db, userId, conversation.id, "sandbox");
    if (compact) {
      sourceLines.push(`- ${conversation.title}: ${compact}`);
      continue;
    }
    const recentMessages = db
      .prepare(
        `SELECT role, content
         FROM messages
         WHERE user_id = ? AND conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 4`
      )
      .all(userId, conversation.id) as Array<{ role: string; content: string }>;
    if (recentMessages.length === 0) continue;
    const stitched = recentMessages
      .slice()
      .reverse()
      .map((message) => `${message.role}: ${message.content}`)
      .join(" ");
    const trimmed = stitched.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    sourceLines.push(`- ${conversation.title}: ${trimmed}`);
  }
  const rememberedFactLines: string[] = [];
  if (options?.userKey) {
    const memories = retrieveRecentMemoriesForStarter(db, userId, options.userKey, botId, 5);
    for (const memory of memories) {
      const fact = memory.text.replace(/\s+/g, " ").trim();
      if (fact && !rememberedFactLines.includes(fact)) {
        rememberedFactLines.push(fact);
      }
      if (rememberedFactLines.length >= 5) {
        break;
      }
    }
  }
  const botOpinion = db
    .prepare(
      `SELECT score, band, trend, last_reason
       FROM bot_opinions
       WHERE user_id = ? AND bot_scope_key = ?
       LIMIT 1`
    )
    .get(userId, botId) as {
    score?: number;
    band?: string;
    trend?: string;
    last_reason?: string;
  } | undefined;
  const sessionOpinionRows = db
    .prepare(
      `SELECT score, trend, last_reason, updated_at
       FROM session_opinions
       WHERE user_id = ? AND bot_scope_key = ?
       ORDER BY updated_at DESC
       LIMIT 4`
    )
    .all(userId, botId) as Array<{
    score?: number;
    trend?: string;
    last_reason?: string;
    updated_at?: string;
  }>;
  const moodLines: string[] = [];
  if (botOpinion) {
    const relationshipLine = [
      typeof botOpinion.band === "string" && botOpinion.band.trim().length > 0
        ? `relationship band: ${botOpinion.band.trim()}`
        : null,
      typeof botOpinion.trend === "string" && botOpinion.trend.trim().length > 0
        ? `trend: ${botOpinion.trend.trim()}`
        : null,
      typeof botOpinion.score === "number" && Number.isFinite(botOpinion.score)
        ? `score: ${Math.round(botOpinion.score)}`
        : null,
    ].filter(Boolean).join(", ");
    if (relationshipLine) moodLines.push(relationshipLine);
    if (typeof botOpinion.last_reason === "string" && botOpinion.last_reason.trim().length > 0) {
      moodLines.push(`latest reason: ${botOpinion.last_reason.trim()}`);
    }
  }
  for (const row of sessionOpinionRows) {
    const reason = typeof row.last_reason === "string" ? row.last_reason.trim() : "";
    const trend = typeof row.trend === "string" ? row.trend.trim() : "";
    const score = typeof row.score === "number" && Number.isFinite(row.score)
      ? Math.round(row.score)
      : null;
    const parts = [
      trend ? `trend ${trend}` : null,
      score !== null ? `score ${score}` : null,
      reason ? `reason: ${reason}` : null,
    ].filter(Boolean).join(", ");
    if (parts) moodLines.push(parts);
    if (moodLines.length >= 5) break;
  }
  if (
    sourceLines.length === 0 &&
    rememberedFactLines.length === 0 &&
    moodLines.length === 0
  ) {
    clearSandboxBotStatusSummaries(db, userId, botId);
    return { triggered: false };
  }
  const latestConversationLine = sourceLines[0] ?? "";
  const sourceFingerprint = botStatusSourceFingerprint({
    botId,
    latestConversationLine,
    sourceLines,
    rememberedFactLines,
    moodLines,
  });
  const latestStoredStatus = getLatestSandboxBotStatusRecord(db, userId, botId);
  if (latestStoredStatus?.sourceFingerprint === sourceFingerprint) {
    return {
      triggered: false,
      latestSummary: latestStoredStatus.displaySummary ?? latestStoredStatus.summary,
      latestSummaryAt: latestStoredStatus.createdAt,
    };
  }
  const recapRaw = await auxiliaryProvider.generateResponse([
    { role: "system", content: SANDBOX_BOT_STATUS_RECAP_PROMPT },
    {
      role: "user",
      content: [
        `Bot name: ${botName}`,
        `User name: ${userName}`,
        rememberedFactLines.length > 0
          ? `\n[Remembered user facts]\n${rememberedFactLines.map((line) => `- ${line}`).join("\n")}`
          : "",
        latestConversationLine
          ? `\n[Latest conversation]\n${latestConversationLine}`
          : "",
        `\n[Recent conversations]\n${sourceLines.join("\n")}`,
        moodLines.length > 0
          ? `\n[Mood and relationship trend across sessions]\n${moodLines.map((line) => `- ${line}`).join("\n")}`
          : "",
      ].join(""),
    },
  ]);
  const recap = recapRaw.trim();
  const userDirectionPhrase =
    userName.toLowerCase() === "you" ? "your" : possessiveName(userName);
  const displaySummary = normalizeBotThoughtSummary(
    recap.length > 0
      ? recap
      : `I'm staying aligned with ${userDirectionPhrase} direction and keeping momentum moving forward.`,
    `I'm staying aligned with ${userDirectionPhrase} direction and keeping momentum moving forward.`,
    userName
  );
  const now = new Date().toISOString();
  const reason = options?.reason ?? "mode_exit";
  db.prepare(
    "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, NULL, ?, ?)"
  ).run(
    randomId(12),
    userId,
    encodeSummaryRecord({
      v: 1,
      kind: SUMMARY_KIND_SANDBOX_BOT_STATUS,
      mode: "sandbox",
      botId,
      summary: displaySummary,
      displaySummary,
      sourceFingerprint,
      reason,
      createdAt: now,
    }),
    now
  );
  return { triggered: true, latestSummary: displaySummary, latestSummaryAt: now };
}

export function clearThreadCompactions(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: ChatMode
): number {
  const requestedMode = normalizeThreadSummaryMode(mode);
  const rows = db
    .prepare(
      "SELECT id, summary FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC"
    )
    .all(userId, conversationId) as Array<{ id: string; summary: string }>;
  const targetIds = rows
    .filter((row) => {
      const decoded = decodeSummaryRecord(row.summary);
      if (!decoded || decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) return false;
      const decodedMode = normalizeThreadSummaryMode(decoded.mode);
      return decodedMode === requestedMode;
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
  const requestedMode = normalizeThreadSummaryMode(mode);
  const rows = db
    .prepare(
      "SELECT summary, created_at FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 80"
    )
    .all(userId, conversationId) as Array<{ summary: string; created_at: string }>;
  const matchingRows = rows.filter((row) => {
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded || decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) return false;
    const decodedMode = normalizeThreadSummaryMode(decoded.mode);
    return decodedMode === requestedMode;
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
    mode: requestedMode,
    conversationId,
    inProgress: threadSummaryInFlight.has(threadSummaryKey(userId, conversationId, requestedMode)),
    latestSummary:
      latestDecoded && latestDecoded.kind === SUMMARY_KIND_THREAD_COMPACT
        ? latestDecoded.summary
        : null,
    latestDisplaySummary:
      latestDecoded && latestDecoded.kind === SUMMARY_KIND_THREAD_COMPACT
        ? requestedMode === "zen"
          ? latestDecoded.displaySummary ?? latestDecoded.summary
          : latestDecoded.summary
        : null,
    latestSummaryAt: latest?.created_at ?? null,
    summaryCount: matchingRows.length,
    totalMessages,
    messagesSinceLastCompaction,
  };
}

/** Latest compaction that covered the whole thread, safe to use as a raw-history cutoff. */
export function getLatestFullThreadCompactionCutoff(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  mode: ChatMode
): string | null {
  const requestedMode = normalizeThreadSummaryMode(mode);
  const rows = db
    .prepare(
      "SELECT summary, created_at FROM memory_summaries WHERE user_id = ? AND conversation_id = ? ORDER BY created_at DESC LIMIT 80"
    )
    .all(userId, conversationId) as Array<{ summary: string; created_at: string }>;
  for (const row of rows) {
    const decoded = decodeSummaryRecord(row.summary);
    if (!decoded || decoded.kind !== SUMMARY_KIND_THREAD_COMPACT) continue;
    const decodedMode = normalizeThreadSummaryMode(decoded.mode);
    if (decodedMode !== requestedMode) continue;
    if (decoded.reason === "manual" || decoded.reason === "mode_exit") {
      return row.created_at;
    }
  }
  return null;
}

export function isThreadCompactionInProgress(
  userId: string,
  conversationId: string,
  mode: ChatMode
): boolean {
  return threadSummaryInFlight.has(
    threadSummaryKey(userId, conversationId, normalizeThreadSummaryMode(mode))
  );
}

export { RECENT_WINDOW_SIZE };
