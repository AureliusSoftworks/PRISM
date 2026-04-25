import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";
import {
  extractMemoryCandidates,
  persistMemoryCandidates,
  retrieveRelevantMemories,
} from "./memory.ts";
import {
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";
import {
  RECENT_WINDOW_SIZE,
  getLatestThreadSummary,
  retrieveMemorySummaries,
  summarizeAndStoreMemories,
  summarizeThreadCompact,
} from "./memory-summarizer.ts";
import type { ChatMessage, ChatMode, Conversation } from "@localai/shared";

export interface UserChatSettings {
  preferredProvider: "local" | "openai";
  autoMemory: boolean;
  openAiApiKey?: string;
  /**
   * Tri-valued by design:
   *   - undefined → client didn't send a botId (leave conversation's
   *     existing bot_id alone; new conversations fall back to null).
   *   - null      → explicit "Default persona" (no bot). On existing
   *     conversations, persists the switch to default.
   *   - string    → specific bot id.
   * The tri-state is what lets a mid-thread bot switch persist to the
   * conversation row without also nuking the bot_id for every legacy
   * caller that forgets to include the field.
   */
  botId?: string | null;
  incognito?: boolean;
  botSystemPrompt?: string;
  /** Optional per-bot generation overrides, forwarded to the provider. */
  botOverrides?: GenerateOptions;
  /**
   * Which post-auth surface the request originated from. Changes what
   * "memory" means for this turn:
   *   - "chat": cross-thread personal-fact memory + Qdrant summary recall.
   *     Honors `incognito` as a force-offline + skip-memory shortcut.
   *   - "sandbox": NO cross-thread memory. Thread-scoped rolling
   *     compaction only — silent, invisible in the sidebar, never
   *     retrievable from other conversations.
   * Defaults to "sandbox" because that's the no-side-effects posture if
   * the server can't tell what the client meant.
   */
  mode?: ChatMode;
}

/** How long (ms) to wait on cross-thread memory retrieval before skipping hints. */
const MEMORY_RETRIEVAL_TIMEOUT_MS = 1500;

function generateConversationTitle(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Untitled chat";
  }
  return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed;
}

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
  created_at: string;
};

function hydrateMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    provider:
      row.provider === "local" || row.provider === "openai"
        ? row.provider
        : undefined,
    botName: row.bot_name ? row.bot_name : undefined,
    botColor: row.bot_color ? row.bot_color : undefined,
    botGlyph: row.bot_glyph ? row.bot_glyph : undefined,
  }));
}

/**
 * Assemble the final system+history payload the provider actually sees.
 *
 * Order is deliberate:
 *   1. Bot persona (if any)
 *   2. Thread-compaction summary (Sandbox rolling context — present ONLY
 *      once the conversation has grown past the live window)
 *   3. Cross-thread memory hints (Chat mode only)
 *   4. Raw recent history (already chronological)
 *   5. The new user message
 *
 * Summary and cross-thread hints are mutually exclusive in practice —
 * Sandbox never produces hints and Chat never produces a thread summary
 * prefix — but the function stays agnostic so a future hybrid mode could
 * use both.
 */
function buildPromptMessages(args: {
  botSystemPrompt?: string;
  threadSummary?: string | null;
  memoryLines: string[];
  chatHistory: ChatMessage[];
  userMessage: string;
}): ProviderMessage[] {
  const promptMessages: ProviderMessage[] = [];
  if (args.botSystemPrompt) {
    promptMessages.push({ role: "system", content: args.botSystemPrompt });
  }
  if (args.threadSummary && args.threadSummary.trim().length > 0) {
    promptMessages.push({
      role: "system",
      content: `Earlier in this thread (compacted context):\n${args.threadSummary.trim()}`,
    });
  }
  if (args.memoryLines.length > 0) {
    promptMessages.push({
      role: "system",
      content: `User memory hints:\n${args.memoryLines
        .map((line) => `- ${line}`)
        .join("\n")}`,
    });
  }
  promptMessages.push(
    ...args.chatHistory.map((item) => ({
      role: item.role,
      content: item.content,
    }))
  );
  promptMessages.push({ role: "user", content: args.userMessage });
  return promptMessages;
}

/**
 * Chat-mode cross-thread retrieval. Runs personal-fact lookup and Qdrant
 * summary similarity in parallel under a short timeout so chat always
 * proceeds even if one path is slow or down.
 */
async function retrieveMemoriesWithFallback(
  db: DatabaseSync,
  provider: LlmProvider,
  userId: string,
  message: string,
  userKey: Buffer
): Promise<string[]> {
  const timeoutSentinel = Symbol("memory-timeout");
  const timeout = new Promise<typeof timeoutSentinel>((resolve) => {
    setTimeout(() => resolve(timeoutSentinel), MEMORY_RETRIEVAL_TIMEOUT_MS);
  });
  const retrieval = Promise.allSettled([
    retrieveRelevantMemories(db, provider, userId, message, userKey),
    retrieveMemorySummaries(provider, userId, message),
  ]);

  const result = await Promise.race([retrieval, timeout]);
  if (result === timeoutSentinel) {
    return [];
  }

  const lines: string[] = [];
  const [encrypted, summaries] = result;
  if (encrypted.status === "fulfilled") {
    lines.push(...encrypted.value.map((m) => m.text));
  }
  if (summaries.status === "fulfilled") {
    lines.push(...summaries.value.map((m) => m.text));
  }
  return lines;
}

