import type { DatabaseSync } from "node:sqlite";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import {
  analyzeMemoryIntent,
  deleteMemoryById,
  findMemoryByCue,
  persistMemoryCandidates,
  retrieveRecentMemoriesForStarter,
  retrieveRelevantMemories,
} from "./memory.ts";
import {
  validateMemoryCandidates,
  type MemoryValidationReasonCode,
  type MemoryValidationStatus,
} from "./memory-validation.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  OPENAI_DEFAULT_MODEL,
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
import type {
  AskQuestionPayload,
  ChatMessage,
  ChatMode,
  Conversation,
  OpinionBand,
  OpinionTrend,
  SessionOpinion,
} from "@localai/shared";
import {
  hydrateAssistantMessageParts,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  parseAssistantPrismTools,
  serializeAskQuestionTool,
} from "@localai/shared";

const config = getAppConfig();

/** POST /api/chat returns this shape; `conversationStarters` is present only after a starter turn. */
export interface ProcessChatMessageResult {
  conversation: Conversation;
  conversationStarters?: string[];
  opinion?: SessionOpinion;
  memoryLearned?: {
    created: Array<{
      id: string;
      text: string;
      botId: string | null;
      conversationId?: string;
      confidence: number;
      source?: "direct" | "inferred" | "compiled";
      certainty?: number;
      sourceMessageIds?: string[];
      validationStatus?: MemoryValidationStatus;
      originalText?: string;
      reasonCodes?: MemoryValidationReasonCode[];
    }>;
    retracted: Array<{
      id: string;
      text: string;
      botId: string | null;
      conversationId?: string;
      confidence: number;
      source?: "direct" | "inferred" | "compiled";
      certainty?: number;
      sourceMessageIds?: string[];
    }>;
    rejected: Array<{
      originalText: string;
      reasonCodes: MemoryValidationReasonCode[];
      notes?: string;
    }>;
    maxConfidence: number;
  };
}

const INFER_STARTER_TEMPERATURE = 0.38;
const INFER_STARTER_MAX_TOKENS = 420;
const INFER_TITLE_TEMPERATURE = 0.2;
const INFER_TITLE_MAX_TOKENS = 32;
const INFER_TITLE_MAX_CHARS = 60;
const TITLE_REFRESH_MESSAGE_LIMIT = 12;
const TITLE_REFRESH_MESSAGE_MAX_CHARS = 1200;
const STARTER_FALLBACK_STOP_WORDS = new Set([
  "about",
  "there",
  "would",
  "could",
  "their",
  "which",
  "because",
  "really",
  "maybe",
  "first",
  "should",
]);

const OPINION_SCORE_MIN = 0;
const OPINION_SCORE_MAX = 100;
const OPINION_SCORE_BASELINE = 50;
const OPINION_REASON_LIMIT = 4;
const DEFAULT_BOT_SCOPE_KEY = "__default__";
const POSITIVE_PHRASES = [
  "thank you",
  "thanks",
  "please",
  "appreciate",
  "i understand",
  "that makes sense",
  "good point",
  "help me understand",
];
const NEGATIVE_PHRASES = [
  "stupid",
  "useless",
  "shut up",
  "idiot",
  "dumb",
  "you are wrong",
  "hate this",
];
const BRUSQUE_PHRASES = ["do it", "just do it", "whatever", "hurry up", "now"];

type OpinionEvaluation = {
  delta: number;
  reason: string;
  trend: OpinionTrend;
};

function clampOpinionScore(score: number): number {
  return Math.max(OPINION_SCORE_MIN, Math.min(OPINION_SCORE_MAX, score));
}

function opinionBandFromScore(score: number): OpinionBand {
  if (score >= 68) return "trusting";
  if (score <= 34) return "guarded";
  return "warming";
}

function normalizeOpinionText(input: string): string {
  return input.trim().toLowerCase();
}

function countPhraseHits(text: string, phrases: string[]): number {
  return phrases.reduce(
    (count, phrase) => (text.includes(phrase) ? count + 1 : count),
    0
  );
}

function evaluateUserTurnOpinion(message: string): OpinionEvaluation {
  const normalized = normalizeOpinionText(message);
  if (!normalized) {
    return { delta: 0, reason: "No opinion shift this turn.", trend: "steady" };
  }
  let delta = 0;
  const positiveHits = countPhraseHits(normalized, POSITIVE_PHRASES);
  const negativeHits = countPhraseHits(normalized, NEGATIVE_PHRASES);
  const brusqueHits = countPhraseHits(normalized, BRUSQUE_PHRASES);
  if (positiveHits > 0) {
    delta += Math.min(positiveHits * 3, 6);
  }
  if (negativeHits > 0) {
    delta -= Math.min(negativeHits * 7, 14);
  }
  if (brusqueHits > 0) {
    delta -= Math.min(brusqueHits * 3, 6);
  }
  // Questions tend to indicate reciprocity rather than one-way command.
  if (normalized.includes("?")) {
    delta += 2;
  }
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2 && !normalized.includes("?")) {
    delta -= 2;
  }
  if (delta >= 4) {
    return {
      delta,
      reason: "The tone felt considerate and collaborative.",
      trend: "up",
    };
  }
  if (delta <= -4) {
    return {
      delta,
      reason: "The tone felt abrupt, so trust pulled back.",
      trend: "down",
    };
  }
  if (delta > 0) {
    return {
      delta,
      reason: "Small positive shift from conversational tone.",
      trend: "up",
    };
  }
  if (delta < 0) {
    return {
      delta,
      reason: "Small negative shift from terse wording.",
      trend: "down",
    };
  }
  return { delta: 0, reason: "No opinion shift this turn.", trend: "steady" };
}

function buildOpinion(
  score: number,
  trend: OpinionTrend,
  lastReason: string,
  recentReasons: string[],
  updatedAt: string
): SessionOpinion {
  return {
    score: Math.round(clampOpinionScore(score)),
    band: opinionBandFromScore(score),
    trend,
    lastReason,
    recentReasons,
    updatedAt,
  };
}

