export {
  BOT_PROFILE_CATEGORY_LABELS,
  BOT_PROFILE_CATEGORY_ORDER,
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  BOT_VOICE_PRESET_LABELS,
  DEFAULT_BOT_PROFILE_FIELDS,
  composeBotProfileProse,
  defaultBotPurpose,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
  type BotAppearanceProfile,
  type BotCoreProfile,
  type BotIdentityProfile,
  type BotProfileCategoryId,
  type BotProfileFields,
  type BotProfileScaleValue,
  type BotProfileV2,
  type BotPurposeProfile,
  type BotVoicePreset,
  type BotWorldviewProfile,
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
  type StoredAssistantMoodPayload,
  type StoredAssistantToolPayload,
  type StoredMoodKey,
} from "./prismTool.js";

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

import type { AskQuestionPayload } from "./prismTool.js";

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
}

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
   * group conversation. Captured once when the Coffee thread is created
   * (per-thread one-off picker) and frozen for the conversation. The
   * router LLM picks which one of these speaks next on each turn.
   * Always undefined for `chat` and `sandbox` mode rows.
   */
  botGroupIds?: string[];
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
  /** Origin of this memory item. */
  source?: "direct" | "inferred" | "compiled";
  /** Separate certainty channel for inferred/compiled assumptions. */
  certainty?: number;
  /** Message ids this memory was derived from, used for edit/revert cleanup. */
  sourceMessageIds?: string[];
  text: string;
}

export type MemoryValidationStatus = "approved" | "auto_fixed";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "contradiction"
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
 * - `"coffee"`: group chat for 2-5 reactive bots. Each user turn triggers a
 *   router LLM pick (which bot speaks next based on personality + context),
 *   then that bot replies through the standard chat pipeline. Memory is
 *   thread-scoped only (mirrors Sandbox's rolling compaction) — no
 *   cross-thread per-bot memory writes in v0.
 *
 * Defaults to `"sandbox"` on the server when omitted, so pre-`mode` clients
 * keep the previous cross-session memory behavior.
 */
export type ChatMode = "chat" | "sandbox" | "coffee";

/**
 * Companion-only preferences. These are intentionally "feel" controls, not
 * runtime model knobs, so Chat can stay calm and low-control.
 */
export interface ChatCompanionPreferences {
  /** Optional tone cue for the single companion persona. */
  tone?: "grounded" | "warm" | "reflective";
  /** Optional ritual cue used by lightweight Chat check-in UI. */
  ritual?: "none" | "daily-check-in" | "weekly-reflection";
}

/**
 * Advanced runtime controls reserved for Sandbox.
 *
 * In Chat mode these knobs are accepted for backwards compatibility but
 * ignored server-side so the companion contract remains stable.
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
  /** Advanced controls intended for Sandbox-only routing. */
  sandboxControls?: SandboxRuntimeControls;
  /** Back-compat top-level advanced knobs (ignored when mode === "chat"). */
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

/** Request body for `POST /api/coffee/turn`. */
export interface CoffeeTurnRequest {
  /** Existing Coffee conversation id, or omitted for the first turn (server creates a new row). */
  conversationId?: string;
  /**
   * Ordered list of 2-5 bot ids in this group. Required when starting a
   * new conversation; ignored on subsequent turns (server uses the group
   * stored on the conversation row).
   */
  groupBotIds?: string[];
  /**
   * Per-request provider override (matches the Sandbox `/api/chat`
   * `preferredProvider` semantics). When present, replaces the user's
   * saved preference for this turn only. Per-bot online gating still
   * wins — a bot with `online_enabled=0` always falls back to local.
   */
  preferredProvider?: "local" | "openai";
  /** The user's outgoing message. */
  message: string;
}

/** Response body for `POST /api/coffee/turn`. */
export interface CoffeeTurnResponse {
  conversation: Conversation;
  /** The bot id chosen by the router for this turn (matches the assistant message's bot_id). */
  speakerBotId: string;
  /** Optional human-readable router rationale for debugging/inspection. Never shown to the user verbatim. */
  routerReason?: string;
}
