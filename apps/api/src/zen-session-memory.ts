import type { DatabaseSync } from "node:sqlite";
import type {
  ChatMessage,
  ZenPreviousContextSummary,
  ZenSessionMemoryItem,
  ZenSessionMemoryOverview,
} from "@localai/shared";
import { decryptJson, encryptJson, randomId } from "./security.ts";
import type { LlmProvider } from "./providers.ts";
import {
  getLatestThreadDisplaySummary,
  getLatestThreadSummary,
} from "./memory-summarizer.ts";

const ZEN_SESSION_MEMORY_LIMIT = 3;
const ZEN_SESSION_MEMORY_TTL_MS = 1000 * 60 * 60 * 24 * 4;
const ZEN_SESSION_MEMORY_TITLE_MAX_CHARS = 90;
const ZEN_SESSION_MEMORY_TEXT_MAX_CHARS = 900;
const ZEN_SESSION_MEMORY_TRIGGER_MAX_CHARS = 240;
const ZEN_SESSION_MEMORY_TRANSCRIPT_MAX_MESSAGES = 12;

const ZEN_SESSION_MEMORY_EXTRACT_PROMPT = `You write short-lived session checkpoints for Prism Zen Mode.
The user has asked to pause, save, or finish the current thread later. Given only the visible transcript, extract the useful continuation state.
Return JSON only in this shape: {"title":"3-8 word label","text":"1-3 concise sentences preserving the story/task checkpoint, open variables, names, choices, and where to resume."}
Do not invent hidden text. Do not mention that this is a memory.`;

type ZenSessionMemoryPayload = {
  title: string;
  text: string;
  trigger?: string;
  sourceMessageIds?: string[];
};

type ZenSessionMemoryRow = {
  id: string;
  conversation_id: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
  expires_at: string;
};

function clampText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function readOptionalPayloadString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = clampText(value, maxChars);
  return normalized.length > 0 ? normalized : undefined;
}

function readPayloadMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 12);
}

function normalizePayload(raw: unknown): ZenSessionMemoryPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const text = readOptionalPayloadString(record.text, ZEN_SESSION_MEMORY_TEXT_MAX_CHARS);
  if (!text) return null;
  return {
    title:
      readOptionalPayloadString(record.title, ZEN_SESSION_MEMORY_TITLE_MAX_CHARS) ??
      "Session checkpoint",
    text,
    ...(readOptionalPayloadString(record.trigger, ZEN_SESSION_MEMORY_TRIGGER_MAX_CHARS)
      ? { trigger: readOptionalPayloadString(record.trigger, ZEN_SESSION_MEMORY_TRIGGER_MAX_CHARS) }
      : {}),
    sourceMessageIds: readPayloadMessageIds(record.sourceMessageIds),
  };
}

