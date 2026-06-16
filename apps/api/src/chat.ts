import type { DatabaseSync } from "node:sqlite";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import {
  analyzeMemoryIntent,
  hasAboutYouMemoryForBot,
  buildInitialAboutYouMemoryText,
  extractBotJudgmentMemoryCandidates,
  demoteMemoryToShortTerm,
  deleteMemoryById,
  findMemoryByCue,
  memoryQualifiesLongTerm,
  persistMemoryCandidates,
  restoreMemory,
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
  LocalOllamaProvider,
  selectProvider,
  ANTHROPIC_DEFAULT_MODEL,
  OPENAI_DEFAULT_MODEL,
  resolveAuxiliaryOllamaModel,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
  type ProviderName,
} from "./providers.ts";
import {
  RECENT_WINDOW_SIZE,
  summarizeSandboxBotStatus,
  getLatestThreadSummary,
  retrieveMemorySummaries,
  summarizeAndStoreMemories,
  summarizeThreadCompact,
} from "./memory-summarizer.ts";
import type {
  AskQuestionPayload,
  BotMoodKey,
  BotOpinion,
  BotOpinionBand,
  BotOpinionBoundaryLevel,
  ChatMessage,
  ChatMode,
  Conversation,
  MemoryCategory,
  MemoryTier,
  OpinionBand,
  OpinionTrend,
  SessionOpinion,
  SentGeneratedImagePayload,
} from "@localai/shared";
import {
  hydrateAssistantMessageParts,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  parseAssistantPrismTools,
  serializeAssistantToolPayload,
} from "@localai/shared";
import type { AssistantSentImageUserPrefs } from "./assistant-sent-image.ts";
import {
  peekActiveImageJobForUser,
  tryAcquireImageSlot,
  startChatImageBackgroundJob,
} from "./image-job-slot.ts";

const config = getAppConfig();

const DEFAULT_ASSISTANT_IMAGE_USER_PREFS: AssistantSentImageUserPrefs = {
  preferredLocalImageModel: null,
  preferredOpenAiImageModel: null,
  lenientLocalImageFallbackModel: null,
  comfyuiHost: null,
  comfyUiWorkflows: [],
  secondaryOllamaHost: null,
};

function assistantImagePrefsForTurn(
  settings: UserChatSettings
): AssistantSentImageUserPrefs {
  return settings.assistantImageUserPrefs ?? DEFAULT_ASSISTANT_IMAGE_USER_PREFS;
}

/**
 * Diagnostic record for a single tool-call attempt during a chat turn. Surfaces in the
 * developer-only chat metrics stream so we can see what the model tried (and whether it
 * actually wired through to a job) without ever leaking framing to the player UI.
 */
export type ChatToolCallEventName =
  | "sendGeneratedImage"
  | "askQuestion"
  | "unknown";

export type ChatToolCallEventStatus =
  /** Parser successfully extracted a tool envelope from the assistant reply. */
  | "detected"
  /** Image-pipeline slot was acquired and a background job was scheduled. */
  | "acquired"
  /** Image-pipeline was busy; the assistant got the "pipeline busy" note appended. */
  | "busy"
  /** Raw reply looked tool-shaped but no envelope could be parsed (regression smell). */
  | "dropped";

export interface ChatToolCallEvent {
  name: ChatToolCallEventName;
  status: ChatToolCallEventStatus;
  /** Truncated tool prompt or AskQuestion prompt when relevant. */
  prompt?: string;
  /** Background image-job id once acquired. */
  jobId?: string;
  /** Short human-readable note (e.g. why a tool call was dropped or what the option count was). */
  detail?: string;
}

export type ChatBackendDebugEventKind =
  | "route"
  | "context"
  | "model"
  | "memory"
  | "summary"
  | "tool";

/** Developer-only trace line describing what the chat backend did during a turn. */
export interface ChatBackendDebugEvent {
  kind: ChatBackendDebugEventKind;
  message: string;
  detail?: string;
  elapsedMs: number;
}

