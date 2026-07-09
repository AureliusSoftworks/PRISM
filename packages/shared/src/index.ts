import type { TellFictionalStoryPayload, WebSearchPayload } from "./prismTool.js";
import type { PrismMoodIgnoredQuestionPenaltyLevel } from "./mood.js";

export {
  applyPrismMoodExpiredIgnoreCooldown,
  applyPrismMoodForgivenessSuccess,
  applyPrismMoodIgnoredQuestion,
  applyPrismMoodInterruption,
  applyPrismMoodIgnoreCooldown,
  applyPrismMoodIgnoredTurn,
  applyPrismMoodNegativeTurn,
  applyPrismMoodPositiveTurn,
  clampPrismMoodValue,
  COFFEE_NEAR_DESATURATED_SATURATION,
  coffeeDepartureChanceFromSocial,
  coffeeMoodSaturationFromSocial,
  coffeeSocialSnapshotToPrismMoodState,
  coffeeSocialSnapshotIsNearDesaturated,
  createDefaultPrismMoodState,
  DEFAULT_PRISM_MOOD_SENSITIVITY,
  debugPatchPrismMood,
  decayPrismMood,
  derivePrismMoodConfidence,
  derivePrismMoodKey,
  interruptionProgressWeight,
  isPrismMoodIgnoring,
  MAX_PRISM_MOOD_SENSITIVITY,
  MIN_PRISM_MOOD_SENSITIVITY,
  normalizePrismMoodSensitivity,
  PRISM_MOOD_IGNORE_COOLDOWN_MS,
  PRISM_MOOD_IGNORE_FORGIVENESS_CHANCE,
  PRISM_MOOD_IGNORE_FORGIVENESS_STEP,
  prismMoodDeclineReason,
  prismMoodIgnoreForgivenessChance,
  prismMoodIgnoreUntilMs,
  prismMoodInterruptionStreak,
  resetPrismMood,
  sanitizePrismMoodState,
  shouldPrismMoodDeclineResponse,
  shouldPrismMoodStartIgnoreCooldown,
  type CoffeeSocialLikeSnapshot,
  type PrismMoodDebugPatch,
  type PrismMoodDelta,
  type PrismMoodDeltaKind,
  type PrismMoodIgnoredQuestionPenaltyLevel,
  type PrismMoodInterruptionInput,
  type PrismMoodKey,
  type PrismMoodMode,
  type PrismMoodSnapshot,
  type PrismMoodState,
} from "./mood.js";

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
  BOT_FACE_FONT_IDS,
  BOT_FACE_FONT_LABELS,
  BOT_FACE_FONT_WEIGHT_MAX,
  BOT_FACE_FONT_WEIGHT_MIN,
  BOT_FACE_FONT_WEIGHT_STEP,
  BOT_FACE_BLINK_BAR_VALUES,
  BOT_FACE_EYE_OFFSET_Y_MAX,
  BOT_FACE_EYE_OFFSET_Y_MIN,
  BOT_FACE_EYE_OFFSET_Y_STEP,
  BOT_FACE_EYE_SCALE_MAX,
  BOT_FACE_EYE_SCALE_MIN,
  BOT_FACE_EYE_SCALE_STEP,
  DEFAULT_BOT_FACE_BLINK_BAR,
  DEFAULT_BOT_FACE_EYE_CHARACTER,
  DEFAULT_BOT_FACE_EYE_OFFSET_Y,
  DEFAULT_BOT_FACE_EYE_SCALE,
  DEFAULT_BOT_FACE_FONT_ID,
  DEFAULT_BOT_FACE_FONT_WEIGHT,
  botFaceFontFromVoicePreset,
  isBotFaceFontId,
  normalizeBotFaceBlinkBar,
  normalizeBotFaceEyeCharacter,
  normalizeBotFaceEyeOffsetY,
  normalizeBotFaceEyeScale,
  normalizeBotFaceFontId,
  normalizeBotFaceFontWeight,
  randomBotFaceStyle,
  resolveBotFaceStyle,
  type BotFaceBlinkBar,
  type BotFaceFontId,
  type BotFaceStyle,
  type BotFaceStyleInput,
} from "./botAvatar.js";

export {
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  assistantContentHasPrismToolFraming,
  hydrateAssistantMessageParts,
  normalizeCoffeeReplayEventPayload,
  normalizeZenDisplayMetadata,
  normalizeStoredZenAssistantTurnPayload,
  parseAssistantPrismTools,
  parseStoredAssistantToolPayload,
  parseStoredToolPayload,
  serializeAssistantToolPayload,
  serializeAskQuestionTool,
  type AskQuestionOption,
  type AskQuestionPayload,
  type CoffeeAmbientActionPayload,
  type CoffeeReplayArrivalEventPayload,
  type CoffeeReplayEventPayload,
  type CoffeeReplayMoodEventPayload,
  type CoffeeReplaySocialSnapshotPayload,
  type CoffeeReplayTopOffEventPayload,
  type CoffeeUserActionPayload,
  type ParsedAssistantTurn,
  type ParsedStoredAssistantToolPayload,
  type SentGeneratedImagePayload,
  type TellFictionalStoryPayload,
  type WebSearchPayload,
  type WebSearchRequestPayload,
  type WebSearchResult,
  type StoredAssistantMoodPayload,
  type StoredAssistantToolPayload,
  type StoredMoodKey,
  type StoredZenAssistantTurnKind,
  type StoredZenAssistantTurnPayload,
  type ZenDisplayAlign,
  type ZenDisplayLinePlacement,
  type ZenDisplayMetadata,
  type ZenDisplayPlacement,
} from "./prismTool.js";

