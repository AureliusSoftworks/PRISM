export {
  BOT_FACT_KEY_LABELS,
  BOT_FACT_KEY_ORDER,
  BOT_FACT_KEY_PLACEHOLDERS,
  BOT_PROFILE_CATEGORY_LABELS,
  BOT_PROFILE_CATEGORY_ORDER,
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  BOT_VOICE_PRESET_LABELS,
  DEFAULT_BOT_PROFILE_FIELDS,
  MAX_CUSTOM_FACTS,
  composeBotProfileProse,
  defaultBotPurpose,
  listBotProfileFacts,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
  ageFromIsoBirthday,
  buildImagePersonaContext,
  composeAugmentedImagePrompt,
  composeVerbatimFirstImagePrompt,
  type ImagePromptPersonaBlendMode,
  DEFAULT_IMAGE_PERSONA_CONTEXT_MAX_CHARS,
  parseIsoYmdParts,
  westernZodiacFromIsoBirthday,
  westernZodiacSignFromMonthDay,
  type BotAppearanceProfile,
  type BotBirthEra,
  type BotCoreProfile,
  type BotCustomFact,
  type BotFactKey,
  type BotFactsProfile,
  type BotIdentityProfile,
  type BotProfileCategoryId,
  type BotProfileFields,
  type BotProfileScaleValue,
  type BotProfileV2,
  type BotPurposeProfile,
  type BotVoicePreset,
  type BotWorldviewProfile,
  type WesternZodiacSign,
} from "./botProfile.js";

export {
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  assistantContentHasPrismToolFraming,
  hydrateAssistantMessageParts,
  parseAssistantPrismTools,
  parseStoredAssistantToolPayload,
  parseStoredToolPayload,
  serializeAssistantToolPayload,
  serializeAskQuestionTool,
  type AskQuestionOption,
  type AskQuestionPayload,
  type ParsedAssistantTurn,
  type ParsedStoredAssistantToolPayload,
  type SentGeneratedImagePayload,
  type StoredAssistantMoodPayload,
  type StoredAssistantToolPayload,
  type StoredMoodKey,
} from "./prismTool.js";

export {
  OPENAI_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_OPTIONS_FOR_UI,
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  DEFAULT_OLLAMA_IN_APP_PULL_MODEL,
  isAllowedOpenAiImageModelId,
  normalizeOpenAiImageModelId,
  normalizeOpenAiImageGenerationParams,
  catalogEntriesMatchingLocalImageHeuristic,
  COMFYUI_MODEL_PREFIX,
  encodeComfyUiModelId,
  isComfyUiModelId,
  parseComfyUiCheckpointName,
  isAllowedInAppOllamaPullModelName,
  type OpenAiImageModelId,
  type NormalizedOpenAiImageSize,
  type NormalizedOpenAiImageRequest,
  type OpenAiImageSizeDalle3,
  type OpenAiImageSizeDalle2,
  type LocalImageModelCandidate,
} from "./imageModels.js";

export {
  COMFYUI_REMOTE_WORKFLOW_PREFIX,
  COMFYUI_WORKFLOW_MODEL_PREFIX,
  MAX_COMFY_UI_WORKFLOW_REGISTRATIONS,
  MAX_COMFY_UI_WORKFLOWS_STORED_JSON_BYTES,
  encodeComfyUiRemoteWorkflowModelId,
  encodeComfyUiWorkflowModelId,
  findComfyUiWorkflowBindingByRemotePath,
  findComfyUiWorkflowRegistration,
  isComfyUiApiWorkflowNode,
  isComfyUiRemoteWorkflowModelId,
  isComfyUiWorkflowModelId,
  parseComfyUiRemoteWorkflowPath,
  parseComfyUiWorkflowSlug,
  parseStoredComfyUiWorkflows,
  validateComfyUiWorkflowsPayload,
  type ComfyUiWorkflowInputRef,
  type ComfyUiWorkflowPatchMap,
  type ComfyUiWorkflowRegistration,
} from "./comfyUiWorkflow.js";