function extractJsonObjectPayload(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/);
  if (fence?.[1]) {
    return fence[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseSuggestedRepliesPayload(raw: string): string[] {
  const payload = extractJsonObjectPayload(raw);
  try {
    const parsedUnknown = JSON.parse(payload) as { suggestions?: unknown };
    const list = parsedUnknown?.suggestions;
    if (!Array.isArray(list)) return [];
    const strings = list
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return [...new Set(strings)].slice(0, 4);
  } catch {
    return [];
  }
}

export function sanitizeConversationTitle(rawTitle: string): string | null {
  const title = rawTitle
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:chat|conversation)?\s*title\s*[:\-]\s*/i, "")
    .replace(/^here(?:'s| is)\s+(?:a\s+)?(?:short\s+)?(?:chat\s+|conversation\s+)?title\s*[:\-]\s*/i, "")
    .replace(/^[\s"'“”‘’`*_#:-]+/, "")
    .replace(/[\s"'“”‘’`*_#.!?:;-]+$/, "")
    .trim();
  if (!title) return null;
  return title.length > INFER_TITLE_MAX_CHARS
    ? `${title.slice(0, INFER_TITLE_MAX_CHARS - 3).trimEnd()}...`
    : title;
}

export function parseTitleResponse(raw: string): string | null {
  const payload = extractJsonObjectPayload(raw);
  try {
    const parsedUnknown = JSON.parse(payload) as {
      title?: unknown;
    };
    return typeof parsedUnknown.title === "string"
      ? sanitizeConversationTitle(parsedUnknown.title)
      : null;
  } catch {
    return sanitizeConversationTitle(payload.split(/\r?\n/).find(Boolean) ?? payload);
  }
}

function extractLatestStarterQuestion(assistantOpening: string): string | null {
  const normalized = assistantOpening.replace(/\s+/g, " ").trim();
  if (!normalized.includes("?")) return null;
  const questionMatches = normalized.match(/[^?]*\?/g) ?? [];
  let question = questionMatches.at(-1)?.trim() ?? "";
  const lastSentenceBoundary = Math.max(
    question.lastIndexOf(". "),
    question.lastIndexOf("! ")
  );
  if (lastSentenceBoundary >= 0) {
    question = question.slice(lastSentenceBoundary + 2).trim();
  }
  return question.length > 0 ? question : null;
}

function cleanStarterQuestionAlternative(value: string): string {
  return value
    .replace(/^[\s"'“”‘’`*_#:-]+/, "")
    .replace(/[\s"'“”‘’`*_#.!?:;-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStarterQuestionAlternatives(question: string): string[] {
  let core = question.replace(/\?+$/, "").trim();
  const ifOrWhetherIndex = core.search(/\b(?:if|whether)\b/i);
  if (ifOrWhetherIndex >= 0) {
    core = core.slice(ifOrWhetherIndex).replace(/^(?:if|whether)\s+/i, "");
  }
  core = core
    .replace(/^i(?:'m| am)\s+thinking\s+of\s+/i, "")
    .replace(/^it(?:'s| is)\s+/i, "")
    .replace(/^.*\b(?:between|from)\s+/i, "")
    .trim();
  const alternatives = core
    .split(/\s+(?:or|versus|vs\.?)\s+/i)
    .map(cleanStarterQuestionAlternative)
    .filter((part) => part.length >= 2 && part.length <= 64);
  return alternatives.length >= 2 ? [...new Set(alternatives)].slice(0, 3) : [];
}

function fallbackConversationStarters(
  assistantOpening: string,
  personaLabel: string | undefined
): string[] {
  const label = personaLabel?.trim() || "Prism";
  const question = extractLatestStarterQuestion(assistantOpening);
  if (question) {
    const alternatives = extractStarterQuestionAlternatives(question);
    if (alternatives.length >= 2) {
      const replies = [...alternatives];
      const fallbackReplies = ["Neither sounds right.", "I'm not sure.", "Give me another clue."];
      for (const reply of fallbackReplies) {
        if (replies.length >= 4) break;
        replies.push(reply);
      }
      return replies.slice(0, 4);
    }
    return [
      "I'm not sure yet.",
      "A small specific detail.",
      "I need another clue.",
      "Surprise me with your guess.",
    ];
  }
  const words = assistantOpening
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .filter((word) => !STARTER_FALLBACK_STOP_WORDS.has(word));
  const topic = words[0] ?? "this";
  return [
    `What should I notice about ${topic}?`,
    `Ask me a playful question, ${label}.`,
    "Give me one concrete next step.",
    "Surprise me with another angle.",
  ];
}

/** Second-pass call: derives 3–4 user phrasings that continue naturally from the assistant opener. */
async function inferConversationStarters(
  provider: LlmProvider,
  assistantOpening: string,
  personaLabel: string | undefined,
  baseOverrides: GenerateOptions | undefined
): Promise<string[]> {
  const label = personaLabel?.trim() || "Prism";
  const opener =
    assistantOpening.trim().length > 3200
      ? `${assistantOpening.trim().slice(0, 3200)}…`
      : assistantOpening.trim();
  if (!opener) return [];
  const question = extractLatestStarterQuestion(opener);

  const inferOverrides: GenerateOptions = {
    ...baseOverrides,
    temperature: INFER_STARTER_TEMPERATURE,
    maxTokens: INFER_STARTER_MAX_TOKENS,
  };

  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You label quick-reply chips for a chat UI. Reply with JSON only — no prose, no markdown outside JSON.",
    },
    {
      role: "user",
      content: [
        `Assistant persona label: "${label}".`,
        "The assistant just opened the thread with:",
        "---",
        opener,
        "---",
        `Question the user should answer: ${question ? `"${question}"` : "(no direct question detected)"}.`,
        'Respond with compact JSON exactly in this shape: {"suggestions":["...","...","...","..."]}',
        "Include exactly four strings.",
        "Each string is something the USER might send next (short clause or sentence; max ~18 words).",
        "If the assistant asked a direct question, every string MUST be a plausible direct answer to that exact question.",
        "For either/or questions, include the concrete choices as chips, plus uncertainty/none-of-these when useful.",
        "Do not ask a different follow-up question or steer to a new topic while a direct question is pending.",
        "If there is no direct question, cover four meaningfully different continuations (e.g. practical, playful, reflective, clarification).",
        "Strings must be safe single-line UTF-8; no numbering or prefixes inside strings.",
      ].join("\n"),
    },
  ];

  try {
    const raw = await provider.generateResponse(messages, inferOverrides);
    const candidates = parseSuggestedRepliesPayload(raw);
    if (candidates.length >= 3) {
      return candidates.slice(0, 4);
    }
  } catch {
    // Non-fatal: chips are optional chrome.
  }
  return fallbackConversationStarters(opener, personaLabel);
}

/** Background chrome call: names a conversation for the sidebar/history list. */
async function inferConversationTitle(
  provider: LlmProvider,
  userMessage: string,
  assistantReply: string,
  personaLabel: string | undefined,
  baseOverrides: GenerateOptions | undefined
): Promise<string | null> {
  const firstUserMessage = userMessage.trim();
  const opener =
    assistantReply.trim().length > 2200
      ? `${assistantReply.trim().slice(0, 2200)}...`
      : assistantReply.trim();
  if (!firstUserMessage && !opener) return null;

  const inferOverrides: GenerateOptions = {
    ...baseOverrides,
    temperature: INFER_TITLE_TEMPERATURE,
    maxTokens: INFER_TITLE_MAX_TOKENS,
  };
  const label = personaLabel?.trim() || "Prism";
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You title chats for a conversation sidebar. Reply with JSON only — no prose, no markdown outside JSON.",
    },
    {
      role: "user",
      content: [
        `Assistant persona label: "${label}".`,
        firstUserMessage
          ? `The user's first message was:\n---\n${firstUserMessage.slice(0, 2200)}\n---`
          : "The user started from an empty composer, so the assistant opened the thread.",
        "The assistant's first reply was:",
        "---",
        opener,
        "---",
        'Respond with compact JSON exactly in this shape: {"title":"..."}',
        "The title is what the user sees in the conversation list.",
        "Bias strongly toward five content words or fewer.",
        "Do not count filler words toward that limit: of, and, the, this, that, a, an, in, on, to, for.",
        "Use plain text only: no quotes, numbering, emoji, trailing period, markdown, or subtitle punctuation.",
      ].join("\n"),
    },
  ];

  try {
    return parseTitleResponse(await provider.generateResponse(messages, inferOverrides));
  } catch {
    return null;
  }
}

type TitleRefreshMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

function trimTitleContext(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > TITLE_REFRESH_MESSAGE_MAX_CHARS
    ? `${trimmed.slice(0, TITLE_REFRESH_MESSAGE_MAX_CHARS).trimEnd()}...`
    : trimmed;
}

function formatTitleRefreshTranscript(messages: TitleRefreshMessage[]): string {
  return messages
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${trimTitleContext(message.content)}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

async function inferRefreshedConversationTitle(
  provider: LlmProvider,
  messages: TitleRefreshMessage[],
  currentTitle: string,
  personaLabel: string | null
): Promise<string | null> {
  const transcript = formatTitleRefreshTranscript(messages);
  if (!transcript) return null;

  const inferOverrides: GenerateOptions = {
    temperature: INFER_TITLE_TEMPERATURE,
    maxTokens: INFER_TITLE_MAX_TOKENS,
  };
  const label = personaLabel?.trim() || "Prism";
  const promptMessages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You update chat titles for a conversation sidebar. Reply with JSON only — no prose, no markdown outside JSON.",
    },
    {
      role: "user",
      content: [
        `Assistant persona label: "${label}".`,
        `Current sidebar title: "${currentTitle}".`,
        "Recent conversation transcript:",
        "---",
        transcript,
        "---",
        'Respond with compact JSON exactly in this shape: {"title":"..."}',
        "The title is what the user sees after leaving the chat, so make it reflect the conversation's current main topic.",
        "Bias strongly toward five content words or fewer.",
        "Prefer a stable topic label over a momentary last-message detail.",
        "Use plain text only: no quotes, numbering, emoji, trailing period, markdown, or subtitle punctuation.",
      ].join("\n"),
    },
  ];

  try {
    return parseTitleResponse(await provider.generateResponse(promptMessages, inferOverrides));
  } catch {
    return null;
  }
}

export async function refreshConversationTitle(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): Promise<{ id: string; title: string; updatedAt: string } | null> {
  const conversation = db
    .prepare(
      `SELECT c.id, c.title, c.incognito, c.updated_at,
              (SELECT b.name
                 FROM messages m
                 LEFT JOIN bots b ON b.id = m.bot_id
                WHERE m.conversation_id = c.id
                  AND m.user_id = c.user_id
                  AND m.role = 'assistant'
                ORDER BY m.created_at DESC
                LIMIT 1) AS last_bot_name
         FROM conversations c
        WHERE c.id = ? AND c.user_id = ?`
    )
    .get(conversationId, userId) as
    | {
        id: string;
        title: string;
        incognito: number;
        updated_at: string;
        last_bot_name: string | null;
      }
    | undefined;
  if (!conversation || conversation.incognito === 1) {
    return null;
  }

  const recentMessages = (
    db
      .prepare(
        `SELECT role, content, created_at
           FROM messages
          WHERE conversation_id = ?
            AND user_id = ?
            AND role IN ('user', 'assistant')
          ORDER BY created_at DESC
          LIMIT ?`
      )
      .all(conversationId, userId, TITLE_REFRESH_MESSAGE_LIMIT) as TitleRefreshMessage[]
  ).reverse();
  if (!recentMessages.some((message) => message.role === "assistant")) {
    return null;
  }

  const title = await inferRefreshedConversationTitle(
    getAuxiliaryProvider(),
    recentMessages,
    conversation.title,
    conversation.last_bot_name
  );
  if (!title || title === conversation.title) {
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updated_at,
    };
  }

  db.prepare("UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?")
    .run(title, conversationId, userId);
  return {
    id: conversation.id,
    title,
    updatedAt: conversation.updated_at,
  };
}

export interface UserChatSettings {
  preferredProvider: "local" | "openai";
  autoMemory: boolean;
  openAiApiKey?: string;
  /**
   * When true, the model produces the opening assistant turn without
   * persisting a synthetic user message. Used by empty-composer Enter.
   */
  starterPrompt?: boolean;
  /** Human-readable persona label for starter chat titles. */
  starterPromptLabel?: string;
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
  /**
   * Client-held prior messages for private chats. Used as prompt context only;
   * incognito turns never read from or write to conversation/message storage.
   */
  ephemeralMessages?: ChatMessage[];
  botSystemPrompt?: string;
  /** Optional per-bot generation overrides, forwarded to the provider. */
  botOverrides?: GenerateOptions;
  /** Optional user-saved second Ollama host for host-aware local model choices. */
  secondaryOllamaHost?: string | null;
  /**
   * Which post-auth surface the request originated from. Changes what
   * "memory" means for this turn:
   *   - "chat": cross-thread personal-fact memory + Qdrant summary recall.
   *     Honors `incognito` as an ephemeral + skip-memory shortcut.
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

const PRISM_ASSISTANT_TOOLS_APPENDIX = [
  "Prism assistant tools — optional:",
  `When you want the user to pick exactly one tap-to-reply chip, append ONE trailing block AFTER your readable prose.`,
  `If you do not need chips this turn, omit the entire block.`,
  "",
  `${PRISM_TOOL_START}`,
  '{"v":1,"name":"AskQuestion","prompt":"Short chooser line above chips (e.g. Which option do you choose?)","options":[{"id":"a","label":"First choice"},{"id":"b","label":"Second choice"},{"id":"c","label":"Third choice"}]}',
  `${PRISM_TOOL_END}`,
  "Rules:",
  "- Keep normal conversation in plain prose BEFORE the delimiter block.",
  "- AskQuestion represents one question in this turn; never output a quiz or multi-question list.",
  "- Inside JSON only: emit exactly three options with ids a, b, c (distinct).",
  "- In JSON, `prompt` is ONLY the short chooser line shown above the chip row (never the main quiz question).",
  "- Labels are what the USER sends verbatim when they tap; keep each short (single clause).",
].join("\n");

const ASKQUESTION_REQUEST_PATTERN =
  /\b(ask\s+me\s+(?:a|another)\s+question|quiz(?:\s+me)?|multiple[-\s]?choice|askquestion|use\s+askquestion)\b/i;

function userExplicitlyRequestedAskQuestion(userMessage: string): boolean {
  return ASKQUESTION_REQUEST_PATTERN.test(userMessage);
}

function latestAssistantAskQuestionFromHistory(
  chatHistory: ChatMessage[]
): AskQuestionPayload | undefined {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const message = chatHistory[i];
    if (message?.role !== "assistant") continue;
    const ask = message.askQuestion;
    if (
      ask?.name === "AskQuestion" &&
      Array.isArray(ask.options) &&
      ask.options.length === 3
    ) {
      return ask;
    }
    // Only continue an AskQuestion sequence when the latest assistant turn
    // itself carried AskQuestion metadata.
    return undefined;
  }
  return undefined;
}

function userMessageAnswersAskQuestionOption(
  userMessage: string,
  askQuestion: AskQuestionPayload
): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) return false;

  const directChoice = trimmed.match(
    /^(?:option|choice|answer)?\s*([A-Ca-c1-3])(?:[)\].:-]|\s|$)/i
  );
  if (directChoice?.[1]) {
    return true;
  }

  const normalizedUser = normalizeAskQuestionComparisonText(
    trimmed.replace(
      /^(?:option|choice|answer)?\s*(?:[A-Ca-c1-3])[)\].:-]?\s*/i,
      ""
    )
  );
  if (!normalizedUser) return false;

  return askQuestion.options.some((option) => {
    const normalizedOption = normalizeAskQuestionComparisonText(option.label);
    return normalizedOption.length > 0 && normalizedOption === normalizedUser;
  });
}

function shouldContinueAskQuestionFromPriorTurn(
  chatHistory: ChatMessage[],
  userMessage: string
): boolean {
  const latestAskQuestion = latestAssistantAskQuestionFromHistory(chatHistory);
  if (!latestAskQuestion) return false;
  return userMessageAnswersAskQuestionOption(userMessage, latestAskQuestion);
}

function assistantLikelyIntendedAskQuestion(displayContent: string): boolean {
  const text = displayContent.trim();
  if (!text) return false;
  if (extractDynamicAskQuestion(text)) return true;
  return (
    /\bone block below\b/i.test(text) ||
    /\b(?:choose|pick|select)\s+(?:one|an?\s+option)\b/i.test(text) ||
    /\btap (?:an )?option\b/i.test(text) ||
    /\bmultiple[-\s]?choice\b/i.test(text) ||
    /\breply with [abc123]\b/i.test(text) ||
    /\brespond with [abc123]\b/i.test(text)
  );
}

function normalizeAskQuestionText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInlineEnumeratedAskQuestionOptions(content: string): string[] {
  const markerRegex = /(?:^|[\s(])(?:option|choice|answer)?\s*([A-Da-d1-4])[)\].:-]\s*/g;
  const markerMatches: Array<{ order: number; markerStart: number; textStart: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = markerRegex.exec(content)) !== null) {
    const rawMarker = match[1];
    if (!rawMarker) continue;
    const normalizedMarker = rawMarker.toUpperCase();
    const order =
      normalizedMarker === "A"
        ? 1
        : normalizedMarker === "B"
          ? 2
          : normalizedMarker === "C"
            ? 3
            : normalizedMarker === "D"
              ? 4
              : normalizedMarker === "1"
                ? 1
                : normalizedMarker === "2"
                  ? 2
                  : normalizedMarker === "3"
                    ? 3
                    : normalizedMarker === "4"
                      ? 4
                      : -1;
    if (order < 1) continue;

    const startsPrimarySeries = order === 1;
    if (markerMatches.length === 0 && !startsPrimarySeries) continue;
    const previous = markerMatches[markerMatches.length - 1];
    if (previous && order <= previous.order) continue;

    markerMatches.push({
      order,
      markerStart: match.index,
      textStart: markerRegex.lastIndex,
    });
    if (order === 4) break;
  }

  if (markerMatches.length < 3) return [];

  const options: string[] = [];
  for (let i = 0; i < markerMatches.length && options.length < 3; i += 1) {
    const current = markerMatches[i]!;
    const next = markerMatches[i + 1];
    const rawSegment = content.slice(current.textStart, next?.markerStart ?? content.length);
    const cleaned = normalizeAskQuestionText(rawSegment.replace(/\s+/g, " "));
    if (!cleaned) continue;
    options.push(cleaned);
  }

  return options.length >= 3 ? options.slice(0, 3) : [];
}

function extractDynamicAskQuestion(displayContent: string): AskQuestionPayload | undefined {
  const lines = displayContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;

  const optionLead = /^(?:[-*•]\s*)?(?:[A-Da-d1-4])[)\].:-]\s*(.+)$/;
  /** Prefer scanning from a real A) / 1. start so a stray D) line cannot steal the option window. */
  function indexOfFirstPrimaryOption(): number {
    const withMarker =
      /^(?:[-*•]\s*)?([A-Da-d1-4])[)\].:-]\s*.+$/;
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i]!.match(withMarker);
      if (!m?.[1]) continue;
      const marker = m[1]!.toUpperCase();
      if (marker === "A" || m[1] === "1") return i;
    }
    return lines.findIndex((line) => optionLead.test(line));
  }

  const firstOptionIdx = indexOfFirstPrimaryOption();
  if (firstOptionIdx < 0) return undefined;

  let chooserIdx = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lineLooksLikeChooserPromptLine(lines[i]!)) {
      chooserIdx = i;
      break;
    }
  }

  const options: string[] = [];
  const scanEnd = chooserIdx >= 0 ? chooserIdx : lines.length;
  for (let i = firstOptionIdx; i < scanEnd; i += 1) {
    const line = lines[i]!;
    const match = line.match(optionLead);
    if (!match?.[1]) continue;
    const cleaned = normalizeAskQuestionText(match[1]);
    if (cleaned.length === 0) continue;
    options.push(cleaned);
    if (options.length === 3) break;
  }
  if (options.length < 3) {
    const inlineOptions = extractInlineEnumeratedAskQuestionOptions(displayContent);
    if (inlineOptions.length >= 3) {
      options.splice(0, options.length, ...inlineOptions);
    }
  }
  if (options.length < 3) return undefined;

  let chooserText = "";
  if (chooserIdx >= 0) {
    chooserText = normalizeAskQuestionText(lines[chooserIdx] ?? "");
  }
  const prompt =
    chooserText.length > 0 ? chooserText : "Which option fits best?";

  return {
    v: 1,
    name: "AskQuestion",
    prompt,
    options: [
      { id: "a", label: options[0]! },
      { id: "b", label: options[1]! },
      { id: "c", label: options[2]! },
    ],
  };
}