export {
  normalizePromptShortcutMetadata,
  isDisabledPromptWildcardToken,
  normalizeBuiltInPromptWildcardSlotKey,
  normalizeManualAskQuestionResultPayload,
  normalizePromptWildcardRunMetadata,
  parseBuiltInPromptWildcardReference,
  parseStoredManualAskQuestionPayload,
  normalizePsychicThoughtPayload,
  parseStoredPromptShortcutPayload,
  parseStoredPromptWildcardPayload,
  parseStoredPsychicThoughtPayload,
  serializePromptShortcutPayload,
  serializePromptToolPayload,
  withPromptShortcutResolvedPrompt,
  withPromptWildcardResolvedPrompt,
  BUILT_IN_PROMPT_WILDCARD_SLOTS,
  getBuiltInPromptWildcardSlot,
  type BuiltInPromptWildcardReference,
  type BuiltInPromptWildcardSlot,
  type BuiltInPromptWildcardSlotKey,
  type ManualAskQuestionResultOption,
  type ManualAskQuestionResultPayload,
  type PromptShortcutFlag,
  type PromptShortcutMetadata,
  type PromptShortcutRunMetadata,
  type PromptShortcutWildcardReplacement,
  type PromptWildcardRunMetadata,
  type PsychicThoughtPayload,
} from "./promptShortcut.js";

export {
  ELEVENLABS_IMAGE_MODEL_IDS,
  ELEVENLABS_IMAGE_MODEL_OPTIONS_FOR_UI,
  isElevenLabsImageModelId,
  type ElevenLabsImageModelId,
} from "./elevenLabsImageModels.js";

export {
  OPENAI_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_OPTIONS_FOR_UI,
  DEFAULT_OPENAI_IMAGE_MODEL_ID,
  DEFAULT_OLLAMA_IN_APP_PULL_MODEL,
  isAllowedOpenAiImageModelId,
  isGptImageModelId,
  normalizeOpenAiImageModelId,
  normalizeOpenAiImageGenerationParams,
  catalogEntriesMatchingLocalImageHeuristic,
  COMFYUI_MODEL_PREFIX,
  encodeComfyUiModelId,
  isComfyUiModelId,
  parseComfyUiCheckpointName,
  isAllowedInAppOllamaPullModelName,
  type OpenAiImageModelId,
  type OpenAiImageSizeGpt,
  type NormalizedOpenAiImageSize,
  type NormalizedOpenAiImageQuality,
  type NormalizedOpenAiImageRequest,
  type LocalImageModelCandidate,
} from "./imageModels.js";

export {
  COMFYUI_REMOTE_WORKFLOW_PREFIX,
  COMFYUI_WORKFLOW_MODEL_PREFIX,
  MAX_COMFY_UI_WORKFLOW_REGISTRATIONS,
  MAX_COMFY_UI_WORKFLOWS_STORED_JSON_BYTES,
  encodeComfyUiRemoteWorkflowModelId,
  encodeComfyUiWorkflowModelId,
  formatComfyUiRemoteWorkflowLabel,
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
  REASONING_EFFORT_VALUES,
  normalizeReasoningEffort,
  openAiModelSupportsReasoningEffort,
  reasoningEffortForRequest,
  type ReasoningEffort,
  type RequestReasoningEffort,
} from "./reasoningEffort.js";

export {
  PRISM_DEFAULT_STORY_THEME,
  PRISM_DEFAULT_STORY_THEME_ID,
  STORY_ITEM_GLYPH_CATEGORIES,
  STORY_SPRITE_POSES,
  STORY_THEME_PUBLIC_BASE_PATH,
  getBuiltinStoryThemes,
  getStoryThemeById,
  isBuiltinStoryThemeAsset,
  type StoryAssetKind,
  type StoryItemGlyphCategory,
  type StorySpritePose,
  type StoryThemeAsset,
  type StoryThemeManifest,
} from "./storyThemes.js";

export {
  STORY_BOT_COUNT_MAX,
  STORY_BOT_COUNT_MIN,
  STORY_CHOICE_COUNT_MAX,
  STORY_CHOICE_COUNT_MIN,
  STORY_ENDING_COUNT_MAX,
  STORY_ENDING_COUNT_MIN,
  STORY_LOCATION_COUNT_MAX,
  STORY_LOCATION_COUNT_MIN,
  STORY_SCENE_COUNT_MAX,
  STORY_SCENE_COUNT_MIN,
  applyStoryChoice,
  applyStoryItemPickup,
  applyStoryTravel,
  createInitialStoryProgress,
  createInitialStoryTranscript,
  createStorySceneTranscriptEntry,
  getStoryCurrentScene,
  getStoryLocation,
  getStoryScene,
  validateStoryEpisodeManifest,
  type StoryChoice,
  type StoryEpisodeManifest,
  type StoryInventoryItem,
  type StoryLocation,
  type StoryProgressStatus,
  type StoryScene,
  type StorySessionChoiceRequest,
  type StorySessionCreateRequest,
  type StorySessionCreateResponse,
  type StorySessionDeleteResponse,
  type StorySessionDetail,
  type StorySessionDetailResponse,
  type StorySessionItemRequest,
  type StorySessionListResponse,
  type StorySessionMutationResponse,
  type StorySessionProgress,
  type StorySessionStatus,
  type StorySessionSummary,
  type StorySessionTravelRequest,
  type StoryTranscriptEntry,
  type StoryTranscriptEntryKind,
  type StoryTransitionResult,
} from "./storyRuntime.js";

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