export {
  ACCENT_LUMINANCE_MAX_LIGHT,
  ACCENT_LUMINANCE_MAX_LIGHT_YELLOW,
  ACCENT_LIGHTNESS_MAX,
  ACCENT_LIGHTNESS_MAX_DARK,
  ACCENT_LIGHTNESS_MIN,
  ACCENT_LIGHTNESS_MIN_DARK,
  accentLightnessBand,
  clampAccentLightness,
  clampLuminance,
  contrastRatio,
  ensureContrast,
  hexToHsl,
  hslToHex,
  normalizeAccentForTheme,
  pickReadableText,
  relativeLuminance,
  swatchBorderCompensation,
} from "./color.js";

import type { AskQuestionPayload, SentGeneratedImagePayload } from "./prismTool.js";
import type { CoffeeSessionSettings } from "./coffeeSettings.js";

export type UserRole = "user";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  theme: "light" | "dark" | "system";
  preferredProvider: "local" | "openai";
}

export interface AuthSession {
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  /** Provider that generated the message (assistant only; undefined for user/system). */
  provider?: "local" | "openai";
  /** Concrete model id used for this assistant reply, when recorded. */
  model?: string;
  /** Bot that generated the message (assistant only). Resolved from bots.name at read time. */
  botName?: string;
  /** Bot's associated accent color (CSS color string). Resolved from bots.color at read time. */
  botColor?: string;
  /** Bot's associated glyph identifier (opaque key looked up in the client's glyph registry). */
  botGlyph?: string;
  /** Lightweight emotional cue for assistant-message mood rendering. */
  moodKey?: BotMoodKey;
  /** Optional confidence (0-1) for tuning and diagnostics. */
  moodConfidence?: number;
  /** When this assistant row used AskQuestion (`tool_payload` on the server). */
  askQuestion?: AskQuestionPayload;
  /** When this assistant turn included a generated image shown in chat and the library. */
  sentGeneratedImage?: SentGeneratedImagePayload;
}

/**
 * Coffee-only hidden social metrics tracked per bot for a single session.
 * Values are normalized (0-1) to keep prompt shaping and diagnostics simple.
 */
export interface CoffeeBotSocialSnapshot {
  disposition: number;
  valuesFriction: number;
  restraint: number;
  engagement: number;
  leavePressure: number;
}

export interface CoffeeInterruptionSocialDelta {
  botId: string;
  dispositionDelta: number;
  valuesFrictionDelta: number;
}

export interface CoffeePlayerInterruptionInput {
  interruptedMessageId: string;
  interruptedBotId: string;
  visibleTokenCount: number;
}

export interface CoffeeInterruptionEvent {
  kind: "playerInterruptsBot" | "botInterruptsPlayer";
  interruptedBotId: string;
  interrupterBotId?: string;
  interruptedMessageId?: string;
  visibleTokenCount?: number;
  interruptedSnippet?: string;
  socialConsequences: CoffeeInterruptionSocialDelta[];
}

export type CoffeePollStatus = "open" | "collecting" | "closed" | "cancelled";

export type CoffeePollVoteKind = "option" | "abstain" | "pending" | "error";

export type CoffeePollVoterKind = "bot" | "player";

/** Sentinel `botId` stored for the human player's poll vote row. */
export const COFFEE_POLL_PLAYER_VOTER_ID = "__player__";

export interface CoffeePollDeliberation {
  stage:
    | "idle"
    | "evaluating"
    | "teetering"
    | "blocked"
    | "deciding"
    | "finalized"
    | "error";
  leaningOptionIndex?: number | null;
  alternateOptionIndex?: number | null;
  confidence?: number | null;
  blocker?: string | null;
  note?: string | null;
  updatedAt: string;
}

