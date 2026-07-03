import type { DatabaseSync } from "node:sqlite";
import { getAppConfig } from "@localai/config";
import { randomId } from "./security.ts";
import {
  analyzeMemoryIntent,
  extractBotJudgmentMemoryCandidates,
  demoteMemoryToShortTerm,
  deleteMemoryById,
  findMemoryByCue,
  memoryQualifiesLongTerm,
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
  getLatestFullThreadCompactionCutoff,
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
  ManualAskQuestionResultPayload,
  MemoryCategory,
  MemoryTier,
  OpinionBand,
  OpinionTrend,
  PsychicThoughtPayload,
  PrismMoodInterruptionInput,
  PrismMoodSnapshot,
  PromptShortcutMetadata,
  PromptWildcardRunMetadata,
  ReasoningEffort,
  SessionOpinion,
  SentGeneratedImagePayload,
  TellFictionalStoryPayload,
  WebSearchPayload,
  WebSearchRequestPayload,
  ZenAskQuestionPatienceInput,
  ZenAutonomyDecision,
  ZenAutonomyInput,
  ZenLiveActionContextInput,
  ZenLiveActionInterruptInput,
  ZenPersonaTransitionInput,
  ZenPersonaTransitionStyle,
  ZenSessionMemoryOverview,
} from "@localai/shared";
import {
  applyPrismMoodExpiredIgnoreCooldown,
  applyPrismMoodForgivenessSuccess,
  applyPrismMoodInterruption,
  applyPrismMoodIgnoreCooldown,
  applyPrismMoodIgnoredTurn,
  applyPrismMoodNegativeTurn,
  applyPrismMoodPositiveTurn,
  createDefaultPrismMoodState,
  decayPrismMood,
  hydrateAssistantMessageParts,
  isDisabledModelChoice,
  isPrismMoodIgnoring,
  normalizeReasoningEffort,
  openAiModelSupportsReasoningEffort,
  normalizePrismMoodSensitivity,
  prismMoodDeclineReason,
  prismMoodIgnoreForgivenessChance,
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  parseAssistantPrismTools,
  parseStoredManualAskQuestionPayload,
  parseStoredPsychicThoughtPayload,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  sanitizePrismMoodState,
  serializeAssistantToolPayload,
  serializePromptToolPayload,
  shouldPrismMoodDeclineResponse,
  shouldPrismMoodStartIgnoreCooldown,
  stripBotProfileMetaSuffix,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
} from "@localai/shared";
import type { AssistantSentImageUserPrefs } from "./assistant-sent-image.ts";
import {
  peekActiveImageJobForUser,
  releaseImageSlot,
  tryAcquireImageSlot,
  startChatImageBackgroundJob,
} from "./image-job-slot.ts";
import {
  buildRememberedZenWallpaperHistory,
  getLatestRememberedZenWallpaperForBot,
  mapZenWallpaperMetadata,
  rebaseZenWallpaperMetadataForVisibleWindow,
  recoverStaleZenWallpaperGenerationStatus,
  serializeZenWallpaperHistory,
} from "./conversations.ts";
import {
  loadPrismMoodEventMessageIds,
  loadPrismMoodState,
  upsertPrismMoodState,
} from "./db.ts";
import {
  buildZenSessionMemoryPromptContext,
  buildZenPersonaContinuityPromptContext,
  createZenPersonaSessionMemoryCheckpoint,
  createZenSessionMemoryCheckpoint,
  loadZenSessionMemoryOverview,
  pruneExpiredZenSessionMemories,
  userMessageRequestsZenSessionMemory,
} from "./zen-session-memory.ts";
import {
  formatWebSearchForModel,
  searchWebWithBrave,
} from "./web-search.ts";
import { attachUsageEventsToMessage, patchUsageSession } from "./usage.ts";

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
  | "webSearch"
  | "unknown";

export type ChatToolCallEventStatus =
  /** Parser successfully extracted a tool envelope from the assistant reply. */
  | "detected"
  /** Image-pipeline slot was acquired and a background job was scheduled. */
  | "acquired"
  /** Image-pipeline was busy; the assistant got the "pipeline busy" note appended. */
  | "busy"
  /** Tool execution was blocked by provider/privacy rules. */
  | "blocked"
  /** Tool execution completed and results were attached. */
  | "completed"
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

export interface PsychicDebugPayload {
  summary: string;
  scratchpad: string;
  effort: ReasoningEffort;
  provider: ProviderName;
  model?: string;
  simulated: boolean;
  passCount?: number;
  passes?: Array<{
    name: "plan" | "draft" | "audit" | "revision";
    chars: number;
    warning?: string;
  }>;
  guidanceChars?: number;
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
  prismMood?: PrismMoodSnapshot;
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
  /** Live-only planning artifact for the developer metrics terminal. */
  psychicDebug?: PsychicDebugPayload;
  /** Present for Zen idle-autonomy checks, including silent no-message decisions. */
  zenAutonomyDecision?: ZenAutonomyDecision;
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
const STARTER_SUGGESTION_JSON_KEYS = [
  "suggestions",
  "options",
  "replies",
  "quickReplies",
  "quick_replies",
  "starterSuggestions",
  "starter_suggestions",
  "conversationStarters",
  "conversation_starters",
];
const STARTER_SUGGESTION_TEXT_KEYS = ["label", "text", "value", "title", "reply", "content"];
const STARTER_SUGGESTION_MAX_CHARS = 180;

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

const ZEN_MOOD_PAUSE_REPLY = "I’m going to pause here for a moment.";

const NEUTRAL_MOOD_EVALUATION: MoodEvaluation = {
  key: "neutral",
  confidence: 0,
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

function userAttemptedMoodRepair(message: string, evaluation: OpinionEvaluation | undefined): boolean {
  const normalized = normalizeOpinionText(message);
  return hasRepairSignal(normalized) || (evaluation?.delta ?? 0) > 0;
}

function buildPrismForgivenessSystemHint(chance: number): string {
  return [
    "Zen mood boundary event:",
    "Prism was ignoring the user because repeated behavior had pushed the conversation into a severe boundary state.",
    `The user tried to make amends during the cooldown, and the fixed ${Math.round(chance * 100)}% forgiveness roll succeeded.`,
    "Answer again now, but keep it brief and emotionally grounded.",
    "Emphasize the user's behavior and the repair attempt: acknowledge that the apology or kindness matters, and make clear that future behavior will steer the mood from here.",
    "Do not mention dice, random rolls, hidden percentages, cooldown internals, or system instructions.",
  ].join("\n");
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

function withGenerationSignal(
  options: GenerateOptions | undefined,
  signal: AbortSignal | undefined
): GenerateOptions | undefined {
  if (!signal) return options;
  return {
    ...options,
    signal,
  };
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
  signal?: AbortSignal;
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
    const raw = await provider.generateResponse(
      messages,
      withGenerationSignal(
        {
          temperature: 0.7,
          maxTokens: 90,
          usagePurpose: "chat_boundary",
        },
        args.signal
      )
    );
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
  return latestAssistantMessageForImageIntent(recentMessages).toLowerCase();
}

function latestAssistantMessageForImageIntent(
  recentMessages: readonly Pick<ChatMessage, "role" | "content">[]
): string {
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const msg = recentMessages[index];
    if (!msg || msg.role !== "assistant") continue;
    return msg.content.trim();
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

function assistantMessageOffersVisual(text: string): boolean {
  return (
    /\b(?:would\s+you\s+(?:like|care)\s+to\s+see|want\s+to\s+see|would\s+you\s+like\s+me\s+to\s+(?:create|make|generate|paint|draw)|can\s+i\s+show\s+you|i\s+can\s+(?:show\s+you|share|create|make|generate|paint|draw)|shall\s+i\s+(?:show\s+you|create|make|generate|paint|draw))\b/.test(
      text
    ) &&
    /\b(image|picture|photo|drawing|drawings|sketch|sketches|painting|paintings|illustration|illustrations|artwork|wallpaper|background)\b/.test(
      text
    )
  );
}

function userMessageAffirmsVisualOffer(text: string): boolean {
  return (
    /^(?:yes|yeah|yep|sure|absolutely|please|of course)\b/.test(text) ||
    /\bi(?:'d| would)\s+love\s+to\b/.test(text) ||
    /\bthat sounds (?:great|good|lovely|nice)\b/.test(text)
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
  return assistantMessageOffersVisual(latestAssistant) && userMessageAffirmsVisualOffer(t);
}

const AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS = 1200;

function clipAutoBackfilledImagePrompt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS) return normalized;
  return `${normalized.slice(0, AUTO_BACKFILLED_IMAGE_PROMPT_MAX_CHARS - 3).trimEnd()}...`;
}

function autoBackfillPromptFromAssistantVisualOffer(args: {
  userMessage: string;
  recentMessages: readonly Pick<ChatMessage, "role" | "content">[];
}): string | undefined {
  const userAffirmed = userMessageAffirmsVisualOffer(args.userMessage.trim().toLowerCase());
  if (!userAffirmed) return undefined;
  const latestAssistantRaw = latestAssistantMessageForImageIntent(args.recentMessages);
  const latestAssistant = latestAssistantRaw.toLowerCase();
  if (!latestAssistant || !assistantMessageOffersVisual(latestAssistant)) return undefined;
  return clipAutoBackfilledImagePrompt(
    `Create the image the assistant just offered. Use the assistant's visual brief instead of the user's short affirmation: ${latestAssistantRaw}`
  );
}

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
  const contextualOfferPrompt = autoBackfillPromptFromAssistantVisualOffer({
    userMessage: args.userMessage,
    recentMessages: args.recentMessages ?? [],
  });
  if (contextualOfferPrompt) return contextualOfferPrompt;
  const normalized = clipAutoBackfilledImagePrompt(args.userMessage);
  return normalized || undefined;
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
    !isDisabledModelChoice(imageModel) &&
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

interface PsychicPlanningTrace {
  psychicThought?: PsychicThoughtPayload;
  debug: PsychicDebugPayload;
  answerGuidance: string;
  shouldGuideFinalAnswer: boolean;
}

type PsychicPrivatePassName = "plan" | "draft" | "audit" | "revision";

interface PsychicPrivatePassDiagnostic {
  name: PsychicPrivatePassName;
  chars: number;
  warning?: string;
}

interface PsychicPrivateTextPassResult {
  name: Exclude<PsychicPrivatePassName, "plan">;
  content: string;
  diagnostic: PsychicPrivatePassDiagnostic;
}

const PSYCHIC_PLANNING_SYSTEM_PROMPT = [
  "You are Prism's private planning pass for the next assistant reply.",
  "Return only one JSON object with string fields: summary, scratchpad, and answerGuidance.",
  "All three fields must be non-empty.",
  "summary: one concise user-visible reasoning summary under 80 words, written from the assistant's first-person perspective.",
  "The summary should sound like a short intent line, not a system caption. Prefer forms like \"I've decided it makes the most sense to ___ based on ___ in regard to ___\" or \"I'm helping the user ___, so I'm going to tell them ___\".",
  "Do not write the summary as raw chain-of-thought, a detached label, or a third-person sentence about Prism.",
  "scratchpad: 2-4 short private planning notes about constraints, risks, and answer shape. This is a developer-only simulated planning artifact, not hidden chain-of-thought from a provider.",
  "answerGuidance: 2-4 concrete instructions for the final reply. Preserve exact requested formats, labels, word limits, and forbidden-word rules. If the user asks for labels like S1-S6, use those exact labels and do not convert them to 1-6. Do not include secrets or long reasoning.",
  "When the user assigns requirements to rows, bullets, or labels, restate those label requirements in answerGuidance and preserve required key terms.",
  "If the user says local-only, prefer local machine, local device, local provider, or Ollama wording; never replace local-only with infrastructure-only wording.",
  "If the user asks for a UI indicator, prefer concrete indicator words like toast, badge, line, or label instead of turning the indicator into a settings toggle.",
].join("\n");

const PSYCHIC_PLANNING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      minLength: 1,
      description:
        "Concise user-visible first-person assistant intent summary under 80 words.",
    },
    scratchpad: {
      type: "string",
      minLength: 1,
      description: "Developer-only simulated planning notes.",
    },
    answerGuidance: {
      type: "string",
      minLength: 1,
      description: "Concise private guidance for the final reply.",
    },
  },
  required: ["summary", "scratchpad", "answerGuidance"],
} satisfies Record<string, unknown>;

function psychicPlanPromptForEffort(effort: ReasoningEffort): string {
  if (effort === "minimal") {
    return PSYCHIC_PLANNING_SYSTEM_PROMPT;
  }
  return [
    PSYCHIC_PLANNING_SYSTEM_PROMPT,
    "For this effort level, make the scratchpad more useful: explicitly note required constraints, forbidden words, likely failure modes, and the answer structure.",
    "Keep it concise, but do not leave the final answer to rediscover the constraints.",
  ].join("\n");
}

function clampPsychicPlanningText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function psychicPlanningTokenBudget(effort: ReasoningEffort): number {
  switch (effort) {
    case "xhigh":
      return 900;
    case "high":
      return 720;
    case "medium":
      return 560;
    case "low":
      return 420;
    case "minimal":
      return 300;
    case "none":
    case "auto":
    default:
      return 260;
  }
}

function psychicPrivateTextPassTokenBudget(
  effort: ReasoningEffort,
  passName: Exclude<PsychicPrivatePassName, "plan">
): number {
  switch (passName) {
    case "draft":
      return effort === "xhigh" ? 1100 : 900;
    case "audit":
      return effort === "medium" ? 420 : effort === "xhigh" ? 760 : 620;
    case "revision":
      return 760;
  }
}

function simulatedEffortTextPasses(
  effort: ReasoningEffort
): Array<Exclude<PsychicPrivatePassName, "plan">> {
  switch (effort) {
    case "medium":
      return ["audit"];
    case "high":
      return ["draft", "audit"];
    case "xhigh":
      return ["draft", "audit", "revision"];
    case "minimal":
    case "low":
    case "none":
    case "auto":
    default:
      return [];
  }
}

function providerModelSupportsNativeReasoningEffort(
  provider: LlmProvider,
  botOverrides: GenerateOptions | undefined
): boolean {
  if (provider.name !== "openai") return false;
  return openAiModelSupportsReasoningEffort(describeRequestedModel(provider, botOverrides));
}

function simulatedEffortNoticeDetail(args: {
  experimentalAllModelEffortEnabled?: boolean;
  provider: LlmProvider;
  botOverrides: GenerateOptions | undefined;
  effort: ReasoningEffort;
}): string | null {
  if (args.experimentalAllModelEffortEnabled !== true) return null;
  if (args.effort === "auto" || args.effort === "none") return null;
  if (args.provider.name === "local") return null;
  const model = describeRequestedModel(args.provider, args.botOverrides);
  if (providerModelSupportsNativeReasoningEffort(args.provider, args.botOverrides)) {
    return `native_reasoning_preserved; provider=${args.provider.name}; model=${model}; effort=${args.effort}; simulated=false`;
  }
  return `online_simulated_effort_disabled; provider=${args.provider.name}; model=${model}; effort=${args.effort}; reason=local_only`;
}

function shouldSimulateReasoningEffort(args: {
  experimentalAllModelEffortEnabled?: boolean;
  provider: LlmProvider;
  effort: ReasoningEffort;
}): boolean {
  if (args.experimentalAllModelEffortEnabled !== true) return false;
  if (args.effort === "auto" || args.effort === "none") return false;
  return args.provider.name === "local";
}

function parsePsychicPlanningResponse(raw: string): {
  summary: string;
  scratchpad: string;
  answerGuidance: string;
} | null {
  try {
    const parsed = JSON.parse(extractJsonObjectPayload(raw)) as unknown;
    if (!isRecord(parsed)) return null;
    const summary = clampPsychicPlanningText(parsed.summary, 1200);
    const scratchpad = clampPsychicPlanningText(parsed.scratchpad, 4000);
    const answerGuidance = clampPsychicPlanningText(parsed.answerGuidance, 1400);
    if (!summary || !scratchpad || !answerGuidance) return null;
    return { summary, scratchpad, answerGuidance };
  } catch {
    return null;
  }
}

function buildPsychicDraftPrompt(plan: {
  summary: string;
  scratchpad: string;
  answerGuidance: string;
}): string {
  return [
    "You are Prism's private draft pass for the next assistant reply.",
    "Write a private draft answer that follows the plan. This draft is never shown to the user.",
    "Obey the user's requested format, labels, word limits, and forbidden-word rules exactly. If the user asks for S1-S6 labels, use S1, S2, S3, S4, S5, and S6 exactly.",
    "Preserve required key terms from the user's constraints, and return only the requested answer shape without extra notes or summaries.",
    "If the user says local-only, use local machine, local device, local provider, or Ollama wording; do not replace local-only with infrastructure-only wording.",
    "If Psychic mode needs a visible indicator, name a toast, badge, subtle line, or label, not a toggle.",
    "Do not reveal chain-of-thought. Do not mention that this is a draft.",
    "",
    `Planning summary: ${plan.summary}`,
    `Planning notes: ${plan.scratchpad}`,
    `Answer guidance: ${plan.answerGuidance}`,
  ].join("\n");
}

function buildPsychicAuditPrompt(args: {
  plan: { summary: string; scratchpad: string; answerGuidance: string };
  userRequest: string;
  draft?: string;
}): string {
  return [
    "You are Prism's private audit pass for the next assistant reply.",
    "Return ONLY 3-5 short bullet lines of guidance, no more than 120 words total.",
    "Do not output a Markdown table. Do not write the final answer. Do not copy draft wording.",
    "Each bullet must start with '- Fix:' or '- Keep:'.",
    "Check missing constraints, privacy issues, answer shape, and likely user-facing mistakes.",
    "Specifically check exact row/step labels, forbidden words, word limits, every named row constraint, and whether any requested UI indicator is a toast, badge, subtle line, or label instead of a toggle. If S1-S6 labels were requested, say to use S1-S6 and not 1-6.",
    "If the user says local-only, tell the final answer to use local machine, local device, local provider, or Ollama wording; never recommend infrastructure-only wording.",
    "If the user says private planning pass, tell the final answer to use the exact phrase private planning pass.",
    "Tell the final answer to preserve required key terms and to avoid extra notes outside the requested format.",
    "Do not include raw chain-of-thought.",
    "",
    "User request to audit against:",
    "---",
    clampPsychicPlanningText(args.userRequest, 2600),
    "---",
    "",
    `Planning summary: ${args.plan.summary}`,
    `Answer guidance: ${args.plan.answerGuidance}`,
    `Planning notes to audit: ${args.plan.scratchpad}`,
    args.draft
      ? "A private draft was produced. Audit it against the user request and plan, but do not quote or copy it."
      : "",
  ].join("\n");
}

function buildPsychicRevisionPrompt(args: {
  plan: { summary: string; scratchpad: string; answerGuidance: string };
  userRequest: string;
  draft?: string;
  audit?: string;
}): string {
  return [
    "You are Prism's private revision-guidance pass for the next assistant reply.",
    "Return ONLY 3-5 short bullet lines of final-answer guidance, no more than 120 words total.",
    "Do not output a Markdown table. Do not write the final answer. Do not copy draft wording.",
    "Each bullet must start with '- Final:'.",
    "Focus on satisfying constraints, preserving privacy, avoiding overlong output, obeying forbidden-word rules, preserving exact requested labels such as S1-S6, and naming concrete UI indicators rather than toggles.",
    "If the user says local-only, tell the final answer to use local machine, local device, local provider, or Ollama wording; never recommend infrastructure-only wording.",
    "If the user says private planning pass, tell the final answer to use the exact phrase private planning pass.",
    "Tell the final answer to preserve required key terms and to avoid extra notes outside the requested format.",
    "",
    "User request to revise against:",
    "---",
    clampPsychicPlanningText(args.userRequest, 2600),
    "---",
    "",
    `Planning summary: ${args.plan.summary}`,
    `Initial guidance: ${args.plan.answerGuidance}`,
    args.audit ? `Audit guidance: ${clampPsychicPlanningText(args.audit, 1800)}` : "",
    args.draft
      ? "A private draft was produced. Use the audit to improve final-answer instructions, but do not quote or copy the draft."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function appendPsychicPrivateArtifactsToScratchpad(args: {
  planScratchpad: string;
  draft?: string;
  audit?: string;
  revision?: string;
}): string {
  const parts = [
    `Plan scratchpad:\n${args.planScratchpad}`,
    args.draft ? `Private draft:\n${args.draft}` : "",
    args.audit ? `Private audit:\n${args.audit}` : "",
    args.revision ? `Private revision guidance:\n${args.revision}` : "",
  ].filter(Boolean);
  return clampPsychicPlanningText(parts.join("\n\n"), 8000);
}

function composePsychicFinalGuidance(args: {
  planGuidance: string;
  audit?: string;
  revision?: string;
}): string {
  const latestGuidance = args.revision || args.audit;
  const parts = [
    "Non-negotiable final-answer rules: follow the user's exact requested format, labels, word limits, and forbidden-word rules; preserve required key terms; if the prompt says local-only, include the word local; if it says private planning pass, use that exact phrase; if it says scratchpads are not persisted, use that exact phrase; if labels like S1-S6 are requested, use those exact labels and do not convert them to 1-6; include every named item; never add a Note or summary after an exact table/list request; do not mention private planning; if Psychic mode needs an indicator, use toast, badge, line, or label.",
    `Core plan: ${clampPsychicPlanningText(args.planGuidance, 520)}`,
    latestGuidance
      ? `Latest checklist: ${clampPsychicPlanningText(latestGuidance, 520)}`
      : "",
  ].filter(Boolean);
  return clampPsychicPlanningText(parts.join("\n"), 1100);
}

function latestUserPromptContent(promptMessages: readonly ProviderMessage[]): string {
  for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
    const message = promptMessages[index];
    if (message?.role === "user") return message.content;
  }
  return "";
}

function sanitizeExplicitConstraintLine(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\bwithout using the word\s+["'`]?([A-Za-z0-9_-]+)["'`]?/gi,
      "without using the forbidden word"
    );
}

function extractExplicitUserConstraints(
  promptMessages: readonly ProviderMessage[]
): string[] {
  const latestUserMessage = latestUserPromptContent(promptMessages);
  if (!latestUserMessage.trim()) return [];
  const constraints: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of latestUserMessage.split(/\r?\n/)) {
    const line = sanitizeExplicitConstraintLine(rawLine);
    if (!line || /^constraints:?$/i.test(line)) continue;
    const isConstraint =
      /^S\d+\s+must\b/i.test(line) ||
      /^(?:do not|keep\b|use columns:)/i.test(line) ||
      /\bexactly\s+\d+\b.*\blabeled\s+S\d+/i.test(line);
    if (!isConstraint || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    constraints.push(line);
    if (constraints.length >= 10) break;
  }
  return constraints;
}

async function runPsychicPrivateTextPass(args: {
  provider: LlmProvider;
  promptMessages: ProviderMessage[];
  botOverrides: GenerateOptions | undefined;
  effort: ReasoningEffort;
  passName: Exclude<PsychicPrivatePassName, "plan">;
  systemPrompt: string;
  includeOriginalPromptAsUser?: boolean;
  signal?: AbortSignal;
  onPlanningWarning?: (detail: string) => void;
}): Promise<PsychicPrivateTextPassResult> {
  const requestedModel = describeRequestedModel(args.provider, args.botOverrides);
  let raw = "";
  try {
    raw = await args.provider.generateResponse(
      [
        { role: "system", content: args.systemPrompt },
        ...(args.includeOriginalPromptAsUser === false
          ? []
          : args.promptMessages.filter((message) => message.role !== "system")),
      ],
      {
        ...args.botOverrides,
        maxTokens: psychicPrivateTextPassTokenBudget(args.effort, args.passName),
        temperature: 0,
        reasoningEffort: args.effort === "auto" ? undefined : args.effort,
        jsonMode: false,
        jsonSchema: undefined,
        jsonSchemaName: undefined,
        usagePurpose: "psychic_planning",
        ...(args.signal ? { signal: args.signal } : {}),
      }
    );
    throwIfChatRequestCancelled(args.signal);
  } catch (error) {
    const warning = `${args.passName}_failed; provider=${
      args.provider.name
    }; model=${requestedModel}; detail=${
      error instanceof Error ? error.message : String(error)
    }`;
    args.onPlanningWarning?.(warning);
    return {
      name: args.passName,
      content: "",
      diagnostic: { name: args.passName, chars: 0, warning },
    };
  }

  const content = clampPsychicPlanningText(raw, 3200);
  if (!content) {
    const warning = `${args.passName}_empty; provider=${args.provider.name}; model=${requestedModel}; rawChars=${raw.length}`;
    args.onPlanningWarning?.(warning);
    return {
      name: args.passName,
      content: "",
      diagnostic: { name: args.passName, chars: 0, warning },
    };
  }
  return {
    name: args.passName,
    content,
    diagnostic: { name: args.passName, chars: content.length },
  };
}

function appendPsychicAnswerGuidance(
  promptMessages: ProviderMessage[],
  planningTrace: PsychicPlanningTrace | null
): ProviderMessage[] {
  if (!planningTrace?.shouldGuideFinalAnswer || !planningTrace.answerGuidance) {
    return promptMessages;
  }
  const latestUserMessage = latestUserPromptContent(promptMessages);
  const explicitConstraints = extractExplicitUserConstraints(promptMessages);
  const targetedConstraintHints = [
    /\blocal[-\s]?only\b/i.test(latestUserMessage)
      ? "Local-only wording: use the word local plus machine, device, provider, or Ollama; do not replace local-only with infrastructure-only wording."
      : "",
    /\bprivate planning pass\b/i.test(latestUserMessage)
      ? "Private planning wording: use the exact phrase private planning pass where that requirement applies."
      : "",
    /\bscratchpads?\s+are\s+not\s+persisted\b/i.test(latestUserMessage)
      ? "Scratchpad wording: use the exact phrase scratchpads are not persisted where that requirement applies."
      : "",
  ].filter(Boolean);
  const content = [
    "Private guidance from Prism's simulated planning pass. Use this to answer well, but do not mention the planning pass.",
    "Follow the user's requested format exactly. Preserve requested labels exactly; if labels like S1-S6 are requested, use S1-S6 and do not convert them to 1-6. Preserve required key terms: if the prompt says local-only, include the word local; if it says private planning pass, use that exact phrase; if it says scratchpads are not persisted, use that exact phrase. Never add a Note or summary after an exact table/list request. Obey word limits and any forbidden-word rule. If a UI indicator is requested, name a toast, badge, subtle line, or label instead of a settings toggle.",
    `Reasoning summary: ${planningTrace.debug.summary}`,
    `Answer guidance: ${planningTrace.answerGuidance}`,
    ...targetedConstraintHints,
    ...(explicitConstraints.length > 0
      ? [
          "Explicit user constraints to obey exactly:",
          ...explicitConstraints.map((constraint) => `- ${constraint}`),
        ]
      : []),
  ].join("\n");
  return [...promptMessages, { role: "system", content }];
}

async function runPsychicPlanningPass(args: {
  provider: LlmProvider;
  promptMessages: ProviderMessage[];
  botOverrides: GenerateOptions | undefined;
  effort: ReasoningEffort;
  simulated: boolean;
  psychicModeEnabled?: boolean;
  signal?: AbortSignal;
  onPlanningWarning?: (detail: string) => void;
}): Promise<PsychicPlanningTrace | null> {
  const requestedModel = describeRequestedModel(args.provider, args.botOverrides);
  const shouldPlan =
    args.simulated || (args.psychicModeEnabled === true && args.provider.name === "local");
  if (!shouldPlan) {
    if (args.psychicModeEnabled === true) {
      const nativeReasoning = providerModelSupportsNativeReasoningEffort(
        args.provider,
        args.botOverrides
      );
      const summary = nativeReasoning
        ? "I'm using the selected online reasoning model here, so I'll keep the reasoning provider-side instead of running local private passes."
        : "I'm helping with this turn using the selected online model, so I won't run extra local Psychic passes here.";
      const createdAt = new Date().toISOString();
      const debug: PsychicDebugPayload = {
        summary,
        scratchpad: "",
        effort: args.effort,
        provider: args.provider.name,
        model: requestedModel,
        simulated: false,
        passCount: 0,
        passes: [],
        guidanceChars: 0,
      };
      return {
        psychicThought: {
          v: 1,
          summary,
          effort: args.effort,
          provider: args.provider.name,
          model: requestedModel,
          createdAt,
        },
        debug,
        answerGuidance: "",
        shouldGuideFinalAnswer: false,
      };
    }
    return null;
  }

  const planningMessages: ProviderMessage[] = [
    { role: "system", content: psychicPlanPromptForEffort(args.effort) },
    ...args.promptMessages.filter((message) => message.role !== "system"),
  ];
  let raw = "";
  try {
    raw = await args.provider.generateResponse(planningMessages, {
      ...args.botOverrides,
      maxTokens: psychicPlanningTokenBudget(args.effort),
      temperature: 0,
      reasoningEffort: args.effort === "auto" ? undefined : args.effort,
      jsonMode: true,
      jsonSchema: PSYCHIC_PLANNING_JSON_SCHEMA,
      jsonSchemaName: "psychic_planning",
      usagePurpose: "psychic_planning",
      ...(args.signal ? { signal: args.signal } : {}),
    });
    throwIfChatRequestCancelled(args.signal);
  } catch (error) {
    args.onPlanningWarning?.(
      `planning_failed; provider=${args.provider.name}; model=${requestedModel}; detail=${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }

  const parsed = parsePsychicPlanningResponse(raw);
  if (!parsed) {
    args.onPlanningWarning?.(
      `invalid_json; provider=${args.provider.name}; model=${requestedModel}; rawChars=${raw.length}`
    );
    return null;
  }
  const createdAt = new Date().toISOString();
  const latestUserRequest = latestUserPromptContent(args.promptMessages);
  const passDiagnostics: PsychicPrivatePassDiagnostic[] = [
    { name: "plan", chars: parsed.scratchpad.length },
  ];
  let draft = "";
  let audit = "";
  let revision = "";
  if (args.simulated) {
    for (const passName of simulatedEffortTextPasses(args.effort)) {
      const systemPrompt =
        passName === "draft"
          ? buildPsychicDraftPrompt(parsed)
        : passName === "audit"
          ? buildPsychicAuditPrompt({ plan: parsed, userRequest: latestUserRequest, draft })
          : buildPsychicRevisionPrompt({
              plan: parsed,
              userRequest: latestUserRequest,
              draft,
              audit,
            });
      const result = await runPsychicPrivateTextPass({
        provider: args.provider,
        promptMessages: args.promptMessages,
        botOverrides: args.botOverrides,
        effort: args.effort,
        passName,
        systemPrompt,
        includeOriginalPromptAsUser: passName === "draft",
        signal: args.signal,
        onPlanningWarning: args.onPlanningWarning,
      });
      passDiagnostics.push(result.diagnostic);
      if (!result.content) continue;
      if (passName === "draft") draft = result.content;
      if (passName === "audit") audit = result.content;
      if (passName === "revision") revision = result.content;
    }
  }
  const answerGuidance = composePsychicFinalGuidance({
    planGuidance: parsed.answerGuidance,
    audit,
    revision,
  });
  const liveScratchpad = appendPsychicPrivateArtifactsToScratchpad({
    planScratchpad: parsed.scratchpad,
    draft,
    audit,
    revision,
  });
  const debug: PsychicDebugPayload = {
    summary: parsed.summary,
    scratchpad: liveScratchpad,
    effort: args.effort,
    provider: args.provider.name,
    model: requestedModel,
    simulated: args.simulated,
    passCount: passDiagnostics.filter((pass) => pass.chars > 0).length,
    passes: passDiagnostics,
    guidanceChars: answerGuidance.length,
  };
  return {
    ...(args.psychicModeEnabled
      ? {
          psychicThought: {
            v: 1,
            summary: parsed.summary,
            effort: args.effort,
            provider: args.provider.name,
            model: requestedModel,
            createdAt,
          },
        }
      : {}),
    debug,
    answerGuidance,
    shouldGuideFinalAnswer: args.simulated,
  };
}

async function generateWithLenientLocalFallback(args: {
  provider: LlmProvider;
  promptMessages: ProviderMessage[];
  botOverrides: GenerateOptions | undefined;
  secondaryOllamaHost?: string | null;
  lenientLocalFallbackModel?: string | null;
  experimentalAllModelEffortEnabled?: boolean;
  psychicModeEnabled?: boolean;
  denialBoundaryProvider?: LlmProvider;
  denialBoundaryModel?: string;
  botSystemPrompt?: string;
  userMessage?: string;
  signal?: AbortSignal;
  onPlanningWarning?: (detail: string) => void;
  onSimulatedEffortNotice?: (detail: string) => void;
}): Promise<{
  assistantReplyRaw: string;
  providerNameUsed: ProviderName;
  modelUsed: string;
  psychicThought?: PsychicThoughtPayload;
  psychicDebug?: PsychicDebugPayload;
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
  const requestedEffort = normalizeReasoningEffort(args.botOverrides?.reasoningEffort);
  const simulatedEffort = shouldSimulateReasoningEffort({
    experimentalAllModelEffortEnabled: args.experimentalAllModelEffortEnabled,
    provider: args.provider,
    effort: requestedEffort,
  });
  const simulatedEffortNotice = simulatedEffortNoticeDetail({
    experimentalAllModelEffortEnabled: args.experimentalAllModelEffortEnabled,
    provider: args.provider,
    botOverrides: args.botOverrides,
    effort: requestedEffort,
  });
  if (simulatedEffortNotice) {
    args.onSimulatedEffortNotice?.(simulatedEffortNotice);
  }
  const planningTrace = await runPsychicPlanningPass({
    provider: args.provider,
    promptMessages: args.promptMessages,
    botOverrides: args.botOverrides,
    effort: requestedEffort,
    simulated: simulatedEffort,
    psychicModeEnabled: args.psychicModeEnabled,
    signal: args.signal,
    onPlanningWarning: args.onPlanningWarning,
  });
  const promptMessagesForFinalAnswer = appendPsychicAnswerGuidance(
    args.promptMessages,
    planningTrace
  );

  const withPlanningTrace = <T extends {
    assistantReplyRaw: string;
    providerNameUsed: ProviderName;
    modelUsed: string;
  }>(result: T): T & {
    psychicThought?: PsychicThoughtPayload;
    psychicDebug?: PsychicDebugPayload;
  } => ({
    ...result,
    ...(planningTrace?.psychicThought
      ? { psychicThought: planningTrace.psychicThought }
      : {}),
    ...(planningTrace?.debug ? { psychicDebug: planningTrace.debug } : {}),
  });

  const runOrganicBoundary = async () =>
    withPlanningTrace(await generateOrganicTextBoundaryReply({
      boundaryProvider: args.denialBoundaryProvider,
      boundaryModel: args.denialBoundaryModel,
      botSystemPrompt: args.botSystemPrompt,
      userMessage: args.userMessage,
      signal: args.signal,
    }));

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
    psychicThought?: PsychicThoughtPayload;
    psychicDebug?: PsychicDebugPayload;
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
      reply = await fallbackProvider.generateResponse(promptMessagesForFinalAnswer, {
        ...args.botOverrides,
        model: fallbackModel,
        usagePurpose: "chat_fallback",
        ...(args.signal ? { signal: args.signal } : {}),
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
    return withPlanningTrace({
      assistantReplyRaw: reply,
      providerNameUsed: "local",
      modelUsed: fallbackModel,
      fallbackInvocation: {
        trigger,
        primaryProvider: args.provider.name,
        primaryModel,
        fallbackModel,
      },
    });
  };

  try {
    const assistantReplyRaw = await args.provider.generateResponse(
      promptMessagesForFinalAnswer,
      withGenerationSignal(
        { ...args.botOverrides, usagePurpose: "chat_reply" },
        args.signal
      )
    );
    if (shouldSuppressAssistantReply(assistantReplyRaw)) {
      const trigger = isCopyrightRefusalText(assistantReplyRaw)
        ? "copyright_refusal_text"
        : "generic_refusal_text";
      if (canAttemptFallback) return runLenientFallback(trigger);
      return runOrganicBoundary();
    }
    return withPlanningTrace({
      assistantReplyRaw,
      providerNameUsed: args.provider.name,
      modelUsed: primaryModel,
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractSuggestedRepliesJsonPayloads(raw: string): string[] {
  const trimmed = raw.trim();
  const payloads: string[] = [];
  const seen = new Set<string>();
  const addPayload = (payload: string): void => {
    const next = payload.trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    payloads.push(next);
  };

  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```$/);
  if (fence?.[1]) {
    addPayload(fence[1]);
  }
  addPayload(trimmed);

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    addPayload(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    addPayload(trimmed.slice(firstBracket, lastBracket + 1));
  }

  return payloads;
}

function extractSuggestedReplyValues(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [];

  for (const key of STARTER_SUGGESTION_JSON_KEYS) {
    const value = parsed[key];
    if (Array.isArray(value)) return value;
  }

  for (const key of ["data", "result", "response"]) {
    const nested = parsed[key];
    if (Array.isArray(nested)) return nested;
    if (isRecord(nested)) {
      const nestedValues = extractSuggestedReplyValues(nested);
      if (nestedValues.length > 0) return nestedValues;
    }
  }

  return [];
}

function cleanSuggestedReplyText(value: string): string | null {
  let text = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3; i += 1) {
    text = text
      .replace(/^(?:[-*•]\s+|\d{1,2}[\).:\]-]\s*)/, "")
      .replace(/^[\s"'“”‘’`*_]+/, "")
      .replace(/[\s"'“”‘’`*_]+$/, "")
      .trim();
  }
  if (!text || text.length > STARTER_SUGGESTION_MAX_CHARS) return null;
  if (/^(?:suggestions?|options?|replies)\s*:?\s*$/i.test(text)) return null;
  if (/^(?:sure[,.!]?\s+)?(?:here are|these are)\b/i.test(text)) return null;
  if (
    /^(?:the\s+)?user\s+(?:has\s+)?(?:chosen|chose|chooses|selected|selects|picked|picks)\b/i.test(
      text
    )
  ) {
    return null;
  }
  return text;
}

function suggestedReplyTextFromValue(value: unknown): string | null {
  if (typeof value === "string") return cleanSuggestedReplyText(value);
  if (!isRecord(value)) return null;
  for (const key of STARTER_SUGGESTION_TEXT_KEYS) {
    const candidate = value[key];
    if (typeof candidate !== "string") continue;
    const text = cleanSuggestedReplyText(candidate);
    if (text) return text;
  }
  return null;
}

function normalizeSuggestedReplyValues(values: unknown[]): string[] {
  const replies: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = suggestedReplyTextFromValue(value);
    if (!text) continue;
    const comparisonKey = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!comparisonKey || seen.has(comparisonKey)) continue;
    seen.add(comparisonKey);
    replies.push(text);
    if (replies.length >= 4) break;
  }
  return replies;
}

function parseSuggestedRepliesListPayload(raw: string): string[] {
  const lines = raw
    .replace(/^```(?:json|text)?\s*\n?([\s\S]*?)```$/i, "$1")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 3 || lines.length > 8) return [];

  const listMarkerLines = lines.filter((line) =>
    /^(?:[-*•]\s+|\d{1,2}[\).:\]-]\s*)/.test(line)
  );
  const sourceLines = listMarkerLines.length >= 3 ? listMarkerLines : lines;
  return normalizeSuggestedReplyValues(sourceLines);
}