import type {
  AskQuestionPayload,
  CoffeeAmbientActionPayload,
  CoffeeReplayEventPayload,
  CoffeeUserActionPayload,
  SentGeneratedImagePayload,
  ZenDisplayMetadata,
} from "./prismTool.js";
import type {
  ManualAskQuestionResultPayload,
  PromptShortcutMetadata,
  PromptWildcardRunMetadata,
  PsychicThoughtPayload,
} from "./promptShortcut.js";
import type { CoffeeSessionSettings } from "./coffeeSettings.js";
import type { PrismMoodInterruptionInput, PrismMoodKey, PrismMoodSnapshot } from "./mood.js";
import type { ReasoningEffort } from "./reasoningEffort.js";

export type UserRole = "user";
export type LlmProviderName = "local" | "openai" | "anthropic";

export type UsageProviderName =
  | LlmProviderName
  | "ollama"
  | "comfyui"
  | "unknown";

export type UsageRange = "24h" | "7d" | "30d" | "all";

export type UsagePrivacyScope = "normal" | "private";

export type UsageEventType = "text" | "embedding" | "image";

export type UsageTokenCountSource =
  | "provider_reported"
  | "estimated"
  | "unavailable";

export type UsagePurpose =
  | "chat_reply"
  | "chat_boundary"
  | "chat_fallback"
  | "chat_web_search_followup"
  | "conversation_title"
  | "coffee_turn"
  | "coffee_router"
  | "coffee_summary"
  | "composer_cleanup"
  | "embedding"
  | "image_generation"
  | "bot_profile_picture"
  | "image_prompt"
  | "memory_inference"
  | "memory_summary"
  | "prompt_wildcard"
  | "psychic_planning"
  | "story_generation"
  | "zen_live_action"
  | "system_unlabeled";

export interface UsageTotals {
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  localTokens: number;
  onlineTokens: number;
  imageCount: number;
  estimatedCostMicroUsd: number;
  providerReportedEvents: number;
  estimatedTokenEvents: number;
  unpricedOnlineEvents: number;
}

export interface UsageBreakdownItem extends UsageTotals {
  key: string;
  label: string;
  provider?: UsageProviderName;
  model?: string;
  purpose?: UsagePurpose;
}

export interface UsageRecentEvent {
  id: string;
  createdAt: string;
  surface: string;
  mode: string | null;
  purpose: UsagePurpose;
  provider: UsageProviderName;
  model: string;
  eventType: UsageEventType;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokenCountSource: UsageTokenCountSource;
  imageCount: number | null;
  imageSize: string | null;
  imageQuality: string | null;
  estimatedCostMicroUsd: number | null;
  costEstimated: boolean;
  unpriced: boolean;
}