function coerceAskQuestionPrompt(displayContent: string, userMessage: string): string {
  const firstLine =
    displayContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? userMessage.trim();
  let prompt = firstLine
    .replace(/^[-*]\s+/, "")
    .replace(/^[>#`]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (prompt.length > 88) {
    prompt = `${prompt.slice(0, 85).trimEnd()}...`;
  }
  if (!prompt) {
    prompt = "Which option fits best?";
  } else if (!/[?.!]$/.test(prompt)) {
    prompt = `${prompt}?`;
  }
  return prompt;
}

function buildAskQuestionFallback(displayContent: string, userMessage: string): AskQuestionPayload {
  const dynamic = extractDynamicAskQuestion(displayContent);
  if (dynamic) return dynamic;
  return {
    v: 1,
    name: "AskQuestion",
    prompt: coerceAskQuestionPrompt(displayContent, userMessage),
    options: [
      { id: "a", label: "Yes" },
      { id: "b", label: "Maybe / need context" },
      { id: "c", label: "No" },
    ],
  };
}

function normalizeAskQuestionComparisonText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/[“”"']/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\p{L}\p{N}\s\-?:]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\?/g, "?")
    .trim()
    .toLowerCase();
}

/** Lines that belong above the chip row (short chooser / bridge), not the substantive question in prose. */
function lineLooksLikeChooserPromptLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^question\s*[:\-]/i.test(t)) return false;
  if (/^#+\s/.test(t)) return false;
  const n = normalizeAskQuestionComparisonText(t);
  if (!n) return false;
  if (
    /\bwhich (?:option|one|answer) do you choose\b/.test(n) ||
    /\bwhich (?:option|one) (?:would you|will you) (?:pick|choose)\b/.test(n) ||
    /\bwhat(?:'s| is) your (?:pick|choice)\b/.test(n)
  ) {
    return true;
  }
  if (
    /\bpick (?:one|an option)\b/.test(n) ||
    /\bchoose (?:one|an option|from (?:the )?options)\b/.test(n) ||
    /\bselect (?:one|an option)\b/.test(n) ||
    /\btap (?:an )?option\b/.test(n)
  ) {
    return /\?/.test(t);
  }
  if (/\?/.test(t) && t.length <= 56 && /\b(which|pick|choose|select)\b/i.test(t)) {
    if (
      /\b(ratio|shortcake|explain|describe|why|how much|how many|optimal|calculate|define)\b/i.test(
        n
      )
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Prefer a chooser line from assistant prose for the chip heading when the JSON
 * `prompt` is the substantive question (model mixes fields).
 */
function refineAskQuestionPayloadFromDisplay(
  displayContent: string,
  ask: AskQuestionPayload
): AskQuestionPayload {
  const lines = displayContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let chooserFromProse: string | undefined;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (!lineLooksLikeChooserPromptLine(line)) continue;
    const cleaned = normalizeAskQuestionText(stripKnownAskQuestionPrefixes(line));
    if (cleaned.length > 0) {
      chooserFromProse = cleaned;
      break;
    }
  }

  if (!chooserFromProse) return ask;

  const jsonPromptLooksSubstantive =
    ask.prompt.includes("?") &&
    (ask.prompt.length > 72 || !lineLooksLikeChooserPromptLine(ask.prompt));

  if (jsonPromptLooksSubstantive || normalizeAskQuestionComparisonText(ask.prompt) !== normalizeAskQuestionComparisonText(chooserFromProse)) {
    return { ...ask, prompt: chooserFromProse };
  }
  return ask;
}

function tokenizeAskQuestionComparisonText(text: string): string[] {
  return normalizeAskQuestionComparisonText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function stripKnownAskQuestionPrefixes(text: string): string {
  return text
    .replace(
      /^(?:question|prompt|askquestion|ask question|q|heading|title)\s*[:\-]\s*/i,
      ""
    )
    .replace(/^(?:please\s+)?(?:choose|pick|select)\s+(?:one|an?\s+option)\s*[:\-]?\s*/i, "")
    .trim();
}

function phraseOccursInTokens(tokens: string[], phraseTokens: string[]): boolean {
  if (phraseTokens.length === 0 || tokens.length < phraseTokens.length) return false;
  for (let i = 0; i <= tokens.length - phraseTokens.length; i += 1) {
    let allMatch = true;
    for (let j = 0; j < phraseTokens.length; j += 1) {
      if (tokens[i + j] !== phraseTokens[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }
  return false;
}

function hasOnlyBridgeTokensOutsidePrompt(lineNorm: string, promptNorm: string): boolean {
  if (!lineNorm || !promptNorm || !lineNorm.includes(promptNorm)) return false;
  const bridgeTokens = new Set([
    "please",
    "choose",
    "pick",
    "select",
    "option",
    "options",
    "answer",
    "answers",
    "one",
    "from",
    "below",
    "chip",
    "chips",
    "tap",
    "click",
    "with",
    "the",
    "a",
    "an",
    "your",
    "now",
  ]);
  const residual = lineNorm.replace(promptNorm, " ");
  const residualTokens = residual
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return residualTokens.length > 0 && residualTokens.every((token) => bridgeTokens.has(token));
}

function lineLooksLikePromptDuplicate(line: string, promptNorm: string): boolean {
  if (!promptNorm) return false;
  const lineNorm = normalizeAskQuestionComparisonText(line);
  if (!lineNorm) return false;
  if (lineNorm === promptNorm) return true;
  const prefixStripped = normalizeAskQuestionComparisonText(
    stripKnownAskQuestionPrefixes(line)
  );
  if (prefixStripped === promptNorm) return true;
  if (hasOnlyBridgeTokensOutsidePrompt(lineNorm, promptNorm)) return true;
  return false;
}

function lineLooksLikeOptionDuplicate(
  line: string,
  optionSet: Set<string>,
  optionTokenLists: string[][]
): boolean {
  /** Models often bold list markers (`- **A)**`); strip `**` so enum regexes still match. */
  const lineForEnum = line.replace(/\*\*/g, "");
  const normalizedLine = normalizeAskQuestionComparisonText(line);
  if (normalizedLine && optionSet.has(normalizedLine)) return true;
  const normalizedWithoutEnum = normalizedLine
    .replace(/^(?:option|choice|answer)\s+/i, "")
    .replace(/^(?:[a-d]|[1-4])\s+/i, "")
    .trim();
  if (normalizedWithoutEnum && optionSet.has(normalizedWithoutEnum)) return true;

  const optionLeadRegex = /^(?:[-*•]\s*)?(?:option|choice|answer)?\s*(?:[A-Da-d1-4])[)\].:-]\s*/i;
  const markerOnlyRegex = /^(?:[-*•]\s*)?(?:option|choice|answer)?\s*(?:[A-Da-d1-4])[)\].:-]?$/i;
  if (markerOnlyRegex.test(lineForEnum.trim())) return true;

  const markerStripped = normalizeAskQuestionComparisonText(
    lineForEnum.replace(optionLeadRegex, "")
  );
  if (markerStripped && optionSet.has(markerStripped)) return true;

  const markerChunks = lineForEnum
    .split(/(?=(?:[-*•]\s*)?(?:option|choice|answer)?\s*(?:[A-Da-d1-4])[)\].:-]\s*)/gi)
    .map((chunk) =>
      normalizeAskQuestionComparisonText(chunk.replace(optionLeadRegex, ""))
    )
    .filter((chunk) => chunk.length > 0);
  if (
    markerChunks.length >= 2 &&
    markerChunks.every((chunk) => optionSet.has(chunk))
  ) {
    return true;
  }

  const lineTokens = tokenizeAskQuestionComparisonText(line);
  if (lineTokens.length === 0) return false;
  const matchedOptions = optionTokenLists.filter((tokens) =>
    phraseOccursInTokens(lineTokens, tokens)
  );
  if (matchedOptions.length < 2) return false;

  const bridgeTokens = new Set([
    "and",
    "or",
    "then",
    "option",
    "options",
    "choice",
    "choices",
    "answer",
    "answers",
    "a",
    "b",
    "c",
    "one",
    "two",
    "three",
    "pick",
    "choose",
    "select",
    "tap",
    "click",
    "with",
    "reply",
    "respond",
    "the",
    "to",
    "from",
    "below",
  ]);
  const residualTokens = lineTokens.filter(
    (token) =>
      !bridgeTokens.has(token) &&
      !matchedOptions.some((optTokens) => optTokens.includes(token))
  );
  return residualTokens.length === 0;
}

function stripAskQuestionDuplicatesFromDisplay(
  displayContent: string,
  askQuestion: AskQuestionPayload | undefined
): string {
  if (!askQuestion) return displayContent;
  const promptNorm = normalizeAskQuestionComparisonText(askQuestion.prompt);
  const optionNorms = askQuestion.options
    .map((opt) => normalizeAskQuestionComparisonText(opt.label))
    .filter((opt) => opt.length > 0);
  const optionTokenLists = optionNorms
    .map((opt) => tokenizeAskQuestionComparisonText(opt))
    .filter((tokens) => tokens.length > 0);
  const optionSet = new Set(optionNorms);
  const bridgeLinePatterns: RegExp[] = [
    /\bwhich option do you choose\b/i,
    /\bwhich one do you choose\b/i,
    /\bwhich answer do you choose\b/i,
    /\bchoose one\b/i,
    /\bchoose an option\b/i,
    /\bchoose one option\b/i,
    /\bpick one\b/i,
    /\bpick an option\b/i,
    /\bselect one\b/i,
    /\bselect an option\b/i,
    /\bchoose from (?:the )?options\b/i,
    /\bpick from (?:the )?options\b/i,
    /\bselect from (?:the )?options\b/i,
    /\btap (?:an )?option\b/i,
    /\bclick (?:an )?option\b/i,
    /\breply with [abc123]\b/i,
    /\brespond with [abc123]\b/i,
  ];

  const lines = displayContent.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const norm = normalizeAskQuestionComparisonText(line);
    if (!norm) return true;

    if (lineLooksLikePromptDuplicate(line, promptNorm)) return false;
    if (lineLooksLikeOptionDuplicate(line, optionSet, optionTokenLists)) return false;

    // Drop stray fourth+ options (e.g. "D) ...") that are not in the chip payload.
    const extraEnum = /^(?:[>*-]\s*)?(?:option\s+)?(?:[DEFdef]|[4-9]|[1-9]\d)[)\].:-]/;
    if (extraEnum.test(line.trim())) {
      const optionLeadStrip =
        /^(?:[-*•]\s*)?(?:option|choice|answer)?\s*(?:[A-Da-d1-4])[)\].:-]\s*/i;
      const strippedNorm = normalizeAskQuestionComparisonText(
        line.replace(/\*\*/g, "").replace(optionLeadStrip, "")
      );
      if (strippedNorm.length > 0 && !optionSet.has(strippedNorm)) {
        return false;
      }
    }

    // Generic bridge lines become redundant once chips are visible.
    if (bridgeLinePatterns.some((pattern) => pattern.test(norm))) {
      return false;
    }

    return true;
  });

  // Collapse excessive blank lines after stripping duplicates.
  const compacted: string[] = [];
  for (const line of filtered) {
    const isBlank = line.trim().length === 0;
    const prevBlank = compacted.length > 0 && compacted[compacted.length - 1]!.trim().length === 0;
    if (isBlank && prevBlank) continue;
    compacted.push(line);
  }
  return compacted.join("\n").trim();
}