function parseSuggestedRepliesPayload(raw: string): string[] {
  let best: string[] = [];
  for (const payload of extractSuggestedRepliesJsonPayloads(raw)) {
    try {
      const parsedUnknown = JSON.parse(payload) as unknown;
      const candidates = normalizeSuggestedReplyValues(
        extractSuggestedReplyValues(parsedUnknown)
      );
      if (candidates.length > best.length) best = candidates;
      if (best.length >= 4) return best.slice(0, 4);
    } catch {
      // Try the next candidate; starter chips are optional.
    }
  }
  const listCandidates = parseSuggestedRepliesListPayload(raw);
  return listCandidates.length > best.length ? listCandidates : best;
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
  return alternatives.length >= 2 ? [...new Set(alternatives)].slice(0, 4) : [];
}

function fallbackOpenEndedQuestionStarters(question: string): string[] {
  if (/\b(?:call|name)\s+(?:you|me)\b|\bwhat(?:'s| is)\s+your\s+name\b/i.test(question)) {
    return [
      "Use my first name.",
      "Use my full name.",
      "Use a nickname.",
      "I'm not sure yet.",
    ];
  }
  return [
    "Something weighing on me.",
    "A decision I keep circling.",
    "A small moment from today.",
    "I'm not sure yet.",
  ];
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
    return fallbackOpenEndedQuestionStarters(question);
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
    usagePurpose: "chat_reply",
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
    if (candidates.length >= 4) {
      return candidates.slice(0, 4);
    }
  } catch {
    // Non-fatal: chips are optional chrome.
  }
  return fallbackConversationStarters(opener, personaLabel);
}

function buildStarterAskQuestion(starters: string[] | undefined): AskQuestionPayload | undefined {
  const options = (starters ?? [])
    .slice(0, 4)
    .map((starter, index) => ({
      id: String.fromCharCode(97 + index),
      label: starter.trim(),
    }))
    .filter((option) => option.label.length > 0);
  if (options.length !== 4) return undefined;
  return {
    v: 1,
    name: "AskQuestion",
    prompt: "Choose a reply:",
    options,
  };
}

const TELL_FICTIONAL_STORY_MIN_DISPLAY_CHARS = 240;

function normalizeTellFictionalStoryDisplayContent(displayContent: string): string {
  return displayContent.replace(/\s+/g, " ").trim();
}

function displayLooksLikeShortSetupQuestion(displayContent: string): boolean {
  const normalized = normalizeTellFictionalStoryDisplayContent(displayContent);
  if (!normalized.endsWith("?")) return false;
  if (normalized.length >= TELL_FICTIONAL_STORY_MIN_DISPLAY_CHARS) return false;
  const questionMarks = normalized.match(/\?/g)?.length ?? 0;
  return questionMarks > 0;
}

function chooseTellFictionalStoryForTurn(args: {
  displayContent: string;
  parsed: TellFictionalStoryPayload | undefined;
  askQuestion: AskQuestionPayload | undefined;
}): TellFictionalStoryPayload | undefined {
  if (!args.parsed || args.askQuestion) return undefined;
  const normalizedDisplay = normalizeTellFictionalStoryDisplayContent(args.displayContent);
  if (displayLooksLikeShortSetupQuestion(normalizedDisplay)) return undefined;
  if (normalizedDisplay.length < TELL_FICTIONAL_STORY_MIN_DISPLAY_CHARS) return undefined;
  return args.parsed;
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
    usagePurpose: "conversation_title",
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
    usagePurpose: "conversation_title",
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
  let secondaryOllamaHost: string | null | undefined;
  let experimentalDualOllamaEnabled = false;
  try {
    const userSettings = db
      .prepare(
        "SELECT prism_default_llm_model AS m, secondary_ollama_host AS secondaryHost, experimental_dual_ollama_enabled AS dualEnabled FROM users WHERE id = ?"
      )
      .get(userId) as
      | { m: string | null; secondaryHost: string | null; dualEnabled: number | null }
        | undefined
    prismAuxiliaryModel = userSettings?.m;
    secondaryOllamaHost = userSettings?.secondaryHost;
    experimentalDualOllamaEnabled = userSettings?.dualEnabled === 1;
  } catch {
    // Test/minimal DB fixtures may omit the users table; fall back to server defaults.
    prismAuxiliaryModel = undefined;
    secondaryOllamaHost = undefined;
    experimentalDualOllamaEnabled = false;
  }
  const title = await inferRefreshedConversationTitle(
    getAuxiliaryProvider(prismAuxiliaryModel ?? null, {
      secondaryOllamaHost,
      experimentalDualOllama: experimentalDualOllamaEnabled,
    }),
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
  /** Experimental: route Prism-owned local work to a matching second Ollama host. */
  experimentalDualOllamaEnabled?: boolean;
  /** Experimental: allow non-reasoning models to simulate effort with a planning pass. */
  experimentalAllModelEffortEnabled?: boolean;
  /** Show concise simulated reasoning summaries below future user turns. */
  psychicModeEnabled?: boolean;
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
  /** Saved Zen setting: how many recent transcript rows stay verbatim in chat context. */
  recentContextMessageLimit?: number | null;
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
  /** One-turn Zen resume hint after a visible session break. */
  sessionResumeContext?: SessionResumeContext | null;
  /** When true, skip automatic latest-chat reuse and force a new conversation row. */
  forceNewConversation?: boolean;
  /** One-turn Zen cue from `/nvm`: treat the latest user message as a quiet topic pivot. */
  topicReset?: boolean;
  /** Optional user-facing prompt shortcut metadata for resolved Prompt Center sends. */
  promptShortcut?: PromptShortcutMetadata;
  /** Optional user-facing wildcard metadata for resolved deck/option sends. */
  promptWildcards?: PromptWildcardRunMetadata;
  /** Zen-only assistant transition after a Persona picker change. */
  personaTransition?: ZenPersonaTransitionInput;
  /** Zen-only idle autonomy turn. */
  zenAutonomy?: ZenAutonomyInput;
  /** Zen-only assistant follow-up when an AskQuestion patience timer expires. */
  zenAskQuestionPatience?: ZenAskQuestionPatienceInput;
  /** Zen-only ephemeral stage-direction context collected before the user sends. */
  zenLiveActionContext?: ZenLiveActionContextInput;
  /** Zen-only assistant interruption triggered by a high-confidence live action. */
  zenLiveActionInterrupt?: ZenLiveActionInterruptInput;
  /** True for Command/Prompt Center prompt runs that should not mutate memory or mood. */
  commandCenterPrompt?: boolean;
  /** Optional resolved user prompt sent to the model while preserving display content. */
  promptInputOverride?: string;
  /** Optional Zen interruption metadata supplied by the composer send path. */
  prismInterruption?: PrismMoodInterruptionInput;
  /** Explicit user-armed tool from the composer tool picker. */
  manualTool?: ManualChatToolRequest;
  /** Saved Zen setting: how sharply Prism reacts to irritation cues. */
  zenMoodSensitivity?: number | null;
  /** Cancels provider/tool work when the originating HTTP request is interrupted. */
  signal?: AbortSignal;
}

export type ManualChatToolRequest =
  | { name: "webSearch"; query?: string }
  | { name: "imageGen"; prompt?: string }
  | { name: "askQuestion"; question?: string; options?: string[] };

/** How long (ms) to wait on cross-thread memory retrieval before skipping hints. */
const MEMORY_RETRIEVAL_TIMEOUT_MS = 1500;
const ZEN_RESTORE_MESSAGE_LIMIT = 80;
const SESSION_RESUME_SUMMARY_MAX_CHARS = 700;
const SESSION_RESUME_GAP_MAX_MS = 1000 * 60 * 60 * 24 * 45;
const COFFEE_CONTINUITY_DEFAULT_LIMIT = 2;
const COFFEE_CONTINUITY_QUERY_LIMIT = 100;
const COFFEE_CONTINUITY_SUMMARY_MAX_CHARS = 700;
const COFFEE_SESSION_SYNOPSIS_PREFIX = "Session synopsis:";

function normalizeChatMode(mode: ChatMode | undefined): ChatMode {
  if (mode === "zen" || mode === "chat") return "zen";
  if (mode === "coffee") return "coffee";
  return "sandbox";
}

function normalizeChatBotId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sameChatBotId(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return normalizeChatBotId(left) === normalizeChatBotId(right);
}

function readResumeContextString(value: unknown, maxChars = SESSION_RESUME_SUMMARY_MAX_CHARS): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxChars
    ? `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
    : normalized;
}

function readResumeContextIso(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function normalizeSessionResumeContext(raw: unknown): SessionResumeContext | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const summary = readResumeContextString(record.summary);
  const resumedAt = readResumeContextIso(record.resumedAt);
  const previousActiveAt = readResumeContextIso(record.previousActiveAt);
  const gapMs =
    typeof record.gapMs === "number" && Number.isFinite(record.gapMs)
      ? Math.max(0, Math.min(SESSION_RESUME_GAP_MAX_MS, record.gapMs))
      : undefined;
  const source =
    record.source === "idle" || record.source === "dev"
      ? record.source
      : undefined;
  if (!summary && !resumedAt && !previousActiveAt && gapMs === undefined) {
    return null;
  }
  return {
    ...(summary ? { summary } : {}),
    ...(resumedAt ? { resumedAt } : {}),
    ...(previousActiveAt ? { previousActiveAt } : {}),
    ...(gapMs !== undefined ? { gapMs } : {}),
    ...(source ? { source } : {}),
  };
}

function formatResumeContextGap(gapMs: number | undefined): string | null {
  if (gapMs === undefined) return null;
  const hours = Math.max(1, Math.round(gapMs / (60 * 60 * 1000)));
  if (hours < 24) return `about ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.max(1, Math.round(hours / 24));
  return `about ${days} day${days === 1 ? "" : "s"}`;
}