export interface UsageResponse {
  ok: true;
  range: UsageRange;
  rangeStart: string | null;
  generatedAt: string;
  totals: UsageTotals;
  byProvider: UsageBreakdownItem[];
  byModel: UsageBreakdownItem[];
  byPurpose: UsageBreakdownItem[];
  recentEvents: UsageRecentEvent[];
  trackingStartedAt: string | null;
  hasUntrackedHistory: boolean;
  conversationScoped: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  theme: "light" | "dark" | "system";
  preferredProvider: LlmProviderName;
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
  provider?: LlmProviderName;
  /** Concrete model id used for this assistant reply, when recorded. */
  model?: string;
  /** Bot/persona id attributed to this message. Null/undefined = default PRISM. */
  botId?: string | null;
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
  /** Display-only Zen layout hint; ignored outside Zen surfaces. */
  zenDisplay?: ZenDisplayMetadata;
  /** When this assistant row used AskQuestion (`tool_payload` on the server). */
  askQuestion?: AskQuestionPayload;
  /** True once the pending AskQuestion was closed by the Zen patience timer. */
  askQuestionTimedOut?: boolean;
  /** Story action rail metadata for long fictional prose. */
  tellFictionalStory?: TellFictionalStoryPayload;
  /** When this assistant turn included a generated image shown in chat and the library. */
  sentGeneratedImage?: SentGeneratedImagePayload;
  /** When this assistant turn included web search results shown as a source card. */
  webSearch?: WebSearchPayload;
  /** Coffee-only scripted ambient action shown as table UI, not transcript prose. */
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
  /** Coffee-only user action cue shown as ambient context, not transcript prose. */
  coffeeUserAction?: CoffeeUserActionPayload;
  /** Coffee-only hidden replay state beats; not shown in normal transcripts. */
  coffeeReplayEvents?: CoffeeReplayEventPayload[];
  /** User-entered Prompt Center shortcut that resolved into this message content. */
  promptShortcut?: PromptShortcutMetadata;
  /** User-entered wildcard decks/options that resolved into this message content. */
  promptWildcards?: PromptWildcardRunMetadata;
  /** User-entered AskQuestion tool result completed by the assistant's selected choice. */
  manualAskQuestion?: ManualAskQuestionResultPayload;
  /** Concise visible summary from Psychic mode for this user turn. */
  psychicThought?: PsychicThoughtPayload;
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

export type CoffeeTeamId = "left" | "undecided" | "right";

export type CoffeeWinningTeamId = "left" | "right";

export interface CoffeeTeamDefinition {
  id: CoffeeWinningTeamId;
  name: string;
  description: string;
}

export interface CoffeeTeamSessionConfig {
  left: Omit<CoffeeTeamDefinition, "id">;
  right: Omit<CoffeeTeamDefinition, "id">;
  assignments: Record<string, CoffeeTeamId>;
  playerTeamId?: CoffeeTeamId;
}

export interface CoffeeTeamBotState {
  botId: string;
  originalTeamId: CoffeeTeamId;
  currentTeamId: CoffeeTeamId;
  satisfaction: number;
  conviction: number;
  pendingSwitchTeamId?: CoffeeWinningTeamId | null;
  pendingSwitchReason?: string | null;
  lastSwitchReason?: string | null;
  updatedAt: string;
}

export interface CoffeeTeamCounts {
  left: number;
  undecided: number;
  right: number;
}

export interface CoffeeTeamPlayerState {
  originalTeamId: CoffeeTeamId;
  currentTeamId: CoffeeTeamId;
  lastSwitchReason?: string | null;
  updatedAt: string;
}

export type CoffeeTeamsStatus =
  | "active"
  | "left_won"
  | "right_won"
  | "tiebreaker"
  | "tie_resolved";

export interface CoffeeTeamState {
  left: CoffeeTeamDefinition;
  right: CoffeeTeamDefinition;
  undecidedLabel: "Undecided";
  bots: Record<string, CoffeeTeamBotState>;
  player?: CoffeeTeamPlayerState | null;
  counts: CoffeeTeamCounts;
  status: CoffeeTeamsStatus;
  winnerTeamId?: CoffeeWinningTeamId | null;
  tiebreakerPitches?: Record<CoffeeWinningTeamId, string> | null;
  tiebreakerPromptedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CoffeeSessionDurationMinutes = number;

export const COFFEE_SESSION_DURATION_MINUTES_MIN = 3;
export const COFFEE_SESSION_DURATION_MINUTES_MAX = 30;
export const COFFEE_SESSION_DURATION_MINUTES_STEP = 1;
export const DEFAULT_COFFEE_SESSION_DURATION_MINUTES: CoffeeSessionDurationMinutes = 10;

export type CoffeeCupAmountStage =
  | "full"
  | "mostly-full"
  | "half"
  | "low"
  | "dregs"
  | "empty";

export interface CoffeeCupStatus {
  progress: number;
  frameIndex: number;
  amount: CoffeeCupAmountStage;
  fillRatio: number;
  coldness: number;
  amountLabel: string;
  temperatureLabel: string;
  tasteLabel: string;
}

export interface CoffeeCupTopOffSnapshot {
  progressBefore: number;
  progressAfter: number;
  toppedOffAt: string;
}

const COFFEE_CUP_AMOUNT_LABELS: Record<CoffeeCupAmountStage, string> = {
  full: "full",
  "mostly-full": "mostly full",
  half: "about half full",
  low: "running low",
  dregs: "down to the last dregs",
  empty: "empty",
};

const COFFEE_CUP_TASTE_LABELS = [
  "bright",
  "smooth",
  "strong",
  "toasty",
  "slightly bitter",
  "mellow",
] as const;

const COFFEE_CUP_TOP_OFF_TARGET_PROGRESS = 0.04;
const COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS = 0.18;
const COFFEE_CUP_TOP_OFF_PROGRESS_BY_FRAME_INDEX = [
  COFFEE_CUP_TOP_OFF_TARGET_PROGRESS,
  COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS,
  0.38,
  0.58,
  0.78,
  0.96,
] as const;

function clampCoffeeCupProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function coffeeCupStableIndex(seed: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, modulo);
}

function coffeeCupStableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function coffeeCupSipBias(seed: string): number {
  return coffeeCupStableUnitValue(`${seed}:sip-bias`);
}

export function coffeeCupSessionDurationPaceMultiplier(
  durationMinutes?: CoffeeSessionDurationMinutes | null
): number {
  const minutes =
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const extraMinutes = Math.max(0, minutes - COFFEE_SESSION_DURATION_MINUTES_MIN);
  return 1 + extraMinutes * 0.02;
}

export function coffeeCupSipMessageGapForDuration(
  durationMinutes?: CoffeeSessionDurationMinutes | null,
  baseGap = 5
): number {
  const safeBaseGap =
    typeof baseGap === "number" && Number.isFinite(baseGap)
      ? Math.max(1, Math.floor(baseGap))
      : 5;
  return Math.max(
    safeBaseGap,
    Math.ceil(safeBaseGap * coffeeCupSessionDurationPaceMultiplier(durationMinutes))
  );
}

export function coffeeCupSipCycleMs(
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null
): number {
  const baseCycleMs = 34_000 - Math.round(coffeeCupSipBias(seed) * 15_000);
  return Math.round(baseCycleMs * coffeeCupSessionDurationPaceMultiplier(durationMinutes));
}

export function coffeeCupConsumptionRate(
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null
): number {
  const baseRate = 1.12 + coffeeCupSipBias(seed) * 0.58;
  return baseRate / coffeeCupSessionDurationPaceMultiplier(durationMinutes);
}

export function coffeeCupPacedProgress(
  progress: number,
  seed: string,
  durationMinutes?: CoffeeSessionDurationMinutes | null
): number {
  return clampCoffeeCupProgress(
    progress * coffeeCupConsumptionRate(seed, durationMinutes)
  );
}

export function coffeeCupFillRatioForProgress(progress: number): number {
  return Math.max(0, 1 - clampCoffeeCupProgress(progress));
}

export function coffeeCupColdnessForProgress(progress: number): number {
  return clampCoffeeCupProgress(progress);
}

export function coffeeCupSipLikelihoodForProgress(progress: number): number {
  const clamped = clampCoffeeCupProgress(progress);
  if (clamped >= 0.96) return 0;
  const fillRatio = coffeeCupFillRatioForProgress(clamped);
  if (fillRatio <= 0.04) return 0;
  const fillFactor =
    fillRatio >= 0.18 ? 1 : Math.max(0, Math.min(1, (fillRatio - 0.04) / 0.14));
  const coldness = coffeeCupColdnessForProgress(clamped);
  const temperatureFactor =
    coldness >= 0.9
      ? 0.18
      : Math.max(0.18, 1 - Math.pow(coldness, 1.6) * 0.72);
  return Math.max(0, Math.min(1, fillFactor * temperatureFactor));
}

export function coffeeCupShouldFinishAfterSip(args: {
  seed: string;
  previousProgress: number;
  nextProgress?: number | null;
  sipCount?: number | null;
}): boolean {
  const previousProgress = clampCoffeeCupProgress(args.previousProgress);
  const nextProgress =
    typeof args.nextProgress === "number" && Number.isFinite(args.nextProgress)
      ? clampCoffeeCupProgress(args.nextProgress)
      : previousProgress;
  if (previousProgress >= 0.96 && nextProgress >= 0.96) return true;
  const nextColdness = coffeeCupColdnessForProgress(nextProgress);
  if (nextColdness < 0.9) return false;
  const wholeSipCount =
    typeof args.sipCount === "number" && Number.isFinite(args.sipCount)
      ? Math.max(1, Math.floor(args.sipCount))
      : 1;
  const coldFinishChance = Math.min(
    0.35,
    0.12 + Math.max(0, nextColdness - 0.9) * 2.3
  );
  return (
    coffeeCupStableUnitValue(`${args.seed}:finish-after-sip:${wholeSipCount}`) <
    coldFinishChance
  );
}

export function coffeeCupFrameIndexForProgress(progress: number): number {
  const clamped = clampCoffeeCupProgress(progress);
  if (clamped >= 0.96) return 5;
  if (clamped >= 0.78) return 4;
  if (clamped >= 0.58) return 3;
  if (clamped >= 0.38) return 2;
  if (clamped >= 0.18) return 1;
  return 0;
}

export function coffeeCupTopOffProgressForFrameIndex(frameIndex: number): number {
  const frame = Math.max(0, Math.min(5, Math.round(frameIndex)));
  return COFFEE_CUP_TOP_OFF_PROGRESS_BY_FRAME_INDEX[frame]!;
}

export function coffeeCupStatusForProgress(
  progress: number,
  seed = "coffee"
): CoffeeCupStatus {
  const clamped = clampCoffeeCupProgress(progress);
  const frameIndex = coffeeCupFrameIndexForProgress(clamped);
  const fillRatio = coffeeCupFillRatioForProgress(clamped);
  const coldness = coffeeCupColdnessForProgress(clamped);
  const amount: CoffeeCupAmountStage =
    frameIndex === 0
      ? "full"
      : frameIndex === 1
        ? "mostly-full"
        : frameIndex === 2
          ? "half"
          : frameIndex === 3
            ? "low"
            : frameIndex === 4
              ? "dregs"
              : "empty";
  const temperatureLabel =
    coldness < 0.18
      ? "hot"
      : coldness < 0.44
        ? "warm"
        : coldness < 0.7
          ? "cooling"
          : coldness < 0.9
            ? "lukewarm"
            : "cold";
  const tasteLabel = COFFEE_CUP_TASTE_LABELS[
    coffeeCupStableIndex(seed, COFFEE_CUP_TASTE_LABELS.length)
  ]!;
  return {
    progress: clamped,
    frameIndex,
    amount,
    fillRatio,
    coldness,
    amountLabel: COFFEE_CUP_AMOUNT_LABELS[amount],
    temperatureLabel,
    tasteLabel,
  };
}

export function coffeeCupProgressFromSessionTiming(args: {
  sessionRemainingMs?: number | null;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
}): number | null {
  const remainingMs = args.sessionRemainingMs;
  if (typeof remainingMs !== "number" || !Number.isFinite(remainingMs)) return null;
  const durationMinutes =
    typeof args.durationMinutes === "number" &&
    Number.isFinite(args.durationMinutes) &&
    args.durationMinutes > 0
      ? args.durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const durationMs = durationMinutes * 60 * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return clampCoffeeCupProgress(1 - Math.max(0, remainingMs) / durationMs);
}

function coffeeCupTopOffConsumptionDurationMs(
  durationMinutes?: CoffeeSessionDurationMinutes | null
): number {
  const minutes =
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? durationMinutes
      : DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const durationMs = minutes * 60 * 1000;
  return Number.isFinite(durationMs) && durationMs > 0
    ? durationMs
    : DEFAULT_COFFEE_SESSION_DURATION_MINUTES * 60 * 1000;
}

export function coffeeCupCanTopOff(progress: number): boolean {
  return (
    coffeeCupFrameIndexForProgress(progress) > 0 &&
    clampCoffeeCupProgress(progress) >= COFFEE_CUP_TOP_OFF_MIN_ELIGIBLE_PROGRESS
  );
}

export function coffeeCupTopOffSnapshotForProgress(
  progress: number,
  toppedOffAt: string,
  targetProgressAfter?: number | null
): CoffeeCupTopOffSnapshot | null {
  const progressBefore = clampCoffeeCupProgress(progress);
  if (!coffeeCupCanTopOff(progressBefore)) return null;
  const requestedProgressAfter =
    typeof targetProgressAfter === "number" && Number.isFinite(targetProgressAfter)
      ? clampCoffeeCupProgress(targetProgressAfter)
      : COFFEE_CUP_TOP_OFF_TARGET_PROGRESS;
  const progressAfter = Math.min(progressBefore, requestedProgressAfter);
  if (progressAfter >= progressBefore) return null;
  return {
    progressBefore,
    progressAfter,
    toppedOffAt,
  };
}

export function coffeeCupProgressAfterTopOff(args: {
  progress: number;
  topOff?: CoffeeCupTopOffSnapshot | null;
  nowMs: number;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  lowerProgressMeansConsumption?: boolean | null;
}): number {
  const progress = clampCoffeeCupProgress(args.progress);
  const topOff = args.topOff;
  if (!topOff) return progress;
  const toppedOffAtMs = Date.parse(topOff.toppedOffAt);
  if (!Number.isFinite(toppedOffAtMs)) return progress;
  if (!Number.isFinite(args.nowMs) || args.nowMs < toppedOffAtMs) return progress;
  const progressBefore = clampCoffeeCupProgress(topOff.progressBefore);
  const progressAfter = clampCoffeeCupProgress(topOff.progressAfter);
  if (progressBefore <= progressAfter || progress <= progressAfter) return progress;
  const elapsedMs = Math.max(0, args.nowMs - toppedOffAtMs);
  const consumptionDurationMs = coffeeCupTopOffConsumptionDurationMs(args.durationMinutes);
  const timedConsumedProgress = Math.max(
    0,
    Math.min(1, elapsedMs / consumptionDurationMs)
  );
  const explicitConsumedProgress =
    args.lowerProgressMeansConsumption === true
      ? Math.max(0, progress - progressAfter)
      : 0;
  const topOffProgress = clampCoffeeCupProgress(
    progressAfter + Math.max(timedConsumedProgress, explicitConsumedProgress)
  );
  return Math.min(progress, topOffProgress);
}

export function coffeeCupPromptCueForStatus(status: CoffeeCupStatus): string {
  const base = `Your coffee is ${status.amountLabel}, ${status.temperatureLabel}, and tastes ${status.tasteLabel}.`;
  if (status.amount === "empty" || status.fillRatio <= 0.04) {
    return `${base} The mug is empty; do not describe sipping it, steam, heat, or fresh coffee.`;
  }
  if (status.temperatureLabel === "cold" || status.coldness >= 0.9) {
    return `${base} It is cold now; do not describe steam, heat, or a hot sip. You may ignore it, push it aside, or reluctantly take/finish a sip if that fits the moment, but do not force a coffee comment every turn.`;
  }
  if (status.fillRatio <= 0.12) {
    return `${base} Only a little remains, so do not describe visible steam. You may naturally reference the last dregs or a final sip when that fits the moment, but do not force a coffee comment every turn.`;
  }
  return `${base} You may naturally reference sipping it, the amount left, its temperature, or its taste when that fits the moment, but do not force a coffee comment every turn.`;
}
/** Bots may hold their Coffee poll vote until this close to session end. */
export const COFFEE_POLL_FINALIZE_REMAINING_MS = 30_000;
/** Minimum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MIN = 2;
/** Maximum answer choices when the player starts a Coffee poll. */
export const COFFEE_POLL_OPTION_COUNT_MAX = 4;

export type CoffeePresetMode = "manual" | "auto";

/** How new Coffee Sessions pick a table topic for a saved Coffee Group. */
export type CoffeeTopicSelectionMode = "manual" | "auto";

/** Stored Coffee Group starter topics keyed by bot id. */
export type CoffeeGroupStarterTopicsByBotId = Record<string, string[]>;

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
  anthropic?: string;
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
  /** Coffee-only persisted topic pool generated from each seated bot. */
  starterTopicsByBotId?: CoffeeGroupStarterTopicsByBotId;
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
  /** Hub metadata for unified Chat. Hub rows are canonical timelines; side rows fork from a Hub. */
  hubRole?: "hub" | "side";
  /** Bot that owns this Hub group. Null means the PRISM Hub. */
  hubBotId?: string | null;
  /** Parent Hub conversation for side chats. Null/omitted for Hub roots. */
  parentHubId?: string | null;
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
   * Coffee-only — bot ids from the parent Coffee Group that were invited but
   * marked away for this specific session.
   */
  coffeeAbsentBotIds?: string[];
  /**
   * Coffee-only hidden social values keyed by bot id for this conversation.
   * This is primarily consumed by dev diagnostics and prompt shaping.
   */
  coffeeBotSocialById?: Record<string, CoffeeBotSocialSnapshot>;
  /**
   * Coffee-only physical cup top-offs keyed by bot id for this conversation.
   * A top-off refills/reheats the visible cup and can shape later prompt cues.
   */
  coffeeCupTopOffsByBotId?: Record<string, CoffeeCupTopOffSnapshot>;
  /**
   * Normalized Prism mood/relationship state for this conversation surface.
   * Coffee adapts its per-seat social state into this shape; Zen persists it
   * directly so developer diagnostics and prompt shaping share one vocabulary.
   */
  prismMood?: PrismMoodSnapshot;
  /**
   * Coffee-only — table feel / reply length / focus knobs for this session.
   * Omitted for non-coffee rows.
   */
  coffeeSettings?: CoffeeSessionSettings;
  /** Coffee-only — selected timed session duration, once group sessions own starts. */
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes;
  /** Coffee-only — shared anchor topic for this session (null until chosen). */
  coffeeTopic?: string | null;
  /** Coffee-only — optional team-mode social state for this timed session. */
  coffeeTeams?: CoffeeTeamState | null;
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
  /** Zen-only generated ambient wallpaper metadata. */
  zenWallpaper?: {
    enabled: boolean;
    imageId: string | null;
    promptSeed: string | null;
    generationMessageCount: number | null;
    status: "idle" | "generating" | "ready" | "error";
    history: Array<{
      imageId: string;
      promptSeed: string | null;
      generationMessageCount: number;
      revealStartMessageCount?: number;
      revealFullMessageCount?: number;
      createdAt?: string;
    }>;
  };
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

export interface ZenSessionMemoryItem {
  id: string;
  conversationId?: string;
  botId?: string | null;
  title: string;
  text: string;
  trigger?: string;
  sourceMessageIds?: string[];
  createdAt: string;
  expiresAt: string;
}

export interface ZenPreviousContextSummary {
  conversationId: string;
  title: string;
  summary: string;
  internalSummary?: string;
  updatedAt: string;
}

export interface ZenSessionMemoryOverview {
  previousContext: ZenPreviousContextSummary | null;
  sessionMemories: ZenSessionMemoryItem[];
}

export {
  REQUIRED_LOCAL_MODELS,
  REQUIRED_PRIMARY_LOCAL_MODEL_ID,
  DISABLED_MODEL_CHOICE,
  MODEL_VISIBILITY_DEFAULTS_VERSION,
  defaultHiddenModelIdsForCatalog,
  isCommonOnlineChatModel,
  isDisabledModelChoice,
  reconcileHiddenModelIdsForCatalog,
  sanitizeHiddenModelIds,
  resolveAutoModel,
  type AutoModelProvider,
  type CatalogShapeForAuto,
  type ModelForDefaultVisibility,
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
 * - `"zen"`: PRISM's own lane. It may use an optional Facet bot for a turn,
 *   but the conversation remains PRISM-owned rather than bot-locked.
 * - `"chat"`: bot-locked persona conversation. Requires a concrete `botId`
 *   and keeps memory scoped to that bot.
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
export type ChatMode = "zen" | "chat" | "sandbox" | "coffee";

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
  preferredProvider?: LlmProviderName;
  modelOverride?: string;
  reasoningEffort?: ReasoningEffort;
  botId?: string | null;
}

export type ChatManualToolRequest =
  | { name: "webSearch"; query?: string }
  | { name: "imageGen"; prompt?: string }
  | { name: "askQuestion"; question?: string; options?: string[] };

export interface ChatRequestPayload {
  conversationId?: string;
  /** When true, bypass "reuse latest chat" and start a fresh conversation row. */
  forceNewConversation?: boolean;
  message: string;
  starterPrompt?: boolean;
  mode?: ChatMode;
  /** Companion-only optional preferences (used only when mode === "zen"). */
  companionPreferences?: ChatCompanionPreferences;
  /** Advanced controls for runtime routing. */
  sandboxControls?: SandboxRuntimeControls;
  /** Back-compat top-level advanced knobs. Chat honors explicit modelOverride only. */
  preferredProvider?: LlmProviderName;
  modelOverride?: string;
  reasoningEffort?: ReasoningEffort;
  /**
   * Chat/Sandbox bot selector. In Zen this is a backwards-compatible fallback
   * for `facetBotId`.
   */
  botId?: string | null;
  /** Preferred Zen Facet selector. Keeps the conversation row bot_id NULL. */
  facetBotId?: string | null;
  /** When true in Zen/Chat, keep this turn client-held and skip memory/persistence. */
  incognito?: boolean;
  /** Zen-only automatic Facet handoff turn. */
  facetTransition?: ZenPersonaTransitionInput;
  /** Backwards-compatible name for Zen Facet handoff. */
  personaTransition?: ZenPersonaTransitionInput;
  /** Zen-only idle autonomy check/turn. */
  zenAutonomy?: ZenAutonomyInput;
  /** Zen-only assistant follow-up when an AskQuestion patience timer expires. */
  zenAskQuestionPatience?: ZenAskQuestionPatienceInput;
  /**
   * Client-held prior messages for an incognito chat. The server uses this as
   * prompt context only; private turns are never read from or written to
   * persisted conversation/message storage.
   */
  ephemeralMessages?: ChatMessage[];
  /** Optional signal to trigger end-of-session rolling compaction. */
  sessionEnding?: boolean;
  /** Zen-only one-turn cue that the next user message should pivot away from the prior topic. */
  topicReset?: boolean;
  /** Optional metadata when the latest Zen send interrupted Prism. */
  prismInterruption?: PrismMoodInterruptionInput;
  /** Explicit user-selected composer tool. */
  manualTool?: ChatManualToolRequest;
}

export type ZenPersonaTransitionStyle = "new-speaks" | "previous-introduces";

export interface ZenPersonaTransitionInput {
  fromBotId: string | null;
  toBotId: string | null;
  source: "picker";
  /** Missing style is treated as "new-speaks" for older clients. */
  style?: ZenPersonaTransitionStyle;
}

export interface ZenAutonomyInput {
  source: "idle";
  activeBotId: string | null;
  idleMs: number;
  clientTurnId: string;
}

export interface ZenAskQuestionPatienceInput {
  source: "ask_question_patience";
  activeBotId: string | null;
  assistantMessageId?: string;
  prompt?: string;
  options?: Array<{ id: string; label: string }>;
  timeoutMs?: number;
  activeElapsedMs?: number;
  penaltyLevel?: PrismMoodIgnoredQuestionPenaltyLevel;
  clientTurnId: string;
}

export type ZenLiveActionSource = "draft_action" | "idle";

export type ZenLiveActionReactionKind =
  | "silent"
  | "show_action"
  | "interrupt_candidate";

export type ZenLiveActionMoodHint =
  | "neutral"
  | "attentive"
  | "amused"
  | "confused"
  | "stern"
  | "waiting"
  | "warm";

export interface ZenLiveActionReactionRequest {
  source: ZenLiveActionSource;
  activeBotId: string | null;
  personaName?: string;
  userAction?: string;
  previousBotAction?: string;
  conversationId?: string;
  idleMs?: number;
  clientSequenceId: string;
}

export interface ZenLiveActionReactionResponse {
  kind: ZenLiveActionReactionKind;
  botAction?: string;
  moodHint: ZenLiveActionMoodHint;
  confidence: number;
  botId: string | null;
  clientSequenceId: string;
  interruptReason?: string;
}

export interface ZenLiveActionContextInput {
  source: "live_action";
  activeBotId: string | null;
  userAction?: string;
  botAction?: string;
  moodHint?: ZenLiveActionMoodHint;
  clientSequenceId?: string;
}

export interface ZenLiveActionInterruptInput {
  source: "live_action_interrupt";
  activeBotId: string | null;
  userAction: string;
  botAction: string;
  moodHint?: ZenLiveActionMoodHint;
  reason?: string;
  clientTurnId: string;
}

export type ZenAutonomyDecision =
  | { action: "silent" }
  | { action: "speak"; botId: string | null };

/**
 * Optional quick-reply labels inferred from the assistant's opening turn when
 * the user starts via "Talk to me!" ({@link ChatRequestPayload.starterPrompt}).
 */
export interface StarterChatExtras {
  conversationStarters?: string[];
}

export type OpinionBand = "guarded" | "warming" | "trusting";
export type OpinionTrend = "up" | "down" | "steady";
export type BotMoodKey = PrismMoodKey;

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
  prismMood?: PrismMoodSnapshot;
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
  /** Optional timed session length in whole minutes, from 3 to 30. */
  durationMinutes?: CoffeeSessionDurationMinutes;
  /** Optional opening poll that seeds the initial table topic. */
  initialPoll?: CoffeePollCreateRequest;
  /** Optional opening teams mode that seeds left/right social dynamics. */
  initialTeams?: CoffeeTeamSessionConfig;
}