export interface CoffeePollVote {
  botId: string;
  voterKind: CoffeePollVoterKind;
  kind: CoffeePollVoteKind;
  optionIndex?: number | null;
  explanation?: string | null;
  suggestedOption?: string | null;
  confidence?: number | null;
  deliberation?: CoffeePollDeliberation | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoffeePollOptionTally {
  optionIndex: number;
  option: string;
  voteCount: number;
}

export interface CoffeePoll {
  id: string;
  conversationId: string;
  question: string;
  options: string[];
  status: CoffeePollStatus;
  createdBy: "user";
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  votes: CoffeePollVote[];
  tallies: CoffeePollOptionTally[];
}

export type CoffeeSessionDurationMinutes = 2 | 3 | 5;

export const COFFEE_SESSION_DURATION_MINUTES = [2, 3, 5] as const;
export const DEFAULT_COFFEE_SESSION_DURATION_MINUTES: CoffeeSessionDurationMinutes = 5;
/** Bots may hold their Coffee poll vote until this close to session end. */
export const COFFEE_POLL_FINALIZE_REMAINING_MS = 30_000;
/** Minimum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MIN = 2;
/** Maximum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MAX = 4;

export type CoffeePresetMode = "manual" | "auto";

/** How new Coffee Sessions pick a table topic for a saved Coffee Group. */
export type CoffeeTopicSelectionMode = "manual" | "auto";

export interface CoffeePreset {
  id: string;
  name: string;
  settings: CoffeeSessionSettings;
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CoffeeGroupEvent {
  id: string;
  groupId: string;
  type:
    | "created"
    | "renamed"
    | "settings_updated"
    | "roster_updated"
    | "session_created"
    | "model_choice_updated";
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Per-Coffee-Group model picker memory. Keys are provider ids; values are
 * Auto picker model ids (e.g. `"llama3.2"`, `"gpt-5.1"`). Missing or empty
 * keys mean "Auto" / fall back to per-bot defaults.
 */
export interface CoffeeGroupModelChoice {
  local?: string;
  openai?: string;
}

export interface CoffeeGroup {
  id: string;
  userId: string;
  name: string;
  botGroupIds: string[];
  coffeeSeatBotIds: Array<string | null>;
  coffeeSettings: CoffeeSessionSettings;
  presetMode: CoffeePresetMode;
  /** When `auto`, new group sessions pick a random generated topic server-side. */
  topicSelectionMode?: CoffeeTopicSelectionMode;
  /** Server-persisted Coffee model picker per provider. Empty = Auto. */
  modelChoiceByProvider?: CoffeeGroupModelChoice;
  moodSummary?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export {
  COFFEE_HISTORY_WINDOW_HARD_CAP,
  COFFEE_SPEAKER_REPLY_MAX_OUTPUT_TOKENS_HARD,
  COFFEE_TABLE_REPLY_MAX_CHARS_HARD,
  DEFAULT_COFFEE_SESSION_SETTINGS,
  coffeeEffectiveHistoryLimit,
  coffeeEffectiveMemoryCallbacks,
  coffeeReplyLengthCaps,
  coffeeRouterTailMessageCount,
  coffeeRouterTemperature,
  normalizeCoffeeSessionSettings,
  type CoffeeCrossTalkLevel,
  type CoffeeMemoryCallbacks,
  type CoffeeResponseLengthPreset,
  type CoffeeSessionSettings,
  type CoffeeTableEnergy,
} from "./coffeeSettings.js";

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  /** Owning surface for this conversation row. */
  mode?: ChatMode;
  /**
   * Bot the conversation is locked to. Chosen at chat start (Chat mode
   * empty-state picker or Sandbox bot picker) and frozen for the whole
   * conversation — the same bot drives every assistant reply and
   * supplies the shell accent color when the chat is open. `null` means
   * the default grayscale persona (no color wheel, brand mark only).
   *
   * Coffee mode leaves this null and uses {@link botGroupIds} instead.
   */
  botId: string | null;
  /**
   * Coffee-only — ordered list of 2-5 bot ids that participate in this
   * live session. Captured once when the Coffee thread is created and
   * frozen for the conversation. The router LLM picks which one of these
   * speaks next on each turn.
   * Always undefined for `chat` and `sandbox` mode rows.
   */
  botGroupIds?: string[];
  /** Coffee-only — durable parent group for recurring table sessions. */
  coffeeGroupId?: string | null;
  /**
   * Coffee-only — fixed five-seat table layout. Entries are bot ids or null
   * for an empty chair. This preserves visual seat placement separately from
   * the compact participant list above.
   */
  coffeeSeatBotIds?: Array<string | null>;
  /**
   * Coffee-only hidden social values keyed by bot id for this conversation.
   * This is primarily consumed by dev diagnostics and prompt shaping.
   */
  coffeeBotSocialById?: Record<string, CoffeeBotSocialSnapshot>;
  /**
   * Coffee-only — table feel / reply length / focus knobs for this session.
   * Omitted for non-coffee rows.
   */
  coffeeSettings?: CoffeeSessionSettings;
  /** Coffee-only — selected timed session duration, once group sessions own starts. */
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes;
  /** Coffee-only — shared anchor topic for this session (null until chosen). */
  coffeeTopic?: string | null;
  /**
   * Private chat marker — once `true`, accent styling is suppressed to
   * grayscale, the thread stays client-held, and nothing is written to
   * conversation history, the cross-thread `memories` table, or the Qdrant
   * summary index. Provider selection remains a separate user choice.
   */
  incognito: boolean;
  /**
   * Bot id of the MOST RECENT assistant message (regardless of whether
   * that message carries a bot_id). In Chat mode this always matches
   * `botId` once the first reply lands. In Sandbox mode the user can
   * switch bots per-send, so this can drift from `botId` across the
   * thread. Null in two distinct cases:
   *   - The last assistant message was sent under "Default" (no bot).
   *   - No assistant message exists yet.
   * `hasAssistantReply` disambiguates those two — use it alongside
   * `lastBotId` to tell "Default was last" from "no reply yet".
   */
  lastBotId: string | null;
  /**
   * Denormalized color of `lastBotId`'s bot row at the time the server
   * responded. Lets the sidebar tint each conversation row by "whoever
   * last spoke" without the client needing the full bots list —
   * important for Chat mode where bots may have been deleted but still
   * spoke in past conversations. Null when lastBotId is null (Default
   * spoke OR no reply yet).
   */
  lastBotColor: string | null;
  /**
   * Whether the conversation has at least one assistant message.
   * Present so the client can distinguish "Default bot spoke last"
   * (hasAssistantReply=true, lastBotId=null) from "no reply yet"
   * (hasAssistantReply=false, lastBotId=null). The two cases want
   * different visual treatment on the sidebar: Default-last renders the
   * row WHITE, no-reply-yet falls back to the locked bot's color.
   */
  hasAssistantReply: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface UserMemory {
  id: string;
  userId: string;
  conversationId?: string;
  botId?: string;
  createdAt: string;
  confidence: number;
  /** What this memory is about, used for memory-panel organization. */
  category?: MemoryCategory;
  /** Short-term memories can be rewritten/removed; long-term memories must be demoted first. */
  tier?: MemoryTier;
  /** Origin of this memory item. */
  source?: "direct" | "inferred" | "compiled" | "about_you";
  /** Separate certainty channel for inferred/compiled assumptions. */
  certainty?: number;
  /** How likely this memory is to remain useful across future chats. */
  durability?: number;
  /** Message ids this memory was derived from, used for edit/revert cleanup. */
  sourceMessageIds?: string[];
  text: string;
}

export type MemoryCategory = "general" | "user" | "bot_relation";
export type MemoryTier = "short_term" | "long_term";

export {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  sanitizeHiddenModelIds,
  resolveAutoModel,
  type AutoModelProvider,
  type CatalogShapeForAuto,
  type ResolveAutoModelInput,
  type ResolvedAutoModel,
} from "./modelRouting.js";

export {
  LONG_TERM_HIGH_TRUTH_SCORE,
  LONG_TERM_MEMORY_SCORE,
  LONG_TERM_MIN_DURABILITY_FOR_HIGH_TRUTH,
  classifyMemoryCategoryFromText,
  memoryLongTermScore,
  memoryQualifiesLongTerm,
  memoryTruthScore,
  type MemorySource,
} from "./memoryClassification.js";

export type MemoryValidationStatus = "approved" | "auto_fixed";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "figurative_preference"
  | "implausible_literal"
  | "joke_without_stable_signal"
  | "contradiction"
  | "unsafe_judgment"
  | "low_confidence"
  | "malformed_text"
  | "validator_error";

export interface MemoryValidationEvent {
  validationStatus?: MemoryValidationStatus;
  originalText?: string;
  reasonCodes?: MemoryValidationReasonCode[];
}

/**
 * Post-auth surface the user is chatting from.
 *
 * - `"chat"`: the calm, stripped-down personal Prism. Honors auto-memory and
 *   per-send `incognito` (where incognito keeps the conversation entirely
 *   ephemeral without changing the selected provider).
 * - `"sandbox"`: the full command-center. Cross-session memory is disabled
 *   entirely here — the rolling message window IS the thread's memory. The
 *   `incognito` flag is ignored for Sandbox requests.
 * - `"coffee"`: timed live conversation for 2-5 reactive bots. User turns and
 *   autonomous timed turns trigger a router LLM pick (which bot speaks next
 *   based on personality + context), then that bot replies through the Coffee
 *   pipeline. Memory is thread-scoped only in the first pass.
 *
 * Defaults to `"sandbox"` on the server when omitted, so pre-`mode` clients
 * keep the previous cross-session memory behavior.
 */
export type ChatMode = "chat" | "sandbox" | "coffee";

/**
 * Companion-only preferences. These are intentionally "feel" controls, while
 * an explicit model picker choice may still override the bot/account default.
 */
export interface ChatCompanionPreferences {
  /** Optional tone cue for the single companion persona. */
  tone?: "grounded" | "warm" | "reflective";
  /** Optional ritual cue used by lightweight Chat check-in UI. */
  ritual?: "none" | "daily-check-in" | "weekly-reflection";
}

/**
 * Advanced runtime controls. Sandbox uses the full set; Chat may honor the
 * explicit model choice while keeping the rest of the companion contract stable.
 */
export interface SandboxRuntimeControls {
  preferredProvider?: "local" | "openai";
  modelOverride?: string;
  botId?: string | null;
}

export interface ChatRequestPayload {
  conversationId?: string;
  /** When true, bypass "reuse latest chat" and start a fresh conversation row. */
  forceNewConversation?: boolean;
  message: string;
  starterPrompt?: boolean;
  mode?: ChatMode;
  /** Companion-only optional preferences (used only when mode === "chat"). */
  companionPreferences?: ChatCompanionPreferences;
  /** Advanced controls for runtime routing. */
  sandboxControls?: SandboxRuntimeControls;
  /** Back-compat top-level advanced knobs. Chat honors explicit modelOverride only. */
  preferredProvider?: "local" | "openai";
  modelOverride?: string;
  botId?: string | null;
  /**
   * Client-held prior messages for an incognito chat. The server uses this as
   * prompt context only; private turns are never read from or written to
   * persisted conversation/message storage.
   */
  ephemeralMessages?: ChatMessage[];
  /** Optional signal to trigger end-of-session rolling compaction. */
  sessionEnding?: boolean;
}

/**
 * Optional quick-reply labels inferred from the assistant's opening turn when
 * the user starts via "Talk to me!" ({@link ChatRequestPayload.starterPrompt}).
 */
export interface StarterChatExtras {
  conversationStarters?: string[];
}

export type OpinionBand = "guarded" | "warming" | "trusting";
export type OpinionTrend = "up" | "down" | "steady";
export type BotMoodKey = "joyful" | "warm" | "neutral" | "guarded" | "strained";

export interface SessionOpinion {
  score: number;
  band: OpinionBand;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  updatedAt: string;
}

export type BotOpinionBand = "wounded" | "careful" | "open" | "bonded";
export type BotOpinionBoundaryLevel = "none" | "gentle" | "firm";

export interface BotOpinion {
  score: number;
  band: BotOpinionBand;
  boundaryLevel: BotOpinionBoundaryLevel;
  trend: OpinionTrend;
  lastReason: string;
  recentReasons: string[];
  repairCount: number;
  updatedAt: string;
}

export interface ChatResponsePayload extends StarterChatExtras {
  conversation: Conversation;
  assistantMessage: ChatMessage;
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
    rejected?: Array<{
      originalText: string;
      reasonCodes: MemoryValidationReasonCode[];
      notes?: string;
    }>;
    maxConfidence: number;
  };
}

export interface ConversationSummaryDebug {
  mode: ChatMode;
  conversationId: string;
  inProgress: boolean;
  latestSummary: string | null;
  latestSummaryAt: string | null;
  summaryCount: number;
  totalMessages: number;
  messagesSinceLastCompaction: number;
}

export type CoffeeArrivalScenario =
  | "user-first"
  | "partial-table-in-progress"
  | "full-table-present";

/** Request body for `POST /api/coffee/sessions`. */
export interface CoffeeSessionCreateRequest {
  /** Fixed five-seat table layout; null entries are empty chairs. */
  groupBotIds: Array<string | null>;
  /** Optional session tuning; omitted rows use server defaults. */
  coffeeSettings?: unknown;
  /** Optional opening poll that seeds the initial table topic. */
  initialPoll?: CoffeePollCreateRequest;
}

/** Response body for `POST /api/coffee/sessions`. */
export interface CoffeeSessionCreateResponse {
  conversation: Conversation;
  /** Opening setup used by the client arrival animation. */
  arrivalScenario: CoffeeArrivalScenario;
  /**
   * Suggested topic chips for manual selection (omitted when the server
   * already persisted {@link Conversation.coffeeTopic}, e.g. auto-topic groups).
   */
  coffeeStarterTopics?: string[];
  /** Present when the session started with an opening poll. */
  poll?: CoffeePoll;
}

/** Request body for `POST /api/coffee/sessions/:id/continue`. */
export interface CoffeeContinueRequest {
  /**
   * Per-request provider override for the next bot reply. Per-bot online
   * gating still wins — a bot with `online_enabled=0` falls back to local.
   */
  preferredProvider?: "local" | "openai";
  /**
   * Optional director-mode pick. When present, the server asks this seated bot
   * to speak instead of running the automatic speaker router.
   */
  directedSpeakerBotId?: string;
  /** Client hint used for rare bot-interrupt presentation while composing. */
  userIsComposing?: boolean;
}

/** Request body for `PATCH /api/coffee/sessions/:id/settings`. */
export interface CoffeeSessionSettingsPatchRequest {
  coffeeSettings: unknown;
}

/** Request body for `POST /api/coffee/turn`. */
export interface CoffeeTurnRequest {
  /** Existing Coffee conversation id, or omitted for legacy first-turn creation. */
  conversationId?: string;
  /**
   * Ordered list of 2-5 bot ids, or a fixed five-seat layout with null empty
   * seats. Required only for legacy first-turn creation; ignored on subsequent
   * turns (server uses the group stored on the conversation row). New clients
   * should create a Coffee session first via `POST /api/coffee/sessions`.
   */
  groupBotIds?: Array<string | null>;
  /**
   * Per-request provider override (matches the Sandbox `/api/chat`
   * `preferredProvider` semantics). When present, replaces the user's
   * saved preference for this turn only. Per-bot online gating still
   * wins — a bot with `online_enabled=0` always falls back to local.
   */
  preferredProvider?: "local" | "openai";
  /** The user's outgoing message. */
  message: string;
  /** Optional player-interruption metadata from the live table reveal state. */
  playerInterruption?: CoffeePlayerInterruptionInput;
}

/** Response body for `POST /api/coffee/turn`. */
export interface CoffeeTurnResponse {
  conversation: Conversation;
  /** The bot id chosen by the router for this turn (matches the assistant message's bot_id). */
  speakerBotId: string;
  /** Optional human-readable router rationale for debugging/inspection. Never shown to the user verbatim. */
  routerReason?: string;
  /** Optional interruption event payload for live Coffee table presentation. */
  interruption?: CoffeeInterruptionEvent;
  /** Present when a Coffee user turn started an async image generation job. */
  pendingImageJob?: {
    jobId: string;
    conversationId: string | null;
  };
}

/** Request body for `POST /api/coffee/sessions/:id/polls`. */
export interface CoffeePollCreateRequest {
  question: string;
  options: string[];
}

/** Response body for `POST /api/coffee/sessions/:id/polls`. */
export interface CoffeePollCreateResponse {
  poll: CoffeePoll;
}

/** Request body for `POST /api/coffee/sessions/:id/polls/:pollId/collect`. */
export interface CoffeePollCollectVotesRequest {
  preferredProvider?: "local" | "openai";
  sessionRemainingMs?: number | null;
  /** Optional player vote to record before bot deliberation is advanced. */
  optionIndex?: number;
}

/** Response body for `POST /api/coffee/sessions/:id/polls/:pollId/collect`. */
export interface CoffeePollCollectVotesResponse {
  poll: CoffeePoll;
}

/** Request body for `POST /api/coffee/sessions/:id/polls/:pollId/vote`. */
export interface CoffeePollPlayerVoteRequest {
  optionIndex: number;
  sessionRemainingMs?: number | null;
}

/** Response body for `POST /api/coffee/sessions/:id/polls/:pollId/vote`. */
export interface CoffeePollPlayerVoteResponse {
  poll: CoffeePoll;
}