function generateConversationTitle(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Untitled chat";
  }
  return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed;
}

function generateStarterConversationTitle(label?: string): string {
  const trimmed = label?.trim();
  return trimmed ? `${trimmed} starter` : "Conversation starter";
}

const STARTER_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "about",
  "at",
  "be",
  "can",
  "chat",
  "conversation",
  "could",
  "do",
  "first",
  "for",
  "from",
  "give",
  "how",
  "in",
  "into",
  "is",
  "kind",
  "kinds",
  "let",
  "lets",
  "me",
  "more",
  "of",
  "on",
  "one",
  "or",
  "our",
  "please",
  "question",
  "should",
  "show",
  "start",
  "starter",
  "talk",
  "tell",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

function inferStarterConversationTitleFromOpening(assistantOpening: string, label?: string): string {
  const words = assistantOpening
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !STARTER_TITLE_STOP_WORDS.has(word));
  if (words.length === 0) return generateStarterConversationTitle(label);
  const topicTitle = words
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return topicTitle.length > 42 ? `${topicTitle.slice(0, 39).trimEnd()}...` : topicTitle;
}

function isGenericStarterTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized === "starter" ||
    normalized === "conversation starter" ||
    normalized.endsWith(" starter")
  );
}

function buildStarterPromptInstruction(): string {
  return [
    "Deliver a SHORT opening message (a few sentences at most) that sounds unmistakably in-character.",
    "Functionally simple: invite the human in with ONE clear conversational hook—not a roadmap, briefing, or list of topics.",
    "Ask exactly ONE direct question to the user, and end that question with a question mark.",
    "If memory hints are available, weave ONE specific remembered detail into the question naturally.",
    "Vary the wording so the opener feels fresh, not canned.",
    "Stay anchored in your persona; avoid generic-chatbot vibes.",
    "Reply as plain prose only—do not wrap the opening in quotation marks.",
    "Do not mention system prompts, hidden instructions, or that this turn was auto-started.",
  ].join(" ");
}

