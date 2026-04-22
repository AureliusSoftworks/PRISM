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
  retrieveMemorySummaries,
  summarizeAndStoreMemories,
} from "./memory-summarizer.ts";
import type { ChatMessage, Conversation } from "@localai/shared";

export interface UserChatSettings {
  preferredProvider: "local" | "openai";
  autoMemory: boolean;
  openAiApiKey?: string;
  botId?: string;
  incognito?: boolean;
  botSystemPrompt?: string;
  /** Optional per-bot generation overrides, forwarded to the provider. */
  botOverrides?: GenerateOptions;
}

/** How long (ms) to wait on memory retrieval before skipping memory hints. */
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
  }));
}

function buildPromptMessages(
  memoryLines: string[],
  chatHistory: ChatMessage[],
  userMessage: string,
  botSystemPrompt?: string
): ProviderMessage[] {
  const promptMessages: ProviderMessage[] = [];
  if (botSystemPrompt) {
    promptMessages.push({ role: "system", content: botSystemPrompt });
  }
  if (memoryLines.length > 0) {
    promptMessages.push({
      role: "system",
      content: `User memory hints:\n${memoryLines
        .map((line) => `- ${line}`)
        .join("\n")}`,
    });
  }
  promptMessages.push(
    ...chatHistory.map((item) => ({
      role: item.role,
      content: item.content,
    }))
  );
  promptMessages.push({ role: "user", content: userMessage });
  return promptMessages;
}

/**
 * Run both memory lookups in parallel with a short overall timeout.
 * A failure or timeout returns no hints so chat always proceeds.
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
  const provider = selectProvider(
    settings.preferredProvider,
    settings.openAiApiKey
  );

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
      settings.incognito ? 1 : 0,
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

  const historyRows = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.created_at,
              b.name AS bot_name, b.color AS bot_color
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at ASC
       LIMIT 30`
    )
    .all(activeConversationId, userId) as MessageRow[];
  const history = hydrateMessages(historyRows);

  const memoryLines = settings.incognito
    ? []
    : await retrieveMemoriesWithFallback(db, provider, userId, message, userKey);

  const promptMessages = buildPromptMessages(
    memoryLines,
    history,
    message,
    settings.botSystemPrompt
  );

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

  db.prepare(
    "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(assistantCreatedAt, activeConversationId, userId);

  if (settings.autoMemory && !settings.incognito) {
    const candidates = extractMemoryCandidates(message);
    if (candidates.length > 0) {
      await persistMemoryCandidates(db, provider, userId, candidates, userKey);
    }
    // `history` was captured BEFORE this turn's two inserts, so the total
    // message count after the turn is history.length + 2.
    const totalMessages = history.length + 2;
    if (shouldSummarizeAtMilestone(totalMessages)) {
      summarizeAndStoreMemories(
        db,
        provider,
        userId,
        activeConversationId
      ).catch(() => {});
    }
  }

  const conversationRow = db
    .prepare(
      "SELECT id, user_id, title, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?"
    )
    .get(activeConversationId, userId) as {
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  };

  const messageRows = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.created_at,
              b.name AS bot_name, b.color AS bot_color
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
    createdAt: conversationRow.created_at,
    updatedAt: conversationRow.updated_at,
    messages: hydrateMessages(messageRows),
  };
}