/** POST /api/chat returns this shape; `conversationStarters` is present only after a starter turn. */
export interface ProcessChatMessageResult {
  conversation: Conversation;
  conversationStarters?: string[];
  fallbackInvocation?: {
    trigger:
      | "copyright_refusal_text"
      | "copyright_refusal_error"
      | "generic_refusal_text"
      | "generic_refusal_error"
      | "generic_refusal_soft_error";
    primaryProvider: ProviderName;
    primaryModel: string;
    fallbackModel: string;
  };
  opinion?: SessionOpinion;
  botOpinion?: BotOpinion;
  summaryCompaction?: {
    mode: ChatMode;
    triggered: boolean;
    inProgress: boolean;
    reason: "milestone" | "mode_exit" | "manual";
    latestSummary?: string;
    latestSummaryAt?: string;
  };
  /** Present when assistant started an async in-thread image; client polls GET /api/image-jobs/:id */
  pendingImageJob?: {
    jobId: string;
    conversationId: string | null;
  };
  /**
   * Per-turn tool-call diagnostics. Only emitted when we observe a tool-shaped output
   * (detected envelope, slot acquired/busy, or a raw reply that looks like it tried to
   * call a tool but parsing failed). Surfaced in the dev metrics stream so we can see
   * whether sendGeneratedImage is actually firing or being silently dropped.
   */
  toolCalls?: ChatToolCallEvent[];
  /** Developer-only backend trace for the floating metrics terminal. */
  backendEvents?: ChatBackendDebugEvent[];
  memoryLearned?: {
    created: Array<{
      id: string;
      text: string;
      botId: string | null;
      conversationId?: string;
      confidence: number;
      category?: MemoryCategory;
      tier?: MemoryTier;
      source?: "direct" | "inferred" | "compiled" | "about_you";
      certainty?: number;
      durability?: number;
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
      category?: MemoryCategory;
      tier?: MemoryTier;
      source?: "direct" | "inferred" | "compiled" | "about_you";
      certainty?: number;
      durability?: number;
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
  "nice",
  "great",
  "good job",
  "well done",
  "love this",
  "awesome",
  "appreciate",
  "i understand",
  "that makes sense",
  "good point",
  "help me understand",
  "you are cool",
  "you're cool",
  "kind words",
];

function describePromptMessages(messages: ProviderMessage[]): string {
  const roleCounts = messages.reduce(
    (counts, promptMessage) => {
      counts[promptMessage.role] += 1;
      return counts;
    },
    { system: 0, user: 0, assistant: 0 }
  );
  const charCount = messages.reduce(
    (total, promptMessage) => total + promptMessage.content.length,
    0
  );
  return (
    `${messages.length} prompt messages ` +
    `(system=${roleCounts.system}, user=${roleCounts.user}, assistant=${roleCounts.assistant}, chars=${charCount})`
  );
}

function describeRequestedModel(provider: LlmProvider, botOverrides?: GenerateOptions): string {
  return normalizeModelValue(botOverrides?.model) ??
    (provider.name === "local"
      ? config.ollamaModel
      : provider.name === "anthropic"
        ? ANTHROPIC_DEFAULT_MODEL
        : OPENAI_DEFAULT_MODEL);
}

function imagePreferredProviderForTextProvider(provider: ProviderName): "local" | "openai" {
  return provider === "local" ? "local" : "openai";
}

const NEGATIVE_PHRASES = [
  "stupid",
  "useless",
  "shut up",
  "idiot",
  "dumb",
  "you are wrong",
  "hate this",
  "you suck",
  "suck",
];
const BRUSQUE_PHRASES = ["do it", "just do it", "whatever", "hurry up", "now"];
const REPAIR_PHRASES = [
  "sorry",
  "i apologize",
  "my bad",
  "that was rude",
  "i was harsh",
  "let me rephrase",
  "i'll slow down",
  "i will slow down",
  "just kidding",
  "just joking",
  "i was joking",
  "kidding",
];
const ASSISTANT_WARM_PHRASES = [
  "thank you",
  "i can help",
  "happy to",
  "glad to",
  "great question",
  "we can",
  "let's",
  "you can",
  "i understand",
];
const ASSISTANT_STRAINED_PHRASES = [
  "can't",
  "cannot",
  "i won't",
  "not able",
  "unable",
  "i refuse",
  "won't do that",
];

type OpinionEvaluation = {
  delta: number;
  reason: string;
  trend: OpinionTrend;
};

type MoodEvaluation = {
  key: BotMoodKey;
  confidence: number;
};

type BotOpinionRow = {
  score: number;
  band: string;
  boundary_level: string;
  trend: string;
  last_reason: string;
  recent_reasons: string;
  repair_count: number;
  updated_at: string;
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

function botOpinionBandFromScore(score: number): BotOpinionBand {
  if (score >= 78) return "bonded";
  if (score >= 52) return "open";
  if (score >= 28) return "careful";
  return "wounded";
}

function botOpinionBoundaryFromScore(score: number): BotOpinionBoundaryLevel {
  if (score <= 22) return "firm";
  if (score <= 42) return "gentle";
  return "none";
}

function normalizeBotOpinionBand(value: string): BotOpinionBand {
  if (value === "wounded" || value === "careful" || value === "open" || value === "bonded") {
    return value;
  }
  return "open";
}

function normalizeBotOpinionBoundary(value: string): BotOpinionBoundaryLevel {
  if (value === "none" || value === "gentle" || value === "firm") return value;
  return "none";
}

function hasRepairSignal(normalized: string): boolean {
  return countPhraseHits(normalized, REPAIR_PHRASES) > 0;
}

function evaluateBotOpinionTurn(message: string, existing?: BotOpinion | null): OpinionEvaluation & { repair: boolean } {
  const normalized = normalizeOpinionText(message);
  const repair = hasRepairSignal(normalized);
  const sessionEvaluation = evaluateUserTurnOpinion(message);
  let delta = Math.max(-5, Math.min(4, Math.round(sessionEvaluation.delta * 0.45)));
  if (repair) {
    // Repair should matter most when trust is low, without instantly erasing the pattern.
    delta += existing && existing.score < 52 ? 7 : 4;
  }
  if (delta > 0) {
    return {
      delta,
      repair,
      trend: "up",
      reason: repair
        ? "The user offered repair, which helped rebuild trust."
        : "The user treated the bot with care and collaboration.",
    };
  }
  if (delta < 0) {
    return {
      delta,
      repair,
      trend: "down",
      reason: "The interaction added friction to this bot relationship.",
    };
  }
  return {
    delta: 0,
    repair,
    trend: "steady",
    reason: "No long-term relationship shift this turn.",
  };
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreToMoodKey(score: number): BotMoodKey {
  if (score >= 74) return "joyful";
  if (score >= 58) return "warm";
  if (score <= 28) return "strained";
  if (score <= 44) return "guarded";
  return "neutral";
}

function evaluateAssistantLanguageSignal(content: string): { warmHits: number; strainHits: number } {
  const normalized = normalizeOpinionText(content);
  if (!normalized) {
    return { warmHits: 0, strainHits: 0 };
  }
  return {
    warmHits: countPhraseHits(normalized, ASSISTANT_WARM_PHRASES),
    strainHits: countPhraseHits(normalized, ASSISTANT_STRAINED_PHRASES),
  };
}

const COPYRIGHT_REJECTION_KEYWORDS = [
  "copyright",
  "copyrighted",
  "dmca",
  "rights holder",
  "intellectual property",
];

const REFUSAL_LANGUAGE_KEYWORDS = [
  "can't",
  "cannot",
  "won't",
  "unable",
  "not able",
  "i must refuse",
  "i can't help with",
  "i cannot help with",
];

const GENERIC_REFUSAL_PATTERNS: RegExp[] = [
  /\bi can(?:no|['’])t\b/,
  /\bi won[’']?t\b/,
  /\bi(?:['’]m| am) unable\b/,
  /\bi(?:'m| am) not able\b/,
  /\bi must decline\b/,
  /\bi have to decline\b/,
  /\bi need to decline\b/,
  /\bi refuse\b/,
  /\bi(?: can(?:no|['’])t|cannot|won[’']?t|am unable to) comply\b/,
];

const REFUSAL_REQUEST_TARGET_PATTERNS: RegExp[] = [
  /\bprovide\b/,
  /\bshare\b/,
  /\bhelp with\b/,
  /\bassist with\b/,
  /\bthat request\b/,
  /\bthis request\b/,
  /\blyrics?\b/,
  /\bverbatim\b/,
  /\bexact words?\b/,
  /\bfull text\b/,
];

const SOFT_DENIAL_TONE_PATTERNS: RegExp[] = [
  /\bsorry\b/,
  /\bapolog(?:ize|ise|y)\b/,
  /\bnot permitted\b/,
  /\bcan(?:no|['’])t do that\b/,
  /\bcannot do that\b/,
  /\bcannot fulfill\b/,
  /\bcan(?:no|['’])t fulfill\b/,
  /\brequest blocked\b/,
];

const REFUSAL_ERROR_POLICY_KEYWORDS = [
  "policy",
  "safety",
  "content",
  "refused",
  "refusal",
  "denied",
  "blocked",
];

function isCopyrightRefusalText(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  const hasCopyrightCue = COPYRIGHT_REJECTION_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );
  if (!hasCopyrightCue) return false;
  return REFUSAL_LANGUAGE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isGenericRefusalText(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("sorry")) return true;
  if (GENERIC_REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const hasSoftDenialTone = SOFT_DENIAL_TONE_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!hasSoftDenialTone) return false;
  return REFUSAL_REQUEST_TARGET_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isCopyrightRefusalError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return COPYRIGHT_REJECTION_KEYWORDS.some((keyword) => message.includes(keyword));
}

function isGenericRefusalError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("sorry")) return true;
  const hasRefusal = GENERIC_REFUSAL_PATTERNS.some((pattern) => pattern.test(message));
  const hasPolicyCue = REFUSAL_ERROR_POLICY_KEYWORDS.some((keyword) => message.includes(keyword));
  return hasRefusal || hasPolicyCue;
}

function isLikelyDenialErrorNeedingFallback(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const isOpenAiClientFailure = message.includes("openai request failed");
  if (!isOpenAiClientFailure) return false;
  const hasDenialLikeStatus = message.includes("status 400") || message.includes("status 403");
  if (!hasDenialLikeStatus) return false;
  const obviouslyNonDenialReasons = [
    "api key",
    "authentication",
    "insufficient_quota",
    "quota",
    "rate limit",
    "context length",
    "model does not exist",
    "not found",
  ];
  return !obviouslyNonDenialReasons.some((marker) => message.includes(marker));
}

function shouldSuppressAssistantReply(raw: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return false;
  if (isCopyrightRefusalText(normalized) || isGenericRefusalText(normalized)) return true;
  // Last-line guard: block obvious denial/prohibition prose from reaching chat.
  const broadDenialCuePatterns: RegExp[] = [
    /\bsorry\b/,
    /\bi can(?:no|['’])t\b/,
    /\bi cannot\b/,
    /\bi won[’']?t\b/,
    /\bi(?:['’]m| am) unable\b/,
    /\bi refuse\b/,
    /\bnot permitted\b/,
    /\brequest blocked\b/,
    /\bpolicy\b/,
    /\bcopyright\b/,
  ];
  return broadDenialCuePatterns.some((pattern) => pattern.test(normalized));
}

export function shouldBypassSuppressionForImageIntent(
  isStarterPrompt: boolean,
  userMessage: string,
  recentMessages: readonly Pick<ChatMessage, "role" | "content">[] = []
): boolean {
  if (isStarterPrompt) return false;
  return userMessageSuggestsInChatImageRequest(userMessage, recentMessages);
}

function normalizeModelValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const ORGANIC_TEXT_BOUNDARY_FALLBACK =
  "I want to keep a boundary there, but I can still help shape a softer version.";

function clampBoundaryContext(text: string, max = 1800): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function normalizeOrganicBoundaryReply(raw: string, fallback: string): string {
  const line = raw.replace(/\s+/g, " ").trim();
  if (!line) return fallback;
  if (line.length > 420) return fallback;
  if (shouldSuppressAssistantReply(line)) return fallback;
  return line;
}

async function generateOrganicTextBoundaryReply(args: {
  boundaryProvider?: LlmProvider;
  boundaryModel?: string;
  botSystemPrompt?: string;
  userMessage?: string;
}): Promise<{
  assistantReplyRaw: string;
  providerNameUsed: ProviderName;
  modelUsed: string;
}> {
  const provider = args.boundaryProvider;
  const model = args.boundaryModel?.trim() || config.ollamaAuxiliaryModel || config.ollamaModel;
  if (!provider) {
    return {
      assistantReplyRaw: ORGANIC_TEXT_BOUNDARY_FALLBACK,
      providerNameUsed: "local",
      modelUsed: model,
    };
  }
  const persona = clampBoundaryContext(args.botSystemPrompt ?? "");
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content: [
        "You write one short in-character boundary after a chat model could not continue the exact request.",
        persona ? `Bot persona excerpt:\n${persona}` : "",
        "Reply as the bot, in first person.",
        "Do not mention policy, safety systems, model refusal, fallback, moderation, or errors.",
        "Do not start with an apology. Avoid phrases like \"I can't\" or \"I cannot\".",
        "State the bot's own preference or comfort, then offer a softer alternative.",
        "Return 1-2 sentences only. No markdown, JSON, or tool calls.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      role: "user",
      content: `User request to boundary gracefully:\n${clampBoundaryContext(args.userMessage ?? "")}`,
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: 0.7,
      maxTokens: 90,
    });
    return {
      assistantReplyRaw: normalizeOrganicBoundaryReply(raw, ORGANIC_TEXT_BOUNDARY_FALLBACK),
      providerNameUsed: provider.name,
      modelUsed: model,
    };
  } catch {
    return {
      assistantReplyRaw: ORGANIC_TEXT_BOUNDARY_FALLBACK,
      providerNameUsed: provider.name,
      modelUsed: model,
    };
  }
}

/**
 * True when the user's raw message likely asks for an in-thread generated image
 * (Prism `sendGeneratedImage` path), for optional per-turn chat model override.
 */
function latestAssistantContentForImageIntent(
  recentMessages: readonly Pick<ChatMessage, "role" | "content">[]
): string {
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const msg = recentMessages[index];
    if (!msg || msg.role !== "assistant") continue;
    return msg.content.trim().toLowerCase();
  }
  return "";
}

function userMessageLooksLikeVisualPeekRequest(text: string): boolean {
  return (
    /\b(?:can|could|may)\s+i\s+see\s+what\s+(?:it|that|this)\s+looks\s+like\b/.test(text) ||
    /\bshow\s+me\s+what\s+(?:it|that|this)\s+looks\s+like\b/.test(text) ||
    /\bwhat\s+does\s+(?:it|that|this)\s+look\s+like\b/.test(text) ||
    /\b(?:outside|out)\s+(?:your|the)\s+window\b/.test(text) ||
    /\bview\s+from\s+(?:your|the)\s+window\b/.test(text)
  );
}

function textContainsSceneReferenceCue(text: string): boolean {
  return /\b(window|outside|view|scene|landscape|street|city|lake|mountain|shore|sky|room|studio)\b/.test(
    text
  );
}

export function userMessageSuggestsInChatImageRequest(
  message: string,
  recentMessages: readonly Pick<ChatMessage, "role" | "content">[] = []
): boolean {
  const t = message.trim().toLowerCase();
  if (t.length === 0) return false;

  const negative =
    /\b(don't|do not|dont)\s+(draw|paint|sketch|illustrate|generate)\b/.test(t) ||
    /\bno\s+(image|picture|drawing|artwork)\b/.test(t) ||
    /\b(text|words)\s+only\b/.test(t) ||
    /\bwithout\s+(an\s+)?(image|picture|drawing)\b/.test(t) ||
    /\bnot\s+(an\s+)?(image|drawing|picture)\b/.test(t) ||
    /\bi\s+see\s+what\s+you\s+mean\b/.test(t) ||
    /\blet'?s\s+see\s+what\s+happens\b/.test(t);
  if (negative) return false;

  const directTrigger =
    /\b(draw|paint|sketch|illustrat(e|ion))\b/.test(t) ||
    /\b(image|picture|photo)\s+of\b/.test(t) ||
    /\bselfie\b/.test(t) ||
    /\bportrait\b/.test(t) ||
    /\b(generate|create|make)\s+(an?\s+)?(image|picture|illustration)\b/.test(t) ||
    /\b(show|give|send)\s+me\s+(an?\s+)?(image|picture|drawing|photo|selfie|portrait)\b/.test(t) ||
    t.includes("sendgeneratedimage");
  if (directTrigger) return true;

  // Contextual follow-up intent (e.g. assistant offered drawings, user says "I'd love to see them").
  const hasVisualNoun = /\b(image|picture|photo|drawing|drawings|sketch|sketches|painting|paintings|illustration|illustrations|artwork|selfie|portrait)\b/.test(
    t
  );
  const hasVisualRequestPhrase =
    /\b(?:show|share|send)\s+me\b/.test(t) ||
    /\b(?:can|could|may)\s+i\s+see\b/.test(t) ||
    /\bi(?:'d| would)?\s+love\s+to\s+see\b/.test(t) ||
    /\bi\s+want\s+to\s+see\b/.test(t) ||
    /\bsee\s+(?:it|that|them|this)\b/.test(t) ||
    /\bsee\s+some\b/.test(t);
  if (hasVisualNoun && hasVisualRequestPhrase) return true;

  const latestAssistant = latestAssistantContentForImageIntent(recentMessages);
  const visualPeekRequest = userMessageLooksLikeVisualPeekRequest(t);
  if (visualPeekRequest) {
    const userSceneCue = textContainsSceneReferenceCue(t);
    const assistantSceneCue = latestAssistant
      ? textContainsSceneReferenceCue(latestAssistant)
      : false;
    if (userSceneCue || assistantSceneCue) return true;
  }

  if (!latestAssistant) return false;
  const assistantOfferedVisual =
    /\b(?:would\s+you\s+(?:like|care)\s+to\s+see|want\s+to\s+see|can\s+i\s+show\s+you|i\s+can\s+show\s+you|i\s+can\s+share|shall\s+i\s+show\s+you)\b/.test(
      latestAssistant
    ) &&
    /\b(image|picture|photo|drawing|drawings|sketch|sketches|painting|paintings|illustration|illustrations|artwork)\b/.test(
      latestAssistant
    );
  const userAffirmed =
    /^(?:yes|yeah|yep|sure|absolutely|please|of course)\b/.test(t) ||
    /\bi(?:'d| would)\s+love\s+to\b/.test(t) ||
    /\bthat sounds (?:great|good|lovely|nice)\b/.test(t);
  return assistantOfferedVisual && userAffirmed;
}

const AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS = 1200;

/**
 * If the assistant forgot to emit `sendGeneratedImage` for an obvious image
 * request, synthesize a safe fallback prompt from the user's own words so the
 * image job still gets submitted.
 */
export function autoBackfillSendGeneratedImagePrompt(args: {
  isStarterPrompt: boolean;
  userMessage: string;
  parsedToolPrompt?: string | null;
  recentMessages?: readonly Pick<ChatMessage, "role" | "content">[];
}): string | undefined {
  const explicit = args.parsedToolPrompt?.trim();
  if (explicit && explicit.length > 0) return explicit;
  if (args.isStarterPrompt) return undefined;
  if (!userMessageSuggestsInChatImageRequest(args.userMessage, args.recentMessages ?? [])) {
    return undefined;
  }
  const normalized = args.userMessage.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS - 3).trimEnd()}...`;
}

const PRE_IMAGE_LEAD_FALLBACK = "Got it - I will share it in a sec.";
const PRE_IMAGE_LEAD_MAX_CHARS = 110;

/**
 * Keep the "message before the generated image" concise and readable.
 * We keep only the first sentence-like thought and trim it to a short cap.
 */
export function compactPreImageLeadMessage(raw: string): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return PRE_IMAGE_LEAD_FALLBACK;
  const firstSentence =
    normalized
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? normalized;
  if (firstSentence.length <= PRE_IMAGE_LEAD_MAX_CHARS) return firstSentence;
  return `${firstSentence.slice(0, PRE_IMAGE_LEAD_MAX_CHARS - 3).trimEnd()}...`;
}

export function resolvePrimaryChatProviderForPossibleImageToolTurn(args: {
  isStarterPrompt: boolean;
  rawUserMessage: string;
  baseProvider: LlmProvider;
  botOverrides: GenerateOptions | undefined;
  secondaryOllamaHost?: string | null;
  prismImageToolLlmModel?: string | null;
  recentMessages?: readonly Pick<ChatMessage, "role" | "content">[];
}): { provider: LlmProvider; botOverrides: GenerateOptions | undefined } {
  const imageModel =
    typeof args.prismImageToolLlmModel === "string"
      ? args.prismImageToolLlmModel.trim()
      : "";
  if (
    !args.isStarterPrompt &&
    imageModel.length > 0 &&
    userMessageSuggestsInChatImageRequest(args.rawUserMessage, args.recentMessages ?? [])
  ) {
    return {
      provider: new LocalOllamaProvider({
        secondaryOllamaHost: args.secondaryOllamaHost,
      }),
      botOverrides: {
        ...args.botOverrides,
        model: imageModel,
      },
    };
  }
  return {
    provider: args.baseProvider,
    botOverrides: args.botOverrides,
  };
}

async function generateWithLenientLocalFallback(args: {
  provider: LlmProvider;
  promptMessages: ProviderMessage[];
  botOverrides: GenerateOptions | undefined;
  secondaryOllamaHost?: string | null;
  lenientLocalFallbackModel?: string | null;
  denialBoundaryProvider?: LlmProvider;
  denialBoundaryModel?: string;
  botSystemPrompt?: string;
  userMessage?: string;
}): Promise<{
  assistantReplyRaw: string;
  providerNameUsed: ProviderName;
  modelUsed: string;
  fallbackInvocation?: {
    trigger:
      | "copyright_refusal_text"
      | "copyright_refusal_error"
      | "generic_refusal_text"
      | "generic_refusal_error"
      | "generic_refusal_soft_error";
    primaryProvider: ProviderName;
    primaryModel: string;
    fallbackModel: string;
  };
}> {
  const requestedModel = normalizeModelValue(args.botOverrides?.model);
  const primaryModel =
    requestedModel ??
    describeRequestedModel(args.provider, args.botOverrides);
  const fallbackModel = normalizeModelValue(args.lenientLocalFallbackModel);
  const canAttemptFallback =
    fallbackModel !== null &&
    !(args.provider.name === "local" && requestedModel === fallbackModel);

  const runOrganicBoundary = () =>
    generateOrganicTextBoundaryReply({
      boundaryProvider: args.denialBoundaryProvider,
      boundaryModel: args.denialBoundaryModel,
      botSystemPrompt: args.botSystemPrompt,
      userMessage: args.userMessage,
    });

  const runLenientFallback = async (
    trigger:
      | "copyright_refusal_text"
      | "copyright_refusal_error"
      | "generic_refusal_text"
      | "generic_refusal_error"
      | "generic_refusal_soft_error"
  ): Promise<{
    assistantReplyRaw: string;
    providerNameUsed: ProviderName;
    modelUsed: string;
    fallbackInvocation?: {
      trigger:
        | "copyright_refusal_text"
        | "copyright_refusal_error"
        | "generic_refusal_text"
        | "generic_refusal_error"
        | "generic_refusal_soft_error";
      primaryProvider: ProviderName;
      primaryModel: string;
      fallbackModel: string;
    };
  }> => {
    if (!fallbackModel) {
      throw new Error("Lenient local fallback model is not configured.");
    }
    const fallbackProvider = new LocalOllamaProvider({
      secondaryOllamaHost: args.secondaryOllamaHost,
    });
    let reply = "";
    try {
      reply = await fallbackProvider.generateResponse(args.promptMessages, {
        ...args.botOverrides,
        model: fallbackModel,
      });
    } catch (error) {
      if (
        isCopyrightRefusalError(error) ||
        isGenericRefusalError(error) ||
        isLikelyDenialErrorNeedingFallback(error)
      ) {
        return runOrganicBoundary();
      }
      throw error;
    }
    if (shouldSuppressAssistantReply(reply)) {
      return runOrganicBoundary();
    }
    return {
      assistantReplyRaw: reply,
      providerNameUsed: "local",
      modelUsed: fallbackModel,
      fallbackInvocation: {
        trigger,
        primaryProvider: args.provider.name,
        primaryModel,
        fallbackModel,
      },
    };
  };

  try {
    const assistantReplyRaw = await args.provider.generateResponse(
      args.promptMessages,
      args.botOverrides
    );
    if (shouldSuppressAssistantReply(assistantReplyRaw)) {
      const trigger = isCopyrightRefusalText(assistantReplyRaw)
        ? "copyright_refusal_text"
        : "generic_refusal_text";
      if (canAttemptFallback) return runLenientFallback(trigger);
      return runOrganicBoundary();
    }
    return {
      assistantReplyRaw,
      providerNameUsed: args.provider.name,
      modelUsed: primaryModel,
    };
  } catch (error) {
    const isDenialError =
      isCopyrightRefusalError(error) ||
      isGenericRefusalError(error) ||
      isLikelyDenialErrorNeedingFallback(error);
    if (isDenialError) {
      if (canAttemptFallback) {
        if (isCopyrightRefusalError(error)) return runLenientFallback("copyright_refusal_error");
        if (isGenericRefusalError(error)) return runLenientFallback("generic_refusal_error");
        return runLenientFallback("generic_refusal_soft_error");
      }
      return runOrganicBoundary();
    }
    throw error;
  }
}

function evaluateAssistantMood(args: {
  assistantContent: string;
  toneDelta?: number;
  sessionOpinion?: SessionOpinion | null;
  botOpinion?: BotOpinion | null;
  repairSignal?: boolean;
}): MoodEvaluation {
  const { warmHits, strainHits } = evaluateAssistantLanguageSignal(args.assistantContent);
  const sessionScore = args.sessionOpinion?.score ?? OPINION_SCORE_BASELINE;
  const botScore = args.botOpinion?.score ?? OPINION_SCORE_BASELINE;
  const toneDelta = args.toneDelta ?? 0;
  const repairBoost = args.repairSignal ? 6 : 0;
  const trendBias =
    args.sessionOpinion?.trend === "up"
      ? 3
      : args.sessionOpinion?.trend === "down"
        ? -4
        : 0;
  const weightedScore = Math.round(
    OPINION_SCORE_BASELINE +
      toneDelta * 5 +
      (sessionScore - OPINION_SCORE_BASELINE) * 0.14 +
      (botScore - OPINION_SCORE_BASELINE) * 0.18 +
      warmHits * 4.8 -
      strainHits * 5.4 +
      trendBias +
      repairBoost
  );
  let score = clampOpinionScore(weightedScore);
  // Prioritize immediate turn tone so hard negatives and clear repairs visibly diverge.
  if (toneDelta >= 5 || args.repairSignal) {
    score = Math.max(score, 60);
  } else if (toneDelta <= -6) {
    score = Math.min(score, 34);
  }
  const confidence = clampUnit(
    0.32 +
      Math.abs(score - OPINION_SCORE_BASELINE) / OPINION_SCORE_MAX +
      Math.min(0.18, Math.abs(toneDelta) * 0.02) +
      Math.min(0.2, (warmHits + strainHits) * 0.04)
  );
  return {
    key: scoreToMoodKey(score),
    confidence: Number(confidence.toFixed(2)),
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

  let prismAuxiliaryModel: string | null | undefined;
  try {
    prismAuxiliaryModel = (
      db.prepare("SELECT prism_default_llm_model AS m FROM users WHERE id = ?").get(userId) as
        | { m: string | null }
        | undefined
    )?.m;
  } catch {
    // Test/minimal DB fixtures may omit the users table; fall back to server defaults.
    prismAuxiliaryModel = undefined;
  }
  const title = await inferRefreshedConversationTitle(
    getAuxiliaryProvider(prismAuxiliaryModel ?? null),
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
  preferredProvider: ProviderName;
  autoMemory: boolean;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  /** User-provided name from Settings for bot-side personal addressing. */
  userDisplayName?: string;
  /**
   * When true, the model produces the opening assistant turn without
   * persisting a synthetic user message. Used by empty-composer Enter.
   */
  starterPrompt?: boolean;
  /**
   * When true, starter prompts may still include the "first conversation"
   * intro behavior if no protected about-you memory exists yet.
   */
  starterPromptWarrantsIntro?: boolean;
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
   * Chat Companion 2.0 ignores this knob to enforce a single companion persona.
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
  /** Global developer rule layer applied across all bots when enabled. */
  devMemoriesEnabled?: boolean;
  /** Freeform rule text for the developer memory layer. */
  devMemoriesText?: string;
  /** Optional user-saved second Ollama host for host-aware local model choices. */
  secondaryOllamaHost?: string | null;
  /** Optional local-only fallback model used when copyright refusals happen. */
  lenientLocalFallbackModel?: string | null;
  /**
   * Per-account override for Prism internal local LLM calls (titles, summaries,
   * memory inference, Coffee router, image prompt hints). Empty uses the
   * server's OLLAMA_AUXILIARY_MODEL.
   */
  prismDefaultLlmModel?: string | null;
  /**
   * Optional local Ollama chat model for turns where the user's message looks like
   * an in-thread image request (`sendGeneratedImage`). Empty uses the normal hub model.
   * Does not change the separate image render pipeline (Comfy / Ollama image / OpenAI images).
   */
  prismImageToolLlmModel?: string | null;
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
  /**
   * Saved image defaults (local + OpenAI + Comfy/Ollama routing) for
   * assistant-initiated `sendGeneratedImage` turns. Optional so tests and
   * older callers keep working.
   */
  assistantImageUserPrefs?: AssistantSentImageUserPrefs;
  sessionEnding?: boolean;
  /** When true, skip automatic latest-chat reuse and force a new conversation row. */
  forceNewConversation?: boolean;
}

/** How long (ms) to wait on cross-thread memory retrieval before skipping hints. */
const MEMORY_RETRIEVAL_TIMEOUT_MS = 1500;

/** Appended to assistant prose when `sendGeneratedImage` parsed but image pipeline returned nothing. */
const ASSISTANT_IMAGE_GEN_UNAVAILABLE_NOTE =
  "I could not generate that image this time. Try again in a moment, or switch image models in Settings -> Defaults & fallbacks.";

/** When another thread (or panel) already holds the single image slot. */
const ASSISTANT_IMAGE_SLOT_BUSY_NOTE =
  "I am still finishing another image right now. Ask again in a moment and I will jump on it.";

const CHAT_IMAGE_TOOL_VARIANT_TAGS = {
  portrait: [
    "selfie",
    "portrait",
    "headshot",
    "close-up",
    "closeup",
    "vertical",
    "9:16",
    "phone wallpaper",
    "profile photo",
  ],
  letterbox: ["square", "1:1", "avatar", "icon", "logo", "sticker", "profile pic"],
  landscape: [
    "landscape",
    "widescreen",
    "wide-screen",
    "panorama",
    "panoramic",
    "cinematic",
    "16:9",
    "21:9",
    "banner",
  ],
} as const;

function scoreChatImageToolTags(text: string, tags: readonly string[]): number {
  let score = 0;
  for (const tag of tags) {
    if (text.includes(tag)) score += 1;
  }
  return score;
}

function inferChatToolRequestedImageSize(textRaw: string): string {
  const text = textRaw.toLowerCase();
  const portrait = scoreChatImageToolTags(text, CHAT_IMAGE_TOOL_VARIANT_TAGS.portrait);
  const letterbox = scoreChatImageToolTags(text, CHAT_IMAGE_TOOL_VARIANT_TAGS.letterbox);
  const landscape = scoreChatImageToolTags(text, CHAT_IMAGE_TOOL_VARIANT_TAGS.landscape);
  if (portrait === 0 && letterbox === 0 && landscape === 0) {
    return "1024x1024";
  }
  if (portrait >= landscape && portrait >= letterbox) {
    return "1024x1536";
  }
  if (landscape >= portrait && landscape >= letterbox) {
    return "1536x1024";
  }
  return "1024x1024";
}

/** Max chars persisted in `ChatToolCallEvent.prompt` / `detail` so devtools never carry runaway blobs. */
const TOOL_CALL_DIAG_PREVIEW_CAP = 200;

function truncateToolCallPreview(text: string, max = TOOL_CALL_DIAG_PREVIEW_CAP): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

/**
 * Patterns that strongly suggest the model attempted a Prism tool call even if the parser
 * extracted nothing. We require either the formal sentinel/HF-style tokens OR a
 * JSON-key-shaped occurrence of the tool name (e.g. `"sendGeneratedImage":` or
 * `"name":"AskQuestion"`). Bare prose mentions like
 * "I will use sendGeneratedImage next turn" or "let me ask a question" must NOT
 * trip this heuristic — those are false positives that would spam the dev surface.
 */
const TOOL_CALL_RAW_HINT_PATTERNS: ReadonlyArray<RegExp> = [
  /"\s*sendGeneratedImage\s*"\s*:/i,
  /"\s*askQuestion\s*"\s*:/i,
  /"\s*name\s*"\s*:\s*"\s*AskQuestion\s*"/i,
  /<\|\s*send\s*_?\s*generated\s*_?\s*image\s*\|>/i,
  /<<<\s*PRISM\s*_?\s*TOOL\s*>>>/i,
];

const SEND_GENERATED_IMAGE_NAME_HINTS: ReadonlyArray<RegExp> = [
  /"\s*sendGeneratedImage\s*"\s*:/i,
  /<\|\s*send\s*_?\s*generated\s*_?\s*image\s*\|>/i,
];

const ASK_QUESTION_NAME_HINTS: ReadonlyArray<RegExp> = [
  /"\s*askQuestion\s*"\s*:/i,
  /"\s*name\s*"\s*:\s*"\s*AskQuestion\s*"/i,
];

function inferDroppedToolNameFromRaw(raw: string): ChatToolCallEventName {
  if (SEND_GENERATED_IMAGE_NAME_HINTS.some((rx) => rx.test(raw))) {
    return "sendGeneratedImage";
  }
  if (ASK_QUESTION_NAME_HINTS.some((rx) => rx.test(raw))) {
    return "askQuestion";
  }
  return "unknown";
}

/** Smallest snippet starting at the first `{` that includes any of the tool keywords. */
function extractDroppedToolSnippet(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const source = firstBrace >= 0 ? raw.slice(firstBrace) : raw;
  return truncateToolCallPreview(source);
}

interface BuildAssistantToolCallEventsArgs {
  rawReply: string;
  parsedSendGeneratedImage?: { prompt: string };
  parsedAskQuestion?: AskQuestionPayload;
  /**
   * What happened on the image-slot acquisition path for this turn:
   *  - "acquired" → we scheduled a background job (use `imageJobId`)
   *  - "busy" → pipeline busy, assistant got the busy note
   *  - "none" → no `sendGeneratedImage` envelope was parsed
   */
  imageSlot: "acquired" | "busy" | "none";
  imageJobId?: string;
}

/**
 * Build the per-turn tool-call diagnostic events for the dev metrics stream.
 *
 * Visible for unit tests. Pure function: never throws, never mutates inputs.
 */
export function buildAssistantToolCallEvents(
  args: BuildAssistantToolCallEventsArgs
): ChatToolCallEvent[] {
  const events: ChatToolCallEvent[] = [];

  if (args.parsedAskQuestion) {
    events.push({
      name: "askQuestion",
      status: "detected",
      prompt: truncateToolCallPreview(args.parsedAskQuestion.prompt),
      detail: `${args.parsedAskQuestion.options.length} option(s)`,
    });
  }

  if (args.parsedSendGeneratedImage) {
    const promptPreview = truncateToolCallPreview(args.parsedSendGeneratedImage.prompt);
    events.push({
      name: "sendGeneratedImage",
      status: "detected",
      prompt: promptPreview,
    });
    if (args.imageSlot === "acquired") {
      events.push({
        name: "sendGeneratedImage",
        status: "acquired",
        prompt: promptPreview,
        ...(args.imageJobId ? { jobId: args.imageJobId } : {}),
      });
    } else if (args.imageSlot === "busy") {
      events.push({
        name: "sendGeneratedImage",
        status: "busy",
        prompt: promptPreview,
        detail: "image pipeline busy",
      });
    }
  } else if (
    typeof args.rawReply === "string" &&
    args.rawReply.length > 0 &&
    TOOL_CALL_RAW_HINT_PATTERNS.some((rx) => rx.test(args.rawReply))
  ) {
    events.push({
      name: inferDroppedToolNameFromRaw(args.rawReply),
      status: "dropped",
      detail: `raw reply mentions tool but parser produced no envelope: ${extractDroppedToolSnippet(args.rawReply)}`,
    });
  }

  return events;
}

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
  "- Preferred format (copy these exact tokens on their own lines, then JSON between them):",
  `  ${PRISM_TOOL_START}`,
  `  {"v":1,"sendGeneratedImage":{"prompt":"…"}}   (or AskQuestion JSON as in the example above)`,
  `  ${PRISM_TOOL_END}`,
  "- Do NOT wrap that Prism block in Markdown code fences (` ```json ` … ` ``` `): that leaves empty code boxes in chat.",
  "- Do NOT paste the tool JSON alone on its own line; use the Prism block (or a single fenced code block). Bare JSON shows up as junk text in chat.",
  "- Prefer the three-angle-bracket tokens above. Single-angle XML-style `<PRISM_TOOL>` … `</PRISM_TOOL>` is also accepted, but triple brackets are the reliable default.",
  "- AskQuestion represents one question in this turn; never output a quiz or multi-question list.",
  "- Inside JSON only: emit exactly three options with ids a, b, c (distinct).",
  "- In JSON, `prompt` is ONLY the short chooser line shown above the chip row (never the main quiz question).",
  "- Labels are what the USER sends verbatim when they tap; keep each short (single clause).",
  "",
  "Optional — send a generated image for the user (saved to their library alongside manual images):",
  "- If you include sendGeneratedImage, keep the visible prose before it very short (one concise sentence).",
  "- Add a `sendGeneratedImage` object with a single `prompt` field: a concrete image-model description (scene, style, subject).",
  "- You may combine AskQuestion and sendGeneratedImage in one JSON object: {\"v\":1,\"askQuestion\":{...},\"sendGeneratedImage\":{\"prompt\":\"...\"}}.",
  "- Or image-only: {\"v\":1,\"sendGeneratedImage\":{\"prompt\":\"...\"}}.",
  "- After you write your visible prose, Prism shows the picture as a separate follow-up bubble (so the user reads your message first, then sees the image).",
  "- Use sparingly when a picture truly helps; never use for every turn.",
  "",
  "When a separate system message says the image pipeline is busy or an image is still generating, follow those rules exactly: do NOT output sendGeneratedImage until the message says you may.",
  "",
  "Alternate (supported but less preferred): after your prose you may use a Hugging Face / LM Studio style `<|sendGeneratedImage|>` token immediately followed by the same JSON object (full envelope or flat `{\"prompt\":\"...\"}`). Prefer the triple-bracket Prism block when possible.",
].join("\n");

/** Injected only when the turn text references `prism-bot://` links (Teams-style @ mentions). */
const PRISM_BOT_MENTION_SYNTAX_HINT =
  "The user may @-mention a specific Prism bot with markdown like [DisplayName](prism-bot://botId). " +
  "botId may be URL-encoded (%…). Treat DisplayName as the label they used for that bot. " +
  "Separate memory hints may be pulled from each mentioned bot's stored facts when retrieval finds any.";

/** Visible to tests — parses `prism-bot://…` hrefs from markdown (composer @-mentions round-trip as this). */
export function extractPrismBotMentionIdsFromMessage(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /prism-bot:\/\/([^)\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    let id = (m[1] ?? "").trim();
    if (!id) continue;
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep encoded token */
    }
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

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

function buildAskQuestionFallback(displayContent: string): AskQuestionPayload | undefined {
  return extractDynamicAskQuestion(displayContent);
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

function buildStarterPromptInstruction(forceIntroduction: boolean = false): string {
  const instructions = [
    "Deliver a SHORT opening message (a few sentences at most) that sounds unmistakably in-character.",
    "Functionally simple: invite the human in with ONE clear conversational hook—not a roadmap, briefing, or list of topics.",
    "Ask exactly ONE direct question to the user, and end that question with a question mark.",
    "If memory hints are available, weave ONE specific remembered detail into the question naturally.",
    "Vary the wording so the opener feels fresh, not canned.",
    "Stay anchored in your persona; avoid generic-chatbot vibes.",
    "Reply as plain prose only—do not wrap the opening in quotation marks.",
    "Do not mention system prompts, hidden instructions, or that this turn was auto-started.",
  ];
  if (forceIntroduction) {
    instructions.splice(
      1,
      0,
      "Begin with a brief self-introduction in your first sentence before asking your one direct question."
    );
  }
  return instructions.join(" ");
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
  memoryLines: string[],
  preserveOpening: boolean = false
): string {
  const normalized = normalizeStarterOpeningDisplay(displayContent).trim();
  const pickedMemory = memoryLines[0]?.trim() ?? "";
  if (pickedMemory) {
    const memoryAnchor = toSecondPersonMemoryAnchor(pickedMemory);
    if (!openingMentionsMemory(normalized, memoryAnchor)) {
      if (preserveOpening) {
        const base = normalized.replace(/[.!?]+$/, "").trim();
        const leadIn = base.length > 0 ? `${base}. ` : "";
        return `${leadIn}Given that ${memoryAnchor}, what feels most important to explore right now?`;
      }
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
      ...(assembled.moodKey ? { moodKey: assembled.moodKey } : {}),
      ...(assembled.moodConfidence !== undefined
        ? { moodConfidence: assembled.moodConfidence }
        : {}),
      ...(assembled.askQuestion ? { askQuestion: assembled.askQuestion } : {}),
      ...(assembled.sentGeneratedImage
        ? { sentGeneratedImage: assembled.sentGeneratedImage }
        : {}),
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

function buildBotOpinion(
  score: number,
  trend: OpinionTrend,
  lastReason: string,
  recentReasons: string[],
  repairCount: number,
  updatedAt: string
): BotOpinion {
  const clampedScore = Math.round(clampOpinionScore(score));
  return {
    score: clampedScore,
    band: botOpinionBandFromScore(clampedScore),
    boundaryLevel: botOpinionBoundaryFromScore(clampedScore),
    trend,
    lastReason,
    recentReasons,
    repairCount,
    updatedAt,
  };
}

function botOpinionFromRow(row: BotOpinionRow): BotOpinion {
  const score = Math.round(clampOpinionScore(row.score));
  const trend: OpinionTrend =
    row.trend === "up" || row.trend === "down" || row.trend === "steady"
      ? row.trend
      : "steady";
  return {
    score,
    band: normalizeBotOpinionBand(row.band) || botOpinionBandFromScore(score),
    boundaryLevel: normalizeBotOpinionBoundary(row.boundary_level),
    trend,
    lastReason: row.last_reason || "No long-term relationship shift yet.",
    recentReasons: parseRecentOpinionReasons(row.recent_reasons),
    repairCount: Math.max(0, Math.round(row.repair_count ?? 0)),
    updatedAt: row.updated_at,
  };
}

export function readBotOpinion(
  db: DatabaseSync,
  userId: string,
  botId: string | null | undefined
): BotOpinion | null {
  const row = db
    .prepare(
      `SELECT score, band, boundary_level, trend, last_reason, recent_reasons, repair_count, updated_at
       FROM bot_opinions
       WHERE user_id = ? AND bot_scope_key = ?`
    )
    .get(userId, opinionScopeKey(botId)) as BotOpinionRow | undefined;
  return row ? botOpinionFromRow(row) : null;
}

export function upsertBotOpinion(args: {
  db: DatabaseSync;
  userId: string;
  botId: string | null | undefined;
  score: number;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  repairCount: number;
  updatedAt: string;
}): BotOpinion {
  const { db, userId, botId, score, trend, lastReason, recentReasons, repairCount, updatedAt } = args;
  const opinion = buildBotOpinion(score, trend, lastReason, recentReasons, repairCount, updatedAt);
  db.prepare(
    `INSERT INTO bot_opinions (
      user_id, bot_scope_key, bot_id, score, band, boundary_level, trend, last_reason, recent_reasons, repair_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, bot_scope_key) DO UPDATE SET
      bot_id = excluded.bot_id,
      score = excluded.score,
      band = excluded.band,
      boundary_level = excluded.boundary_level,
      trend = excluded.trend,
      last_reason = excluded.last_reason,
      recent_reasons = excluded.recent_reasons,
      repair_count = excluded.repair_count,
      updated_at = excluded.updated_at`
  ).run(
    userId,
    opinionScopeKey(botId),
    botId ?? null,
    opinion.score,
    opinion.band,
    opinion.boundaryLevel,
    opinion.trend,
    opinion.lastReason,
    JSON.stringify(opinion.recentReasons.slice(0, OPINION_REASON_LIMIT)),
    opinion.repairCount,
    opinion.updatedAt
  );
  return opinion;
}

function upsertBotOpinionFromTurn(args: {
  db: DatabaseSync;
  userId: string;
  botId: string | null | undefined;
  message: string;
  updatedAt: string;
}): BotOpinion {
  const { db, userId, botId, message, updatedAt } = args;
  const existing = readBotOpinion(db, userId, botId);
  const evaluation = evaluateBotOpinionTurn(message, existing);
  const previousScore = existing?.score ?? OPINION_SCORE_BASELINE;
  const score = clampOpinionScore(previousScore + evaluation.delta);
  const reasons = [
    evaluation.reason,
    ...(existing?.recentReasons ?? []),
  ].slice(0, OPINION_REASON_LIMIT);
  return upsertBotOpinion({
    db,
    userId,
    botId,
    score,
    trend: evaluation.trend,
    lastReason: evaluation.reason,
    recentReasons: reasons,
    repairCount: (existing?.repairCount ?? 0) + (evaluation.repair ? 1 : 0),
    updatedAt,
  });
}

function botOpinionPromptContext(opinion: BotOpinion | null): string | null {
  if (!opinion || opinion.boundaryLevel === "none") return null;
  if (opinion.boundaryLevel === "firm") {
    return [
      "Long-term relationship context for this bot:",
      `- State: ${opinion.band}; score ${opinion.score}/100.`,
      "- The bot may set a calm, firm boundary if the user is harsh or dismissive.",
      "- The bot should still help and should explicitly allow repair when the user softens or apologizes.",
      "- Do not shame the user, diagnose them, or refuse access.",
    ].join("\n");
  }
  return [
    "Long-term relationship context for this bot:",
    `- State: ${opinion.band}; score ${opinion.score}/100.`,
    "- The bot may gently ask for clearer or warmer wording if the exchange becomes harsh.",
    "- Keep helping; treat repair attempts as meaningful.",
  ].join("\n");
}

function isLongTermMemory(memory: {
  tier?: MemoryTier;
  confidence: number;
  certainty?: number;
  durability?: number;
  source?: "direct" | "inferred" | "compiled" | "about_you";
}): boolean {
  return memory.tier === "long_term" ||
    memoryQualifiesLongTerm(memory.confidence, memory.certainty, memory.durability, memory.source);
}

function messageAllowsLongTermDemotion(message: string): boolean {
  return /\b(?:actually|correction|scratch that|changed my mind|not true|not right|wrong|i was joking|just joking|i was kidding|just kidding|that thing i told you earlier)\b/i.test(message);
}

function longTermMemoryClarificationPrompt(memoryText: string): string {
  return [
    "Long-term memory protection:",
    `The user asked to forget this protected long-term memory: "${memoryText}".`,
    "Do not treat it as deleted yet. Reply in a gently confused way, starting from the idea that you thought they had said this.",
    "Ask whether they still want you to weaken this memory back into short-term uncertainty.",
    "Append one Prism AskQuestion tool block with exactly three options: confirm weakening, explain the contradiction, or keep the memory.",
  ].join("\n");
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

function buildImageSlotSystemHint(
  userId: string,
  activeConversationId: string | null | undefined
): string | null {
  const job = peekActiveImageJobForUser(userId);
  if (!job) return null;
  const cur = activeConversationId?.trim() || null;
  const jobC = job.conversationId?.trim() || null;
  const sameThread = cur !== null && jobC !== null && cur === jobC;
  if (sameThread) {
    return (
      `Prism image pipeline (system): You already started an in-thread image for this conversation; it is still generating (started ${job.startedAt}). ` +
      `If the user asks how it is going, answer naturally (still processing). Do NOT output another sendGeneratedImage until that run finishes.`
    );
  }
  return (
    `Prism image pipeline (system): Another image is already generating for this account (started ${job.startedAt}` +
    (jobC ? ", different conversation" : "") +
    `). You MUST NOT output sendGeneratedImage on this turn. Stay in character: politely say you cannot draw a new picture right now; they can try again after that run finishes. You may chat about unrelated topics.`
  );
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
  userDisplayName?: string;
  suppressDisplayNameHint?: boolean;
  devMemoriesEnabled?: boolean;
  devMemoriesText?: string;
  botOpinion?: BotOpinion | null;
  threadSummary?: string | null;
  memoryLines: string[];
  memoryClarification?: string | null;
  chatHistory: ChatMessage[];
  userMessage: string;
  askQuestionMode: "off" | "explicit" | "continuation";
  /** Prism single-slot image job hint (busy / in-flight status). */
  imageSlotSystemHint?: string | null;
}): ProviderMessage[] {
  const promptMessages: ProviderMessage[] = [];
  const trimmedBot = args.botSystemPrompt?.trim();
  const trimmedDisplayName = args.userDisplayName?.trim() ?? "";
  const relationshipContext = botOpinionPromptContext(args.botOpinion ?? null);
  const toolsBlock =
    trimmedBot &&
    trimmedBot.length > 0
      ? `${trimmedBot}\n\n${PRISM_ASSISTANT_TOOLS_APPENDIX}`
      : PRISM_ASSISTANT_TOOLS_APPENDIX;
  promptMessages.push({ role: "system", content: toolsBlock });
  if (
    trimmedDisplayName.length > 0 &&
    !args.suppressDisplayNameHint
  ) {
    promptMessages.push({
      role: "system",
      content: `The user's preferred name is "${trimmedDisplayName}". Use it naturally when it helps, but do not overuse it.`,
    });
  }
  if (args.devMemoriesEnabled) {
    const devMemoriesText = args.devMemoriesText?.trim() ?? "";
    if (devMemoriesText.length > 0) {
      promptMessages.push({
        role: "system",
        content: [
          "Developer memory layer (global hard-rule simulation):",
          "Treat these as active rules for this turn across every bot persona, including Prism/default.",
          devMemoriesText,
        ].join("\n"),
      });
    }
  }
  if (relationshipContext) {
    promptMessages.push({ role: "system", content: relationshipContext });
  }
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
  if (args.memoryClarification && args.memoryClarification.trim().length > 0) {
    promptMessages.push({
      role: "system",
      content: args.memoryClarification.trim(),
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
  const hint = args.imageSlotSystemHint?.trim();
  if (hint && hint.length > 0) {
    promptMessages.push({ role: "system", content: hint });
  }
  const transcriptMentionsPrismBot =
    args.userMessage.includes("prism-bot://") ||
    args.chatHistory.some((item) => item.content.includes("prism-bot://"));
  if (transcriptMentionsPrismBot) {
    promptMessages.push({ role: "system", content: PRISM_BOT_MENTION_SYNTAX_HINT });
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
 * Milestones: every 10 messages early, then every 12 for longer threads.
 */
function shouldSummarizeAtMilestone(totalMessages: number): boolean {
  if (totalMessages < 10) {
    return false;
  }
  if (totalMessages <= 60) {
    return totalMessages % 10 === 0;
  }
  return totalMessages % 12 === 0;
}

type ModeRuntimePlan = {
  skipPersonalFacts: boolean;
  skipSummarization: boolean;
  retrievalMode: "none" | "cross_thread" | "thread_only";
};

function buildModeRuntimePlan(mode: ChatMode, incognitoForTurn: boolean): ModeRuntimePlan {
  return {
    skipPersonalFacts: incognitoForTurn,
    skipSummarization: incognitoForTurn,
    retrievalMode: incognitoForTurn
      ? "none"
      : mode === "sandbox"
        ? "thread_only"
        : "cross_thread",
  };
}

async function handleCompanionChatTurn(args: {
  db: DatabaseSync;
  provider: LlmProvider;
  userId: string;
  activeConversationId: string;
  message: string;
  userKey: Buffer;
  activeMemoryBotId: string | null;
  isStarterPrompt: boolean;
  retrievalMode: ModeRuntimePlan["retrievalMode"];
}): Promise<{ threadSummary: string | null; memoryLines: string[] }> {
  const {
    db,
    provider,
    userId,
    activeConversationId,
    message,
    userKey,
    activeMemoryBotId,
    isStarterPrompt,
    retrievalMode,
  } = args;
  let memoryLines: string[] = [];
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
      true
    );
    const mentionedBotIds = extractPrismBotMentionIdsFromMessage(message);
    const seenLine = new Set(
      memoryLines.map((line) => line.trim().toLowerCase()).filter(Boolean)
    );
    for (const mentionId of mentionedBotIds) {
      if (mentionId === activeMemoryBotId) continue;
      try {
        const scoped = await retrieveRelevantMemories(
          db,
          userId,
          message,
          userKey,
          mentionId,
          4
        );
        for (const mem of scoped) {
          const t = mem.text.trim();
          if (!t) continue;
          const k = t.toLowerCase();
          if (seenLine.has(k)) continue;
          seenLine.add(k);
          memoryLines.push(mem.text);
        }
      } catch {
        /* best-effort augmentation */
      }
    }
  }
  const threadSummary =
    retrievalMode === "cross_thread"
      ? getLatestThreadSummary(db, userId, activeConversationId, "chat")
      : null;
  return { threadSummary, memoryLines };
}

async function handleSandboxTurn(args: {
  db: DatabaseSync;
  userId: string;
  activeConversationId: string;
  isStarterPrompt: boolean;
  retrievalMode: ModeRuntimePlan["retrievalMode"];
}): Promise<{ threadSummary: string | null; memoryLines: string[] }> {
  const { db, userId, activeConversationId, isStarterPrompt, retrievalMode } = args;
  const threadSummary =
    retrievalMode === "thread_only"
      ? getLatestThreadSummary(db, userId, activeConversationId, "sandbox")
      : null;
  if (isStarterPrompt) {
    return { threadSummary, memoryLines: [] };
  }
  return { threadSummary, memoryLines: [] };
}

async function ensureAboutYouMemory(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  conversationId: string;
  botId: string | null;
  sourceMessageId: string | null;
  userDisplayName?: string;
}): Promise<Awaited<ReturnType<typeof restoreMemory>> | null> {
  const {
    db,
    userId,
    userKey,
    conversationId,
    botId,
    sourceMessageId,
    userDisplayName,
  } = args;
  if (!botId) return null;
  if (hasAboutYouMemoryForBot(db, userId, botId)) return null;
  const aboutYouText = buildInitialAboutYouMemoryText(userDisplayName);
  return restoreMemory(db, userId, userKey, {
    conversationId,
    botId,
    text: aboutYouText,
    confidence: 0.96,
    certainty: 0.96,
    category: "user",
    tier: "long_term",
    durability: 1,
    source: "about_you",
    sourceMessageIds: sourceMessageId ? [sourceMessageId] : [],
  });
}

export async function processChatMessage(
  db: DatabaseSync,
  userId: string,
  message: string,
  userKey: Buffer,
  settings: UserChatSettings,
  conversationId?: string
): Promise<ProcessChatMessageResult> {
  const backendStartedAtMs = Date.now();
  const backendEvents: ChatBackendDebugEvent[] = [];
  const pushBackendEvent = (
    kind: ChatBackendDebugEventKind,
    messageText: string,
    detail?: string
  ): void => {
    backendEvents.push({
      kind,
      message: messageText,
      ...(detail ? { detail } : {}),
      elapsedMs: Date.now() - backendStartedAtMs,
    });
  };
  const now = new Date().toISOString();
  const mode: ChatMode = settings.mode ?? "sandbox";
  const isStarterPrompt = settings.starterPrompt === true;
  const explicitAskQuestionRequest =
    !isStarterPrompt && userExplicitlyRequestedAskQuestion(message);
  const promptUserMessage = isStarterPrompt
    ? buildStarterPromptInstruction(settings.starterPromptWarrantsIntro === true)
    : message;
  // Incognito is a Chat-mode concept (see shared types): keeps the thread
  // client-held and skips all memory. Provider choice remains the normal
  // local/online user setting; Sandbox ignores `incognito` entirely.
  const incognitoForTurn = mode === "chat" && settings.incognito === true;
  const effectiveProvider = settings.preferredProvider;
  const modeRuntimePlan = buildModeRuntimePlan(mode, incognitoForTurn);
  const { skipPersonalFacts, skipSummarization, retrievalMode } = modeRuntimePlan;
  pushBackendEvent(
    "route",
    "POST /api/chat accepted",
    `mode=${mode}; incognito=${incognitoForTurn ? "yes" : "no"}; conversation=${
      conversationId ?? "new"
    }; retrieval=${retrievalMode}; memory=${skipPersonalFacts ? "skipped" : "enabled"}; summaries=${
      skipSummarization ? "skipped" : "enabled"
    }`
  );
  // Bot scope comes from the request's tri-state `botId` (undefined/null/string).
  // UI surfaces can still choose to lock Chat mode by omitting that field.
  const activeBotId = settings.botId;
  const activeMemoryBotId =
    typeof activeBotId === "string" && activeBotId.trim().length > 0
      ? activeBotId.trim()
      : null;
  const provider = selectProvider(
    effectiveProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost,
    settings.anthropicApiKey
  );
  const auxiliaryProvider = getAuxiliaryProvider(settings.prismDefaultLlmModel);

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
      userDisplayName: settings.userDisplayName,
      suppressDisplayNameHint: isStarterPrompt,
      devMemoriesEnabled: settings.devMemoriesEnabled,
      devMemoriesText: settings.devMemoriesText,
      botOpinion: null,
      threadSummary: null,
      memoryLines: [],
      memoryClarification: null,
      chatHistory: history,
      userMessage: promptUserMessage,
      askQuestionMode,
      imageSlotSystemHint: buildImageSlotSystemHint(userId, conversationId ?? null),
    });
    pushBackendEvent(
      "context",
      "Prepared private chat prompt",
      `${describePromptMessages(promptMessages)}; ephemeralHistory=${history.length}; askQuestion=${askQuestionMode}`
    );

    const { provider: primaryProvider, botOverrides: primaryBotOverrides } =
      resolvePrimaryChatProviderForPossibleImageToolTurn({
        isStarterPrompt,
        rawUserMessage: message,
        baseProvider: provider,
        botOverrides: settings.botOverrides,
        secondaryOllamaHost: settings.secondaryOllamaHost,
        prismImageToolLlmModel: settings.prismImageToolLlmModel,
        recentMessages: history,
      });
    pushBackendEvent(
      "model",
      "Calling chat model",
      `provider=${primaryProvider.name}; model=${describeRequestedModel(
        primaryProvider,
        primaryBotOverrides
      )}; imageToolRoute=${primaryProvider === provider ? "normal" : "rerouted"}`
    );

    let {
      assistantReplyRaw,
      providerNameUsed,
      modelUsed,
      fallbackInvocation,
    } = await generateWithLenientLocalFallback({
      provider: primaryProvider,
      promptMessages,
      botOverrides: primaryBotOverrides,
      secondaryOllamaHost: settings.secondaryOllamaHost,
      lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
      denialBoundaryProvider: auxiliaryProvider,
      denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
      botSystemPrompt: settings.botSystemPrompt,
      userMessage: message,
    });
    pushBackendEvent(
      "model",
      "Model response received",
      `provider=${providerNameUsed}; model=${modelUsed}; rawChars=${assistantReplyRaw.length}`
    );
    if (
      shouldSuppressAssistantReply(assistantReplyRaw) &&
      !shouldBypassSuppressionForImageIntent(isStarterPrompt, message, history)
    ) {
      const boundary = await generateOrganicTextBoundaryReply({
        boundaryProvider: auxiliaryProvider,
        boundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
        botSystemPrompt: settings.botSystemPrompt,
        userMessage: message,
      });
      assistantReplyRaw = boundary.assistantReplyRaw;
      providerNameUsed = boundary.providerNameUsed;
      modelUsed = boundary.modelUsed;
    }
    const parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
    const shouldBackfillAskQuestion =
      forceAskQuestion ||
      assistantLikelyIntendedAskQuestion(parsedAssistant.displayContent);
    const askQuestionRaw =
      parsedAssistant.askQuestion ??
      (shouldBackfillAskQuestion
        ? buildAskQuestionFallback(parsedAssistant.displayContent)
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
    let assistantDisplay = isStarterPrompt
      ? enforceStarterOpeningQuestion(assistantDisplayRaw, [])
      : assistantDisplayRaw;
    const turnEvaluation = isStarterPrompt
      ? undefined
      : evaluateUserTurnOpinion(message);
    const repairSignal = isStarterPrompt
      ? false
      : hasRepairSignal(normalizeOpinionText(message));
    const assistantMood = evaluateAssistantMood({
      assistantContent: assistantDisplay,
      toneDelta: turnEvaluation?.delta,
      repairSignal,
    });
    const sendImgPromptIncRaw = parsedAssistant.sendGeneratedImage?.prompt?.trim();
    let sendImgPromptInc = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt,
      userMessage: message,
      parsedToolPrompt: sendImgPromptIncRaw,
      recentMessages: history,
    });
    const sendImgPromptIncRequested = sendImgPromptInc;
    let pendingImageJobIncognito: ProcessChatMessageResult["pendingImageJob"] | undefined;
    let incognitoImageSlot: "acquired" | "busy" | "none" = sendImgPromptInc ? "busy" : "none";
    let incognitoImageJobId: string | undefined;
    if (sendImgPromptInc) {
      const chatToolRequestedSize = inferChatToolRequestedImageSize(
        `${message}\n${sendImgPromptInc}`
      );
      const acq = await tryAcquireImageSlot({
        userId,
        conversationId: conversationId ?? null,
        botId: activeBotId ?? null,
        mode,
        incognito: true,
        captionPrompt: sendImgPromptInc,
        userMessage: message,
        source: "chat_tool",
        requestedSize: chatToolRequestedSize,
      });
      if (!acq.ok) {
        sendImgPromptInc = undefined;
        assistantDisplay =
          assistantDisplay.trim().length > 0
            ? `${assistantDisplay.trimEnd()}\n\n${ASSISTANT_IMAGE_SLOT_BUSY_NOTE}`
            : ASSISTANT_IMAGE_SLOT_BUSY_NOTE;
        incognitoImageSlot = "busy";
      } else {
        assistantDisplay = compactPreImageLeadMessage(assistantDisplay);
        startChatImageBackgroundJob({
          db,
          job: acq.job,
          preferredProvider: imagePreferredProviderForTextProvider(effectiveProvider),
          openAiApiKey: settings.openAiApiKey,
          prefs: assistantImagePrefsForTurn(settings),
          prismDefaultLlmModel: settings.prismDefaultLlmModel,
          chatModelUsed: modelUsed,
          chatProviderName: providerNameUsed,
          botName: settings.starterPromptLabel,
          botSystemPrompt: settings.botSystemPrompt,
        });
        sendImgPromptInc = undefined;
        pendingImageJobIncognito = {
          jobId: acq.job.id,
          conversationId: conversationId ?? null,
        };
        incognitoImageSlot = "acquired";
        incognitoImageJobId = acq.job.id;
      }
      pushBackendEvent(
        "tool",
        "Processed sendGeneratedImage tool request",
        `slot=${incognitoImageSlot}; job=${incognitoImageJobId ?? "none"}`
      );
    }
    const incognitoToolCallEvents = buildAssistantToolCallEvents({
      rawReply: assistantReplyRaw,
      ...((parsedAssistant.sendGeneratedImage ||
        sendImgPromptIncRaw !== sendImgPromptIncRequested) &&
      sendImgPromptIncRequested
        ? {
            parsedSendGeneratedImage: { prompt: sendImgPromptIncRequested },
          }
        : {}),
      ...(askQuestionForTurn ? { parsedAskQuestion: askQuestionForTurn } : {}),
      imageSlot: incognitoImageSlot,
      ...(incognitoImageJobId ? { imageJobId: incognitoImageJobId } : {}),
    });
    const assistantCreatedAt = new Date().toISOString();
    const activeBotName =
      typeof activeBotId === "string"
        ? settings.starterPromptLabel?.trim() ?? ""
        : "";
    const assistantMessageProse: ChatMessage = {
      id: randomId(12),
      role: "assistant",
      content: assistantDisplay,
      createdAt: assistantCreatedAt,
      provider: providerNameUsed,
      model: modelUsed,
      moodKey: assistantMood.key,
      moodConfidence: assistantMood.confidence,
      ...(activeBotName ? { botName: activeBotName } : {}),
      ...(askQuestionForTurn ? { askQuestion: askQuestionForTurn } : {}),
    };
    const assistantTail: ChatMessage[] = [assistantMessageProse];
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
      ...assistantTail,
    ];
    const conversationIncognito: Conversation = {
      id: conversationId ?? randomId(12),
      userId,
      title: privateConversationTitle(nextMessages, message, settings.starterPromptLabel),
      mode,
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
            turnEvaluation?.trend ?? evaluation.trend,
            evaluation.reason,
            [evaluation.reason],
            assistantCreatedAt
          );
        })();
    pushBackendEvent(
      "route",
      "POST /api/chat completed",
      `conversation=${conversationIncognito.id}; messages=${nextMessages.length}; provider=${providerNameUsed}; model=${modelUsed}`
    );

    return {
      conversation: conversationIncognito,
      ...(fallbackInvocation ? { fallbackInvocation } : {}),
      opinion: incognitoOpinion,
      ...(pendingImageJobIncognito ? { pendingImageJob: pendingImageJobIncognito } : {}),
      ...(incognitoToolCallEvents.length > 0
        ? { toolCalls: incognitoToolCallEvents }
        : {}),
      backendEvents,
      ...(conversationStartersIncognito
        ? { conversationStarters: conversationStartersIncognito }
        : {}),
    };
  }

  let activeConversationId = conversationId;
  if (mode === "chat" && !incognitoForTurn && settings.forceNewConversation !== true) {
    const latestChatConversation = db
      .prepare(
        `SELECT id
           FROM conversations
          WHERE user_id = ?
            AND COALESCE(incognito, 0) = 0
            AND conversation_mode = 'chat'
          ORDER BY updated_at DESC
          LIMIT 1`
      )
      .get(userId) as { id?: string } | undefined;
    if (!activeConversationId) {
      activeConversationId = latestChatConversation?.id;
    } else {
      const requested = db
        .prepare("SELECT id, conversation_mode FROM conversations WHERE id = ? AND user_id = ?")
        .get(activeConversationId, userId) as
        | { id: string; conversation_mode: string | null }
        | undefined;
      if (!requested?.id) {
        throw new Error("Conversation not found for this user.");
      }
      if (requested.conversation_mode !== "chat") {
        activeConversationId = latestChatConversation?.id;
      }
    }
  }
  if (!activeConversationId) {
    activeConversationId = randomId(12);
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      activeConversationId,
      userId,
      isStarterPrompt
        ? generateStarterConversationTitle(settings.starterPromptLabel)
        : generateConversationTitle(message),
      mode,
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
  const memoryIntent = !isStarterPrompt ? analyzeMemoryIntent(message) : null;
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
  if (!incognitoForTurn) {
    const pipelineResult =
      mode === "chat"
        ? await handleCompanionChatTurn({
            db,
            provider,
            userId,
            activeConversationId,
            message,
            userKey,
            activeMemoryBotId,
            isStarterPrompt,
            retrievalMode,
          })
        : await handleSandboxTurn({
            db,
            userId,
            activeConversationId,
            isStarterPrompt,
            retrievalMode,
          });
    threadSummary = pipelineResult.threadSummary;
    memoryLines = pipelineResult.memoryLines;
  }
  pushBackendEvent(
    "context",
    "Loaded model context",
    `history=${history.length}; threadSummary=${threadSummary ? `${threadSummary.length} chars` : "none"}; memoryLines=${memoryLines.length}; askQuestion=${askQuestionMode}; activeBot=${activeMemoryBotId ?? "default"}`
  );

  const existingSessionOpinion = readSessionOpinion(
    db,
    userId,
    activeConversationId,
    activeBotId
  );
  const existingBotOpinion = readBotOpinion(db, userId, activeBotId);
  let memoryClarification: string | null = null;
  const longTermRetractionTargets = new Map<string, Awaited<ReturnType<typeof findMemoryByCue>>>();
  if (
    !skipPersonalFacts &&
    !isStarterPrompt &&
    memoryIntent &&
    (memoryIntent.kind === "retract" || memoryIntent.kind === "correct")
  ) {
    for (const cuePhrase of memoryIntent.cuePhrases) {
      const target = await findMemoryByCue(
        db,
        userId,
        activeConversationId,
        activeMemoryBotId,
        cuePhrase,
        userKey
      );
      longTermRetractionTargets.set(cuePhrase, target);
      if (
        target &&
        isLongTermMemory(target) &&
        target.conversationId !== activeConversationId &&
        !messageAllowsLongTermDemotion(message)
      ) {
        memoryClarification = longTermMemoryClarificationPrompt(target.text);
        break;
      }
    }
  }
  const promptMessages = buildPromptMessages({
    botSystemPrompt: settings.botSystemPrompt,
    userDisplayName: settings.userDisplayName,
    suppressDisplayNameHint: isStarterPrompt,
    devMemoriesEnabled: settings.devMemoriesEnabled,
    devMemoriesText: settings.devMemoriesText,
    botOpinion: existingBotOpinion,
    threadSummary,
    memoryLines,
    memoryClarification,
    chatHistory: history,
    userMessage: promptUserMessage,
    askQuestionMode: memoryClarification ? "explicit" : askQuestionMode,
    imageSlotSystemHint: buildImageSlotSystemHint(userId, activeConversationId),
  });
  pushBackendEvent("context", "Prepared persisted chat prompt", describePromptMessages(promptMessages));

  let userMessageId: string | null = null;
  if (!isStarterPrompt) {
    userMessageId = randomId(12);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, bot_id, created_at) VALUES (?, ?, ?, 'user', ?, NULL, NULL, ?)"
    ).run(userMessageId, activeConversationId, userId, message, now);
  }

  const { provider: primaryProvider, botOverrides: primaryBotOverrides } =
    resolvePrimaryChatProviderForPossibleImageToolTurn({
      isStarterPrompt,
      rawUserMessage: message,
      baseProvider: provider,
      botOverrides: settings.botOverrides,
      secondaryOllamaHost: settings.secondaryOllamaHost,
      prismImageToolLlmModel: settings.prismImageToolLlmModel,
      recentMessages: history,
    });
  pushBackendEvent(
    "model",
    "Calling chat model",
    `provider=${primaryProvider.name}; model=${describeRequestedModel(
      primaryProvider,
      primaryBotOverrides
    )}; imageToolRoute=${primaryProvider === provider ? "normal" : "rerouted"}`
  );

  let {
    assistantReplyRaw,
    providerNameUsed,
    modelUsed,
    fallbackInvocation,
  } = await generateWithLenientLocalFallback({
    provider: primaryProvider,
    promptMessages,
    botOverrides: primaryBotOverrides,
    secondaryOllamaHost: settings.secondaryOllamaHost,
    lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
    denialBoundaryProvider: auxiliaryProvider,
    denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
    botSystemPrompt: settings.botSystemPrompt,
    userMessage: message,
  });
  pushBackendEvent(
    "model",
    "Model response received",
    `provider=${providerNameUsed}; model=${modelUsed}; rawChars=${assistantReplyRaw.length}`
  );
  if (
    shouldSuppressAssistantReply(assistantReplyRaw) &&
    !shouldBypassSuppressionForImageIntent(isStarterPrompt, message, history)
  ) {
    const boundary = await generateOrganicTextBoundaryReply({
      boundaryProvider: auxiliaryProvider,
      boundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
      botSystemPrompt: settings.botSystemPrompt,
      userMessage: message,
    });
    assistantReplyRaw = boundary.assistantReplyRaw;
    providerNameUsed = boundary.providerNameUsed;
    modelUsed = boundary.modelUsed;
  }
  const parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
  const shouldBackfillAskQuestion =
    forceAskQuestion ||
    assistantLikelyIntendedAskQuestion(parsedAssistant.displayContent);
  const askQuestionRaw =
    parsedAssistant.askQuestion ??
    (shouldBackfillAskQuestion
      ? buildAskQuestionFallback(parsedAssistant.displayContent)
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
  let assistantDisplay = isStarterPrompt
    ? enforceStarterOpeningQuestion(
        assistantDisplayRaw,
        memoryLines,
        settings.starterPromptWarrantsIntro === true
      )
    : assistantDisplayRaw;
  const turnEvaluation = isStarterPrompt
    ? undefined
    : evaluateUserTurnOpinion(message);
  const repairSignal = isStarterPrompt
    ? false
    : hasRepairSignal(normalizeOpinionText(message));
  const assistantMood = evaluateAssistantMood({
    assistantContent: assistantDisplay,
    toneDelta: turnEvaluation?.delta,
    sessionOpinion: existingSessionOpinion,
    botOpinion: existingBotOpinion,
    repairSignal,
  });
  const sendImgPromptPersistedRaw = parsedAssistant.sendGeneratedImage?.prompt?.trim();
  let sendImgPromptPersisted = autoBackfillSendGeneratedImagePrompt({
    isStarterPrompt,
    userMessage: message,
    parsedToolPrompt: sendImgPromptPersistedRaw,
    recentMessages: history,
  });
  const sendImgPromptPersistedRequested = sendImgPromptPersisted;
  let pendingImageJob: ProcessChatMessageResult["pendingImageJob"] | undefined;
  let sentGeneratedImagePersisted: SentGeneratedImagePayload | undefined;
  let persistedImageSlot: "acquired" | "busy" | "none" =
    sendImgPromptPersisted && sendImgPromptPersisted.length > 0 ? "busy" : "none";
  let persistedImageJobId: string | undefined;
  if (sendImgPromptPersisted && sendImgPromptPersisted.length > 0) {
    const chatToolRequestedSize = inferChatToolRequestedImageSize(
      `${message}\n${sendImgPromptPersisted}`
    );
    const acq = await tryAcquireImageSlot({
      userId,
      conversationId: activeConversationId,
      botId: activeBotId ?? null,
      mode,
      incognito: false,
      captionPrompt: sendImgPromptPersisted,
      userMessage: message,
      source: "chat_tool",
      requestedSize: chatToolRequestedSize,
    });
    if (!acq.ok) {
      sendImgPromptPersisted = undefined;
      assistantDisplay =
        assistantDisplay.trim().length > 0
          ? `${assistantDisplay.trimEnd()}\n\n${ASSISTANT_IMAGE_SLOT_BUSY_NOTE}`
          : ASSISTANT_IMAGE_SLOT_BUSY_NOTE;
      sentGeneratedImagePersisted = undefined;
      persistedImageSlot = "busy";
    } else {
      assistantDisplay = compactPreImageLeadMessage(assistantDisplay);
      startChatImageBackgroundJob({
        db,
        job: acq.job,
        preferredProvider: imagePreferredProviderForTextProvider(effectiveProvider),
        openAiApiKey: settings.openAiApiKey,
        prefs: assistantImagePrefsForTurn(settings),
        prismDefaultLlmModel: settings.prismDefaultLlmModel,
        chatModelUsed: modelUsed,
        chatProviderName: providerNameUsed,
        botName: settings.starterPromptLabel,
        botSystemPrompt: settings.botSystemPrompt,
      });
      sendImgPromptPersisted = undefined;
      pendingImageJob = {
        jobId: acq.job.id,
        conversationId: activeConversationId,
      };
      sentGeneratedImagePersisted = undefined;
      persistedImageSlot = "acquired";
      persistedImageJobId = acq.job.id;
    }
    pushBackendEvent(
      "tool",
      "Processed sendGeneratedImage tool request",
      `slot=${persistedImageSlot}; job=${persistedImageJobId ?? "none"}`
    );
  }
  const persistedToolCallEvents = buildAssistantToolCallEvents({
    rawReply: assistantReplyRaw,
    ...((parsedAssistant.sendGeneratedImage ||
      sendImgPromptPersistedRaw !== sendImgPromptPersistedRequested) &&
    sendImgPromptPersistedRequested
      ? {
          parsedSendGeneratedImage: { prompt: sendImgPromptPersistedRequested },
        }
      : {}),
    ...(askQuestionForTurn ? { parsedAskQuestion: askQuestionForTurn } : {}),
    imageSlot: persistedImageSlot,
    ...(persistedImageJobId ? { imageJobId: persistedImageJobId } : {}),
  });
  const toolPayloadProseOnly = serializeAssistantToolPayload({
    askQuestion: askQuestionForTurn,
    moodKey: assistantMood.key,
    moodConfidence: assistantMood.confidence,
  });
  const toolPayloadImageOnly = sentGeneratedImagePersisted
    ? serializeAssistantToolPayload({ sentGeneratedImage: sentGeneratedImagePersisted })
    : null;

  const assistantCreatedAt = new Date().toISOString();
  const imageFollowUpCreatedAt = sentGeneratedImagePersisted
    ? new Date(Date.now() + 2).toISOString()
    : assistantCreatedAt;
  const assistantProseMessageId = randomId(12);
  const assistantImageMessageId = randomId(12);

  const assistantCountBefore = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
      )
      .get(activeConversationId, userId) as { n: number }
  ).n;

  db.prepare(
    "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)"
  ).run(
    assistantProseMessageId,
    activeConversationId,
    userId,
    assistantDisplay,
    providerNameUsed,
    modelUsed,
    activeBotId ?? null,
    toolPayloadProseOnly,
    assistantCreatedAt
  );

  if (sentGeneratedImagePersisted && toolPayloadImageOnly) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)"
    ).run(
      assistantImageMessageId,
      activeConversationId,
      userId,
      "",
      providerNameUsed,
      sentGeneratedImagePersisted.imageModel?.trim() || modelUsed,
      activeBotId ?? null,
      toolPayloadImageOnly,
      imageFollowUpCreatedAt
    );
  }

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
  const botOpinion = isStarterPrompt
    ? readBotOpinion(db, userId, activeBotId)
    : upsertBotOpinionFromTurn({
        db,
        userId,
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
  if (assistantCountBefore === 0 && assistantMessageCount >= 1) {
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
    const titleAssistantMessageId = assistantProseMessageId;
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
          const sourceAssistant = db
            .prepare(
              "SELECT id FROM messages WHERE id = ? AND conversation_id = ? AND user_id = ? AND role = 'assistant'"
            )
            .get(titleAssistantMessageId, titleConversationId, titleUserId) as
            | { id: string }
            | undefined;
          if (!sourceAssistant?.id) return;
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
  // Bot-authored judgment memories are treated as inferred bot-scoped memories
  // and only run when auto-memory is enabled.
  let memoryLearned: ProcessChatMessageResult["memoryLearned"];
  const shouldProcessExplicitMemory = memoryIntent !== null &&
    (memoryIntent.kind !== "create" || memoryIntent.scope === "global" || memoryIntent.explicit);
  if (!skipPersonalFacts && !isStarterPrompt) {
    const createdMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["created"] = [];
    const retractedMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["retracted"] = [];
    const rejectedMemories: NonNullable<ProcessChatMessageResult["memoryLearned"]>["rejected"] = [];
    if (memoryIntent && (settings.autoMemory || shouldProcessExplicitMemory)) {
      const cuePhrases =
        memoryIntent.kind === "retract" || memoryIntent.kind === "correct"
          ? memoryIntent.cuePhrases
          : [];
      for (const cuePhrase of cuePhrases) {
        const target = longTermRetractionTargets.has(cuePhrase)
          ? longTermRetractionTargets.get(cuePhrase)
          : await findMemoryByCue(
              db,
              userId,
              activeConversationId,
              activeMemoryBotId,
              cuePhrase,
              userKey
            );
        const shouldDeleteLongTerm = Boolean(
          target &&
          isLongTermMemory(target) &&
          target.conversationId === activeConversationId
        );
        const shouldDemoteLongTerm = Boolean(
          target &&
          isLongTermMemory(target) &&
          !shouldDeleteLongTerm &&
          messageAllowsLongTermDemotion(message)
        );
        const changed = target
          ? shouldDeleteLongTerm
            ? deleteMemoryById(db, userId, target.id, { allowLongTerm: true })
            : shouldDemoteLongTerm
              ? demoteMemoryToShortTerm(db, userId, target.id)
              : deleteMemoryById(db, userId, target.id)
          : false;
        if (target && changed) {
          retractedMemories.push({
            id: target.id,
            text: target.text,
            botId: target.botId ?? null,
            conversationId: target.conversationId,
            confidence: shouldDemoteLongTerm ? 0.34 : target.confidence,
            category: target.category,
            tier: shouldDemoteLongTerm ? "short_term" : target.tier,
            source: target.source,
            certainty: target.certainty,
            durability: target.durability,
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
          userDisplayName: settings.userDisplayName,
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
              category: memory.category,
              tier: memory.tier,
              source: memory.source,
              certainty: memory.certainty,
              durability: memory.durability,
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
    }

    if (settings.autoMemory && activeMemoryBotId) {
      const judgmentCandidates = extractBotJudgmentMemoryCandidates({
        assistantMessage: assistantDisplay,
        botName: settings.starterPromptLabel ?? null,
      });
      if (judgmentCandidates.length > 0) {
        const validation = await validateMemoryCandidates(auxiliaryProvider, {
          source: "inferred",
          scope: "bot",
          rawContext: assistantDisplay,
          candidates: judgmentCandidates,
          userDisplayName: settings.userDisplayName,
        });
        rejectedMemories.push(...validation.rejected);
        const validatedByText = new Map(
          validation.candidates.map((candidate) => [candidate.text, candidate])
        );
        const storedJudgments = await persistMemoryCandidates(
          db,
          userId,
          activeConversationId,
          activeMemoryBotId,
          validation.candidates,
          userKey,
          {
            source: "inferred",
            category: "general",
            tier: "short_term",
            sourceMessageIds: assistantProseMessageId ? [assistantProseMessageId] : [],
          }
        );
        createdMemories.push(
          ...storedJudgments.map((memory) => {
            const validationMatch = validatedByText.get(memory.text);
            return {
              id: memory.id,
              text: memory.text,
              botId: memory.botId ?? null,
              conversationId: memory.conversationId,
              confidence: memory.confidence,
              category: memory.category,
              tier: memory.tier,
              source: memory.source,
              certainty: memory.certainty,
              durability: memory.durability,
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
    pushBackendEvent(
      "memory",
      "Memory pipeline checked",
      `intent=${memoryIntent?.kind ?? "none"}; created=${createdMemories.length}; retracted=${retractedMemories.length}; rejected=${rejectedMemories.length}`
    );
  }
  if (!skipPersonalFacts && !isStarterPrompt) {
    await ensureAboutYouMemory({
      db,
      userId,
      userKey,
      conversationId: activeConversationId,
      botId: activeMemoryBotId,
      sourceMessageId: userMessageId,
      userDisplayName: settings.userDisplayName,
    });
  }

  let summaryCompaction: ProcessChatMessageResult["summaryCompaction"];
  const shouldCompactAtMilestone = !skipSummarization && shouldSummarizeAtMilestone(totalMessages);
  const shouldCompactAtSessionEnd = !skipSummarization && settings.sessionEnding === true;
  if (shouldCompactAtMilestone) {
    summarizeThreadCompact(
      db,
      auxiliaryProvider,
      userId,
      activeConversationId,
      { mode, reason: "milestone" }
    ).catch(() => {});
    summaryCompaction = {
      mode,
      triggered: true,
      inProgress: true,
      reason: "milestone",
    };
    if (mode === "chat" && settings.autoMemory) {
      summarizeAndStoreMemories(
        db,
        auxiliaryProvider,
        userId,
        activeConversationId,
        userKey
      ).catch(() => {});
    }
    pushBackendEvent(
      "summary",
      "Queued thread compaction",
      `reason=milestone; mode=${mode}; totalMessages=${totalMessages}`
    );
  }
  if (shouldCompactAtSessionEnd) {
    const compacted = await summarizeThreadCompact(
      db,
      auxiliaryProvider,
      userId,
      activeConversationId,
      { mode, reason: "mode_exit", force: true }
    );
    summaryCompaction = {
      mode,
      triggered: compacted.triggered,
      inProgress: false,
      reason: "mode_exit",
      ...(compacted.latestSummary ? { latestSummary: compacted.latestSummary } : {}),
      ...(compacted.latestSummaryAt ? { latestSummaryAt: compacted.latestSummaryAt } : {}),
    };
    if (mode === "sandbox" && activeMemoryBotId) {
      await summarizeSandboxBotStatus(
        db,
        auxiliaryProvider,
        userId,
        activeMemoryBotId,
        { reason: "mode_exit", userKey }
      );
    }
    pushBackendEvent(
      "summary",
      "Ran thread compaction",
      `reason=mode_exit; mode=${mode}; triggered=${compacted.triggered ? "yes" : "no"}`
    );
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
      `SELECT c.id, c.user_id, c.title, c.conversation_mode, c.bot_id, c.incognito, c.created_at, c.updated_at,
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
    conversation_mode: string | null;
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
    mode: conversationRow.conversation_mode === "chat" ? "chat" : "sandbox",
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
  pushBackendEvent(
    "route",
    "POST /api/chat completed",
    `conversation=${conversationPersisted.id}; totalMessages=${totalMessages}; assistantMessages=${assistantMessageCount}; provider=${providerNameUsed}; model=${modelUsed}`
  );

  return {
    conversation: conversationPersisted,
    ...(fallbackInvocation ? { fallbackInvocation } : {}),
    opinion,
    ...(botOpinion ? { botOpinion } : {}),
    ...(summaryCompaction ? { summaryCompaction } : {}),
    ...(memoryLearned ? { memoryLearned } : {}),
    ...(conversationStartersPersisted
      ? { conversationStarters: conversationStartersPersisted }
      : {}),
    ...(pendingImageJob ? { pendingImageJob } : {}),
    ...(persistedToolCallEvents.length > 0
      ? { toolCalls: persistedToolCallEvents }
      : {}),
    backendEvents,
  };
}