function normalizeStarterOpeningDisplay(displayContent: string): string {
  const trimmed = displayContent.trim();
  if (!trimmed) return displayContent;

  let normalized = trimmed;
  const BLOCKQUOTE_WRAPPER_RE = /^\s*(?:>\s*)+/;
  const MAX_UNWRAP_DEPTH = 6;
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH; depth += 1) {
    const lines = normalized.split(/\r?\n/);
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    if (
      nonEmptyLines.length === 0 ||
      !nonEmptyLines.every((line) => BLOCKQUOTE_WRAPPER_RE.test(line))
    ) {
      break;
    }
    normalized = lines
      .map((line) => line.replace(BLOCKQUOTE_WRAPPER_RE, ""))
      .join("\n")
      .trim();
  }

  const quotePairs: Array<{ open: string; close: string }> = [
    { open: "\"", close: "\"" },
    { open: "'", close: "'" },
    { open: "`", close: "`" },
    { open: "“", close: "”" },
    { open: "‘", close: "’" },
    { open: "\\\"", close: "\\\"" },
    { open: "\\'", close: "\\'" },
    { open: "\\`", close: "\\`" },
  ];
  let unwrapped = normalized;
  let unwrappedEscapedQuotes = false;
  for (let i = 0; i < MAX_UNWRAP_DEPTH; i += 1) {
    const pair = quotePairs.find(({ open, close }) =>
      unwrapped.startsWith(open) && unwrapped.endsWith(close)
    );
    if (!pair) break;
    const inner = unwrapped.slice(pair.open.length, unwrapped.length - pair.close.length).trim();
    if (!inner) break;
    if (pair.open.startsWith("\\")) unwrappedEscapedQuotes = true;
    unwrapped = inner;
  }
  if (!unwrappedEscapedQuotes) return unwrapped;
  return unwrapped
    .replace(/\\(["'`])/g, "$1")
    .replace(/\\([“”‘’])/g, "$1");
}

const STARTER_MEMORY_STOP_WORDS = new Set([
  "about",
  "again",
  "also",
  "that",
  "them",
  "then",
  "they",
  "this",
  "with",
  "from",
  "into",
  "your",
  "you",
  "user",
  "what",
  "when",
  "where",
  "which",
  "while",
  "would",
  "could",
  "should",
  "today",
  "right",
]);

function toSecondPersonMemoryAnchor(memoryText: string): string {
  const trimmed = memoryText.trim().replace(/[.!?]+$/, "");
  if (!trimmed) return "you have something meaningful on your mind";
  let normalized = trimmed
    .replace(/^the user\b/i, "you")
    .replace(/^user\b/i, "you")
    .replace(/^i\b/i, "you")
    .replace(/^you consistently\b/i, "you generally")
    .trim();
  normalized = normalized
    .replace(/\byou\s+prefers\b/gi, "you prefer")
    .replace(/\byou\s+likes\b/gi, "you like")
    .replace(/\byou\s+wants\b/gi, "you want")
    .replace(/\byou\s+needs\b/gi, "you need")
    .replace(/\byou\s+has\b/gi, "you have")
    .replace(/\byou\s+is\b/gi, "you are")
    .replace(/\byou\s+does\b/gi, "you do")
    .replace(/\byou\s+goes\b/gi, "you go")
    .replace(/\byou\s+feels\b/gi, "you feel");
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function memoryKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 5 && !STARTER_MEMORY_STOP_WORDS.has(token));
}

function openingMentionsMemory(opening: string, memoryAnchor: string): boolean {
  const openingLower = opening.toLowerCase();
  const keywords = memoryKeywords(memoryAnchor);
  if (keywords.length === 0) return false;
  return keywords.some((keyword) => openingLower.includes(keyword));
}

function enforceStarterOpeningQuestion(
  displayContent: string,
  memoryLines: string[]
): string {
  const normalized = normalizeStarterOpeningDisplay(displayContent).trim();
  const pickedMemory = memoryLines[0]?.trim() ?? "";
  if (pickedMemory) {
    const memoryAnchor = toSecondPersonMemoryAnchor(pickedMemory);
    if (!openingMentionsMemory(normalized, memoryAnchor)) {
      return `Given that ${memoryAnchor}, what feels most important to explore right now?`;
    }
  }
  if (normalized.includes("?")) return normalized;
  const base = normalized.replace(/[.!]+$/, "").trim();
  if (!base) return "What feels most important to explore right now?";
  return `${base}. What feels most important to explore right now?`;
}

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
  tool_payload: string | null;
  created_at: string;
};