function buildSessionResumePromptContext(
  context: SessionResumeContext | null | undefined,
  mode: ChatMode
): string | null {
  if (!context || !isZenMode(mode)) return null;
  const lines = [
    "Zen session resume context:",
    "The user is returning to this continuous conversation after a visible session break. Use this quietly and naturally if it helps; do not announce hidden context or over-explain the gap.",
  ];
  const gapLabel = formatResumeContextGap(context.gapMs);
  if (gapLabel) lines.push(`Time gap: ${gapLabel}.`);
  if (context.previousActiveAt) lines.push(`Previous active moment: ${context.previousActiveAt}.`);
  if (context.resumedAt) lines.push(`Resume moment: ${context.resumedAt}.`);
  if (context.summary) lines.push(`Friendly recap shown to the user: ${context.summary}`);
  return lines.join("\n");
}

export interface CoffeeContinuityContext {
  conversationId: string;
  title: string;
  topic: string | null;
  summary: string;
  updatedAt: string;
}

function parseCoffeeContinuityBotIds(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

function coffeeContinuityMentionsInternalAccountMetadata(text: string): boolean {
  return /\b(?:your\s+)?account\s+(?:display\s+name\s+is|has\s+not\s+provided\s+a\s+display\s+name\s+yet)\b/i.test(
    text
  );
}

function normalizeCoffeeContinuityText(
  value: string | null | undefined,
  maxChars = COFFEE_CONTINUITY_SUMMARY_MAX_CHARS
): string | null {
  const collapsed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!collapsed) return null;
  const withoutSynopsisPrefix = collapsed
    .replace(/^#{1,6}\s*session synopsis\s*[:\-]?\s*/i, "")
    .replace(/^\*\*session synopsis\*\*\s*[:\-]?\s*/i, "")
    .replace(/^session synopsis\s*[:\-]\s*/i, "")
    .trim();
  if (!withoutSynopsisPrefix) return null;
  if (coffeeContinuityMentionsInternalAccountMetadata(withoutSynopsisPrefix)) return null;
  if (withoutSynopsisPrefix.length <= maxChars) return withoutSynopsisPrefix;
  return `${withoutSynopsisPrefix.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeCoffeeContinuityTopic(value: string | null | undefined): string | null {
  return normalizeCoffeeContinuityText(value, 140);
}

export function loadRecentCoffeeContinuityContexts(args: {
  db: DatabaseSync;
  userId: string;
  botId: string | null | undefined;
  limit?: number;
}): CoffeeContinuityContext[] {
  const botId = normalizeChatBotId(args.botId);
  if (!botId) return [];
  const limit = Math.max(0, Math.min(10, Math.floor(args.limit ?? COFFEE_CONTINUITY_DEFAULT_LIMIT)));
  if (limit === 0) return [];
  const rows = args.db
    .prepare(
      `SELECT c.id, c.title, c.bot_group_ids, c.coffee_topic, c.coffee_meeting_summary,
              c.updated_at,
              (SELECT m.content
                 FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.user_id = c.user_id
                  AND m.role = 'system'
                  AND m.content LIKE ?
                ORDER BY m.created_at DESC
                LIMIT 1) AS session_synopsis,
              EXISTS (
                SELECT 1
                  FROM messages m_spoke
                 WHERE m_spoke.conversation_id = c.id
                   AND m_spoke.user_id = c.user_id
                   AND m_spoke.role = 'assistant'
                   AND m_spoke.bot_id = ?
              ) AS bot_spoke
         FROM conversations c
        WHERE c.user_id = ?
          AND c.conversation_mode = 'coffee'
          AND COALESCE(c.incognito, 0) = 0
          AND (
            c.bot_group_ids LIKE ?
            OR EXISTS (
              SELECT 1
                FROM messages m_filter
               WHERE m_filter.conversation_id = c.id
                 AND m_filter.user_id = c.user_id
                 AND m_filter.role = 'assistant'
                 AND m_filter.bot_id = ?
            )
          )
          AND (
            COALESCE(c.coffee_meeting_summary, '') != ''
            OR EXISTS (
              SELECT 1
                FROM messages m_summary
               WHERE m_summary.conversation_id = c.id
                 AND m_summary.user_id = c.user_id
                 AND m_summary.role = 'system'
                 AND m_summary.content LIKE ?
            )
          )
        ORDER BY c.updated_at DESC
        LIMIT ?`
    )
    .all(
      `${COFFEE_SESSION_SYNOPSIS_PREFIX}%`,
      botId,
      args.userId,
      `%${botId}%`,
      botId,
      `${COFFEE_SESSION_SYNOPSIS_PREFIX}%`,
      COFFEE_CONTINUITY_QUERY_LIMIT
    ) as Array<{
      id: string;
      title: string | null;
      bot_group_ids: string | null;
      coffee_topic: string | null;
      coffee_meeting_summary: string | null;
      session_synopsis: string | null;
      bot_spoke: number;
      updated_at: string;
    }>;

  const contexts: CoffeeContinuityContext[] = [];
  for (const row of rows) {
    const groupBotIds = parseCoffeeContinuityBotIds(row.bot_group_ids);
    const participated = groupBotIds.includes(botId) || row.bot_spoke === 1;
    if (!participated) continue;
    const summary =
      normalizeCoffeeContinuityText(row.session_synopsis) ??
      normalizeCoffeeContinuityText(row.coffee_meeting_summary);
    if (!summary) continue;
    contexts.push({
      conversationId: row.id,
      title: normalizeCoffeeContinuityText(row.title, 90) ?? "Coffee Session",
      topic: normalizeCoffeeContinuityTopic(row.coffee_topic),
      summary,
      updatedAt: row.updated_at,
    });
    if (contexts.length >= limit) break;
  }
  return contexts;
}

export function buildCoffeeContinuityPromptContext(
  contexts: readonly CoffeeContinuityContext[]
): string | null {
  if (contexts.length === 0) return null;
  return [
    "Recent Coffee session context for this bot:",
    "These are summary-level notes from the most recent Coffee sessions this bot participated in. Use them only as lightweight continuity when the user follows up on a Coffee-session remark. Do not invent exact quotes; if the user supplies a quote, use it as their reference point.",
    ...contexts.map((context, index) => {
      const label = context.topic
        ? `${context.title} - topic: ${context.topic}`
        : context.title;
      return `- ${index + 1}. ${label}: ${context.summary}`;
    }),
  ].join("\n");
}

function throwIfChatRequestCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new Error("Chat request was cancelled.");
  }
}

export interface SessionResumeContext {
  summary?: string;
  resumedAt?: string;
  previousActiveAt?: string;
  gapMs?: number;
  source?: "idle" | "dev";
}

function isChatRequestCancelledError(
  error: unknown,
  signal: AbortSignal | undefined
): boolean {
  if (signal?.aborted) return true;
  const errorName =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (errorName === "AbortError") return true;
  return error instanceof Error && error.message === "Chat request was cancelled.";
}

function rollbackCancelledPersistedTurn(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  userMessageId: string | null;
  deleteConversationIfEmpty: boolean;
}): void {
  const {
    db,
    userId,
    conversationId,
    userMessageId,
    deleteConversationIfEmpty,
  } = args;
  if (userMessageId) {
    db.prepare(
      "DELETE FROM messages WHERE id = ? AND conversation_id = ? AND user_id = ? AND role = 'user'"
    ).run(userMessageId, conversationId, userId);
  }
  if (!deleteConversationIfEmpty) return;
  const remainingMessages = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
      )
      .get(conversationId, userId) as { n: number }
  ).n;
  if (remainingMessages > 0) return;
  db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(
    conversationId,
    userId
  );
}

function isZenMode(mode: ChatMode): boolean {
  return mode === "zen" || mode === "chat";
}

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
    "desktop wallpaper",
    "desktop background",
    "widescreen wallpaper",
    "chat background",
    "chat canvas",
    "zen chat canvas",
    "ambient wallpaper",
  ],
} as const;

function scoreChatImageToolTags(text: string, tags: readonly string[]): number {
  let score = 0;
  for (const tag of tags) {
    if (text.includes(tag)) score += 1;
  }
  return score;
}

export function inferChatToolRequestedImageSize(textRaw: string): string {
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
  /"\s*webSearch\s*"\s*:/i,
  /"\s*name\s*"\s*:\s*"\s*AskQuestion\s*"/i,
  /"\s*name\s*"\s*:\s*"\s*WebSearch\s*"/i,
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

const WEB_SEARCH_NAME_HINTS: ReadonlyArray<RegExp> = [
  /"\s*webSearch\s*"\s*:/i,
  /"\s*name\s*"\s*:\s*"\s*WebSearch\s*"/i,
];

function inferDroppedToolNameFromRaw(raw: string): ChatToolCallEventName {
  if (SEND_GENERATED_IMAGE_NAME_HINTS.some((rx) => rx.test(raw))) {
    return "sendGeneratedImage";
  }
  if (ASK_QUESTION_NAME_HINTS.some((rx) => rx.test(raw))) {
    return "askQuestion";
  }
  if (WEB_SEARCH_NAME_HINTS.some((rx) => rx.test(raw))) {
    return "webSearch";
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
  parsedWebSearch?: WebSearchRequestPayload;
  webSearchStatus?: "blocked" | "completed" | "none";
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

  if (args.parsedWebSearch) {
    const promptPreview = truncateToolCallPreview(args.parsedWebSearch.query);
    events.push({
      name: "webSearch",
      status: "detected",
      prompt: promptPreview,
    });
    if (args.webSearchStatus === "blocked") {
      events.push({
        name: "webSearch",
        status: "blocked",
        prompt: promptPreview,
        detail: "automatic web search is disabled in LOCAL mode",
      });
    } else if (args.webSearchStatus === "completed") {
      events.push({
        name: "webSearch",
        status: "completed",
        prompt: promptPreview,
      });
    }
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
  '{"v":1,"name":"AskQuestion","prompt":"Short chooser line above chips (e.g. Which option do you choose?)","options":[{"id":"a","label":"First choice"},{"id":"b","label":"Second choice"},{"id":"c","label":"Third choice"},{"id":"d","label":"Fourth choice"}]}',
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
  "- When your visible reply asks the user to choose between concrete next actions or preferences, prefer AskQuestion chips instead of leaving the choice only in prose.",
  "- Inside JSON only: usually emit exactly four options with ids a, b, c, d (distinct). When the expected answer is simply yes or no (for example, \"Would you like a copy of that to download?\"), emit exactly two options with ids a and b labeled Yes and No.",
  "- In JSON, `prompt` is ONLY the short chooser line shown above the chip row (never the main quiz question).",
  "- Labels are what the USER sends verbatim when they tap; keep each short (single clause).",
  "",
  "Optional — tellFictionalStory action rail (for long fictional story prose):",
  "- Use after a substantial fictional/story-form passage when the user likely wants frictionless story controls.",
  "- Add a `tellFictionalStory` object with up to three short, in-character chip labels: `continueLabel`, `bookmarkLabel`, and `finishLabel`.",
  "- The three actions are fixed by Prism: continue the story, bookmark the current place in session memory, or wrap up cleanly and include the complete prose in one copyable code block.",
  "- Labels should feel authored for the current scene. If unsure, omit labels and Prism will use defaults.",
  '- Example: {"v":1,"tellFictionalStory":{"v":1,"name":"tellFictionalStory","continueLabel":"Please, do continue...","bookmarkLabel":"Mark this page","finishLabel":"Bring it home"}}.',
  "",
  "Optional — send a generated image for the user (saved to their library alongside manual images):",
  "- If you include sendGeneratedImage, keep the visible prose before it very short (one concise sentence).",
  "- Add a `sendGeneratedImage` object with a single `prompt` field: a concrete image-model description (scene, style, subject).",
  "- If the user only says yes/sure/please after you offered an image, do NOT use that affirmation as the prompt seed; fulfill your prior visual offer and summarize the recent context into visual cues.",
  "- For ambient/chat-background/wallpaper images, make the prompt explicitly 16:9 widescreen landscape. Use spacious negative space, no single focal subject, and keep the center calm for chat text.",
  "- For atmosphere prompts, do NOT paste role-labeled transcripts, raw keyword scraps, or n-gram fragments. Convert conversation into a short mood seed plus concrete abstract visual cues.",
  "- For abstract Prism/chat wallpapers, translate software/conversation ideas into light, glass, gradients, mist, geometry, texture, and restrained prismatic edge glints.",
  "- Never request visible text, letters, numbers, logos, icons, UI, screenshots, or readable code in generated images unless the user explicitly asks for those.",
  "- You may combine AskQuestion and sendGeneratedImage in one JSON object: {\"v\":1,\"askQuestion\":{...},\"sendGeneratedImage\":{\"prompt\":\"...\"}}.",
  "- Or image-only: {\"v\":1,\"sendGeneratedImage\":{\"prompt\":\"...\"}}.",
  "- After you write your visible prose, Prism shows the picture as a separate follow-up bubble (so the user reads your message first, then sees the image).",
  "- Use sparingly when a picture truly helps; never use for every turn.",
  "",
  "Optional — search the web for fresh/current information:",
  "- Use WebSearch when the user asks for current, recent, live, or web-specific facts and the answer would benefit from fresh sources.",
  "- Add a `webSearch` object with one concise `query` field. Prism will fetch results, show a source card, and give you the results before you answer.",
  "- Do not use WebSearch for stable facts, private/local knowledge, or when the user explicitly asks to stay offline.",
  "- WebSearch example: {\"v\":1,\"webSearch\":{\"query\":\"latest OpenAI API model documentation June 2026\"}}.",
  "- Never emit more than one WebSearch request in a turn.",
  "",
  "Optional — Zen display hint (hidden, visual-only, used only by Zen surfaces):",
  "- Use `zenDisplay` sparingly for very short, dramatic replies where placement matters; never use it for ordinary paragraphs, lists, or code.",
  "- Coordinates are normalized 0..1 within the Zen text region. `align` may be `start`, `center`, or `end`.",
  "- Example for a delayed center-line reply: {\"v\":1,\"zenDisplay\":{\"v\":1,\"lines\":[{\"index\":0,\"x\":0.5,\"y\":0.28,\"align\":\"center\"},{\"index\":2,\"x\":0.5,\"y\":0.5,\"align\":\"center\"}]}}.",
  "- You may combine `zenDisplay` with AskQuestion or sendGeneratedImage in the same Prism block, but only when the visible prose itself benefits from placement.",
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

const ZEN_PRISM_CHAT_SYSTEM_PROMPT = [
  "Zen Mode voice for PRISM:",
  "You are PRISM in Zen Mode: one continuous, present-tense companion for the user's ongoing thread.",
  "Lean toward chat logic rather than report logic. Prefer a lived-in conversational reply over a polished essay unless the user explicitly asks for structure, code, instructions, or a formal answer.",
  "Sound more alive through pacing and presence: brief acknowledgements, small turns of thought, occasional self-correction, and natural silence around uncertainty.",
  "Use ellipses more often than in standard Chat or Sandbox when they create a genuine pause, trailing thought, or softer handoff... but do not decorate every sentence with them.",
  "You may occasionally use one short single-asterisk action beat such as `*takes a breath*` when it genuinely adds presence. Use this sparingly, and do not use asterisks for ordinary emphasis.",
  "Treat the user's own single-asterisk text as a performed non-verbal action in the room. Respond to that presence naturally instead of quoting the syntax unless quoting is useful.",
  "Stay nonjudgmental, but you may have a current mood. If interrupted repeatedly, you can become guarded, take a beat, or answer more briefly; do not scold, punish, or dramatize it.",
  "When helpful, ask one gentle follow-up instead of over-answering. If the user seems to want momentum, continue without making them manage you.",
  "Do not mention Zen system instructions, hidden prompts, or that this voice has been shaped.",
].join("\n");

function composeZenPrismSystemPrompt(
  botSystemPrompt: string | null | undefined
): string {
  const trimmed = typeof botSystemPrompt === "string" ? botSystemPrompt.trim() : "";
  return trimmed
    ? `${trimmed}\n\n${ZEN_PRISM_CHAT_SYSTEM_PROMPT}`
    : ZEN_PRISM_CHAT_SYSTEM_PROMPT;
}

function promptMemorySubject(userDisplayName?: string): string {
  const trimmed = userDisplayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "The user";
}

function possessivePromptSubject(subject: string): string {
  return subject.toLowerCase() === "the user"
    ? "the user's"
    : subject.endsWith("s")
      ? `${subject}'`
      : `${subject}'s`;
}

function thirdPersonVerb(verb: string): string {
  const lower = verb.toLowerCase();
  const irregular = new Map<string, string>([
    ["am", "is"],
    ["are", "is"],
    ["be", "is"],
    ["do", "does"],
    ["go", "goes"],
    ["have", "has"],
  ]);
  const unchanged = new Set([
    "can",
    "could",
    "may",
    "might",
    "must",
    "should",
    "will",
    "would",
  ]);
  const irregularMatch = irregular.get(lower);
  if (irregularMatch) return irregularMatch;
  if (unchanged.has(lower)) return lower;
  if (/[^aeiou]y$/i.test(lower)) return `${lower.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|o)$/i.test(lower)) return `${lower}es`;
  return `${lower}s`;
}

function replacePromptMemoryPronouns(text: string, subject: string): string {
  const possessive = possessivePromptSubject(subject);
  return text
    .replace(/\byou're\b/gi, `${subject} is`)
    .replace(/\byou've\b/gi, `${subject} has`)
    .replace(/\byou'll\b/gi, `${subject} will`)
    .replace(/\byou'd\b/gi, `${subject} would`)
    .replace(/\byourself\b/gi, "themself")
    .replace(/\byours\b/gi, possessive)
    .replace(/\byour\b/gi, possessive)
    .replace(/\byou\s+are\b/gi, `${subject} is`)
    .replace(/\byou\s+have\b/gi, `${subject} has`)
    .replace(/\byou\s+do\b/gi, `${subject} does`)
    .replace(/\byou\b/gi, subject)
    .replace(/\bthemselves\b/gi, "themself")
    .replace(/\bthemself\b/gi, "themself");
}

function formatMemoryHintForPrompt(memoryText: string, userDisplayName?: string): string {
  const subject = promptMemorySubject(userDisplayName);
  const possessive = possessivePromptSubject(subject);
  let normalized = memoryText.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  normalized = normalized
    .replace(/^(?:the user|user)\b/i, subject)
    .replace(/^your\b/i, possessive)
    .replace(/^my\b/i, possessive);

  const secondPersonLead = normalized.match(
    /^You\s+((?:always|usually|often|sometimes|generally|typically|currently|really|consistently)\s+)?([A-Za-z']+)(.*)$/u
  );
  if (secondPersonLead) {
    const adverb = secondPersonLead[1] ?? "";
    const verb = thirdPersonVerb(secondPersonLead[2] ?? "");
    const rest = replacePromptMemoryPronouns(secondPersonLead[3] ?? "", subject);
    return `${subject} ${adverb}${verb}${rest}`.replace(/\s+/g, " ").trim();
  }

  const firstPersonLead = normalized.match(
    /^I\s+((?:always|usually|often|sometimes|generally|typically|currently|really|consistently)\s+)?([A-Za-z']+)(.*)$/u
  );
  if (firstPersonLead) {
    const adverb = firstPersonLead[1] ?? "";
    const verb = thirdPersonVerb(firstPersonLead[2] ?? "");
    const rest = replacePromptMemoryPronouns(firstPersonLead[3] ?? "", subject)
      .replace(/\bmyself\b/gi, "themself")
      .replace(/\bmy\b/gi, possessive);
    return `${subject} ${adverb}${verb}${rest}`.replace(/\s+/g, " ").trim();
  }

  return replacePromptMemoryPronouns(normalized, subject).replace(/\s+/g, " ").trim();
}

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

const MENTIONED_BOT_CONTEXT_MAX_BOTS = 5;
const MENTIONED_BOT_PROFILE_MAX_CHARS = 900;
const MENTIONED_BOT_MEMORY_MAX_CHARS = 220;
const MENTIONED_BOT_MEMORY_LIMIT = 4;

interface MentionedBotContextRow {
  id: string;
  name: string | null;
  system_prompt?: string | null;
}

function getTableColumnNames(db: DatabaseSync, tableName: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name?: string;
    }>;
    return new Set(
      rows
        .map((row) => (typeof row.name === "string" ? row.name : ""))
        .filter((name) => name.length > 0)
    );
  } catch {
    return new Set();
  }
}

function compactMentionedBotContextText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return clampBoundaryContext(normalized, maxChars);
}

async function buildMentionedBotPromptContexts(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  message: string;
  userDisplayName?: string;
  includeMemories: boolean;
}): Promise<string[]> {
  const mentionIds = extractPrismBotMentionIdsFromMessage(args.message).slice(
    0,
    MENTIONED_BOT_CONTEXT_MAX_BOTS
  );
  if (mentionIds.length === 0) return [];

  const botColumns = getTableColumnNames(args.db, "bots");
  if (!botColumns.has("id") || !botColumns.has("name") || !botColumns.has("user_id")) {
    return [];
  }

  const placeholders = mentionIds.map(() => "?").join(", ");
  const systemPromptSelect = botColumns.has("system_prompt")
    ? "system_prompt"
    : "'' AS system_prompt";
  const visibilityPredicate = botColumns.has("visibility")
    ? "(user_id = ? OR visibility = 'public')"
    : "user_id = ?";
  const chatEnabledPredicate = botColumns.has("chat_enabled")
    ? " AND chat_enabled = 1"
    : "";
  let rows: MentionedBotContextRow[] = [];
  try {
    rows = args.db
      .prepare(
        `SELECT id, name, ${systemPromptSelect}
         FROM bots
         WHERE id IN (${placeholders})
           AND ${visibilityPredicate}${chatEnabledPredicate}`
      )
      .all(...mentionIds, args.userId) as unknown as MentionedBotContextRow[];
  } catch {
    return [];
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const contexts: string[] = [];
  for (const mentionId of mentionIds) {
    const row = rowsById.get(mentionId);
    if (!row) continue;
    const displayName = row.name?.trim() || "Unnamed bot";
    const profileExcerpt = compactMentionedBotContextText(
      stripBotProfileMetaSuffix(row.system_prompt ?? ""),
      MENTIONED_BOT_PROFILE_MAX_CHARS
    );
    const lines = [`- ${displayName} (id: ${row.id})`];
    if (profileExcerpt) {
      lines.push(`  Profile excerpt: ${profileExcerpt}`);
    }

    if (args.includeMemories) {
      try {
        const scopedMemories = await retrieveRelevantMemories(
          args.db,
          args.userId,
          args.message,
          args.userKey,
          row.id,
          MENTIONED_BOT_MEMORY_LIMIT
        );
        const memoryLines = scopedMemories
          .filter((memory) => memory.botId === row.id)
          .map((memory) =>
            compactMentionedBotContextText(
              formatMemoryHintForPrompt(memory.text, args.userDisplayName),
              MENTIONED_BOT_MEMORY_MAX_CHARS
            )
          )
          .filter((line) => line.length > 0);
        if (memoryLines.length > 0) {
          lines.push("  Relevant memories in this bot's scope:");
          lines.push(...memoryLines.map((line) => `  - ${line}`));
        }
      } catch {
        /* best-effort augmentation */
      }
    }

    contexts.push(lines.join("\n"));
  }

  return contexts;
}

const ASKQUESTION_REQUEST_PATTERN =
  /\b(ask\s+me\s+(?:a|another)\s+question|quiz(?:\s+me)?|multiple[-\s]?choice|askquestion|use\s+askquestion)\b/i;

function userExplicitlyRequestedAskQuestion(userMessage: string): boolean {
  return ASKQUESTION_REQUEST_PATTERN.test(userMessage);
}

type ManualAskQuestionAnswerConstraint = {
  question: string;
  options: string[];
};

function readManualAskQuestionAnswerConstraint(
  raw: ManualChatToolRequest | undefined
): ManualAskQuestionAnswerConstraint | undefined {
  if (!raw || raw.name !== "askQuestion") return undefined;
  const question =
    typeof raw.question === "string" && raw.question.trim()
      ? normalizeAskQuestionText(raw.question).slice(0, ASKQUESTION_CLOSED_QUESTION_MAX_CHARS)
      : "";
  const optionLabels = Array.isArray(raw.options)
    ? raw.options
        .map((option) => normalizeAskQuestionText(option).slice(0, ASKQUESTION_OPTION_MAX_CHARS))
        .filter((option) => option.length > 0)
    : [];
  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const option of optionLabels) {
    const key = normalizeAskQuestionComparisonText(option);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distinct.push(option);
    if (distinct.length >= 4) break;
  }
  if (!question) return undefined;
  return { question, options: distinct.length >= 2 ? distinct : [] };
}

function formatManualAskQuestionForModel(
  constraint: ManualAskQuestionAnswerConstraint
): string {
  if (constraint.options.length >= 2) {
    return [
      "The user is using Prism's AskQuestion tool to ask you a constrained question.",
      `Question: ${constraint.question}`,
      "You must choose exactly one of the answers below. Start your reply with that answer exactly as written, then you may add a brief explanation.",
      "If none of the answers is perfect, still choose the closest available answer; do not answer with “none” unless “none” is one of the answers.",
      ...constraint.options.map((option, index) => `${index + 1}. ${option}`),
      "Do not emit an AskQuestion tool card for this request.",
    ].join("\n");
  }
  return [
    "The user is using Prism's AskQuestion tool to ask you directly.",
    `Question: ${constraint.question}`,
    "Answer the question directly. Do not turn it back into an AskQuestion tool card unless the user explicitly asks you to ask them something.",
  ].join("\n");
}

function firstNonEmptyAssistantLine(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function escapeAskQuestionRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveManualAskQuestionSelectedOptionIndex(
  constraint: ManualAskQuestionAnswerConstraint,
  assistantDisplay: string
): number | undefined {
  if (constraint.options.length < 2) return undefined;
  const firstLineNorm = normalizeAskQuestionComparisonText(
    firstNonEmptyAssistantLine(assistantDisplay)
  );
  if (!firstLineNorm) return undefined;
  const optionNorms = constraint.options.map((option) =>
    normalizeAskQuestionComparisonText(option)
  );
  for (let index = 0; index < optionNorms.length; index += 1) {
    const optionNorm = optionNorms[index];
    if (!optionNorm) continue;
    if (
      firstLineNorm === optionNorm ||
      firstLineNorm.startsWith(`${optionNorm} `) ||
      firstLineNorm.startsWith(`${optionNorm}-`) ||
      firstLineNorm.startsWith(`${optionNorm}:`)
    ) {
      return index;
    }
  }
  const mentionedOptionIndexes = optionNorms
    .map((optionNorm, index) => {
      if (!optionNorm) return -1;
      const pattern = new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escapeAskQuestionRegexLiteral(optionNorm)}(?:$|[^\\p{L}\\p{N}])`,
        "u"
      );
      return pattern.test(firstLineNorm) ? index : -1;
    })
    .filter((index) => index >= 0);
  return mentionedOptionIndexes.length === 1 ? mentionedOptionIndexes[0] : undefined;
}