/**
 * Only run the (expensive) background summarization at milestones so it does
 * not monopolize the single-process Ollama instance and block the next turn.
 * Milestones: every 6 messages until 24, then every 12 thereafter.
 */
function shouldSummarizeAtMilestone(totalMessages: number): boolean {
  if (totalMessages < 6) {
    return false;
  }
  if (totalMessages <= 24) {
    return totalMessages % 6 === 0;
  }
  return totalMessages % 12 === 0;
}

export async function processChatMessage(
  db: DatabaseSync,
  userId: string,
  message: string,
  userKey: Buffer,
  settings: UserChatSettings,
  conversationId?: string
): Promise<Conversation> {
  const now = new Date().toISOString();
  const mode: ChatMode = settings.mode ?? "sandbox";
  // Incognito is a Chat-mode concept (see shared types): flips this turn
  // offline AND skips all memory. We force LOCAL below as defense in
  // depth so a misbehaving client can't route an incognito turn to a
  // remote provider. Sandbox ignores `incognito` entirely — the UI
  // doesn't surface it there and the concept doesn't apply.
  const incognitoForTurn = mode === "chat" && settings.incognito === true;
  const effectiveProvider = incognitoForTurn
    ? "local"
    : settings.preferredProvider;
  // The three memory concerns are deliberately NOT one flag:
  //   - skipPersonalFacts: don't write to `memories` (cross-thread facts).
  //     True for Sandbox (thread isolation) AND incognito (leave no trace).
  //   - skipSummarization: don't run any summarizer. True only for
  //     incognito — Sandbox still summarizes, just into a thread-scoped,
  //     Qdrant-free path.
  //   - retrievalMode: which recall path (if any) feeds this turn's prompt.
  const skipPersonalFacts = mode === "sandbox" || incognitoForTurn;
  const skipSummarization = incognitoForTurn;
  const retrievalMode: "none" | "cross_thread" | "thread_only" =
    incognitoForTurn
      ? "none"
      : mode === "sandbox"
        ? "thread_only"
        : "cross_thread";
  const provider = selectProvider(effectiveProvider, settings.openAiApiKey);

  let activeConversationId = conversationId;
  if (!activeConversationId) {
    activeConversationId = randomId(12);
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      activeConversationId,
      userId,
      generateConversationTitle(message),
      settings.botId ?? null,
      incognitoForTurn ? 1 : 0,
      now,
      now
    );
  } else {
    const owned = db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .get(activeConversationId, userId) as { id?: string } | undefined;
    if (!owned?.id) {
      throw new Error("Conversation not found for this user.");
    }
  }

  // Fetch the NEWEST N messages (not the oldest). Prior implementation used
  // ORDER BY ASC LIMIT 30, which once a thread exceeded 30 messages froze
  // the prompt on ancient history and silently dropped every recent turn.
  // We page the latest N, then reverse to chronological order for the
  // provider. Anything older than this window is covered by the
  // thread-compaction summary in Sandbox mode.
  const historyRowsDesc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(activeConversationId, userId, RECENT_WINDOW_SIZE) as MessageRow[];
  const history = hydrateMessages(historyRowsDesc.slice().reverse());

  let threadSummary: string | null = null;
  let memoryLines: string[] = [];
  if (retrievalMode === "thread_only") {
    threadSummary = getLatestThreadSummary(db, userId, activeConversationId);
  } else if (retrievalMode === "cross_thread") {
    memoryLines = await retrieveMemoriesWithFallback(
      db,
      provider,
      userId,
      message,
      userKey
    );
  }

  const promptMessages = buildPromptMessages({
    botSystemPrompt: settings.botSystemPrompt,
    threadSummary,
    memoryLines,
    chatHistory: history,
    userMessage: message,
  });

  const userMessageId = randomId(12);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, bot_id, created_at) VALUES (?, ?, ?, 'user', ?, NULL, NULL, ?)"
  ).run(userMessageId, activeConversationId, userId, message, now);

  const assistantReply = await provider.generateResponse(
    promptMessages,
    settings.botOverrides
  );
  const assistantCreatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, bot_id, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)"
  ).run(
    randomId(12),
    activeConversationId,
    userId,
    assistantReply,
    provider.name,
    settings.botId ?? null,
    assistantCreatedAt
  );

  // Persist a mid-thread bot switch here (not at request-parse time) so
  // the change only "takes" if the new bot successfully produced a
  // reply. If generateResponse() throws above, we never get here and
  // the conversation's bot_id stays on its previous value — matching
  // the spec that a dropdown flip without a send doesn't stick.
  //
  // `settings.botId === undefined` means the client didn't include the
  // key (legacy callers, Sandbox, scripts) so we leave bot_id alone.
  // Explicit null (client chose "Default") and strings (specific bot)
  // both flow through as real UPDATEs.
  if (settings.botId !== undefined) {
    db.prepare(
      "UPDATE conversations SET updated_at = ?, bot_id = ? WHERE id = ? AND user_id = ?"
    ).run(
      assistantCreatedAt,
      settings.botId,
      activeConversationId,
      userId
    );
  } else {
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(assistantCreatedAt, activeConversationId, userId);
  }

  // Count live message rows for milestone gating. An earlier version
  // derived this from `history.length + 2`, but `history` is capped at
  // the recent window — so on long threads history.length stays at
  // RECENT_WINDOW_SIZE and the count would freeze at RECENT_WINDOW_SIZE
  // + 2 forever, causing the summarization milestone to NEVER fire past
  // the window. The COUNT(*) below is the post-insert truth.
  const totalMessages = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
      )
      .get(activeConversationId, userId) as { n: number }
  ).n;

  // Cross-thread personal facts: Chat mode only, non-incognito, with
  // autoMemory on. Gate is deliberately conservative so Sandbox threads
  // and incognito turns never seed the `memories` table.
  if (
    !skipPersonalFacts &&
    mode === "chat" &&
    settings.autoMemory
  ) {
    const candidates = extractMemoryCandidates(message);
    if (candidates.length > 0) {
      await persistMemoryCandidates(db, provider, userId, candidates, userKey);
    }
  }

  // Summarization runs for BOTH modes (just into different sinks):
  //   - Chat: cross-thread, indexed into Qdrant for similarity recall.
  //   - Sandbox: thread-scoped rolling compaction, SQLite only, invisible.
  // Incognito opts out completely.
  if (!skipSummarization && shouldSummarizeAtMilestone(totalMessages)) {
    if (mode === "chat" && settings.autoMemory) {
      summarizeAndStoreMemories(
        db,
        provider,
        userId,
        activeConversationId
      ).catch(() => {});
    } else if (mode === "sandbox") {
      // Thread compaction is NOT gated by autoMemory — that setting is a
      // user-facing knob for the sidebar "Memories" list, which Sandbox
      // deliberately doesn't touch. Compaction is context plumbing.
      summarizeThreadCompact(
        db,
        provider,
        userId,
        activeConversationId
      ).catch(() => {});
    }
  }

  // Row payload mirrors the GET endpoints' shape — last_bot_* plus
  // has_assistant_reply via correlated subqueries so the POST /api/chat
  // response carries the same sidebar-tint data as a
  // refreshConversations() fetch would. Without this,
  // `setDetail(d.conversation)` would briefly render stale fields
  // between send and the follow-up list refresh.
  //
  // No bot_id IS NOT NULL filter on the last_bot_* subqueries: Default
  // replies (bot_id NULL) count as "last spoken" too, and the client
  // distinguishes them from "no reply yet" via has_assistant_reply.
  const conversationRow = db
    .prepare(
      `SELECT c.id, c.user_id, c.title, c.bot_id, c.incognito, c.created_at, c.updated_at,
              (SELECT m.bot_id FROM messages m
                 WHERE m.conversation_id = c.id
                   AND m.role = 'assistant'
                 ORDER BY m.created_at DESC LIMIT 1) AS last_bot_id,
              (SELECT b.color FROM messages m
                 LEFT JOIN bots b ON b.id = m.bot_id
                 WHERE m.conversation_id = c.id
                   AND m.role = 'assistant'
                 ORDER BY m.created_at DESC LIMIT 1) AS last_bot_color,
              EXISTS (SELECT 1 FROM messages m
                        WHERE m.conversation_id = c.id
                          AND m.role = 'assistant') AS has_assistant_reply
         FROM conversations c
        WHERE c.id = ? AND c.user_id = ?`
    )
    .get(activeConversationId, userId) as {
    id: string;
    user_id: string;
    title: string;
    bot_id: string | null;
    incognito: number;
    last_bot_id: string | null;
    last_bot_color: string | null;
    has_assistant_reply: number;
    created_at: string;
    updated_at: string;
  };

  const messageRows = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(activeConversationId, userId) as MessageRow[];

  return {
    id: conversationRow.id,
    userId: conversationRow.user_id,
    title: conversationRow.title,
    botId: conversationRow.bot_id ?? null,
    incognito: conversationRow.incognito === 1,
    lastBotId: conversationRow.last_bot_id ?? null,
    lastBotColor: conversationRow.last_bot_color ?? null,
    hasAssistantReply: conversationRow.has_assistant_reply === 1,
    createdAt: conversationRow.created_at,
    updatedAt: conversationRow.updated_at,
    messages: hydrateMessages(messageRows),
  };
}