function hydrateMessages(rows: MessageRow[]): ChatMessage[] {
  return rows.map((row) => {
    const base: ChatMessage = {
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      provider:
        row.provider === "local" || row.provider === "openai"
          ? row.provider
          : undefined,
      model: row.model ?? undefined,
      botName: row.bot_name ? row.bot_name : undefined,
      botColor: row.bot_color ? row.bot_color : undefined,
      botGlyph: row.bot_glyph ? row.bot_glyph : undefined,
    };
    if (row.role !== "assistant") {
      return base;
    }
    const assembled = hydrateAssistantMessageParts({
      content: row.content,
      toolPayload: row.tool_payload,
    });
    return {
      ...base,
      content: assembled.content,
      ...(assembled.askQuestion ? { askQuestion: assembled.askQuestion } : {}),
    };
  });
}

type OpinionRow = {
  score: number;
  trend: string;
  last_reason: string;
  recent_reasons: string;
  updated_at: string;
};

function opinionScopeKey(botId: string | null | undefined): string {
  if (typeof botId !== "string" || botId.trim().length === 0) {
    return DEFAULT_BOT_SCOPE_KEY;
  }
  return botId.trim();
}

function parseRecentOpinionReasons(serialized: string): string[] {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, OPINION_REASON_LIMIT);
  } catch {
    return [];
  }
}

function readSessionOpinion(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  botId: string | null | undefined
): SessionOpinion | null {
  const row = db
    .prepare(
      `SELECT score, trend, last_reason, recent_reasons, updated_at
       FROM session_opinions
       WHERE user_id = ? AND conversation_id = ? AND bot_scope_key = ?`
    )
    .get(userId, conversationId, opinionScopeKey(botId)) as OpinionRow | undefined;
  if (!row) return null;
  const trend: OpinionTrend =
    row.trend === "up" || row.trend === "down" || row.trend === "steady"
      ? row.trend
      : "steady";
  return buildOpinion(
    row.score,
    trend,
    row.last_reason || "No opinion shift yet.",
    parseRecentOpinionReasons(row.recent_reasons),
    row.updated_at
  );
}

function upsertSessionOpinion(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  botId: string | null | undefined;
  message: string;
  updatedAt: string;
}): SessionOpinion {
  const { db, userId, conversationId, botId, message, updatedAt } = args;
  const existing = readSessionOpinion(db, userId, conversationId, botId);
  const evaluation = evaluateUserTurnOpinion(message);
  const previousScore = existing?.score ?? OPINION_SCORE_BASELINE;
  const score = clampOpinionScore(previousScore + evaluation.delta);
  const trend = evaluation.trend;
  const reasons = [
    evaluation.reason,
    ...(existing?.recentReasons ?? []),
  ].slice(0, OPINION_REASON_LIMIT);
  db.prepare(
    `INSERT INTO session_opinions (
      user_id, conversation_id, bot_scope_key, bot_id, score, band, trend, last_reason, recent_reasons, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, conversation_id, bot_scope_key) DO UPDATE SET
      bot_id = excluded.bot_id,
      score = excluded.score,
      band = excluded.band,
      trend = excluded.trend,
      last_reason = excluded.last_reason,
      recent_reasons = excluded.recent_reasons,
      updated_at = excluded.updated_at`
  ).run(
    userId,
    conversationId,
    opinionScopeKey(botId),
    botId ?? null,
    score,
    opinionBandFromScore(score),
    trend,
    evaluation.reason,
    JSON.stringify(reasons),
    updatedAt
  );
  return buildOpinion(score, trend, evaluation.reason, reasons, updatedAt);
}