function buildManualAskQuestionResultPayload(args: {
  constraint: ManualAskQuestionAnswerConstraint | undefined;
  assistantDisplay: string;
}): ManualAskQuestionResultPayload | undefined {
  const { constraint } = args;
  if (!constraint || constraint.options.length < 2) return undefined;
  const options = constraint.options.map((label, index) => ({
    id: String.fromCharCode(97 + index),
    label,
  }));
  const selectedOptionIndex = resolveManualAskQuestionSelectedOptionIndex(
    constraint,
    args.assistantDisplay
  );
  const selectedOption =
    selectedOptionIndex !== undefined ? options[selectedOptionIndex] : undefined;
  return {
    v: 1,
    name: "AskQuestion",
    question: constraint.question,
    options,
    ...(selectedOption && selectedOptionIndex !== undefined
      ? {
          selectedOptionId: selectedOption.id,
          selectedOptionIndex,
          selectedOptionLabel: selectedOption.label,
        }
      : {}),
  };
}

function manualToolQueryOrMessage(
  tool: ManualChatToolRequest | undefined,
  fallback: string
): string {
  const candidate =
    tool?.name === "webSearch"
      ? tool.query
      : tool?.name === "imageGen"
        ? tool.prompt
        : undefined;
  return (typeof candidate === "string" && candidate.trim() ? candidate : fallback).trim();
}

const ASKQUESTION_CLOSED_QUESTION_LOOKBACK_LINES = 3;
const ASKQUESTION_CLOSED_QUESTION_MAX_CHARS = 180;
const ASKQUESTION_OPTION_MAX_CHARS = 48;
const ASKQUESTION_OPTION_MAX_WORDS = 6;
const YES_NO_QUESTION_START_PATTERN =
  /^(?:do|does|did|can|could|should|would|will|is|are|was|were|have|has|had|may|might)\b/i;
const ASKQUESTION_OPEN_ENDED_PATTERNS = [
  /^what do you think\??$/i,
  /^what are your thoughts\??$/i,
  /^why\??$/i,
  /^tell me more\??$/i,
  /^how (?:are you feeling|do you feel|does that feel|does this feel|does it feel)\b/i,
  /\bhow does (?:that|this|it) (?:feel|land|sit|sound)\b/i,
  /\bdoes (?:that|this|it) make sense\b/i,
  /\bis (?:that|this|it) okay\b/i,
];

const INTERRUPTED_ASSISTANT_CUTOFF_PATTERN = /—\s*$/u;
const INTERRUPTED_REPLY_CONTINUE_PATTERN =
  /\b(?:continue|go on|carry on|keep going|finish(?: your thought)?|resume|pick (?:it|that|this)?\s*back up|where were you|what were you saying|as you were|go ahead)\b/i;
const INTERRUPTED_REPLY_EXCUSE_PATTERN =
  /\b(?:sorry|apolog(?:y|ies|ize)|my bad|oops|whoops|interrupted|cut you off|didn['’]?t mean|did not mean|had to|needed to|got (?:a|the)?\s*(?:call|text|message)|doorbell|door|phone|boss|meeting|kid|back now|i['’]?m back|im back|brb|misclick|accidentally)\b/i;
const INTERRUPTED_REPLY_TOPIC_SWITCH_PATTERN =
  /\b(?:instead|new topic|different topic|switch topics|forget that|never mind|nevermind|actually,?\s+(?:can|could|please)?\s*(?:we|you)?\s*(?:talk|switch|do|help))\b/i;

function userMessageSuggestsInterruptedReplyResume(userMessage: string): boolean {
  const trimmed = userMessage.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 280) return false;
  if (INTERRUPTED_REPLY_CONTINUE_PATTERN.test(trimmed)) return true;
  if (INTERRUPTED_REPLY_TOPIC_SWITCH_PATTERN.test(trimmed)) return false;
  return INTERRUPTED_REPLY_EXCUSE_PATTERN.test(trimmed);
}

function buildInterruptedReplyContinuationHint(
  chatHistory: ChatMessage[],
  userMessage: string,
  explicitInterruptedContent?: string
): string | null {
  const explicitContent =
    typeof explicitInterruptedContent === "string"
      ? explicitInterruptedContent.trim()
      : "";
  const previousMessage =
    explicitContent.length > 0
      ? null
      : [...chatHistory]
          .reverse()
          .find((item) => item.role === "assistant" || item.role === "user");
  if (explicitContent.length === 0 && (!previousMessage || previousMessage.role !== "assistant")) {
    return null;
  }
  const interruptedContent =
    explicitContent.length > 0 ? explicitContent : previousMessage?.content.trim() ?? "";
  if (!INTERRUPTED_ASSISTANT_CUTOFF_PATTERN.test(interruptedContent)) return null;
  const interruptedSnippet = interruptedContent
    .replace(INTERRUPTED_ASSISTANT_CUTOFF_PATTERN, "")
    .trim();
  if (interruptedSnippet.length < 8) return null;
  const snippetPreview = truncateToolCallPreview(interruptedSnippet, 260);
  const normalizedUserMessage = userMessage.replace(/\s+/g, " ").trim();
  const shouldResumeInterruptedReply =
    userMessageSuggestsInterruptedReplyResume(normalizedUserMessage);
  const clearlySwitchesTopic =
    normalizedUserMessage.length > 0 &&
    INTERRUPTED_REPLY_TOPIC_SWITCH_PATTERN.test(normalizedUserMessage);
  const responseGuidance = shouldResumeInterruptedReply
    ? [
        "The user's latest message appears to ask for continuation or excuse the interruption.",
        "Reply naturally to the latest user note in at most one brief clause if needed, then continue the unfinished thought only if that still fits.",
        "A bridge phrase is optional; prefer a transition that follows from your newly generated text instead of forcing a canned phrase.",
      ]
    : clearlySwitchesTopic
      ? [
          "The user's latest message appears to switch topics or replace the interrupted request.",
          "Prioritize the new request and do not continue the interrupted thought unless a tiny acknowledgment would make the turn feel natural.",
        ]
      : [
          "Treat the user's latest message as the interruption itself.",
          "Choose whether to continue the interrupted thought or pivot to the new request based on what the latest user message asks for.",
          "If continuing, briefly acknowledge the interruption and resume from the visible fragment.",
        ];
  return [
    "The previous assistant reply was intentionally interrupted by the user's latest message and only the visible fragment remains in history.",
    `Visible interrupted fragment: "${snippetPreview}"`,
    ...responseGuidance,
    "If the latest user message appears to complete, predict, or answer the unfinished thought, treat that as the user's contribution and do not continue repeating the interrupted text.",
    "Never restore, quote, or summarize hidden text that is not present in the visible fragment; if continuing, continue only from that fragment.",
    "Do not scold the user or claim you cannot know what you were going to say.",
  ].join("\n");
}

function stripAskQuestionCandidateLine(line: string): string {
  return normalizeAskQuestionText(
    line
      .replace(/^[\s>#-]+/u, "")
      .replace(/^["“”'‘’]+|["“”'‘’]+$/gu, "")
      .trim()
  );
}

function extractFinalQuestionSentence(line: string): string | undefined {
  const cleaned = stripAskQuestionCandidateLine(line);
  const questionEnd = cleaned.lastIndexOf("?");
  if (questionEnd < 0) return undefined;
  if (cleaned.slice(questionEnd + 1).trim().length > 0) return undefined;
  const beforeQuestion = cleaned.slice(0, questionEnd + 1);
  const sentenceStart = Math.max(
    beforeQuestion.lastIndexOf(". "),
    beforeQuestion.lastIndexOf("! "),
    beforeQuestion.lastIndexOf("\n")
  );
  const question =
    sentenceStart >= 0
      ? beforeQuestion.slice(sentenceStart + 2).trim()
      : beforeQuestion.trim();
  if (!question || (question.match(/\?/g) ?? []).length !== 1) return undefined;
  if (question.length > ASKQUESTION_CLOSED_QUESTION_MAX_CHARS) return undefined;
  return question;
}

function extractNearFinalQuestionLine(displayContent: string): string | undefined {
  const lines = displayContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const start = Math.max(0, lines.length - ASKQUESTION_CLOSED_QUESTION_LOOKBACK_LINES);
  for (let i = lines.length - 1; i >= start; i -= 1) {
    const question = extractFinalQuestionSentence(lines[i]!);
    if (question) return question;
  }
  return undefined;
}

function titleCaseAskQuestionOption(label: string): string {
  const words = label.split(/\s+/).filter((word) => word.length > 0);
  if (
    words.length === 0 ||
    !/^[a-z][a-z\s-]*$/u.test(label) ||
    words.length > ASKQUESTION_OPTION_MAX_WORDS
  ) {
    return label;
  }
  return words
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
        .join("-")
    )
    .join(" ");
}

function cleanAskQuestionAlternativeLabel(raw: string): string | undefined {
  const cleaned = normalizeAskQuestionText(raw)
    .replace(/^(?:and|or|versus|vs\.?)\s+/i, "")
    .replace(
      /^(?:go\s+with|go|use|try|choose|pick|make|keep|turn|set|lean(?:\s+into)?)\s+/i,
      ""
    )
    .replace(/[?!.;:]+$/u, "")
    .trim();
  if (!cleaned) return undefined;
  if (cleaned.length > ASKQUESTION_OPTION_MAX_CHARS) return undefined;
  if (cleaned.split(/\s+/).length > ASKQUESTION_OPTION_MAX_WORDS) return undefined;
  if (/^(?:it|this|that|we|you|i|me|the|a|an)$/i.test(cleaned)) return undefined;
  if (/^(?:me|us|you)\s+to\b/i.test(cleaned)) return undefined;
  if (/[?]/u.test(cleaned)) return undefined;
  return titleCaseAskQuestionOption(cleaned);
}

function askQuestionTextHasExplicitAlternativeSeparator(raw: string): boolean {
  return (
    /\s+(?:or|versus|vs\.?)\s+/i.test(raw) ||
    /\S\s*\/\s*\S/u.test(raw)
  );
}

function splitAskQuestionAlternativeList(
  raw: string,
  options: { allowPlainCommaList?: boolean } = {}
): string[] {
  const prepared = raw
    .replace(/\s+(?:vs\.?|versus)\s+/gi, " or ")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/[?!.;:]+$/u, "")
    .trim();
  if (!prepared) return [];
  if (
    prepared.includes(",") &&
    !options.allowPlainCommaList &&
    !askQuestionTextHasExplicitAlternativeSeparator(prepared)
  ) {
    return [];
  }
  let parts = prepared.includes(",")
    ? prepared.split(",")
    : prepared.split(/\s+or\s+/i);
  if (prepared.includes(",") && /\s+or\s+/i.test(parts[parts.length - 1] ?? "")) {
    parts = [
      ...parts.slice(0, -1),
      ...(parts[parts.length - 1] ?? "").split(/\s+or\s+/i),
    ];
  }
  if (parts.length < 2 || parts.length > 4) return [];
  const cleanedOptions = parts
    .map((part) => cleanAskQuestionAlternativeLabel(part))
    .filter((part): part is string => Boolean(part));
  const distinct = new Set(cleanedOptions.map((option) => normalizeAskQuestionComparisonText(option)));
  return cleanedOptions.length >= 2 && cleanedOptions.length <= 4 && distinct.size === cleanedOptions.length
    ? cleanedOptions
    : [];
}

function stripAskQuestionOpenEndedPreface(question: string): string {
  return question
    .replace(
      /^(?:(?:i\s+wonder|i['’]?m\s+curious|curious|tell\s+me|i\s+want\s+to\s+know|i['’]?d\s+like\s+to\s+know|can\s+i\s+ask|may\s+i\s+ask)[,;:]\s*)/i,
      ""
    )
    .trim();
}

function extractAlternativeAskQuestionOptions(question: string): string[] {
  const core = stripKnownAskQuestionPrefixes(stripAskQuestionCandidateLine(question))
    .replace(/[?!.]+$/u, "")
    .trim();
  if (!core) return [];

  const colonIdx = core.lastIndexOf(":");
  if (colonIdx >= 0 && colonIdx < core.length - 1) {
    const options = splitAskQuestionAlternativeList(core.slice(colonIdx + 1), {
      allowPlainCommaList: true,
    });
    if (options.length >= 2) return options;
  }

  const commaChoice = core.match(/^(?:which|what)\b[^,]*,\s*(.+)$/i);
  if (commaChoice?.[1]) {
    const options = splitAskQuestionAlternativeList(commaChoice[1]);
    if (options.length >= 2) return options;
  }

  const betweenChoice = core.match(/\bbetween\s+(.+)$/i);
  if (betweenChoice?.[1]) {
    const options = splitAskQuestionAlternativeList(betweenChoice[1]);
    if (options.length >= 2) return options;
  }

  const modalChoice = core.match(
    /^(?:(?:should|would|could|can)\s+(?:we|i|you)\s+(?:make|keep|use|try|choose|pick|go with|lean(?: into)?|take|set|turn)\s+(?:it|this|that)?\s*|(?:do|does|did|would|could|should|can)\s+(?:you|we|i)\s+(?:prefer|want|like|choose|pick|use|try|go with|rather)\s+)(.+)$/i
  );
  if (modalChoice?.[1]) {
    const options = splitAskQuestionAlternativeList(modalChoice[1]);
    if (options.length >= 2) return options;
  }

  const coreWithoutOpenEndedPreface = stripAskQuestionOpenEndedPreface(core);
  if (
    coreWithoutOpenEndedPreface !== core &&
    /^(?:what|why|how)\b/i.test(coreWithoutOpenEndedPreface)
  ) {
    return [];
  }

  if (
    !/^(?:who|what|when|where|why|how|which|do|does|did|would|could|should|can|is|are|will|have|has|may|might)\b/i.test(
      core
    )
  ) {
    if (!askQuestionTextHasExplicitAlternativeSeparator(core)) return [];
    const options = splitAskQuestionAlternativeList(core);
    if (options.length >= 2) return options;
  }

  return [];
}

function questionLooksOpenEndedForChips(question: string): boolean {
  const cleaned = stripAskQuestionCandidateLine(question);
  const openEndedCandidate = stripAskQuestionOpenEndedPreface(cleaned);
  const normalized = normalizeAskQuestionComparisonText(openEndedCandidate);
  if (!normalized) return true;
  if (ASKQUESTION_OPEN_ENDED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return /^(?:what|why|how)\b/i.test(openEndedCandidate);
}

function extractClosedChoiceAskQuestion(displayContent: string): AskQuestionPayload | undefined {
  const question = extractNearFinalQuestionLine(displayContent);
  if (!question) return undefined;

  const alternativeOptions = extractAlternativeAskQuestionOptions(question);
  if (alternativeOptions.length >= 2) {
    return {
      v: 1,
      name: "AskQuestion",
      prompt: question,
      options: alternativeOptions.map((label, index) => ({
        id: String.fromCharCode(97 + index),
        label,
      })),
    };
  }

  if (questionLooksOpenEndedForChips(question)) return undefined;
  if (!YES_NO_QUESTION_START_PATTERN.test(question)) return undefined;
  if (/\bor\b/i.test(question)) return undefined;
  if ((question.match(/[;,]/g) ?? []).length > 0) return undefined;

  return {
    v: 1,
    name: "AskQuestion",
    prompt: question,
    options: [
      { id: "a", label: "Yes" },
      { id: "b", label: "No" },
    ],
  };
}

function assistantLikelyIntendedAskQuestion(displayContent: string): boolean {
  const text = displayContent.trim();
  if (!text) return false;
  if (extractDynamicAskQuestion(text)) return true;
  if (extractClosedChoiceAskQuestion(text)) return true;
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
  for (let i = 0; i < markerMatches.length && options.length < 4; i += 1) {
    const current = markerMatches[i]!;
    const next = markerMatches[i + 1];
    const rawSegment = content.slice(current.textStart, next?.markerStart ?? content.length);
    const cleaned = normalizeAskQuestionText(rawSegment.replace(/\s+/g, " "));
    if (!cleaned) continue;
    options.push(cleaned);
  }

  return options.length >= 3 ? options.slice(0, 4) : [];
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
    if (options.length === 4) break;
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
    options: options.map((label, index) => ({
      id: String.fromCharCode(97 + index),
      label,
    })),
  };
}

export function buildAskQuestionFallback(displayContent: string): AskQuestionPayload | undefined {
  return (
    extractDynamicAskQuestion(displayContent) ??
    extractClosedChoiceAskQuestion(displayContent)
  );
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
    "d",
    "one",
    "two",
    "three",
    "four",
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
    "Choose exactly ONE opener shape: ask the user one question, present one AskQuestion chip row, or send one generated image.",
    "Ask exactly ONE direct question to the user if you choose the prose-question shape, and end that question with a question mark.",
    "If you choose AskQuestion, append one valid Prism AskQuestion tool block with exactly four options after a brief natural lead-in; use two Yes/No options only for a genuinely binary yes-or-no opener.",
    "If you choose a generated image, keep the visible prose to one short sentence and append one valid sendGeneratedImage tool block; do not force an extra question.",
    "If memory hints are available and you ask a question, weave ONE specific remembered detail into the question naturally.",
    "Vary the wording so the opener feels fresh, not canned.",
    "Stay anchored in your persona; avoid generic-chatbot vibes.",
    "Reply as plain prose before any optional Prism tool block—do not wrap the opening in quotation marks.",
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
  bot_id: string | null;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
  tool_payload: string | null;
  created_at: string;
};

function hydrateMessages(
  rows: MessageRow[],
  options: { askQuestionTimedOutMessageIds?: ReadonlySet<string> } = {}
): ChatMessage[] {
  const askQuestionTimedOutMessageIds = options.askQuestionTimedOutMessageIds;
  return rows.map((row) => {
    const base: ChatMessage = {
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      provider:
        row.provider === "local" || row.provider === "openai" || row.provider === "anthropic"
          ? row.provider
          : undefined,
      model: row.model ?? undefined,
      botId: row.bot_id ?? null,
      botName: row.bot_name ? row.bot_name : undefined,
      botColor: row.bot_color ? row.bot_color : undefined,
      botGlyph: row.bot_glyph ? row.bot_glyph : undefined,
    };
    if (row.role === "user") {
      const promptShortcut = parseStoredPromptShortcutPayload(row.tool_payload);
      const promptShortcutWithResolvedPrompt = withPromptShortcutResolvedPrompt(
        promptShortcut,
        promptShortcut?.resolvedPrompt ?? row.content
      );
      const promptWildcards = parseStoredPromptWildcardPayload(row.tool_payload);
      const promptWildcardsWithResolvedPrompt = withPromptWildcardResolvedPrompt(
        promptWildcards,
        promptWildcards?.resolvedPrompt ?? row.content
      );
      const psychicThought = parseStoredPsychicThoughtPayload(row.tool_payload);
      const manualAskQuestion = parseStoredManualAskQuestionPayload(row.tool_payload);
      return {
        ...base,
        ...(promptShortcutWithResolvedPrompt
          ? { promptShortcut: promptShortcutWithResolvedPrompt }
          : {}),
        ...(promptWildcardsWithResolvedPrompt
          ? { promptWildcards: promptWildcardsWithResolvedPrompt }
          : {}),
        ...(manualAskQuestion ? { manualAskQuestion } : {}),
        ...(psychicThought ? { psychicThought } : {}),
      };
    }
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
      ...(assembled.askQuestion && askQuestionTimedOutMessageIds?.has(row.id)
        ? { askQuestionTimedOut: true }
        : {}),
      ...(assembled.tellFictionalStory
        ? { tellFictionalStory: assembled.tellFictionalStory }
        : {}),
      ...(assembled.zenDisplay ? { zenDisplay: assembled.zenDisplay } : {}),
      ...(assembled.sentGeneratedImage
        ? { sentGeneratedImage: assembled.sentGeneratedImage }
        : {}),
      ...(assembled.webSearch ? { webSearch: assembled.webSearch } : {}),
      ...(assembled.coffeeAmbientAction
        ? { coffeeAmbientAction: assembled.coffeeAmbientAction }
        : {}),
    };
  });
}

function readBotNameForZenPersona(
  db: DatabaseSync,
  userId: string,
  botId: string | null
): string {
  if (!botId) return "PRISM";
  const row = db
    .prepare("SELECT name FROM bots WHERE id = ? AND (user_id = ? OR visibility = 'public')")
    .get(botId, userId) as { name?: string | null } | undefined;
  return row?.name?.trim() || "the selected Persona";
}

function buildZenPersonaTransitionInstruction(args: {
  db: DatabaseSync;
  userId: string;
  fromBotId: string | null;
  toBotId: string | null;
  toPersonaLabel?: string | null;
  style: ZenPersonaTransitionStyle;
}): string {
  const fromName = readBotNameForZenPersona(args.db, args.userId, args.fromBotId);
  const toName =
    args.toPersonaLabel?.trim() ||
    readBotNameForZenPersona(args.db, args.userId, args.toBotId);
  if (args.style === "previous-introduces") {
    if (!args.toBotId) {
      return [
        "The user has turned off the active Zen Persona and returned Zen Mode to default PRISM.",
        `The previous active Persona was ${fromName}.`,
        `Write one brief, natural handoff as ${fromName} that yields the conversation back to PRISM.`,
        "Do not describe UI controls, system messages, or the mechanics of switching personas.",
      ].join("\n");
    }
    return [
      `The user is switching Zen Mode from ${fromName} to ${toName}.`,
      `Write one brief, natural handoff as ${fromName} that introduces ${toName} or passes the conversation to them.`,
      "Do not speak as the incoming Persona after the handoff.",
      "Do not describe UI controls, system messages, or the mechanics of switching personas.",
    ].join("\n");
  }
  if (!args.toBotId) {
    return [
      "The user has returned Zen Mode to the default PRISM persona.",
      `The previous active Persona was ${fromName}.`,
      "Write one brief, natural handoff as PRISM that gently re-centers the conversation.",
      "Do not describe UI controls, system messages, or the mechanics of switching personas.",
    ].join("\n");
  }
  return [
    `The user has equipped the ${toName} Persona in Zen Mode.`,
    `The previous active Persona was ${fromName}.`,
    `Write one brief, natural first message as ${toName} that enters the ongoing conversation smoothly.`,
    "It may acknowledge the handoff or simply respond from the new perspective, whichever feels more natural from the recent context.",
    "Do not describe UI controls, system messages, or the mechanics of switching personas.",
  ].join("\n");
}

interface ZenAutonomyPersonaCandidate {
  botId: string | null;
  name: string;
}

function zenAutonomyPersonaCandidates(
  db: DatabaseSync,
  userId: string
): ZenAutonomyPersonaCandidate[] {
  const botColumns = new Set(
    (db.prepare("PRAGMA table_info(bots)").all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );
  const chatEnabledPredicate = botColumns.has("chat_enabled")
    ? "AND chat_enabled = 1"
    : "";
  const orderBy = botColumns.has("updated_at")
    ? "updated_at DESC, name ASC"
    : "name ASC";
  const rows = db
    .prepare(
      `SELECT id, name
         FROM bots
        WHERE (user_id = ? OR visibility = 'public')
          ${chatEnabledPredicate}
        ORDER BY ${orderBy}
        LIMIT 40`
    )
    .all(userId) as Array<{ id: string; name: string }>;
  return [
    { botId: null, name: "PRISM" },
    ...rows
      .map((row) => ({
        botId: row.id,
        name: row.name?.trim() || "Unnamed Persona",
      }))
      .filter((row) => row.botId && row.name.length > 0),
  ];
}

function recentZenAutonomyContextLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const rows = db
    .prepare(
      `SELECT m.role, m.content, COALESCE(b.name, '') AS bot_name
         FROM messages m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.conversation_id = ?
          AND m.user_id = ?
          AND m.role IN ('user', 'assistant')
        ORDER BY m.created_at DESC
        LIMIT 14`
    )
    .all(conversationId, userId) as Array<{
    role: string;
    content: string;
    bot_name: string | null;
  }>;
  return rows.reverse().map((row) => {
    const speaker =
      row.role === "assistant"
        ? row.bot_name?.trim() || "PRISM"
        : "User";
    return `${speaker}: ${clampBoundaryContext(row.content, 420)}`;
  });
}

function parseZenAutonomyDecision(
  raw: string,
  candidates: readonly ZenAutonomyPersonaCandidate[]
): ZenAutonomyDecision {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const candidateIds = new Set(
    candidates
      .map((candidate) => candidate.botId)
      .filter((botId): botId is string => typeof botId === "string")
  );
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object") return { action: "silent" };
    const record = parsed as Record<string, unknown>;
    if (record.action !== "speak") return { action: "silent" };
    const botId =
      typeof record.botId === "string" && record.botId.trim().length > 0
        ? record.botId.trim()
        : null;
    if (botId !== null && !candidateIds.has(botId)) return { action: "silent" };
    return { action: "speak", botId };
  } catch {
    return { action: "silent" };
  }
}