/** Request body for `POST /api/coffee/groups/:id/sessions`. */
export interface CoffeeGroupSessionCreateRequest {
  /** Optional session tuning; omitted rows use Coffee Group defaults. */
  coffeeSettings?: unknown;
  /** Optional timed session length in whole minutes, from 3 to 30. */
  durationMinutes?: CoffeeSessionDurationMinutes;
  /** Optional preset id, or `__auto__` for auto preset selection. */
  presetId?: string;
  /** Bot ids from this Coffee Group that should sit out this one session. */
  excludedBotIds?: string[];
  /** Optional opening poll that seeds the initial table topic. */
  initialPoll?: CoffeePollCreateRequest;
  /** Optional opening teams mode that seeds left/right social dynamics. */
  initialTeams?: CoffeeTeamSessionConfig;
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
  /** Present when the session started with Coffee Teams. */
  teams?: CoffeeTeamState;
}

/** Request body for `POST /api/coffee/sessions/:id/user-action`. */
export interface CoffeeUserActionRequest {
  /** Action-only composer input, e.g. `*leans back and folds arms*`. */
  action: string;
}

/** Response body for `POST /api/coffee/sessions/:id/user-action`. */
export interface CoffeeUserActionResponse {
  conversation: Conversation;
  coffeeUserAction: CoffeeUserActionPayload;
}