/**
 * Assemble the final system+history payload the provider actually sees.
 *
 * Order is deliberate:
 *   1. Bot persona (if any) plus Prism AskQuestion appendix — or appendix only
 *      when Default / no composeBotSystemPrompt.
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
  askQuestionMode: "off" | "explicit" | "continuation";
}): ProviderMessage[] {
  const promptMessages: ProviderMessage[] = [];
  const trimmedBot = args.botSystemPrompt?.trim();
  const toolsBlock =
    trimmedBot &&
    trimmedBot.length > 0
      ? `${trimmedBot}\n\n${PRISM_ASSISTANT_TOOLS_APPENDIX}`
      : PRISM_ASSISTANT_TOOLS_APPENDIX;
  promptMessages.push({ role: "system", content: toolsBlock });
  if (args.askQuestionMode === "explicit") {
    promptMessages.push({
      role: "system",
      content:
        "The user's latest message explicitly asks for AskQuestion/multiple-choice. " +
        "For this turn, ask exactly ONE multiple-choice question (not a quiz), keep exactly three options, and append one valid Prism AskQuestion tool block after your prose.",
    });
  } else if (args.askQuestionMode === "continuation") {
    promptMessages.push({
      role: "system",
      content:
        "Continue the active AskQuestion flow from the prior turn. " +
        "For this turn, ask exactly ONE follow-up multiple-choice question, keep exactly three options, and append one valid Prism AskQuestion tool block after your prose.",
    });
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

function sanitizeEphemeralMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  if (!messages) return [];
  return messages
    .filter((message) =>
      (message.role === "user" || message.role === "assistant" || message.role === "system") &&
      message.content.trim().length > 0
    )
    .slice(-RECENT_WINDOW_SIZE);
}

function privateConversationTitle(messages: ChatMessage[], fallbackMessage: string, label?: string): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (firstUserMessage) {
    return generateConversationTitle(firstUserMessage.content);
  }
  return fallbackMessage.trim().length > 0
    ? generateConversationTitle(fallbackMessage)
    : generateStarterConversationTitle(label);
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
  userKey: Buffer,
  botId: string | null,
  includeThreadSummaries: boolean
): Promise<string[]> {
  const timeoutSentinel = Symbol("memory-timeout");
  const timeout = new Promise<typeof timeoutSentinel>((resolve) => {
    setTimeout(() => resolve(timeoutSentinel), MEMORY_RETRIEVAL_TIMEOUT_MS);
  });
  const retrieval = Promise.allSettled([
    retrieveRelevantMemories(db, userId, message, userKey, botId),
    includeThreadSummaries
      ? retrieveMemorySummaries(userId, message)
      : Promise.resolve([]),
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
): Promise<ProcessChatMessageResult> {
  const now = new Date().toISOString();
  const mode: ChatMode = settings.mode ?? "sandbox";
  const isStarterPrompt = settings.starterPrompt === true;
  const explicitAskQuestionRequest =
    !isStarterPrompt && userExplicitlyRequestedAskQuestion(message);
  const promptUserMessage = isStarterPrompt
    ? buildStarterPromptInstruction()
    : message;
  // Incognito is a Chat-mode concept (see shared types): keeps the thread
  // client-held and skips all memory. Provider choice remains the normal
  // local/online user setting; Sandbox ignores `incognito` entirely.
  const incognitoForTurn = mode === "chat" && settings.incognito === true;
  const effectiveProvider = settings.preferredProvider;
  // The memory concerns are deliberately NOT one flag:
  //   - skipPersonalFacts: don't write to `memories`. True only for
  //     incognito; bot-scoped memories intentionally grow across Chat
  //     and Sandbox when auto-memory is enabled.
  //   - skipSummarization: don't run any summarizer. True only for
  //     incognito — Sandbox still summarizes, just into a thread-scoped,
  //     Qdrant-free path.
  //   - retrievalMode: which thread summary path (if any) feeds this turn.
  const skipPersonalFacts = incognitoForTurn;
  const skipSummarization = incognitoForTurn;
  const retrievalMode: "none" | "cross_thread" | "thread_only" =
    incognitoForTurn
      ? "none"
      : mode === "sandbox"
        ? "thread_only"
        : "cross_thread";
  const activeBotId = settings.botId;
  const activeMemoryBotId =
    typeof activeBotId === "string" && activeBotId.trim().length > 0
      ? activeBotId.trim()
      : null;
  const provider = selectProvider(
    effectiveProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost
  );
  const auxiliaryProvider = getAuxiliaryProvider();

  if (incognitoForTurn) {
    const history = sanitizeEphemeralMessages(settings.ephemeralMessages);
    const continueAskQuestion =
      !isStarterPrompt &&
      !explicitAskQuestionRequest &&
      shouldContinueAskQuestionFromPriorTurn(history, message);
    const forceAskQuestion = explicitAskQuestionRequest || continueAskQuestion;
    const askQuestionMode: "off" | "explicit" | "continuation" = forceAskQuestion
      ? explicitAskQuestionRequest
        ? "explicit"
        : "continuation"
      : "off";
    const promptMessages = buildPromptMessages({
      botSystemPrompt: settings.botSystemPrompt,
      threadSummary: null,
      memoryLines: [],
      chatHistory: history,
      userMessage: promptUserMessage,
      askQuestionMode,
    });

    const assistantReplyRaw = await provider.generateResponse(
      promptMessages,
      settings.botOverrides
    );
    const parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
    const shouldBackfillAskQuestion =
      forceAskQuestion ||
      assistantLikelyIntendedAskQuestion(parsedAssistant.displayContent);
    const askQuestionRaw =
      parsedAssistant.askQuestion ??
      (shouldBackfillAskQuestion
        ? buildAskQuestionFallback(parsedAssistant.displayContent, message)
        : undefined);
    const askQuestionForTurn = askQuestionRaw
      ? refineAskQuestionPayloadFromDisplay(
          parsedAssistant.displayContent,
          askQuestionRaw
        )
      : undefined;
    const assistantDisplayRaw = stripAskQuestionDuplicatesFromDisplay(
      parsedAssistant.displayContent,
      askQuestionForTurn
    );
    const assistantDisplay = isStarterPrompt
      ? enforceStarterOpeningQuestion(assistantDisplayRaw, [])
      : assistantDisplayRaw;
    const modelUsed =
      settings.botOverrides?.model?.trim() ||
      (provider.name === "local" ? config.ollamaModel : OPENAI_DEFAULT_MODEL);
    const assistantCreatedAt = new Date().toISOString();
    const activeBotName =
      typeof activeBotId === "string"
        ? settings.starterPromptLabel?.trim() ?? ""
        : "";
    const assistantMessage: ChatMessage = {
      id: randomId(12),
      role: "assistant",
      content: assistantDisplay,
      createdAt: assistantCreatedAt,
      provider: provider.name,
      model: modelUsed,
      ...(activeBotName ? { botName: activeBotName } : {}),
      ...(askQuestionForTurn ? { askQuestion: askQuestionForTurn } : {}),
    };
    const nextMessages: ChatMessage[] = [
      ...history,
      ...(
        isStarterPrompt
          ? []
          : [{
              id: randomId(12),
              role: "user" as const,
              content: message,
              createdAt: now,
            }]
      ),
      assistantMessage,
    ];
    const conversationIncognito: Conversation = {
      id: conversationId ?? randomId(12),
      userId,
      title: privateConversationTitle(nextMessages, message, settings.starterPromptLabel),
      botId: activeBotId ?? null,
      incognito: true,
      lastBotId: activeBotId ?? null,
      lastBotColor: null,
      hasAssistantReply: true,
      createdAt: nextMessages[0]?.createdAt ?? now,
      updatedAt: assistantCreatedAt,
      messages: nextMessages,
    };

    let conversationStartersIncognito: string[] | undefined;
    if (isStarterPrompt) {
      const startersInferred = await inferConversationStarters(
        auxiliaryProvider,
        assistantDisplay,
        settings.starterPromptLabel,
        settings.botOverrides
      );
      if (startersInferred.length >= 3) {
        conversationStartersIncognito = startersInferred;
      }
    }
    const incognitoOpinion = isStarterPrompt
      ? buildOpinion(
          OPINION_SCORE_BASELINE,
          "steady",
          "Opinion meter starts tracking once the conversation begins.",
          [],
          assistantCreatedAt
        )
      : (() => {
          const evaluation = evaluateUserTurnOpinion(message);
          const score = clampOpinionScore(OPINION_SCORE_BASELINE + evaluation.delta);
          return buildOpinion(
            score,
            evaluation.trend,
            evaluation.reason,
            [evaluation.reason],
            assistantCreatedAt
          );
        })();

    return {
      conversation: conversationIncognito,
      opinion: incognitoOpinion,
      ...(conversationStartersIncognito
        ? { conversationStarters: conversationStartersIncognito }
        : {}),
    };
  }

  let activeConversationId = conversationId;
  if (!activeConversationId) {
    activeConversationId = randomId(12);
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      activeConversationId,
      userId,
      isStarterPrompt
        ? generateStarterConversationTitle(settings.starterPromptLabel)
        : generateConversationTitle(message),
      activeBotId ?? null,
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
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(activeConversationId, userId, RECENT_WINDOW_SIZE) as MessageRow[];
  const history = hydrateMessages(historyRowsDesc.slice().reverse());
  const continueAskQuestion =
    !isStarterPrompt &&
    !explicitAskQuestionRequest &&
    shouldContinueAskQuestionFromPriorTurn(history, message);
  const forceAskQuestion = explicitAskQuestionRequest || continueAskQuestion;
  const askQuestionMode: "off" | "explicit" | "continuation" = forceAskQuestion
    ? explicitAskQuestionRequest
      ? "explicit"
      : "continuation"
    : "off";

  let threadSummary: string | null = null;
  let memoryLines: string[] = [];
  if (retrievalMode === "thread_only") {
    threadSummary = getLatestThreadSummary(db, userId, activeConversationId);
  }
  if (!incognitoForTurn) {
    if (isStarterPrompt && retrievalMode === "cross_thread") {
      memoryLines = retrieveRecentMemoriesForStarter(
        db,
        userId,
        userKey,
        activeMemoryBotId
      ).map((memory) => memory.text);
    } else if (!isStarterPrompt) {
      memoryLines = await retrieveMemoriesWithFallback(
        db,
        provider,
        userId,
        message,
        userKey,
        activeMemoryBotId,
        retrievalMode === "cross_thread"
      );
    }
  }

  const promptMessages = buildPromptMessages({
    botSystemPrompt: settings.botSystemPrompt,
    threadSummary,
    memoryLines,
    chatHistory: history,
    userMessage: promptUserMessage,
    askQuestionMode,
  });

  let userMessageId: string | null = null;
  if (!isStarterPrompt) {
    userMessageId = randomId(12);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, bot_id, created_at) VALUES (?, ?, ?, 'user', ?, NULL, NULL, ?)"
    ).run(userMessageId, activeConversationId, userId, message, now);
  }

  const assistantReplyRaw = await provider.generateResponse(
    promptMessages,
    settings.botOverrides
  );
  const parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
  const shouldBackfillAskQuestion =
    forceAskQuestion ||
    assistantLikelyIntendedAskQuestion(parsedAssistant.displayContent);
  const askQuestionRaw =
    parsedAssistant.askQuestion ??
    (shouldBackfillAskQuestion
      ? buildAskQuestionFallback(parsedAssistant.displayContent, message)
      : undefined);
  const askQuestionForTurn = askQuestionRaw
    ? refineAskQuestionPayloadFromDisplay(
        parsedAssistant.displayContent,
        askQuestionRaw
      )
    : undefined;
  const assistantDisplayRaw = stripAskQuestionDuplicatesFromDisplay(
    parsedAssistant.displayContent,
    askQuestionForTurn
  );
  const assistantDisplay = isStarterPrompt
    ? enforceStarterOpeningQuestion(assistantDisplayRaw, memoryLines)
    : assistantDisplayRaw;
  const toolPayloadStored =
    askQuestionForTurn !== undefined
      ? serializeAskQuestionTool(askQuestionForTurn)
      : null;
  const modelUsed =
    settings.botOverrides?.model?.trim() ||
    (provider.name === "local" ? config.ollamaModel : OPENAI_DEFAULT_MODEL);
  const assistantCreatedAt = new Date().toISOString();
  const assistantMessageId = randomId(12);
  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)"
  ).run(
    assistantMessageId,
    activeConversationId,
    userId,
    assistantDisplay,
    provider.name,
    modelUsed,
    activeBotId ?? null,
    toolPayloadStored,
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
  if (activeBotId !== undefined) {
    db.prepare(
      "UPDATE conversations SET updated_at = ?, bot_id = ? WHERE id = ? AND user_id = ?"
    ).run(
      assistantCreatedAt,
      activeBotId,
      activeConversationId,
      userId
    );
  } else {
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(assistantCreatedAt, activeConversationId, userId);
  }
  const opinion = isStarterPrompt
    ? readSessionOpinion(db, userId, activeConversationId, activeBotId) ??
      buildOpinion(
        OPINION_SCORE_BASELINE,
        "steady",
        "Opinion meter starts tracking once the conversation begins.",
        [],
        assistantCreatedAt
      )
    : upsertSessionOpinion({
        db,
        userId,
        conversationId: activeConversationId,
        botId: activeBotId,
        message,
        updatedAt: assistantCreatedAt,
      });

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
  const assistantMessageCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
      )
      .get(activeConversationId, userId) as { n: number }
  ).n;
  if (assistantMessageCount === 1) {
    const starterFallbackTitle = isStarterPrompt
      ? inferStarterConversationTitleFromOpening(assistantDisplay, settings.starterPromptLabel)
      : null;
    if (isStarterPrompt && starterFallbackTitle) {
      db.prepare(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).run(starterFallbackTitle, assistantCreatedAt, activeConversationId, userId);
    }
    const titleConversationId = activeConversationId;
    const titleUserId = userId;
    const titleUserMessage = message;
    const titleAssistantReply = assistantDisplay;
    const titleAssistantMessageId = assistantMessageId;
    const titlePersonaLabel = settings.starterPromptLabel;
    const titleOverrides = settings.botOverrides;
    queueMicrotask(() => {
      void inferConversationTitle(
        auxiliaryProvider,
        titleUserMessage,
        titleAssistantReply,
        titlePersonaLabel,
        titleOverrides
      )
        .then((title) => {
          const chosenTitle = isStarterPrompt
            ? (isGenericStarterTitle(title) ? starterFallbackTitle : (title ?? starterFallbackTitle))
            : title;
          if (!chosenTitle) return;
          const currentAssistantCount = (
            db
              .prepare(
                "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
              )
              .get(titleConversationId, titleUserId) as { n: number }
          ).n;
          const sourceAssistant = db
            .prepare(
              "SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND user_id = ? AND role = 'assistant'"
            )
            .get(titleAssistantMessageId, titleConversationId, titleUserId) as
            | { id: string }
            | undefined;
          if (currentAssistantCount !== 1 || !sourceAssistant?.id) return;
          db.prepare(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?"
          ).run(chosenTitle, new Date().toISOString(), titleConversationId, titleUserId);
        })
        .catch(() => {});
    });
  }

  // Cross-thread facts: auto-memory still captures normal personal facts,
  // while explicit conversational cues ("save that globally", "forget X")
  // are honored even when the global auto-memory toggle is off.
  let memoryLearned: ProcessChatMessageResult["memoryLearned"];
  const memoryIntent = !isStarterPrompt ? analyzeMemoryIntent(message) : null;
  const shouldProcessExplicitMemory =
    memoryIntent !== null &&
    (memoryIntent.kind !== "create" || memoryIntent.scope === "global" || memoryIntent.explicit);
  if (
    !skipPersonalFacts &&
    !isStarterPrompt &&
    memoryIntent &&
    (settings.autoMemory || shouldProcessExplicitMemory)
  ) {
    const createdMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["created"] = [];
    const retractedMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["retracted"] = [];
    const rejectedMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["rejected"] = [];
    const cuePhrases =
      memoryIntent.kind === "retract" || memoryIntent.kind === "correct"
        ? memoryIntent.cuePhrases
        : [];
    for (const cuePhrase of cuePhrases) {
      const target = await findMemoryByCue(
        db,
        userId,
        activeConversationId,
        activeMemoryBotId,
        cuePhrase,
        userKey
      );
      if (target && deleteMemoryById(db, userId, target.id)) {
        retractedMemories.push({
          id: target.id,
          text: target.text,
          botId: target.botId ?? null,
          conversationId: target.conversationId,
          confidence: target.confidence,
          source: target.source,
          certainty: target.certainty,
          sourceMessageIds: target.sourceMessageIds,
        });
      }
    }

    const candidates =
      memoryIntent.kind === "correct"
        ? memoryIntent.newCandidates
        : memoryIntent.kind === "create"
          ? memoryIntent.candidates
          : [];
    if (candidates.length > 0) {
      const memoryIntentScope =
        memoryIntent.kind === "retract" ? "bot" : memoryIntent.scope;
      const memoryBotId =
        memoryIntentScope === "global"
          ? null
          : activeMemoryBotId;
      const validation = await validateMemoryCandidates(auxiliaryProvider, {
        source: "direct",
        scope: memoryIntentScope,
        rawContext: message,
        candidates,
      });
      rejectedMemories.push(...validation.rejected);
      const validatedByText = new Map(
        validation.candidates.map((candidate) => [candidate.text, candidate])
      );
      const storedMemories = await persistMemoryCandidates(
        db,
        userId,
        activeConversationId,
        memoryBotId,
        validation.candidates,
        userKey,
        { sourceMessageIds: userMessageId ? [userMessageId] : [] }
      );
      createdMemories.push(
        ...storedMemories.map((memory) => {
          const validationMatch = validatedByText.get(memory.text);
          return {
            id: memory.id,
            text: memory.text,
            botId: memory.botId ?? null,
            conversationId: memory.conversationId,
            confidence: memory.confidence,
            source: memory.source,
            certainty: memory.certainty,
            sourceMessageIds: memory.sourceMessageIds,
            ...(validationMatch
              ? {
                  validationStatus: validationMatch.validationStatus,
                  originalText: validationMatch.originalText,
                  reasonCodes: validationMatch.reasonCodes,
                }
              : {}),
          };
        })
      );
    }

    if (
      createdMemories.length > 0 ||
      retractedMemories.length > 0 ||
      rejectedMemories.length > 0
    ) {
      memoryLearned = {
        created: createdMemories,
        retracted: retractedMemories,
        rejected: rejectedMemories,
        maxConfidence: Math.max(
          0,
          ...createdMemories.map((memory) => memory.confidence),
          ...retractedMemories.map((memory) => memory.confidence)
        ),
      };
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
        auxiliaryProvider,
        userId,
        activeConversationId,
        userKey
      ).catch(() => {});
    } else if (mode === "sandbox") {
      // Thread compaction is NOT gated by autoMemory — that setting is a
      // user-facing knob for the sidebar "Memories" list, which Sandbox
      // deliberately doesn't touch. Compaction is context plumbing.
      summarizeThreadCompact(
        db,
        auxiliaryProvider,
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
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(activeConversationId, userId) as MessageRow[];

  const conversationPersisted: Conversation = {
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

  let conversationStartersPersisted: string[] | undefined;
  if (isStarterPrompt) {
    const startersPersisted = await inferConversationStarters(
      auxiliaryProvider,
      assistantDisplay,
      settings.starterPromptLabel,
      settings.botOverrides
    );
    if (startersPersisted.length >= 3) {
      conversationStartersPersisted = startersPersisted;
    }
  }

  return {
    conversation: conversationPersisted,
    opinion,
    ...(memoryLearned ? { memoryLearned } : {}),
    ...(conversationStartersPersisted
      ? { conversationStarters: conversationStartersPersisted }
      : {}),
  };
}