function decryptSessionMemoryRow(
  row: ZenSessionMemoryRow,
  userKey: Buffer
): ZenSessionMemoryItem | null {
  try {
    const payload = normalizePayload(
      decryptJson(
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          tag: row.tag,
        },
        userKey
      )
    );
    if (!payload) return null;
    return {
      id: row.id,
      ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
      title: payload.title,
      text: payload.text,
      ...(payload.trigger ? { trigger: payload.trigger } : {}),
      sourceMessageIds: payload.sourceMessageIds ?? [],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function pruneExpiredZenSessionMemories(
  db: DatabaseSync,
  userId: string,
  now = new Date()
): number {
  const result = db
    .prepare("DELETE FROM zen_session_memories WHERE user_id = ? AND expires_at <= ?")
    .run(userId, now.toISOString());
  return Number(result.changes ?? 0);
}

function pruneOverflowZenSessionMemories(db: DatabaseSync, userId: string): number {
  const rows = db
    .prepare(
      "SELECT id FROM zen_session_memories WHERE user_id = ? ORDER BY created_at DESC, id DESC"
    )
    .all(userId) as Array<{ id: string }>;
  const staleIds = rows.slice(ZEN_SESSION_MEMORY_LIMIT).map((row) => row.id);
  if (staleIds.length === 0) return 0;
  const deleteStmt = db.prepare("DELETE FROM zen_session_memories WHERE user_id = ? AND id = ?");
  let deleted = 0;
  for (const id of staleIds) {
    const result = deleteStmt.run(userId, id);
    deleted += Number(result.changes ?? 0);
  }
  return deleted;
}

export function listZenSessionMemories(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer,
  now = new Date()
): ZenSessionMemoryItem[] {
  pruneExpiredZenSessionMemories(db, userId, now);
  const rows = db
    .prepare(
      `SELECT id, conversation_id, ciphertext, iv, tag, created_at, expires_at
         FROM zen_session_memories
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`
    )
    .all(userId, ZEN_SESSION_MEMORY_LIMIT) as ZenSessionMemoryRow[];
  return rows
    .map((row) => decryptSessionMemoryRow(row, userKey))
    .filter((item): item is ZenSessionMemoryItem => item !== null);
}

export function deleteZenSessionMemoryById(
  db: DatabaseSync,
  userId: string,
  id: string
): boolean {
  const result = db
    .prepare("DELETE FROM zen_session_memories WHERE user_id = ? AND id = ?")
    .run(userId, id);
  return Number(result.changes ?? 0) > 0;
}

function firstNonEmptyLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function fallbackCheckpointTitle(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, " ").trim();
  const withoutCue = normalized
    .replace(/\b(?:let'?s|we can|can we|please)?\s*(?:finish|continue|resume|save|pause|pick)\b.*$/i, "")
    .trim();
  const source = withoutCue || normalized || "Session checkpoint";
  const words = source
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ");
  return clampText(words || "Session checkpoint", ZEN_SESSION_MEMORY_TITLE_MAX_CHARS);
}

function fallbackCheckpointText(transcript: string): string {
  const lines = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const useful = lines.slice(-4).join(" ");
  return clampText(
    useful || "The user paused this Zen thread and wants to continue from the latest visible exchange.",
    ZEN_SESSION_MEMORY_TEXT_MAX_CHARS
  );
}

function parseCheckpointJson(raw: string): { title?: string; text?: string } | null {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
    return {
      title:
        typeof parsed.title === "string"
          ? clampText(parsed.title, ZEN_SESSION_MEMORY_TITLE_MAX_CHARS)
          : undefined,
      text:
        typeof parsed.text === "string"
          ? clampText(parsed.text, ZEN_SESSION_MEMORY_TEXT_MAX_CHARS)
          : undefined,
    };
  } catch {
    return null;
  }
}

function transcriptLine(message: Pick<ChatMessage, "role" | "content">): string {
  return `${message.role}: ${clampText(message.content, 900)}`;
}

function buildCheckpointTranscript(args: {
  history: ChatMessage[];
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}): string {
  return [
    ...args.history.slice(-ZEN_SESSION_MEMORY_TRANSCRIPT_MAX_MESSAGES + 2),
    args.userMessage,
    args.assistantMessage,
  ]
    .filter((message) => message.content.trim().length > 0)
    .map(transcriptLine)
    .join("\n");
}

export function userMessageRequestsZenSessionMemory(userMessage: string): boolean {
  const text = userMessage.replace(/\s+/g, " ").trim();
  if (!text || text.length > 500) return false;
  return [
    /\b(?:last|previous|prior|earlier)\s+(?:conversation|chat|session|thread)\b/i,
    /\bwhere\s+(?:were|was)\s+(?:we|you)\b/i,
    /\bwhat\s+(?:were|was)\s+(?:we|you)\s+(?:talking about|doing|working on)\b/i,
    /\b(?:pick|bring|start)\s+(?:it|this|that|things)?\s*back\s+up\b/i,
    /\b(?:continue|resume)\s+(?:from|where|the|our|my|that|this|last|previous)\b/i,
    /\bfinish\s+(?:the|that|this|it|what)\b.*\b(?:started|left off|last time|before)\b/i,
    /\bwhat\s+was\s+(?:the|that|my|our)?\s*(?:variable|name|choice|decision|plan|idea|story|point)\b/i,
  ].some((pattern) => pattern.test(text));
}

export function userMessageSuggestsZenSessionDeferral(userMessage: string): boolean {
  const text = userMessage.replace(/\s+/g, " ").trim();
  if (!text || text.length > 360) return false;
  return [
    /\b(?:let'?s|we can|can we|please)?\s*(?:finish|continue|resume|pick\s+(?:this|it|that)\s+back\s+up)\s+(?:this|it|that|the story|the thread)?\s*(?:later|tomorrow|next time|another time)\b/i,
    /\b(?:save|pause|park|hold)\s+(?:this|it|that|our place|the thread|the story)\s+(?:for\s+)?(?:later|tomorrow|next time|another time)\b/i,
    /\b(?:i'?ll|i will|let me)\s+(?:come|get)\s+back\s+to\s+(?:this|it|that)\b/i,
    /\b(?:remember|keep)\s+(?:where|our place|this spot|the thread)\s+(?:for\s+)?(?:later|next time|tomorrow)\b/i,
  ].some((pattern) => pattern.test(text));
}

export async function createZenSessionMemoryCheckpoint(args: {
  db: DatabaseSync;
  provider: LlmProvider;
  userId: string;
  conversationId: string;
  userKey: Buffer;
  history: ChatMessage[];
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  now?: Date;
}): Promise<ZenSessionMemoryItem | null> {
  const { db, provider, userId, conversationId, userKey } = args;
  if (!userMessageSuggestsZenSessionDeferral(args.userMessage.content)) return null;

  const now = args.now ?? new Date();
  pruneExpiredZenSessionMemories(db, userId, now);
  const transcript = buildCheckpointTranscript({
    history: args.history,
    userMessage: args.userMessage,
    assistantMessage: args.assistantMessage,
  });
  let title = fallbackCheckpointTitle(args.userMessage.content);
  let text = fallbackCheckpointText(transcript);

  try {
    const raw = await provider.generateResponse([
      { role: "system", content: ZEN_SESSION_MEMORY_EXTRACT_PROMPT },
      { role: "user", content: `[Visible transcript]\n${transcript}` },
    ]);
    const parsed = parseCheckpointJson(raw);
    if (parsed?.text && parsed.text.trim().length > 0) {
      text = parsed.text;
      title = parsed.title && parsed.title.trim().length > 0
        ? parsed.title
        : clampText(firstNonEmptyLine(parsed.text), ZEN_SESSION_MEMORY_TITLE_MAX_CHARS);
    }
  } catch {
    // Deterministic fallback still creates a usable continuation marker.
  }

  const createdAt = now.toISOString();
  const expiresAt = isoFromMs(now.getTime() + ZEN_SESSION_MEMORY_TTL_MS);
  const payload: ZenSessionMemoryPayload = {
    title,
    text,
    trigger: clampText(args.userMessage.content, ZEN_SESSION_MEMORY_TRIGGER_MAX_CHARS),
    sourceMessageIds: [args.userMessage.id, args.assistantMessage.id]
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  };
  const encrypted = encryptJson(payload as unknown as Record<string, unknown>, userKey);
  const id = randomId(12);
  db.prepare(
    `INSERT INTO zen_session_memories
       (id, user_id, conversation_id, ciphertext, iv, tag, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    conversationId,
    encrypted.ciphertext,
    encrypted.iv,
    encrypted.tag,
    createdAt,
    expiresAt
  );
  pruneOverflowZenSessionMemories(db, userId);
  return {
    id,
    conversationId,
    title,
    text,
    trigger: payload.trigger,
    sourceMessageIds: payload.sourceMessageIds,
    createdAt,
    expiresAt,
  };
}

function conversationPreviousContext(
  db: DatabaseSync,
  userId: string,
  row: { id: string; title: string; updated_at: string }
): ZenPreviousContextSummary | null {
  const summary = getLatestThreadDisplaySummary(db, userId, row.id, "zen");
  if (!summary?.trim()) return null;
  const internalSummary = getLatestThreadSummary(db, userId, row.id, "zen");
  return {
    conversationId: row.id,
    title: row.title,
    summary: summary.trim(),
    ...(internalSummary && internalSummary.trim() !== summary.trim()
      ? { internalSummary: internalSummary.trim() }
      : {}),
    updatedAt: row.updated_at,
  };
}

export function getZenPreviousContextSummary(args: {
  db: DatabaseSync;
  userId: string;
  activeConversationId?: string | null;
}): ZenPreviousContextSummary | null {
  const { db, userId, activeConversationId } = args;
  const otherRows = db
    .prepare(
      `SELECT id, title, updated_at
         FROM conversations
        WHERE user_id = ?
          AND COALESCE(incognito, 0) = 0
          AND conversation_mode IN ('zen', 'chat')
          AND (? IS NULL OR id != ?)
        ORDER BY updated_at DESC
        LIMIT 8`
    )
    .all(userId, activeConversationId ?? null, activeConversationId ?? null) as Array<{
    id: string;
    title: string;
    updated_at: string;
  }>;
  for (const row of otherRows) {
    const context = conversationPreviousContext(db, userId, row);
    if (context) return context;
  }
  if (!activeConversationId) return null;
  const active = db
    .prepare(
      `SELECT id, title, updated_at
         FROM conversations
        WHERE id = ?
          AND user_id = ?
          AND COALESCE(incognito, 0) = 0
          AND conversation_mode IN ('zen', 'chat')
        LIMIT 1`
    )
    .get(activeConversationId, userId) as
    | { id: string; title: string; updated_at: string }
    | undefined;
  return active ? conversationPreviousContext(db, userId, active) : null;
}

export function loadZenSessionMemoryOverview(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  activeConversationId?: string | null;
  now?: Date;
}): ZenSessionMemoryOverview {
  const now = args.now ?? new Date();
  return {
    previousContext: getZenPreviousContextSummary({
      db: args.db,
      userId: args.userId,
      activeConversationId: args.activeConversationId,
    }),
    sessionMemories: listZenSessionMemories(args.db, args.userId, args.userKey, now),
  };
}

export function buildZenSessionMemoryPromptContext(
  overview: ZenSessionMemoryOverview | null | undefined
): string | null {
  if (!overview) return null;
  const lines: string[] = [
    "Zen session memory context:",
    "The user explicitly asked about prior/session context. Use this only if relevant; do not announce hidden memory or metadata.",
  ];
  if (overview.previousContext) {
    lines.push(
      `Previous context (${overview.previousContext.title}): ${
        overview.previousContext.internalSummary ?? overview.previousContext.summary
      }`
    );
  }
  if (overview.sessionMemories.length > 0) {
    lines.push("Short-term session checkpoints:");
    for (const memory of overview.sessionMemories) {
      lines.push(`- ${memory.title}: ${memory.text}`);
    }
  }
  if (!overview.previousContext && overview.sessionMemories.length === 0) {
    return null;
  }
  return lines.join("\n");
}