/** Request body for `POST /api/coffee/sessions/:id/continue`. */
export interface CoffeeContinueRequest {
  /**
   * Per-request provider override for the next bot reply. Per-bot online
   * gating still wins — a bot with `online_enabled=0` falls back to local.
   */
  preferredProvider?: LlmProviderName;
  reasoningEffort?: ReasoningEffort;
  /**
   * Optional director-mode pick. When present, the server asks this seated bot
   * to speak instead of running the automatic speaker router.
   */
  directedSpeakerBotId?: string;
  /**
   * Optional original user line for chained multi-mention replies. Used only
   * with `directedSpeakerBotId` so follow-up bots answer the same prompt.
   */
  directedUserMessage?: string;
  /** Client hint used for rare bot-interrupt presentation while composing. */
  userIsComposing?: boolean;
  /**
   * Client-visible bots currently seated at the live table. During Coffee's
   * opening arrivals, the server routes turns only among these bots.
   */
  presentBotIds?: string[];
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
  preferredProvider?: LlmProviderName;
  reasoningEffort?: ReasoningEffort;
  /** The user's outgoing message. */
  message: string;
  /** Optional player-interruption metadata from the live table reveal state. */
  playerInterruption?: CoffeePlayerInterruptionInput;
  /** Optional director-mode pick for this user turn. */
  directedSpeakerBotId?: string;
  /**
   * Client-visible bots currently seated at the live table. During Coffee's
   * opening arrivals, the server routes turns only among these bots.
   */
  presentBotIds?: string[];
}

/** Response body for `POST /api/coffee/turn`. */
export interface CoffeeTurnResponse {
  conversation: Conversation;
  /** The bot id chosen by the router for this turn (matches the assistant message's bot_id). Null only for stale no-op turns. */
  speakerBotId: string | null;
  /** Refreshed active Coffee poll state after this turn, when a poll is running. */
  poll?: CoffeePoll | null;
  /** Optional human-readable router rationale for debugging/inspection. Never shown to the user verbatim. */
  routerReason?: string;
  /** True when an obsolete autonomous turn was safely discarded without inserting a reply. */
  stale?: boolean;
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
  preferredProvider?: LlmProviderName;
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