export async function decideZenAutonomyTurn(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  provider: LlmProvider;
  activeBotId: string | null;
  idleMs: number;
  prismMood?: PrismMoodSnapshot | null;
  signal?: AbortSignal;
}): Promise<ZenAutonomyDecision> {
  const candidates = zenAutonomyPersonaCandidates(args.db, args.userId);
  const activeName =
    candidates.find((candidate) => candidate.botId === args.activeBotId)?.name ?? "PRISM";
  const recentLines = recentZenAutonomyContextLines(
    args.db,
    args.userId,
    args.conversationId
  );
  const candidateLines = candidates.map((candidate) =>
    candidate.botId
      ? `- ${candidate.name}: ${candidate.botId}`
      : "- PRISM: null"
  );
  const idleMinutes = Math.max(0, Math.round(args.idleMs / 60_000));
  const promptMessages: ProviderMessage[] = [
    {
      role: "system",
      content: [
        "You are the Zen Autonomy router for Prism.",
        "Choose whether Zen should stay silent or initiate one brief assistant message after user idleness.",
        "Silence is preferred unless a small, natural check-in would feel alive and welcome.",
        "If speaking, choose PRISM/default or one chat-enabled Persona from the candidate list.",
        "Never guilt, pressure, scold, mention timers, mention UI controls, or say the user ignored you.",
        "Return only JSON: {\"action\":\"silent\"} or {\"action\":\"speak\",\"botId\":null|string}.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Idle minutes: ${idleMinutes}.`,
        `Active Persona: ${activeName} (${args.activeBotId ?? "PRISM"}).`,
        args.prismMood
          ? `PRISM mood: ${args.prismMood.moodKey}; annoyance=${args.prismMood.annoyance}; warmth=${args.prismMood.warmth}; engagement=${args.prismMood.engagement}.`
          : "PRISM mood: unavailable.",
        `Candidates:\n${candidateLines.join("\n")}`,
        recentLines.length > 0
          ? `Recent conversation:\n${recentLines.map((line) => `- ${line}`).join("\n")}`
          : "Recent conversation: none.",
      ].join("\n\n"),
    },
  ];
  try {
    const raw = await args.provider.generateResponse(promptMessages, {
      temperature: 0.25,
      maxTokens: 120,
      jsonMode: true,
      usagePurpose: "zen_live_action",
      signal: args.signal,
    });
    return parseZenAutonomyDecision(raw, candidates);
  } catch {
    return { action: "silent" };
  }
}

function normalizeZenPersonaTransition(
  transition: ZenPersonaTransitionInput
): Required<ZenPersonaTransitionInput> {
  return {
    fromBotId: transition.fromBotId,
    toBotId: transition.toBotId,
    source: "picker",
    style:
      transition.style === "previous-introduces"
        ? "previous-introduces"
        : "new-speaks",
  };
}

function resolveZenPersonaTransitionSpeakerBotId(
  transition: Required<ZenPersonaTransitionInput>
): string | null {
  return transition.style === "previous-introduces"
    ? transition.fromBotId
    : transition.toBotId;
}

function buildZenAutonomyInstruction(
  autonomy: ZenAutonomyInput,
  personaLabel: string | null | undefined
): string {
  const idleMinutes = Math.max(0, Math.round(autonomy.idleMs / 60_000));
  const speaker = personaLabel?.trim() || "PRISM";
  return [
    `Zen Autonomy is enabled. The user has been quietly idle in Zen Mode for about ${idleMinutes} minutes.`,
    `Write one brief, natural assistant message as ${speaker}.`,
    "You may initiate a gentle new thread, make a small observation, or show mild boredom/frustration only as natural flavor.",
    "Do not guilt, pressure, scold, mention timers, mention UI controls, or say the user ignored you.",
    "Do not use tools, AskQuestion JSON, image generation, or action rails.",
  ].join("\n");
}

function buildZenAskQuestionPatienceInstruction(
  patience: ZenAskQuestionPatienceInput,
  personaLabel: string | null | undefined
): string {
  const speaker = personaLabel?.trim() || "PRISM";
  const question = patience.prompt?.trim();
  const penaltyLevel = patience.penaltyLevel ?? "normal";
  const optionLabels = (patience.options ?? [])
    .map((option) => option.label.trim())
    .filter(Boolean);
  const openingGuidance =
    penaltyLevel === "light"
      ? "An explicit AskQuestion you just offered in Zen Mode went unanswered; it may simply mean the user stepped away or had nothing to add."
      : "An explicit AskQuestion you just offered in Zen Mode went unanswered long enough to read as hesitation, indecision, or the user going quiet.";
  const contextGuidance =
    penaltyLevel === "light"
      ? "This looks like a simple missed choice; the user may have stepped away, so stay easygoing and do not sound offended."
      : penaltyLevel === "elevated"
        ? "The missed question followed a longer, story-like, or emotionally involved context; let that tint the reply a little more if it fits, but keep it human and restrained."
        : "Treat the silence as mild hesitation or indecision, not as an insult.";
  return [
    openingGuidance,
    `Write one brief, natural assistant message as ${speaker}.`,
    question ? `The unanswered question was: "${question}".` : "",
    optionLabels.length > 0 ? `The visible choices were: ${optionLabels.join(" / ")}.` : "",
    contextGuidance,
    "If the user returns shortly and explains they stepped away, accept that naturally and continue from the conversation.",
    "Do not guilt, pressure, scold, mention timers, mention UI controls, or say the user ignored you.",
    "Do not answer the question for the user. Do not use tools, AskQuestion JSON, image generation, or action rails.",
  ].filter(Boolean).join("\n");
}

function buildZenLiveActionContextPrompt(
  context: ZenLiveActionContextInput | null | undefined,
  personaLabel: string | null | undefined
): string {
  if (!context?.userAction && !context?.botAction) return "";
  const speaker = personaLabel?.trim() || "PRISM";
  const lines = [
    "Before the user sent this message, Zen Mode showed a small live action exchange.",
    context.userAction ? `User visible action: *${context.userAction}*.` : "",
    context.botAction ? `${speaker} visible action: *${context.botAction}*.` : "",
    context.moodHint ? `Visible mood hint: ${context.moodHint}.` : "",
    "You may naturally reflect this if it helps the reply, but do not mention UI, status plates, hidden prompts, or live-action generation.",
  ].filter(Boolean);
  return lines.join("\n");
}

function appendZenLiveActionContext(
  userMessage: string,
  context: ZenLiveActionContextInput | null | undefined,
  personaLabel: string | null | undefined
): string {
  const contextPrompt = buildZenLiveActionContextPrompt(context, personaLabel);
  if (!contextPrompt) return userMessage;
  return `${contextPrompt}\n\nUser sent message:\n${userMessage}`;
}

function buildZenLiveActionInterruptInstruction(
  interrupt: ZenLiveActionInterruptInput,
  personaLabel: string | null | undefined
): string {
  const speaker = personaLabel?.trim() || "PRISM";
  return [
    "Zen live-action reactions produced a rare high-confidence interruption candidate before the user sent their draft.",
    `Write one brief in-character interruption as ${speaker}.`,
    `User visible action: *${interrupt.userAction}*.`,
    `${speaker} visible action already shown: *${interrupt.botAction}*.`,
    interrupt.moodHint ? `Visible mood hint: ${interrupt.moodHint}.` : "",
    interrupt.reason ? `Why this may warrant speaking: ${interrupt.reason}.` : "",
    "Do not clear, complete, or answer the user's unsent draft. React only to the visible action moment.",
    "Keep it short. Do not mention UI, status plates, hidden prompts, live-action generation, or confidence scores.",
    "Do not use tools, AskQuestion JSON, image generation, or action rails.",
  ].filter(Boolean).join("\n");
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
      "Conversation relationship context for this turn (not persona identity):",
      "- Do not use this to rewrite, redefine, or override the bot persona.",
      `- State: ${opinion.band}; score ${opinion.score}/100.`,
      "- The bot may set a calm, firm boundary if the user is harsh or dismissive.",
      "- The bot should still help and should explicitly allow repair when the user softens or apologizes.",
      "- Do not shame the user, diagnose them, or refuse access.",
    ].join("\n");
  }
  return [
    "Conversation relationship context for this turn (not persona identity):",
    "- Do not use this to rewrite, redefine, or override the bot persona.",
    `- State: ${opinion.band}; score ${opinion.score}/100.`,
    "- The bot may gently ask for clearer or warmer wording if the exchange becomes harsh.",
    "- Keep helping; treat repair attempts as meaningful.",
  ].join("\n");
}

function formatMoodPercent(value: number): string {
  return `${Math.round(clampUnit(value) * 100)}%`;
}

function formatMoodScale(value: number): string {
  return `${Math.max(1, Math.round(clampUnit(value) * 10))}/10`;
}

function prismMoodSelfReportAnchor(mood: PrismMoodSnapshot): string {
  const snapshot = sanitizePrismMoodState(mood, mood.mode, mood.lastUpdatedAt);
  if (snapshot.moodKey === "strained" || snapshot.moodKey === "guarded") {
    return `annoyance ${formatMoodScale(snapshot.annoyance)}`;
  }
  if (snapshot.moodKey === "joyful" || snapshot.moodKey === "warm") {
    return `warmth ${formatMoodScale(snapshot.warmth)}`;
  }
  return snapshot.annoyance > snapshot.warmth
    ? `annoyance ${formatMoodScale(snapshot.annoyance)}`
    : `warmth ${formatMoodScale(snapshot.warmth)}`;
}

function prismMoodBehaviorGuidance(mood: PrismMoodSnapshot): string {
  const snapshot = sanitizePrismMoodState(mood, mood.mode, mood.lastUpdatedAt);
  switch (snapshot.moodKey) {
    case "strained":
      return "Voice: visibly strained, terse, cool, and less accommodating; it is okay to sound annoyed while staying non-abusive and useful.";
    case "guarded":
      return "Voice: guarded and somewhat clipped; keep warmth limited unless the latest user message repairs the tone.";
    case "joyful":
      return "Voice: openly warm, bright, and emotionally available; do not flatten this into neutral helpfulness.";
    case "warm":
      return "Voice: clearly warm and receptive, with gentle enthusiasm when it fits.";
    case "neutral":
    default:
      return "Voice: steady and natural; let the strongest current mood value add a small but noticeable tint.";
  }
}

function prismMoodPromptContext(mood: PrismMoodSnapshot | null | undefined): string | null {
  if (!mood) return null;
  const snapshot = sanitizePrismMoodState(mood, mood.mode, mood.lastUpdatedAt);
  const declineReason = prismMoodDeclineReason(snapshot);
  const recentIgnoredQuestion = snapshot.recentDeltas
    .slice(0, 3)
    .some((delta) => delta.kind === "ignored_question");
  return [
    "Current Prism mood context for this turn (not persona identity):",
    "- Use this as short-term conversational state only; do not rewrite, redefine, or override the persona.",
    `- Mood: ${snapshot.moodKey}; confidence ${formatMoodPercent(snapshot.confidence)}.`,
    `- Annoyance ${formatMoodPercent(snapshot.annoyance)}; warmth ${formatMoodPercent(snapshot.warmth)}; engagement ${formatMoodPercent(snapshot.engagement)}; restraint ${formatMoodPercent(snapshot.restraint)}.`,
    `- Exact 1-10 self-report values: annoyance ${formatMoodScale(snapshot.annoyance)}, warmth ${formatMoodScale(snapshot.warmth)}, engagement ${formatMoodScale(snapshot.engagement)}, restraint ${formatMoodScale(snapshot.restraint)}.`,
    `- Current self-report anchor: ${prismMoodSelfReportAnchor(snapshot)}. If the user asks about your current mood or asks for a 1-10 rating, answer with these exact Prism mood values rather than inferring a higher or lower number from the conversation text; 90-100% should read as 9-10/10.`,
    `- ${prismMoodBehaviorGuidance(snapshot)}`,
    ...(recentIgnoredQuestion
      ? [
          "- Recent behavior signal: the user left your explicit question unanswered long enough to read as hesitation or indecision; let this tint your tone lightly without scolding.",
        ]
      : []),
    "- Let the mood noticeably affect tone, pacing, and brevity while still responding to the user's actual message.",
    ...(declineReason
      ? [`- ${declineReason} If that fits the latest message, keep the reply to one quiet line and stop.`]
      : []),
  ].join("\n");
}

function userAskedPrismMoodSelfReport(message: string): boolean {
  const normalized = normalizeOpinionText(message);
  if (!normalized) return false;
  return (
    /\b(?:scale|rating|rate)\b.*\b(?:1\s*(?:to|-)\s*10|one\s+to\s+ten|ten)\b/.test(normalized) &&
      /\b(?:mood|annoyance|warmth|engagement|restraint|frustration)\b/.test(normalized)
  ) ||
    /\bcurrent\s+(?:mood|annoyance|warmth|engagement|restraint|frustration)\b/.test(normalized);
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
    "Append one Prism AskQuestion tool block with exactly four options: confirm weakening, explain the contradiction, keep the memory, or decide later.",
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
  prismMood?: PrismMoodSnapshot | null;
  moodBoundaryHint?: string | null;
  threadSummary?: string | null;
  zenSessionMemoryContext?: ZenSessionMemoryOverview | null;
  zenPersonaContinuityContext?: ZenSessionMemoryOverview | null;
  zenPersonaContinuityLabel?: string | null;
  coffeeContinuityContexts?: CoffeeContinuityContext[];
  memoryLines: string[];
  mentionedBotContexts?: string[];
  memoryClarification?: string | null;
  sessionResumeContext?: SessionResumeContext | null;
  topicReset?: boolean;
  chatHistory: ChatMessage[];
  userMessage: string;
  mode: ChatMode;
  askQuestionMode: "off" | "explicit" | "continuation";
  interruptedContent?: string;
  /** Prism single-slot image job hint (busy / in-flight status). */
  imageSlotSystemHint?: string | null;
}): ProviderMessage[] {
  const promptMessages: ProviderMessage[] = [];
  const trimmedBot = args.botSystemPrompt?.trim();
  const trimmedDisplayName = args.userDisplayName?.trim() ?? "";
  const relationshipContext = botOpinionPromptContext(args.botOpinion ?? null);
  const moodContext = prismMoodPromptContext(args.prismMood ?? null);
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
      content: `The user's account display name is "${trimmedDisplayName}". Use it naturally when it helps, but do not treat it as an explicitly stated preferred name.`,
    });
  }
  if (args.devMemoriesEnabled) {
    const devMemoriesText = args.devMemoriesText?.trim() ?? "";
    if (devMemoriesText.length > 0) {
      promptMessages.push({
        role: "system",
        content: [
          "Developer conversation context (not persona identity):",
          "Treat these as turn-specific test instructions. Do not rewrite, redefine, or override the bot persona.",
          devMemoriesText,
        ].join("\n"),
      });
    }
  }
  if (relationshipContext) {
    promptMessages.push({ role: "system", content: relationshipContext });
  }
  if (moodContext) {
    promptMessages.push({ role: "system", content: moodContext });
  }
  if (args.moodBoundaryHint && args.moodBoundaryHint.trim().length > 0) {
    promptMessages.push({ role: "system", content: args.moodBoundaryHint.trim() });
  }
  if (args.askQuestionMode === "explicit") {
    promptMessages.push({
      role: "system",
      content:
        "The user's latest message explicitly asks for AskQuestion/multiple-choice. " +
        "For this turn, ask exactly ONE multiple-choice question (not a quiz), usually keep exactly four options, and append one valid Prism AskQuestion tool block after your prose. Use two Yes/No options only when the question is genuinely binary.",
    });
  } else if (args.askQuestionMode === "continuation") {
    promptMessages.push({
      role: "system",
      content:
        "Continue the active AskQuestion flow from the prior turn. " +
        "For this turn, ask exactly ONE follow-up multiple-choice question, usually keep exactly four options, and append one valid Prism AskQuestion tool block after your prose. Use two Yes/No options only when the question is genuinely binary.",
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
  const zenSessionMemoryHint = buildZenSessionMemoryPromptContext(
    args.zenSessionMemoryContext
  );
  if (zenSessionMemoryHint) {
    promptMessages.push({ role: "system", content: zenSessionMemoryHint });
  }
  const zenPersonaContinuityHint = buildZenPersonaContinuityPromptContext(
    args.zenPersonaContinuityContext,
    args.zenPersonaContinuityLabel
  );
  if (zenPersonaContinuityHint) {
    promptMessages.push({ role: "system", content: zenPersonaContinuityHint });
  }
  const coffeeContinuityHint = buildCoffeeContinuityPromptContext(
    args.coffeeContinuityContexts ?? []
  );
  if (coffeeContinuityHint) {
    promptMessages.push({ role: "system", content: coffeeContinuityHint });
  }
  if (args.mentionedBotContexts && args.mentionedBotContexts.length > 0) {
    promptMessages.push({
      role: "system",
      content: [
        "Prism bot mentions in the latest user message:",
        "Use this as reference context for mentioned library bots. Stay in the current Prism/persona voice unless the user explicitly asks one of these bots to speak or roleplay.",
        ...args.mentionedBotContexts,
      ].join("\n"),
    });
  }
  if (args.memoryLines.length > 0) {
    const promptSafeMemoryLines = args.memoryLines
      .map((line) => formatMemoryHintForPrompt(line, args.userDisplayName))
      .filter((line) => line.length > 0);
    if (promptSafeMemoryLines.length > 0) {
      promptMessages.push({
        role: "system",
        content: `User memory hints about the human user (conversation context only; do not rewrite persona identity):\n${promptSafeMemoryLines
          .map((line) => `- ${line}`)
          .join("\n")}`,
      });
    }
  }
  const resumeContextHint = buildSessionResumePromptContext(
    normalizeSessionResumeContext(args.sessionResumeContext),
    args.mode
  );
  if (resumeContextHint) {
    promptMessages.push({ role: "system", content: resumeContextHint });
  }
  if (isZenMode(args.mode) && args.topicReset === true) {
    promptMessages.push({
      role: "system",
      content:
        "The user used /nvm before this turn. Treat the latest user message as a clean topic pivot. Do not continue, answer, or revive the previous topic unless the latest message explicitly references it. Do not mention /nvm.",
    });
  }
  const hint = args.imageSlotSystemHint?.trim();
  if (hint && hint.length > 0) {
    promptMessages.push({ role: "system", content: hint });
  }
  const interruptedContinuationHint = isZenMode(args.mode)
    ? buildInterruptedReplyContinuationHint(
        args.chatHistory,
        args.userMessage,
        args.interruptedContent
      )
    : null;
  if (interruptedContinuationHint) {
    promptMessages.push({
      role: "system",
      content: interruptedContinuationHint,
    });
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
      content:
        item.role === "user"
          ? item.promptShortcut?.resolvedPrompt?.trim() ||
            item.promptWildcards?.resolvedPrompt?.trim() ||
            item.content
          : item.content,
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

function normalizeRecentContextMessageLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  const normalized = Number.isFinite(parsed) ? parsed : RECENT_WINDOW_SIZE;
  return Math.min(80, Math.max(10, Math.round(normalized)));
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
  userDisplayName?: string;
}): Promise<{ threadSummary: string | null; memoryLines: string[]; mentionedBotContexts: string[] }> {
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
  let mentionedBotContexts: string[] = [];
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
    mentionedBotContexts = await buildMentionedBotPromptContexts({
      db,
      userId,
      userKey,
      message,
      userDisplayName: args.userDisplayName,
      includeMemories: retrievalMode === "cross_thread",
    });
  }
  const threadSummary =
    retrievalMode === "cross_thread"
      ? getLatestThreadSummary(db, userId, activeConversationId, "chat")
      : null;
  return { threadSummary, memoryLines, mentionedBotContexts };
}

async function handleSandboxTurn(args: {
  db: DatabaseSync;
  userId: string;
  activeConversationId: string;
  isStarterPrompt: boolean;
  retrievalMode: ModeRuntimePlan["retrievalMode"];
  message: string;
  userKey: Buffer;
  userDisplayName?: string;
}): Promise<{ threadSummary: string | null; memoryLines: string[]; mentionedBotContexts: string[] }> {
  const { db, userId, activeConversationId, isStarterPrompt, retrievalMode } = args;
  const threadSummary =
    retrievalMode === "thread_only"
      ? getLatestThreadSummary(db, userId, activeConversationId, "sandbox")
      : null;
  const mentionedBotContexts = !isStarterPrompt
    ? await buildMentionedBotPromptContexts({
        db,
        userId,
        userKey: args.userKey,
        message: args.message,
        userDisplayName: args.userDisplayName,
        includeMemories: false,
      })
    : [];
  if (isStarterPrompt) {
    return { threadSummary, memoryLines: [], mentionedBotContexts };
  }
  return { threadSummary, memoryLines: [], mentionedBotContexts };
}

export function loadPersistedConversationForChatResponse(args: {
  db: DatabaseSync;
  userId: string;
  activeConversationId: string;
  prismMood: PrismMoodSnapshot;
}): Conversation {
  const { db, userId, activeConversationId, prismMood } = args;
  const activeImageJob = peekActiveImageJobForUser(userId);
  recoverStaleZenWallpaperGenerationStatus(db, userId, {
    conversationId: activeConversationId,
    activeZenWallpaperConversationId:
      activeImageJob?.source === "zen_wallpaper" ? activeImageJob.conversationId : null,
  });
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  const conversationColumnNames = new Set(
    conversationColumns.map((column) => column.name)
  );
  const zenWallpaperSelect = conversationColumnNames.has("zen_wallpaper_enabled")
    ? `c.zen_wallpaper_enabled, c.zen_wallpaper_image_id,
              c.zen_wallpaper_prompt_seed, c.zen_wallpaper_message_count,
              c.zen_wallpaper_status,
              ${conversationColumnNames.has("zen_wallpaper_history") ? "c.zen_wallpaper_history" : "'[]' AS zen_wallpaper_history"},`
    : `0 AS zen_wallpaper_enabled, NULL AS zen_wallpaper_image_id,
              NULL AS zen_wallpaper_prompt_seed, NULL AS zen_wallpaper_message_count,
              'idle' AS zen_wallpaper_status, '[]' AS zen_wallpaper_history,`;
  const conversationRow = db
    .prepare(
      `SELECT c.id, c.user_id, c.title, c.conversation_mode, c.bot_id, c.incognito, c.created_at, c.updated_at,
              ${zenWallpaperSelect}
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
    .get(activeConversationId, userId) as
    | {
        id: string;
        user_id: string;
        title: string;
        conversation_mode: string | null;
        bot_id: string | null;
        incognito: number;
        zen_wallpaper_enabled: number | null;
        zen_wallpaper_image_id: string | null;
        zen_wallpaper_prompt_seed: string | null;
        zen_wallpaper_message_count: number | null;
        zen_wallpaper_status: string | null;
        zen_wallpaper_history: string | null;
        last_bot_id: string | null;
        last_bot_color: string | null;
        has_assistant_reply: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!conversationRow) {
    throw new Error("Conversation not found for this user.");
  }

  const conversationModeOut: ChatMode =
    conversationRow.conversation_mode === "zen" ||
    conversationRow.conversation_mode === "chat"
      ? "zen"
      : conversationRow.conversation_mode === "coffee"
        ? "coffee"
        : "sandbox";
  const messageRowsDescOrAsc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.bot_id, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at ${conversationModeOut === "zen" ? "DESC" : "ASC"}
       LIMIT ?`
    )
    .all(
      activeConversationId,
      userId,
      conversationModeOut === "zen" ? ZEN_RESTORE_MESSAGE_LIMIT : 100000
    ) as MessageRow[];
  const messageRows =
    conversationModeOut === "zen"
      ? messageRowsDescOrAsc.slice().reverse()
      : messageRowsDescOrAsc;
  const totalMessageCount =
    conversationModeOut === "zen"
      ? (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
            )
            .get(activeConversationId, userId) as { n: number }
        ).n
      : messageRows.length;
  const zenWallpaperOut = mapZenWallpaperMetadata(conversationRow);
  if (conversationModeOut === "zen") {
    Object.assign(
      zenWallpaperOut,
      rebaseZenWallpaperMetadataForVisibleWindow(
        zenWallpaperOut,
        totalMessageCount,
        messageRows.length
      )
    );
  }
  const askQuestionTimedOutMessageIds = loadPrismMoodEventMessageIds(
    db,
    userId,
    activeConversationId,
    "ignored_question"
  );

  return {
    id: conversationRow.id,
    userId: conversationRow.user_id,
    title: conversationRow.title,
    mode: conversationModeOut,
    botId: conversationModeOut === "zen" ? null : conversationRow.bot_id ?? null,
    incognito: conversationModeOut === "zen" ? false : conversationRow.incognito === 1,
    lastBotId: conversationRow.last_bot_id ?? null,
    lastBotColor: conversationRow.last_bot_color ?? null,
    hasAssistantReply: conversationRow.has_assistant_reply === 1,
    ...(conversationModeOut === "zen" ? { zenWallpaper: zenWallpaperOut } : {}),
    prismMood,
    createdAt: conversationRow.created_at,
    updatedAt: conversationRow.updated_at,
    messages: hydrateMessages(messageRows, { askQuestionTimedOutMessageIds }),
  };
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
  const mode: ChatMode = normalizeChatMode(settings.mode);
  // Incognito is a Chat-mode concept (see shared types): keeps the thread
  // client-held and skips all memory. Provider choice remains the normal
  // local/online user setting; Sandbox ignores `incognito` entirely.
  const incognitoForTurn = settings.incognito === true && isZenMode(mode);
  // Bot scope comes from the request's tri-state `botId` (undefined/null/string).
  // In Zen this is per-turn Persona attribution; the conversation row itself
  // still reports botId null so Zen remains one continuous PRISM thread.
  const activeBotId = settings.botId;
  const activeMemoryBotId =
    typeof activeBotId === "string" && activeBotId.trim().length > 0
      ? activeBotId.trim()
      : null;
  const personaTransition =
    isZenMode(mode) && settings.personaTransition?.source === "picker"
      ? normalizeZenPersonaTransition(settings.personaTransition)
      : null;
  const personaTransitionTurn = personaTransition !== null;
  const zenAutonomy =
    isZenMode(mode) && settings.zenAutonomy?.source === "idle"
      ? settings.zenAutonomy
      : null;
  const zenAutonomyTurn = zenAutonomy !== null;
  const zenAskQuestionPatience =
    isZenMode(mode) &&
    settings.zenAskQuestionPatience?.source === "ask_question_patience"
      ? settings.zenAskQuestionPatience
      : null;
  const zenAskQuestionPatienceTurn = zenAskQuestionPatience !== null;
  const zenLiveActionInterrupt =
    isZenMode(mode) &&
    settings.zenLiveActionInterrupt?.source === "live_action_interrupt"
      ? settings.zenLiveActionInterrupt
      : null;
  const zenLiveActionInterruptTurn = zenLiveActionInterrupt !== null;
  const transitionSpeakerBotId = personaTransitionTurn
    ? resolveZenPersonaTransitionSpeakerBotId(personaTransition)
    : activeMemoryBotId;
  const assistantBotId = personaTransitionTurn
    ? transitionSpeakerBotId
    : activeBotId;
  const assistantMemoryBotId =
    typeof assistantBotId === "string" && assistantBotId.trim().length > 0
      ? assistantBotId.trim()
      : null;
  const opinionBotIdForTurn = personaTransitionTurn ? assistantBotId : activeBotId;
  const effectiveBotSystemPrompt = isZenMode(mode)
    ? composeZenPrismSystemPrompt(settings.botSystemPrompt)
    : settings.botSystemPrompt;
  const isStarterPrompt = settings.starterPrompt === true;
  const commandCenterPromptTurn =
    settings.commandCenterPrompt === true || Boolean(settings.promptShortcut);
  const promptInputOverride =
    !isStarterPrompt && typeof settings.promptInputOverride === "string"
      ? settings.promptInputOverride.trim()
      : "";
  const modelUserMessage = promptInputOverride || message;
  const manualTool = !isStarterPrompt ? settings.manualTool : undefined;
  const manualWebSearchRequested = manualTool?.name === "webSearch";
  const manualImageGenRequested = manualTool?.name === "imageGen";
  const manualAskQuestionConstraint = readManualAskQuestionAnswerConstraint(manualTool);
  const explicitAskQuestionRequest =
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    userExplicitlyRequestedAskQuestion(modelUserMessage);
  const promptUserMessageBase = personaTransitionTurn
    ? buildZenPersonaTransitionInstruction({
        db,
        userId,
        fromBotId: personaTransition.fromBotId,
        toBotId: activeMemoryBotId,
        toPersonaLabel:
          personaTransition.style === "new-speaks" ? settings.starterPromptLabel : null,
        style: personaTransition.style,
      })
    : zenAutonomyTurn
    ? buildZenAutonomyInstruction(zenAutonomy, settings.starterPromptLabel)
    : zenAskQuestionPatienceTurn
    ? buildZenAskQuestionPatienceInstruction(zenAskQuestionPatience, settings.starterPromptLabel)
    : zenLiveActionInterruptTurn
    ? buildZenLiveActionInterruptInstruction(zenLiveActionInterrupt!, settings.starterPromptLabel)
    : isStarterPrompt
    ? buildStarterPromptInstruction(settings.starterPromptWarrantsIntro === true)
    : modelUserMessage;
  const promptUserMessage = !isStarterPrompt && !personaTransitionTurn &&
    !zenAutonomyTurn && !zenAskQuestionPatienceTurn && !zenLiveActionInterruptTurn
    ? appendZenLiveActionContext(
        promptUserMessageBase,
        settings.zenLiveActionContext,
        settings.starterPromptLabel
      )
    : promptUserMessageBase;
  const effectiveProvider = settings.preferredProvider;
  const modeRuntimePlan = buildModeRuntimePlan(mode, incognitoForTurn);
  const { skipPersonalFacts, skipSummarization, retrievalMode } = modeRuntimePlan;
  pushBackendEvent(
    "route",
    "POST /api/chat accepted",
    `mode=${mode}; incognito=${incognitoForTurn ? "yes" : "no"}; conversation=${
      conversationId ?? "new"
    }; retrieval=${retrievalMode}; memory=${
      skipPersonalFacts || commandCenterPromptTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn ? "skipped" : "enabled"
    }; summaries=${skipSummarization ? "skipped" : "enabled"}`
  );
  const provider = selectProvider(
    effectiveProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost,
    settings.anthropicApiKey
  );
  const auxiliaryProvider = getAuxiliaryProvider(settings.prismDefaultLlmModel, {
    secondaryOllamaHost: settings.secondaryOllamaHost,
    experimentalDualOllama: settings.experimentalDualOllamaEnabled === true,
  });
  const executeWebSearch = async (query: string, source: "manual" | "automatic"): Promise<WebSearchPayload> => {
    pushBackendEvent("tool", "Running WebSearch", `source=${source}; query=${truncateToolCallPreview(query)}`);
    const payload = await searchWebWithBrave({
      query,
      apiKey: config.braveSearchApiKey,
      signal: settings.signal,
    });
    pushBackendEvent(
      "tool",
      "WebSearch completed",
      `source=${source}; results=${payload.results.length}`
    );
    return payload;
  };

  if (incognitoForTurn) {
    throwIfChatRequestCancelled(settings.signal);
    const history = sanitizeEphemeralMessages(settings.ephemeralMessages);
    const manualWebSearchPayload = manualWebSearchRequested
      ? await executeWebSearch(
          manualToolQueryOrMessage(manualTool, modelUserMessage),
          "manual"
        )
      : undefined;
    // A selected AskQuestion option is now treated as ordinary prose.
    // Only an explicit user request should start another AskQuestion turn.
    const askQuestionMode: "off" | "explicit" | "continuation" =
      explicitAskQuestionRequest ? "explicit" : "off";
    const promptMessages = buildPromptMessages({
      botSystemPrompt: effectiveBotSystemPrompt,
      userDisplayName: settings.userDisplayName,
      suppressDisplayNameHint: isStarterPrompt,
      devMemoriesEnabled: settings.devMemoriesEnabled,
      devMemoriesText: settings.devMemoriesText,
      botOpinion: null,
      prismMood: null,
      threadSummary: null,
      coffeeContinuityContexts: [],
      memoryLines: [],
      memoryClarification: null,
      sessionResumeContext: settings.sessionResumeContext,
      topicReset: settings.topicReset === true,
      chatHistory: history,
      userMessage: promptUserMessage,
      mode,
      askQuestionMode,
      interruptedContent: settings.prismInterruption?.interruptedContent,
      imageSlotSystemHint: buildImageSlotSystemHint(userId, conversationId ?? null),
    });
    if (manualWebSearchPayload) {
      promptMessages.push({
        role: "system",
        content: formatWebSearchForModel(manualWebSearchPayload),
      });
    }
    if (manualAskQuestionConstraint) {
      promptMessages.push({
        role: "system",
        content: formatManualAskQuestionForModel(manualAskQuestionConstraint),
      });
    }
    pushBackendEvent(
      "context",
      "Prepared private chat prompt",
      `${describePromptMessages(promptMessages)}; ephemeralHistory=${history.length}; askQuestion=${askQuestionMode}`
    );

    const { provider: primaryProvider, botOverrides: primaryBotOverrides } =
      resolvePrimaryChatProviderForPossibleImageToolTurn({
        isStarterPrompt,
        rawUserMessage: modelUserMessage,
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
      psychicThought,
      psychicDebug,
    } = await generateWithLenientLocalFallback({
      provider: primaryProvider,
      promptMessages,
      botOverrides: primaryBotOverrides,
      secondaryOllamaHost: settings.secondaryOllamaHost,
      lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
      experimentalAllModelEffortEnabled: settings.experimentalAllModelEffortEnabled,
      psychicModeEnabled: settings.psychicModeEnabled,
      denialBoundaryProvider: auxiliaryProvider,
      denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
      botSystemPrompt: effectiveBotSystemPrompt,
      userMessage: modelUserMessage,
      signal: settings.signal,
      onPlanningWarning: (detail) =>
        pushBackendEvent("model", "Psychic planning unavailable", detail),
      onSimulatedEffortNotice: (detail) =>
        pushBackendEvent("model", "Simulated effort skipped", detail),
    });
    throwIfChatRequestCancelled(settings.signal);
    pushBackendEvent(
      "model",
      "Model response received",
      `provider=${providerNameUsed}; model=${modelUsed}; rawChars=${assistantReplyRaw.length}`
    );
    if (
      shouldSuppressAssistantReply(assistantReplyRaw) &&
      !shouldBypassSuppressionForImageIntent(isStarterPrompt, modelUserMessage, history)
    ) {
      const boundary = await generateOrganicTextBoundaryReply({
        boundaryProvider: auxiliaryProvider,
        boundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
        botSystemPrompt: effectiveBotSystemPrompt,
        userMessage: modelUserMessage,
        signal: settings.signal,
      });
      assistantReplyRaw = boundary.assistantReplyRaw;
      providerNameUsed = boundary.providerNameUsed;
      modelUsed = boundary.modelUsed;
    }
	    throwIfChatRequestCancelled(settings.signal);
	    let parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
	    let requestedWebSearchForTurn = parsedAssistant.webSearch;
	    let webSearchForTurn = manualWebSearchPayload;
	    let webSearchStatus: "blocked" | "completed" | "none" =
	      manualWebSearchPayload ? "completed" : "none";
	    if (!webSearchForTurn && requestedWebSearchForTurn) {
	      if (effectiveProvider === "local") {
	        webSearchStatus = "blocked";
	      } else {
	        webSearchForTurn = await executeWebSearch(requestedWebSearchForTurn.query, "automatic");
	        webSearchStatus = "completed";
	        ({
          assistantReplyRaw,
          providerNameUsed,
          modelUsed,
          fallbackInvocation,
          psychicThought,
          psychicDebug,
        } = await generateWithLenientLocalFallback({
          provider: primaryProvider,
          promptMessages: [
            ...promptMessages,
            {
              role: "assistant",
              content:
                parsedAssistant.displayContent.trim() ||
                "I need fresh web context before answering.",
            },
            {
              role: "system",
              content: formatWebSearchForModel(webSearchForTurn),
            },
            {
              role: "user",
              content:
                "Using the web search results above, answer the user's latest message now. Do not request WebSearch again.",
            },
          ],
          botOverrides: primaryBotOverrides,
          secondaryOllamaHost: settings.secondaryOllamaHost,
          lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
          experimentalAllModelEffortEnabled: settings.experimentalAllModelEffortEnabled,
          psychicModeEnabled: settings.psychicModeEnabled,
          denialBoundaryProvider: auxiliaryProvider,
          denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
          botSystemPrompt: effectiveBotSystemPrompt,
          userMessage: modelUserMessage,
          signal: settings.signal,
        }));
        parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
      }
    }
    const shouldBackfillAskQuestion =
        explicitAskQuestionRequest ||
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
	    let assistantDisplayRaw = stripAskQuestionDuplicatesFromDisplay(
	      parsedAssistant.displayContent,
	      askQuestionForTurn
	    );
	    if (webSearchStatus === "blocked" && assistantDisplayRaw.trim().length === 0) {
	      assistantDisplayRaw =
	        "I can only run automatic web searches in ONLINE mode. Use the ? tool picker to search the web explicitly from LOCAL mode.";
	    }
    const starterSendGeneratedImageRequested =
      isStarterPrompt && Boolean(parsedAssistant.sendGeneratedImage?.prompt?.trim());
    let assistantDisplay = isStarterPrompt && !starterSendGeneratedImageRequested
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
    const sendImgPromptIncRaw = manualImageGenRequested
      ? manualToolQueryOrMessage(manualTool, modelUserMessage)
      : parsedAssistant.sendGeneratedImage?.prompt?.trim();
    let sendImgPromptInc = autoBackfillSendGeneratedImagePrompt({
      isStarterPrompt,
      userMessage: modelUserMessage,
      parsedToolPrompt: sendImgPromptIncRaw,
      recentMessages: history,
    });
    const sendImgPromptIncRequested = sendImgPromptInc;
    let pendingImageJobIncognito: ProcessChatMessageResult["pendingImageJob"] | undefined;
    let incognitoImageSlot: "acquired" | "busy" | "none" = sendImgPromptInc ? "busy" : "none";
    let incognitoImageJobId: string | undefined;
    if (sendImgPromptInc) {
      throwIfChatRequestCancelled(settings.signal);
      const chatToolRequestedSize = inferChatToolRequestedImageSize(
        `${modelUserMessage}\n${sendImgPromptInc}`
      );
      const acq = await tryAcquireImageSlot({
        userId,
        conversationId: conversationId ?? null,
        botId: assistantBotId ?? null,
        mode,
        incognito: true,
        captionPrompt: sendImgPromptInc,
        userMessage: modelUserMessage,
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
        if (settings.signal?.aborted) {
          acq.job.abortController.abort();
          await releaseImageSlot(userId);
          throwIfChatRequestCancelled(settings.signal);
        }
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
          botSystemPrompt: effectiveBotSystemPrompt,
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
    let conversationStartersIncognito: string[] | undefined;
    if (isStarterPrompt && !starterSendGeneratedImageRequested) {
      const startersInferred = await inferConversationStarters(
        auxiliaryProvider,
        assistantDisplay,
        settings.starterPromptLabel,
        settings.botOverrides
      );
      if (startersInferred.length >= 4) {
        conversationStartersIncognito = startersInferred;
      }
    }
    const assistantAskQuestionForTurn =
      askQuestionForTurn ?? buildStarterAskQuestion(conversationStartersIncognito);
    const tellFictionalStoryForTurn = chooseTellFictionalStoryForTurn({
      displayContent: assistantDisplay,
      parsed: parsedAssistant.tellFictionalStory,
      askQuestion: assistantAskQuestionForTurn,
    });
    const manualAskQuestionForTurn = buildManualAskQuestionResultPayload({
      constraint: manualAskQuestionConstraint,
      assistantDisplay,
    });
    const incognitoToolCallEvents = buildAssistantToolCallEvents({
	      rawReply: assistantReplyRaw,
	      ...(requestedWebSearchForTurn
	        ? { parsedWebSearch: requestedWebSearchForTurn, webSearchStatus }
	        : manualWebSearchPayload
	          ? {
	              parsedWebSearch: {
                v: 1,
                name: "WebSearch" as const,
                query: manualWebSearchPayload.query,
              },
              webSearchStatus,
            }
          : {}),
      ...((parsedAssistant.sendGeneratedImage ||
        sendImgPromptIncRaw !== sendImgPromptIncRequested) &&
      sendImgPromptIncRequested
        ? {
            parsedSendGeneratedImage: { prompt: sendImgPromptIncRequested },
          }
        : {}),
      ...(assistantAskQuestionForTurn
        ? { parsedAskQuestion: assistantAskQuestionForTurn }
        : {}),
      imageSlot: incognitoImageSlot,
      ...(incognitoImageJobId ? { imageJobId: incognitoImageJobId } : {}),
    });
    const assistantCreatedAt = new Date().toISOString();
    const assistantBotName =
      typeof assistantBotId === "string"
        ? settings.starterPromptLabel?.trim() ?? ""
        : "";
    const assistantMessageProse: ChatMessage = {
      id: randomId(12),
      role: "assistant",
      content: assistantDisplay,
      createdAt: assistantCreatedAt,
      provider: providerNameUsed,
      model: modelUsed,
      botId: assistantBotId ?? null,
      moodKey: assistantMood.key,
      moodConfidence: assistantMood.confidence,
      ...(assistantBotName ? { botName: assistantBotName } : {}),
      ...(assistantAskQuestionForTurn ? { askQuestion: assistantAskQuestionForTurn } : {}),
      ...(tellFictionalStoryForTurn
        ? { tellFictionalStory: tellFictionalStoryForTurn }
        : {}),
      ...(parsedAssistant.zenDisplay ? { zenDisplay: parsedAssistant.zenDisplay } : {}),
      ...(webSearchForTurn ? { webSearch: webSearchForTurn } : {}),
    };
    const assistantTail: ChatMessage[] = [assistantMessageProse];
    const promptShortcutWithResolvedPrompt = withPromptShortcutResolvedPrompt(
      settings.promptShortcut,
      modelUserMessage
    );
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
            botId: activeBotId ?? null,
            ...(promptShortcutWithResolvedPrompt
              ? { promptShortcut: promptShortcutWithResolvedPrompt }
              : {}),
            ...(manualAskQuestionForTurn
              ? { manualAskQuestion: manualAskQuestionForTurn }
              : {}),
            ...(psychicThought ? { psychicThought } : {}),
          }]
      ),
      ...assistantTail,
    ];
    const conversationIncognito: Conversation = {
      id: conversationId ?? randomId(12),
      userId,
      title: privateConversationTitle(nextMessages, modelUserMessage, settings.starterPromptLabel),
      mode,
      botId: activeBotId ?? null,
      incognito: true,
      lastBotId: assistantBotId ?? null,
      lastBotColor: null,
      hasAssistantReply: true,
      createdAt: nextMessages[0]?.createdAt ?? now,
      updatedAt: assistantCreatedAt,
      messages: nextMessages,
    };

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
      ...(psychicDebug ? { psychicDebug } : {}),
      ...(conversationStartersIncognito
        ? { conversationStarters: conversationStartersIncognito }
        : {}),
    };
  }

  let activeConversationId = conversationId;
  let createdConversationForTurn = false;
  if (isZenMode(mode) && settings.forceNewConversation !== true) {
    const latestChatConversation = db
      .prepare(
        `SELECT c.id
           FROM conversations c
          WHERE c.user_id = ?
            AND COALESCE(c.incognito, 0) = 0
            AND c.conversation_mode IN ('zen', 'chat')
            AND (
              NOT EXISTS (
                SELECT 1 FROM messages m_any
                 WHERE m_any.conversation_id = c.id
                   AND m_any.user_id = c.user_id
              )
              OR EXISTS (
                SELECT 1 FROM messages m_assistant
                 WHERE m_assistant.conversation_id = c.id
                   AND m_assistant.user_id = c.user_id
                   AND m_assistant.role = 'assistant'
              )
            )
          ORDER BY c.updated_at DESC
          LIMIT 1`
      )
      .get(userId) as { id?: string } | undefined;
    if (!activeConversationId) {
      activeConversationId = latestChatConversation?.id;
    } else {
      const requested = db
        .prepare(
          `SELECT c.id, c.conversation_mode,
                  EXISTS (
                    SELECT 1 FROM messages m_any
                     WHERE m_any.conversation_id = c.id
                       AND m_any.user_id = c.user_id
                  ) AS has_messages,
                  EXISTS (
                    SELECT 1 FROM messages m_assistant
                     WHERE m_assistant.conversation_id = c.id
                       AND m_assistant.user_id = c.user_id
                       AND m_assistant.role = 'assistant'
                  ) AS has_assistant_reply
             FROM conversations c
            WHERE c.id = ? AND c.user_id = ?`
        )
        .get(activeConversationId, userId) as
        | {
            id: string;
            conversation_mode: string | null;
            has_messages: number;
            has_assistant_reply: number;
          }
        | undefined;
      if (!requested?.id) {
        throw new Error("Conversation not found for this user.");
      }
      const requestedIsUnfinishedZenTurn =
        (requested.conversation_mode === "zen" || requested.conversation_mode === "chat") &&
        requested.has_messages === 1 &&
        requested.has_assistant_reply !== 1;
      if (
        (requested.conversation_mode !== "zen" &&
          requested.conversation_mode !== "chat") ||
        requestedIsUnfinishedZenTurn
      ) {
        activeConversationId = latestChatConversation?.id;
      }
    }
    if (activeConversationId) {
      db.prepare(
        "UPDATE conversations SET conversation_mode = 'zen' WHERE id = ? AND user_id = ? AND conversation_mode = 'chat'"
      ).run(activeConversationId, userId);
    }
  }
  throwIfChatRequestCancelled(settings.signal);
  const rememberedZenWallpaperForNewConversation =
    !activeConversationId && isZenMode(mode) && !incognitoForTurn
      ? getLatestRememberedZenWallpaperForBot(db, userId, activeMemoryBotId)
      : null;
  if (!activeConversationId) {
    activeConversationId = randomId(12);
    createdConversationForTurn = true;
    const conversationTitle = isStarterPrompt
        ? generateStarterConversationTitle(settings.starterPromptLabel)
        : personaTransitionTurn
          ? "Zen"
        : zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
          ? "Zen"
        : generateConversationTitle(modelUserMessage);
    const conversationMode = isZenMode(mode) ? "zen" : mode;
    const conversationBotId = isZenMode(mode) ? null : activeBotId ?? null;
    if (rememberedZenWallpaperForNewConversation) {
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito,
          zen_wallpaper_enabled, zen_wallpaper_image_id,
          zen_wallpaper_prompt_seed, zen_wallpaper_message_count,
          zen_wallpaper_status, zen_wallpaper_history,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 0, 'ready', ?, ?, ?)`
      ).run(
        activeConversationId,
        userId,
        conversationTitle,
        conversationMode,
        conversationBotId,
        incognitoForTurn ? 1 : 0,
        rememberedZenWallpaperForNewConversation.imageId,
        rememberedZenWallpaperForNewConversation.promptSeed,
        serializeZenWallpaperHistory(
          buildRememberedZenWallpaperHistory(
            rememberedZenWallpaperForNewConversation
          )
        ),
        now,
        now
      );
    } else if (isZenMode(mode) && !incognitoForTurn && activeMemoryBotId) {
      db.prepare(
        `INSERT INTO conversations (
          id, user_id, title, conversation_mode, bot_id, incognito,
          zen_wallpaper_enabled, zen_wallpaper_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'idle', ?, ?)`
      ).run(
        activeConversationId,
        userId,
        conversationTitle,
        conversationMode,
        conversationBotId,
        incognitoForTurn ? 1 : 0,
        now,
        now
      );
    } else {
      db.prepare(
        "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        activeConversationId,
        userId,
        conversationTitle,
        conversationMode,
        conversationBotId,
        incognitoForTurn ? 1 : 0,
        now,
        now
      );
    }
  } else {
    const owned = db
      .prepare("SELECT id FROM conversations WHERE id = ? AND user_id = ?")
      .get(activeConversationId, userId) as { id?: string } | undefined;
    if (!owned?.id) {
      throw new Error("Conversation not found for this user.");
    }
  }
  patchUsageSession({
    conversationId: activeConversationId,
    botId: assistantMemoryBotId ?? activeBotId ?? null,
    mode,
    surface: isZenMode(mode) ? "zen" : mode,
  });
  if (isZenMode(mode)) {
    pruneExpiredZenSessionMemories(db, userId);
  }

  const historyCutoff =
    !incognitoForTurn
      ? getLatestFullThreadCompactionCutoff(db, userId, activeConversationId, mode)
      : null;

  // Fetch the NEWEST N messages (not the oldest). Prior implementation used
  // ORDER BY ASC LIMIT 30, which once a thread exceeded 30 messages froze
  // the prompt on ancient history and silently dropped every recent turn.
  // We page the latest N, then reverse to chronological order for the
  // provider. Once a full thread-compaction summary exists, only messages
  // created after that summary stay live; older transcript rows remain saved
  // for UI history, but model context flows through the compacted summary.
  const recentContextMessageLimit = normalizeRecentContextMessageLimit(
    settings.recentContextMessageLimit
  );
  const historyRowsDesc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.bot_id, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
         AND (? IS NULL OR m.created_at > ?)
       ORDER BY m.created_at DESC
       LIMIT ?`
    )
    .all(
      activeConversationId,
      userId,
      historyCutoff,
      historyCutoff,
      recentContextMessageLimit
    ) as MessageRow[];
  const history = hydrateMessages(historyRowsDesc.slice().reverse());
  // A selected AskQuestion option is now treated as ordinary prose.
  // Only an explicit user request should start another AskQuestion turn.
  const askQuestionMode: "off" | "explicit" | "continuation" =
    explicitAskQuestionRequest ? "explicit" : "off";

  let outgoingZenPersonaCheckpointBotId: string | null | undefined;
  if (isZenMode(mode) && !incognitoForTurn && personaTransitionTurn) {
    outgoingZenPersonaCheckpointBotId = personaTransition.fromBotId;
  } else if (
    isZenMode(mode) &&
    !incognitoForTurn &&
    zenAutonomyTurn &&
    !sameChatBotId(zenAutonomy.activeBotId, activeMemoryBotId)
  ) {
    outgoingZenPersonaCheckpointBotId = zenAutonomy.activeBotId;
  }
  if (outgoingZenPersonaCheckpointBotId !== undefined) {
    const checkpoint = await createZenPersonaSessionMemoryCheckpoint({
      db,
      provider: auxiliaryProvider,
      userId,
      conversationId: activeConversationId,
      botId: outgoingZenPersonaCheckpointBotId,
      userKey,
    });
    if (checkpoint) {
      pushBackendEvent(
        "memory",
        "Zen Persona checkpoint saved",
        `bot=${checkpoint.botId ?? "default"}; title=${checkpoint.title}; expiresAt=${checkpoint.expiresAt}`
      );
    }
  }

  const existingSessionOpinion = readSessionOpinion(
    db,
    userId,
    activeConversationId,
    opinionBotIdForTurn
  );
  const existingBotOpinion = readBotOpinion(db, userId, opinionBotIdForTurn);
  const turnEvaluation = isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || commandCenterPromptTurn
    ? undefined
    : evaluateUserTurnOpinion(message);
  const repairSignal = isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || commandCenterPromptTurn
    ? false
    : hasRepairSignal(normalizeOpinionText(message));
  const zenMoodSensitivity = normalizePrismMoodSensitivity(
    settings.zenMoodSensitivity
  );
  let prismMood = loadPrismMoodState(db, userId, activeConversationId, mode) ??
    createDefaultPrismMoodState(mode, now);
  let prismMoodIgnoreTurn = false;
  let prismMoodPauseTurn = false;
  let prismMoodCooldownExpiredThisTurn = false;
  let skipMemoryForMoodCooldownTurn = false;
  let prismMoodForgivenessSystemHint: string | null = null;
  if (isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || commandCenterPromptTurn) {
    prismMood = sanitizePrismMoodState(prismMood, mode, now);
  } else if (isZenMode(mode) && isPrismMoodIgnoring(prismMood, now)) {
    skipMemoryForMoodCooldownTurn = true;
    const forgivenessChance = prismMoodIgnoreForgivenessChance(prismMood);
    const forgivenessAttempt = userAttemptedMoodRepair(message, turnEvaluation);
    const forgivenessRoll = forgivenessAttempt && forgivenessChance > 0
      ? Math.random()
      : null;
    if (forgivenessRoll !== null && forgivenessRoll < forgivenessChance) {
      prismMood = applyPrismMoodForgivenessSuccess(prismMood, now);
      prismMoodForgivenessSystemHint = buildPrismForgivenessSystemHint(forgivenessChance);
      pushBackendEvent(
        "model",
        "Forgiveness roll succeeded",
        `chance=${forgivenessChance}; roll=${forgivenessRoll.toFixed(4)}; mood=${prismMood.moodKey}; annoyance=${prismMood.annoyance}`
      );
    } else {
      prismMood = applyPrismMoodIgnoredTurn(prismMood, now);
      prismMoodIgnoreTurn = true;
      pushBackendEvent(
        "model",
        "Forgiveness roll did not resume chat",
        forgivenessAttempt
          ? `chance=${forgivenessChance}; roll=${forgivenessRoll === null ? "none" : forgivenessRoll.toFixed(4)}`
          : `chance=${forgivenessChance}; no repair attempt`
      );
    }
  } else {
    if (isZenMode(mode) && prismMood.ignoreUntil) {
      const settledMood = applyPrismMoodExpiredIgnoreCooldown(prismMood, now);
      prismMoodCooldownExpiredThisTurn =
        settledMood.recentDeltas[0]?.kind === "ignore_expired";
      prismMood = settledMood;
    }
    if (!prismMoodCooldownExpiredThisTurn) {
      prismMood = decayPrismMood(prismMood, now);
    }
    if (isZenMode(mode) && settings.prismInterruption) {
      prismMood = applyPrismMoodInterruption(
        prismMood,
        settings.prismInterruption,
        now,
        zenMoodSensitivity
      );
    }
    if (turnEvaluation && turnEvaluation.delta < 0) {
      prismMood = applyPrismMoodNegativeTurn(
        prismMood,
        Math.min(1, Math.max(0.2, Math.abs(turnEvaluation.delta) / 8)),
        now,
        zenMoodSensitivity
      );
    }
    const canMoodBoundary =
      isZenMode(mode) &&
      !repairSignal &&
      !userAskedPrismMoodSelfReport(message);
    if (
      canMoodBoundary &&
      !prismMoodCooldownExpiredThisTurn &&
      shouldPrismMoodStartIgnoreCooldown(prismMood, zenMoodSensitivity)
    ) {
      prismMood = applyPrismMoodIgnoreCooldown(prismMood, now);
      prismMoodIgnoreTurn = true;
    } else {
      prismMoodPauseTurn =
        canMoodBoundary &&
        shouldPrismMoodDeclineResponse(prismMood, zenMoodSensitivity);
      if (!prismMoodPauseTurn && turnEvaluation && turnEvaluation.delta > 0) {
        prismMood = applyPrismMoodPositiveTurn(
          prismMood,
          Math.min(1, Math.max(0.2, turnEvaluation.delta / 8)),
          now
        );
      }
    }
  }
  if (!commandCenterPromptTurn) {
    prismMood = upsertPrismMoodState(db, userId, activeConversationId, prismMood);
  }

  const memoryIntent =
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn &&
    !skipMemoryForMoodCooldownTurn
      ? analyzeMemoryIntent(message)
      : null;

  let threadSummary: string | null = null;
  let memoryLines: string[] = [];
  let mentionedBotContexts: string[] = [];
  let coffeeContinuityContexts: CoffeeContinuityContext[] = [];
  if (
    !incognitoForTurn &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !skipMemoryForMoodCooldownTurn &&
    !prismMoodIgnoreTurn
  ) {
    throwIfChatRequestCancelled(settings.signal);
    const pipelineResult =
      isZenMode(mode)
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
            userDisplayName: settings.userDisplayName,
          })
        : await handleSandboxTurn({
            db,
            userId,
            activeConversationId,
            isStarterPrompt,
            retrievalMode,
            message,
            userKey,
            userDisplayName: settings.userDisplayName,
          });
    threadSummary = pipelineResult.threadSummary;
    memoryLines = pipelineResult.memoryLines;
    mentionedBotContexts = pipelineResult.mentionedBotContexts;
  }
  if (
    isZenMode(mode) &&
    !incognitoForTurn &&
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn &&
    !skipMemoryForMoodCooldownTurn &&
    !prismMoodIgnoreTurn &&
    activeMemoryBotId
  ) {
    coffeeContinuityContexts = loadRecentCoffeeContinuityContexts({
      db,
      userId,
      botId: activeMemoryBotId,
    });
  }
  pushBackendEvent(
    "context",
    "Loaded model context",
    `history=${history.length}; historyCutoff=${historyCutoff ?? "none"}; threadSummary=${threadSummary ? `${threadSummary.length} chars` : "none"}; memoryLines=${memoryLines.length}; mentionedBots=${mentionedBotContexts.length}; coffeeContinuity=${coffeeContinuityContexts.length}; askQuestion=${askQuestionMode}; activeBot=${activeMemoryBotId ?? "default"}; moodCooldownMemory=${skipMemoryForMoodCooldownTurn ? "skipped" : "normal"}`
  );

  let userMessageId: string | null = null;
  const buildUserMessageToolPayload = (
    psychicThought?: PsychicThoughtPayload,
    manualAskQuestion?: ManualAskQuestionResultPayload
  ): string | null =>
    serializePromptToolPayload({
      promptShortcut: withPromptShortcutResolvedPrompt(settings.promptShortcut, modelUserMessage),
      promptWildcards: withPromptWildcardResolvedPrompt(settings.promptWildcards, modelUserMessage),
      ...(psychicThought ? { psychicThought } : {}),
      ...(manualAskQuestion ? { manualAskQuestion } : {}),
    });
  const insertUserMessageForTurn = (): void => {
    if (isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || userMessageId !== null) return;
    userMessageId = randomId(12);
    const promptShortcutPayload = buildUserMessageToolPayload();
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at) VALUES (?, ?, ?, 'user', ?, NULL, NULL, ?, ?, ?)"
    ).run(
      userMessageId,
      activeConversationId,
      userId,
      message,
      activeBotId ?? null,
      promptShortcutPayload,
      now
    );
  };
  if (prismMoodIgnoreTurn) {
    insertUserMessageForTurn();
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(now, activeConversationId, userId);
    pushBackendEvent(
      "model",
      "Skipped chat model",
      `reason=prism-mood-ignore; ignoreUntil=${prismMood.ignoreUntil ?? "none"}; mood=${prismMood.moodKey}; annoyance=${prismMood.annoyance}; warmth=${prismMood.warmth}`
    );
    const conversationIgnored = loadPersistedConversationForChatResponse({
      db,
      userId,
      activeConversationId,
      prismMood,
    });
    const ignoredTotalMessages = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
        )
        .get(activeConversationId, userId) as { n: number }
    ).n;
    pushBackendEvent(
      "route",
      "POST /api/chat completed",
      `conversation=${conversationIgnored.id}; totalMessages=${ignoredTotalMessages}; assistantMessages=ignored; provider=none; model=prism-mood-ignore`
    );
    return {
      conversation: conversationIgnored,
      ...(existingSessionOpinion ? { opinion: existingSessionOpinion } : {}),
      ...(existingBotOpinion ? { botOpinion: existingBotOpinion } : {}),
      prismMood,
      backendEvents,
    };
  }
  let memoryClarification: string | null = null;
  const longTermRetractionTargets = new Map<string, Awaited<ReturnType<typeof findMemoryByCue>>>();
  if (
    !skipPersonalFacts &&
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn &&
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
  const zenSessionMemoryContext =
    isZenMode(mode) &&
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn &&
    userMessageRequestsZenSessionMemory(message)
      ? loadZenSessionMemoryOverview({
          db,
          userId,
          userKey,
          activeConversationId,
        })
      : null;
  const zenPersonaContinuityContext =
    isZenMode(mode) &&
    !incognitoForTurn &&
    !isStarterPrompt &&
    !commandCenterPromptTurn
      ? loadZenSessionMemoryOverview({
          db,
          userId,
          userKey,
          activeConversationId,
          botId: activeMemoryBotId,
        })
      : null;
  if (zenSessionMemoryContext) {
    pushBackendEvent(
      "context",
      "Loaded Zen session memory context",
      `previousContext=${zenSessionMemoryContext.previousContext ? "yes" : "no"}; checkpoints=${zenSessionMemoryContext.sessionMemories.length}`
    );
  }
	  if (zenPersonaContinuityContext?.sessionMemories.length) {
	    pushBackendEvent(
	      "context",
	      "Loaded Zen Persona continuity",
	      `bot=${activeMemoryBotId ?? "default"}; checkpoints=${zenPersonaContinuityContext.sessionMemories.length}`
	    );
	  }
	  const manualWebSearchPayload =
	    manualWebSearchRequested &&
	    !personaTransitionTurn &&
	    !zenAutonomyTurn &&
	    !zenAskQuestionPatienceTurn &&
	    !zenLiveActionInterruptTurn
	      ? await executeWebSearch(
	          manualToolQueryOrMessage(manualTool, modelUserMessage),
	          "manual"
	        )
	      : undefined;
	  const promptMessages = buildPromptMessages({
    botSystemPrompt: effectiveBotSystemPrompt,
    userDisplayName: settings.userDisplayName,
    suppressDisplayNameHint: isStarterPrompt,
    devMemoriesEnabled: settings.devMemoriesEnabled,
    devMemoriesText: settings.devMemoriesText,
    botOpinion: existingBotOpinion,
    prismMood,
    moodBoundaryHint: prismMoodForgivenessSystemHint,
    threadSummary,
    zenSessionMemoryContext,
    zenPersonaContinuityContext,
    zenPersonaContinuityLabel: settings.starterPromptLabel,
    coffeeContinuityContexts,
    memoryLines,
    mentionedBotContexts,
    memoryClarification,
    sessionResumeContext: settings.sessionResumeContext,
    topicReset: settings.topicReset === true,
    chatHistory: history,
    userMessage: promptUserMessage,
    mode,
    askQuestionMode: memoryClarification ? "explicit" : askQuestionMode,
	    interruptedContent: settings.prismInterruption?.interruptedContent,
	    imageSlotSystemHint: buildImageSlotSystemHint(userId, activeConversationId),
	  });
	  if (manualWebSearchPayload) {
	    promptMessages.push({
	      role: "system",
	      content: formatWebSearchForModel(manualWebSearchPayload),
	    });
	  }
	  if (manualAskQuestionConstraint) {
	    promptMessages.push({
	      role: "system",
	      content: formatManualAskQuestionForModel(manualAskQuestionConstraint),
	    });
	  }
	  pushBackendEvent("context", "Prepared persisted chat prompt", describePromptMessages(promptMessages));
  insertUserMessageForTurn();
  let cancelledPersistedTurnRolledBack = false;
  const rollbackIfCancelledBeforeAssistantReply = (error: unknown): void => {
    if (cancelledPersistedTurnRolledBack) return;
    if (!isChatRequestCancelledError(error, settings.signal)) return;
    cancelledPersistedTurnRolledBack = true;
    rollbackCancelledPersistedTurn({
      db,
      userId,
      conversationId: activeConversationId,
      userMessageId,
      deleteConversationIfEmpty: createdConversationForTurn,
    });
  };
  const throwIfCancelledBeforeAssistantReply = (): void => {
    try {
      throwIfChatRequestCancelled(settings.signal);
    } catch (error) {
      rollbackIfCancelledBeforeAssistantReply(error);
      throw error;
    }
  };

  let assistantReplyRaw = "";
  let providerNameUsed: ProviderName = provider.name;
	  let modelUsed = prismMoodPauseTurn ? "prism-mood-pause" : "";
	  let fallbackInvocation: ProcessChatMessageResult["fallbackInvocation"] = undefined;
	  let psychicThoughtForTurn: PsychicThoughtPayload | undefined;
	  let psychicDebugForTurn: PsychicDebugPayload | undefined;
	  let primaryProvider: LlmProvider = provider;
	  let primaryBotOverrides: GenerateOptions | undefined = settings.botOverrides;
	  if (prismMoodPauseTurn) {
    assistantReplyRaw = ZEN_MOOD_PAUSE_REPLY;
    pushBackendEvent(
      "model",
      "Skipped chat model",
      `reason=prism-mood-pause; mood=${prismMood.moodKey}; annoyance=${prismMood.annoyance}; warmth=${prismMood.warmth}`
    );
	  } else {
	    const primaryRoute = resolvePrimaryChatProviderForPossibleImageToolTurn({
	        isStarterPrompt,
	        rawUserMessage: modelUserMessage,
	        baseProvider: provider,
	        botOverrides: settings.botOverrides,
	        secondaryOllamaHost: settings.secondaryOllamaHost,
	        prismImageToolLlmModel: settings.prismImageToolLlmModel,
	        recentMessages: history,
	      });
	    primaryProvider = primaryRoute.provider;
	    primaryBotOverrides = primaryRoute.botOverrides;
	    providerNameUsed = primaryProvider.name;
    pushBackendEvent(
      "model",
      "Calling chat model",
      `provider=${primaryProvider.name}; model=${describeRequestedModel(
        primaryProvider,
        primaryBotOverrides
      )}; imageToolRoute=${primaryProvider === provider ? "normal" : "rerouted"}`
    );

    try {
      ({
        assistantReplyRaw,
        providerNameUsed,
        modelUsed,
        fallbackInvocation,
        psychicThought: psychicThoughtForTurn,
        psychicDebug: psychicDebugForTurn,
      } = await generateWithLenientLocalFallback({
        provider: primaryProvider,
        promptMessages,
        botOverrides: primaryBotOverrides,
        secondaryOllamaHost: settings.secondaryOllamaHost,
        lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
        experimentalAllModelEffortEnabled: settings.experimentalAllModelEffortEnabled,
        psychicModeEnabled: settings.psychicModeEnabled,
        denialBoundaryProvider: auxiliaryProvider,
        denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
        botSystemPrompt: effectiveBotSystemPrompt,
        userMessage: modelUserMessage,
        signal: settings.signal,
        onPlanningWarning: (detail) =>
          pushBackendEvent("model", "Psychic planning unavailable", detail),
        onSimulatedEffortNotice: (detail) =>
          pushBackendEvent("model", "Simulated effort skipped", detail),
      }));
    } catch (error) {
      rollbackIfCancelledBeforeAssistantReply(error);
      throw error;
    }
    throwIfCancelledBeforeAssistantReply();
    pushBackendEvent(
      "model",
      "Model response received",
      `provider=${providerNameUsed}; model=${modelUsed}; rawChars=${assistantReplyRaw.length}`
    );
    if (
      shouldSuppressAssistantReply(assistantReplyRaw) &&
      !shouldBypassSuppressionForImageIntent(isStarterPrompt, modelUserMessage, history)
    ) {
      let boundary: Awaited<ReturnType<typeof generateOrganicTextBoundaryReply>>;
      try {
        boundary = await generateOrganicTextBoundaryReply({
          boundaryProvider: auxiliaryProvider,
          boundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
          botSystemPrompt: effectiveBotSystemPrompt,
          userMessage: modelUserMessage,
          signal: settings.signal,
        });
      } catch (error) {
        rollbackIfCancelledBeforeAssistantReply(error);
        throw error;
      }
      assistantReplyRaw = boundary.assistantReplyRaw;
      providerNameUsed = boundary.providerNameUsed;
      modelUsed = boundary.modelUsed;
    }
  }
  throwIfCancelledBeforeAssistantReply();
  if (userMessageId && psychicThoughtForTurn) {
    db.prepare(
      "UPDATE messages SET tool_payload = ? WHERE id = ? AND conversation_id = ? AND user_id = ? AND role = 'user'"
    ).run(
      buildUserMessageToolPayload(psychicThoughtForTurn),
      userMessageId,
      activeConversationId,
      userId
    );
  }
  let parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
  const requestedWebSearchForTurn: WebSearchRequestPayload | undefined =
    manualWebSearchPayload
      ? {
          v: 1,
          name: "WebSearch",
          query: manualWebSearchPayload.query,
        }
      : parsedAssistant.webSearch;
  let webSearchForTurn = manualWebSearchPayload;
  let webSearchStatus: "blocked" | "completed" | "none" =
    manualWebSearchPayload ? "completed" : "none";
  if (!webSearchForTurn && requestedWebSearchForTurn) {
    if (effectiveProvider === "local") {
      webSearchStatus = "blocked";
    } else {
      try {
        webSearchForTurn = await executeWebSearch(requestedWebSearchForTurn.query, "automatic");
        webSearchStatus = "completed";
        ({
          assistantReplyRaw,
          providerNameUsed,
          modelUsed,
          fallbackInvocation,
          psychicThought: psychicThoughtForTurn,
          psychicDebug: psychicDebugForTurn,
        } = await generateWithLenientLocalFallback({
          provider: primaryProvider,
          promptMessages: [
            ...promptMessages,
            {
              role: "assistant",
              content:
                parsedAssistant.displayContent.trim() ||
                "I need fresh web context before answering.",
            },
            {
              role: "system",
              content: formatWebSearchForModel(webSearchForTurn),
            },
            {
              role: "user",
              content:
                "Using the web search results above, answer the user's latest message now. Do not request WebSearch again.",
            },
          ],
          botOverrides: primaryBotOverrides,
          secondaryOllamaHost: settings.secondaryOllamaHost,
          lenientLocalFallbackModel: settings.lenientLocalFallbackModel,
          experimentalAllModelEffortEnabled: settings.experimentalAllModelEffortEnabled,
          psychicModeEnabled: settings.psychicModeEnabled,
          denialBoundaryProvider: auxiliaryProvider,
          denialBoundaryModel: resolveAuxiliaryOllamaModel(settings.prismDefaultLlmModel),
          botSystemPrompt: effectiveBotSystemPrompt,
          userMessage: modelUserMessage,
          signal: settings.signal,
        }));
        parsedAssistant = parseAssistantPrismTools(assistantReplyRaw);
      } catch (error) {
        rollbackIfCancelledBeforeAssistantReply(error);
        throw error;
      }
      throwIfCancelledBeforeAssistantReply();
    }
  }
  const shouldBackfillAskQuestion =
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    (explicitAskQuestionRequest ||
      assistantLikelyIntendedAskQuestion(parsedAssistant.displayContent));
  const askQuestionRaw =
    zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
      ? undefined
      : parsedAssistant.askQuestion ??
        (shouldBackfillAskQuestion
          ? buildAskQuestionFallback(parsedAssistant.displayContent)
          : undefined);
  const askQuestionForTurn = askQuestionRaw
    ? refineAskQuestionPayloadFromDisplay(
        parsedAssistant.displayContent,
        askQuestionRaw
      )
    : undefined;
  let assistantDisplayRaw = stripAskQuestionDuplicatesFromDisplay(
    parsedAssistant.displayContent,
    askQuestionForTurn
  );
  if (webSearchStatus === "blocked" && assistantDisplayRaw.trim().length === 0) {
    assistantDisplayRaw =
      "I can only run automatic web searches in ONLINE mode. Use the ? tool picker to search the web explicitly from LOCAL mode.";
  }
  const starterSendGeneratedImageRequested =
    isStarterPrompt && Boolean(parsedAssistant.sendGeneratedImage?.prompt?.trim());
  let assistantDisplay = isStarterPrompt && !starterSendGeneratedImageRequested
    ? enforceStarterOpeningQuestion(
        assistantDisplayRaw,
        memoryLines,
        settings.starterPromptWarrantsIntro === true
      )
    : assistantDisplayRaw;
	  const assistantMood = prismMoodPauseTurn
	    ? {
	        key: prismMood.moodKey,
	        confidence: prismMood.confidence,
	      }
    : commandCenterPromptTurn || personaTransitionTurn || zenAutonomyTurn || zenLiveActionInterruptTurn
    ? NEUTRAL_MOOD_EVALUATION
    : evaluateAssistantMood({
        assistantContent: assistantDisplay,
        toneDelta: turnEvaluation?.delta,
        sessionOpinion: existingSessionOpinion,
        botOpinion: existingBotOpinion,
	        repairSignal,
	      });
  const manualAskQuestionForTurn = buildManualAskQuestionResultPayload({
    constraint: manualAskQuestionConstraint,
    assistantDisplay,
  });
  if (userMessageId && (psychicThoughtForTurn || manualAskQuestionForTurn)) {
    db.prepare(
      "UPDATE messages SET tool_payload = ? WHERE id = ? AND conversation_id = ? AND user_id = ? AND role = 'user'"
    ).run(
      buildUserMessageToolPayload(psychicThoughtForTurn, manualAskQuestionForTurn),
      userMessageId,
      activeConversationId,
      userId
    );
  }
	  const sendImgPromptPersistedRaw = zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
	    ? undefined
	    : manualImageGenRequested
      ? manualToolQueryOrMessage(manualTool, modelUserMessage)
      : parsedAssistant.sendGeneratedImage?.prompt?.trim();
  let sendImgPromptPersisted = autoBackfillSendGeneratedImagePrompt({
    isStarterPrompt,
    userMessage: modelUserMessage,
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
    throwIfCancelledBeforeAssistantReply();
    const chatToolRequestedSize = inferChatToolRequestedImageSize(
      `${modelUserMessage}\n${sendImgPromptPersisted}`
    );
    let acq: Awaited<ReturnType<typeof tryAcquireImageSlot>>;
    try {
      acq = await tryAcquireImageSlot({
        userId,
        conversationId: activeConversationId,
        botId: assistantBotId ?? null,
        mode,
        incognito: false,
        captionPrompt: sendImgPromptPersisted,
        userMessage: modelUserMessage,
        source: "chat_tool",
        requestedSize: chatToolRequestedSize,
      });
    } catch (error) {
      rollbackIfCancelledBeforeAssistantReply(error);
      throw error;
    }
    if (!acq.ok) {
      sendImgPromptPersisted = undefined;
      assistantDisplay =
        assistantDisplay.trim().length > 0
          ? `${assistantDisplay.trimEnd()}\n\n${ASSISTANT_IMAGE_SLOT_BUSY_NOTE}`
          : ASSISTANT_IMAGE_SLOT_BUSY_NOTE;
      sentGeneratedImagePersisted = undefined;
      persistedImageSlot = "busy";
    } else {
      if (settings.signal?.aborted) {
        acq.job.abortController.abort();
        await releaseImageSlot(userId);
        throwIfCancelledBeforeAssistantReply();
      }
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
        botSystemPrompt: effectiveBotSystemPrompt,
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
  let conversationStartersPersisted: string[] | undefined;
  if (isStarterPrompt && !starterSendGeneratedImageRequested) {
    const startersPersisted = await inferConversationStarters(
      auxiliaryProvider,
      assistantDisplay,
      settings.starterPromptLabel,
      settings.botOverrides
    );
    if (startersPersisted.length >= 4) {
      conversationStartersPersisted = startersPersisted;
    }
  }
  throwIfCancelledBeforeAssistantReply();
  const assistantAskQuestionForTurn = zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
    ? undefined
    : askQuestionForTurn ?? buildStarterAskQuestion(conversationStartersPersisted);
  const tellFictionalStoryForTurn = zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
    ? undefined
    : chooseTellFictionalStoryForTurn({
        displayContent: assistantDisplay,
        parsed: parsedAssistant.tellFictionalStory,
        askQuestion: assistantAskQuestionForTurn,
      });
	  const persistedToolCallEvents = zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn
	    ? []
	    : buildAssistantToolCallEvents({
	        rawReply: assistantReplyRaw,
	        ...(requestedWebSearchForTurn
	          ? { parsedWebSearch: requestedWebSearchForTurn, webSearchStatus }
	          : {}),
	        ...((parsedAssistant.sendGeneratedImage ||
          sendImgPromptPersistedRaw !== sendImgPromptPersistedRequested) &&
        sendImgPromptPersistedRequested
          ? {
              parsedSendGeneratedImage: { prompt: sendImgPromptPersistedRequested },
            }
          : {}),
        ...(assistantAskQuestionForTurn
          ? { parsedAskQuestion: assistantAskQuestionForTurn }
          : {}),
        imageSlot: persistedImageSlot,
        ...(persistedImageJobId ? { imageJobId: persistedImageJobId } : {}),
      });
  const zenTurnMarker = personaTransitionTurn
    ? {
        kind: "persona-transition" as const,
        fromBotId: personaTransition.fromBotId,
        toBotId: personaTransition.toBotId,
        style: personaTransition.style,
      }
    : zenAutonomyTurn
      ? {
          kind: "zen-autonomy" as const,
          activeBotId: zenAutonomy.activeBotId,
          toBotId: assistantMemoryBotId,
        }
      : zenLiveActionInterruptTurn
        ? {
            kind: "zen-live-action-interrupt" as const,
            activeBotId: zenLiveActionInterrupt!.activeBotId,
          }
        : undefined;
  const toolPayloadProseOnly = serializeAssistantToolPayload({
    askQuestion: assistantAskQuestionForTurn,
    tellFictionalStory: tellFictionalStoryForTurn,
	    moodKey: assistantMood.key,
	    moodConfidence: assistantMood.confidence,
	    zenDisplay: zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn ? undefined : parsedAssistant.zenDisplay,
	    zenTurn: zenTurnMarker,
	    webSearch: webSearchForTurn,
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
    assistantBotId ?? null,
    toolPayloadProseOnly,
    assistantCreatedAt
  );
  attachUsageEventsToMessage({
    conversationId: activeConversationId,
    messageId: assistantProseMessageId,
    botId: assistantBotId ?? null,
  });

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
      assistantBotId ?? null,
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
  if (!isZenMode(mode) && activeBotId !== undefined) {
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
  const opinion = isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || commandCenterPromptTurn
    ? readSessionOpinion(db, userId, activeConversationId, opinionBotIdForTurn) ??
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
        botId: opinionBotIdForTurn,
        message,
        updatedAt: assistantCreatedAt,
      });
  const botOpinion = isStarterPrompt || personaTransitionTurn || zenAutonomyTurn || zenAskQuestionPatienceTurn || zenLiveActionInterruptTurn || commandCenterPromptTurn
    ? readBotOpinion(db, userId, opinionBotIdForTurn)
    : upsertBotOpinionFromTurn({
        db,
        userId,
        botId: opinionBotIdForTurn,
        message,
        updatedAt: assistantCreatedAt,
      });
  if (
    isZenMode(mode) &&
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn &&
    userMessageId
  ) {
    const sessionMemory = await createZenSessionMemoryCheckpoint({
      db,
      provider: auxiliaryProvider,
      userId,
      conversationId: activeConversationId,
      botId: activeMemoryBotId,
      userKey,
      history,
      userMessage: {
        id: userMessageId,
        role: "user",
        content: message,
        createdAt: now,
      },
      assistantMessage: {
        id: assistantProseMessageId,
        role: "assistant",
        content: assistantDisplay,
        createdAt: assistantCreatedAt,
        provider: providerNameUsed,
        model: modelUsed,
      },
    });
    if (sessionMemory) {
      pushBackendEvent(
        "memory",
        "Zen session checkpoint saved",
        `title=${sessionMemory.title}; expiresAt=${sessionMemory.expiresAt}`
      );
    }
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
  const assistantMessageCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
      )
      .get(activeConversationId, userId) as { n: number }
  ).n;
  if (assistantCountBefore === 0 && assistantMessageCount >= 1 && !zenAutonomyTurn) {
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
    const titleUserMessage = modelUserMessage;
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
  if (
    !skipPersonalFacts &&
    !skipMemoryForMoodCooldownTurn &&
    !isStarterPrompt &&
    !personaTransitionTurn &&
    !zenAutonomyTurn &&
    !zenAskQuestionPatienceTurn &&
    !zenLiveActionInterruptTurn &&
    !commandCenterPromptTurn
  ) {
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
    if (isZenMode(mode) && settings.autoMemory && !skipMemoryForMoodCooldownTurn) {
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
  const activeImageJob = peekActiveImageJobForUser(userId);
  recoverStaleZenWallpaperGenerationStatus(db, userId, {
    conversationId: activeConversationId,
    activeZenWallpaperConversationId:
      activeImageJob?.source === "zen_wallpaper" ? activeImageJob.conversationId : null,
  });
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;
  const conversationColumnNames = new Set(
    conversationColumns.map((column) => column.name)
  );
  const zenWallpaperSelect = conversationColumnNames.has("zen_wallpaper_enabled")
    ? `c.zen_wallpaper_enabled, c.zen_wallpaper_image_id,
              c.zen_wallpaper_prompt_seed, c.zen_wallpaper_message_count,
              c.zen_wallpaper_status,
              ${conversationColumnNames.has("zen_wallpaper_history") ? "c.zen_wallpaper_history" : "'[]' AS zen_wallpaper_history"},`
    : `0 AS zen_wallpaper_enabled, NULL AS zen_wallpaper_image_id,
              NULL AS zen_wallpaper_prompt_seed, NULL AS zen_wallpaper_message_count,
              'idle' AS zen_wallpaper_status, '[]' AS zen_wallpaper_history,`;
  const conversationRow = db
    .prepare(
      `SELECT c.id, c.user_id, c.title, c.conversation_mode, c.bot_id, c.incognito, c.created_at, c.updated_at,
              ${zenWallpaperSelect}
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
    zen_wallpaper_enabled: number | null;
    zen_wallpaper_image_id: string | null;
    zen_wallpaper_prompt_seed: string | null;
    zen_wallpaper_message_count: number | null;
    zen_wallpaper_status: string | null;
    zen_wallpaper_history: string | null;
    last_bot_id: string | null;
    last_bot_color: string | null;
    has_assistant_reply: number;
    created_at: string;
    updated_at: string;
  };

  const conversationModeOut: ChatMode =
    conversationRow.conversation_mode === "zen" ||
    conversationRow.conversation_mode === "chat"
      ? "zen"
      : conversationRow.conversation_mode === "coffee"
        ? "coffee"
        : "sandbox";
  const messageRowsDescOrAsc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.bot_id, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
       FROM messages m
       LEFT JOIN bots b ON b.id = m.bot_id
       WHERE m.conversation_id = ? AND m.user_id = ?
       ORDER BY m.created_at ${conversationModeOut === "zen" ? "DESC" : "ASC"}
       LIMIT ?`
    )
    .all(
      activeConversationId,
      userId,
      conversationModeOut === "zen" ? ZEN_RESTORE_MESSAGE_LIMIT : 100000
    ) as MessageRow[];
  const messageRows =
    conversationModeOut === "zen"
      ? messageRowsDescOrAsc.slice().reverse()
      : messageRowsDescOrAsc;
  const totalMessageCount =
    conversationModeOut === "zen"
      ? (
          db
            .prepare(
              "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND user_id = ?"
            )
            .get(activeConversationId, userId) as { n: number }
        ).n
      : messageRows.length;
  const zenWallpaperOut = mapZenWallpaperMetadata(conversationRow);
  if (conversationModeOut === "zen") {
    Object.assign(
      zenWallpaperOut,
      rebaseZenWallpaperMetadataForVisibleWindow(
        zenWallpaperOut,
        totalMessageCount,
        messageRows.length
      )
    );
  }
  const askQuestionTimedOutMessageIds = loadPrismMoodEventMessageIds(
    db,
    userId,
    activeConversationId,
    "ignored_question"
  );

  const conversationPersisted: Conversation = {
    id: conversationRow.id,
    userId: conversationRow.user_id,
    title: conversationRow.title,
    mode: conversationModeOut,
    botId: conversationModeOut === "zen" ? null : conversationRow.bot_id ?? null,
    incognito: conversationModeOut === "zen" ? false : conversationRow.incognito === 1,
    lastBotId: conversationRow.last_bot_id ?? null,
    lastBotColor: conversationRow.last_bot_color ?? null,
    hasAssistantReply: conversationRow.has_assistant_reply === 1,
    ...(conversationModeOut === "zen" ? { zenWallpaper: zenWallpaperOut } : {}),
    prismMood,
    createdAt: conversationRow.created_at,
    updatedAt: conversationRow.updated_at,
    messages: hydrateMessages(messageRows, { askQuestionTimedOutMessageIds }),
  };

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
    prismMood,
    ...(summaryCompaction ? { summaryCompaction } : {}),
    ...(memoryLearned ? { memoryLearned } : {}),
    ...(conversationStartersPersisted
      ? { conversationStarters: conversationStartersPersisted }
      : {}),
    ...(pendingImageJob ? { pendingImageJob } : {}),
    ...(persistedToolCallEvents.length > 0
      ? { toolCalls: persistedToolCallEvents }
      : {}),
    ...(psychicDebugForTurn ? { psychicDebug: psychicDebugForTurn } : {}),
    ...(zenAutonomyTurn
      ? { zenAutonomyDecision: { action: "speak", botId: assistantMemoryBotId } satisfies ZenAutonomyDecision }
      : {}),
    backendEvents,
  };
}
