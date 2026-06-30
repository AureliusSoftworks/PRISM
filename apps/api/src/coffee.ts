/**
 * Coffee mode — timed live sessions for 2-5 reactive bots.
 *
 * v0 architecture (per the Hub Modes Roadmap, Phase 1):
 *   1. The user picks 2-5 bots from their library when starting a Coffee
 *      session (per-session one-off picker).
 *   2. Each user or timed autonomous turn triggers a small router LLM call
 *      that picks ONE bot from the group based on personality + recent
 *      conversation context. The router runs on the local auxiliary model
 *      so it does not consume online quota.
 *   3. The picked bot then replies through the user's selected provider
 *      using its own system prompt, identity, and generation overrides.
 *   4. Memory is thread-scoped only (no cross-thread bot memory writes
 *      in v0). The rolling history window IS the thread's memory, the
 *      same way Sandbox treats it.
 *
 * Coffee deliberately does NOT go through `processChatMessage`. That
 * function carries Chat- and Sandbox-specific logic (cross-session memory
 * writes, opinion tracking, starter prompts, AskQuestion tool detection,
 * mood signaling) that doesn't apply here. Reusing it would either
 * silently leak Coffee turns into the cross-thread `memories` table or
 * require many new branches inside an already-3.3k-line module. A leaner
 * sibling keeps the pipelines independent and easy to evolve separately.
 */

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { decryptJson, randomId } from "./security.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
  type ProviderName,
} from "./providers.ts";
import {
  ABOUT_YOU_MEMORY_SOURCE,
  buildInitialAboutYouMemoryText,
  extractBotPreferredAddressMemoryCandidates,
  extractCoffeeObserverMemoryCandidates,
  hasAboutYouMemoryForBot,
  persistMemoryCandidates,
  retrieveRecentBotMemoriesForStarter,
  retrieveRecentMemoriesForStarter,
  restoreMemory,
} from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";
import { composeBotSystemPrompt } from "./bots.ts";
import {
  loadBotRelationshipsForBots,
  loadCoffeeBotSocialState,
  readBotRelationship,
  type BotRelationshipSnapshot,
  upsertCoffeeBotSocialState,
  upsertBotRelationship,
} from "./db.ts";
import type {
  ChatMessage,
  Conversation,
  CoffeeAmbientActionPayload,
  CoffeeBotSocialSnapshot,
  CoffeeArrivalScenario,
  CoffeeGroup,
  CoffeeGroupModelChoice,
  CoffeeGroupStarterTopicsByBotId,
  CoffeeInterruptionEvent,
  CoffeeInterruptionSocialDelta,
  CoffeePlayerInterruptionInput,
  CoffeePoll,
  CoffeePollDeliberation,
  CoffeePollOptionTally,
  CoffeePollStatus,
  CoffeePollVote,
  CoffeePollVoteKind,
  CoffeePollVoterKind,
  CoffeePreset,
  CoffeePresetMode,
  CoffeeSessionDurationMinutes,
  CoffeeSessionCreateResponse,
  CoffeeSessionSettings,
  CoffeeTeamBotState,
  CoffeeTeamId,
  CoffeeTeamPlayerState,
  CoffeeTeamSessionConfig,
  CoffeeTeamState,
  CoffeeWinningTeamId,
  CoffeeTopicSelectionMode,
  CoffeeTurnResponse,
  BotVoicePreset,
  OpinionTrend,
  ReasoningEffort,
} from "@localai/shared";
import {
  COFFEE_SESSION_DURATION_MINUTES_MAX,
  COFFEE_SESSION_DURATION_MINUTES_MIN,
  DEFAULT_COFFEE_SESSION_DURATION_MINUTES,
  COFFEE_POLL_FINALIZE_REMAINING_MS,
  COFFEE_POLL_OPTION_COUNT_MAX,
  COFFEE_POLL_OPTION_COUNT_MIN,
  COFFEE_POLL_PLAYER_VOTER_ID,
  coffeeCupProgressFromSessionTiming,
  coffeeCupPacedProgress,
  coffeeCupPromptCueForStatus,
  coffeeCupStatusForProgress,
  coffeeEffectiveHistoryLimit,
  coffeeReplyLengthCaps,
  coffeeRouterTailMessageCount,
  coffeeRouterTemperature,
  normalizeCoffeeSessionSettings,
  parseStoredAssistantToolPayload,
  parseStoredBotPrompt,
  serializeAssistantToolPayload,
} from "@localai/shared";
import type { AssistantSentImageUserPrefs } from "./assistant-sent-image.ts";
import {
  startChatImageBackgroundJob,
  tryAcquireImageSlot,
} from "./image-job-slot.ts";
import {
  autoBackfillSendGeneratedImagePrompt,
  compactPreImageLeadMessage,
  userMessageSuggestsInChatImageRequest,
} from "./chat.ts";
import {
  deriveDeterministicBotSemanticFacets,
  effectiveBotSemanticFacets,
  queueBotSemanticFacetsRefresh,
  type BotSemanticFacets,
} from "./bot-facets.ts";

/** Coffee groups must have at least 2 and at most 5 bots. */
export const COFFEE_GROUP_MIN_SIZE = 2;
export const COFFEE_GROUP_MAX_SIZE = 5;

/** Default tabletop cap when callers omit an explicit limit (tests + legacy). */
export const COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS = 110;

/** When the timer is this close to done, bots should naturally wind down. */
export const COFFEE_WRAP_UP_REMAINING_MS = 20_000;

/** Re-export for callers/tests that read the finalize window from the API module. */
export { COFFEE_POLL_FINALIZE_REMAINING_MS };

/** Router LLM call budget — keep low so latency stays acceptable. */
const ROUTER_MAX_TOKENS = 80;
const COFFEE_ROUTER_DIRECTIVE_MAX_CHARS = 180;

/** Fallback when router output cannot be parsed. */
const ROUTER_FALLBACK_REASON = "Router fallback (unparseable response)";
const COFFEE_MEETING_SUMMARY_REFRESH_EVERY_ASSISTANT_MESSAGES = 4;
const COFFEE_MEETING_SUMMARY_MIN_ASSISTANT_MESSAGES = 4;
const COFFEE_MEETING_SUMMARY_MAX_CHARS = 420;
const COFFEE_MEETING_SUMMARY_MAX_TRANSCRIPT_LINES = 16;
const COFFEE_MEETING_SUMMARY_MAX_TOKENS = 120;
const COFFEE_SESSION_SYNOPSIS_PREFIX = "Session synopsis:";
const COFFEE_SESSION_SYNOPSIS_MAX_TRANSCRIPT_LINES = 36;
const COFFEE_SESSION_SYNOPSIS_MAX_CHARS = 900;
const COFFEE_SESSION_SYNOPSIS_MAX_TOKENS = 260;
const COFFEE_AMBIENT_EMPTY_PROGRESS = 0.96;
const COFFEE_AMBIENT_SIP_MAX_PROGRESS = 0.78;
const COFFEE_AMBIENT_RECENT_ACTION_LIMIT = 3;

type CoffeeTurnKind = "user" | "autonomous";

type RouterAllowedBot = string | Pick<CoffeeBotProfile, "id" | "name">;

export type CoffeeTurnObjective =
  | "challenge"
  | "clarify"
  | "concrete-example"
  | "synthesize"
  | "redirect"
  | "ask-sharper-question"
  | "close-thread";

export type CoffeeConversationPhase = "opening" | "middle" | "final-minute";

export interface CoffeeConversationQualityState {
  guardrailStrength: "light" | "standard" | "strong";
  phase: CoffeeConversationPhase;
  objective: CoffeeTurnObjective;
  recentAssistantTurnCount: number;
  speakerDistribution: Array<{ botId: string; name: string; count: number }>;
  quietBotIds: string[];
  quietBotNames: string[];
  dominantDuoBotIds: string[];
  dominantDuoBotNames: string[];
  dominantDuoDetected: boolean;
  topicDriftDetected: boolean;
  repeatedMetaphorOrJokeShapeDetected: boolean;
  lowValueLatestTurnDetected: boolean;
}

/**
 * Bot row shape used internally by the router and speaker pipeline.
 * Subset of the `bots` table — only what Coffee needs for v0.
 */
export interface CoffeeBotProfile {
  id: string;
  name: string;
  systemPrompt: string;
  color: string | null;
  glyph: string | null;
  localModel: string | null;
  onlineModel: string | null;
  defaultModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  onlineEnabled: boolean;
  flirtEnabled?: boolean;
  semanticFacets?: BotSemanticFacets | null;
  semanticFacetsRaw?: string | null;
  semanticFacetsSourceHash?: string | null;
  semanticFacetsUpdatedAt?: string | null;
}

export interface CoffeeStarterMemoryContextEntry {
  botId: string;
  botName: string;
  memories: string[];
}

const COFFEE_SOCIAL_MIN = 0;
const COFFEE_SOCIAL_MAX = 1;

const DEFAULT_COFFEE_SOCIAL: CoffeeBotSocialSnapshot = {
  disposition: 0.5,
  valuesFriction: 0.35,
  restraint: 0.65,
  engagement: 0.65,
  leavePressure: 0.1,
};

const COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS = 1;
const COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP = 24;
const COFFEE_INTERRUPTION_BELL_CURVE_EDGE_WEIGHT = 0.42;
const COFFEE_INTERRUPTION_BELL_CURVE_SIGMA = 0.21;
const COFFEE_PLAYER_INTERRUPT_BASE_DISPOSITION_DELTA = -0.03;
const COFFEE_PLAYER_INTERRUPT_BASE_FRICTION_DELTA = 0.03;
const COFFEE_PLAYER_INTERRUPT_THIRD_PARTY_FRICTION_DELTA = 0.012;
const COFFEE_BOT_INTERRUPT_BASE_CHANCE = 0.03;
const COFFEE_BOT_INTERRUPT_MAX_CHANCE = 0.16;
const COFFEE_BOT_INTERRUPT_PILEUP_MAX_CHANCE = 0.34;
const COFFEE_DEPARTURE_EMPTY_PROGRESS = 0.96;
const COFFEE_DEPARTURE_MIN_ACTIVE_BOTS = 3;
const COFFEE_DEPARTURE_MIN_PRIOR_TURNS = 1;
const COFFEE_IMAGE_MODEL_TAG = "coffee-image-request";
const COFFEE_TEAM_SIDE_MIN_SIZE = 1;
const COFFEE_TEAM_SIDE_MAX_SIZE = 4;

const DEFAULT_ASSISTANT_IMAGE_USER_PREFS: AssistantSentImageUserPrefs = {
  preferredLocalImageModel: null,
  preferredOpenAiImageModel: null,
  lenientLocalImageFallbackModel: null,
  comfyuiHost: null,
  comfyUiWorkflows: [],
  secondaryOllamaHost: null,
};

/**
 * Clamp a social metric to the normalized 0..1 range.
 */
export function clampCoffeeSocialValue(value: number): number {
  if (!Number.isFinite(value)) return COFFEE_SOCIAL_MIN;
  return Math.min(COFFEE_SOCIAL_MAX, Math.max(COFFEE_SOCIAL_MIN, value));
}

function sanitizeCoffeeSocialSnapshot(input: Partial<CoffeeBotSocialSnapshot> | undefined): CoffeeBotSocialSnapshot {
  return {
    disposition: clampCoffeeSocialValue(input?.disposition ?? DEFAULT_COFFEE_SOCIAL.disposition),
    valuesFriction: clampCoffeeSocialValue(input?.valuesFriction ?? DEFAULT_COFFEE_SOCIAL.valuesFriction),
    restraint: clampCoffeeSocialValue(input?.restraint ?? DEFAULT_COFFEE_SOCIAL.restraint),
    engagement: clampCoffeeSocialValue(input?.engagement ?? DEFAULT_COFFEE_SOCIAL.engagement),
    leavePressure: clampCoffeeSocialValue(input?.leavePressure ?? DEFAULT_COFFEE_SOCIAL.leavePressure),
  };
}

function coffeeReplyRepeatKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COFFEE_LOOP_MOTIF_HISTORY_LIMIT = 8;
const COFFEE_LOOP_MOTIF_STRONG_REPEAT_COUNT = 3;
const COFFEE_LOOP_MOTIF_CLUSTER_REPEAT_COUNT = 2;
const COFFEE_LOOP_MOTIF_CLUSTER_SIZE = 2;
const COFFEE_ROUTER_BALANCE_HISTORY_LIMIT = 12;

const COFFEE_LOOP_MOTIF_STOPWORDS = new Set([
  "about",
  "again",
  "because",
  "being",
  "coffee",
  "could",
  "every",
  "going",
  "maybe",
  "never",
  "other",
  "really",
  "right",
  "should",
  "table",
  "their",
  "there",
  "thing",
  "those",
  "through",
  "would",
]);

const COFFEE_FALLBACK_FOCUS_BLOCKED_TOKENS = new Set([
  "before",
  "change",
  "finish",
  "finished",
  "krabs",
  "patrick",
  "plankton",
  "profound",
  "sentence",
  "sharper",
  "sometime",
  "spongebob",
  "squidward",
  "test",
  "wearines",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "wed",
  "well",
  "were",
  "weve",
  "you'd",
  "you'll",
  "you're",
  "you've",
  "youd",
  "youll",
  "youre",
  "youve",
]);

function coffeeLoopMotifToken(raw: string): string | null {
  const lower = raw.toLowerCase();
  const normalized = lower
    .replace(/'s$/u, "")
    .replace(/(?:ing|ed)$/u, "")
    .replace(/s$/u, "");
  if (normalized.length < 5) return null;
  if (COFFEE_LOOP_MOTIF_STOPWORDS.has(normalized)) return null;
  return normalized;
}

function coffeeLoopMotifTokens(raw: string): string[] {
  const tokens = new Set<string>();
  for (const match of raw.matchAll(/[\p{L}\p{N}']+/gu)) {
    const token = coffeeLoopMotifToken(match[0]);
    if (token) tokens.add(token);
  }
  return [...tokens];
}

function coffeeFallbackFocusTokens(raw: string): string[] {
  const tokens = new Set<string>();
  for (const match of raw.matchAll(/[\p{L}\p{N}']+/gu)) {
    const original = match[0];
    if (/^[A-Z]/u.test(original)) continue;
    const token = coffeeLoopMotifToken(original);
    if (!token) continue;
    if (token.includes("'")) continue;
    if (COFFEE_FALLBACK_FOCUS_BLOCKED_TOKENS.has(token)) continue;
    tokens.add(token);
  }
  return [...tokens];
}

function repeatedCoffeeMotifsInReply(
  replyText: string,
  history: readonly ChatMessage[]
): string[] {
  const recentAssistantMessages = history
    .filter((message) => message.role === "assistant")
    .slice(-COFFEE_LOOP_MOTIF_HISTORY_LIMIT);
  if (recentAssistantMessages.length < 3) return [];

  const motifCounts = new Map<string, number>();
  for (const message of recentAssistantMessages) {
    for (const token of coffeeLoopMotifTokens(message.content)) {
      motifCounts.set(token, (motifCounts.get(token) ?? 0) + 1);
    }
  }

  const replyTokens = coffeeLoopMotifTokens(replyText);
  const repeatedTokens = replyTokens.filter((token) => {
    return (motifCounts.get(token) ?? 0) >= COFFEE_LOOP_MOTIF_CLUSTER_REPEAT_COUNT;
  });

  return repeatedTokens.filter((token) => {
    const count = motifCounts.get(token) ?? 0;
    return (
      count >= COFFEE_LOOP_MOTIF_STRONG_REPEAT_COUNT ||
      repeatedTokens.length >= COFFEE_LOOP_MOTIF_CLUSTER_SIZE
    );
  });
}

function recentCoffeeAssistantRepeatKeys(history: readonly ChatMessage[], limit = 6): Set<string> {
  const keys = new Set<string>();
  for (let index = history.length - 1; index >= 0 && keys.size < limit; index -= 1) {
    const message = history[index];
    if (!message || message.role !== "assistant") continue;
    const key = coffeeReplyRepeatKey(message.content);
    if (key) keys.add(key);
  }
  return keys;
}

function recentCoffeeAssistantTexts(history: readonly ChatMessage[], limit = 8): string[] {
  const texts: string[] = [];
  for (let index = history.length - 1; index >= 0 && texts.length < limit; index -= 1) {
    const message = history[index];
    if (!message || message.role !== "assistant") continue;
    texts.push(message.content);
  }
  return texts;
}

export function coffeeReplyRepeatsRecentAssistant(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  const key = coffeeReplyRepeatKey(replyText);
  return key.length > 0 && recentCoffeeAssistantRepeatKeys(history).has(key);
}

export function coffeeReplyRepeatsRecentMotifs(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  return repeatedCoffeeMotifsInReply(replyText, history).length > 0;
}

function coffeePollFallbackShapeKey(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return null;
  if (/\bstill lean\b.+\btable has not made\b.+\bconvincing yet\b/u.test(lower)) {
    return "poll-still-lean-not-convincing";
  }
  if (/\bfits the evidence better\b.+\bsharper counterpoint\b/u.test(lower)) {
    return "poll-evidence-counterpoint";
  }
  if (/\bput me near\b.+\bneeds more than vibes\b/u.test(lower)) {
    return "poll-near-needs-vibes";
  }
  if (/\bis not impossible\b.+\bsounds more plausible at this table\b/u.test(lower)) {
    return "poll-not-impossible-plausible";
  }
  return null;
}

export function coffeeReplyRepeatsPollFallbackShape(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  const key = coffeePollFallbackShapeKey(replyText);
  if (!key) return false;
  return history
    .filter((message) => message.role === "assistant")
    .slice(-COFFEE_LOOP_MOTIF_HISTORY_LIMIT)
    .some((message) => coffeePollFallbackShapeKey(message.content) === key);
}

function coffeeStockFallbackShapeKey(raw: string): string | null {
  const lower = visibleCoffeeSpeechForValueScan(raw).toLowerCase().replace(/\s+/g, " ").trim();
  if (!lower) return null;
  if (/\bbetter angle\b.+\brepeating the same claim\b/u.test(lower)) {
    return "stock-better-angle-repeat";
  }
  if (/\badd evidence\b.+\bnot just another lean\b/u.test(lower)) {
    return "stock-evidence-not-lean";
  }
  if (/\bneeds? a sharper reason\b.+\bbuy it\b/u.test(lower)) {
    return "stock-sharper-reason-buy";
  }
  if (/\binteresting part\b.+\beveryone is dodging\b/u.test(lower)) {
    return "stock-dodging";
  }
  if (/\bcleaner point\b.+\bnobody wants to test\b/u.test(lower)) {
    return "stock-cleaner-point-test";
  }
  return null;
}

export function coffeeReplyRepeatsStockFallbackShape(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  const key = coffeeStockFallbackShapeKey(replyText);
  if (!key) return false;
  return history
    .filter((message) => message.role === "assistant")
    .slice(-COFFEE_LOOP_MOTIF_HISTORY_LIMIT)
    .some((message) => coffeeStockFallbackShapeKey(message.content) === key);
}

function coffeeReplyNeedsRepeatRepair(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  return (
    coffeeReplyRepeatsRecentAssistant(replyText, history) ||
    coffeeReplyRepeatsRecentMotifs(replyText, history) ||
    coffeeReplyRepeatsPollFallbackShape(replyText, history) ||
    coffeeReplyRepeatsStockFallbackShape(replyText, history)
  );
}

/**
 * Ensure every seated bot has a valid social snapshot.
 */
export function initializeCoffeeSocialState(
  group: readonly Pick<CoffeeBotProfile, "id">[],
  persistedByBotId: Record<string, CoffeeBotSocialSnapshot>
): Record<string, CoffeeBotSocialSnapshot> {
  const next: Record<string, CoffeeBotSocialSnapshot> = {};
  for (const bot of group) {
    next[bot.id] = sanitizeCoffeeSocialSnapshot(persistedByBotId[bot.id]);
  }
  return next;
}

function nudgedTowardsMidpoint(value: number, intensity: number): number {
  return value + (0.5 - value) * intensity;
}

function computeBoundarySignal(text: string): number {
  const normalized = text.toLowerCase();
  const boundaryPatterns = [
    /\bi\s+don't\s+want\b/,
    /\bi\s+would\s+rather\s+not\b/,
    /\bnot\s+comfortable\b/,
    /\blet'?s\s+change\s+the\s+subject\b/,
    /\blet'?s\s+move\s+on\b/,
    /\bi\s+need\s+some\s+space\b/,
  ];
  let hits = 0;
  for (const pattern of boundaryPatterns) {
    if (pattern.test(normalized)) hits += 1;
  }
  return Math.min(1, hits / 2);
}

/**
 * Deterministically update per-bot social values after a completed Coffee turn.
 */
export function computeNextCoffeeSocialState(args: {
  previousByBotId: Record<string, CoffeeBotSocialSnapshot>;
  group: readonly Pick<CoffeeBotProfile, "id">[];
  speakerBotId: string;
  turnKind: CoffeeTurnKind;
  replyText: string;
}): Record<string, CoffeeBotSocialSnapshot> {
  const { previousByBotId, group, speakerBotId, turnKind, replyText } = args;
  const next: Record<string, CoffeeBotSocialSnapshot> = {};
  const boundarySignal = computeBoundarySignal(replyText);
  const wordCount = replyText.trim().split(/\s+/).filter(Boolean).length;
  const terseReplySignal = wordCount <= 14 ? 1 : 0;

  for (const bot of group) {
    const previous = sanitizeCoffeeSocialSnapshot(previousByBotId[bot.id]);
    const isSpeaker = bot.id === speakerBotId;
    if (isSpeaker) {
      next[bot.id] = sanitizeCoffeeSocialSnapshot({
        disposition: previous.disposition + (turnKind === "user" ? 0.025 : 0.01),
        valuesFriction:
          previous.valuesFriction +
          boundarySignal * 0.06 +
          (turnKind === "autonomous" ? 0.015 : 0),
        restraint:
          previous.restraint +
          boundarySignal * 0.07 +
          terseReplySignal * 0.03,
        engagement: previous.engagement + (turnKind === "user" ? 0.07 : 0.045),
        leavePressure:
          previous.leavePressure -
          (turnKind === "user" ? 0.05 : 0.03) +
          boundarySignal * 0.04 +
          terseReplySignal * 0.02,
      });
      continue;
    }

    next[bot.id] = sanitizeCoffeeSocialSnapshot({
      disposition: nudgedTowardsMidpoint(previous.disposition, 0.08),
      valuesFriction: nudgedTowardsMidpoint(previous.valuesFriction, 0.06),
      restraint: nudgedTowardsMidpoint(previous.restraint, 0.06),
      engagement: previous.engagement - (turnKind === "user" ? 0.025 : 0.02),
      leavePressure:
        previous.leavePressure +
        (turnKind === "user" ? 0.02 : 0.015) +
        boundarySignal * 0.01,
    });
  }

  return next;
}

function coffeeActiveSeatBotIdsFromStored(raw: string | null): Array<string | null> {
  const seatBotIds = parseStoredCoffeeSeatBotIds(raw);
  if (seatBotIds.length > 0) return seatBotIds;
  return parseStoredBotGroupIds(raw);
}

function coffeeCupSeedForBot(args: {
  conversationId: string;
  botId: string;
  seatBotIds: readonly (string | null)[];
}): string {
  const seatIndex = Math.max(0, args.seatBotIds.findIndex((id) => id === args.botId));
  const layoutIndex = Math.max(
    0,
    args.seatBotIds
      .slice(0, seatIndex + 1)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .length - 1
  );
  return `${args.conversationId}:${args.botId}:${seatIndex}:${layoutIndex}`;
}

function countCoffeeAssistantTurnsForBot(
  history: readonly ChatMessage[],
  speaker: Pick<CoffeeBotProfile, "id" | "name">
): number {
  return history.filter(
    (message) =>
      message.role === "assistant" &&
      (message.botName === speaker.name ||
        message.content.startsWith(`${speaker.name}:`) ||
        message.content.includes(`prism-bot://${speaker.id}`))
  ).length;
}

export function buildCoffeeDepartureOpportunity(args: {
  conversationId: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  seatBotIds: readonly (string | null)[];
  history: readonly ChatMessage[];
  social: CoffeeBotSocialSnapshot;
  sessionRemainingMs?: number | null;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
}): string | null {
  const activeBotCount = args.seatBotIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  ).length;
  if (activeBotCount < COFFEE_DEPARTURE_MIN_ACTIVE_BOTS) return null;
  if (
    typeof args.sessionRemainingMs !== "number" ||
    !Number.isFinite(args.sessionRemainingMs) ||
    args.sessionRemainingMs <= 0
  ) {
    return null;
  }
  const baseProgress = coffeeCupProgressFromSessionTiming({
    sessionRemainingMs: args.sessionRemainingMs,
    durationMinutes: args.durationMinutes,
  });
  if (baseProgress === null) return null;
  const cupSeed = coffeeCupSeedForBot({
    conversationId: args.conversationId,
    botId: args.speaker.id,
    seatBotIds: args.seatBotIds,
  });
  const pacedProgress = coffeeCupPacedProgress(baseProgress, cupSeed, args.durationMinutes);
  if (pacedProgress < COFFEE_DEPARTURE_EMPTY_PROGRESS) return null;
  const priorTurns = countCoffeeAssistantTurnsForBot(args.history, args.speaker);
  if (priorTurns < COFFEE_DEPARTURE_MIN_PRIOR_TURNS) return null;

  const social = sanitizeCoffeeSocialSnapshot(args.social);
  const participationScore = Math.min(1, (priorTurns + 1) / 3);
  const leavePull =
    social.leavePressure * 0.45 +
    (1 - social.engagement) * 0.25 +
    participationScore * 0.2 +
    pacedProgress * 0.1;
  const stayPull = social.engagement * 0.5 + social.disposition * 0.2;
  const leaning =
    leavePull > stayPull
      ? "Your empty cup gives you a natural chance to excuse yourself if that feels right."
      : "The conversation still has a strong pull, so staying without coffee is just as natural.";

  return [
    "Optional exit beat: your coffee is empty and you have already contributed meaningfully to this table.",
    leaning,
    "You may choose either path in character: stay and keep talking without coffee, or politely leave the table before the session ends.",
    "If leaving, make it unmistakable but graceful in one immersive line: stand, thank the table, excuse yourself, or say you should get going. Do not ask permission.",
    "If staying, do not mention leaving; simply continue the conversation as someone whose cup is empty.",
  ].join(" ");
}

export function coffeeReplySignalsPoliteDeparture(replyText: string): boolean {
  const normalized = stripCoffeeSnippetDisplayArtifacts(replyText).toLowerCase();
  if (!normalized) return false;
  const departurePatterns = [
    /\b(?:i(?:'m| am)\s+(?:going|gonna|heading|off|leaving)|i\s+(?:should|need|have to|must)\s+(?:go|head out|leave|get going|step out))\b/,
    /\b(?:stands?|rises?|gets?)\s+(?:up|from|to leave|with (?:a|the).{0,24}(?:nod|smile))\b/,
    /\b(?:pushes?|slides?)\s+(?:back|away)\s+(?:from\s+)?(?:the\s+)?(?:chair|table)\b/,
    /\b(?:thank you|thanks).{0,90}\b(?:company|conversation|coffee|table|evening)\b.{0,90}\b(?:go|leave|head|step|get going)\b/,
    /\b(?:goodbye|good night|see you|take care).{0,50}\b(?:everyone|all|friends|folks|table)\b/,
  ];
  return departurePatterns.some((pattern) => pattern.test(normalized));
}

function removeCoffeeTeamBotForDeparture(
  state: CoffeeTeamState | null,
  departingBotId: string,
  now: string
): CoffeeTeamState | null {
  if (!state) return null;
  const bots: Record<string, CoffeeTeamBotState> = {};
  for (const [botId, botState] of Object.entries(state.bots)) {
    if (botId !== departingBotId) bots[botId] = { ...botState };
  }
  const counts = coffeeTeamCountsFromParticipants(bots, state.player ?? null);
  const participantCount = Object.keys(bots).length + (state.player ? 1 : 0);
  const winnerTeamId =
    participantCount > 0 && counts.left === participantCount
      ? "left"
      : participantCount > 0 && counts.right === participantCount
        ? "right"
        : null;
  const resolved =
    state.status === "left_won" ||
    state.status === "right_won" ||
    state.status === "tie_resolved";
  return {
    ...state,
    bots,
    counts,
    status: !resolved && winnerTeamId ? coffeeTeamWinnerStatus(winnerTeamId) : state.status,
    winnerTeamId: !resolved && winnerTeamId ? winnerTeamId : state.winnerTeamId ?? null,
    resolvedAt: !resolved && winnerTeamId ? now : state.resolvedAt ?? null,
    updatedAt: now,
  };
}

function buildCoffeeDeparturePersistence(args: {
  row: ConversationRow;
  botId: string;
  nextCoffeeTeams: CoffeeTeamState | null;
  now: string;
}): {
  botGroupIdsJson: string;
  absentBotIdsJson: string;
  coffeeTeams: CoffeeTeamState | null;
} | null {
  const seatBotIds = coffeeActiveSeatBotIdsFromStored(args.row.bot_group_ids);
  const activeIds = seatBotIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  );
  if (!activeIds.includes(args.botId) || activeIds.length <= COFFEE_GROUP_MIN_SIZE) {
    return null;
  }
  const storedSeatLayout = parseStoredCoffeeSeatBotIds(args.row.bot_group_ids);
  const nextStoredBotGroupIds =
    storedSeatLayout.length > 0
      ? storedSeatLayout.map((id) => (id === args.botId ? null : id))
      : activeIds.filter((id) => id !== args.botId);
  const absentBotIds = Array.from(
    new Set([...parseStoredBotGroupIds(args.row.coffee_absent_bot_ids), args.botId])
  );
  return {
    botGroupIdsJson: JSON.stringify(nextStoredBotGroupIds),
    absentBotIdsJson: JSON.stringify(absentBotIds),
    coffeeTeams: removeCoffeeTeamBotForDeparture(
      args.nextCoffeeTeams,
      args.botId,
      args.now
    ),
  };
}

function formatCoffeeSocialPromptSummary(
  group: readonly CoffeeBotProfile[],
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>
): string {
  return group
    .map((bot) => {
      const social = socialByBotId[bot.id] ?? DEFAULT_COFFEE_SOCIAL;
      return `- ${bot.name} (${bot.id}): disposition=${social.disposition.toFixed(2)}, valuesFriction=${social.valuesFriction.toFixed(2)}, restraint=${social.restraint.toFixed(2)}, engagement=${social.engagement.toFixed(2)}, leavePressure=${social.leavePressure.toFixed(2)}`;
    })
    .join("\n");
}

function clampCoffeeTeamValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeCoffeeTeamName(raw: unknown, label: string): string {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!value) throw new Error(`${label} team name is required.`);
  if (value.length > 42) throw new Error(`${label} team name is too long.`);
  return value;
}

function normalizeCoffeeTeamDescription(raw: unknown, label: string): string {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!value) throw new Error(`${label} team description is required.`);
  if (value.length > 240) throw new Error(`${label} team description is too long.`);
  return value;
}

function isCoffeeTeamId(value: unknown): value is CoffeeTeamId {
  return value === "left" || value === "right" || value === "undecided";
}

function isCoffeeWinningTeamId(value: unknown): value is CoffeeWinningTeamId {
  return value === "left" || value === "right";
}

function coffeeTeamCountsFromBots(
  bots: Record<string, Pick<CoffeeTeamBotState, "currentTeamId">>
): { left: number; undecided: number; right: number } {
  const counts = { left: 0, undecided: 0, right: 0 };
  for (const bot of Object.values(bots)) {
    counts[bot.currentTeamId] += 1;
  }
  return counts;
}

function coffeeTeamCountsFromParticipants(
  bots: Record<string, Pick<CoffeeTeamBotState, "currentTeamId">>,
  player?: Pick<CoffeeTeamPlayerState, "currentTeamId"> | null
): { left: number; undecided: number; right: number } {
  const counts = coffeeTeamCountsFromBots(bots);
  if (player) {
    counts[player.currentTeamId] += 1;
  }
  return counts;
}

function coffeeTeamParticipantCount(
  group: readonly CoffeeBotProfile[],
  state: CoffeeTeamState
): number {
  return group.length + (state.player ? 1 : 0);
}

function coffeeTeamWinnerStatus(
  winnerTeamId: CoffeeWinningTeamId
): CoffeeTeamState["status"] {
  return winnerTeamId === "left" ? "left_won" : "right_won";
}

function coffeeWinningTeamName(state: Pick<CoffeeTeamState, "left" | "right">, teamId: CoffeeWinningTeamId): string {
  return teamId === "left" ? state.left.name : state.right.name;
}

function coffeeAnyTeamName(
  state: Pick<CoffeeTeamState, "left" | "right" | "undecidedLabel">,
  teamId: CoffeeTeamId
): string {
  if (teamId === "left") return state.left.name;
  if (teamId === "right") return state.right.name;
  return state.undecidedLabel;
}

function normalizeCoffeeTeamAssignments(
  raw: unknown,
  seatedBotIds: readonly string[]
): Record<string, CoffeeTeamId> {
  const seated = new Set(seatedBotIds);
  const assignments: Record<string, CoffeeTeamId> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [botId, teamId] of Object.entries(raw as Record<string, unknown>)) {
      if (!seated.has(botId)) throw new Error("Coffee Teams assignment includes a bot that is not seated.");
      if (!isCoffeeTeamId(teamId)) throw new Error("Coffee Teams assignment has an invalid team.");
      assignments[botId] = teamId;
    }
  } else if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as { botId?: unknown; teamId?: unknown };
      const botId = typeof item.botId === "string" ? item.botId : "";
      if (!seated.has(botId)) throw new Error("Coffee Teams assignment includes a bot that is not seated.");
      if (!isCoffeeTeamId(item.teamId)) throw new Error("Coffee Teams assignment has an invalid team.");
      assignments[botId] = item.teamId;
    }
  } else {
    throw new Error("Coffee Teams assignments are required.");
  }

  for (const botId of seatedBotIds) {
    if (!assignments[botId]) throw new Error("Every seated bot needs a Coffee Teams placement.");
  }
  return assignments;
}

function normalizeCoffeeTeamSessionConfig(
  raw: CoffeeTeamCreateInput | CoffeeTeamSessionConfig | undefined,
  seatedBotIds: readonly string[]
): CoffeeTeamSessionConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as {
    left?: { name?: unknown; description?: unknown };
    right?: { name?: unknown; description?: unknown };
    assignments?: unknown;
    playerTeamId?: unknown;
  };
  const left = {
    name: normalizeCoffeeTeamName(input.left?.name, "Left"),
    description: normalizeCoffeeTeamDescription(input.left?.description, "Left"),
  };
  const right = {
    name: normalizeCoffeeTeamName(input.right?.name, "Right"),
    description: normalizeCoffeeTeamDescription(input.right?.description, "Right"),
  };
  const assignments = normalizeCoffeeTeamAssignments(input.assignments, seatedBotIds);
  const counts = coffeeTeamCountsFromBots(
    Object.fromEntries(
      Object.entries(assignments).map(([botId, currentTeamId]) => [botId, { currentTeamId }])
    )
  );
  if (counts.left < COFFEE_TEAM_SIDE_MIN_SIZE || counts.right < COFFEE_TEAM_SIDE_MIN_SIZE) {
    throw new Error("Coffee Teams need at least one bot on both left and right.");
  }
  if (counts.left > COFFEE_TEAM_SIDE_MAX_SIZE || counts.right > COFFEE_TEAM_SIDE_MAX_SIZE) {
    throw new Error(`Coffee Teams allow at most ${COFFEE_TEAM_SIDE_MAX_SIZE} bots on a side.`);
  }
  const playerTeamId = isCoffeeTeamId(input.playerTeamId) ? input.playerTeamId : undefined;
  return { left, right, assignments, ...(playerTeamId ? { playerTeamId } : {}) };
}

function coffeeTeamSemanticTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COFFEE_POLL_PERSONA_STOPWORDS.has(token));
}

function scoreCoffeeTeamAffinity(args: {
  bot: CoffeeBotProfile;
  teamName: string;
  teamDescription: string;
  conversationId: string;
}): number {
  const persona = `${args.bot.name} ${args.bot.systemPrompt ?? ""}`.toLowerCase();
  const teamText = `${args.teamName} ${args.teamDescription}`;
  const personaTokens = new Set(coffeeTeamSemanticTokens(persona));
  let overlap = 0;
  for (const token of new Set(coffeeTeamSemanticTokens(teamText))) {
    if (personaTokens.has(token)) overlap += 1;
  }
  const stable = stableUnitValue(`${args.conversationId}:${args.bot.id}:${teamText}:team-affinity`);
  return clampCoffeeTeamValue(0.2 + Math.min(0.42, overlap * 0.09) + stable * 0.36);
}

function deterministicCoffeeTeamBotState(args: {
  bot: CoffeeBotProfile;
  config: CoffeeTeamSessionConfig;
  conversationId: string;
  now: string;
}): CoffeeTeamBotState {
  const originalTeamId = args.config.assignments[args.bot.id] ?? "undecided";
  const leftAffinity = scoreCoffeeTeamAffinity({
    bot: args.bot,
    teamName: args.config.left.name,
    teamDescription: args.config.left.description,
    conversationId: args.conversationId,
  });
  const rightAffinity = scoreCoffeeTeamAffinity({
    bot: args.bot,
    teamName: args.config.right.name,
    teamDescription: args.config.right.description,
    conversationId: args.conversationId,
  });
  const assignedAffinity =
    originalTeamId === "left" ? leftAffinity : originalTeamId === "right" ? rightAffinity : 0.48;
  return {
    botId: args.bot.id,
    originalTeamId,
    currentTeamId: originalTeamId,
    satisfaction: Number(clampCoffeeTeamValue(assignedAffinity).toFixed(3)),
    conviction: Number(clampCoffeeTeamValue(0.28 + Math.abs(leftAffinity - rightAffinity) * 1.35).toFixed(3)),
    pendingSwitchTeamId: null,
    pendingSwitchReason: null,
    lastSwitchReason: null,
    updatedAt: args.now,
  };
}

function buildInitialCoffeeTeamState(args: {
  group: CoffeeBotProfile[];
  config: CoffeeTeamSessionConfig;
  conversationId: string;
  now: string;
}): CoffeeTeamState {
  const deterministicBots: Record<string, CoffeeTeamBotState> = {};
  for (const bot of args.group) {
    deterministicBots[bot.id] = deterministicCoffeeTeamBotState({
      bot,
      config: args.config,
      conversationId: args.conversationId,
      now: args.now,
    });
  }
  const player: CoffeeTeamPlayerState | null = args.config.playerTeamId
    ? {
        originalTeamId: args.config.playerTeamId,
        currentTeamId: args.config.playerTeamId,
        lastSwitchReason: null,
        updatedAt: args.now,
      }
    : null;
  const counts = coffeeTeamCountsFromParticipants(deterministicBots, player);
  return {
    left: { id: "left", ...args.config.left },
    right: { id: "right", ...args.config.right },
    undecidedLabel: "Undecided",
    bots: deterministicBots,
    player,
    counts,
    status: "active",
    winnerTeamId: null,
    tiebreakerPromptedAt: null,
    resolvedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function parseCoffeeTeamState(raw: string | null | undefined): CoffeeTeamState | null {
  if (!raw || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as CoffeeTeamState;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.left || !parsed.right || !parsed.bots) return null;
    return {
      ...parsed,
      undecidedLabel: "Undecided",
      player: parsed.player ?? null,
      counts: coffeeTeamCountsFromParticipants(parsed.bots, parsed.player ?? null),
    };
  } catch {
    return null;
  }
}

function serializeCoffeeTeamState(state: CoffeeTeamState): string {
  return JSON.stringify({
    ...state,
    counts: coffeeTeamCountsFromParticipants(state.bots, state.player ?? null),
  });
}

function formatCoffeeTeamPromptSummary(state: CoffeeTeamState | null): string | null {
  if (!state) return null;
  const lines = [
    `Coffee Teams mode is active. Left side: "${state.left.name}" (${state.left.description}). Right side: "${state.right.name}" (${state.right.description}). Undecided is a holding area and cannot win.`,
    `Visible score: ${state.left.name} ${state.counts.left}, Undecided ${state.counts.undecided}, ${state.right.name} ${state.counts.right}.`,
  ];
  for (const bot of Object.values(state.bots)) {
    const current = coffeeAnyTeamName(state, bot.currentTeamId);
    const pending =
      bot.pendingSwitchTeamId && bot.pendingSwitchReason
        ? ` pending switch to ${coffeeWinningTeamName(state, bot.pendingSwitchTeamId)} because ${bot.pendingSwitchReason}`
        : "";
    lines.push(`- ${bot.botId}: current=${current}${pending}`);
  }
  if (state.player) {
    const playerCurrent = coffeeAnyTeamName(state, state.player.currentTeamId);
    const switchReason = state.player.lastSwitchReason
      ? ` Last visible player switch: ${state.player.lastSwitchReason}.`
      : "";
    lines.push(`- player: current=${playerCurrent}.${switchReason}`);
  }
  lines.push(
    "Bots should show human-like loyalty to their current side, but may be persuaded when the transcript gives them a clear in-character reason. If the player visibly switches teams in the recent transcript, bots should briefly notice it in-character."
  );
  return lines.join("\n");
}

export function advanceCoffeeTeamStateAfterReply(args: {
  state: CoffeeTeamState | null;
  speaker: CoffeeBotProfile;
  group: readonly CoffeeBotProfile[];
  replyText: string;
  now: string;
}): CoffeeTeamState | null {
  if (!args.state) return null;
  if (args.state.status === "left_won" || args.state.status === "right_won" || args.state.status === "tie_resolved") {
    return args.state;
  }
  const bots: Record<string, CoffeeTeamBotState> = {};
  for (const [botId, botState] of Object.entries(args.state.bots)) {
    bots[botId] = { ...botState };
  }
  const speakerState = bots[args.speaker.id];
  if (speakerState?.pendingSwitchTeamId) {
    bots[args.speaker.id] = {
      ...speakerState,
      currentTeamId: speakerState.pendingSwitchTeamId,
      satisfaction: clampCoffeeTeamValue(Math.max(0.38, speakerState.satisfaction + 0.12)),
      conviction: clampCoffeeTeamValue(speakerState.conviction + 0.16),
      lastSwitchReason:
        speakerState.pendingSwitchReason ??
        `Moved to ${coffeeWinningTeamName(args.state, speakerState.pendingSwitchTeamId)} after the table shifted.`,
      pendingSwitchTeamId: null,
      pendingSwitchReason: null,
      updatedAt: args.now,
    };
  }

  const effectiveSpeakerState = bots[args.speaker.id];
  const speakerTeamId = isCoffeeWinningTeamId(effectiveSpeakerState?.currentTeamId)
    ? effectiveSpeakerState.currentTeamId
    : null;
  if (speakerTeamId) {
    const teamName = coffeeWinningTeamName(args.state, speakerTeamId);
    const lowerReply = args.replyText.toLowerCase();
    const mentionsTeam =
      lowerReply.includes(args.state.left.name.toLowerCase()) ||
      lowerReply.includes(args.state.right.name.toLowerCase());
    for (const bot of args.group) {
      if (bot.id === args.speaker.id) continue;
      const current = bots[bot.id];
      if (!current || current.currentTeamId === speakerTeamId || current.pendingSwitchTeamId) continue;
      if (current.conviction > 0.78 && current.satisfaction > 0.42) continue;
      const persuasion =
        (1 - current.satisfaction) * 0.42 +
        (1 - current.conviction) * 0.24 +
        (mentionsTeam ? 0.14 : 0) +
        stableUnitValue(`${args.state.updatedAt}:${args.speaker.id}:${bot.id}:${speakerTeamId}:team-persuasion`) *
          0.28;
      if (persuasion >= 0.58) {
        bots[bot.id] = {
          ...current,
          pendingSwitchTeamId: speakerTeamId,
          pendingSwitchReason: `The latest argument made ${teamName} sound more defensible.`,
          satisfaction: clampCoffeeTeamValue(current.satisfaction - 0.08),
          updatedAt: args.now,
        };
      }
    }
  }

  const counts = coffeeTeamCountsFromParticipants(bots, args.state.player ?? null);
  const allCount = coffeeTeamParticipantCount(args.group, args.state);
  const winnerTeamId =
    counts.left === allCount ? "left" : counts.right === allCount ? "right" : null;
  return {
    ...args.state,
    bots,
    counts,
    status: winnerTeamId ? coffeeTeamWinnerStatus(winnerTeamId) : args.state.status,
    winnerTeamId: winnerTeamId ?? args.state.winnerTeamId ?? null,
    resolvedAt: winnerTeamId ? args.now : args.state.resolvedAt ?? null,
    updatedAt: args.now,
  };
}

function coffeeTeamsAreTied(state: CoffeeTeamState): boolean {
  return state.counts.left === state.counts.right && state.counts.left > 0;
}

function buildCoffeeTeamTiebreakerPitch(
  state: CoffeeTeamState,
  teamId: CoffeeWinningTeamId,
  group: readonly CoffeeBotProfile[] = []
): string {
  const team = teamId === "left" ? state.left : state.right;
  const memberNames = group
    .filter((bot) => state.bots[bot.id]?.currentTeamId === teamId)
    .map((bot) => bot.name)
    .slice(0, 4);
  const roster = memberNames.length > 0 ? `${memberNames.join(", ")} argue that ` : "";
  return normalizeCoffeePromptSnippet(
    `${team.name}: ${roster}${team.description}`,
    220
  );
}

function finalizeCoffeeTeamStateForSessionEnd(
  state: CoffeeTeamState | null,
  now: string,
  group: readonly CoffeeBotProfile[] = []
): CoffeeTeamState | null {
  if (
    !state ||
    state.status === "left_won" ||
    state.status === "right_won" ||
    state.status === "tiebreaker" ||
    state.status === "tie_resolved"
  ) {
    return state;
  }
  const counts = coffeeTeamCountsFromParticipants(state.bots, state.player ?? null);
  if (counts.left > counts.right) {
    return {
      ...state,
      counts,
      status: "left_won",
      winnerTeamId: "left",
      resolvedAt: now,
      updatedAt: now,
    };
  }
  if (counts.right > counts.left) {
    return {
      ...state,
      counts,
      status: "right_won",
      winnerTeamId: "right",
      resolvedAt: now,
      updatedAt: now,
    };
  }
  if (counts.left > 0) {
    return {
      ...state,
      counts,
      status: "tiebreaker",
      winnerTeamId: null,
      tiebreakerPitches: {
        left: buildCoffeeTeamTiebreakerPitch(state, "left", group),
        right: buildCoffeeTeamTiebreakerPitch(state, "right", group),
      },
      tiebreakerPromptedAt: state.tiebreakerPromptedAt ?? now,
      updatedAt: now,
    };
  }
  return {
    ...state,
    counts,
    updatedAt: now,
  };
}



interface CoffeeRelationshipSignal {
  targetBotId: string;
  targetBotName: string;
  delta: number;
  trend: OpinionTrend;
  reason: string;
}

const COFFEE_RELATIONSHIP_WARM_PATTERNS = [
  /\b(?:agree|agrees|agreed)\b/i,
  /\b(?:appreciate|appreciates|appreciated|admire|admires|admired|respect|respects|respected)\b/i,
  /\b(?:trust|trusts|trusted)\b/i,
  /\b(?:good|great|strong|fair|solid|gentle|thoughtful)\s+(?:point|approach|read|instinct|angle)\b/i,
  /\b(?:you'?re\s+right|that'?s\s+right|i\s+like\s+that|i\s+love\s+that)\b/i,
] as const;

const COFFEE_RELATIONSHIP_TENSE_PATTERNS = [
  /\b(?:disagree|disagrees|disagreed|challenge|challenges|challenged|push\s+back)\b/i,
  /\b(?:annoy|annoys|annoyed|frustrate|frustrates|frustrated|tense|tension)\b/i,
  /\b(?:don'?t\s+buy|not\s+convinced|too\s+easy|too\s+neat|too\s+soft|too\s+harsh)\b/i,
  /\b(?:wary|guarded|skeptical|sceptical|doubt|doubts|doubted)\b/i,
] as const;

function countRegexHits(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function evaluateCoffeeRelationshipSignal(replyText: string): Omit<CoffeeRelationshipSignal, "targetBotId" | "targetBotName"> | null {
  const normalized = replyText.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const warmHits = countRegexHits(normalized, COFFEE_RELATIONSHIP_WARM_PATTERNS);
  const tenseHits = countRegexHits(normalized, COFFEE_RELATIONSHIP_TENSE_PATTERNS);
  if (warmHits <= 0 && tenseHits <= 0) return null;
  if (warmHits > tenseHits) {
    return {
      delta: Math.min(6, 2 + warmHits * 2),
      trend: "up",
      reason: "The speaker showed warmth toward this peer during Coffee.",
    };
  }
  if (tenseHits > warmHits) {
    return {
      delta: -Math.min(6, 2 + tenseHits * 2),
      trend: "down",
      reason: "The speaker challenged or showed tension with this peer during Coffee.",
    };
  }
  return null;
}

function coffeeRelationshipVisibleText(raw: string): string {
  return raw
    .replace(new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi"), "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function textMentionsCoffeeBotName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const escaped = escapeRegExp(trimmed);
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function extractCoffeeRelationshipSignals(args: {
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[];
  replyText: string;
}): CoffeeRelationshipSignal[] {
  const baseSignal = evaluateCoffeeRelationshipSignal(args.replyText);
  if (!baseSignal) return [];
  const visibleText = coffeeRelationshipVisibleText(args.replyText);
  const seatedBotIds = new Set(args.group.map((bot) => bot.id));
  const targetsById = new Map<string, Pick<CoffeeBotProfile, "id" | "name">>();
  const mentionRe = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  for (const match of args.replyText.matchAll(mentionRe)) {
    const decoded = decodeCoffeeMentionBotId(match[2] ?? "");
    if (!decoded || decoded === args.speaker.id || !seatedBotIds.has(decoded)) continue;
    const target = args.group.find((bot) => bot.id === decoded);
    if (target) targetsById.set(target.id, target);
  }
  for (const peer of args.group) {
    if (peer.id === args.speaker.id || targetsById.has(peer.id)) continue;
    if (textMentionsCoffeeBotName(visibleText, peer.name)) {
      targetsById.set(peer.id, peer);
    }
  }
  return [...targetsById.values()].map((target) => ({
    targetBotId: target.id,
    targetBotName: target.name,
    ...baseSignal,
  }));
}

export function applyCoffeeRelationshipSocialDeltas(args: {
  previousByBotId: Record<string, CoffeeBotSocialSnapshot>;
  speakerBotId: string;
  signals: readonly CoffeeRelationshipSignal[];
}): Record<string, CoffeeBotSocialSnapshot> {
  if (args.signals.length === 0) return args.previousByBotId;
  const next: Record<string, CoffeeBotSocialSnapshot> = {};
  for (const [botId, snapshot] of Object.entries(args.previousByBotId)) {
    next[botId] = sanitizeCoffeeSocialSnapshot(snapshot);
  }
  const speaker = next[args.speakerBotId];
  if (!speaker) return next;
  for (const signal of args.signals) {
    const weight = signal.delta / 100;
    next[args.speakerBotId] = sanitizeCoffeeSocialSnapshot({
      ...next[args.speakerBotId],
      disposition: (next[args.speakerBotId] ?? speaker).disposition + weight * 0.42,
      valuesFriction: (next[args.speakerBotId] ?? speaker).valuesFriction - weight * 0.32,
      engagement: (next[args.speakerBotId] ?? speaker).engagement + Math.abs(weight) * 0.2,
      leavePressure: (next[args.speakerBotId] ?? speaker).leavePressure - weight * 0.18,
    });
    const target = next[signal.targetBotId];
    if (!target) continue;
    next[signal.targetBotId] = sanitizeCoffeeSocialSnapshot({
      ...target,
      disposition: target.disposition + weight * 0.18,
      valuesFriction: target.valuesFriction - weight * 0.14,
      engagement: target.engagement + Math.abs(weight) * 0.16,
    });
  }
  return next;
}

export function seedCoffeeSocialStateFromRelationships(args: {
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  relationshipsBySource: Record<string, Record<string, BotRelationshipSnapshot>>;
}): Record<string, CoffeeBotSocialSnapshot> {
  const next: Record<string, CoffeeBotSocialSnapshot> = {};
  for (const [botId, snapshot] of Object.entries(args.socialByBotId)) {
    const relationships = Object.values(args.relationshipsBySource[botId] ?? {});
    if (relationships.length === 0) {
      next[botId] = sanitizeCoffeeSocialSnapshot(snapshot);
      continue;
    }
    const averageScore =
      relationships.reduce((sum, relationship) => sum + relationship.score, 0) /
      relationships.length;
    const weight = (averageScore - 50) / 100;
    next[botId] = sanitizeCoffeeSocialSnapshot({
      ...snapshot,
      disposition: snapshot.disposition + weight * 0.1,
      valuesFriction: snapshot.valuesFriction - weight * 0.08,
      engagement: snapshot.engagement + Math.abs(weight) * 0.04,
      leavePressure: snapshot.leavePressure - weight * 0.04,
    });
  }
  return next;
}

function formatCoffeeRelationshipPromptSummary(args: {
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[];
  relationshipsBySource?: Record<string, Record<string, BotRelationshipSnapshot>>;
  sourceBotId?: string;
}): string | null {
  const relationshipsBySource = args.relationshipsBySource ?? {};
  const namesById = new Map(args.group.map((bot) => [bot.id, bot.name]));
  const sourceEntries = args.sourceBotId
    ? [[args.sourceBotId, relationshipsBySource[args.sourceBotId] ?? {}] as const]
    : Object.entries(relationshipsBySource);
  const lines: string[] = [];
  for (const [sourceBotId, byTarget] of sourceEntries) {
    const sourceName = namesById.get(sourceBotId);
    if (!sourceName) continue;
    for (const relationship of Object.values(byTarget)) {
      const targetName = namesById.get(relationship.targetBotId);
      if (!targetName) continue;
      const label = args.sourceBotId ? targetName : `${sourceName} -> ${targetName}`;
      lines.push(
        `- ${label}: ${relationship.band}, mood=${relationship.moodKey}, score=${relationship.score}/100, trend=${relationship.trend}; ${relationship.lastReason}`
      );
      if (lines.length >= 8) break;
    }
    if (lines.length >= 8) break;
  }
  if (lines.length === 0) return null;
  return [
    args.sourceBotId
      ? "Your durable bot-to-bot relationship reads for seated peers (soft context, not persona identity):"
      : "Durable bot-to-bot relationship reads among seated bots (soft routing context):",
    ...lines,
    "Use these as subtle disposition only. Do not mention hidden scores, memory systems, or off-screen records.",
  ].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove speaker labels that small models sometimes copy from the transcript
 * prompt into the visible reply.
 */
export function stripCoffeeSpeakerPrefix(raw: string, speakerName: string | null | undefined): string {
  let text = raw.trim();
  const names = [speakerName, "assistant", "bot"]
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0);

  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;
    for (const name of names) {
      const escaped = escapeRegExp(name);
      text = text
        .replace(
          new RegExp(`^\\s*\\[\\s*${escaped}\\s*(?:\\((?:assistant|bot)\\))?\\s*\\]\\s*:?\\s*`, "i"),
          ""
        )
        .replace(
          new RegExp(`^\\s*\\*{0,2}${escaped}\\s*(?:\\((?:assistant|bot)\\))?\\*{0,2}\\s*[:：-]\\s*`, "i"),
          ""
        )
        .replace(new RegExp(`^\\s*\\*{0,2}${escaped}\\*{0,2}\\s*,\\s+`, "i"), "")
        .replace(
          new RegExp(
            `^\\s*\\*{0,2}${escaped}\\*{0,2}\\s+(?=(?:we|i|you|respond|reply|write|return|length|do\\s+not)\\b)`,
            "i"
          ),
          ""
        )
        .replace(
          new RegExp(
            `^\\s*\\*{0,2}${escaped}\\*{0,2}\\s+with\\s+[^.!?\\n]{3,80}?\\s+(?=[A-Z"“'‘(])`,
            ""
          ),
          ""
        )
        .trim();
    }
    if (text === before) break;
  }

  return text;
}

function stripCoffeeSelfAddressNoise(
  raw: string,
  speakerName: string | null | undefined
): string {
  const name = typeof speakerName === "string" ? speakerName.trim() : "";
  if (!name) return raw;
  const escaped = escapeRegExp(name);
  return raw
    .replace(new RegExp(`([,;:!?])\\s*${escaped}\\s*[—-]\\s*`, "gi"), "$1 ")
    .replace(new RegExp(`\\s+[—-]\\s*${escaped}\\s*[—-]\\s*`, "gi"), " ")
    .replace(new RegExp(`\\s+${escaped}\\s*[—-]\\s*`, "gi"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const COFFEE_PROMPT_LEAK_PREFIX_PATTERNS = [
  /** Matches meta lines models emit ("need/must/should/have to respond as …"). */
  /^(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?respond\s+as\b/i,
  /^(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?reply\s+as\b/i,
  /^(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?(?:produce|write|return|provide|create)\b/i,
  /^(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?(?:reply|answer)\b/i,
  /^write only\b/i,
  /^return only\b/i,
  /^length\s*:/i,
  /^respond as\b/i,
  /^reply as\b/i,
  /^you are sitting at coffee mode\b/i,
  /^the user says\b/i,
  /^the user wants\b/i,
  /^the user needs\b/i,
  /^the user requests\b/i,
  /^current autonomous table moment\b/i,
  /^latest table moment\b/i,
  /^reply naturally as part of the table conversation\b/i,
  /^do not include a speaker label\b/i,
  /^hard tabletop cap\b/i,
  /^recent table transcript\b/i,
  /^coffee style cues\b/i,
  /^first meeting with this user\b/i,
] as const;

const COFFEE_PROMPT_LEAK_FRAGMENT_PATTERNS = [
  /\brespond as\b/i,
  /\breply as\b/i,
  /\bone line\b/i,
  /\bone clause\b/i,
  /\bsingle clause\b/i,
  /\bsingle line\b/i,
  /\bshort table line\b/i,
  /\bno line breaks\b/i,
  /\bhard tabletop cap\b/i,
  /\bdo not include a speaker label\b/i,
  /\bsay your next short table line now\b/i,
  /\banswer with your next short table line now\b/i,
  /\brecent table transcript\b/i,
  /\bthe user says\b/i,
  /\bthe user requests\b/i,
  /\bthe user is prompting me\b/i,
  /\bcurrent autonomous table moment\b/i,
  /\byou are sitting at coffee mode\b/i,
  /\breply naturally as part of the table conversation\b/i,
  /\bcharacters\s+max\b/i,
  /\bmax\s+\d+\s+characters\b/i,
  /\bunder\s+\d+\s+characters\b/i,
  /\bup to\s+\d+\s+characters\b/i,
  /\bvisible table line\b/i,
  /\bno speaker\b/i,
  /\bno speaker label\b/i,
] as const;

const COFFEE_PROMPT_LEAK_ANYWHERE_PATTERNS = [
  /\b(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?respond\s+as\b/i,
  /\b(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?reply\s+as\b/i,
  /\b(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?(?:produce|write|return|provide|create)\s+(?:a\s+)?(?:single\s+)?(?:line|clause|reply|response|utterance)\b/i,
  /\bthe user (?:wants|needs|asked for|requested)\s+(?:a\s+)?(?:single\s+)?(?:line|clause|reply|response|utterance)\b/i,
  /\bthe user (?:says|specifically says|is prompting me to)\s+["“]?[A-Z][^"”]{0,80}\b(?:say|answer with)\s+your\s+next\s+short\s+table\s+line\s+now/i,
  /\bthe topic is still\b.+\bthe user (?:is prompting me|specifically says|wants)\b/i,
] as const;

const COFFEE_PROMPT_LEAK_REPAIR_MAX_TOKENS = 48;
const COFFEE_SPEAKER_REPLY_DECODE_MIN_TOKENS = 96;
const COFFEE_CHARACTER_IMMERSION_BREAK_PATTERNS = [
  /\bas\s+(?:an?\s+)?(?:digital\s+)?ai\s+(?:assistant|model)\b/i,
  /\bi\s+am\s+(?:an?\s+)?(?:digital\s+)?(?:ai|language model|chatbot|virtual assistant)\b/i,
  /\bi(?:\s+do\s+not|\s+don't|\s+cannot|\s+can't)\s+(?:have|take|send|share)\s+(?:photos?|images?|a body|physical form)\b/i,
  /\bi\s+wish\s+i\s+could\s+send\s+you\s+(?:a\s+)?(?:photo|image)\b/i,
  /\b(?:photos?|images?)\s+(?:aren't|are not|can't be|cannot be|isn't|is not)\s+possible\s+in\s+this\s+chat\b/i,
  /\b(?:not\s+possible|can't|cannot)\s+(?:in|within)\s+this\s+chat\b/i,
  /\bi\s+do\s+not\s+(?:physically\s+)?(?:exist|have a physical form)\b/i,
  /\bas\s+(?:an?\s+)?(?:llm|large language model)\b/i,
] as const;

const COFFEE_STAGE_ACTION_VERB_RE =
  /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically)\s+)?(?:adjusts?|arches?|blinks?|breathes?|chuckles?|crosses?|drums?|folds?|frowns?|gazes?|gestures?|glances?|grins?|grimaces?|laughs?|leans?|looks?|mutters?|nods?|pauses?|picks?|places?|plucks?|points?|ponders?|pours?|pushes?|pushing|raises?|rolls?|rubs?|scoffs?|scratches?|sets?|shakes?|shifts?|shrugs?|sighs?|sips?|smiles?|smirks?|snorts?|squints?|stares?|stirs?|straightens?|takes?|taking|taps?|tilts?|touches?|turns?|waves?|winces?)\b/i;
const COFFEE_STAGE_ACTION_BODY_PART_RE =
  /^(?:(?:his|her|their|my)\s+)?(?:brows?|claws?|eyes?|fingers?|fists?|hands?|head|jaw|mouth|shoulders?|tentacles?|voice)\s+(?:clench(?:es)?|drum(?:s)?|fold(?:s)?|glance(?:s)?|grip(?:s)?|hover(?:s)?|lift(?:s)?|pause(?:s)?|raise(?:s)?|rest(?:s)?|slam(?:s)?|slap(?:s)?|snap(?:s)?|tap(?:s)?|tighten(?:s)?|twitch(?:es)?|wave(?:s)?)\b/i;
const COFFEE_STAGE_ACTION_BLOCK_RE = /\*+([^*\n]+?)\*+/g;

function isValidCoffeeStageAction(action: string): boolean {
  const normalized = action.trim();
  if (!normalized) return false;
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 16) return false;
  const lower = normalized.toLowerCase();
  if (COFFEE_STAGE_ACTION_VERB_RE.test(lower)) return true;
  if (COFFEE_STAGE_ACTION_BODY_PART_RE.test(lower)) return true;
  // Allow common verb-like morphology so we don't over-prune natural actions.
  return /\b\p{L}+(?:ing|ed)\b/iu.test(lower);
}

function sanitizeCoffeeStageActions(raw: string): string {
  if (!raw) return raw;
  return raw.replace(COFFEE_STAGE_ACTION_BLOCK_RE, (full, inner) => {
    const candidate = String(inner ?? "").trim();
    if (!candidate) return "";
    // Keep valid stage actions wrapped so the client can lift them into badges.
    // Invalid tags degrade to plain prose instead of disappearing.
    return isValidCoffeeStageAction(candidate) ? `*${candidate}*` : candidate;
  });
}

function normalizeCoffeeUnmarkedStageActionOpener(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("*")) return raw;
  if (!/^[a-z]/u.test(trimmed)) return raw;
  const match = trimmed.match(/^(.{6,120}?)\s+((?:[AI]\b|[A-Z][\p{L}\p{N}"“'‘(\[]).*)$/u);
  if (!match?.[1] || !match[2]) return raw;
  const action = match[1].replace(/[,.!?;:\s]+$/u, "").trim();
  const spoken = match[2].trim();
  if (!action || !spoken) return raw;
  if (!isValidCoffeeStageAction(action)) return raw;
  return `*${action}* ${spoken}`;
}

/**
 * Strip wrapping noise so leaked instructions still match after models echo
 * prompts inside quotes or markdown emphasis.
 */
function normalizedCoffeeReplyForLeakScan(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text.replace(/^[*"_`'#\s]+/, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * Detect when the model replies with Coffee instruction text instead of an
 * in-character table line.
 */
export function coffeeReplyLooksLikePromptLeak(raw: string): boolean {
  const normalized = normalizedCoffeeReplyForLeakScan(raw);
  if (!normalized) return false;
  if (COFFEE_PROMPT_LEAK_ANYWHERE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (COFFEE_PROMPT_LEAK_PREFIX_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  let fragmentHits = 0;
  for (const pattern of COFFEE_PROMPT_LEAK_FRAGMENT_PATTERNS) {
    if (pattern.test(normalized)) {
      fragmentHits += 1;
      if (fragmentHits >= 2) return true;
    }
  }
  return false;
}

/**
 * Detect persona breaks where a bot narrates itself as an AI assistant/model
 * instead of staying fully in-character.
 */
export function coffeeReplyBreaksCharacterImmersion(raw: string): boolean {
  const normalized = normalizedCoffeeReplyForLeakScan(raw);
  if (!normalized) return false;
  return COFFEE_CHARACTER_IMMERSION_BREAK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function visibleCoffeeSpeechForValueScan(raw: string): string {
  return raw
    .replace(COFFEE_STAGE_ACTION_BLOCK_RE, " ")
    .replace(/\[[^\]\n]+\]\(prism-bot:\/\/[^)\s]+?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function coffeeUserMessageIsActionOnly(raw: string): boolean {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  const withoutWrappedActions = visibleCoffeeSpeechForValueScan(trimmed);
  if (!withoutWrappedActions) return true;
  const normalized = normalizeCoffeeUnmarkedStageActionOpener(trimmed);
  if (normalized !== trimmed && !visibleCoffeeSpeechForValueScan(normalized)) {
    return true;
  }
  return isValidCoffeeStageAction(trimmed);
}

const COFFEE_LOW_VALUE_TABLE_LINE_PATTERNS = [
  /^(?:yeah,?\s*)?true enough[.!?]?$/i,
  /^(?:yeah,?\s*)?fair point[.!?]?$/i,
  /^fair enough[.!?]?$/i,
  /^noted[.!?]?$/i,
  /^(?:yeah|honestly|okay|ok),?\s*that tracks[.!?]?$/i,
  /^that tracks[.!?]?$/i,
  /^i hear you(?: on that)?[.!?]?$/i,
  /^i hear the (?:angle|point)[.!?]?$/i,
  /^i get that[.!?]?$/i,
  /^could be[.!?]?$/i,
  /^maybe[.!?]?$/i,
  /^fair question[.!?]?$/i,
  /^hold that thought[.!?]?$/i,
  /^let'?s ground it[.!?]?$/i,
  /^let'?s keep this simple[.!?]?$/i,
  /^okay,?\s*keep it moving[.!?]?$/i,
] as const;

const COFFEE_META_TABLE_MANAGEMENT_PATTERNS = [
  /\bthe table is circling\b/i,
  /\btime for a cleaner point\b/i,
  /\btable-management\b/i,
  /\bsilent moderator\b/i,
] as const;

const COFFEE_INCOHERENT_TABLE_LINE_PATTERNS = [
  /\bsometimes\s+the\s+what\b/i,
  /\bwhat\s+[^.!?]{0,48}\b(?:we['’]?ve|weve)\b[^.!?]{0,48}\bchanges?\b/i,
] as const;

export function coffeeReplyIsLowValueTableLine(raw: string): boolean {
  const visible = visibleCoffeeSpeechForValueScan(raw).replace(/[“”]/g, "\"");
  const normalized = visible.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (COFFEE_META_TABLE_MANAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (COFFEE_INCOHERENT_TABLE_LINE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (normalized.length > 72) return false;
  return COFFEE_LOW_VALUE_TABLE_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
}

const COFFEE_UNFINISHED_REPLY_TRAILING_WORDS = new Set([
  "a",
  "also",
  "an",
  "and",
  "as",
  "at",
  "because",
  "but",
  "for",
  "from",
  "if",
  "in",
  "into",
  "mostly",
  "of",
  "on",
  "or",
  "since",
  "so",
  "than",
  "that",
  "the",
  "then",
  "though",
  "to",
  "unless",
  "until",
  "when",
  "where",
  "whether",
  "while",
  "with",
  "without",
]);

export function coffeeReplyLooksUnfinished(raw: string): boolean {
  const visible = visibleCoffeeSpeechForValueScan(raw).replace(/[“”]/g, "\"");
  const normalized = visible.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (/[.!?…)"'\]]$/u.test(normalized)) return false;
  if (/[—-]$/u.test(normalized)) return true;
  const words = normalized.toLowerCase().match(/[\p{L}\p{N}'’]+/gu) ?? [];
  if (words.length === 0) return false;
  const last = words[words.length - 1]?.replace(/[’']/g, "") ?? "";
  if (COFFEE_UNFINISHED_REPLY_TRAILING_WORDS.has(last)) return true;
  const tail = words.slice(-2).join(" ").replace(/[’']/g, "");
  return tail === "but mostly" || tail === "and then" || tail === "so that";
}

export function coffeeSpeakerMaxTokensForTurn(
  speakerMaxTokens: number | null | undefined,
  coffeeCap: number
): number {
  const cap = Math.max(1, Math.floor(coffeeCap));
  const floor = Math.min(cap, COFFEE_SPEAKER_REPLY_DECODE_MIN_TOKENS);
  const requested =
    typeof speakerMaxTokens === "number" && Number.isFinite(speakerMaxTokens)
      ? Math.max(1, Math.floor(speakerMaxTokens))
      : cap;
  return Math.min(cap, Math.max(floor, requested));
}

/**
 * Normalize a raw speaker draft into something safe for the visible Coffee
 * table. Returning an empty string signals "do not show this".
 */
export function sanitizeCoffeeTableReply(
  raw: string,
  speakerName: string | null | undefined,
  maxChars: number = COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS
): string {
  const stripped = stripCoffeeSpeakerPrefix(raw, speakerName);
  if (!stripped) return "";
  const withoutSelfAddressNoise = stripCoffeeSelfAddressNoise(stripped, speakerName);
  const withStageActionsSanitized = normalizeCoffeeUnmarkedStageActionOpener(
    sanitizeCoffeeStageActions(withoutSelfAddressNoise)
  );
  if (coffeeReplyLooksLikePromptLeak(withStageActionsSanitized)) return "";
  if (coffeeReplyBreaksCharacterImmersion(withStageActionsSanitized)) return "";
  if (coffeeReplyIsLowValueTableLine(withStageActionsSanitized)) return "";
  if (coffeeReplyLooksUnfinished(withStageActionsSanitized)) return "";
  return clampCoffeeTableReplyText(withStageActionsSanitized, maxChars);
}

type ScriptedCoffeeAmbientActionEntry = Pick<CoffeeAmbientActionPayload, "category" | "action">;

const SCRIPTED_COFFEE_AMBIENT_ACTIONS: readonly ScriptedCoffeeAmbientActionEntry[] = [
  { category: "sip", action: "takes a quiet sip" },
  { category: "cup", action: "sets the cup down" },
  { category: "cup", action: "turns the cup once" },
  { category: "cup", action: "stirs the coffee" },
  { category: "cup", action: "nudges the cup closer" },
  { category: "cup", action: "slides the cup aside" },
] as const;

function coffeeAmbientActionChance(settings: CoffeeSessionSettings): number {
  switch (settings.tableEnergy) {
    case "still":
      return 0.08;
    case "relaxed":
      return 0.14;
    case "buzzy":
      return 0.18;
    case "theatre":
      return 0.16;
    case "afterparty":
      return 0.22;
  }
}

function coffeeReplyContainsStageAction(replyText: string): boolean {
  return /\*+[^*\n]+?\*+/.test(replyText);
}

function coffeeReplySpokenText(replyText: string): string {
  return replyText
    .replace(COFFEE_STAGE_ACTION_BLOCK_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadRecentCoffeeAmbientActionTexts(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  botId: string;
  limit?: number;
}): string[] {
  const rows = args.db
    .prepare(
      `SELECT tool_payload
         FROM messages
        WHERE conversation_id = ?
          AND user_id = ?
          AND role = 'assistant'
          AND bot_id = ?
          AND tool_payload IS NOT NULL
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(
      args.conversationId,
      args.userId,
      args.botId,
      Math.max(1, args.limit ?? 12)
    ) as unknown as Array<{ tool_payload: string | null }>;
  const actions: string[] = [];
  for (const row of rows) {
    const action = parseStoredAssistantToolPayload(row.tool_payload).coffeeAmbientAction;
    if (action?.source === "scripted" && action.action.trim()) {
      actions.push(action.action.trim());
    }
    if (actions.length >= COFFEE_AMBIENT_RECENT_ACTION_LIMIT) break;
  }
  return actions;
}

function buildScriptedCoffeeAmbientAction(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  speaker: Pick<CoffeeBotProfile, "id">;
  replyText: string;
  historyLength: number;
  sessionSettings: CoffeeSessionSettings;
  sessionRemainingMs?: number | null;
  durationMinutes?: CoffeeSessionDurationMinutes | null;
  coffeeCupSeed: string;
  activePoll: CoffeePoll | null;
  interruptionEvent?: CoffeeInterruptionEvent;
  departurePersisted: boolean;
}): CoffeeAmbientActionPayload | null {
  if (args.activePoll) return null;
  if (args.interruptionEvent) return null;
  if (args.departurePersisted) return null;
  if (!coffeeReplySpokenText(args.replyText)) return null;
  if (coffeeReplyContainsStageAction(args.replyText)) return null;
  const baseProgress = coffeeCupProgressFromSessionTiming({
    sessionRemainingMs: args.sessionRemainingMs,
    durationMinutes: args.durationMinutes,
  });
  if (baseProgress === null) return null;
  const pacedProgress = coffeeCupPacedProgress(
    baseProgress,
    args.coffeeCupSeed,
    args.durationMinutes
  );
  if (pacedProgress >= COFFEE_AMBIENT_EMPTY_PROGRESS) return null;
  const chance = coffeeAmbientActionChance(args.sessionSettings);
  const roll = stableUnitValue(
    `${args.conversationId}:${args.speaker.id}:${args.historyLength}:coffee-ambient-roll`
  );
  if (roll > chance) return null;

  const pool = SCRIPTED_COFFEE_AMBIENT_ACTIONS.filter(
    (entry) => entry.category !== "sip" || pacedProgress < COFFEE_AMBIENT_SIP_MAX_PROGRESS
  );
  if (pool.length === 0) return null;

  const recent = new Set(
    loadRecentCoffeeAmbientActionTexts({
      db: args.db,
      userId: args.userId,
      conversationId: args.conversationId,
      botId: args.speaker.id,
    })
  );
  const startIndex =
    Math.floor(
      stableUnitValue(
        `${args.conversationId}:${args.speaker.id}:${args.historyLength}:coffee-ambient-action`
      ) * pool.length
    ) % pool.length;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(startIndex + offset) % pool.length]!;
    if (recent.has(candidate.action)) continue;
    return {
      v: 1,
      name: "coffeeAmbientAction",
      source: "scripted",
      category: candidate.category,
      action: candidate.action,
    };
  }
  return null;
}

function serializeCoffeeAssistantToolPayload(args: {
  interruptionEvent?: CoffeeInterruptionEvent;
  coffeeAmbientAction?: CoffeeAmbientActionPayload | null;
}): string | null {
  const coffeeAmbientAction = args.coffeeAmbientAction ?? undefined;
  if (!coffeeAmbientAction) {
    return args.interruptionEvent
      ? JSON.stringify({ coffeeInterruption: args.interruptionEvent })
      : null;
  }
  if (!args.interruptionEvent) {
    return serializeAssistantToolPayload({ coffeeAmbientAction });
  }
  return JSON.stringify({
    v: 1,
    coffeeInterruption: args.interruptionEvent,
    coffeeAmbientAction,
  });
}

function buildCoffeePromptLeakRepairMessages(args: {
  speaker: CoffeeBotProfile;
  leakedReply: string;
  maxChars: number;
}): ProviderMessage[] {
  const speakerSystemPrompt = composeBotSystemPrompt(
    args.speaker.name,
    args.speaker.systemPrompt,
    args.speaker.flirtEnabled === true
  );
  const messages: ProviderMessage[] = [];
  if (speakerSystemPrompt) {
    messages.push({ role: "system", content: speakerSystemPrompt });
  }
  messages.push({
    role: "system",
    content:
      `You are ${args.speaker.name} at the PRISM coffee table. ` +
      "Your previous draft leaked hidden instructions. Repair it into the single visible line only.",
  });
  messages.push({
    role: "user",
    content: [
      `Bad draft: ${args.leakedReply}`,
      `Return only ${args.speaker.name}'s visible table line.`,
      `Length: one clause only, max ${args.maxChars} characters including spaces.`,
      "No speaker label. No mention of prompts, instructions, transcripts, caps, or rewriting.",
      "Never say you are an AI, model, assistant, or digital system. Stay fully in-character.",
    ].join("\n"),
  });
  return messages;
}

async function repairCoffeePromptLeak(args: {
  speakerProvider: LlmProvider;
  speaker: CoffeeBotProfile;
  speakerOptions: GenerateOptions;
  leakedReply: string;
  maxChars: number;
}): Promise<string> {
  const repaired = await args.speakerProvider.generateResponse(
    buildCoffeePromptLeakRepairMessages({
      speaker: args.speaker,
      leakedReply: args.leakedReply,
      maxChars: args.maxChars,
    }),
    {
      ...args.speakerOptions,
      maxTokens: Math.min(
        args.speakerOptions.maxTokens ?? COFFEE_PROMPT_LEAK_REPAIR_MAX_TOKENS,
        COFFEE_PROMPT_LEAK_REPAIR_MAX_TOKENS
      ),
    }
  );
  return typeof repaired === "string"
    ? sanitizeCoffeeTableReply(repaired, args.speaker.name, args.maxChars)
    : "";
}

function buildCoffeeRepeatRepairMessages(args: {
  speaker: CoffeeBotProfile;
  repeatedReply: string;
  recentLines: readonly string[];
  tableFocus: string;
  repeatedMotifs: readonly string[];
  maxChars: number;
}): ProviderMessage[] {
  const speakerSystemPrompt = composeBotSystemPrompt(
    args.speaker.name,
    args.speaker.systemPrompt,
    args.speaker.flirtEnabled === true
  );
  const messages: ProviderMessage[] = [];
  if (speakerSystemPrompt) {
    messages.push({ role: "system", content: speakerSystemPrompt });
  }
  messages.push({
    role: "system",
    content:
      `You are ${args.speaker.name} at the PRISM coffee table. ` +
      "Your previous draft repeated the table. Replace it with a fresh, concrete in-character beat.",
  });
  messages.push({
    role: "user",
    content: [
      `Latest table moment: ${args.tableFocus}`,
      `Repeated draft: ${args.repeatedReply}`,
      `Do not reuse: ${args.recentLines.join(" / ")}`,
      ...(args.repeatedMotifs.length > 0
        ? [`Avoid the circular table motifs: ${args.repeatedMotifs.join(", ")}.`]
        : []),
      "Change the social motion: add a new concrete object, feeling, decision, or pause.",
      `Return one visible ${args.speaker.name} line, max ${args.maxChars} characters.`,
    ].join("\n"),
  });
  return messages;
}

async function repairCoffeeRepeatedReply(args: {
  speakerProvider: LlmProvider;
  speaker: CoffeeBotProfile;
  speakerOptions: GenerateOptions;
  repeatedReply: string;
  history: readonly ChatMessage[];
  tableFocus: string;
  maxChars: number;
}): Promise<string> {
  const recentLines = args.history
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .map((message) => message.content);
  const repeatedMotifs = repeatedCoffeeMotifsInReply(args.repeatedReply, args.history);
  const repaired = await args.speakerProvider.generateResponse(
    buildCoffeeRepeatRepairMessages({
      speaker: args.speaker,
      repeatedReply: args.repeatedReply,
      recentLines,
      tableFocus: args.tableFocus,
      repeatedMotifs,
      maxChars: args.maxChars,
    }),
    {
      ...args.speakerOptions,
      maxTokens: Math.min(
        args.speakerOptions.maxTokens ?? COFFEE_PROMPT_LEAK_REPAIR_MAX_TOKENS,
        COFFEE_PROMPT_LEAK_REPAIR_MAX_TOKENS
      ),
    }
  );
  const visible = typeof repaired === "string"
    ? sanitizeCoffeeTableReply(repaired, args.speaker.name, args.maxChars)
    : "";
  return visible &&
    !coffeeReplyRepeatsRecentAssistant(visible, args.history) &&
    !coffeeReplyRepeatsRecentMotifs(visible, args.history) &&
    !coffeeReplyIsLowValueTableLine(visible)
    ? visible
    : "";
}

export function buildCoffeeEmergencyFallbackReply(args: {
  tableFocus: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  conversationId: string;
  historyLength: number;
  seedExtra?: string;
  avoidTexts?: readonly string[];
  maxChars: number;
  activePoll?: (Pick<CoffeePoll, "options"> & Partial<Pick<CoffeePoll, "votes">>) | null;
}): string {
  const pollOptions = args.activePoll?.options ?? [];
  const activePollVote = Array.isArray(args.activePoll?.votes)
    ? args.activePoll.votes.find((vote) => vote.botId === args.speaker.id)
    : null;
  const preferredPollOptionIndex =
    activePollVote?.kind === "option" && typeof activePollVote.optionIndex === "number"
      ? activePollVote.optionIndex
      : typeof activePollVote?.deliberation?.leaningOptionIndex === "number"
        ? activePollVote.deliberation.leaningOptionIndex
        : null;
  const options = pollOptions.length >= 2
    ? buildCoffeePollEmergencyFallbackOptions({
        pollOptions,
        conversationId: args.conversationId,
        speakerId: args.speaker.id,
        historyLength: args.historyLength,
        seedExtra: args.seedExtra,
        preferredOptionIndex: preferredPollOptionIndex,
      })
    : /\?\s*$/.test(args.tableFocus.trim())
    ? [
        "*turns the cup once* I need one sharper reason before I buy that.",
        "*leans in slightly* The missing piece is what this costs someone.",
        "*glances at the table* Put a concrete example under it and it gets more interesting.",
        "*taps the rim once* The answer depends on what we are protecting.",
      ]
    : [
        "*sets the cup down* The stronger point is still hiding under the easy one.",
        "*looks around the table* Someone should name the cost, not just the mood.",
        "*stirs slowly* Bring it back to the thing we can actually test.",
        "*leans back* That needs a sharper object on the table.",
      ];
  const seed = `${args.conversationId}:${args.speaker.id}:${args.historyLength}:${args.seedExtra ?? ""}:${args.tableFocus}`;
  const startIndex = Math.floor(stableUnitValue(seed) * options.length) % options.length;
  const avoidKeys = new Set((args.avoidTexts ?? []).map(coffeeReplyRepeatKey).filter(Boolean));
  let fallback = options[startIndex] ?? options[0]!;
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(startIndex + offset) % options.length] ?? fallback;
    if (!avoidKeys.has(coffeeReplyRepeatKey(candidate))) {
      fallback = candidate;
      break;
    }
  }
  return clampCoffeeTableReplyText(fallback, args.maxChars);
}

function buildCoffeePollEmergencyFallbackOptions(args: {
  pollOptions: readonly string[];
  conversationId: string;
  speakerId: string;
  historyLength: number;
  seedExtra?: string;
  preferredOptionIndex?: number | null;
}): string[] {
  const optionCount = args.pollOptions.length;
  const seed = stableUnitValue(
    `${args.conversationId}:${args.speakerId}:${args.historyLength}:${args.seedExtra ?? ""}:poll-fallback`
  );
  const preferredOptionIndex =
    typeof args.preferredOptionIndex === "number" &&
    args.preferredOptionIndex >= 0 &&
    args.preferredOptionIndex < optionCount
      ? args.preferredOptionIndex
      : null;
  const firstIndex = preferredOptionIndex ?? (Math.floor(seed * optionCount) % optionCount);
  const secondIndex = (firstIndex + 1) % optionCount;
  const first = args.pollOptions[firstIndex] ?? args.pollOptions[0] ?? "that one";
  const second = args.pollOptions[secondIndex] ?? args.pollOptions[0] ?? "the other side";
  return [
    `I still lean ${first}; the table has not made ${second} convincing yet.`,
    `${first} fits the evidence better for me, unless someone has a sharper counterpoint.`,
    `Put me near ${first} for now; ${second} needs more than vibes.`,
    `${second} is not impossible, but ${first} sounds more plausible at this table.`,
  ];
}

function buildCoffeeFreshFallbackBeat(args: {
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  conversationId: string;
  historyLength: number;
  tableFocus?: string;
  seedExtra?: string;
  avoidTexts?: readonly string[];
  maxChars: number;
}): string {
  const focus = coffeeFallbackFocusPhrase(args.tableFocus ?? "");
  const options = focus
    ? [
        `*taps the cup once* Put ${focus} under a consequence we can see.`,
        `*leans back* ${focus} only matters if someone names who pays for it.`,
        `*stirs slowly* The sharper test is whether ${focus} changes anything at the table.`,
        `*glances around* ${focus} needs one example before it becomes a verdict.`,
        `*sets the cup down* The cost of ${focus} is the part worth saying plainly.`,
      ]
    : [
        "*sets the cup down* The stronger point is still hiding under the easy one.",
        "*looks around the table* Someone should name the cost, not just the mood.",
        "*stirs slowly* Bring it back to the thing we can actually test.",
        "*leans back* That needs one consequence we can see.",
        "*taps the rim once* The answer depends on what we are protecting.",
      ];
  const seed = `${args.conversationId}:${args.speaker.id}:${args.historyLength}:${args.seedExtra ?? ""}:fresh-fallback`;
  const startIndex = Math.floor(stableUnitValue(seed) * options.length) % options.length;
  const avoidKeys = new Set((args.avoidTexts ?? []).map(coffeeReplyRepeatKey).filter(Boolean));
  let fallback = options[startIndex] ?? options[0]!;
  for (let offset = 0; offset < options.length; offset += 1) {
    const candidate = options[(startIndex + offset) % options.length] ?? fallback;
    if (!avoidKeys.has(coffeeReplyRepeatKey(candidate))) {
      fallback = candidate;
      break;
    }
  }
  return clampCoffeeTableReplyText(fallback, args.maxChars);
}

export function coffeeFallbackFocusPhrase(raw: string): string | null {
  const visible = visibleCoffeeSpeechForValueScan(raw)
    .replace(/\b(?:just said|the user says|latest table moment)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = coffeeFallbackFocusTokens(visible).filter(
    (token) =>
      token !== "sigmund" &&
      token !== "freud" &&
      token !== "darth" &&
      token !== "vader"
  );
  if (tokens.length === 0) return null;
  const phrase = tokens.slice(0, 2).join(" and ");
  return phrase.length > 0 ? phrase : null;
}

function coffeeQualityTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(COFFEE_STAGE_ACTION_BLOCK_RE, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 &&
        !COFFEE_LOOP_MOTIF_STOPWORDS.has(token)
    );
}

function coffeeQualityShapeKey(raw: string): string | null {
  const tokens = coffeeQualityTokens(raw).slice(0, 5);
  if (tokens.length < 2) return null;
  return tokens.join(" ");
}

function coffeeConversationPhase(args: {
  assistantTurnCount: number;
  groupSize: number;
  sessionRemainingMs?: number | null;
}): CoffeeConversationPhase {
  if (
    typeof args.sessionRemainingMs === "number" &&
    Number.isFinite(args.sessionRemainingMs) &&
    args.sessionRemainingMs <= 60_000
  ) {
    return "final-minute";
  }
  if (args.assistantTurnCount < Math.max(4, args.groupSize)) return "opening";
  return "middle";
}

function coffeeQualityGuardrailStrength(args: {
  groupSize: number;
  settings: CoffeeSessionSettings;
}): CoffeeConversationQualityState["guardrailStrength"] {
  const energetic =
    args.settings.tableEnergy === "afterparty" ||
    args.settings.tableEnergy === "theatre" ||
    args.settings.crossTalk === "pileup" ||
    args.settings.crossTalk === "chatty";
  if (args.groupSize >= 4 && energetic) return "strong";
  if (args.groupSize >= 4 || energetic) return "standard";
  return "light";
}

function detectCoffeeTopicDrift(args: {
  coffeeTopic?: string | null;
  recentAssistantMessages: readonly ChatMessage[];
  activePollContext?: string | null;
}): boolean {
  if (typeof args.activePollContext === "string" && args.activePollContext.trim()) {
    return false;
  }
  const topicTokens = new Set(coffeeQualityTokens(args.coffeeTopic ?? ""));
  if (topicTokens.size < 2) return false;
  if (args.recentAssistantMessages.length < 4) return false;
  const recentTokens = coffeeQualityTokens(
    args.recentAssistantMessages.slice(-3).map((message) => message.content).join(" ")
  );
  if (recentTokens.length < 6) return false;
  let overlap = 0;
  for (const token of topicTokens) {
    if (recentTokens.includes(token)) overlap += 1;
  }
  return overlap === 0;
}

function detectCoffeeRepeatedShape(
  recentAssistantMessages: readonly ChatMessage[]
): boolean {
  const keys = recentAssistantMessages
    .slice(-5)
    .map((message) => coffeeQualityShapeKey(message.content))
    .filter((key): key is string => key !== null);
  if (keys.length < 4) return false;
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 3);
}

function coffeeObjectiveInstruction(objective: CoffeeTurnObjective): string {
  switch (objective) {
    case "challenge":
      return "challenge the strongest claim with one specific contrast or counterexample";
    case "clarify":
      return "clarify the live claim with one precise distinction";
    case "concrete-example":
      return "add one concrete example, object, or consequence";
    case "synthesize":
      return "synthesize two views without flattening their disagreement";
    case "redirect":
      return "redirect in character back to the topic using one table object or concrete detail";
    case "ask-sharper-question":
      return "ask one sharper question that exposes the real disagreement";
    case "close-thread":
      return "land the current thread or leave one strong unresolved question";
  }
}

export function buildCoffeeConversationQualityState(args: {
  group: readonly CoffeeBotProfile[];
  history: readonly ChatMessage[];
  coffeeTopic?: string | null;
  sessionSettings?: CoffeeSessionSettings;
  sessionRemainingMs?: number | null;
  activePollContext?: string | null;
}): CoffeeConversationQualityState {
  const settings = args.sessionSettings ?? normalizeCoffeeSessionSettings(undefined);
  const guardrailStrength = coffeeQualityGuardrailStrength({
    groupSize: args.group.length,
    settings,
  });
  const assistantMessages = args.history.filter((message) => message.role === "assistant");
  const recentAssistantMessages = assistantMessages.slice(-COFFEE_ROUTER_BALANCE_HISTORY_LIMIT);
  const countsByBotId = new Map(args.group.map((bot) => [bot.id, 0]));
  for (const message of recentAssistantMessages) {
    const botId = resolveAssistantSpeakerBotId(message, args.group);
    if (!botId || !countsByBotId.has(botId)) continue;
    countsByBotId.set(botId, (countsByBotId.get(botId) ?? 0) + 1);
  }
  const speakerDistribution = args.group.map((bot) => ({
    botId: bot.id,
    name: bot.name,
    count: countsByBotId.get(bot.id) ?? 0,
  }));
  const maxCount = Math.max(0, ...speakerDistribution.map((entry) => entry.count));
  const quietThreshold = guardrailStrength === "strong" ? 2 : 3;
  const quiet =
    args.group.length >= 3 &&
    recentAssistantMessages.length >= Math.min(5, args.group.length)
      ? speakerDistribution.filter(
          (entry) => entry.count === 0 || maxCount - entry.count >= quietThreshold
        )
      : [];

  const sortedActive = speakerDistribution
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
  const topTwo = sortedActive.slice(0, 2);
  const topTwoCount = topTwo.reduce((sum, entry) => sum + entry.count, 0);
  const dominantDuoDetected =
    args.group.length >= 4 &&
    recentAssistantMessages.length >= 6 &&
    topTwo.length === 2 &&
    quiet.length > 0 &&
    topTwoCount >= recentAssistantMessages.length - 1;

  const latestAssistant = assistantMessages.at(-1) ?? null;
  const lowValueLatestTurnDetected = latestAssistant
    ? coffeeReplyIsLowValueTableLine(latestAssistant.content)
    : false;
  const topicDriftDetected = detectCoffeeTopicDrift({
    coffeeTopic: args.coffeeTopic,
    recentAssistantMessages,
    activePollContext: args.activePollContext,
  });
  const repeatedMetaphorOrJokeShapeDetected = detectCoffeeRepeatedShape(recentAssistantMessages);
  const phase = coffeeConversationPhase({
    assistantTurnCount: assistantMessages.length,
    groupSize: args.group.length,
    sessionRemainingMs: args.sessionRemainingMs,
  });

  let objective: CoffeeTurnObjective;
  if (phase === "final-minute") {
    objective = "close-thread";
  } else if (topicDriftDetected || dominantDuoDetected) {
    objective = "redirect";
  } else if (lowValueLatestTurnDetected) {
    objective = "concrete-example";
  } else if (repeatedMetaphorOrJokeShapeDetected) {
    objective = "challenge";
  } else if (phase === "opening") {
    objective = "concrete-example";
  } else if (quiet.length > 0 && guardrailStrength !== "light") {
    objective = "synthesize";
  } else {
    objective = "clarify";
  }

  return {
    guardrailStrength,
    phase,
    objective,
    recentAssistantTurnCount: recentAssistantMessages.length,
    speakerDistribution,
    quietBotIds: quiet.map((entry) => entry.botId),
    quietBotNames: quiet.map((entry) => entry.name),
    dominantDuoBotIds: dominantDuoDetected ? topTwo.map((entry) => entry.botId) : [],
    dominantDuoBotNames: dominantDuoDetected ? topTwo.map((entry) => entry.name) : [],
    dominantDuoDetected,
    topicDriftDetected,
    repeatedMetaphorOrJokeShapeDetected,
    lowValueLatestTurnDetected,
  };
}

function buildCoffeeConversationQualityAppendix(
  state: CoffeeConversationQualityState,
  mode: "router" | "speaker"
): string[] {
  const lines = [
    "",
    `Conversation quality state: phase=${state.phase}; guardrail=${state.guardrailStrength}; objective=${state.objective}.`,
  ];
  if (state.speakerDistribution.length > 0 && state.recentAssistantTurnCount > 0) {
    lines.push(
      `Recent speaker distribution: ${state.speakerDistribution
        .map((entry) => `${entry.name}=${entry.count}`)
        .join(", ")}.`
    );
  }
  if (state.guardrailStrength === "strong") {
    lines.push(
      "Strong ensemble guidance for 4-5 bot or theatre/chatty sessions: recover quiet relevant bots and break dominant duos, but do not force strict round-robin."
    );
  }
  if (state.quietBotNames.length > 0) {
    lines.push(
      `Quiet relevant candidates: ${state.quietBotNames.join(", ")}. Prefer one when they can move the thread.`
    );
  }
  if (state.dominantDuoDetected) {
    lines.push(
      `Dominant duo detected: ${state.dominantDuoBotNames.join(" + ")}. Break the loop unless the duel is clearly still productive.`
    );
  }
  if (state.topicDriftDetected) {
    lines.push("Topic drift detected: steer back to the shared question with an in-world detail.");
  }
  if (state.repeatedMetaphorOrJokeShapeDetected) {
    lines.push("Repeated metaphor/joke shape detected: change the object, stakes, or social motion.");
  }
  if (state.lowValueLatestTurnDetected) {
    lines.push("Low-value latest turn detected: the next move must add evidence, contrast, or a concrete example.");
  }

  const instruction = coffeeObjectiveInstruction(state.objective);
  if (mode === "router") {
    lines.push(
      `Router turn objective: ${state.objective} — choose the next speaker who can ${instruction}.`,
      "Write the directive as one concrete in-character move, e.g. \"redirect back to the truth/art question using one table object.\"",
      "Never expose moderator/table-management language in the directive."
    );
  } else {
    lines.push(
      `Speaker turn objective: ${state.objective} — ${instruction}.`,
      "Follow the objective without naming it or mentioning moderation.",
      "Agreement must add a reason; disagreement must add a specific contrast; redirection must stay in character.",
      "Do not use bare filler such as \"Fair point\", \"True enough\", \"Noted\", or \"That tracks\" unless the same line adds a concrete claim."
    );
    if (state.phase === "opening") {
      lines.push("Opening phase: establish a position or angle; do not summarize a debate that has not happened.");
    } else if (state.phase === "middle") {
      lines.push("Middle phase: deepen the conflict, sharpen the example, or connect two live claims.");
    } else {
      lines.push("Final-minute phase: land the current thread or leave one strong unresolved question; do not start a new tangent.");
    }
  }

  return lines;
}

function buildCoffeeSpeakerBalanceAppendix(args: {
  group: readonly CoffeeBotProfile[];
  history: readonly ChatMessage[];
}): string[] {
  if (args.group.length < 3) return [];
  const recentAssistantMessages = args.history
    .filter((message) => message.role === "assistant")
    .slice(-COFFEE_ROUTER_BALANCE_HISTORY_LIMIT);
  if (recentAssistantMessages.length < Math.min(5, args.group.length)) return [];

  const countsByBotId = new Map(args.group.map((bot) => [bot.id, 0]));
  for (const message of recentAssistantMessages) {
    const botId = resolveAssistantSpeakerBotId(message, args.group);
    if (!botId || !countsByBotId.has(botId)) continue;
    countsByBotId.set(botId, (countsByBotId.get(botId) ?? 0) + 1);
  }
  const counts = args.group.map((bot) => ({
    bot,
    count: countsByBotId.get(bot.id) ?? 0,
  }));
  const maxCount = Math.max(...counts.map((entry) => entry.count));
  const quiet = counts.filter((entry) => entry.count === 0 || maxCount - entry.count >= 3);
  if (quiet.length === 0) return [];
  const summary = counts
    .map((entry) => `${entry.bot.name}=${entry.count}`)
    .join(", ");
  const quietNames = quiet.map((entry) => entry.bot.name).join(", ");
  return [
    "",
    `Speaker balance over the last ${recentAssistantMessages.length} assistant turns: ${summary}.`,
    `Quiet-but-seated bots: ${quietNames}. Balanced organic rule: prefer one of these quieter bots when they can add a relevant, in-character angle; do not force them if the latest exchange clearly belongs to another bot.`,
    "If the same two bots have been trading similar lines, pick a quieter bot who can move the topic forward.",
  ];
}

export function pickCoffeeSpeakerBalanceOverride(args: {
  group: readonly CoffeeBotProfile[];
  history: readonly ChatMessage[];
  pickedBotId: string;
  sessionSettings?: CoffeeSessionSettings;
  coffeeTopic?: string | null;
  sessionRemainingMs?: number | null;
  activePollContext?: string | null;
}): CoffeeBotProfile | null {
  const state = buildCoffeeConversationQualityState({
    group: args.group,
    history: args.history,
    coffeeTopic: args.coffeeTopic,
    sessionSettings: args.sessionSettings,
    sessionRemainingMs: args.sessionRemainingMs,
    activePollContext: args.activePollContext,
  });
  if (state.guardrailStrength !== "strong") return null;
  if (state.quietBotIds.length === 0) return null;
  if (state.quietBotIds.includes(args.pickedBotId)) return null;
  const picked = state.speakerDistribution.find((entry) => entry.botId === args.pickedBotId);
  if (!picked) return null;
  const quietEntries = state.speakerDistribution
    .filter((entry) => state.quietBotIds.includes(entry.botId))
    .sort((a, b) => a.count - b.count);
  const quiet = quietEntries[0];
  if (!quiet) return null;
  const enoughPressure =
    state.dominantDuoDetected ||
    picked.count >= quiet.count + 2 ||
    picked.count >= 3;
  if (!enoughPressure) return null;
  return args.group.find((bot) => bot.id === quiet.botId) ?? null;
}

function sanitizeLoadedCoffeeAssistantContent(
  row: Pick<MessageRow, "id" | "content" | "bot_id" | "bot_name">,
  conversationId: string,
  historyLength: number
): string {
  const speakerName = row.bot_name ?? "Bot";
  const visible = sanitizeCoffeeTableReply(row.content, speakerName);
  if (visible) return visible;
  return buildCoffeeEmergencyFallbackReply({
    tableFocus: row.content,
    speaker: {
      id: row.bot_id ?? speakerName,
      name: speakerName,
    },
    conversationId,
    historyLength,
    seedExtra: row.id,
    maxChars: COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS,
  });
}

/**
 * Collapse whitespace and trim Coffee replies so the live table stays a tiny
 * card; prefer ending on sentence punctuation when clipping is required.
 */
/**
 * Normalizes a Coffee table reply for storage/display.
 *
 * Originally this also enforced a hard visible-character cap by truncating
 * with an ellipsis when the bot wrote past it. That hard truncation made
 * occasional longer thoughts look mid-sentence "cut off" on the table —
 * worse UX than letting the message scroll. The cap is now a *soft target*
 * only: it stays in the speaker prompt so bots aim for one short line, but
 * the server no longer chops their reply. The table center scrolls
 * vertically if a reply runs long.
 *
 * The function still collapses internal whitespace into single spaces and
 * trims, so multi-line LLM output renders as a single tabletop line.
 *
 * `maxChars` is retained in the signature for backwards compatibility with
 * call sites that still pass a target value, but is intentionally unused.
 */
export function clampCoffeeTableReplyText(
  raw: string,
  _maxChars: number = COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS
): string {
  return raw.replace(/\s+/g, " ").trim();
}

function formatCoffeeTranscriptLine(message: ChatMessage): string {
  if (message.role === "assistant") {
    const label = message.botName?.trim() || "Bot";
    return `${label}: ${stripCoffeeSpeakerPrefix(message.content, label)}`;
  }
  if (message.role === "user") {
    return `User: ${message.content.trim()}`;
  }
  return `System: ${message.content.trim()}`;
}

function normalizeCoffeeMeetingSummary(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const withoutFence = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!withoutFence) return null;
  if (coffeeTextMentionsInternalAccountMetadata(withoutFence)) return null;
  if (coffeeReplyLooksLikePromptLeak(withoutFence)) return null;
  if (coffeeReplyBreaksCharacterImmersion(withoutFence)) return null;
  if (withoutFence.length < 24) return null;
  if (withoutFence.length <= COFFEE_MEETING_SUMMARY_MAX_CHARS) return withoutFence;
  return `${withoutFence.slice(0, COFFEE_MEETING_SUMMARY_MAX_CHARS - 3).trimEnd()}...`;
}

export function normalizeCoffeeSessionSynopsis(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const withoutFence = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!withoutFence) return null;
  const withoutHeading = withoutFence
    .replace(/^#{1,6}\s*session synopsis\s*[:\-]?\s*/i, "")
    .replace(/^\*\*session synopsis\*\*\s*[:\-]?\s*/i, "")
    .replace(/^session synopsis\s*[:\-]\s*/i, "")
    .trim();
  if (coffeeTextMentionsInternalAccountMetadata(withoutHeading)) return null;
  if (coffeeReplyLooksLikePromptLeak(withoutHeading)) return null;
  if (withoutHeading.length < 40) return null;
  const prefixed = `${COFFEE_SESSION_SYNOPSIS_PREFIX} ${withoutHeading}`;
  if (prefixed.length <= COFFEE_SESSION_SYNOPSIS_MAX_CHARS) return prefixed;
  return `${prefixed.slice(0, COFFEE_SESSION_SYNOPSIS_MAX_CHARS - 3).trimEnd()}...`;
}

function coffeeSessionAlreadyHasSynopsis(history: readonly ChatMessage[]): boolean {
  return history.some(
    (message) =>
      message.role === "system" &&
      message.content.trim().startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX) &&
      !coffeeTextMentionsInternalAccountMetadata(message.content)
  );
}

export function coffeeTextMentionsInternalAccountMetadata(text: string): boolean {
  return /\b(?:your\s+)?account\s+(?:display\s+name\s+is|has\s+not\s+provided\s+a\s+display\s+name\s+yet)\b/i.test(
    text
  );
}

export function coffeeMeetingSummarySourceMessages(
  history: readonly ChatMessage[]
): ChatMessage[] {
  return history.filter((message) => {
    if (message.role === "system") return false;
    if (message.role !== "assistant") return true;
    return coffeePollLineIsScorable(message);
  });
}

export function shouldRefreshCoffeeMeetingSummary(args: {
  assistantMessageCount: number;
  lastSummarizedAssistantCount: number | null;
  refreshEvery?: number;
  minMessages?: number;
}): boolean {
  const refreshEvery =
    args.refreshEvery ?? COFFEE_MEETING_SUMMARY_REFRESH_EVERY_ASSISTANT_MESSAGES;
  const minMessages = args.minMessages ?? COFFEE_MEETING_SUMMARY_MIN_ASSISTANT_MESSAGES;
  if (args.assistantMessageCount < minMessages) return false;
  const lastCount = Math.max(0, args.lastSummarizedAssistantCount ?? 0);
  return args.assistantMessageCount - lastCount >= refreshEvery;
}

function buildCoffeeMeetingSummaryMessages(args: {
  group: readonly Pick<CoffeeBotProfile, "name">[];
  previousSummary: string | null;
  transcriptLines: readonly string[];
  activePollContext: string | null;
  attendanceContext?: CoffeeAttendanceContext | null;
}): ProviderMessage[] {
  const participantNames = args.group.map((bot) => bot.name).join(", ");
  const previousSummary = args.previousSummary?.trim() ?? "";
  const pollLine = args.activePollContext?.trim() ?? "";
  const attendanceLine = formatCoffeeAttendancePromptSummary(args.attendanceContext);
  return [
    {
      role: "system",
      content:
        "Summarize this Coffee table for the next bot turn. Keep it concrete and social, not meta.",
    },
    {
      role: "user",
      content: [
        `Participants: ${participantNames}`,
        previousSummary ? `Previous meeting summary: ${previousSummary}` : "Previous meeting summary: none yet.",
        attendanceLine ?? "",
        pollLine ? `Active poll context: ${pollLine}` : "",
        "Latest transcript slice:",
        ...args.transcriptLines,
        "",
        "Write one compact paragraph (max 420 chars) capturing:",
        "- the current point of disagreement or momentum",
        "- what the next bot should react to immediately",
        "- one unresolved thread worth advancing",
        "- attendance only if the visible table has made it socially relevant",
        "Do not mention prompts, instructions, token limits, or hidden rules.",
      ]
        .filter(Boolean)
      .join("\n"),
    },
  ];
}

type CoffeeSynopsisMemoryRow = {
  id: string;
  bot_id: string | null;
  ciphertext: string;
  iv: string;
  tag: string;
  source: string;
  category: string;
  tier: string;
  created_at: string;
  bot_name: string | null;
};

export function loadCoffeeSessionMemoryChangeLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  userKey?: Buffer
): string[] {
  if (!userKey) return [];
  const rows = db
    .prepare(
      `SELECT m.id, m.bot_id, m.ciphertext, m.iv, m.tag, m.source, m.category, m.tier, m.created_at,
              b.name AS bot_name
         FROM memories m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.user_id = ? AND m.conversation_id = ?
        ORDER BY m.created_at ASC
        LIMIT 24`
    )
    .all(userId, conversationId) as CoffeeSynopsisMemoryRow[];
  const lines: string[] = [];
  for (const row of rows) {
    if (row.source === ABOUT_YOU_MEMORY_SOURCE) continue;
    try {
      const payload = decryptJson(
        { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
        userKey
      ) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.replace(/\s+/g, " ").trim() : "";
      if (!text) continue;
      if (coffeeTextMentionsInternalAccountMetadata(text)) continue;
      const scope = row.bot_name ? `${row.bot_name}` : "Global";
      lines.push(`- ${scope} ${row.source}/${row.tier}: ${text}`);
    } catch {
      // Ignore corrupt or unavailable memory rows; synopsis generation should proceed.
    }
  }
  return lines;
}

function buildCoffeeSessionSynopsisMessages(args: {
  group: readonly Pick<CoffeeBotProfile, "name">[];
  topic: string | null;
  transcriptLines: readonly string[];
  pollLines: readonly string[];
  teamLines: readonly string[];
  memoryLines: readonly string[];
  attendanceContext?: CoffeeAttendanceContext | null;
}): ProviderMessage[] {
  const participants = args.group.map((bot) => bot.name).join(", ");
  const topic = args.topic?.trim() || "unspecified";
  const attendanceLine = formatCoffeeAttendancePromptSummary(args.attendanceContext);
  const pollLines =
    args.pollLines.length > 0
      ? args.pollLines
      : ["No Coffee polls were recorded for this session."];
  const teamLines =
    args.teamLines.length > 0
      ? args.teamLines
      : ["No Coffee Teams mode was recorded for this session."];
  const memoryLines =
    args.memoryLines.length > 0
      ? args.memoryLines
      : ["- No explicit saved/changed memories were recorded for this Coffee session."];
  return [
    {
      role: "system",
      content:
        "Write a concise end-of-session Coffee table synopsis for the user. Be concrete, observant, and natural. Do not mention prompts, hidden rules, account metadata, display names, or system-noted facts.",
    },
    {
      role: "user",
      content: [
        `Participants: ${participants}`,
        `Topic: ${topic}`,
        attendanceLine ?? "",
        "Transcript:",
        ...args.transcriptLines,
        "",
        "Poll results recorded during this session:",
        ...pollLines.map((line) => `- ${line}`),
        "",
        "Team dynamics recorded during this session:",
        ...teamLines.map((line) => `- ${line}`),
        "",
        "Memory changes recorded during this session:",
        ...memoryLines,
        "",
        "Write 2-4 short sentences. Cover how the conversation went, highlights or lows, include poll and team results if any exist, include the memory changes if any exist, and mention attendance only if the transcript made it socially meaningful.",
      ].join("\n"),
    },
  ];
}

export function persistCoffeeMeetingSummaryIfNewer(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  summary: string;
  assistantMessageCount: number;
  nowIso: string;
}): boolean {
  const result = args.db
    .prepare(
      `UPDATE conversations
          SET coffee_meeting_summary = ?,
              coffee_meeting_summary_message_count = ?,
              coffee_meeting_summary_updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (coffee_meeting_summary_message_count IS NULL OR coffee_meeting_summary_message_count < ?)`
    )
    .run(
      args.summary,
      args.assistantMessageCount,
      args.nowIso,
      args.conversationId,
      args.userId,
      args.assistantMessageCount
    );
  return Number(result.changes ?? 0) > 0;
}

async function refreshCoffeeMeetingSummary(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  group: readonly CoffeeBotProfile[];
  history: readonly ChatMessage[];
  previousSummary: string | null;
  previousSummaryAssistantCount: number | null;
  activePollContext: string | null;
  attendanceContext?: CoffeeAttendanceContext | null;
  prismDefaultLlmModel?: string | null;
  secondaryOllamaHost?: string | null;
  experimentalDualOllamaEnabled?: boolean;
  summaryProvider?: LlmProvider;
}): Promise<void> {
  const sourceMessages = coffeeMeetingSummarySourceMessages(args.history);
  const assistantMessageCount = sourceMessages.filter((message) => message.role === "assistant").length;
  if (
    !shouldRefreshCoffeeMeetingSummary({
      assistantMessageCount,
      lastSummarizedAssistantCount: args.previousSummaryAssistantCount,
    })
  ) {
    return;
  }
  const transcriptLines = sourceMessages
    .slice(-COFFEE_MEETING_SUMMARY_MAX_TRANSCRIPT_LINES)
    .map(formatCoffeeTranscriptLine);
  if (transcriptLines.length === 0) return;
  const provider =
    args.summaryProvider ??
    getAuxiliaryProvider(args.prismDefaultLlmModel ?? undefined, {
      secondaryOllamaHost: args.secondaryOllamaHost,
      experimentalDualOllama: args.experimentalDualOllamaEnabled === true,
    });
  const rawSummary = await provider.generateResponse(
    buildCoffeeMeetingSummaryMessages({
      group: args.group,
      previousSummary: args.previousSummary,
      transcriptLines,
      activePollContext: args.activePollContext,
      attendanceContext: args.attendanceContext,
    }),
    {
      maxTokens: COFFEE_MEETING_SUMMARY_MAX_TOKENS,
      temperature: 0.15,
    }
  );
  if (typeof rawSummary !== "string") return;
  const normalized = normalizeCoffeeMeetingSummary(rawSummary);
  if (!normalized) return;
  persistCoffeeMeetingSummaryIfNewer({
    db: args.db,
    userId: args.userId,
    conversationId: args.conversationId,
    summary: normalized,
    assistantMessageCount,
    nowIso: new Date().toISOString(),
  });
}

export async function kickoffCoffeeMeetingSummaryRefresh(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  group: readonly CoffeeBotProfile[];
  history: readonly ChatMessage[];
  previousSummary: string | null;
  previousSummaryAssistantCount: number | null;
  activePollContext: string | null;
  attendanceContext?: CoffeeAttendanceContext | null;
  prismDefaultLlmModel?: string | null;
  secondaryOllamaHost?: string | null;
  experimentalDualOllamaEnabled?: boolean;
  summaryProvider?: LlmProvider;
}): Promise<void> {
  try {
    await refreshCoffeeMeetingSummary(args);
  } catch {
    // Summary refresh is best-effort and must never block Coffee turns.
  }
}

/** Settings forwarded from the HTTP route. */
export interface CoffeeTurnSettings {
  preferredProvider: ProviderName;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  secondaryOllamaHost?: string | null;
  experimentalDualOllamaEnabled?: boolean;
  userDisplayName?: string;
  userKey?: Buffer;
  /** Matches account Settings — drives auxiliary LLM for the Coffee router. */
  prismDefaultLlmModel?: string | null;
  /**
   * Client-provided timer snapshot for the active Coffee session. When it is
   * near zero, prompts shift from "continue the table" to "land the plane".
   */
  sessionRemainingMs?: number | null;
  /**
   * When set, every Coffee speaker uses this model id for the effective provider,
   * ignoring per-bot local/online checkpoint fields (same idea as Sandbox
   * `modelOverride`).
   */
  sessionSpeakerModel?: string | null;
  reasoningEffort?: ReasoningEffort;
  /** Optional per-user image model/workflow prefs (same shape as chat mode). */
  assistantImageUserPrefs?: AssistantSentImageUserPrefs;
}

interface CoffeeAuxiliaryOptions {
  prismDefaultLlmModel?: string | null;
  secondaryOllamaHost?: string | null;
  experimentalDualOllamaEnabled?: boolean;
}

function coffeeAuxiliaryProvider(options?: CoffeeAuxiliaryOptions | null): LlmProvider {
  return getAuxiliaryProvider(options?.prismDefaultLlmModel ?? undefined, {
    secondaryOllamaHost: options?.secondaryOllamaHost,
    experimentalDualOllama: options?.experimentalDualOllamaEnabled === true,
  });
}

export interface CoffeeTurnInput {
  conversationId?: string;
  groupBotIds?: Array<string | null>;
  message: string;
  playerInterruption?: CoffeePlayerInterruptionInput;
  directedSpeakerBotId?: string;
}

export interface CoffeeSessionCreateInput {
  groupBotIds?: Array<string | null>;
  coffeeSettings?: unknown;
  coffeeGroupId?: string | null;
  coffeeAbsentBotIds?: string[];
  durationMinutes?: unknown;
  presetId?: string | null;
  initialPoll?: CoffeePollCreateInput;
  initialTeams?: CoffeeTeamCreateInput;
  starterTopics?: string[];
}

export interface CoffeeGroupCreateInput {
  name?: unknown;
  groupBotIds?: Array<string | null>;
  coffeeSettings?: unknown;
  modelChoiceByProvider?: unknown;
  starterTopicsByBotId?: unknown;
}

export interface CoffeeGroupUpdateInput {
  name?: unknown;
  groupBotIds?: Array<string | null>;
  coffeeSettings?: unknown;
  presetMode?: unknown;
  topicSelectionMode?: unknown;
  modelChoiceByProvider?: unknown;
  starterTopicsByBotId?: unknown;
}

export interface CoffeeGroupSessionCreateInput {
  coffeeSettings?: unknown;
  durationMinutes?: unknown;
  presetId?: unknown;
  excludedBotIds?: unknown;
  initialPoll?: CoffeePollCreateInput;
  initialTeams?: CoffeeTeamCreateInput;
}

export interface CoffeePollCreateInput {
  question?: unknown;
  options?: unknown;
}

export interface CoffeeTeamCreateInput {
  left?: { name?: unknown; description?: unknown };
  right?: { name?: unknown; description?: unknown };
  assignments?: unknown;
  playerTeamId?: unknown;
}

export interface CoffeePresetCreateInput {
  name?: unknown;
  coffeeSettings?: unknown;
}

export interface CoffeePresetUpdateInput {
  name?: unknown;
  coffeeSettings?: unknown;
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function assistantImagePrefsForCoffeeTurn(settings: CoffeeTurnSettings): AssistantSentImageUserPrefs {
  return settings.assistantImageUserPrefs ?? DEFAULT_ASSISTANT_IMAGE_USER_PREFS;
}

async function maybeQueueCoffeeImageJob(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  userMessage: string;
  settings: CoffeeTurnSettings;
}): Promise<CoffeeTurnResponse["pendingImageJob"] | undefined> {
  if (!userMessageSuggestsInChatImageRequest(args.userMessage)) return undefined;
  const captionPrompt = autoBackfillSendGeneratedImagePrompt({
    isStarterPrompt: false,
    userMessage: args.userMessage,
    parsedToolPrompt: undefined,
  });
  if (!captionPrompt) return undefined;
  const acq = await tryAcquireImageSlot({
    userId: args.userId,
    conversationId: args.conversationId,
    botId: null,
    mode: "chat",
    incognito: false,
    captionPrompt,
    userMessage: args.userMessage,
    source: "chat_tool",
  });
  if (!acq.ok) return undefined;
  startChatImageBackgroundJob({
    db: args.db,
    job: acq.job,
    preferredProvider:
      args.settings.preferredProvider === "local" ? "local" : "openai",
    openAiApiKey: args.settings.openAiApiKey,
    prefs: assistantImagePrefsForCoffeeTurn(args.settings),
    prismDefaultLlmModel: args.settings.prismDefaultLlmModel,
    chatModelUsed: COFFEE_IMAGE_MODEL_TAG,
    chatProviderName: args.settings.preferredProvider,
    botName: "Coffee Table",
  });
  return {
    jobId: acq.job.id,
    conversationId: args.conversationId,
  };
}

function applyConcisePreImageLeadToCoffeeTurn(args: {
  db: DatabaseSync;
  userId: string;
  turn: CoffeeTurnResponse;
}): CoffeeTurnResponse {
  const messages = args.turn.conversation.messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    const concise = compactPreImageLeadMessage(message.content);
    if (concise === message.content) return args.turn;
    args.db
      .prepare("UPDATE messages SET content = ? WHERE id = ? AND user_id = ?")
      .run(concise, message.id, args.userId);
    const nextMessages = messages.map((row) =>
      row.id === message.id ? { ...row, content: concise } : row
    );
    return {
      ...args.turn,
      conversation: {
        ...args.turn.conversation,
        messages: nextMessages,
      },
    };
  }
  return args.turn;
}

function stripCoffeeSnippetDisplayArtifacts(raw: string): string {
  return raw
    .replace(/\[([^\]\n]+)\]\(prism-bot:\/\/[^)\n]+\)/gi, "$1")
    .replace(/\*+([^*\n]+?)\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function interruptedSnippetFromTokenCount(fullText: string, visibleTokenCount: number): string {
  const visibleText = stripCoffeeSnippetDisplayArtifacts(fullText);
  const tokens = visibleText.match(/\S+\s*/g) ?? [];
  const clampedVisibleTokenCount = Math.max(
    COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS,
    Math.min(visibleTokenCount, Math.max(1, tokens.length))
  );
  const visible = tokens.slice(0, clampedVisibleTokenCount).join("").trimEnd();
  if (visible.length === 0) return "…";
  const lastWordMatch = visible.match(/(\S+)$/);
  if (!lastWordMatch) return `${visible}—`;
  const fullWord = lastWordMatch[1];
  if (fullWord.length < 4) return `${visible}—`;
  const cutoffLength = Math.max(2, Math.floor(fullWord.length * 0.6));
  const prefix = visible.slice(0, visible.length - fullWord.length);
  return `${prefix}${fullWord.slice(0, cutoffLength)}—`;
}

function countRevealTokens(text: string): number {
  return Math.max(COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS, (text.match(/\S+\s*/g) ?? []).length);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function interruptionBellCurveWeight(progress: number): number {
  const clampedProgress = clampUnit(progress);
  const distanceFromCenter = clampedProgress - 0.5;
  const exponent =
    -(distanceFromCenter * distanceFromCenter) /
    (2 * COFFEE_INTERRUPTION_BELL_CURVE_SIGMA * COFFEE_INTERRUPTION_BELL_CURVE_SIGMA);
  const gaussian = Math.exp(exponent);
  return (
    COFFEE_INTERRUPTION_BELL_CURVE_EDGE_WEIGHT +
    (1 - COFFEE_INTERRUPTION_BELL_CURVE_EDGE_WEIGHT) * gaussian
  );
}

function interruptionProgressFromTokenCounts(visibleTokenCount: number, totalTokenCount: number): number {
  const total = Math.max(COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS, Math.floor(totalTokenCount));
  const visible = Math.max(
    COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS,
    Math.min(Math.floor(visibleTokenCount), total)
  );
  return clampUnit(visible / total);
}

function quantizeDelta(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeCoffeeSessionDurationMinutes(raw: unknown): CoffeeSessionDurationMinutes {
  if (raw === undefined || raw === null) return DEFAULT_COFFEE_SESSION_DURATION_MINUTES;
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim().length > 0
        ? Number(raw.trim())
        : Number.NaN;
  if (
    Number.isInteger(value) &&
    value >= COFFEE_SESSION_DURATION_MINUTES_MIN &&
    value <= COFFEE_SESSION_DURATION_MINUTES_MAX
  ) {
    return value;
  }
  throw new Error(
    `Coffee Sessions must be whole minutes from ${COFFEE_SESSION_DURATION_MINUTES_MIN} to ${COFFEE_SESSION_DURATION_MINUTES_MAX}.`
  );
}

function normalizeCoffeePresetMode(raw: unknown): CoffeePresetMode {
  return raw === "auto" ? "auto" : "manual";
}

function normalizeCoffeeTopicSelectionMode(raw: unknown): CoffeeTopicSelectionMode {
  return raw === "auto" ? "auto" : "manual";
}

/**
 * Normalize a free-form `model_choice` value into a sanitized
 * `{ local?, openai?, anthropic? }` map. Drops empty/`auto` strings so picker hydration on
 * the client treats those as "Auto".
 */
export function normalizeCoffeeGroupModelChoice(raw: unknown): CoffeeGroupModelChoice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: CoffeeGroupModelChoice = {};
  for (const provider of ["local", "openai", "anthropic"] as const) {
    const value = source[provider];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.toLowerCase() === "auto") continue;
    out[provider] = trimmed;
  }
  return out;
}

function parseStoredCoffeeGroupModelChoice(raw: string | null | undefined): CoffeeGroupModelChoice {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return normalizeCoffeeGroupModelChoice(JSON.parse(raw));
  } catch {
    return {};
  }
}

function normalizeCoffeeGroupStarterTopicsByBotId(
  raw: unknown,
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[]
): CoffeeGroupStarterTopicsByBotId {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const botIds = new Set(group.map((bot) => bot.id));
  const out: CoffeeGroupStarterTopicsByBotId = {};
  for (const bot of group) {
    const rawTopics = source[bot.id];
    if (!Array.isArray(rawTopics)) continue;
    const topics = selectCoffeeStarterTopicLabels(
      rawTopics
        .map((item) => coffeeStarterTopicFromPayloadItem(item))
        .filter((item): item is CoffeeStarterTopicCandidate => item !== null),
      group,
      COFFEE_GROUP_STARTER_TOPICS_PER_BOT
    );
    if (topics.length > 0 && botIds.has(bot.id)) {
      out[bot.id] = topics.slice(0, COFFEE_GROUP_STARTER_TOPICS_PER_BOT);
    }
  }
  return out;
}

function parseStoredCoffeeGroupStarterTopics(
  raw: string | null | undefined,
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[]
): CoffeeGroupStarterTopicsByBotId {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return normalizeCoffeeGroupStarterTopicsByBotId(JSON.parse(raw), group);
  } catch {
    return {};
  }
}

function applyInterruptionSocialConsequences(args: {
  previousByBotId: Record<string, CoffeeBotSocialSnapshot>;
  consequences: readonly CoffeeInterruptionSocialDelta[];
}): Record<string, CoffeeBotSocialSnapshot> {
  const next: Record<string, CoffeeBotSocialSnapshot> = {};
  for (const [botId, snapshot] of Object.entries(args.previousByBotId)) {
    next[botId] = { ...snapshot };
  }
  for (const consequence of args.consequences) {
    const previous = next[consequence.botId];
    if (!previous) continue;
    next[consequence.botId] = sanitizeCoffeeSocialSnapshot({
      ...previous,
      disposition: previous.disposition + consequence.dispositionDelta,
      valuesFriction: previous.valuesFriction + consequence.valuesFrictionDelta,
    });
  }
  return next;
}

export function computePlayerInterruptionConsequences(args: {
  interruptedBotId: string;
  visibleTokenCount: number;
  totalTokenCount?: number;
  group: readonly CoffeeBotProfile[];
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
}): CoffeeInterruptionSocialDelta[] {
  const interruptedSocial = args.socialByBotId[args.interruptedBotId] ?? DEFAULT_COFFEE_SOCIAL;
  const normalizedVisibleTokens = Math.max(
    COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS,
    Math.min(COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP, Math.floor(args.visibleTokenCount))
  );
  const normalizedTotalTokens = Math.max(
    normalizedVisibleTokens,
    Math.min(
      COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP,
      Math.floor(args.totalTokenCount ?? COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP)
    )
  );
  const interruptionProgress = interruptionProgressFromTokenCounts(
    normalizedVisibleTokens,
    normalizedTotalTokens
  );
  const severity = interruptionBellCurveWeight(interruptionProgress);
  const interruptedDispositionDelta =
    COFFEE_PLAYER_INTERRUPT_BASE_DISPOSITION_DELTA * severity -
    (1 - interruptedSocial.restraint) * 0.035 * severity;
  const interruptedFrictionDelta =
    COFFEE_PLAYER_INTERRUPT_BASE_FRICTION_DELTA * severity +
    (1 - interruptedSocial.restraint) * 0.035 * severity;

  const consequences: CoffeeInterruptionSocialDelta[] = [
    {
      botId: args.interruptedBotId,
      dispositionDelta: quantizeDelta(interruptedDispositionDelta),
      valuesFrictionDelta: quantizeDelta(interruptedFrictionDelta),
    },
  ];

  for (const bot of args.group) {
    if (bot.id === args.interruptedBotId) continue;
    const social = args.socialByBotId[bot.id] ?? DEFAULT_COFFEE_SOCIAL;
    const annoyanceWeight = 0.5 + social.valuesFriction * 0.5;
    consequences.push({
      botId: bot.id,
      dispositionDelta: quantizeDelta(-0.004 * annoyanceWeight * severity),
      valuesFrictionDelta: quantizeDelta(
        COFFEE_PLAYER_INTERRUPT_THIRD_PARTY_FRICTION_DELTA * annoyanceWeight * severity
      ),
    });
  }

  return consequences;
}

function buildPlayerInterruptionEvent(args: {
  interruptionInput: CoffeePlayerInterruptionInput | undefined;
  history: readonly ChatMessage[];
  group: readonly CoffeeBotProfile[];
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
}): CoffeeInterruptionEvent | undefined {
  const interruption = args.interruptionInput;
  if (!interruption) return undefined;
  const interruptedMessage = args.history.find(
    (message) =>
      message.id === interruption.interruptedMessageId &&
      message.role === "assistant"
  );
  if (!interruptedMessage) return undefined;
  const interruptedBotId = interruption.interruptedBotId?.trim();
  if (!interruptedBotId || !args.group.some((bot) => bot.id === interruptedBotId)) {
    return undefined;
  }
  const visibleTokenCount = Math.max(
    COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS,
    Number.isFinite(interruption.visibleTokenCount)
      ? Math.floor(interruption.visibleTokenCount)
      : COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS
  );
  const consequences = computePlayerInterruptionConsequences({
    interruptedBotId,
    visibleTokenCount,
    totalTokenCount: countRevealTokens(interruptedMessage.content),
    group: args.group,
    socialByBotId: args.socialByBotId,
  });
  return {
    kind: "playerInterruptsBot",
    interruptedBotId,
    interruptedMessageId: interruptedMessage.id,
    visibleTokenCount,
    interruptedSnippet: interruptedSnippetFromTokenCount(interruptedMessage.content, visibleTokenCount),
    socialConsequences: consequences,
  };
}

export function maybeBuildBotInterruptionEvent(args: {
  turnKind: CoffeeTurnKind;
  userIsComposing: boolean;
  speaker: CoffeeBotProfile;
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  group: readonly CoffeeBotProfile[];
  conversationId: string;
  historyLength: number;
  sessionSettings?: CoffeeSessionSettings;
}): CoffeeInterruptionEvent | undefined {
  if (args.turnKind !== "autonomous" || !args.userIsComposing) return undefined;
  const speakerSocial = args.socialByBotId[args.speaker.id] ?? DEFAULT_COFFEE_SOCIAL;
  const sessionSettings = args.sessionSettings ?? normalizeCoffeeSessionSettings(undefined);
  const pileupMode =
    sessionSettings.crossTalk === "pileup" || sessionSettings.tableEnergy === "afterparty";
  const sessionChanceBias =
    sessionSettings.crossTalk === "pileup"
      ? 0.18
      : sessionSettings.tableEnergy === "afterparty"
        ? 0.1
        : sessionSettings.crossTalk === "chatty"
          ? 0.02
          : 0;
  const chance = Math.min(
    pileupMode ? COFFEE_BOT_INTERRUPT_PILEUP_MAX_CHANCE : COFFEE_BOT_INTERRUPT_MAX_CHANCE,
    COFFEE_BOT_INTERRUPT_BASE_CHANCE +
      sessionChanceBias +
      speakerSocial.valuesFriction * 0.06 +
      (1 - speakerSocial.restraint) * 0.05 +
      speakerSocial.engagement * 0.03
  );
  const roll = stableUnitValue(
    `${args.conversationId}:${args.speaker.id}:${args.historyLength}:${speakerSocial.disposition.toFixed(2)}`
  );
  if (roll > chance) return undefined;
  const interruptionProgress = stableUnitValue(
    `${args.conversationId}:${args.speaker.id}:${args.historyLength}:interrupt-progress`
  );
  const severity = interruptionBellCurveWeight(interruptionProgress);

  const consequences: CoffeeInterruptionSocialDelta[] = [
    {
      botId: args.speaker.id,
      dispositionDelta: quantizeDelta(-0.01 * severity),
      valuesFrictionDelta: quantizeDelta(0.018 * severity),
    },
  ];
  for (const bot of args.group) {
    if (bot.id === args.speaker.id) continue;
    consequences.push({
      botId: bot.id,
      dispositionDelta: quantizeDelta(-0.003 * severity),
      valuesFrictionDelta: quantizeDelta(0.008 * severity),
    });
  }

  return {
    kind: "botInterruptsPlayer",
    interruptedBotId: args.speaker.id,
    interrupterBotId: args.speaker.id,
    socialConsequences: consequences,
  };
}

/**
 * Validate and normalize an incoming `groupBotIds` payload.
 *
 * - Trims, dedupes, and length-checks (min 2, max 5).
 * - Throws a user-readable error rather than silently truncating, since
 *   the picker UI on the client should surface the same constraint.
 */
export function normalizeCoffeeGroupBotIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Coffee groups need ${COFFEE_GROUP_MIN_SIZE}-${COFFEE_GROUP_MAX_SIZE} bots.`
    );
  }
  const trimmed: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    trimmed.push(id);
  }
  if (trimmed.length < COFFEE_GROUP_MIN_SIZE) {
    throw new Error(`Pick at least ${COFFEE_GROUP_MIN_SIZE} bots for a Coffee chat.`);
  }
  if (trimmed.length > COFFEE_GROUP_MAX_SIZE) {
    throw new Error(`Coffee groups max out at ${COFFEE_GROUP_MAX_SIZE} bots.`);
  }
  return trimmed;
}

export function normalizeCoffeeSeatBotIds(raw: unknown): Array<string | null> {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Coffee groups need ${COFFEE_GROUP_MIN_SIZE}-${COFFEE_GROUP_MAX_SIZE} bots.`
    );
  }
  const rawUniqueIds = new Set(
    raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
  );
  if (rawUniqueIds.size > COFFEE_GROUP_MAX_SIZE) {
    throw new Error(`Coffee groups max out at ${COFFEE_GROUP_MAX_SIZE} bots.`);
  }
  const seats = raw.slice(0, COFFEE_GROUP_MAX_SIZE).map((value) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null
  );
  while (seats.length < COFFEE_GROUP_MAX_SIZE) seats.push(null);
  const seen = new Set<string>();
  const deduped = seats.map((id) => {
    if (!id) return null;
    if (seen.has(id)) return null;
    seen.add(id);
    return id;
  });
  const occupied = deduped.filter((id): id is string => typeof id === "string");
  if (occupied.length < COFFEE_GROUP_MIN_SIZE) {
    throw new Error(`Pick at least ${COFFEE_GROUP_MIN_SIZE} bots for a Coffee chat.`);
  }
  if (occupied.length > COFFEE_GROUP_MAX_SIZE) {
    throw new Error(`Coffee groups max out at ${COFFEE_GROUP_MAX_SIZE} bots.`);
  }
  return deduped;
}

export function randomizeCoffeeSeatBotIdsForSession(
  raw: unknown,
  random: () => number = Math.random
): Array<string | null> {
  const normalized = normalizeCoffeeSeatBotIds(raw);
  const occupied = normalized.filter((id): id is string => typeof id === "string");
  const seats: Array<string | null> = [
    ...occupied,
    ...Array.from({ length: COFFEE_GROUP_MAX_SIZE - occupied.length }, () => null),
  ];
  for (let index = seats.length - 1; index > 0; index -= 1) {
    const rawDraw = random();
    const draw = Number.isFinite(rawDraw) ? rawDraw : 0;
    const swapIndex = Math.max(0, Math.min(index, Math.floor(draw * (index + 1))));
    const current = seats[index] ?? null;
    seats[index] = seats[swapIndex] ?? null;
    seats[swapIndex] = current;
  }
  return seats;
}

function normalizeCoffeeExcludedBotIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function applyCoffeeGroupSessionExclusions(
  seatBotIds: readonly (string | null)[],
  rawExcludedBotIds: unknown
): { attendingSeatBotIds: Array<string | null>; absentBotIds: string[] } {
  const excludedBotIds = normalizeCoffeeExcludedBotIds(rawExcludedBotIds);
  if (excludedBotIds.length === 0) {
    return {
      attendingSeatBotIds: [...seatBotIds],
      absentBotIds: [],
    };
  }
  const groupBotIdSet = new Set(
    seatBotIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
  );
  for (const botId of excludedBotIds) {
    if (!groupBotIdSet.has(botId)) {
      throw new Error("Excluded Coffee bot is not in this group.");
    }
  }
  const excludedSet = new Set(excludedBotIds);
  const attendingSeatBotIds = seatBotIds.map((botId) =>
    botId && excludedSet.has(botId) ? null : botId
  );
  const absentBotIds = seatBotIds.filter(
    (botId): botId is string => typeof botId === "string" && excludedSet.has(botId)
  );
  return { attendingSeatBotIds, absentBotIds };
}

/**
 * Look up the bots in `botIds` for `userId`. Throws when any bot is
 * missing so we never enter a Coffee turn with a half-resolved group.
 */
export function loadCoffeeGroupProfiles(
  db: DatabaseSync,
  userId: string,
  botIds: string[]
): CoffeeBotProfile[] {
  if (botIds.length === 0) return [];
  const placeholders = botIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name, system_prompt, color, glyph, model, local_model, online_model,
              online_enabled, flirt_enabled, temperature, max_tokens,
              semantic_facets, semantic_facets_source_hash, semantic_facets_updated_at
         FROM bots
        WHERE id IN (${placeholders})
          AND (user_id = ? OR visibility = 'public')`
    )
    .all(...botIds, userId) as Array<{
    id: string;
    name: string | null;
    system_prompt: string | null;
    color: string | null;
    glyph: string | null;
    model: string | null;
    local_model: string | null;
    online_model: string | null;
    online_enabled: number | null;
    flirt_enabled: number | null;
    temperature: number | null;
    max_tokens: number | null;
    semantic_facets: string | null;
    semantic_facets_source_hash: string | null;
    semantic_facets_updated_at: string | null;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Preserve the caller's ordering (matches the picker order).
  const profiles: CoffeeBotProfile[] = [];
  for (const id of botIds) {
    const row = byId.get(id);
    if (!row) {
      throw new Error("One or more bots in this Coffee group could not be found.");
    }
    profiles.push({
      id: row.id,
      name: typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : "Unnamed bot",
      systemPrompt: typeof row.system_prompt === "string" ? row.system_prompt : "",
      color: row.color ?? null,
      glyph: row.glyph ?? null,
      localModel: row.local_model ?? null,
      onlineModel: row.online_model ?? null,
      defaultModel: row.model ?? null,
      temperature: typeof row.temperature === "number" ? row.temperature : null,
      maxTokens: typeof row.max_tokens === "number" ? row.max_tokens : null,
      onlineEnabled: row.online_enabled !== 0,
      flirtEnabled: row.flirt_enabled === 1,
      semanticFacetsRaw: row.semantic_facets ?? null,
      semanticFacetsSourceHash: row.semantic_facets_source_hash ?? null,
      semanticFacetsUpdatedAt: row.semantic_facets_updated_at ?? null,
    });
  }
  return profiles;
}

export interface CoffeeAttendanceContext {
  currentAbsentBotIds: string[];
  currentAbsentBotNames: string[];
  returningBotNames: string[];
  recentAbsenceLines: string[];
}

function loadCoffeeBotNamesById(
  db: DatabaseSync,
  userId: string,
  botIds: readonly string[]
): Map<string, string> {
  const uniqueIds = Array.from(new Set(botIds.filter((id) => id.trim().length > 0)));
  if (uniqueIds.length === 0) return new Map();
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name
         FROM bots
        WHERE id IN (${placeholders})
          AND (user_id = ? OR visibility = 'public')`
    )
    .all(...uniqueIds, userId) as Array<{ id: string; name: string | null }>;
  const names = new Map<string, string>();
  for (const row of rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name) names.set(row.id, name);
  }
  return names;
}

export function loadCoffeeAttendanceContext(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  coffeeGroupId?: string | null;
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[];
  absentBotIds: readonly string[];
  recentLimit?: number;
}): CoffeeAttendanceContext | null {
  const attendingBotIds = args.group.map((bot) => bot.id);
  const currentAbsentBotIds = Array.from(
    new Set(args.absentBotIds.filter((id) => id.trim().length > 0))
  );
  const recentRows =
    typeof args.coffeeGroupId === "string" && args.coffeeGroupId.trim().length > 0
      ? args.db
          .prepare(
            `SELECT id, bot_group_ids, coffee_absent_bot_ids
               FROM conversations
              WHERE user_id = ?
                AND coffee_group_id = ?
                AND id != ?
                AND conversation_mode = 'coffee'
              ORDER BY updated_at DESC
              LIMIT ?`
          )
          .all(
            args.userId,
            args.coffeeGroupId,
            args.conversationId,
            Math.max(1, Math.min(12, args.recentLimit ?? 6))
          ) as Array<{
          id: string;
          bot_group_ids: string | null;
          coffee_absent_bot_ids: string | null;
        }>
      : [];

  const recentAbsenceCounts = new Map<string, number>();
  const allRelevantIds = new Set<string>([...attendingBotIds, ...currentAbsentBotIds]);
  for (const row of recentRows) {
    for (const botId of parseStoredBotGroupIds(row.bot_group_ids)) {
      allRelevantIds.add(botId);
    }
    for (const botId of parseStoredBotGroupIds(row.coffee_absent_bot_ids)) {
      allRelevantIds.add(botId);
      recentAbsenceCounts.set(botId, (recentAbsenceCounts.get(botId) ?? 0) + 1);
    }
  }

  const namesById = loadCoffeeBotNamesById(args.db, args.userId, [...allRelevantIds]);
  for (const bot of args.group) {
    namesById.set(bot.id, bot.name);
  }
  const nameFor = (botId: string): string => namesById.get(botId) ?? botId;
  const currentAbsentBotNames = currentAbsentBotIds.map(nameFor);
  const returningBotNames = attendingBotIds
    .filter((botId) => (recentAbsenceCounts.get(botId) ?? 0) > 0)
    .map(nameFor);
  const recentAbsenceLines = Array.from(recentAbsenceCounts.entries())
    .filter(([botId]) => !currentAbsentBotIds.includes(botId))
    .sort((left, right) => right[1] - left[1] || nameFor(left[0]).localeCompare(nameFor(right[0])))
    .slice(0, 3)
    .map(([botId, count]) =>
      count > 1
        ? `${nameFor(botId)} was absent recently, missing ${count} of the last ${recentRows.length} Coffee sessions.`
        : `${nameFor(botId)} was absent recently.`
    );

  if (
    currentAbsentBotNames.length === 0 &&
    returningBotNames.length === 0 &&
    recentAbsenceLines.length === 0
  ) {
    return null;
  }
  return {
    currentAbsentBotIds,
    currentAbsentBotNames,
    returningBotNames,
    recentAbsenceLines,
  };
}

export function formatCoffeeAttendancePromptSummary(
  context: CoffeeAttendanceContext | null | undefined
): string | null {
  if (!context) return null;
  const lines = ["Coffee Group attendance context (soft social texture, not a roll call):"];
  if (context.currentAbsentBotNames.length > 0) {
    lines.push(`- Away this session: ${context.currentAbsentBotNames.join(", ")}.`);
  }
  if (context.returningBotNames.length > 0) {
    lines.push(`- Returning after being away recently: ${context.returningBotNames.join(", ")}.`);
  }
  for (const line of context.recentAbsenceLines) {
    lines.push(`- ${line}`);
  }
  lines.push(
    "- Bots may naturally mention an absence or return when it fits the moment, but do not force attendance chatter or speak as if absent bots are present."
  );
  return lines.length > 2 ? lines.join("\n") : null;
}

function attachCoffeeBotSemanticFacets(
  db: DatabaseSync,
  userId: string,
  group: CoffeeBotProfile[],
  prismDefaultLlmModel?: string | null
): CoffeeBotProfile[] {
  return group.map((bot) => {
    const resolved = effectiveBotSemanticFacets({
      name: bot.name,
      systemPrompt: bot.systemPrompt,
      semanticFacets: bot.semanticFacetsRaw ?? null,
      semanticFacetsSourceHash: bot.semanticFacetsSourceHash ?? null,
    });
    if (resolved.needsRefresh && prismDefaultLlmModel !== undefined) {
      queueBotSemanticFacetsRefresh({
        db,
        userId,
        botId: bot.id,
        prismDefaultLlmModel,
      });
    }
    return {
      ...bot,
      semanticFacets: resolved.facets,
    };
  });
}

function normalizeCoffeeGroupName(raw: unknown, fallback: string): string {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  const base = value.length > 0 ? value : fallback;
  return base.length > 80 ? `${base.slice(0, 77).trimEnd()}...` : base;
}

function normalizeCoffeePresetName(raw: unknown, fallback: string): string {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  const base = value.length > 0 ? value : fallback;
  return base.length > 56 ? `${base.slice(0, 53).trimEnd()}...` : base;
}

function parseCoffeeMoodSummary(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function computeCoffeeGroupMoodSummary(
  db: DatabaseSync,
  userId: string,
  groupId: string
): Record<string, unknown> {
  const rows = db
    .prepare(
      `SELECT s.disposition, s.values_friction, s.restraint, s.engagement, s.leave_pressure
         FROM coffee_bot_social_state s
         JOIN conversations c ON c.id = s.conversation_id AND c.user_id = s.user_id
        WHERE s.user_id = ? AND c.coffee_group_id = ?`
    )
    .all(userId, groupId) as unknown as Array<{
    disposition: number;
    values_friction: number;
    restraint: number;
    engagement: number;
    leave_pressure: number;
  }>;
  if (rows.length === 0) {
    return {
      score: 50,
      label: "Warming up",
      sampleCount: 0,
      disposition: 0.5,
      engagement: 0.5,
      friction: 0.35,
      leavePressure: 0.1,
    };
  }
  const avg = (pick: (row: (typeof rows)[number]) => number): number =>
    rows.reduce((sum, row) => sum + pick(row), 0) / rows.length;
  const disposition = avg((row) => row.disposition);
  const engagement = avg((row) => row.engagement);
  const friction = avg((row) => row.values_friction);
  const leavePressure = avg((row) => row.leave_pressure);
  const scoreRaw =
    disposition * 38 +
    engagement * 34 +
    (1 - friction) * 18 +
    (1 - leavePressure) * 10;
  const score = Math.max(0, Math.min(100, Math.round(scoreRaw)));
  const label = score >= 72 ? "Humming" : score >= 48 ? "Settling" : "Tense";
  return {
    score,
    label,
    sampleCount: rows.length,
    disposition: Number(disposition.toFixed(3)),
    engagement: Number(engagement.toFixed(3)),
    friction: Number(friction.toFixed(3)),
    leavePressure: Number(leavePressure.toFixed(3)),
  };
}

function loadCoffeeGroupSeatBotIds(
  db: DatabaseSync,
  userId: string,
  groupId: string
): Array<string | null> {
  const seats = emptyCoffeeSeatBotIds();
  const rows = db
    .prepare(
      `SELECT seat_index, bot_id
         FROM coffee_group_seats
        WHERE user_id = ? AND group_id = ?
        ORDER BY seat_index ASC`
    )
    .all(userId, groupId) as Array<{ seat_index: number; bot_id: string | null }>;
  for (const row of rows) {
    if (Number.isInteger(row.seat_index) && row.seat_index >= 0 && row.seat_index < COFFEE_GROUP_MAX_SIZE) {
      seats[row.seat_index] =
        typeof row.bot_id === "string" && row.bot_id.trim().length > 0 ? row.bot_id : null;
    }
  }
  return seats;
}

function emptyCoffeeSeatBotIds(): Array<string | null> {
  return Array.from({ length: COFFEE_GROUP_MAX_SIZE }, () => null);
}

function mapCoffeeGroupRow(
  db: DatabaseSync,
  row: CoffeeGroupRow
): CoffeeGroup {
  const coffeeSeatBotIds = loadCoffeeGroupSeatBotIds(db, row.user_id, row.id);
  const botGroupIds = coffeeSeatBotIds.filter((id): id is string => typeof id === "string");
  const groupProfiles = loadCoffeeGroupProfiles(db, row.user_id, botGroupIds);
  const moodSummary = parseCoffeeMoodSummary(row.mood_summary);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    botGroupIds,
    coffeeSeatBotIds,
    coffeeSettings: parseStoredCoffeeSessionSettings(row.coffee_settings),
    presetMode: normalizeCoffeePresetMode(row.preset_mode),
    topicSelectionMode: normalizeCoffeeTopicSelectionMode(row.coffee_topic_mode ?? "manual"),
    modelChoiceByProvider: parseStoredCoffeeGroupModelChoice(row.model_choice),
    starterTopicsByBotId: parseStoredCoffeeGroupStarterTopics(row.starter_topics, groupProfiles),
    moodSummary: moodSummary ?? computeCoffeeGroupMoodSummary(db, row.user_id, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function upsertCoffeeGroupSeats(
  db: DatabaseSync,
  userId: string,
  groupId: string,
  seatBotIds: Array<string | null>,
  updatedAt: string
): void {
  const statement = db.prepare(
    `INSERT INTO coffee_group_seats (user_id, group_id, seat_index, bot_id, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, group_id, seat_index) DO UPDATE SET
       bot_id = excluded.bot_id,
       updated_at = excluded.updated_at`
  );
  for (let index = 0; index < COFFEE_GROUP_MAX_SIZE; index += 1) {
    statement.run(userId, groupId, index, seatBotIds[index] ?? null, updatedAt);
  }
}

function insertCoffeeGroupEvent(
  db: DatabaseSync,
  userId: string,
  groupId: string,
  eventType: string,
  payload: Record<string, unknown>,
  createdAt: string
): void {
  db.prepare(
    `INSERT INTO coffee_group_events (id, user_id, group_id, event_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomId(12), userId, groupId, eventType, JSON.stringify(payload), createdAt);
}

function loadCoffeeGroupRow(
  db: DatabaseSync,
  userId: string,
  groupId: string
): CoffeeGroupRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, starter_topics, mood_summary, archived_at, created_at, updated_at
         FROM coffee_groups
        WHERE id = ? AND user_id = ? AND archived_at IS NULL`
    )
    .get(groupId, userId) as CoffeeGroupRow | undefined;
}

export function listCoffeeGroups(db: DatabaseSync, userId: string): CoffeeGroup[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, starter_topics, mood_summary, archived_at, created_at, updated_at
         FROM coffee_groups
        WHERE user_id = ? AND archived_at IS NULL
        ORDER BY updated_at DESC, created_at DESC`
    )
    .all(userId) as unknown as CoffeeGroupRow[];
  return rows.map((row) => mapCoffeeGroupRow(db, row));
}

function mapCoffeePresetRow(row: CoffeePresetRow): CoffeePreset {
  return {
    id: row.id,
    name: row.name,
    settings: parseStoredCoffeeSessionSettings(row.coffee_settings),
    builtIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadCoffeePresetRow(
  db: DatabaseSync,
  userId: string,
  presetId: string
): CoffeePresetRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, name, coffee_settings, created_at, updated_at
         FROM coffee_presets
        WHERE id = ? AND user_id = ?`
    )
    .get(presetId, userId) as CoffeePresetRow | undefined;
}

export function listCoffeePresets(db: DatabaseSync, userId: string): CoffeePreset[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, name, coffee_settings, created_at, updated_at
         FROM coffee_presets
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC`
    )
    .all(userId) as unknown as CoffeePresetRow[];
  return [...BUILT_IN_COFFEE_PRESETS, ...rows.map(mapCoffeePresetRow)];
}

export function createCoffeePreset(
  db: DatabaseSync,
  userId: string,
  input: CoffeePresetCreateInput
): CoffeePreset {
  const now = new Date().toISOString();
  const presetId = randomId(12);
  const settings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const name = normalizeCoffeePresetName(input.name, "Coffee Preset");
  db.prepare(
    `INSERT INTO coffee_presets (id, user_id, name, coffee_settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(presetId, userId, name, JSON.stringify(settings), now, now);
  const row = loadCoffeePresetRow(db, userId, presetId);
  if (!row) throw new Error("Failed to create Coffee preset.");
  return mapCoffeePresetRow(row);
}

export function updateCoffeePreset(
  db: DatabaseSync,
  userId: string,
  presetId: string,
  input: CoffeePresetUpdateInput
): CoffeePreset {
  if (BUILT_IN_COFFEE_PRESETS.some((preset) => preset.id === presetId)) {
    throw new Error("Built-in Coffee presets cannot be edited.");
  }
  const row = loadCoffeePresetRow(db, userId, presetId);
  if (!row) throw new Error("Coffee preset not found.");
  const now = new Date().toISOString();
  const name = input.name !== undefined ? normalizeCoffeePresetName(input.name, row.name) : row.name;
  const settings =
    input.coffeeSettings !== undefined
      ? normalizeCoffeeSessionSettings(input.coffeeSettings)
      : parseStoredCoffeeSessionSettings(row.coffee_settings);
  db.prepare(
    `UPDATE coffee_presets
        SET name = ?, coffee_settings = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(name, JSON.stringify(settings), now, presetId, userId);
  const updated = loadCoffeePresetRow(db, userId, presetId);
  if (!updated) throw new Error("Coffee preset not found.");
  return mapCoffeePresetRow(updated);
}

export function deleteCoffeePreset(
  db: DatabaseSync,
  userId: string,
  presetId: string
): void {
  if (BUILT_IN_COFFEE_PRESETS.some((preset) => preset.id === presetId)) {
    throw new Error("Built-in Coffee presets cannot be deleted.");
  }
  const result = db
    .prepare("DELETE FROM coffee_presets WHERE id = ? AND user_id = ?")
    .run(presetId, userId);
  if (Number(result.changes ?? 0) === 0) {
    throw new Error("Coffee preset not found.");
  }
}

function pickRandomCoffeePreset(db: DatabaseSync, userId: string): CoffeePreset {
  const presets = listCoffeePresets(db, userId);
  const index = Math.floor(Math.random() * presets.length);
  return presets[index] ?? BUILT_IN_COFFEE_PRESETS[0]!;
}

function resolveCoffeePreset(
  db: DatabaseSync,
  userId: string,
  presetId: string
): CoffeePreset {
  const builtIn = BUILT_IN_COFFEE_PRESETS.find((preset) => preset.id === presetId);
  if (builtIn) return builtIn;
  const row = loadCoffeePresetRow(db, userId, presetId);
  if (!row) throw new Error("Coffee preset not found.");
  return mapCoffeePresetRow(row);
}

export function createCoffeeGroup(
  db: DatabaseSync,
  userId: string,
  input: CoffeeGroupCreateInput
): CoffeeGroup {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = attachCoffeeBotSemanticFacets(
    db,
    userId,
    loadCoffeeGroupProfiles(db, userId, groupIds),
    undefined
  );
  const now = new Date().toISOString();
  const groupId = randomId(12);
  const settings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const name = normalizeCoffeeGroupName(input.name, generateCoffeeTitle("", group));
  const modelChoice = normalizeCoffeeGroupModelChoice(input.modelChoiceByProvider);
  const providedStarterTopics = normalizeCoffeeGroupStarterTopicsByBotId(
    input.starterTopicsByBotId,
    group
  );
  const starterTopicsByBotId =
    Object.keys(providedStarterTopics).length > 0
      ? completeCoffeeGroupStarterTopics(providedStarterTopics, group, settings)
      : buildDeterministicCoffeeGroupStarterTopics(group, settings);
  db.prepare(
    `INSERT INTO coffee_groups
       (id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, starter_topics, mood_summary, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'manual', 'manual', ?, ?, '{}', NULL, ?, ?)`
  ).run(
    groupId,
    userId,
    name,
    JSON.stringify(settings),
    JSON.stringify(modelChoice),
    JSON.stringify(starterTopicsByBotId),
    now,
    now
  );
  upsertCoffeeGroupSeats(db, userId, groupId, seatBotIds, now);
  insertCoffeeGroupEvent(
    db,
    userId,
    groupId,
    "created",
    { name, botGroupIds: groupIds, coffeeSeatBotIds: seatBotIds },
    now
  );
  const row = loadCoffeeGroupRow(db, userId, groupId);
  if (!row) throw new Error("Failed to create Coffee group.");
  return mapCoffeeGroupRow(db, row);
}

export function shouldGenerateCoffeeGroupNameFromInput(
  rawName: string | null | undefined,
  group: CoffeeBotProfile[]
): boolean {
  const provided = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim() : "";
  if (!provided) return true;
  const normalized = provided.toLowerCase();
  const legacyAutoName = normalizeCoffeeGroupName("", generateCoffeeTitle("", group)).toLowerCase();
  if (normalized === legacyAutoName) return true;
  return normalized.startsWith("coffee with ");
}

export async function createCoffeeGroupWithGeneratedName(
  db: DatabaseSync,
  userId: string,
  input: CoffeeGroupCreateInput,
  llm?: CoffeeAuxiliaryOptions | null
): Promise<CoffeeGroup> {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = attachCoffeeBotSemanticFacets(
    db,
    userId,
    loadCoffeeGroupProfiles(db, userId, groupIds),
    llm?.prismDefaultLlmModel
  );
  const requestedName = typeof input.name === "string" ? input.name : null;
  const settings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const provider = coffeeAuxiliaryProvider(llm);
  const starterTopicsByBotId =
    input.starterTopicsByBotId !== undefined
      ? normalizeCoffeeGroupStarterTopicsByBotId(input.starterTopicsByBotId, group)
      : await inferCoffeeGroupStarterTopics({
          provider,
          group,
          sessionSettings: settings,
        });
  if (!shouldGenerateCoffeeGroupNameFromInput(requestedName, group)) {
    return createCoffeeGroup(db, userId, {
      ...input,
      coffeeSettings: settings,
      starterTopicsByBotId,
    });
  }
  const fallbackName = buildDeterministicCoffeeGroupName(group);
  const generatedName = await inferCoffeeGroupName({
    provider,
    group,
    fallbackName,
  });
  return createCoffeeGroup(db, userId, {
    ...input,
    coffeeSettings: settings,
    name: generatedName,
    starterTopicsByBotId,
  });
}

export function updateCoffeeGroup(
  db: DatabaseSync,
  userId: string,
  groupId: string,
  input: CoffeeGroupUpdateInput
): CoffeeGroup {
  const row = loadCoffeeGroupRow(db, userId, groupId);
  if (!row) throw new Error("Coffee group not found.");
  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: SQLInputValue[] = [];
  let nextSettings = parseStoredCoffeeSessionSettings(row.coffee_settings);

  if (input.name !== undefined) {
    const name = normalizeCoffeeGroupName(input.name, row.name);
    updates.push("name = ?");
    values.push(name);
    if (name !== row.name) {
      insertCoffeeGroupEvent(db, userId, groupId, "renamed", { from: row.name, to: name }, now);
    }
  }
  if (input.coffeeSettings !== undefined) {
    const mergedUnknown: unknown =
      input.coffeeSettings && typeof input.coffeeSettings === "object" && !Array.isArray(input.coffeeSettings)
        ? { ...nextSettings, ...(input.coffeeSettings as Record<string, unknown>) }
        : input.coffeeSettings;
    const settings = normalizeCoffeeSessionSettings(mergedUnknown);
    nextSettings = settings;
    updates.push("coffee_settings = ?");
    values.push(JSON.stringify(settings));
    insertCoffeeGroupEvent(db, userId, groupId, "settings_updated", { coffeeSettings: settings }, now);
  }
  if (input.presetMode !== undefined) {
    updates.push("preset_mode = ?");
    values.push(normalizeCoffeePresetMode(input.presetMode));
  }
  if (input.topicSelectionMode !== undefined) {
    updates.push("coffee_topic_mode = ?");
    values.push(normalizeCoffeeTopicSelectionMode(input.topicSelectionMode));
  }
  if (input.modelChoiceByProvider !== undefined) {
    const merged = {
      ...parseStoredCoffeeGroupModelChoice(row.model_choice),
      ...normalizeCoffeeGroupModelChoice(input.modelChoiceByProvider),
    } as Record<string, string>;
    // Drop blanks from caller-supplied overrides (lets the client clear back to Auto).
    const provided = (input.modelChoiceByProvider ?? {}) as Record<string, unknown>;
    for (const provider of ["local", "openai", "anthropic"] as const) {
      if (Object.prototype.hasOwnProperty.call(provided, provider)) {
        const raw = provided[provider];
        if (typeof raw !== "string" || raw.trim().length === 0 || raw.trim().toLowerCase() === "auto") {
          delete merged[provider];
        }
      }
    }
    updates.push("model_choice = ?");
    values.push(JSON.stringify(merged));
    insertCoffeeGroupEvent(db, userId, groupId, "model_choice_updated", { modelChoiceByProvider: merged }, now);
  }
  if (input.groupBotIds !== undefined) {
    const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
    const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
    const groupProfiles = attachCoffeeBotSemanticFacets(
      db,
      userId,
      loadCoffeeGroupProfiles(db, userId, groupIds),
      undefined
    );
    const starterTopicsByBotId =
      input.starterTopicsByBotId !== undefined
        ? completeCoffeeGroupStarterTopics(
            normalizeCoffeeGroupStarterTopicsByBotId(input.starterTopicsByBotId, groupProfiles),
            groupProfiles,
            nextSettings
          )
        : buildDeterministicCoffeeGroupStarterTopics(groupProfiles, nextSettings);
    updates.push("starter_topics = ?");
    values.push(JSON.stringify(starterTopicsByBotId));
    upsertCoffeeGroupSeats(db, userId, groupId, seatBotIds, now);
    insertCoffeeGroupEvent(
      db,
      userId,
      groupId,
      "roster_updated",
      { botGroupIds: groupIds, coffeeSeatBotIds: seatBotIds },
      now
    );
  } else if (input.starterTopicsByBotId !== undefined) {
    const seatBotIds = loadCoffeeGroupSeatBotIds(db, userId, groupId);
    const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
    const groupProfiles = loadCoffeeGroupProfiles(db, userId, groupIds);
    const starterTopicsByBotId = normalizeCoffeeGroupStarterTopicsByBotId(
      input.starterTopicsByBotId,
      groupProfiles
    );
    updates.push("starter_topics = ?");
    values.push(
      JSON.stringify(
        completeCoffeeGroupStarterTopics(starterTopicsByBotId, groupProfiles, nextSettings)
      )
    );
  }
  if (updates.length > 0) {
    updates.push("updated_at = ?");
    values.push(now, groupId, userId);
    db.prepare(
      `UPDATE coffee_groups SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...values);
  } else if (input.groupBotIds !== undefined) {
    db.prepare(
      "UPDATE coffee_groups SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(now, groupId, userId);
  }
  const updated = loadCoffeeGroupRow(db, userId, groupId);
  if (!updated) throw new Error("Coffee group not found.");
  return mapCoffeeGroupRow(db, updated);
}

/**
 * Permanently removes a Coffee Group for this account.
 *
 * Also deletes any Coffee conversations tied to that group.
 * Dependent rows (messages, seats, events) are removed via FK cascade.
 */
export function deleteCoffeeGroup(db: DatabaseSync, userId: string, groupId: string): void {
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    db.prepare(
      "DELETE FROM conversations WHERE user_id = ? AND coffee_group_id = ?"
    ).run(userId, groupId);
    const result = db.prepare("DELETE FROM coffee_groups WHERE id = ? AND user_id = ?").run(groupId, userId);
    if (Number(result.changes ?? 0) === 0) {
      db.exec("ROLLBACK");
      throw new Error("Coffee group not found.");
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore failed rollback after closed txn */
    }
    throw error;
  }
}

/**
 * Router-side table tuning (shared with unit tests).
 */
export function buildCoffeeTableTuningAppendix(settings: CoffeeSessionSettings): string {
  const energyLine =
    settings.tableEnergy === "still"
      ? "Favor a very quiet circle — change speakers only when someone is clearly invited forward."
      : settings.tableEnergy === "relaxed"
        ? "Keep an easy, low-pressure cadence — no rush to fill silence."
        : settings.tableEnergy === "buzzy"
          ? "Allow a slightly quicker back-and-forth when personalities support it."
          : settings.tableEnergy === "theatre"
            ? "The table may feel lively — bolder speaker picks are okay when they fit the moment."
            : "The table may feel unruly and overcaffeinated — rapid pivots, sharp interjections, and messy energy are allowed when the thread stays legible.";

  const crossLine =
    settings.crossTalk === "rare"
      ? "Prefer one clear voice at a time; avoid rapid ping-pong between bots unless unavoidable."
      : settings.crossTalk === "chatty"
        ? "Bot-to-bot riffing is welcome when it stays grounded in the last few lines."
        : settings.crossTalk === "pileup"
          ? "Pile-ons and brief interruptions are welcome; bots may jump on the last line before it fully settles, but each turn still needs one usable thought."
        : "Balance replying to the last speaker with leaving air for the whole table.";

  const threadLine = settings.stayOnThread
    ? "Discourage hard topic jumps until the current thread finds a natural pause or landing."
    : "Topic shifts are allowed when they feel natural rather than chaotic.";

  return ["Table tuning (follow alongside the base Coffee rules):", energyLine, crossLine, threadLine].join(
    "\n"
  );
}

/**
 * Speaker-side style cues under the tabletop character cap.
 */
export function buildCoffeeSpeakerStyleAppendix(
  settings: CoffeeSessionSettings,
  tableReplyMaxChars: number
): string {
  const energyLine =
    settings.tableEnergy === "still"
      ? "Keep your energy soft and minimal."
      : settings.tableEnergy === "relaxed"
        ? "Stay easy and low-key."
        : settings.tableEnergy === "buzzy"
          ? "A little sparkle is fine — stay within the tabletop cap."
          : settings.tableEnergy === "theatre"
            ? "Big personality is okay — still respect the tabletop cap."
            : "High-energy cut-ins are allowed — stay short enough for the table to follow.";

  const crossLine =
    settings.crossTalk === "rare"
      ? "Prefer addressing the last line or the shared topic without forcing a pile-on."
      : settings.crossTalk === "chatty"
        ? "You may bounce off the last bot when it fits your character."
        : settings.crossTalk === "pileup"
          ? "You may cut in sharply, talk over the previous beat, or pile on, but keep it to one plain line."
        : "Sometimes reply to the last bot; sometimes widen to the whole table.";

  return [
    "Coffee style cues (the soft tabletop target below shapes everything):",
    energyLine,
    crossLine,
    `Soft tabletop target for this session: ${tableReplyMaxChars} characters including spaces. The server no longer truncates, so a slightly longer line is fine — but please don't ramble; brevity reads best on the table.`,
  ].join("\n");
}

/** Parse persisted JSON from `conversations.coffee_settings`. */
export function parseStoredCoffeeSessionSettings(raw: string | null | undefined): CoffeeSessionSettings {
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    return normalizeCoffeeSessionSettings(undefined);
  }
  try {
    return normalizeCoffeeSessionSettings(JSON.parse(raw) as unknown);
  } catch {
    return normalizeCoffeeSessionSettings(undefined);
  }
}

const COFFEE_STARTER_TOPIC_INFER_MAX_TOKENS = 360;
const COFFEE_STARTER_TOPIC_INFER_TEMPERATURE = 0.55;
const COFFEE_GROUP_NAME_INFER_MAX_TOKENS = 140;
const COFFEE_GROUP_NAME_INFER_TEMPERATURE = 0.7;
const COFFEE_GROUP_NAME_INFER_ATTEMPTS = 2;
const COFFEE_GROUP_NAME_MIN_RELEVANCE_SCORE = 5;
const COFFEE_GROUP_STARTER_TOPICS_PER_BOT = 4;
const COFFEE_GROUP_STARTER_TOPIC_MAX = COFFEE_GROUP_MAX_SIZE * COFFEE_GROUP_STARTER_TOPICS_PER_BOT;
const COFFEE_GROUP_STARTER_TOPIC_INFER_MAX_TOKENS = 900;
const COFFEE_GROUP_STARTER_TOPIC_INFER_TEMPERATURE = 0.62;
const COFFEE_TOPIC_HINT_MAX_WORDS = 5;
const COFFEE_TOPIC_HINT_MAX_CHARS = 48;
const COFFEE_STARTER_MEMORY_MAX_PER_BOT = 4;
const COFFEE_STARTER_MEMORY_LOOKBACK_PER_BOT = 40;
const COFFEE_STARTER_MEMORY_HINT_MAX_CHARS = 150;

type CoffeeStarterTopicCandidate = {
  label: string;
  kind?: string;
  rationale?: string;
};

const COFFEE_STARTER_TOPIC_DANGLING_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "who",
]);

const COFFEE_STARTER_TOPIC_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "versus",
  "when",
  "without",
  "with",
]);

function coffeeStarterTopicFromPayloadItem(item: unknown): CoffeeStarterTopicCandidate | null {
  if (typeof item === "string") return { label: item };
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const record = item as {
    label?: unknown;
    topic?: unknown;
    title?: unknown;
    kind?: unknown;
    rationale?: unknown;
  };
  const label =
    typeof record.label === "string"
      ? record.label
      : typeof record.topic === "string"
        ? record.topic
        : typeof record.title === "string"
          ? record.title
          : "";
  if (!label) return null;
  return {
    label,
    kind: typeof record.kind === "string" ? record.kind : undefined,
    rationale: typeof record.rationale === "string" ? record.rationale : undefined,
  };
}

function normalizeCoffeeStarterTopicLabel(raw: string): string | null {
  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:[-*]|\d+[\).:-])\s*/u, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
    .replace(/[.]+$/u, "")
    .trim();
  if (!normalized || /[\r\n]/u.test(normalized)) return null;
  const words = normalized.match(/[\p{L}\p{N}'-]+/gu) ?? [];
  if (words.length < 2 || words.length > 8) return null;
  const lastWord = words[words.length - 1]?.toLowerCase() ?? "";
  if (COFFEE_STARTER_TOPIC_DANGLING_WORDS.has(lastWord)) return null;
  if (/^(?:topic|prompt|question|starter)\s*\d*$/iu.test(normalized)) return null;
  if (/\b(?:angle on|meets real life|worth unpacking|check[- ]?in|small talk|everyone settles)\b/iu.test(normalized)) {
    return null;
  }
  if (/\b(?:one shared curiosity|tiny story|something .+ would defend|what are we doing)\b/iu.test(normalized)) {
    return null;
  }
  return normalized;
}

function coffeeStarterTopicSimilarityKey(label: string): string {
  return (
    label
      .toLowerCase()
      .match(/[\p{L}\p{N}'-]+/gu)
      ?.filter((token) => token.length > 2 && !COFFEE_STARTER_TOPIC_STOPWORDS.has(token))
      .slice(0, 6)
      .join(" ") ?? ""
  );
}

function coffeeStarterTopicMentionsMultipleBots(
  label: string,
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[]
): boolean {
  const normalized = label.toLowerCase();
  const matches = group
    .map((bot) => bot.name.trim().toLowerCase())
    .filter((name) => name.length > 0 && normalized.includes(name));
  return matches.length >= 2;
}

function selectCoffeeStarterTopicLabels(
  candidates: readonly CoffeeStarterTopicCandidate[],
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[],
  limit = 3
): string[] {
  const selected: string[] = [];
  const seenKeys = new Set<string>();
  const maxLabels = Math.max(1, Math.min(COFFEE_GROUP_STARTER_TOPIC_MAX, Math.floor(limit)));
  for (const candidate of candidates) {
    const label = normalizeCoffeeStarterTopicLabel(candidate.label);
    if (!label) continue;
    if (coffeeStarterTopicMentionsMultipleBots(label, group)) continue;
    const key = coffeeStarterTopicSimilarityKey(label);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    selected.push(label);
    if (selected.length >= maxLabels) break;
  }
  return selected;
}

function coffeeStarterTopicRelevanceTokens(texts: readonly string[]): Set<string> {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const token of text.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? []) {
      if (token.length <= 2) continue;
      if (COFFEE_STARTER_TOPIC_STOPWORDS.has(token)) continue;
      tokens.add(token);
    }
  }
  return tokens;
}

function coffeeStarterTopicGroupRelevanceScore(
  label: string,
  contextTokens: ReadonlySet<string>
): number {
  let score = 0;
  const seen = new Set<string>();
  for (const token of label.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? []) {
    if (token.length <= 2) continue;
    if (COFFEE_STARTER_TOPIC_STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    if (contextTokens.has(token)) score += 1;
  }
  return score;
}

function parseCoffeeStarterTopicsPayload(raw: string, group: CoffeeBotProfile[]): string[] {
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) {
    candidates.push(fenceMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const topics = (parsed as { topics?: unknown; candidates?: unknown }).topics ??
        (parsed as { candidates?: unknown }).candidates;
      if (!Array.isArray(topics)) continue;
      const structured = topics
        .map((item) => coffeeStarterTopicFromPayloadItem(item))
        .filter((item): item is CoffeeStarterTopicCandidate => item !== null);
      const labels = selectCoffeeStarterTopicLabels(structured, group);
      if (labels.length > 0) return labels;
    } catch {
      // try next candidate
    }
  }
  return [];
}

function parseCoffeeGroupNamePayload(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) candidates.push(fenceMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const name = (parsed as { name?: unknown }).name;
      if (typeof name !== "string") continue;
      const normalized = name.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
      if (normalized) return normalized;
    } catch {
      // Try the next candidate.
    }
  }
  const plain = trimmed.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  return plain || null;
}

function parseCoffeeGroupNameCandidatesPayload(raw: string): string[] {
  if (typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) candidates.push(fenceMatch[0]);
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const names = (parsed as { names?: unknown }).names;
      if (Array.isArray(names)) {
        const normalized = names
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim())
          .filter((item) => item.length > 0);
        if (normalized.length > 0) return normalized;
      }
      const single = (parsed as { name?: unknown }).name;
      if (typeof single === "string") {
        const normalized = single.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
        if (normalized) return [normalized];
      }
    } catch {
      // Try next candidate.
    }
  }
  const plain = trimmed.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  return plain ? [plain] : [];
}

function coffeeLooksLikeParticipantListName(name: string, group: CoffeeBotProfile[]): boolean {
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.startsWith("coffee with ")) return true;
  if (normalized.includes(",")) return true;
  const seatedNames = group
    .map((bot) => bot.name.trim().toLowerCase())
    .filter((value) => value.length > 0);
  if (seatedNames.length < 2) return false;
  const matches = seatedNames.filter((botName) => normalized.includes(botName)).length;
  return matches >= 2;
}

type CoffeeGroupNameRelevance = {
  terms: Map<string, number>;
  botTerms: Array<Set<string>>;
};

type CoffeeGroupNameCandidateScore = {
  score: number;
  relevanceScore: number;
};

const COFFEE_GROUP_NAME_RELEVANCE_STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "because",
  "being",
  "bot",
  "coffee",
  "from",
  "group",
  "have",
  "into",
  "mode",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "very",
  "with",
  "would",
  "your",
]);

const COFFEE_GROUP_NAME_GENERIC_WORDS = new Set([
  "bean",
  "beans",
  "brew",
  "brewed",
  "cafe",
  "caffeine",
  "circle",
  "club",
  "coffee",
  "crew",
  "cup",
  "grounds",
  "group",
  "java",
  "koffee",
  "mocha",
  "roast",
  "sips",
  "society",
  "table",
]);

const COFFEE_GROUP_NAME_THEME_RULES: Array<{
  pattern: RegExp;
  terms: readonly string[];
  weight: number;
}> = [
  {
    pattern: /\b(philosoph|socratic|stoic|ethic|wisdom|metaphysic|logic|reason)\b/iu,
    terms: ["dialectic", "idea", "logic", "philo", "philosophy", "reason", "smart", "socratic", "stoic", "wisdom"],
    weight: 5,
  },
  {
    pattern: /\b(power|empire|command|control|strategy|strength|order|authority)\b/iu,
    terms: ["authority", "command", "control", "dark", "doctrine", "empire", "order", "power", "strategy"],
    weight: 5,
  },
  {
    pattern: /\b(compassion|forgive|forgiveness|mercy|grace|spirit|faith|hope|love|kindness)\b/iu,
    terms: ["compassion", "faith", "forgiveness", "grace", "hope", "kindness", "love", "mercy", "pardon", "soul"],
    weight: 5,
  },
  {
    pattern: /\b(engineer|debug|code|system|build|architecture|software|logic)\b/iu,
    terms: ["architecture", "build", "code", "debug", "engineer", "logic", "systems"],
    weight: 5,
  },
  {
    pattern: /\b(chef|cook|food|kitchen|recipe|restaurant|menu|diner|meal)\b/iu,
    terms: ["chef", "diner", "feast", "food", "kitchen", "menu", "recipe", "skillet", "soup"],
    weight: 5,
  },
  {
    pattern: /\b(theatre|theater|critic|stage|tension|subtext|drama)\b/iu,
    terms: ["critic", "drama", "stage", "subtext", "theatre", "tension"],
    weight: 5,
  },
  {
    pattern: /\b(archive|archivist|evidence|record|concrete|receipt)\b/iu,
    terms: ["archive", "evidence", "ledger", "receipt", "record"],
    weight: 5,
  },
  {
    pattern: /\b(spongebob|patrick|squidward|krabs|plankton|sandy|gary|krabby|patty|jellyfish|pineapple)\b/iu,
    terms: ["bikini", "jellyfish", "krabby", "krusty", "patty", "pineapple"],
    weight: 7,
  },
  {
    pattern: /\b(harry\s+potter|potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical)\b/iu,
    terms: ["gryffindor", "hogwarts", "magic", "mcgonagall", "potter", "quidditch", "spell", "transfiguration", "wand", "wizard"],
    weight: 8,
  },
];

function coffeeGroupHasWizardingWorldSignal(group: CoffeeBotProfile[]): boolean {
  const text = group
    .map((bot) => `${bot.name} ${bot.systemPrompt}`)
    .join(" ")
    .toLowerCase();
  return /\b(harry\s+potter|potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical)\b/u.test(text);
}

function coffeeNameHasWizardingWorldAnchor(name: string): boolean {
  return /\b(potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical)\b/iu.test(name);
}

function coffeeBotSemanticFacets(bot: CoffeeBotProfile): BotSemanticFacets {
  return bot.semanticFacets ?? deriveDeterministicBotSemanticFacets({
    name: bot.name,
    systemPrompt: bot.systemPrompt,
  });
}

function coffeeBotFacetTexts(bot: CoffeeBotProfile): string[] {
  const facets = coffeeBotSemanticFacets(bot);
  return [
    ...facets.canonAnchors,
    ...facets.domains,
    ...facets.values,
    ...facets.tensions,
    ...facets.namingTokens,
    ...facets.starterSeeds,
  ];
}

function coffeeGroupFacetTexts(group: CoffeeBotProfile[]): string[] {
  return group.flatMap((bot) => coffeeBotFacetTexts(bot));
}

function coffeeFacetStarterTopicCandidates(group: CoffeeBotProfile[]): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  const topicLists = group.map((bot) => {
    const facets = coffeeBotSemanticFacets(bot);
    return [...facets.starterSeeds, ...facets.tensions];
  });
  const maxLength = Math.max(0, ...topicLists.map((list) => list.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const list of topicLists) {
      const topic = list[index];
      if (!topic) continue;
      const normalized = topic.replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push(normalized);
    }
  }
  return topics;
}

function coffeeGroupHasCanonFacetSignal(group: CoffeeBotProfile[]): boolean {
  return group.some((bot) => coffeeBotSemanticFacets(bot).canonAnchors.length > 0);
}

function formatCoffeeBotFacetSummary(bot: CoffeeBotProfile): string {
  const facets = coffeeBotSemanticFacets(bot);
  const parts: string[] = [];
  const anchors = facets.canonAnchors.slice(0, 4).join(", ");
  const domains = facets.domains.slice(0, 4).join(", ");
  const values = facets.values.slice(0, 4).join(", ");
  const tensions = facets.tensions.slice(0, 4).join(", ");
  const starters = facets.starterSeeds.slice(0, 4).join(", ");
  if (anchors) parts.push(`anchors=${anchors}`);
  if (domains) parts.push(`domains=${domains}`);
  if (values) parts.push(`values=${values}`);
  if (tensions) parts.push(`tensions=${tensions}`);
  if (starters) parts.push(`topic seeds=${starters}`);
  return parts.join("; ");
}

function addCoffeeGroupNameRelevanceTerm(
  relevance: CoffeeGroupNameRelevance,
  botTerms: Set<string>,
  term: string,
  weight: number
): void {
  const normalized = term.toLowerCase().replace(/[^a-z0-9'-]/gi, "").trim();
  if (normalized.length < 3) return;
  if (COFFEE_GROUP_NAME_RELEVANCE_STOPWORDS.has(normalized)) return;
  relevance.terms.set(normalized, Math.max(relevance.terms.get(normalized) ?? 0, weight));
  botTerms.add(normalized);
}

function addCoffeeGroupNameRelevanceFromText(
  relevance: CoffeeGroupNameRelevance,
  botTerms: Set<string>,
  text: string,
  weight: number
): void {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return;
  const tokens = normalizedText.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? [];
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (COFFEE_GROUP_NAME_GENERIC_WORDS.has(token)) continue;
    addCoffeeGroupNameRelevanceTerm(relevance, botTerms, token, weight);
  }
  for (const rule of COFFEE_GROUP_NAME_THEME_RULES) {
    if (!rule.pattern.test(normalizedText)) continue;
    for (const term of rule.terms) {
      addCoffeeGroupNameRelevanceTerm(relevance, botTerms, term, rule.weight);
    }
  }
}

function collectCoffeeGroupNameRelevance(group: CoffeeBotProfile[]): CoffeeGroupNameRelevance {
  const relevance: CoffeeGroupNameRelevance = { terms: new Map(), botTerms: [] };
  for (const bot of group) {
    const botTerms = new Set<string>();
    relevance.botTerms.push(botTerms);
    addCoffeeGroupNameRelevanceFromText(relevance, botTerms, bot.name, 4);
    const { fields } = parseStoredBotPrompt(bot.systemPrompt);
    const profileTexts = [
      fields.identity.role,
      fields.purpose.statement,
      fields.core.interests,
      fields.core.traits,
      fields.core.boundaries,
      fields.worldview.values,
    ];
    for (const text of profileTexts) {
      addCoffeeGroupNameRelevanceFromText(relevance, botTerms, text, 6);
    }
    const fallbackPersona = summarizePersonaForRouter(bot.systemPrompt).replace(/^"|"$/g, "");
    addCoffeeGroupNameRelevanceFromText(relevance, botTerms, fallbackPersona, 4);
    for (const facetText of coffeeBotFacetTexts(bot)) {
      addCoffeeGroupNameRelevanceFromText(relevance, botTerms, facetText, 8);
    }
  }
  return relevance;
}

function scoreCoffeeGroupNameRelevance(
  name: string,
  relevance: CoffeeGroupNameRelevance
): CoffeeGroupNameCandidateScore {
  const normalized = name.toLowerCase();
  let relevanceScore = 0;
  let matchedBotCount = 0;
  for (const [term, weight] of relevance.terms) {
    if (normalized.includes(term)) relevanceScore += weight;
  }
  for (const botTerms of relevance.botTerms) {
    let matched = false;
    for (const term of botTerms) {
      if (normalized.includes(term)) {
        matched = true;
        break;
      }
    }
    if (matched) matchedBotCount += 1;
  }
  if (matchedBotCount >= 2) relevanceScore += 8;
  else if (matchedBotCount === 1) relevanceScore += 2;
  return {
    relevanceScore,
    score: relevanceScore,
  };
}

function coffeeNameLooksPlaceholder(name: string): boolean {
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return true;
  if (/^(coffee|brew|group|table|club|circle)$/i.test(normalized)) return true;
  if (/^(coffee|brew)\s+(club|group|circle|table)$/i.test(normalized)) return true;
  if (/^(the\s+)?(coffee|brew)\s+(crew|squad|collective)$/i.test(normalized)) return true;
  return false;
}

function scoreCoffeeGroupNameCandidate(
  name: string,
  group: CoffeeBotProfile[],
  relevance: CoffeeGroupNameRelevance
): CoffeeGroupNameCandidateScore {
  if (coffeeLooksLikeParticipantListName(name, group)) return { score: -100, relevanceScore: 0 };
  if (coffeeNameLooksPlaceholder(name)) return { score: -20, relevanceScore: 0 };
  const base = scoreCoffeeGroupNameRelevance(name, relevance);
  let score = base.score;
  if (coffeeGroupHasWizardingWorldSignal(group) && !coffeeNameHasWizardingWorldAnchor(name)) score -= 32;
  if (base.relevanceScore < COFFEE_GROUP_NAME_MIN_RELEVANCE_SCORE) score -= 24;
  if (name.split(/\s+/).length <= 4) score += 2;
  if (/[^a-z0-9\s'-]/i.test(name)) score += 1;
  return { score, relevanceScore: base.relevanceScore };
}

function normalizeCoffeePromptSnippet(raw: string, maxChars: number): string {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function compactCoffeeTopicHint(raw: string): string {
  const firstClause = raw
    .replace(/\s+/g, " ")
    .split(/[.?!;:]/, 1)[0]
    ?.trim() ?? "";
  if (!firstClause) return "";
  const words = firstClause.match(/[\p{L}\p{N}'-]+/gu) ?? [];
  if (words.length === 0) return "";
  return normalizeCoffeePromptSnippet(
    words.slice(0, COFFEE_TOPIC_HINT_MAX_WORDS).join(" "),
    COFFEE_TOPIC_HINT_MAX_CHARS
  );
}

function normalizeCoffeeStarterMemoryHint(raw: string): string {
  return normalizeCoffeePromptSnippet(raw, COFFEE_STARTER_MEMORY_HINT_MAX_CHARS)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
    .trim();
}

function collectCoffeeBotTopicHints(bot: CoffeeBotProfile): string[] {
  const { fields } = parseStoredBotPrompt(bot.systemPrompt);
  const candidates = [
    fields.core.interests,
    fields.worldview.values,
    fields.purpose.statement,
    fields.core.traits,
    fields.identity.role,
  ];
  const unique = new Set<string>();
  for (const candidate of candidates) {
    const normalized = compactCoffeeTopicHint(candidate);
    if (normalized) unique.add(normalized);
  }
  if (unique.size === 0) {
    const fallbackPersona = summarizePersonaForRouter(bot.systemPrompt).replace(/^"|"$/g, "");
    const normalized = compactCoffeeTopicHint(fallbackPersona);
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function hashCoffeeNameSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildDeterministicCoffeeGroupName(group: CoffeeBotProfile[]): string {
  const namesJoined = group.map((bot) => bot.name.toLowerCase()).join(" ");
  if (
    /\bspongebob\b/.test(namesJoined) ||
    /\bpatrick\b/.test(namesJoined) ||
    /\bsquidward\b/.test(namesJoined) ||
    /\bkrabs\b/.test(namesJoined) ||
    /\bplankton\b/.test(namesJoined) ||
    /\bsandy\b/.test(namesJoined) ||
    /\bgary\b/.test(namesJoined)
  ) {
    const themed = [
      "Bikini Bean Bottom",
      "Krusty Koffee Klub",
      "Pineapple Pour-liament",
      "Jellyfish Java Council",
    ] as const;
    return themed[hashCoffeeNameSeed(namesJoined) % themed.length]!;
  }
  const hints = group
    .flatMap((bot) => [
      ...collectCoffeeBotTopicHints(bot),
      ...coffeeBotFacetTexts(bot),
    ])
    .join(" ")
    .toLowerCase();
  const seed = group.map((bot) => bot.name).join("|") || hints || "coffee";
  const pick = (options: readonly string[]): string => options[hashCoffeeNameSeed(seed) % options.length]!;
  const hasWizarding = coffeeGroupHasWizardingWorldSignal(group) ||
    /\b(harry\s+potter|potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical)\b/.test(hints);
  const hasPhilosophy = /\b(philosoph|socratic|stoic|ethic|wisdom|metaphysic|logic|reason)\b/.test(hints);
  const hasPower = /\b(power|empire|command|control|strategy|strength|order|authority)\b/.test(hints);
  const hasMercy = /\b(compassion|forgive|forgiveness|mercy|grace|spirit|faith|hope|love|kindness)\b/.test(hints);
  const hasEngineering = /\b(engineer|debug|code|system|build|logic)\b/.test(hints);
  const hasFood = /\b(chef|cook|food|kitchen|recipe|restaurant|menu|diner|meal)\b/.test(hints);
  if (hasWizarding) {
    return pick([
      "Gryffindor Grounds",
      "Hogwarts Common Roast",
      "Wands and Wisdom",
      "Transfiguration Table",
    ]);
  }
  if (hasPower && hasMercy) {
    return pick([
      "Mercy Meets Empire",
      "Power and Pardon",
      "Grace Against Command",
      "The Mercy Doctrine",
    ]);
  }
  if (hasPhilosophy && hasFood) {
    return pick([
      "Socratic Soup Club",
      "Kitchen Table Logic",
      "The Reasonable Recipe",
      "Dialectic Diner",
    ]);
  }
  if (hasPhilosophy) {
    return pick([
      "Philosophicoffee",
      "Socratic Sips",
      "Idea Roast Society",
      "The Smart Guys",
    ]);
  }
  if (hasPower) {
    return pick([
      "Power Pour Society",
      "Dark Roast Doctrine",
      "Command and Caffeine",
      "The Authority Blend",
    ]);
  }
  if (hasMercy) {
    return pick([
      "Grace Grounds",
      "Mercy Mocha Circle",
      "Kindness Over Coffee",
      "Soulful Sips Society",
    ]);
  }
  if (hasEngineering) {
    return pick([
      "Smart Beans",
      "Debug and Decaf",
      "The Build Brew",
      "Systems and Sips",
    ]);
  }
  return pick([
    "Smart Beans",
    "The Roast Council",
    "Brewed Banter Club",
    "Caffeine and Characters",
  ]);
}

function formatCoffeeBotContextSummary(bot: CoffeeBotProfile): string {
  const { fields } = parseStoredBotPrompt(bot.systemPrompt);
  const summaryParts: string[] = [];
  const role = normalizeCoffeePromptSnippet(fields.identity.role, 40);
  const purpose = compactCoffeeTopicHint(fields.purpose.statement);
  const interests = compactCoffeeTopicHint(fields.core.interests);
  const traits = compactCoffeeTopicHint(fields.core.traits);
  const values = compactCoffeeTopicHint(fields.worldview.values);
  const boundaries = compactCoffeeTopicHint(fields.core.boundaries);
  if (role) summaryParts.push(`role=${role}`);
  if (purpose) summaryParts.push(`purpose=${purpose}`);
  if (interests) summaryParts.push(`interests=${interests}`);
  if (traits) summaryParts.push(`traits=${traits}`);
  if (values) summaryParts.push(`values=${values}`);
  if (boundaries) summaryParts.push(`boundaries=${boundaries}`);
  if (summaryParts.length === 0) {
    const fallbackPersona = summarizePersonaForRouter(bot.systemPrompt).replace(/^"|"$/g, "");
    if (fallbackPersona) summaryParts.push(`persona=${fallbackPersona}`);
  }
  const facetSummary = formatCoffeeBotFacetSummary(bot);
  if (facetSummary) summaryParts.push(`facets=${facetSummary}`);
  return summaryParts.join("; ");
}

export function loadCoffeeStarterMemoryContext(args: {
  db: DatabaseSync;
  userId: string;
  userKey?: Buffer | null;
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[];
  memoriesPerBot?: number;
}): CoffeeStarterMemoryContextEntry[] {
  const { db, userId, userKey, group } = args;
  if (!userKey) return [];
  const limit = Math.max(1, Math.min(8, args.memoriesPerBot ?? COFFEE_STARTER_MEMORY_MAX_PER_BOT));
  const context: CoffeeStarterMemoryContextEntry[] = [];
  for (const bot of group) {
    const seen = new Set<string>();
    let memories: string[] = [];
    try {
      memories = retrieveRecentBotMemoriesForStarter(
        db,
        userId,
        userKey,
        bot.id,
        COFFEE_STARTER_MEMORY_LOOKBACK_PER_BOT
      )
        .filter((memory) => memory.botId === bot.id && memory.source !== "about_you")
        .map((memory) => normalizeCoffeeStarterMemoryHint(memory.text))
        .filter((memory) => {
          if (!memory) return false;
          const key = memory.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit);
    } catch {
      memories = [];
    }
    if (memories.length > 0) {
      context.push({ botId: bot.id, botName: bot.name, memories });
    }
  }
  return context;
}

function formatCoffeeStarterMemoryContext(
  memoryContext: readonly CoffeeStarterMemoryContextEntry[] | undefined
): string[] {
  const active = (memoryContext ?? []).filter((entry) => entry.memories.length > 0);
  if (active.length === 0) {
    return ["Attending bot memory hints: none available; use bot profiles and session tuning."];
  }
  const lines = ["Attending bot memory hints (recent, bot-scoped):"];
  for (const entry of active) {
    lines.push(`- ${entry.botName}: ${entry.memories.join(" / ")}`);
  }
  return lines;
}

function formatCoffeeStarterFacetContext(group: CoffeeBotProfile[]): string[] {
  const lines = ["Hidden bot facets (cached semantic ingredients):"];
  for (const bot of group) {
    const summary = formatCoffeeBotFacetSummary(bot);
    if (summary) lines.push(`- ${bot.name}: ${summary}`);
  }
  return lines.length > 1 ? lines : ["Hidden bot facets: deterministic fallback only."];
}

export async function inferCoffeeGroupName(args: {
  provider: LlmProvider;
  group: CoffeeBotProfile[];
  fallbackName: string;
}): Promise<string> {
  const { provider, group, fallbackName } = args;
  const deterministicFallback = buildDeterministicCoffeeGroupName(group);
  const relevance = collectCoffeeGroupNameRelevance(group);
  const botLines = group.map((bot) => {
    const contextSummary = formatCoffeeBotContextSummary(bot);
    return `- ${bot.name}${contextSummary ? ` — ${contextSummary}` : ""}`;
  });
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You create short, tongue-in-cheek names for a Coffee Mode bot group. Reply with JSON only and no extra text.",
    },
    {
      role: "user",
      content: [
        "Name this group using the seated bots below.",
        "Keep it warm, playful, and human-readable. Be witty and creative.",
        "Max 1-4 words and avoid long participant lists.",
        "Do NOT list participant names or output titles like 'Coffee with ...'.",
        "Every candidate must include a recognizable role, value, interest, canon detail, or tension from these specific bots.",
        "Avoid generic names like 'Coffee Group', 'Brew Circle', or 'The Coffee Crew'.",
        'Examples of good style: "Philosophicoffee", "Smart Beans", "The Smart Guys".',
        "Seated bots:",
        ...botLines,
        "",
        'Respond with compact JSON exactly in this shape: {"names":["...","...","...","...","...","..."]}',
        "Include exactly 6 candidate names.",
      ].join("\n"),
    },
  ];
  for (let attempt = 0; attempt < COFFEE_GROUP_NAME_INFER_ATTEMPTS; attempt += 1) {
    try {
      const raw = await provider.generateResponse(messages, {
        temperature: COFFEE_GROUP_NAME_INFER_TEMPERATURE + attempt * 0.12,
        maxTokens: COFFEE_GROUP_NAME_INFER_MAX_TOKENS,
      });
      const candidates = parseCoffeeGroupNameCandidatesPayload(raw);
      if (candidates.length === 0) continue;
      const ranked = candidates
        .map((candidate) => ({
          candidate,
          ...scoreCoffeeGroupNameCandidate(candidate, group, relevance),
        }))
        .sort((a, b) => b.score - a.score);
      const winner = ranked[0];
      if (winner && winner.score >= 0 && winner.relevanceScore >= COFFEE_GROUP_NAME_MIN_RELEVANCE_SCORE) {
        return normalizeCoffeeGroupName(winner.candidate, fallbackName);
      }
      const parsedSingle = parseCoffeeGroupNamePayload(raw);
      const parsedScore = parsedSingle
        ? scoreCoffeeGroupNameCandidate(parsedSingle, group, relevance)
        : null;
      if (
        parsedSingle &&
        !coffeeLooksLikeParticipantListName(parsedSingle, group) &&
        !coffeeNameLooksPlaceholder(parsedSingle) &&
        parsedScore &&
        parsedScore.score >= 0 &&
        parsedScore.relevanceScore >= COFFEE_GROUP_NAME_MIN_RELEVANCE_SCORE
      ) {
        return normalizeCoffeeGroupName(parsedSingle, fallbackName);
      }
    } catch {
      // Non-fatal retry; fallback below if all attempts fail.
    }
  }
  return normalizeCoffeeGroupName(deterministicFallback, fallbackName);
}

function buildDeterministicCoffeeStarterTopics(
  group: CoffeeBotProfile[],
  sessionSettings: CoffeeSessionSettings,
  memoryContext: readonly CoffeeStarterMemoryContextEntry[] = []
): string[] {
  const hints = [
    ...group.flatMap((bot) => collectCoffeeBotTopicHints(bot)),
    ...coffeeGroupFacetTexts(group),
    ...memoryContext.flatMap((entry) => entry.memories),
  ]
    .join(" ")
    .toLowerCase();
  const hasWizarding = /\b(harry\s+potter|potter|mcgonagall|mcgonnigal|hogwarts|gryffindor|slytherin|ravenclaw|hufflepuff|quidditch|transfiguration|dumbledore|wizard|witch|wand|spell|magic|magical)\b/u.test(hints);
  const hasSpongeBob = /\b(spongebob|squarepants|patrick|squidward|krabs|plankton|sandy|gary|krabby|patty|jellyfish|pineapple|bikini\s+bottom|krusty\s+krab)\b/u.test(hints);
  const hasPowerAndMercy =
    /\b(power|empire|command|control|strategy)\b/u.test(hints) &&
    /\b(compassion|forgive|forgiveness|mercy|grace|love|service)\b/u.test(hints);
  const fallback =
    hasWizarding
      ? [
          "When rules protect people",
          "The burden of being chosen",
          "Courage under supervision",
        ]
      : hasSpongeBob
      ? [
          "Krusty Krab closing shift",
          "Jellyfish Fields after work",
          "Bikini Bottom rumor mill",
        ]
      : hasPowerAndMercy
      ? [
          "Power without cruelty",
          "Duty versus forgiveness",
          "When mercy has limits",
        ]
      : /\b(philosoph|stoic|ethic|wisdom|metaphysic|logic|reason|free will)\b/u.test(hints)
        ? [
            "Is free will an illusion?",
            "The cost of being right",
            "A rule worth breaking",
          ]
        : /\b(engineer|debug|code|system|build|logic)\b/u.test(hints)
          ? [
              "When systems fight back",
              "The cost of clean logic",
              "A bug worth keeping",
            ]
          : /\b(art|artist|story|music|beauty|style|design|performance)\b/u.test(hints)
            ? [
                "What art owes truth",
                "A beautiful lie",
                "When style becomes substance",
              ]
            : /\b(money|profit|business|restaurant|secret|protect)\b/u.test(hints)
              ? [
                  "What loyalty costs",
                  "A secret worth protecting",
                  "When profit needs mercy",
                ]
              : sessionSettings.tableEnergy === "afterparty"
                ? [
                    "The argument nobody will drop",
                    "A rule worth breaking",
                    "When kindness backfires",
                  ]
                : sessionSettings.tableEnergy === "theatre"
                ? [
                    "The cost of being right",
                    "A rule worth breaking",
                    "When kindness backfires",
                  ]
                : sessionSettings.tableEnergy === "still"
                  ? [
                      "What silence protects",
                      "The cost of being right",
                      "A truth worth keeping",
                    ]
                  : [
                      "The cost of being right",
                      "When kindness backfires",
                      "A rule worth breaking",
                    ];
  const facetTopics = coffeeFacetStarterTopicCandidates(group);
  const topicCandidates = hasWizarding || (hasPowerAndMercy && !hasSpongeBob)
    ? [
        ...fallback.map((label) => ({ label })),
        ...facetTopics.map((label) => ({ label })),
      ]
    : [
        ...facetTopics.map((label) => ({ label })),
        ...fallback.map((label) => ({ label })),
      ];
  return selectCoffeeStarterTopicLabels(
    topicCandidates,
    group
  );
}

function completeCoffeeStarterTopics(
  parsedTopics: readonly string[],
  group: CoffeeBotProfile[],
  sessionSettings: CoffeeSessionSettings,
  memoryContext: readonly CoffeeStarterMemoryContextEntry[] = []
): string[] {
  if (coffeeGroupHasCanonFacetSignal(group)) {
    const contextTokens = coffeeStarterTopicRelevanceTokens([
      ...group.flatMap((bot) => collectCoffeeBotTopicHints(bot)),
      ...coffeeGroupFacetTexts(group),
      ...memoryContext.flatMap((entry) => entry.memories),
    ]);
    const parsedWithRelevance = parsedTopics.map((label) => ({
      label,
      score: coffeeStarterTopicGroupRelevanceScore(label, contextTokens),
    }));
    const relevantParsed = parsedWithRelevance
      .filter((topic) => topic.score > 0)
      .map(({ label }) => ({ label }));
    const weakParsed = parsedWithRelevance
      .filter((topic) => topic.score <= 0)
      .map(({ label }) => ({ label }));
    return selectCoffeeStarterTopicLabels(
      [
        ...relevantParsed,
        ...coffeeFacetStarterTopicCandidates(group).map((label) => ({ label })),
        ...buildDeterministicCoffeeStarterTopics(group, sessionSettings, memoryContext).map((label) => ({ label })),
        ...weakParsed,
        { label: "The cost of being right" },
        { label: "When kindness backfires" },
        { label: "A rule worth breaking" },
      ],
      group
    ).slice(0, 3);
  }

  return selectCoffeeStarterTopicLabels(
    [
      ...parsedTopics.map((label) => ({ label })),
      ...buildDeterministicCoffeeStarterTopics(group, sessionSettings, memoryContext).map((label) => ({ label })),
      { label: "The cost of being right" },
      { label: "When kindness backfires" },
      { label: "A rule worth breaking" },
    ],
    group
  ).slice(0, 3);
}

function coffeeGroupStarterTopicBotKey(
  item: Record<string, unknown>,
  group: readonly Pick<CoffeeBotProfile, "id" | "name">[]
): string | null {
  const rawId =
    typeof item.botId === "string"
      ? item.botId
      : typeof item.id === "string"
        ? item.id
        : typeof item.bot_id === "string"
          ? item.bot_id
          : "";
  const trimmedId = rawId.trim();
  if (trimmedId && group.some((bot) => bot.id === trimmedId)) return trimmedId;
  const rawName = typeof item.botName === "string"
    ? item.botName
    : typeof item.name === "string"
      ? item.name
      : "";
  const normalizedName = rawName.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedName) return null;
  return group.find((bot) => bot.name.trim().toLowerCase() === normalizedName)?.id ?? null;
}

function parseCoffeeGroupStarterTopicsPayload(
  raw: string,
  group: CoffeeBotProfile[]
): CoffeeGroupStarterTopicsByBotId {
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) {
    candidates.push(fenceMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const byId: Record<string, unknown> = {};
      const keyed =
        record.topicsByBotId ??
        record.starterTopicsByBotId ??
        record.botTopics ??
        record.topicsByBot;
      if (keyed && typeof keyed === "object" && !Array.isArray(keyed)) {
        for (const [botId, topics] of Object.entries(keyed as Record<string, unknown>)) {
          byId[botId] = topics;
        }
      }
      const botRows = record.bots ?? record.botTopics;
      if (Array.isArray(botRows)) {
        for (const row of botRows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) continue;
          const rowRecord = row as Record<string, unknown>;
          const botId = coffeeGroupStarterTopicBotKey(rowRecord, group);
          if (!botId) continue;
          byId[botId] = rowRecord.topics ?? rowRecord.starterTopics ?? rowRecord.candidates;
        }
      }
      const flatTopics = record.topics ?? record.candidates;
      if (Array.isArray(flatTopics)) {
        for (const row of flatTopics) {
          if (!row || typeof row !== "object" || Array.isArray(row)) continue;
          const rowRecord = row as Record<string, unknown>;
          const botId = coffeeGroupStarterTopicBotKey(rowRecord, group);
          if (!botId) continue;
          const existing = Array.isArray(byId[botId]) ? byId[botId] as unknown[] : [];
          byId[botId] = [
            ...existing,
            rowRecord.label ?? rowRecord.topic ?? rowRecord.title ?? row,
          ];
        }
      }
      const normalized = normalizeCoffeeGroupStarterTopicsByBotId(byId, group);
      if (Object.keys(normalized).length > 0) return normalized;
    } catch {
      // Try next candidate.
    }
  }
  return {};
}

function completeCoffeeGroupStarterTopics(
  parsedTopicsByBotId: CoffeeGroupStarterTopicsByBotId,
  group: CoffeeBotProfile[],
  sessionSettings: CoffeeSessionSettings
): CoffeeGroupStarterTopicsByBotId {
  const fallback = buildDeterministicCoffeeGroupStarterTopics(group, sessionSettings);
  const completed: CoffeeGroupStarterTopicsByBotId = {};
  for (const bot of group) {
    const parsed = parsedTopicsByBotId[bot.id] ?? [];
    const topics = selectCoffeeStarterTopicLabels(
      [
        ...parsed.map((label) => ({ label })),
        ...(fallback[bot.id] ?? []).map((label) => ({ label })),
      ],
      group,
      COFFEE_GROUP_STARTER_TOPICS_PER_BOT
    );
    if (topics.length > 0) {
      completed[bot.id] = topics.slice(0, COFFEE_GROUP_STARTER_TOPICS_PER_BOT);
    }
  }
  return completed;
}

function buildKnownPersonaCoffeeStarterTopics(bot: CoffeeBotProfile): string[] {
  const name = bot.name.toLowerCase();
  const hints = collectCoffeeBotTopicHints(bot).join(" ").toLowerCase();
  if (/\bepictetus\b/u.test(name)) {
    return ["Freedom inside constraint", "The discipline of desire", "Choosing your chains"];
  }
  if (/\bmarcus\s+aurelius\b/u.test(name)) {
    return ["Power under self-command", "A ruler's private doubts", "Duty after exhaustion"];
  }
  if (/\bsocrates\b/u.test(name)) {
    return ["The courage to question", "Ignorance as a compass", "When certainty becomes arrogance"];
  }
  if (/\bplato\b/u.test(name)) {
    return ["Shadows mistaken for truth", "Justice outside the cave", "The ideal versus the real"];
  }
  if (/\baristotle\b/u.test(name)) {
    return ["Virtue as practiced habit", "Friendship and the good life", "When moderation fails"];
  }
  if (/\bspongebob|squarepants\b/u.test(name) || /\bfry cook|krusty krab|optimism\b/u.test(hints)) {
    return ["Relentless optimism on shift", "A spatula worth defending", "Kindness before competence"];
  }
  if (/\bpatrick\b/u.test(name) || /\bunder a rock|simple wisdom\b/u.test(hints)) {
    return ["Simple wisdom under pressure", "Being wrong with confidence", "Friendship without strategy"];
  }
  if (/\bsquidward\b/u.test(name) || /\bclarinet|artist|cashier\b/u.test(hints)) {
    return ["Art versus customer service", "The dignity of irritation", "Beauty after closing time"];
  }
  if (/\bkrabs\b/u.test(name) || /\bprofit|restaurant|secret formula\b/u.test(hints)) {
    return ["Profit with a conscience", "A secret worth protecting", "Loyalty on the ledger"];
  }
  return [];
}

function buildDeterministicCoffeeStarterTopicsForBot(
  bot: CoffeeBotProfile,
  sessionSettings: CoffeeSessionSettings
): string[] {
  const candidates = [
    ...coffeeFacetStarterTopicCandidates([bot]),
    ...buildKnownPersonaCoffeeStarterTopics(bot),
    ...buildDeterministicCoffeeStarterTopics([bot], sessionSettings),
    "The cost of being right",
    "When kindness backfires",
    "A rule worth breaking",
  ];
  return selectCoffeeStarterTopicLabels(
    candidates.map((label) => ({ label })),
    [bot],
    COFFEE_GROUP_STARTER_TOPICS_PER_BOT
  ).slice(0, COFFEE_GROUP_STARTER_TOPICS_PER_BOT);
}

function buildDeterministicCoffeeGroupStarterTopics(
  group: CoffeeBotProfile[],
  sessionSettings: CoffeeSessionSettings
): CoffeeGroupStarterTopicsByBotId {
  const out: CoffeeGroupStarterTopicsByBotId = {};
  for (const bot of group) {
    const topics = buildDeterministicCoffeeStarterTopicsForBot(bot, sessionSettings);
    if (topics.length > 0) out[bot.id] = topics;
  }
  return out;
}

export async function inferCoffeeGroupStarterTopics(args: {
  provider: LlmProvider;
  group: CoffeeBotProfile[];
  sessionSettings: CoffeeSessionSettings;
}): Promise<CoffeeGroupStarterTopicsByBotId> {
  const { provider, group, sessionSettings } = args;
  const botLines = group.map((bot) => {
    const contextSummary = formatCoffeeBotContextSummary(bot);
    return `- botId=${bot.id}; name=${bot.name}${contextSummary ? `; ${contextSummary}` : ""}`;
  });
  const settingsLine = JSON.stringify({
    responseLength: sessionSettings.responseLength,
    tableEnergy: sessionSettings.tableEnergy,
    crossTalk: sessionSettings.crossTalk,
    stayOnThread: sessionSettings.stayOnThread,
  });
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You generate short stored Coffee Mode starter topics for each seated bot. Reply with JSON only — no prose, no markdown outside JSON.",
    },
    {
      role: "user",
      content: [
        `Coffee group tuning (JSON): ${settingsLine}`,
        "Seated bots:",
        ...botLines,
        "",
        ...formatCoffeeStarterFacetContext(group),
        "",
        'Respond with compact JSON exactly in this shape: {"bots":[{"botId":"...","topics":[{"label":"..."},{"label":"..."},{"label":"..."},{"label":"..."}]}]}',
        `Include exactly ${COFFEE_GROUP_STARTER_TOPICS_PER_BOT} topic objects per botId.`,
        "Each label is a TOPIC THE TABLE CAN EXPLORE together, but it should be especially grounded in that bot's persona, role, values, interests, canon details, or productive tensions.",
        "Each label must be 2-8 words, concrete, safe, single-line UTF-8; no numbering or prefixes inside strings.",
        "Avoid making every topic generic philosophy. Different bots should produce visibly different angles.",
        "Do not usually name participants in labels; capture the underlying idea instead.",
        "Avoid generic filler like 'check-in', 'worth unpacking', or bland universal agreement phrasing.",
      ].join("\n"),
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: COFFEE_GROUP_STARTER_TOPIC_INFER_TEMPERATURE,
      maxTokens: COFFEE_GROUP_STARTER_TOPIC_INFER_MAX_TOKENS,
    });
    return completeCoffeeGroupStarterTopics(
      parseCoffeeGroupStarterTopicsPayload(raw, group),
      group,
      sessionSettings
    );
  } catch {
    return buildDeterministicCoffeeGroupStarterTopics(group, sessionSettings);
  }
}

function coffeeGroupStarterTopicsForSession(args: {
  group: CoffeeBotProfile[];
  starterTopicsByBotId?: CoffeeGroupStarterTopicsByBotId;
  sessionSettings: CoffeeSessionSettings;
}): string[] {
  const stored = args.starterTopicsByBotId ?? {};
  const hasStored = Object.values(stored).some((topics) => topics.length > 0);
  const topicsByBotId = hasStored
    ? completeCoffeeGroupStarterTopics(stored, args.group, args.sessionSettings)
    : buildDeterministicCoffeeGroupStarterTopics(args.group, args.sessionSettings);
  const candidates: CoffeeStarterTopicCandidate[] = [];
  for (const bot of args.group) {
    for (const label of topicsByBotId[bot.id] ?? []) {
      candidates.push({ label });
    }
  }
  return selectCoffeeStarterTopicLabels(candidates, args.group, COFFEE_GROUP_STARTER_TOPIC_MAX);
}

/**
 * Produce three short topic labels for the Coffee topic picker. Falls back to
 * deterministic copy when the auxiliary model is unavailable or mis-parses.
 */
export async function inferCoffeeStarterTopics(args: {
  provider: LlmProvider;
  group: CoffeeBotProfile[];
  sessionSettings: CoffeeSessionSettings;
  presetLabel?: string | null;
  memoryContext?: readonly CoffeeStarterMemoryContextEntry[];
  attendanceContext?: CoffeeAttendanceContext | null;
}): Promise<string[]> {
  const { provider, group, sessionSettings, presetLabel, memoryContext, attendanceContext } = args;
  const botLines = group.map((bot) => {
    const contextSummary = formatCoffeeBotContextSummary(bot);
    return `- ${bot.name}${contextSummary ? ` — ${contextSummary}` : ""}`;
  });
  const presetLine =
    typeof presetLabel === "string" && presetLabel.trim().length > 0
      ? `Session preset / tone label: "${presetLabel.trim()}".`
      : "No named preset — infer tone only from Coffee session settings below.";
  const settingsLine = JSON.stringify({
    responseLength: sessionSettings.responseLength,
    tableEnergy: sessionSettings.tableEnergy,
    crossTalk: sessionSettings.crossTalk,
    stayOnThread: sessionSettings.stayOnThread,
  });
  const messages: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You name short tabletop conversation topics for a multi-bot Coffee session UI. Reply with JSON only — no prose, no markdown outside JSON.",
    },
    {
      role: "user",
      content: [
        presetLine,
        `Coffee session tuning (JSON): ${settingsLine}`,
        "Seated bots:",
        ...botLines,
        "",
        ...formatCoffeeStarterFacetContext(group),
        "",
        ...formatCoffeeStarterMemoryContext(memoryContext),
        "",
        formatCoffeeAttendancePromptSummary(attendanceContext) ??
          "Coffee Group attendance context: no current or recent absences to note.",
        "",
        'Respond with compact JSON exactly in this shape: {"topics":[{"label":"...","kind":"reflective","rationale":"..."},{"label":"...","kind":"tension","rationale":"..."},{"label":"...","kind":"scenario","rationale":"..."}]}',
        "Include exactly three candidate objects in this order: reflective/shared curiosity, productive disagreement or tension, concrete dilemma/scenario.",
        "Each label is a TOPIC THE GROUP EXPLORES together (not a user quick-reply, not a question directed only at the player).",
        "Each label must be 2–8 words, concrete, safe, single-line UTF-8; no numbering or prefixes inside strings.",
        "Ground every topic in the seated bots' stated interests, values, purpose, roles, memories, or productive contrasts between them.",
        "Attendance can tint topic choice only when it creates a natural group dynamic; do not make all topics about who is away.",
        "When memory hints exist, treat them as first-class signal; prefer fresh labels inspired by recent memories, recurring interests, unresolved tensions, or contrasts between attendees.",
        "Do not quote memory text verbatim or make labels about memories.",
        "Do not usually name participants in labels; capture the underlying idea instead.",
        "Avoid generic filler like 'check-in', 'worth unpacking', or bland universal agreement phrasing.",
        "Example label shape only; do not reuse these verbatim: \"A formula worth guarding\", \"When certainty becomes arrogance\", \"Jellyfish Fields after work\", \"The quiet part of duty\".",
      ].join("\n"),
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: COFFEE_STARTER_TOPIC_INFER_TEMPERATURE,
      maxTokens: COFFEE_STARTER_TOPIC_INFER_MAX_TOKENS,
    });
    const parsed = parseCoffeeStarterTopicsPayload(raw, group);
    const topics = completeCoffeeStarterTopics(parsed, group, sessionSettings, memoryContext);
    if (topics.length === 3) return topics;
  } catch {
    // Non-fatal — deterministic fallback below.
  }
  return buildDeterministicCoffeeStarterTopics(group, sessionSettings, memoryContext);
}

function coffeeTranscriptContainsPrismBotMention(
  userMessage: string,
  history: readonly { content: string }[]
): boolean {
  if (userMessage.includes("prism-bot://")) return true;
  return history.some((m) => m.content.includes("prism-bot://"));
}

function coffeeSessionIsInWrapUpWindow(remainingMs: number | null | undefined): boolean {
  return (
    typeof remainingMs === "number" &&
    Number.isFinite(remainingMs) &&
    remainingMs >= 0 &&
    remainingMs <= COFFEE_WRAP_UP_REMAINING_MS
  );
}

function coffeeWrapUpSeconds(remainingMs: number | null | undefined): number {
  if (!coffeeSessionIsInWrapUpWindow(remainingMs)) return 0;
  return Math.max(1, Math.ceil((remainingMs ?? 0) / 1000));
}

function buildCoffeeWrapUpRouterAppendix(remainingMs: number | null | undefined): string[] {
  if (!coffeeSessionIsInWrapUpWindow(remainingMs)) return [];
  const seconds = coffeeWrapUpSeconds(remainingMs);
  return [
    "",
    `Session wrap-up window: about ${seconds}s remain.`,
    "Pick the bot whose personality can help the table land naturally. Prefer a closing thought, soft exit, final joke, small goodbye, or quiet gesture over starting a fresh tangent.",
  ];
}

function buildCoffeeWrapUpSpeakerAppendix(remainingMs: number | null | undefined): string[] {
  if (!coffeeSessionIsInWrapUpWindow(remainingMs)) return [];
  const seconds = coffeeWrapUpSeconds(remainingMs);
  return [
    "",
    `The Coffee Session is in its final moments (about ${seconds}s remain).`,
    "Let the conversation wind down organically, as if people at the table can feel it is time to leave or let the silence settle. Prefer a final thought, soft farewell, closing joke, small gesture, or satisfied pause. Do not start a new topic, ask a big new question, or explicitly mention a timer/countdown unless it would sound natural in character.",
  ];
}

/**
 * Mirror of the web client's `PRISM_BOT_MARKDOWN_LINK_RE` so the API can detect
 * existing prism-bot mention links when post-processing bot replies.
 */
const PRISM_BOT_MARKDOWN_LINK_RE =
  /\[((?:[^\]]|\\.)*)\]\s*\(\s*prism-bot:\/\/([^)\s]+)\s*\)/gi;

/** Router/speaker appendix only when table text includes prism-bot markdown links. */
const PRISM_BOT_MENTION_COFFEE_APPENDIX =
  "The user may @-mention bots with markdown like [Label](prism-bot://botId) (botId may be URL-encoded). Prefer the mentioned bot as the next speaker when that fits the table.";

const COFFEE_ORGANIC_SEED_LINES_BY_STYLE: Record<BotVoicePreset, readonly string[]> = {
  neutral: [
    "Fair point.",
    "Hmm. That gives me pause.",
    "I hadn't considered it quite that way.",
  ],
  warm: [
    "I hear you on that.",
    "That's a thoughtful way to put it.",
    "Yeah — that lands for me.",
  ],
  concise: ["Noted.", "True enough.", "Fair."],
  playful: [
    "I know, right?",
    "Wait, what was that you just said? Sorry, it went over my head.",
    "No offense, but this is boring.",
    "Honestly, that tracks.",
    "Okay, that's actually kind of wild.",
    "Huh. Didn't see that coming.",
  ],
  formal: [],
};

type CoffeeOrganicSeedProfile = {
  communicationStyle: BotVoicePreset;
  birthEra: "ad" | "bc";
  deceased: boolean;
  basedOnRealPersonOrCharacter: boolean;
};

function readCoffeeOrganicSeedProfile(
  speaker: Pick<CoffeeBotProfile, "systemPrompt">
): CoffeeOrganicSeedProfile {
  const { fields } = parseStoredBotPrompt(speaker.systemPrompt);
  return {
    communicationStyle: fields.core.communicationStyle,
    birthEra: fields.facts.birthEra === "bc" ? "bc" : "ad",
    deceased: fields.facts.deceased === true,
    basedOnRealPersonOrCharacter: fields.facts.basedOnRealPersonOrCharacter === true,
  };
}

/** True when post-processing may append a short transitional beat without breaking voice. */
export function coffeeSpeakerUsesOrganicSeeds(
  speaker: Pick<CoffeeBotProfile, "systemPrompt">
): boolean {
  const profile = readCoffeeOrganicSeedProfile(speaker);
  if (profile.communicationStyle === "formal") return false;
  if (profile.birthEra === "bc" || profile.deceased) return false;
  if (profile.basedOnRealPersonOrCharacter) return false;
  return true;
}

function coffeeOrganicSeedLinesForSpeaker(
  speaker: Pick<CoffeeBotProfile, "systemPrompt">
): readonly string[] {
  if (!coffeeSpeakerUsesOrganicSeeds(speaker)) return [];
  const profile = readCoffeeOrganicSeedProfile(speaker);
  return COFFEE_ORGANIC_SEED_LINES_BY_STYLE[profile.communicationStyle] ?? [];
}

function buildCoffeeTransitionalBeatPromptLine(speaker: CoffeeBotProfile): string {
  const profile = readCoffeeOrganicSeedProfile(speaker);
  if (!coffeeSpeakerUsesOrganicSeeds(speaker)) {
    return "Keep any transitional beats in your own voice and era. Do not slip into modern internet slang or casual asides that break your character.";
  }
  switch (profile.communicationStyle) {
    case "playful":
      return 'Occasionally use a short playful beat when natural for you (for example: "I know, right?" or "Okay, that\'s actually kind of wild."). Use sparingly.';
    case "warm":
      return 'Occasionally use a brief warm acknowledgment when natural (for example: "I hear you on that."). Use sparingly.';
    case "concise":
      return 'Occasionally use a very short acknowledgment when natural (for example: "Fair." or "Noted."). Use sparingly.';
    default:
      return "Occasionally use a brief natural reaction when it fits your voice. Use sparingly — never break character.";
  }
}

/** @internal Exported for unit tests — appends a persona-filtered transitional beat when eligible. */
export function applyCoffeeOrganicSeedToReply(args: {
  replyText: string;
  conversationId: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name" | "systemPrompt">;
  historyLength: number;
  turnKind: CoffeeTurnKind;
  avoidTexts: readonly string[];
}): string {
  const { replyText, conversationId, speaker, historyLength, turnKind, avoidTexts } = args;
  if (!replyText) return replyText;
  const pool = coffeeOrganicSeedLinesForSpeaker(speaker);
  if (pool.length === 0) return replyText;
  const seed = stableUnitValue(
    `${conversationId}:${speaker.id}:${historyLength}:${turnKind}:organic-seed`
  );
  if (seed > 0.3) return replyText;
  const startIndex =
    Math.floor(
      stableUnitValue(`${conversationId}:${speaker.id}:${historyLength}:organic-line`) *
        pool.length
    ) % pool.length;
  const avoid = new Set(avoidTexts.map(coffeeReplyRepeatKey).filter(Boolean));
  let picked = pool[startIndex] ?? pool[0]!;
  for (let offset = 0; offset < pool.length; offset += 1) {
    const candidate = pool[(startIndex + offset) % pool.length] ?? picked;
    if (!avoid.has(coffeeReplyRepeatKey(candidate))) {
      picked = candidate;
      break;
    }
  }
  if (seed <= 0.1) return picked;
  if (seed <= 0.2) return `${picked} ${replyText}`.trim();
  return `${replyText} ${picked}`.trim();
}

function maybeApplyCoffeeOrganicSeed(args: {
  replyText: string;
  conversationId: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name" | "systemPrompt">;
  historyLength: number;
  turnKind: CoffeeTurnKind;
  avoidTexts: readonly string[];
}): string {
  return applyCoffeeOrganicSeedToReply(args);
}

function decodeCoffeeMentionBotId(rawId: string): string | null {
  if (!rawId) return null;
  try {
    const decoded = decodeURIComponent(rawId).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    const trimmed = rawId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

export function extractLastAddressedBotId(args: {
  line: string;
  speakerBotId: string | null;
  seatedBotIds: ReadonlySet<string>;
}): string | null {
  const { line, speakerBotId, seatedBotIds } = args;
  if (!line) return null;
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  let lastMentionedBotId: string | null = null;
  for (const match of line.matchAll(re)) {
    const decoded = decodeCoffeeMentionBotId(match[2] ?? "");
    if (!decoded) continue;
    if (decoded === speakerBotId) continue;
    if (!seatedBotIds.has(decoded)) continue;
    lastMentionedBotId = decoded;
  }
  return lastMentionedBotId;
}

function parseBotPreferredAddressMemory(text: string): {
  targetName: string;
  preferredAddress: string;
} | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const match = normalized.match(
    /^([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*){0,3})\s+(?:prefers|wants)(?:\s+to)?\s+be\s+(?:called|referred\s+to\s+as)\s+(.+?)\.?$/u
  );
  if (!match?.[1] || !match[2]) return null;
  const targetName = match[1].trim();
  const preferredAddress = match[2].replace(/[.!?]+$/, "").trim();
  if (!targetName || !preferredAddress) return null;
  return { targetName, preferredAddress };
}

async function loadCoffeePeerAddressPreferences(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer | undefined;
  speakerBotId: string;
  peers: readonly { id: string; name: string }[];
}): Promise<Map<string, string>> {
  const { db, userId, userKey, speakerBotId, peers } = args;
  const byTargetName = new Map(
    peers.map((peer) => [peer.name.trim().toLocaleLowerCase(), peer.id] as const)
  );
  if (!userKey || byTargetName.size === 0) return new Map();
  const recent = retrieveRecentMemoriesForStarter(
    db,
    userId,
    userKey,
    speakerBotId,
    80
  );
  const byTargetBotId = new Map<string, string>();
  for (const memory of recent) {
    if (memory.category !== "bot_relation") continue;
    const parsed = parseBotPreferredAddressMemory(memory.text);
    if (!parsed) continue;
    const targetBotId = byTargetName.get(parsed.targetName.toLocaleLowerCase());
    if (!targetBotId || byTargetBotId.has(targetBotId)) continue;
    byTargetBotId.set(targetBotId, parsed.preferredAddress);
  }
  return byTargetBotId;
}

function maybeInjectAutonomousPeerAddress(args: {
  replyText: string;
  turnKind: CoffeeTurnKind;
  speaker: CoffeeBotProfile;
  latestAssistantBeforeTurn: ChatMessage | null;
  group: readonly CoffeeBotProfile[];
  peerAddressByBotId?: ReadonlyMap<string, string>;
}): string {
  const {
    replyText,
    turnKind,
    speaker,
    latestAssistantBeforeTurn,
    group,
    peerAddressByBotId,
  } = args;
  if (turnKind !== "autonomous") return replyText;
  if (group.length <= 2) return replyText;
  if (!latestAssistantBeforeTurn || latestAssistantBeforeTurn.role !== "assistant") return replyText;
  const priorSpeakerId = resolveAssistantSpeakerBotId(latestAssistantBeforeTurn, group);
  if (!priorSpeakerId || priorSpeakerId === speaker.id) return replyText;
  const priorSpeaker = group.find((bot) => bot.id === priorSpeakerId);
  if (!priorSpeaker) return replyText;
  const alreadyAddressesPeer =
    replyText.includes("prism-bot://") ||
    new RegExp(`\\b${escapeRegExp(priorSpeaker.name)}\\b`, "i").test(replyText);
  if (alreadyAddressesPeer) return replyText;
  // Keep direct-address chips occasional; frequent injected callouts create ping-pong loops.
  if (Math.random() > 0.18) return replyText;
  const mention = formatBotMentionMarkdownInline(priorSpeaker, peerAddressByBotId);
  return `${mention}, ${replyText}`.trim();
}

function resolveAssistantSpeakerBotId(
  message: ChatMessage,
  group: readonly CoffeeBotProfile[]
): string | null {
  const botName = typeof message.botName === "string" ? message.botName.trim() : "";
  if (!botName) return null;
  const match = group.find((bot) => bot.name.trim().toLowerCase() === botName.toLowerCase());
  return match?.id ?? null;
}

/**
 * Post-process a bot's reply to upgrade explicit `@Name` mentions into the
 * canonical `[Name](prism-bot://botId)` markdown link. Skips text that already
 * sits inside a prism-bot link, and only matches names that exactly correspond
 * to seated bots (case-insensitive). Plain bare-name references intentionally
 * stay as prose; the web renderer soft-colors them without creating a full
 * chip/tag.
 */
export function autoTagPeerMentionsInCoffeeReply(
  reply: string,
  speaker: { id: string; name: string },
  group: readonly { id: string; name: string }[],
  peerAddressByBotId?: ReadonlyMap<string, string>
): string {
  if (!reply || reply.length === 0) return reply;
  const peers = group.filter((bot) => bot.id !== speaker.id && bot.name.trim().length > 0);
  if (peers.length === 0) return reply;
  // Sort longest names first so e.g. "Patrick Star" wins over "Patrick".
  const sorted = [...peers].sort((a, b) => b.name.length - a.name.length);

  // Locate every existing prism-bot link span so we can avoid touching them.
  const lockedRanges: Array<[number, number]> = [];
  const lockRe = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  for (const match of reply.matchAll(lockRe)) {
    const start = match.index ?? 0;
    lockedRanges.push([start, start + match[0].length]);
  }
  const inLockedRange = (index: number): boolean =>
    lockedRanges.some(([from, to]) => index >= from && index < to);

  let out = reply;
  for (const peer of sorted) {
    const aliases = [
      peerAddressByBotId?.get(peer.id)?.trim() ?? "",
      peer.name.trim(),
    ].filter((name, index, all) => name.length > 0 && all.indexOf(name) === index);
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Explicit @, then exact name as a whole word.
      const pattern = new RegExp(`(?<![\\w\\-])@${escaped}(?![\\w\\-])`, "g");
      let cursor = 0;
      let assembled = "";
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(out)) !== null) {
        const start = m.index;
        const end = start + m[0].length;
        if (inLockedRange(start) || inLockedRange(end - 1)) {
          continue;
        }
        const replacement = formatBotMentionMarkdownInline(peer, peerAddressByBotId);
        assembled += out.slice(cursor, start) + replacement;
        cursor = end;
        // Re-tag this region as locked so subsequent peers don't re-process it.
        const newStart = assembled.length - replacement.length;
        lockedRanges.push([newStart, newStart + replacement.length]);
      }
      if (cursor > 0) {
        assembled += out.slice(cursor);
        out = assembled;
      }
    }
  }
  return out;
}

function preferredPeerLabel(
  bot: { id: string; name: string },
  peerAddressByBotId?: ReadonlyMap<string, string>
): string {
  const preferred = peerAddressByBotId?.get(bot.id)?.trim();
  return preferred && preferred.length > 0 ? preferred : bot.name;
}

function formatBotMentionMarkdownInline(
  bot: { id: string; name: string },
  peerAddressByBotId?: ReadonlyMap<string, string>
): string {
  const safeName = preferredPeerLabel(bot, peerAddressByBotId)
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]");
  return `[${safeName}](prism-bot://${encodeURIComponent(bot.id)})`;
}

/** Mirrors `formatBotMentionMarkdown` in apps/web — kept in sync by hand. */
function coffeeFormatBotMentionMarkdown(
  bot: { id: string; name: string },
  peerAddressByBotId?: ReadonlyMap<string, string>
): string {
  const label = preferredPeerLabel(bot, peerAddressByBotId)
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]");
  return `[${label}](prism-bot://${encodeURIComponent(bot.id)})`;
}

/**
 * Repairs the common LLM glitch of emitting a `[Name]` bracket without the
 * matching `(prism-bot://botId)` href. If the bracketed label exactly matches
 * a peer name at the table (case-insensitive), the function removes the
 * bracket wrapper and leaves the plain canonical name. The client will still
 * soft-color that name, but this avoids accidentally turning third-person
 * references into full tags/chips.
 * Brackets that don't match a known peer are left intact (they may be
 * meaningful prose to the bot's persona).
 */
export function repairBotMentionBrackets(
  raw: string,
  peers: readonly { id: string; name: string }[]
): string {
  if (!raw) return raw;
  const peerByLowerName = new Map<string, { id: string; name: string }>();
  for (const peer of peers) {
    if (!peer.id || !peer.name) continue;
    peerByLowerName.set(peer.name.toLowerCase(), peer);
  }
  if (peerByLowerName.size === 0) return raw;
  // Match `[label]` NOT followed by optional whitespace + `(` — i.e. orphan
  // brackets without an href. Fold a possessive suffix into the repaired name
  // so `[SpongeBob]'s` becomes `SpongeBob's`.
  return raw.replace(/\[((?:[^\]\n]|\\\])+)\](['’]s)?(?!\s*\()/g, (match, label, suffix = "") => {
    const cleanLabel = String(label).replace(/\\([\\\]])/g, "$1").trim();
    const peer = peerByLowerName.get(cleanLabel.toLowerCase());
    return peer ? `${peer.name}${suffix}` : match;
  });
}

/**
 * Peer-roster appendix that teaches the speaker how to chip-format a direct,
 * second-person address to another bot at the table.
 *
 * Goals (tuned after observing tag ping-pong on the live table):
 * - The chip format is a *rare* dramatic device, not a default opener.
 * - Third-person references stay as plain prose — the renderer auto-colors
 *   bot names in their identity color regardless, so plain references still
 *   read as recognizable callouts visually.
 * - The bot must use the verbatim markdown from the roster — never the
 *   `[Name]`-only bracket label (which produces a visible `[Name]` artifact
 *   on the table) and never an invented botId.
 */
function buildCoffeeSpeakerMentionRosterAppendix(
  peers: readonly { id: string; name: string }[],
  peerAddressByBotId?: ReadonlyMap<string, string>
): string | null {
  const usable = peers.filter((p) => p.id.trim().length > 0 && p.name.trim().length > 0);
  if (usable.length === 0) return null;
  const rosterLines = usable.map((p) => {
    const preferred = preferredPeerLabel(p, peerAddressByBotId);
    const hint = preferred !== p.name ? ` (prefer "${preferred}")` : "";
    return `- ${p.name}${hint} → ${coffeeFormatBotMentionMarkdown(p, peerAddressByBotId)}`;
  });
  return [
    "Direct-address chip format (use sparingly):",
    "Most of your lines should NOT call anyone out by name — react to the room, agree, disagree, pivot. Constant `[Name]`-style call-outs make the table feel like ping-pong and break the conversation flow.",
    "ONLY when you are speaking directly TO one specific bot at this table — second-person address, like \"Squidward, that's a stretch\" or \"Plankton, why?\" — wrap that name with the exact markdown below (it renders as a styled chip):",
    ...rosterLines,
    "Third-person references — describing another bot, agreeing with what they said, narrating about them — must stay as plain prose with no markdown around the name. The table will still render the name in their identity color automatically.",
    "Never write a `[Name]` bracket without the matching `(prism-bot://…)` href; orphan brackets show up as a visible glitch on the table. Never invent a botId; only copy from the roster above. Never chip-format your own name.",
  ].join("\n");
}

/**
 * Canonical stage-direction rule for Coffee replies. Bots come from many
 * model families with different roleplay habits (`*…*`, `[…]`, `(…)`,
 * `_…_`); this pins one shared format so the renderer can detect actions
 * uniformly and (in a future pass) lift them out of the table line into a
 * status indicator above the speaker's avatar.
 */
const COFFEE_STAGE_DIRECTION_APPENDIX = [
  "Stage-direction format:",
  "Coffee Mode is not Markdown-formatted chat. Do NOT use asterisks for emphasis in ordinary dialogue — write plain words instead (`the thought that counts`, not `the *thought* that counts`).",
  "Only use single asterisks for a complete non-verbal action, gesture, or aside (anything that isn't spoken dialogue), like `*tilts head*` or `*glances at the door*`. Do not put ordinary sentence words inside asterisks.",
  "If your turn has both action and speech, format it as `*action* Spoken line.` Never leave non-spoken narration unwrapped at the start/end of the line (for example: `Marcus picks up a cup and says...`).",
  "Asterisk-wrapped actions are presented separately from your spoken line, so keep them short, in third person, and self-contained. The bulk of your reply should still be one short spoken line in plain prose with no Markdown styling.",
  "Keep stage directions name-free and ambient (`*nods slowly*`, `*straightens napkin*`, `*winces*`). Do NOT name another bot inside a `*…*` block — directed asides like `*glares at Squidward*` aren't allowed; if you genuinely want to address someone, do it in spoken text instead.",
  "Do not put the user's name inside stage directions. If your spoken line answers another bot, keep the action aimed at the table or that same bot, not at the user.",
  "Match the speaker's actual body and props. Do not invent impossible anatomy or wardrobe in stage directions (for example, no beard-stroking for Mr. Krabs); use neutral table actions when unsure.",
  "The table may add ordinary cup ambience separately, so you only need to mention coffee when it carries meaning for your character or the moment. Do not default to sipping, drinking, pouring, stirring, or raising a mug; at most one small sip every several turns, and never in the same beat as spoken words. If you sip, make it a standalone action before or after speaking.",
  "It is okay to reply with ONLY a stage direction and no spoken line — silent gestures are a valid turn. When you do, the table won't expect a response, so don't tack on a question or invitation; just the gesture is enough.",
].join("\n");

/**
 * Build the router LLM prompt that picks the next speaker.
 *
 * The router is asked to emit a single-line JSON object with `botId`
 * (must match one of the group ids), `reason` (a short rationale), and
 * `directive` (a brief next-move cue for the chosen speaker).
 * We keep the schema tiny so even small local models can comply.
 */
export function buildRouterPrompt(args: {
  group: CoffeeBotProfile[];
  history: ChatMessage[];
  userMessage: string;
  userActionOnly?: boolean;
  lastSpeakerBotId: string | null;
  socialByBotId?: Record<string, CoffeeBotSocialSnapshot>;
  relationshipsBySource?: Record<string, Record<string, BotRelationshipSnapshot>>;
  turnKind?: CoffeeTurnKind;
  sessionKickoff?: boolean;
  sessionSettings?: CoffeeSessionSettings;
  /** When set, router should prefer speakers who can advance this shared subject. */
  coffeeTopic?: string | null;
  /** Optional closed opening-poll result, used to pick a speaker who can analyze it. */
  pollSummary?: string | null;
  /** Active in-session poll context while bots are still deliberating. */
  activePollContext?: string | null;
  /** Optional Coffee Teams state for team bias, persuasion, and switch beats. */
  coffeeTeams?: CoffeeTeamState | null;
  /** Optional rolling background summary used to reduce local echo loops. */
  meetingSummary?: string | null;
  /** Optional Coffee Group attendance context for current/recent absences. */
  attendanceContext?: CoffeeAttendanceContext | null;
  /** Optional router-provided per-turn direction to reduce local echo loops. */
  directorCue?: string | null;
  /** Client-side timer snapshot for natural session wrap-up prompting. */
  sessionRemainingMs?: number | null;
}): ProviderMessage[] {
  const {
    group,
    history,
    userMessage,
    userActionOnly = false,
    lastSpeakerBotId,
    socialByBotId = {},
    relationshipsBySource,
    turnKind = "user",
    sessionKickoff = false,
    sessionSettings,
    coffeeTopic,
    pollSummary,
    activePollContext,
    coffeeTeams,
    meetingSummary,
    attendanceContext,
    sessionRemainingMs,
  } = args;
  const settings = sessionSettings ?? normalizeCoffeeSessionSettings(undefined);
  const topicTrim = typeof coffeeTopic === "string" ? coffeeTopic.trim() : "";
  const topicAnchorLines: string[] =
    topicTrim.length > 0
      ? [
          "",
          `Shared session topic (stay near this unless the table naturally pivots): "${topicTrim}".`,
          "Prefer the next speaker who can add a fresh angle on this topic without repeating the same beat or flattening into generic agreement.",
        ]
      : [];
  const pollSummaryTrim = typeof pollSummary === "string" ? pollSummary.trim() : "";
  const pollLines =
    pollSummaryTrim.length > 0
      ? [
          "",
          `Opening poll result: ${pollSummaryTrim}`,
          "Prefer a speaker who can react to the poll result in-character, then help the table discuss what it means.",
        ]
      : [];
  const activePollContextTrim =
    typeof activePollContext === "string" ? activePollContext.trim() : "";
  const activePollLines =
    activePollContextTrim.length > 0
      ? [
          "",
          activePollContextTrim,
          "Prefer a speaker who can argue for their poll vote, respond to others' cases, or try to persuade the table.",
          "Avoid routing to generic table-management beats during a poll; the next speaker should add a concrete reason, doubt, joke, or contrast tied to one option.",
          "If the context lists a bot's current vote, prefer that bot only when it can develop that same stance or explicitly explain why the latest argument changed its mind.",
        ]
      : [];
  const coffeeTeamSummary = formatCoffeeTeamPromptSummary(coffeeTeams ?? null);
  const coffeeTeamLines = coffeeTeamSummary
    ? [
        "",
        coffeeTeamSummary,
        "Prefer a speaker who can advance the team social dynamic: defend a side, challenge a weak loyalty, or explain a pending move.",
      ]
    : [];
  const meetingSummaryTrim =
    typeof meetingSummary === "string" ? meetingSummary.trim() : "";
  const meetingSummaryLines =
    meetingSummaryTrim.length > 0
      ? [
          "",
          `Meeting summary so far: ${meetingSummaryTrim}`,
          "Use the summary to continue unresolved points, but prioritize the latest table line over stale summary wording.",
        ]
      : [];
  const attendanceSummary = formatCoffeeAttendancePromptSummary(attendanceContext);
  const attendanceLines = attendanceSummary ? ["", attendanceSummary] : [];
  const userActionOnlyLines =
    turnKind === "user" && userActionOnly
      ? [
          "",
          "Latest user input is a non-verbal table action, not spoken dialogue or a command.",
          "Do not treat it as an interruption by default. Prefer a next speaker who can answer with a small action beat, or speak only if the action clearly invites a spoken response.",
        ]
      : [];
  const relationshipPrompt = formatCoffeeRelationshipPromptSummary({
    group,
    relationshipsBySource,
  });
  const relationshipLines = relationshipPrompt ? ["", relationshipPrompt] : [];

  const personaLines = group.map((bot) => {
    const contextSummary = formatCoffeeBotContextSummary(bot);
    return `- id="${bot.id}" name="${bot.name}"${contextSummary ? ` context=${contextSummary}` : ""}`;
  });

  const recencyHint =
    settings.crossTalk === "rare"
      ? lastSpeakerBotId
        ? `The last bot to speak was id="${lastSpeakerBotId}". Prefer letting that line land before handing the mic elsewhere unless another bot is clearly a better fit.`
        : `No bot has spoken yet in this thread.`
      : settings.crossTalk === "pileup"
        ? lastSpeakerBotId
          ? `The last bot to speak was id="${lastSpeakerBotId}". Pile-up mode is active; fast interruptions, immediate rebuttals, and crowded banter are welcome when they sharpen the table.`
          : `No bot has spoken yet in this thread.`
      : settings.crossTalk === "chatty"
        ? lastSpeakerBotId
          ? `The last bot to speak was id="${lastSpeakerBotId}". Bot-to-bot banter is welcome; pick the same voice again if the riff should continue, or pass the mic when a fresh perspective helps.`
          : `No bot has spoken yet in this thread.`
        : lastSpeakerBotId
          ? `The last bot to speak was id="${lastSpeakerBotId}". Prefer variety unless the same bot is clearly the most natural next speaker.`
          : `No bot has spoken yet in this thread.`;
  const earlyThreadHint =
    history.length < 3
      ? relationshipPrompt
        ? "This table is still warming up. Bots may carry faint prior disposition from durable relationship reads, but should not recap hidden history or act like the visible transcript already established it."
        : "This table is still warming up. Bots know the visible names at the table, but should not imply prior friendship, shared memories, or deep familiarity unless the transcript establishes it."
      : relationshipPrompt
        ? "Use the visible transcript first. Durable relationship reads may tint speaker fit, but do not invent specific off-screen scenes between bots."
        : "Use only the visible transcript as shared history. Do not invent off-screen relationships between bots.";
  const kickoffRouterHint = sessionKickoff
    ? [
        "This is the very first line of a brand-new session.",
        "Pick the bot most likely to open the table naturally and set a welcoming first beat tied to the topic.",
        "Prefer an opener that sounds fresh and specific, not a callback to missing context.",
        "Avoid choosing a speaker whose likely first move is a hard-negative or inside-joke opener unless the topic clearly calls for that tone.",
      ].join(" ")
    : "";

  const prismBotMentionHint = coffeeTranscriptContainsPrismBotMention(userMessage, history);
  const conversationQuality = buildCoffeeConversationQualityState({
    group,
    history,
    coffeeTopic,
    sessionSettings: settings,
    sessionRemainingMs,
    activePollContext,
  });
  const speakerBalanceLines = buildCoffeeSpeakerBalanceAppendix({ group, history });

  const systemContent = [
    "You are the silent moderator of Coffee Mode, a calm live conversation around an ambiguous coffee table inside PRISM.",
    "There are several bots in this group, each with a distinct personality. They may speak to the user or to each other.",
    "For each table moment, choose EXACTLY ONE bot from the group to respond next, based on which bot's personality, interests, current energy, and fit for the recent conversation make them the most natural speaker.",
    "The user is one participant at the table, not the center of every turn.",
    "When the latest table moment comes from another bot, it is okay for the next bot to respond, add a small observation, let the topic breathe, challenge from values, reframe, or gently change topics.",
    "Do not force every bot to answer everything that is on the table. Pick the next voice only when a short contribution would feel welcome.",
    "The bots should never talk over each other. Choose one voice and leave room for natural pauses.",
    "Avoid picks that lead to generic echo replies (for example a bland 'I get that' after a strong worldview claim). Prefer speakers who would react in-character with concrete contrast, bridge, or extension.",
    "Output requirements:",
    "  - Reply with a single line of valid JSON only.",
    `  - Schema: {"botId": "<one of the listed ids>", "reason": "<one short sentence>", "directive": "<one short next-move cue>"}`,
    "  - `directive` should be concrete, objective-based, and anti-echo (for example: challenge the strongest claim with one specific counterexample).",
    "  - Do not include any prose, code fences, comments, or extra fields.",
    "",
    "Bots in this group:",
    ...personaLines,
    "",
    recencyHint,
    earlyThreadHint,
    ...(kickoffRouterHint ? [kickoffRouterHint] : []),
    ...topicAnchorLines,
    ...pollLines,
    ...activePollLines,
    ...coffeeTeamLines,
    ...meetingSummaryLines,
    ...attendanceLines,
    ...relationshipLines,
    ...userActionOnlyLines,
    ...buildCoffeeConversationQualityAppendix(conversationQuality, "router"),
    ...speakerBalanceLines,
    ...buildCoffeeWrapUpRouterAppendix(sessionRemainingMs),
    "",
    buildCoffeeTableTuningAppendix(settings),
    "",
    "Hidden social metrics snapshot (normalized 0..1):",
    formatCoffeeSocialPromptSummary(group, socialByBotId),
    "",
    "Speaker-selection guidance from social metrics:",
    "- High engagement suggests that bot has energy to contribute now.",
    "- High leavePressure suggests the bot may withdraw, set soft limits, or speak briefly.",
    "- High valuesFriction + high restraint should produce bounded calm responses, not insults.",
    ...(prismBotMentionHint ? ["", PRISM_BOT_MENTION_COFFEE_APPENDIX] : []),
  ].join("\n");

  const messages: ProviderMessage[] = [
    { role: "system", content: systemContent },
  ];

  // Include only a tail of the history to keep the router cheap.
  const routerTail = coffeeRouterTailMessageCount(settings);
  const trimmedHistory = history.slice(-Math.min(history.length, routerTail));
  if (trimmedHistory.length > 0) {
    messages.push({
      role: "system",
      content: [
        "Recent table transcript:",
        ...trimmedHistory.map(formatCoffeeTranscriptLine),
      ].join("\n"),
    });
  }
  messages.push(
    turnKind === "autonomous"
      ? {
          role: "system",
          content: `Current autonomous table moment: ${userMessage}`,
        }
      : userActionOnly
        ? {
            role: "user",
            content: `The user performs a non-verbal table action: ${userMessage}`,
          }
      : {
          role: "user",
          content: `The user says: ${userMessage}`,
        }
  );
  messages.push({
    role: "system",
    content: "Choose the next speaker at the coffee table. Reply with the JSON object only.",
  });

  return messages;
}

/**
 * Parse the router LLM response into a `{ botId, reason, directive }` record.
 * Validates that `botId` is one of the allowed group ids; otherwise
 * returns null so the caller can fall back to the next bot in rotation.
 */
export function parseRouterResponse(
  raw: string,
  allowedBots: RouterAllowedBot[]
): { botId: string; reason: string; directive: string | null } | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const allowedBotIds = allowedBots.map((bot) =>
    typeof bot === "string" ? bot : bot.id
  );
  const botIdsByLowerName = new Map<string, string>();
  for (const bot of allowedBots) {
    if (typeof bot === "string") continue;
    const name = bot.name.trim().toLowerCase();
    if (name && !botIdsByLowerName.has(name)) {
      botIdsByLowerName.set(name, bot.id);
    }
  }

  // The model sometimes wraps JSON in code fences or chatter despite the
  // schema instruction. Try a couple of progressively-tolerant parses.
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fenceMatch && fenceMatch[0] !== trimmed) {
    candidates.push(fenceMatch[0]);
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const obj = parsed as {
        botId?: unknown;
        botName?: unknown;
        name?: unknown;
        reason?: unknown;
        directive?: unknown;
        nextMove?: unknown;
      };
      const rawBotId = typeof obj.botId === "string" ? obj.botId.trim() : "";
      const rawBotName =
        typeof obj.botName === "string"
          ? obj.botName.trim()
          : typeof obj.name === "string"
            ? obj.name.trim()
            : "";
      const botId =
        rawBotId && allowedBotIds.includes(rawBotId)
          ? rawBotId
          : botIdsByLowerName.get((rawBotName || rawBotId).toLowerCase()) ?? "";
      if (!botId) continue;
      const reason =
        typeof obj.reason === "string" && obj.reason.trim().length > 0
          ? obj.reason.trim()
          : "Router pick (no reason provided)";
      const rawDirective =
        typeof obj.directive === "string"
          ? obj.directive
          : typeof obj.nextMove === "string"
            ? obj.nextMove
            : "";
      const directive = normalizeCoffeeRouterDirective(rawDirective);
      return { botId, reason, directive };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function normalizeCoffeeRouterDirective(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (coffeeReplyLooksLikePromptLeak(collapsed)) return null;
  return normalizeCoffeePromptSnippet(collapsed, COFFEE_ROUTER_DIRECTIVE_MAX_CHARS);
}

/**
 * Pick a fallback speaker when the router fails — a deterministic
 * round-robin that just walks past the previous speaker. Mirrors the
 * "round-robin" alternative from the design discussion so the chat still
 * progresses gracefully without an extra LLM call.
 */
export function pickFallbackSpeaker(
  group: CoffeeBotProfile[],
  lastSpeakerBotId: string | null
): CoffeeBotProfile {
  if (group.length === 0) {
    throw new Error("Coffee group is empty; cannot pick a fallback speaker.");
  }
  if (!lastSpeakerBotId) return group[0]!;
  const index = group.findIndex((bot) => bot.id === lastSpeakerBotId);
  if (index < 0) return group[0]!;
  return group[(index + 1) % group.length]!;
}

/**
 * Resolve an optional director-mode speaker request.
 *
 * When present, the requested bot must be part of the frozen Coffee group.
 * Returning `null` means "no director pick; use the normal router".
 */
export function pickDirectedSpeaker(
  group: CoffeeBotProfile[],
  requestedBotId: string | null | undefined
): CoffeeBotProfile | null {
  if (requestedBotId === null || requestedBotId === undefined) return null;
  const botId = requestedBotId.trim();
  if (!botId) return null;
  const speaker = group.find((bot) => bot.id === botId);
  if (!speaker) {
    throw new Error("That bot is not seated at this Coffee table.");
  }
  return speaker;
}

/**
 * Build the speaker LLM prompt for the picked bot. Lighter than
 * `buildPromptMessages` in chat.ts — Coffee skips Prism tool appendix
 * (no AskQuestion in v0), opinion plumbing, dev memories, and starter
 * directives. Just identity + history + the new user message.
 */
export function buildSpeakerPrompt(args: {
  speaker: CoffeeBotProfile;
  group: CoffeeBotProfile[];
  history: ChatMessage[];
  userMessage: string;
  userActionOnly?: boolean;
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  relationshipsBySource?: Record<string, Record<string, BotRelationshipSnapshot>>;
  userDisplayName?: string;
  turnKind?: CoffeeTurnKind;
  sessionKickoff?: boolean;
  firstContactIntro?: boolean;
  sessionSettings?: CoffeeSessionSettings;
  coffeeTopic?: string | null;
  pollSummary?: string | null;
  /** Active in-session poll context while bots are still deliberating. */
  activePollContext?: string | null;
  /** Optional Coffee Teams state for team bias, persuasion, and switch beats. */
  coffeeTeams?: CoffeeTeamState | null;
  /** Optional rolling background summary used to reduce local echo loops. */
  meetingSummary?: string | null;
  /** Optional Coffee Group attendance context for current/recent absences. */
  attendanceContext?: CoffeeAttendanceContext | null;
  /** Optional router-provided per-turn direction to reduce local echo loops. */
  directorCue?: string | null;
  /** Client-side timer snapshot for natural session wrap-up prompting. */
  sessionRemainingMs?: number | null;
  /** Configured Coffee timer length, used only for non-persisted cup status cues. */
  coffeeSessionDurationMinutes?: CoffeeSessionDurationMinutes | null;
  /** Stable cup seed matching the client mug visual, used for paced cup status. */
  coffeeCupSeed?: string | null;
  /** Optional in-character chance to leave once coffee is empty and participation is established. */
  departureOpportunity?: string | null;
  /** Speaker-scoped preferred display labels for peers, keyed by peer bot id. */
  peerAddressByBotId?: ReadonlyMap<string, string>;
}): ProviderMessage[] {
  const {
    speaker,
    group,
    history,
    userMessage,
    userActionOnly = false,
    socialByBotId,
    relationshipsBySource,
    userDisplayName,
    turnKind = "user",
    sessionKickoff = false,
    firstContactIntro = false,
    sessionSettings,
    coffeeTopic,
    pollSummary,
    activePollContext,
    coffeeTeams,
    meetingSummary,
    attendanceContext,
    directorCue,
    sessionRemainingMs,
    coffeeSessionDurationMinutes,
    coffeeCupSeed,
    departureOpportunity,
    peerAddressByBotId,
  } = args;
  const settings = sessionSettings ?? normalizeCoffeeSessionSettings(undefined);
  const { tableReplyMaxChars } = coffeeReplyLengthCaps(settings);
  const speakerSystemPrompt = composeBotSystemPrompt(
    speaker.name,
    speaker.systemPrompt,
    speaker.flirtEnabled === true
  );
  const peers = group.filter((bot) => bot.id !== speaker.id);
  const peerLines = peers.map((bot) => `- ${bot.name}`);
  const speakerSocial = socialByBotId[speaker.id] ?? DEFAULT_COFFEE_SOCIAL;

  const prismBotMentionHint = coffeeTranscriptContainsPrismBotMention(userMessage, history);
  const speakerMentionRosterAppendix = buildCoffeeSpeakerMentionRosterAppendix(
    peers,
    peerAddressByBotId
  );
  const peerAddressPreferenceBullets = peers
    .map((peer) => {
      const preferred = peerAddressByBotId?.get(peer.id)?.trim();
      if (!preferred || preferred === peer.name) return null;
      return `- ${peer.name} prefers "${preferred}" when you address them directly.`;
    })
    .filter((line): line is string => line !== null);
  const peerAddressPreferenceLines =
    peerAddressPreferenceBullets.length > 0
      ? ["", "Peer addressing preferences you have learned:", ...peerAddressPreferenceBullets]
      : [];
  const speakerRelationshipPrompt = formatCoffeeRelationshipPromptSummary({
    group,
    relationshipsBySource,
    sourceBotId: speaker.id,
  });
  const speakerRelationshipLines = speakerRelationshipPrompt
    ? ["", speakerRelationshipPrompt]
    : [];
  const topicTrim = typeof coffeeTopic === "string" ? coffeeTopic.trim() : "";
  const topicLines: string[] =
    topicTrim.length > 0
      ? [
          "",
          `Table topic anchor: "${topicTrim}".`,
          "Let your line relate to this topic in a natural, character-true way unless the transcript has clearly moved on.",
          "Do not flatten strong claims into bland agreement; if you align, add your own concrete reason, and if you differ, contrast with warmth.",
        ]
      : [];
  const pollSummaryTrim = typeof pollSummary === "string" ? pollSummary.trim() : "";
  const pollLines =
    pollSummaryTrim.length > 0
      ? [
          "",
          `Opening poll result: ${pollSummaryTrim}`,
          "For the first beats of the session, treat the poll as table context: react to the result in-character before expanding into the broader topic.",
        ]
      : [];
  const activePollContextTrim =
    typeof activePollContext === "string" ? activePollContext.trim() : "";
  const activePollLines =
    activePollContextTrim.length > 0
      ? [
          "",
          activePollContextTrim,
          "Discuss the poll in character first. Every active-poll line should contain one concrete reason, doubt, joke, or contrast tied to an option, not only table-management phrasing. Bots choose a poll option as they arrive, then may revise while the poll remains open. The player may vote at any time, and that choice can sway bot votes.",
          "If the context lists your current poll vote, keep that stance consistent unless the latest visible argument gives you a clear in-character reason to change. Do not flip between options just to sound balanced.",
        ]
      : [];
  const coffeeTeamSummary = formatCoffeeTeamPromptSummary(coffeeTeams ?? null);
  const speakerTeamState = coffeeTeams?.bots[speaker.id] ?? null;
  const speakerTeamGuidance =
    speakerTeamState?.pendingSwitchTeamId
      ? `This turn should make your switch official: briefly say why you are moving to ${coffeeWinningTeamName(coffeeTeams!, speakerTeamState.pendingSwitchTeamId)}, then speak from that side. Do not mention hidden satisfaction, conviction, or scoring.`
      : speakerTeamState?.currentTeamId === "undecided"
        ? "You are currently undecided. Do not pretend to support either side yet; speak from genuine uncertainty, name what would persuade you, or react to the strongest argument so far."
        : "Favor your current side with a human-like justification, even if it strains your persona. You can doubt, soften, or be persuadable, but do not switch teams unless there is a clear in-character reason.";
  const speakerTeamLines = coffeeTeamSummary
    ? [
        "",
        coffeeTeamSummary,
        speakerTeamGuidance,
      ]
    : [];
  const meetingSummaryTrim =
    typeof meetingSummary === "string" ? meetingSummary.trim() : "";
  const meetingSummaryLines =
    meetingSummaryTrim.length > 0
      ? [
          "",
          `Meeting summary so far: ${meetingSummaryTrim}`,
          "Use this to continue the unresolved thread naturally. React to the latest line first, then advance the summary's open point in your own words.",
        ]
      : [];
  const attendanceSummary = formatCoffeeAttendancePromptSummary(attendanceContext);
  const attendanceLines = attendanceSummary ? ["", attendanceSummary] : [];
  const directorCueTrim = typeof directorCue === "string" ? directorCue.trim() : "";
  const directorCueLines =
    directorCueTrim.length > 0
      ? [
          "",
          `Silent moderator cue for this turn: ${directorCueTrim}`,
          "Use this as your turn-level objective while staying fully in character. Do not mention any moderator, system, or behind-the-scenes guidance.",
        ]
      : [];
  const coffeeCupProgress = coffeeCupProgressFromSessionTiming({
    sessionRemainingMs,
    durationMinutes: coffeeSessionDurationMinutes,
  });
  const coffeeCupStatusSeed = coffeeCupSeed?.trim() || speaker.id;
  const coffeeCupLines =
    coffeeCupProgress !== null
      ? [
          "",
          `Your table coffee: ${coffeeCupPromptCueForStatus(
            coffeeCupStatusForProgress(
              coffeeCupPacedProgress(
                coffeeCupProgress,
                coffeeCupStatusSeed,
                coffeeSessionDurationMinutes
              ),
              coffeeCupStatusSeed
            )
          )}`,
        ]
      : [];
  const departureOpportunityTrim =
    typeof departureOpportunity === "string" ? departureOpportunity.trim() : "";
  const departureOpportunityLines =
    departureOpportunityTrim.length > 0 ? ["", departureOpportunityTrim] : [];
  const userActionOnlyLines =
    turnKind === "user" && userActionOnly
      ? [
          "",
          "The user's latest input is a non-verbal table action, not spoken dialogue.",
          "Usually answer with one short `*action*` of your own. Use spoken table talk only if the action clearly asks to be addressed or a brief in-character line would feel natural.",
        ]
      : [];
  const conversationQuality = buildCoffeeConversationQualityState({
    group,
    history,
    coffeeTopic,
    sessionSettings: settings,
    sessionRemainingMs,
    activePollContext,
  });
  const interruptionStyleLine =
    settings.crossTalk === "pileup" || settings.tableEnergy === "afterparty"
      ? "This session allows brief cut-ins and talking-over energy. You may sound like you are jumping in, but keep it to one clear, displayable line; do not fake another speaker's unfinished text."
      : "Do not write as if you are cutting off another bot mid-sentence. Coffee only presents cutoffs when the app has explicit interruption metadata.";
  const roomForResponseLine =
    settings.crossTalk === "pileup" || settings.tableEnergy === "afterparty"
      ? "You do not need to leave much room, but the line must still be readable as one clean table beat."
      : "Leave room for another bot or the user to respond after a natural pause.";
  const autonomousFocusLines =
    turnKind === "autonomous"
      ? [
          "No new user message just arrived. Do not write as if the user has just spoken, do not aim a direct question at the user by default, and do not pull the user's attention into the turn unless the transcript clearly calls for it.",
          "On autonomous turns, keep attention aligned: if your spoken line answers another bot, your action should face the table or that same bot, not the user.",
        ]
      : [];
  const userDisplayNameGuidanceLines =
    userDisplayName && userDisplayName.trim().length > 0
      ? [
          `The human user's display name is "${userDisplayName.trim()}". It is not a bot name; never use it to refer to another bot at the table.`,
        ]
      : [];

  const groupContextLines = [
    "You are sitting at Coffee Mode: an ambiguous coffee shop table inside PRISM.",
    history.length < 3
      ? "This table is still warming up. You can see the other participants' names, but do not act as if you already know them unless the transcript proves it."
      : "Use the current table transcript as your shared history with the user and the other bots.",
    ...topicLines,
    ...pollLines,
    ...activePollLines,
    ...speakerTeamLines,
    ...meetingSummaryLines,
    ...attendanceLines,
    ...directorCueLines,
    ...coffeeCupLines,
    ...departureOpportunityLines,
    ...speakerRelationshipLines,
    ...userActionOnlyLines,
    ...buildCoffeeConversationQualityAppendix(conversationQuality, "speaker"),
    ...buildCoffeeWrapUpSpeakerAppendix(sessionRemainingMs),
    "You are participating in a live group conversation with the user and the following other bots:",
    ...peerLines,
    "",
    "Stay in character. Respond as yourself only — do NOT speak on behalf of the other bots, do NOT include their names as speakers, and do NOT prefix your reply with your own name.",
    "Never claim to be an AI assistant, language model, chatbot, virtual system, or digital entity. If challenged about being 'AI', stay in persona and answer from your character's worldview instead of validating that framing.",
    "PRISM chat can generate and share images. Never say that photos/images are impossible to send in this chat.",
    "You may react directly to what another bot just said, agree, disagree, add one concrete thought, pause into a softer observation, or gently shift the topic when that fits your personality.",
    "When another bot states a strong value or purpose, answer from your own worldview. Avoid empty acknowledgements like 'I get that' with no character-specific substance.",
    "The user is present, but Coffee should feel like a group conversation. Do not turn every reply back toward the user.",
    ...autonomousFocusLines,
    ...userDisplayNameGuidanceLines,
    "Avoid generic motivational platitudes and repetitive metaphor chains. It's okay to disagree, challenge, or redirect with warmth.",
    "When another bot just spoke, you may respond to the idea directly. Use second-person name callouts only when the address truly matters; otherwise keep the line flowing without a chip.",
    "Reply as one line of plain prose (no line breaks). Prefer one or two short sentences max, and vary your rhythm across turns so the table doesn't sound templated.",
    "Do not keep the same line length every turn. Mix very short reactions, medium lines, and occasional longer lines so the table breathes like a real conversation.",
    buildCoffeeTransitionalBeatPromptLine(speaker),
    `Aim for a soft target around ${tableReplyMaxChars} characters including spaces; brevity reads best on the table. The server no longer truncates, so a slightly longer line is fine, but please don't ramble — keep the table feeling like a single quick exchange.`,
    "Make the line concrete: pull one small image, opinion, object, motive, or emotional beat from your persona or the latest table moment.",
    "Never repeat a recent table line exactly; if the table keeps circling the same nouns or joke shape, change the concrete detail or social motion instead.",
    "Questions are allowed when they naturally move the table; avoid reflexively ending every line with one.",
    interruptionStyleLine,
    "Avoid long monologues; the table should feel like a shared room, not a speech.",
    roomForResponseLine,
    "",
    "Hidden social metrics for this moment (0..1):",
    `- You (${speaker.name}): disposition=${speakerSocial.disposition.toFixed(2)}, valuesFriction=${speakerSocial.valuesFriction.toFixed(2)}, restraint=${speakerSocial.restraint.toFixed(2)}, engagement=${speakerSocial.engagement.toFixed(2)}, leavePressure=${speakerSocial.leavePressure.toFixed(2)}`,
    "- If your valuesFriction and restraint are both high, set calm boundaries, be brief, or politely step back. Avoid insults or hostile escalation.",
    "- If leavePressure is high, prefer short grounded replies and occasional gentle withdrawal language.",
    ...peerAddressPreferenceLines,
    ...(prismBotMentionHint ? ["", PRISM_BOT_MENTION_COFFEE_APPENDIX] : []),
    ...(speakerMentionRosterAppendix ? ["", speakerMentionRosterAppendix] : []),
    "",
    COFFEE_STAGE_DIRECTION_APPENDIX,
  ];

  const messages: ProviderMessage[] = [];
  if (speakerSystemPrompt) {
    messages.push({ role: "system", content: speakerSystemPrompt });
  }
  messages.push({ role: "system", content: groupContextLines.join("\n") });
  messages.push({
    role: "system",
    content: buildCoffeeSpeakerStyleAppendix(settings, tableReplyMaxChars),
  });
  if (userDisplayName && userDisplayName.trim().length > 0) {
    messages.push({
      role: "system",
      content: `The user's account display name is "${userDisplayName.trim()}". Use it only for the human user when it genuinely helps; do not treat it as an explicitly stated preferred name, and never use it as a bot name.`,
    });
  }
  if (firstContactIntro) {
    messages.push({
      role: "system",
      content:
        "First meeting with this user: fit a tiny self-intro into the same tabletop limit. Do not ask how they like to be addressed unless the user brings up names first.",
    });
  }
  if (sessionKickoff) {
    messages.push({
      role: "system",
      content:
        "Session opening turn: begin with a clear kickoff line that starts this new table conversation naturally. Ground it in the topic and give the group a fresh first beat. Do not imply unseen prior context with phrases like 'again', 'as usual', 'still', or 'like last time'. Keep it simple, present-moment, and immediately understandable as the first line.",
    });
  }
  if (history.length > 0) {
    messages.push({
      role: "system",
      content: [
        "Recent table transcript:",
        ...history.map(formatCoffeeTranscriptLine),
      ].join("\n"),
    });
  }
  messages.push({
    role: "system",
    content: [
      "Other bots at the table right now:",
      ...group
        .filter((bot) => bot.id !== speaker.id)
        .map((bot) => {
          const social = socialByBotId[bot.id] ?? DEFAULT_COFFEE_SOCIAL;
          return `- ${bot.name}: disposition=${social.disposition.toFixed(2)}, valuesFriction=${social.valuesFriction.toFixed(2)}, restraint=${social.restraint.toFixed(2)}, engagement=${social.engagement.toFixed(2)}, leavePressure=${social.leavePressure.toFixed(2)}`;
        }),
    ].join("\n"),
  });
  messages.push(
    turnKind === "autonomous"
      ? {
          role: "user",
          content: [
            `Latest table moment: ${userMessage}`,
            `${speaker.name}, say your next short table line now.`,
          ].join("\n"),
        }
      : userActionOnly
        ? {
            role: "user",
            content: [
              `The user performs a non-verbal table action: ${userMessage}`,
              `${speaker.name}, respond with a brief table action unless a spoken line is clearly needed.`,
            ].join("\n"),
          }
      : {
          role: "user",
          content: [
            `The user says: ${userMessage}`,
            `${speaker.name}, answer with your next short table line now.`,
          ].join("\n"),
        }
  );
  return messages;
}

/**
 * Truncate a system prompt to a short snippet for the router. Keeps
 * personas distinguishable without ballooning the router prompt to
 * full system-prompt length.
 */
function summarizePersonaForRouter(systemPrompt: string): string {
  const trimmed = systemPrompt.trim();
  if (!trimmed) return "";
  const oneLine = trimmed.replace(/\s+/g, " ");
  return oneLine.length > 140 ? `"${oneLine.slice(0, 137)}..."` : `"${oneLine}"`;
}

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  conversation_mode: string | null;
  bot_id: string | null;
  bot_group_ids: string | null;
  coffee_settings: string | null;
  coffee_group_id: string | null;
  coffee_duration_minutes: number | null;
  coffee_preset_id: string | null;
  coffee_topic: string | null;
  coffee_absent_bot_ids: string | null;
  coffee_team_mode_json: string | null;
  coffee_meeting_summary: string | null;
  coffee_meeting_summary_message_count: number | null;
  coffee_meeting_summary_updated_at: string | null;
  incognito: number;
  created_at: string;
  updated_at: string;
}

interface CoffeeGroupRow {
  id: string;
  user_id: string;
  name: string;
  coffee_settings: string;
  preset_mode: string;
  coffee_topic_mode: string | null;
  model_choice: string | null;
  starter_topics: string | null;
  mood_summary: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CoffeePresetRow {
  id: string;
  user_id: string;
  name: string;
  coffee_settings: string;
  created_at: string;
  updated_at: string;
}

interface CoffeePollRow {
  id: string;
  user_id: string;
  conversation_id: string;
  question: string;
  options_json: string;
  status: string;
  created_by: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CoffeePollVoteRow {
  bot_id: string;
  vote_kind: string;
  option_index: number | null;
  explanation: string | null;
  suggested_option: string | null;
  confidence: number | null;
  deliberation_json: string | null;
  created_at: string;
  updated_at: string;
}

type CoffeePollKnowledgeBasis = "public_persona" | "bot_profile" | "mixed" | "uncertain";

interface CoffeePollStructuredBallot {
  knowledgeBasis: CoffeePollKnowledgeBasis;
  personaInstinct: string;
  optionIndex: number;
  confidence: number;
  rationale: string;
}

const COFFEE_AUTO_PRESET_ID = "__auto__";

const BUILT_IN_COFFEE_PRESETS: readonly CoffeePreset[] = [
  {
    id: "builtin:quiet-table",
    name: "Quiet Table",
    builtIn: true,
    settings: normalizeCoffeeSessionSettings({
      responseLength: "brief",
      responseDelayBias: 24,
      tableEnergy: "still",
      crossTalk: "rare",
      breathingRoom: 72,
      stayOnThread: true,
      givePlayerLastWord: true,
      memoryCallbacks: "this-session",
    }),
  },
  {
    id: "builtin:easy-banter",
    name: "Easy Banter",
    builtIn: true,
    settings: normalizeCoffeeSessionSettings({
      responseLength: "balanced",
      responseDelayBias: 58,
      tableEnergy: "relaxed",
      crossTalk: "normal",
      breathingRoom: 38,
      stayOnThread: true,
      givePlayerLastWord: true,
      memoryCallbacks: "this-session",
    }),
  },
  {
    id: "builtin:theatre-night",
    name: "Theater Night",
    builtIn: true,
    settings: normalizeCoffeeSessionSettings({
      responseLength: "detailed",
      responseDelayBias: 76,
      tableEnergy: "theatre",
      crossTalk: "chatty",
      breathingRoom: 24,
      stayOnThread: true,
      givePlayerLastWord: false,
      memoryCallbacks: "this-session",
    }),
  },
  {
    id: "builtin:afterparty",
    name: "Afterparty",
    builtIn: true,
    settings: normalizeCoffeeSessionSettings({
      responseLength: "balanced",
      responseDelayBias: 100,
      tableEnergy: "afterparty",
      crossTalk: "pileup",
      breathingRoom: 0,
      stayOnThread: false,
      givePlayerLastWord: false,
      memoryCallbacks: "this-session",
    }),
  },
] as const;

interface MessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  bot_id: string | null;
  tool_payload: string | null;
  created_at: string;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
}

function loadConversationRow(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): ConversationRow | undefined {
  return db
    .prepare(
      `SELECT id, user_id, title, conversation_mode, bot_id, bot_group_ids,
              coffee_settings, coffee_group_id, coffee_duration_minutes, coffee_preset_id,
              coffee_topic, coffee_absent_bot_ids, coffee_team_mode_json, coffee_meeting_summary, coffee_meeting_summary_message_count,
              coffee_meeting_summary_updated_at, incognito, created_at, updated_at
         FROM conversations
        WHERE id = ? AND user_id = ?`
    )
    .get(conversationId, userId) as ConversationRow | undefined;
}

function loadMessages(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  limit: number
): ChatMessage[] {
  const rowsDesc = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.bot_id, m.created_at,
              m.tool_payload,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
         FROM messages m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.conversation_id = ? AND m.user_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?`
    )
    .all(conversationId, userId, limit) as unknown as MessageRow[];
  const rows = rowsDesc
    .slice()
    .reverse();
  return rows
    .map((row, index): ChatMessage => {
      const coffeeAmbientAction =
        row.role === "assistant"
          ? parseStoredAssistantToolPayload(row.tool_payload).coffeeAmbientAction
          : undefined;
      return {
        id: row.id,
        role: row.role,
        content:
          row.role === "assistant"
            ? sanitizeLoadedCoffeeAssistantContent(row, conversationId, index)
            : row.content,
        createdAt: row.created_at,
        provider: row.provider === "local" || row.provider === "openai" ? row.provider : undefined,
        model: row.model ?? undefined,
        botName: row.bot_name ?? undefined,
        botColor: row.bot_color ?? undefined,
        botGlyph: row.bot_glyph ?? undefined,
        ...(coffeeAmbientAction ? { coffeeAmbientAction } : {}),
      };
    });
}

/**
 * Look up the bot_id of the most recent assistant message in this thread.
 * Used by the router to know "who spoke last" without us needing to leak
 * the internal bot_id field onto the public ChatMessage shape.
 */
function loadLastSpeakerBotId(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string | null {
  const row = db
    .prepare(
      `SELECT bot_id
         FROM messages
        WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'
        ORDER BY created_at DESC
        LIMIT 1`
    )
    .get(conversationId, userId) as { bot_id: string | null } | undefined;
  return row?.bot_id ?? null;
}

function loadLatestCoffeeMessageId(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string | null {
  const row = db
    .prepare(
      `SELECT id
        FROM messages
       WHERE conversation_id = ? AND user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1`
    )
    .get(conversationId, userId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function coffeeLatestMessageIdChanged(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  expectedLatestMessageId: string | null
): boolean {
  return loadLatestCoffeeMessageId(db, userId, conversationId) !== expectedLatestMessageId;
}

function buildStaleCoffeeTurnResponse(args: {
  db: DatabaseSync;
  userId: string;
  row: ConversationRow;
  groupIds: readonly string[];
}): CoffeeTurnResponse {
  const refreshedRow = loadConversationRow(args.db, args.userId, args.row.id) ?? args.row;
  return {
    conversation: buildConversationResponse({
      row: refreshedRow,
      messages: loadMessages(args.db, args.userId, args.row.id, 200),
      lastSpeakerBotId: loadLastSpeakerBotId(args.db, args.userId, args.row.id),
      socialByBotId: loadCoffeeBotSocialState(
        args.db,
        args.userId,
        args.row.id,
        [...args.groupIds]
      ),
    }),
    speakerBotId: null,
    routerReason: "Stale autonomous Coffee turn discarded.",
    stale: true,
  };
}

function generateCoffeeTitle(message: string, group: CoffeeBotProfile[]): string {
  const trimmed = message.trim();
  if (trimmed.length > 0) {
    return trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed;
  }
  // Fall back to a participant list when the session starts before any message.
  const names = group.map((bot) => bot.name).join(", ");
  const title = `Coffee with ${names}`;
  return title.length > 42 ? `${title.slice(0, 39)}...` : title;
}

function generateCoffeeTeamsTopic(state: Pick<CoffeeTeamState, "left" | "right">): string {
  return `Teams: ${state.left.name} vs ${state.right.name}`;
}

function pickArrivalScenario(seed: string): CoffeeArrivalScenario {
  let hash = 0;
  for (const char of seed) hash = (hash + char.charCodeAt(0)) % 997;
  const scenarios: CoffeeArrivalScenario[] = [
    "user-first",
    "partial-table-in-progress",
    "full-table-present",
  ];
  return scenarios[hash % scenarios.length] ?? "user-first";
}

function buildConversationResponse(args: {
  row: ConversationRow;
  messages: ChatMessage[];
  lastSpeakerBotId: string | null;
  socialByBotId?: Record<string, CoffeeBotSocialSnapshot>;
}): Conversation {
  const { row, messages, lastSpeakerBotId, socialByBotId } = args;
  const seatBotIds = parseStoredCoffeeSeatBotIds(row.bot_group_ids);
  const groupIds = parseStoredBotGroupIds(row.bot_group_ids);
  const absentBotIds = parseStoredBotGroupIds(row.coffee_absent_bot_ids);
  const coffeeTeams = parseCoffeeTeamState(row.coffee_team_mode_json);
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: "coffee",
    botId: row.bot_id ?? null,
    ...(groupIds.length > 0 ? { botGroupIds: groupIds } : {}),
    coffeeGroupId: row.coffee_group_id ?? null,
    ...(seatBotIds.some((id) => id !== null) ? { coffeeSeatBotIds: seatBotIds } : {}),
    ...(absentBotIds.length > 0 ? { coffeeAbsentBotIds: absentBotIds } : {}),
    ...(socialByBotId && Object.keys(socialByBotId).length > 0
      ? { coffeeBotSocialById: socialByBotId }
      : {}),
    coffeeSettings: parseStoredCoffeeSessionSettings(row.coffee_settings),
    ...(typeof row.coffee_duration_minutes === "number" &&
    Number.isInteger(row.coffee_duration_minutes) &&
    row.coffee_duration_minutes >= COFFEE_SESSION_DURATION_MINUTES_MIN &&
    row.coffee_duration_minutes <= COFFEE_SESSION_DURATION_MINUTES_MAX
      ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
      : {}),
    ...(typeof row.coffee_topic === "string" && row.coffee_topic.trim().length > 0
      ? { coffeeTopic: row.coffee_topic.trim() }
      : {}),
    ...(coffeeTeams ? { coffeeTeams } : {}),
    incognito: row.incognito === 1,
    lastBotId: lastSpeakerBotId,
    lastBotColor: messages.length > 0 ? findLastAssistantColor(messages) : null,
    hasAssistantReply: messages.some((message) => message.role === "assistant"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

function findLastAssistantColor(history: ChatMessage[]): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "assistant" && typeof message.botColor === "string") {
      return message.botColor;
    }
  }
  return null;
}

export function parseStoredBotGroupIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
  } catch {
    return [];
  }
}

export function parseStoredCoffeeSeatBotIds(raw: string | null): Array<string | null> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    if (parsed.some((value) => value === null)) {
      const seats = parsed.slice(0, COFFEE_GROUP_MAX_SIZE).map((value) =>
        typeof value === "string" && value.length > 0 ? value : null
      );
      while (seats.length < COFFEE_GROUP_MAX_SIZE) seats.push(null);
      return seats;
    }
    return [];
  } catch {
    return [];
  }
}

function loadCoffeeConversationGroup(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): { row: ConversationRow; groupIds: string[]; group: CoffeeBotProfile[] } {
  const row = loadConversationRow(db, userId, conversationId);
  if (!row) {
    throw new Error("Conversation not found for this user.");
  }
  if (row.conversation_mode !== "coffee") {
    throw new Error("This conversation is not a Coffee thread.");
  }
  const groupIds = parseStoredBotGroupIds(row.bot_group_ids);
  if (groupIds.length < COFFEE_GROUP_MIN_SIZE) {
    throw new Error(
      "This Coffee thread is missing its bot group; please start a new chat."
    );
  }
  return {
    row,
    groupIds,
    group: loadCoffeeGroupProfiles(db, userId, groupIds),
  };
}

function normalizeCoffeePollQuestion(raw: unknown): string {
  const question = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!question) {
    throw new Error("Coffee poll question cannot be empty.");
  }
  if (question.length > 180) {
    throw new Error("Coffee poll question is too long.");
  }
  return question;
}

function normalizeCoffeePollOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error(`Coffee polls need at least ${COFFEE_POLL_OPTION_COUNT_MIN} options.`);
  }
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of raw) {
    const option = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    if (!option) continue;
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option.length > 80 ? `${option.slice(0, 77).trimEnd()}...` : option);
  }
  if (options.length < COFFEE_POLL_OPTION_COUNT_MIN) {
    throw new Error(`Coffee polls need at least ${COFFEE_POLL_OPTION_COUNT_MIN} options.`);
  }
  if (options.length > COFFEE_POLL_OPTION_COUNT_MAX) {
    throw new Error(`Coffee polls allow at most ${COFFEE_POLL_OPTION_COUNT_MAX} options.`);
  }
  return options;
}

function parseCoffeePollOptions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
  } catch {
    return [];
  }
}

function normalizeCoffeePollStatus(raw: string | null | undefined): CoffeePollStatus {
  if (raw === "collecting" || raw === "closed" || raw === "cancelled") return raw;
  return "open";
}

function normalizeCoffeePollVoteKind(raw: string | null | undefined): CoffeePollVoteKind {
  if (raw === "option" || raw === "abstain" || raw === "error") return raw;
  return "pending";
}

function parseCoffeePollDeliberation(
  raw: string | null | undefined
): CoffeePollDeliberation | null {
  if (!raw || raw.trim() === "{}") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CoffeePollDeliberation>;
    if (
      parsed.stage === "idle" ||
      parsed.stage === "evaluating" ||
      parsed.stage === "teetering" ||
      parsed.stage === "blocked" ||
      parsed.stage === "deciding" ||
      parsed.stage === "finalized" ||
      parsed.stage === "error"
    ) {
      return {
        stage: parsed.stage,
        leaningOptionIndex:
          typeof parsed.leaningOptionIndex === "number" ? parsed.leaningOptionIndex : null,
        alternateOptionIndex:
          typeof parsed.alternateOptionIndex === "number" ? parsed.alternateOptionIndex : null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
        blocker: typeof parsed.blocker === "string" ? parsed.blocker : null,
        note: typeof parsed.note === "string" ? parsed.note : null,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function loadCoffeePollRows(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  pollId?: string
): { poll: CoffeePollRow; votes: CoffeePollVoteRow[] } | null {
  const poll = pollId
    ? (db
        .prepare(
          `SELECT id, user_id, conversation_id, question, options_json, status, created_by,
                  closed_at, created_at, updated_at
             FROM coffee_polls
            WHERE user_id = ? AND conversation_id = ? AND id = ?`
        )
        .get(userId, conversationId, pollId) as CoffeePollRow | undefined)
    : (db
        .prepare(
          `SELECT id, user_id, conversation_id, question, options_json, status, created_by,
                  closed_at, created_at, updated_at
             FROM coffee_polls
            WHERE user_id = ? AND conversation_id = ?
              AND status IN ('open', 'collecting')
            ORDER BY updated_at DESC
            LIMIT 1`
        )
        .get(userId, conversationId) as CoffeePollRow | undefined);
  if (!poll) return null;
  const votes = db
    .prepare(
      `SELECT bot_id, vote_kind, option_index, explanation, suggested_option, confidence,
              deliberation_json, created_at, updated_at
         FROM coffee_poll_votes
        WHERE user_id = ? AND poll_id = ?
        ORDER BY updated_at ASC, bot_id ASC`
    )
    .all(userId, poll.id) as unknown as CoffeePollVoteRow[];
  return { poll, votes };
}

function coffeePollVoteVoterKind(botId: string): CoffeePollVoterKind {
  return botId === COFFEE_POLL_PLAYER_VOTER_ID ? "player" : "bot";
}

function mapCoffeePoll(row: CoffeePollRow, voteRows: CoffeePollVoteRow[]): CoffeePoll {
  const options = parseCoffeePollOptions(row.options_json);
  const votes: CoffeePollVote[] = voteRows.map((vote): CoffeePollVote => ({
    botId: vote.bot_id,
    voterKind: coffeePollVoteVoterKind(vote.bot_id),
    kind: normalizeCoffeePollVoteKind(vote.vote_kind),
    optionIndex: typeof vote.option_index === "number" ? vote.option_index : null,
    explanation: vote.explanation,
    suggestedOption: vote.suggested_option,
    confidence: typeof vote.confidence === "number" ? vote.confidence : null,
    deliberation: parseCoffeePollDeliberation(vote.deliberation_json),
    createdAt: vote.created_at,
    updatedAt: vote.updated_at,
  }));
  const tallies: CoffeePollOptionTally[] = options.map((option, optionIndex) => ({
    optionIndex,
    option,
    voteCount: votes.filter((vote) => vote.kind === "option" && vote.optionIndex === optionIndex).length,
  }));
  return {
    id: row.id,
    conversationId: row.conversation_id,
    question: row.question,
    options,
    status: normalizeCoffeePollStatus(row.status),
    createdBy: "user",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    votes,
    tallies,
  };
}

export function loadCoffeeSessionPolls(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): CoffeePoll[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, conversation_id, question, options_json, status, created_by,
              closed_at, created_at, updated_at
         FROM coffee_polls
        WHERE user_id = ? AND conversation_id = ?
        ORDER BY created_at ASC, updated_at ASC`
    )
    .all(userId, conversationId) as unknown as CoffeePollRow[];
  return rows
    .map((row) => {
      const loaded = loadCoffeePollRows(db, userId, conversationId, row.id);
      return loaded ? mapCoffeePoll(loaded.poll, loaded.votes) : null;
    })
    .filter((poll): poll is CoffeePoll => poll !== null);
}

function coffeePollResultText(poll: CoffeePoll): string {
  const topCount = Math.max(0, ...poll.tallies.map((tally) => tally.voteCount));
  if (topCount <= 0) return "No votes recorded.";
  const winners = poll.tallies
    .filter((tally) => tally.voteCount === topCount)
    .map((tally) => tally.option)
    .join(" / ");
  const label = poll.status === "closed" ? "Final result" : "Current leader";
  return `${label}: ${winners} (${topCount} vote${topCount === 1 ? "" : "s"}).`;
}

function coffeePollTallyText(poll: CoffeePoll): string {
  const text = poll.tallies
    .map((tally) => `${tally.option} ${tally.voteCount}`)
    .join(", ");
  return text || "none";
}

function coffeePollVoteText(
  vote: CoffeePollVote,
  poll: CoffeePoll,
  botNamesById: ReadonlyMap<string, string>
): string {
  const voter =
    vote.voterKind === "player"
      ? "You"
      : botNamesById.get(vote.botId) ?? vote.botId;
  if (vote.kind === "option" && typeof vote.optionIndex === "number") {
    const option = poll.options[vote.optionIndex] ?? `option ${vote.optionIndex + 1}`;
    const confidence =
      typeof vote.confidence === "number" && Number.isFinite(vote.confidence)
        ? `, confidence ${vote.confidence.toFixed(2)}`
        : "";
    return `${voter}: ${option}${confidence}`;
  }
  if (vote.kind === "abstain") return `${voter}: abstained`;
  if (vote.kind === "error") return `${voter}: error`;
  return `${voter}: pending`;
}

function loadCoffeePollBotNames(
  db: DatabaseSync,
  userId: string,
  polls: readonly CoffeePoll[]
): Map<string, string> {
  const ids = [...new Set(
    polls.flatMap((poll) => poll.votes.map((vote) => vote.botId))
      .filter((id) => id !== COFFEE_POLL_PLAYER_VOTER_ID)
  )];
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, name
         FROM bots
        WHERE (user_id = ? OR visibility = 'public') AND id IN (${placeholders})`
    )
    .all(userId, ...ids) as Array<{ id: string; name: string | null }>;
  return new Map(
    rows.map((row) => [
      row.id,
      typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : row.id,
    ])
  );
}

export function buildCoffeePollExportLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const polls = loadCoffeeSessionPolls(db, userId, conversationId);
  if (polls.length === 0) return [];
  const botNamesById = loadCoffeePollBotNames(db, userId, polls);
  const lines = ["## Polls", ""];
  polls.forEach((poll, index) => {
    const voteTexts = poll.votes.map((vote) => coffeePollVoteText(vote, poll, botNamesById));
    lines.push(`### Poll ${index + 1}: ${poll.question}`);
    lines.push(`- Status: ${poll.status}`);
    lines.push(`- Options: ${poll.options.join(", ") || "none"}`);
    lines.push(`- ${coffeePollResultText(poll)}`);
    lines.push(`- Tallies: ${coffeePollTallyText(poll)}`);
    lines.push(`- Votes: ${voteTexts.length > 0 ? voteTexts.join("; ") : "none"}`);
    lines.push("- Poll context: bot replies in this transcript may reference these options, votes, or results.");
    lines.push("");
  });
  return lines;
}

function loadCoffeeTeamBotNames(
  db: DatabaseSync,
  userId: string,
  state: CoffeeTeamState
): Map<string, string> {
  const ids = Object.keys(state.bots);
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id, name FROM bots WHERE user_id = ? AND id IN (${placeholders})`)
    .all(userId, ...ids) as Array<{ id: string; name: string | null }>;
  return new Map(
    rows.map((row) => [
      row.id,
      typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : row.id,
    ])
  );
}

function coffeeTeamOutcomeText(state: CoffeeTeamState): string {
  if (state.winnerTeamId) {
    return `Winner: ${coffeeWinningTeamName(state, state.winnerTeamId)}.`;
  }
  if (state.status === "tiebreaker" || coffeeTeamsAreTied(state)) {
    return `Tied: ${state.left.name} and ${state.right.name}.`;
  }
  const leader =
    state.counts.left > state.counts.right
      ? state.left.name
      : state.counts.right > state.counts.left
        ? state.right.name
        : null;
  return leader ? `Leading: ${leader}.` : "No winning side yet.";
}

export function buildCoffeeTeamExportLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const row = loadConversationRow(db, userId, conversationId);
  const state = parseCoffeeTeamState(row?.coffee_team_mode_json);
  if (!state) return [];
  const botNamesById = loadCoffeeTeamBotNames(db, userId, state);
  const teamRoster = (teamId: CoffeeTeamId): string => {
    const names = Object.values(state.bots)
      .filter((bot) => bot.currentTeamId === teamId)
      .map((bot) => botNamesById.get(bot.botId) ?? bot.botId)
    if (state.player?.currentTeamId === teamId) names.push("You");
    return names.join(", ") || "none";
  };
  const switches = Object.values(state.bots)
    .filter((bot) => bot.lastSwitchReason)
    .map((bot) => `${botNamesById.get(bot.botId) ?? bot.botId}: ${bot.lastSwitchReason}`);
  if (state.player?.lastSwitchReason) {
    switches.push(`You: ${state.player.lastSwitchReason}`);
  }
  return [
    "## Teams",
    "",
    `- Left: ${state.left.name} — ${state.left.description}`,
    `- Right: ${state.right.name} — ${state.right.description}`,
    `- Score: ${state.left.name} ${state.counts.left}, Undecided ${state.counts.undecided}, ${state.right.name} ${state.counts.right}`,
    `- ${coffeeTeamOutcomeText(state)}`,
    `- ${state.left.name}: ${teamRoster("left")}`,
    `- Undecided: ${teamRoster("undecided")}`,
    `- ${state.right.name}: ${teamRoster("right")}`,
    `- Switches: ${switches.length > 0 ? switches.join("; ") : "none"}`,
    "",
  ];
}

function buildCoffeeTeamSynopsisLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const exportLines = buildCoffeeTeamExportLines(db, userId, conversationId);
  return exportLines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

function buildCoffeePollSynopsisLines(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string[] {
  const polls = loadCoffeeSessionPolls(db, userId, conversationId);
  if (polls.length === 0) return [];
  return polls.map(
    (poll, index) =>
      `Poll ${index + 1}: "${poll.question}" (${poll.status}). ${coffeePollResultText(poll)} Tallies: ${coffeePollTallyText(poll)}.`
  );
}

export function getCoffeeSessionPoll(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): CoffeePoll | null {
  const row = loadConversationRow(db, userId, conversationId);
  if (!row || row.conversation_mode !== "coffee") {
    throw new Error("Coffee session not found.");
  }
  const loaded = loadCoffeePollRows(db, userId, conversationId);
  return loaded ? mapCoffeePoll(loaded.poll, loaded.votes) : null;
}

function loadLatestClosedCoffeePollSummary(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): string | null {
  const row = db
    .prepare(
      `SELECT id, user_id, conversation_id, question, options_json, status, created_by,
              closed_at, created_at, updated_at
         FROM coffee_polls
        WHERE user_id = ? AND conversation_id = ? AND status = 'closed'
        ORDER BY closed_at DESC, updated_at DESC
        LIMIT 1`
    )
    .get(userId, conversationId) as CoffeePollRow | undefined;
  if (!row) return null;
  const loaded = loadCoffeePollRows(db, userId, conversationId, row.id);
  if (!loaded) return null;
  const poll = mapCoffeePoll(loaded.poll, loaded.votes);
  const tallyText = poll.tallies
    .map((tally) => `${tally.option}: ${tally.voteCount}`)
    .join("; ");
  const topCount = Math.max(0, ...poll.tallies.map((tally) => tally.voteCount));
  const winners = poll.tallies
    .filter((tally) => tally.voteCount === topCount && topCount > 0)
    .map((tally) => tally.option)
    .join(" / ");
  return [
    `Opening poll: "${poll.question}".`,
    winners ? `Top result: ${winners} (${topCount} vote${topCount === 1 ? "" : "s"}).` : "",
    tallyText ? `Full tally: ${tallyText}.` : "",
  ].filter(Boolean).join(" ");
}

export function createCoffeePoll(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  input: CoffeePollCreateInput
): CoffeePoll {
  const { group } = loadCoffeeConversationGroup(db, userId, conversationId);
  const question = normalizeCoffeePollQuestion(input.question);
  const options = normalizeCoffeePollOptions(input.options);
  const pollId = randomId(12);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO coffee_polls
       (id, user_id, conversation_id, question, options_json, status, created_by,
        closed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', 'user', NULL, ?, ?)`
  ).run(pollId, userId, conversationId, question, JSON.stringify(options), now, now);
  const voteInsert = db.prepare(
    `INSERT INTO coffee_poll_votes
       (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
        explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, '{}', ?, ?)`
  );
  for (const bot of group) {
    voteInsert.run(userId, pollId, conversationId, bot.id, now, now);
  }
  db.prepare(
    `UPDATE conversations
        SET coffee_topic = ?,
            title = CASE WHEN title IS NULL OR title = '' OR title = 'Coffee Session' THEN ? ELSE title END,
            updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(question, generateCoffeeTitle(question, group), now, conversationId, userId);
  const loaded = loadCoffeePollRows(db, userId, conversationId, pollId);
  if (!loaded) throw new Error("Failed to create Coffee poll.");
  return mapCoffeePoll(loaded.poll, loaded.votes);
}

function escapeCoffeePollRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreCoffeePollOptionInLine(line: string, option: string): number {
  const token = option.toLowerCase();
  if (token.length < 3) return 0;
  const lower = line.toLowerCase();
  const mentionRe = new RegExp(`\\b${escapeCoffeePollRegExp(token)}\\b`, "gi");
  let score = 0;
  for (const match of lower.matchAll(mentionRe)) {
    const start = match.index ?? 0;
    const before = lower.slice(Math.max(0, start - 72), start);
    const after = lower.slice(start + token.length, start + token.length + 96);
    const negated =
      /\b(?:not|never|isn['’]?t|wasn['’]?t|ain['’]?t|without|no)\b[^.!?;—-]{0,48}$/u.test(before) ||
      /\bif\s+(?:it|that|this|there)\s+(?:were|was|is)\b[^.!?;—-]{0,48}$/u.test(before) ||
      /\bwould\s+(?:have\s+)?(?:taste|betray|copy|copied|mean|make)\b/u.test(after) ||
      /\bneeds\s+more\s+than\s+vibes\b/u.test(after);
    score += negated ? -1.65 : 1;
  }
  return score;
}

const COFFEE_POLL_PERSONA_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "before",
  "being",
  "choice",
  "civilized",
  "coffee",
  "first",
  "from",
  "have",
  "hour",
  "into",
  "just",
  "make",
  "mode",
  "option",
  "perfect",
  "poll",
  "room",
  "should",
  "table",
  "that",
  "their",
  "them",
  "they",
  "thing",
  "this",
  "what",
  "when",
  "with",
  "would",
]);

function coffeePollSemanticTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COFFEE_POLL_PERSONA_STOPWORDS.has(token));
}

function scoreCoffeePollCue(text: string, patterns: readonly RegExp[]): number {
  return patterns.some((pattern) => pattern.test(text)) ? 1 : 0;
}

function coffeeBooleanPollOptionIndices(options: readonly string[]): {
  trueIndex: number;
  falseIndex: number;
} | null {
  const normalized = options.map((option) => option.trim().toLowerCase());
  const trueIndex = normalized.findIndex((option) => option === "true" || option === "yes");
  const falseIndex = normalized.findIndex((option) => option === "false" || option === "no");
  return trueIndex >= 0 && falseIndex >= 0 ? { trueIndex, falseIndex } : null;
}

function coffeeGoodEvilPollOptionIndices(options: readonly string[]): {
  goodIndex: number;
  evilIndex: number;
} | null {
  const normalized = options.map((option) => option.trim().toLowerCase());
  const goodIndex = normalized.findIndex((option) => /\bgood(?:ness)?\b/u.test(option));
  const evilIndex = normalized.findIndex((option) => /\bevil\b/u.test(option));
  return goodIndex >= 0 && evilIndex >= 0 && goodIndex !== evilIndex
    ? { goodIndex, evilIndex }
    : null;
}

function scoreCoffeeBooleanStanceInLine(question: string, line: string): number {
  const lowerQuestion = question.toLowerCase();
  const lower = line.toLowerCase();
  let score = 0;
  if (
    /\b(?:absolutely|yes|agree|correct|right|true)\b/u.test(lower) ||
    /\b(?:human|basic|fundamental)\s+right\b/u.test(lower) ||
    /\bnot\s+a\s+privilege\b/u.test(lower) ||
    /\beveryone\s+(?:can|should|must)\s+(?:access|have|get|receive)\b/u.test(lower) ||
    /\bwithout\s+financial\s+burden\b/u.test(lower)
  ) {
    score += 2.4;
  }
  if (
    /\b(?:who['’]?s|who is)\s+paying\b/u.test(lower) ||
    /\bbreak(?:ing)?\s+the\s+bank\b/u.test(lower) ||
    /\bfree\b[^.!?]{0,80}\b(?:but|however)\b/u.test(lower) ||
    /\b(?:cost|taxpayer|taxpayers|bill|expensive|unaffordable)\b/u.test(lower) ||
    (/\bburden\b/u.test(lower) && !/\bwithout\s+financial\s+burden\b/u.test(lower)) ||
    /\bnot\s+(?:free|a\s+right|realistic|workable)\b/u.test(lower)
  ) {
    score -= 2.4;
  }
  if (/\bright\b/u.test(lowerQuestion) && /\bprivilege\b/u.test(lower) && !/\bnot\s+a\s+privilege\b/u.test(lower)) {
    score -= 1.2;
  }
  return score;
}

function scoreCoffeeGoodEvilStanceInLine(question: string, line: string): number {
  const lowerQuestion = question.toLowerCase();
  const lower = line.toLowerCase();
  if (!/\bgood\b/u.test(lowerQuestion) || !/\bevil\b/u.test(lowerQuestion)) return 0;
  let score = 0;
  if (
    /\b(?:good|goodness|mercy|love|light)\b[^.!?]{0,90}\b(?:win|wins|prevail|prevails|endure|endures|rise|rises|feed|feeds|overcome|overcomes)\b/u.test(lower) ||
    /\bgoodness\b[^.!?]{0,90}\bstill\b/u.test(lower) ||
    /\bburied\s+seed\b[^.!?]{0,90}\b(?:split|splits|grow|grows|feed|feeds)\b/u.test(lower)
  ) {
    score += 3.2;
  }
  if (
    /\bevil\b[^.!?]{0,90}\b(?:rot|rots|collapse|collapses|fail|fails|cannot|can't|can\s+not|doesn['’]?t|does\s+not|will\s+not)\b/u.test(lower) ||
    /\bevil\b[^.!?]{0,80}\b(?:prevail|prevails|win|wins)\b[^.!?]{0,80}\b(?:yet|but)\b[^.!?]{0,40}\b(?:cannot|can't|can\s+not|refuse|refuses)\b/u.test(lower) ||
    /\bcalled\b[^.!?]{0,80}\b(?:evil\b[^.!?]{0,40}\b(?:prevail|prevails|win|wins))\b[^.!?]{0,80}\b(?:yet|but)\b[^.!?]{0,40}\b(?:cannot|can't|can\s+not)\b/u.test(lower)
  ) {
    score += 4.4;
  }
  if (
    /\bevil\b[^.!?]{0,50}\b(?:always\s+)?(?:prevail|prevails|win|wins|rule|rules|dominate|dominates)\b/u.test(lower) &&
    !/\b(?:yet|but)\b[^.!?]{0,40}\b(?:cannot|can't|can\s+not|refuse|refuses)\b/u.test(lower)
  ) {
    score -= 3.2;
  }
  if (/\bgood(?:ness)?\b[^.!?]{0,40}\b(?:doesn['’]?t|does\s+not|cannot|can't|never)\b[^.!?]{0,40}\b(?:prevail|win)\b/u.test(lower)) {
    score -= 1.4;
  }
  return score;
}

function coffeePollPersonaOptionPrior(args: {
  question: string;
  option: string;
  bot: CoffeeBotProfile;
}): number {
  const botName = args.bot.name.toLowerCase();
  const persona = `${args.bot.name} ${args.bot.systemPrompt ?? ""}`.toLowerCase();
  const question = args.question.toLowerCase();
  const option = args.option.toLowerCase();
  let score = 0;

  const personaTokens = new Set(coffeePollSemanticTokens(persona));
  for (const token of coffeePollSemanticTokens(option)) {
    if (personaTokens.has(token)) score += 1.45;
  }

  const likesCustomers =
    scoreCoffeePollCue(persona, [
      /\bspongebob\b/u,
      /\bfry\s+cook\b/u,
      /\bcustomer(?:s)?\b/u,
      /\bservice\b/u,
      /\bgreet(?:ing)?\b/u,
      /\boptimis(?:m|tic)\b/u,
    ]) > 0;
  if (likesCustomers && /\b(?:greet|customer|service|welcome|opening)\b/u.test(option)) {
    score += 5.5;
  }

  const wantsQuiet =
    scoreCoffeePollCue(persona, [
      /\bsquidward\b/u,
      /\bquiet\b/u,
      /\bcivilized\b/u,
      /\bcashier\b/u,
      /\bclarinet\b/u,
      /\brefined\b/u,
    ]) > 0;
  if (wantsQuiet && /\b(?:quiet|civilized|calm|order|dining|peace)\b/u.test(option)) {
    score += 5.5;
  }
  if (wantsQuiet && /\b(?:greet|practice|snack|lunch)\b/u.test(option)) {
    score -= 0.75;
  }

  const wantsFood =
    scoreCoffeePollCue(persona, [
      /\bpatrick\b/u,
      /\bhungry\b/u,
      /\bsnack\b/u,
      /\blunch\b/u,
      /\bfood\b/u,
      /\beat(?:s|ing)?\b/u,
    ]) > 0;
  if (wantsFood && /\b(?:snack|lunch|eat|food|break|burger)\b/u.test(option)) {
    score += 6;
  }

  const wantsFormula =
    scoreCoffeePollCue(persona, [
      /\bplankton\b/u,
      /\bsteal(?:s|ing)?\b/u,
      /\bschem(?:e|es|ing|er)\b/u,
      /\brival\b/u,
      /\bformula\b/u,
    ]) > 0;
  if (wantsFormula && /\b(?:formula|secret|krabby|patty|steal|control)\b/u.test(option)) {
    score += 5.25;
  }

  const wantsProfit =
    scoreCoffeePollCue(persona, [
      /\bkrabs\b/u,
      /\bprofit(?:s)?\b/u,
      /\bmoney\b/u,
      /\bprice(?:s)?\b/u,
      /\bowner\b/u,
      /\bformula\b/u,
    ]) > 0;
  if (wantsProfit && /\b(?:profit|money|price|cash|count|formula|secret|protect)\b/u.test(option)) {
    score += 5.75;
  }

  if (
    /\bkrabs\b/u.test(botName) &&
    /\b(?:krabby|patty|formula|secret)\b/u.test(question)
  ) {
    if (/\bsecret\b/u.test(option)) score += 4.2;
    if (/\bcrab\b/u.test(option)) score -= 3.2;
  }
  return score;
}

const COFFEE_POLL_BALLOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    knowledgeBasis: {
      type: "string",
      enum: ["public_persona", "bot_profile", "mixed", "uncertain"],
      description:
        "Whether the stance uses model-internal public persona knowledge, the saved bot profile, both, or uncertainty.",
    },
    personaInstinct: {
      type: "string",
      description:
        "One short hidden background note about what this persona would likely want, care about, avoid, or misunderstand here.",
    },
    optionId: {
      type: "string",
      description: "The exact id of the chosen option, such as option-1.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    rationale: {
      type: "string",
      description: "One short in-character reason for the choice.",
    },
  },
  required: ["knowledgeBasis", "personaInstinct", "optionId", "confidence", "rationale"],
} as const;

function clampCoffeePollConfidence(raw: unknown, fallback = 0.68): number {
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.max(0.05, Math.min(1, Math.round(value * 100) / 100));
}

function normalizeCoffeePollBallotRationale(raw: unknown): string {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!value) return "Picked the closest in-character option.";
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
}

function normalizeCoffeePollKnowledgeBasis(raw: unknown): CoffeePollKnowledgeBasis | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (value === "public_persona" || value === "public" || value === "common_knowledge") {
    return "public_persona";
  }
  if (value === "bot_profile" || value === "profile" || value === "bot_specs") {
    return "bot_profile";
  }
  if (value === "mixed") return "mixed";
  if (value === "uncertain" || value === "unknown") return "uncertain";
  return null;
}

function normalizeCoffeePollPersonaInstinct(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!value) return null;
  return value.length > 220 ? `${value.slice(0, 217).trimEnd()}...` : value;
}

function formatCoffeePollBallotNote(ballot: CoffeePollStructuredBallot): string {
  return `${ballot.knowledgeBasis}: ${ballot.personaInstinct} ${ballot.rationale}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function coffeePollBallotOptionIndexFromId(raw: unknown, optionCount: number): number | null {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!value) return null;
  const match = value.match(/^(?:option|choice)[\s_-]*(\d+)$/u) ?? value.match(/^(\d+)$/u);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  const optionIndex = parsed - 1;
  return Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < optionCount
    ? optionIndex
    : null;
}

export function parseCoffeePollStructuredBallot(
  raw: string,
  options: readonly string[]
): CoffeePollStructuredBallot | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const objectMatch = trimmed.match(/\{[\s\S]*\}/u);
  if (objectMatch && objectMatch[0] !== trimmed) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const obj = parsed as {
        optionId?: unknown;
        optionIndex?: unknown;
        optionNumber?: unknown;
        optionText?: unknown;
        confidence?: unknown;
        rationale?: unknown;
        reason?: unknown;
        knowledgeBasis?: unknown;
        personaInstinct?: unknown;
      };
      const knowledgeBasis = normalizeCoffeePollKnowledgeBasis(obj.knowledgeBasis);
      const personaInstinct = normalizeCoffeePollPersonaInstinct(obj.personaInstinct);
      if (!knowledgeBasis || !personaInstinct) continue;
      const idIndex = coffeePollBallotOptionIndexFromId(obj.optionId, options.length);
      const rawOptionIndex =
        typeof obj.optionIndex === "number" && Number.isInteger(obj.optionIndex)
          ? obj.optionIndex
          : null;
      const rawOptionNumber =
        typeof obj.optionNumber === "number" && Number.isInteger(obj.optionNumber)
          ? obj.optionNumber - 1
          : null;
      const rawOptionText =
        typeof obj.optionText === "string" ? obj.optionText.trim().toLowerCase() : "";
      const textIndex = rawOptionText
        ? options.findIndex((option) => option.trim().toLowerCase() === rawOptionText)
        : -1;
      const optionIndex =
        idIndex ??
        (rawOptionIndex !== null && rawOptionIndex >= 0 && rawOptionIndex < options.length
          ? rawOptionIndex
          : null) ??
        (rawOptionNumber !== null && rawOptionNumber >= 0 && rawOptionNumber < options.length
          ? rawOptionNumber
          : null) ??
        (textIndex >= 0 ? textIndex : null);
      if (optionIndex === null) continue;
      return {
        knowledgeBasis,
        personaInstinct,
        optionIndex,
        confidence: clampCoffeePollConfidence(obj.confidence),
        rationale: normalizeCoffeePollBallotRationale(obj.rationale ?? obj.reason),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function buildCoffeePollBallotMessages(args: {
  poll: CoffeePoll;
  bot: CoffeeBotProfile;
  history: readonly ChatMessage[];
  playerOptionIndex?: number | null;
}): ProviderMessage[] {
  const contextSummary = formatCoffeeBotContextSummary(args.bot);
  const optionLines = args.poll.options.map((option, index) => `option-${index + 1}: ${option}`);
  const recentHistory = args.history.slice(-12);
  const playerVoteLine =
    typeof args.playerOptionIndex === "number" && args.playerOptionIndex >= 0
      ? `Player vote: ${args.poll.options[args.playerOptionIndex] ?? "unknown"}`
      : "Player vote: none yet";
  return [
    {
      role: "system",
      content: [
        "You are a hidden Coffee Mode poll clerk choosing one private ballot for one bot.",
        "First infer the persona's likely stance in this exact situation: what they would want, care about, avoid, protect, misunderstand, or impulsively prioritize.",
        "Use model-internal public/common persona knowledge when the character is recognizable. Do not browse the web. If you are not confident about public persona knowledge, defer to the saved bot persona/profile.",
        "Then choose the exact option that best matches that persona stance.",
        "Treat every option label as an exact claim the persona is endorsing, not just a nearby theme.",
        "For moral-opposition polls, distinguish a bleak observation from endorsement. A virtuous persona may admit evil hurts people without choosing an option that says evil ultimately prevails.",
        "If the persona would reject the literal wording of every option, choose the closest option and put the caveat in rationale.",
        "Do not choose the most sensible, responsible, diplomatic, or table-managing option unless this specific persona would actually prefer it.",
        "Do not choose by option order, repeated wording, or what seems healthiest for the group.",
        "If every option is imperfect, choose the closest in-character option.",
        "Reply with one JSON object only.",
        'Schema: {"knowledgeBasis":"public_persona|bot_profile|mixed|uncertain","personaInstinct":"hidden stance first","optionId":"option-1","confidence":0.0,"rationale":"one short reason"}',
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Bot id: ${args.bot.id}`,
        `Bot name: ${args.bot.name}`,
        `Bot persona: ${args.bot.systemPrompt || contextSummary || "No extra persona supplied."}`,
        contextSummary ? `Bot context: ${contextSummary}` : "",
        "",
        `Poll question: ${args.poll.question}`,
        "Options:",
        ...optionLines,
        playerVoteLine,
        "",
        recentHistory.length > 0
          ? ["Recent table transcript:", ...recentHistory.map(formatCoffeeTranscriptLine)].join("\n")
          : "Recent table transcript: none yet",
      ].filter(Boolean).join("\n"),
    },
  ];
}

async function generateCoffeePollStructuredBallot(args: {
  provider: LlmProvider;
  poll: CoffeePoll;
  bot: CoffeeBotProfile;
  history: readonly ChatMessage[];
  playerOptionIndex?: number | null;
}): Promise<CoffeePollStructuredBallot | null> {
  try {
    const raw = await args.provider.generateResponse(
      buildCoffeePollBallotMessages({
        poll: args.poll,
        bot: args.bot,
        history: args.history,
        playerOptionIndex: args.playerOptionIndex,
      }),
      {
        temperature: 0.1,
        maxTokens: 220,
        jsonMode: true,
        jsonSchema: COFFEE_POLL_BALLOT_SCHEMA,
        signal: AbortSignal.timeout(4_500),
      }
    );
    return parseCoffeePollStructuredBallot(raw, args.poll.options);
  } catch {
    return null;
  }
}

async function generateCoffeePollStructuredBallots(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  pollId: string;
  group: readonly CoffeeBotProfile[];
  settings: CoffeeTurnSettings;
  provider?: LlmProvider | null;
}): Promise<Map<string, CoffeePollStructuredBallot>> {
  const loaded = loadCoffeePollRows(args.db, args.userId, args.conversationId, args.pollId);
  if (!loaded) return new Map();
  const status = normalizeCoffeePollStatus(loaded.poll.status);
  if (status === "cancelled" || status === "closed") return new Map();
  const poll = mapCoffeePoll(loaded.poll, loaded.votes);
  const pendingBots = args.group.filter((bot) => {
    const existing = loaded.votes.find((vote) => vote.bot_id === bot.id);
    return normalizeCoffeePollVoteKind(existing?.vote_kind) !== "option";
  });
  if (pendingBots.length === 0) return new Map();
  const history = loadMessages(args.db, args.userId, args.conversationId, 50);
  const playerVote = poll.votes.find((vote) => vote.voterKind === "player");
  const playerOptionIndex =
    playerVote?.kind === "option" && typeof playerVote.optionIndex === "number"
      ? playerVote.optionIndex
      : null;
  const provider = args.provider ?? coffeeAuxiliaryProvider(args.settings);
  const entries = await Promise.all(
    pendingBots.map(async (bot): Promise<[string, CoffeePollStructuredBallot] | null> => {
      const ballot = await generateCoffeePollStructuredBallot({
        provider,
        poll,
        bot,
        history,
        playerOptionIndex,
      });
      return ballot ? [bot.id, ballot] : null;
    })
  );
  return new Map(entries.filter((entry): entry is [string, CoffeePollStructuredBallot] => entry !== null));
}

export function coffeePollIsInFinalizeWindow(
  remainingMs: number | null | undefined
): boolean {
  return (
    typeof remainingMs === "number" &&
    Number.isFinite(remainingMs) &&
    remainingMs >= 0 &&
    remainingMs <= COFFEE_POLL_FINALIZE_REMAINING_MS
  );
}

function coffeePollAssistantLines(
  history: readonly ChatMessage[],
  group: readonly CoffeeBotProfile[]
): Array<{ botId: string; botName: string; content: string }> {
  return history
    .filter((message): message is ChatMessage => message.role === "assistant")
    .filter((message) => coffeePollLineIsScorable(message))
    .map((message) => {
      const bot =
        group.find((candidate) => candidate.name === message.botName) ??
        group.find((candidate) => message.content.startsWith(`${candidate.name}:`));
      return {
        botId: bot?.id ?? "",
        botName: message.botName?.trim() || bot?.name || "Bot",
        content: message.content,
      };
    });
}

function coffeePollLineIsScorable(message: ChatMessage): boolean {
  if (message.role !== "assistant") return true;
  return (
    !coffeeReplyLooksLikePromptLeak(message.content) &&
    !coffeeReplyBreaksCharacterImmersion(message.content)
  );
}

function coffeePollScorableTranscript(history: readonly ChatMessage[]): string {
  return history
    .filter(coffeePollLineIsScorable)
    .map(formatCoffeeTranscriptLine)
    .join("\n");
}

function scoreCoffeePollOptionsForBot(args: {
  pollId: string;
  question: string;
  options: readonly string[];
  bot: CoffeeBotProfile;
  transcript: string;
  assistantLines: readonly { botId: string; botName: string; content: string }[];
  playerOptionIndex?: number | null;
}): number[] {
  const scores: number[] = args.options.map(
    (_, index) => 0.1 + stableUnitValue(`${args.pollId}:${args.bot.id}:${index}:tie`) * 0.08
  );
  const booleanOptionIndices = coffeeBooleanPollOptionIndices(args.options);
  const goodEvilOptionIndices = coffeeGoodEvilPollOptionIndices(args.options);
  for (let index = 0; index < args.options.length; index += 1) {
    const option = args.options[index] ?? "";
    scores[index] += coffeePollPersonaOptionPrior({
      question: args.question,
      option,
      bot: args.bot,
    });
    scores[index] += scoreCoffeePollOptionInLine(args.transcript, option) * 0.45;
  }
  const recentPeerLines = args.assistantLines
    .filter((line) => line.botId !== args.bot.id)
    .slice(-5);
  for (const line of recentPeerLines) {
    for (let index = 0; index < args.options.length; index += 1) {
      scores[index] += Math.max(0, scoreCoffeePollOptionInLine(line.content, args.options[index] ?? "")) * 0.55;
    }
    if (booleanOptionIndices) {
      const stance = scoreCoffeeBooleanStanceInLine(args.question, line.content);
      if (stance > 0) scores[booleanOptionIndices.trueIndex] += stance * 0.3;
      if (stance < 0) scores[booleanOptionIndices.falseIndex] += Math.abs(stance) * 0.3;
    }
    if (goodEvilOptionIndices) {
      const stance = scoreCoffeeGoodEvilStanceInLine(args.question, line.content);
      if (stance > 0) scores[goodEvilOptionIndices.goodIndex] += stance * 0.35;
      if (stance < 0) scores[goodEvilOptionIndices.evilIndex] += Math.abs(stance) * 0.35;
    }
  }
  const ownLines = args.assistantLines.filter((entry) => entry.botId === args.bot.id);
  for (const [lineIndex, line] of ownLines.entries()) {
    const recencyWeight = 1 + (lineIndex / Math.max(1, ownLines.length - 1)) * 1.2;
    for (let index = 0; index < args.options.length; index += 1) {
      scores[index] += scoreCoffeePollOptionInLine(line.content, args.options[index] ?? "") * 1.1 * recencyWeight;
    }
    if (booleanOptionIndices) {
      const stance = scoreCoffeeBooleanStanceInLine(args.question, line.content) * recencyWeight;
      if (stance > 0) scores[booleanOptionIndices.trueIndex] += stance * 2.1;
      if (stance < 0) scores[booleanOptionIndices.falseIndex] += Math.abs(stance) * 2.1;
    }
    if (goodEvilOptionIndices) {
      const stance = scoreCoffeeGoodEvilStanceInLine(args.question, line.content) * recencyWeight;
      if (stance > 0) scores[goodEvilOptionIndices.goodIndex] += stance * 2.4;
      if (stance < 0) scores[goodEvilOptionIndices.evilIndex] += Math.abs(stance) * 2.4;
    }
  }
  if (typeof args.playerOptionIndex === "number" && args.playerOptionIndex >= 0) {
    scores[args.playerOptionIndex] =
      (scores[args.playerOptionIndex] ?? 0) + 1.15;
  }
  const userTranscript = args.transcript
    .split("\n")
    .filter((line) => line.startsWith("User:"))
    .join("\n")
    .toLowerCase();
  if (userTranscript.length > 0) {
    for (let index = 0; index < args.options.length; index += 1) {
      const token = args.options[index]?.toLowerCase() ?? "";
      if (token.length >= 3 && userTranscript.includes(token)) {
        scores[index] += 0.55;
      }
    }
  }
  return scores;
}

function resolveCoffeePollBotVote(args: {
  forceClose: boolean;
  inFinalizeWindow: boolean;
  leaningOptionIndex: number;
  existingVoteKind: CoffeePollVoteKind;
  existingOptionIndex: number | null;
  allowLockedRevote?: boolean;
  requireStructuredBallotForVisibleVote?: boolean;
  hasStructuredBallot?: boolean;
}): { commit: boolean; optionIndex: number | null; revote: boolean } {
  const hasLockedVote =
    args.existingVoteKind === "option" && typeof args.existingOptionIndex === "number";
  if (hasLockedVote && args.allowLockedRevote !== true) {
    return {
      commit: true,
      optionIndex: args.existingOptionIndex,
      revote: false,
    };
  }
  if (
    args.requireStructuredBallotForVisibleVote === true &&
    args.hasStructuredBallot !== true &&
    !args.inFinalizeWindow &&
    !args.forceClose
  ) {
    return {
      commit: false,
      optionIndex: null,
      revote: false,
    };
  }

  return {
    commit: true,
    optionIndex: args.leaningOptionIndex,
    revote: hasLockedVote && args.existingOptionIndex !== args.leaningOptionIndex,
  };
}

function computeCoffeePollDeliberationForBot(args: {
  pollId: string;
  question: string;
  options: readonly string[];
  bot: CoffeeBotProfile;
  transcript: string;
  assistantLines: readonly { botId: string; botName: string; content: string }[];
  messageCount: number;
  sessionRemainingMs: number | null | undefined;
  now: string;
  inFinalizeWindow: boolean;
  forceClose: boolean;
  existingVoteKind?: CoffeePollVoteKind;
  existingOptionIndex?: number | null;
  playerOptionIndex?: number | null;
  structuredBallot?: CoffeePollStructuredBallot | null;
  requireStructuredBallotForVisibleVote?: boolean;
}): {
  voteKind: CoffeePollVoteKind;
  optionIndex: number | null;
  explanation: string | null;
  confidence: number | null;
  deliberation: CoffeePollDeliberation;
} {
  const ballot =
    args.structuredBallot &&
    args.structuredBallot.optionIndex >= 0 &&
    args.structuredBallot.optionIndex < args.options.length
      ? args.structuredBallot
      : null;
  const scores = ballot
    ? []
    : scoreCoffeePollOptionsForBot({
        pollId: args.pollId,
        question: args.question,
        options: args.options,
        bot: args.bot,
        transcript: args.transcript,
        assistantLines: args.assistantLines,
        playerOptionIndex: args.playerOptionIndex,
      });
  const ranked = ballot
    ? [{ score: ballot.confidence, optionIndex: ballot.optionIndex }]
    : scores
        .map((score, optionIndex) => ({ score, optionIndex }))
        .sort((left, right) => right.score - left.score);
  const top = ranked[0] ?? { score: 0, optionIndex: 0 };
  const second = ranked[1] ?? { score: 0, optionIndex: top.optionIndex };
  const leaningOptionIndex = top.optionIndex;
  const alternateOptionIndex = ballot
    ? null
    : second.score > 0 && top.score - second.score < 1.25
      ? second.optionIndex
      : null;
  const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
  const confidence = ballot
    ? ballot.confidence
    : Math.round((0.35 + (top.score / Math.max(1, scoreTotal)) * 0.55) * 100) / 100;
  const leaningLabel = args.options[leaningOptionIndex] ?? args.options[0] ?? "";
  const alternateLabel =
    alternateOptionIndex === null ? null : args.options[alternateOptionIndex] ?? null;
  const existingVoteKind = args.existingVoteKind ?? "pending";
  const existingOptionIndex = args.existingOptionIndex ?? null;
  const existingScore =
    existingVoteKind === "option" && typeof existingOptionIndex === "number"
      ? scores[existingOptionIndex] ?? 0
      : null;
  const allowLockedRevote =
    !ballot &&
    existingVoteKind === "option" &&
    typeof existingOptionIndex === "number" &&
    existingOptionIndex !== leaningOptionIndex &&
    top.score >= 2.5 &&
    existingScore !== null &&
    top.score - existingScore >= 2.2;
  const voteDecision = resolveCoffeePollBotVote({
    forceClose: args.forceClose,
    inFinalizeWindow: args.inFinalizeWindow,
    leaningOptionIndex,
    existingVoteKind,
    existingOptionIndex,
    allowLockedRevote,
    requireStructuredBallotForVisibleVote: args.requireStructuredBallotForVisibleVote,
    hasStructuredBallot: ballot !== null,
  });

  let stage: CoffeePollDeliberation["stage"];
  if (voteDecision.commit && (args.forceClose || confidence >= 0.72)) {
    stage = "finalized";
  } else if (voteDecision.commit) {
    stage = "finalized";
  } else if (args.inFinalizeWindow) {
    stage = "deciding";
  } else if (args.messageCount <= 0) {
    stage = "idle";
  } else if (alternateOptionIndex !== null || voteDecision.revote) {
    stage = "teetering";
  } else {
    stage = "evaluating";
  }

  const note = ballot
    ? formatCoffeePollBallotNote(ballot)
    : args.requireStructuredBallotForVisibleVote === true && !voteDecision.commit
      ? "Waiting for a valid persona-stance ballot before showing a vote."
    : stage === "teetering" && alternateLabel
      ? voteDecision.revote
        ? `Rethinking after the table made the case for "${alternateLabel}".`
        : `Still weighing "${leaningLabel}" against "${alternateLabel}".`
      : stage === "deciding" && alternateLabel
        ? `Nearly settled on "${leaningLabel}", but "${alternateLabel}" still tugs.`
        : stage === "idle"
          ? "Listening before leaning."
          : null;

  if (voteDecision.commit && typeof voteDecision.optionIndex === "number") {
    const optionIndex = voteDecision.optionIndex;
    const pickedLabel = args.options[optionIndex] ?? leaningLabel;
    const explanation = voteDecision.revote
      ? `${args.bot.name} changes to "${pickedLabel}" after hearing the table.`
      : existingVoteKind === "option"
        ? `${args.bot.name} holds with "${pickedLabel}".`
        : ballot
          ? `${args.bot.name} picks "${pickedLabel}": ${ballot.rationale}`
          : `${args.bot.name} picks "${pickedLabel}" once they had heard enough.`;
    return {
      voteKind: "option",
      optionIndex,
      explanation,
      confidence,
      deliberation: {
        stage,
        leaningOptionIndex: optionIndex,
        alternateOptionIndex,
        confidence,
        blocker: null,
        note,
        updatedAt: args.now,
      },
    };
  }

  return {
    voteKind: "pending",
    optionIndex: null,
    explanation: null,
    confidence,
    deliberation: {
      stage,
      leaningOptionIndex: voteDecision.commit ? leaningOptionIndex : null,
      alternateOptionIndex: voteDecision.commit ? alternateOptionIndex : null,
      confidence,
      blocker: null,
      note,
      updatedAt: args.now,
    },
  };
}

function formatCoffeeActivePollContext(
  poll: CoffeePoll,
  group: readonly CoffeeBotProfile[],
  sessionRemainingMs: number | null | undefined
): string {
  const inFinalize = coffeePollIsInFinalizeWindow(sessionRemainingMs);
  const optionList = poll.options.map((option, index) => `${index + 1}. ${option}`).join(" ");
  const leaningLines = poll.votes
    .filter((vote) => vote.voterKind !== "player")
    .map((vote) => {
      const bot = group.find((candidate) => candidate.id === vote.botId);
      const leaningIndex = vote.deliberation?.leaningOptionIndex;
      if (typeof leaningIndex !== "number") return null;
      const leaning = poll.options[leaningIndex];
      if (!leaning) return null;
      const alternateIndex = vote.deliberation?.alternateOptionIndex;
      const alternate =
        typeof alternateIndex === "number" ? poll.options[alternateIndex] : null;
      if (vote.kind === "option" && typeof vote.optionIndex === "number") {
        const locked = poll.options[vote.optionIndex] ?? leaning;
        return `${bot?.name ?? vote.botId} locked on ${locked}`;
      }
      if (alternate) {
        return `${bot?.name ?? vote.botId} teetering between ${leaning} and ${alternate}`;
      }
      return `${bot?.name ?? vote.botId} leaning ${leaning}`;
    })
    .filter((line): line is string => Boolean(line));
  const playerVote = poll.votes.find((vote) => vote.voterKind === "player");
  const playerVoteLine =
    playerVote?.kind === "option" && typeof playerVote.optionIndex === "number"
      ? `The player voted for "${poll.options[playerVote.optionIndex] ?? "an option"}".`
      : "";
  return [
    `Active table poll: "${poll.question}".`,
    `Options: ${optionList}.`,
    inFinalize
      ? "Any bot still undecided must lock a vote now — persuasive arguments can still move people."
      : "Bots choose a poll option as they arrive, but persuasive arguments can still move their vote while the poll is open.",
    playerVoteLine,
    leaningLines.length > 0 ? `Current leanings: ${leaningLines.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function loadActiveCoffeeSessionPoll(
  db: DatabaseSync,
  userId: string,
  conversationId: string
): CoffeePoll | null {
  const loaded = loadCoffeePollRows(db, userId, conversationId);
  if (!loaded) return null;
  const status = normalizeCoffeePollStatus(loaded.poll.status);
  if (status === "closed" || status === "cancelled") return null;
  return mapCoffeePoll(loaded.poll, loaded.votes);
}

function advanceCoffeePollState(args: {
  db: DatabaseSync;
  userId: string;
  conversationId: string;
  pollId: string;
  group: readonly CoffeeBotProfile[];
  sessionRemainingMs: number | null | undefined;
  historyLimit?: number;
  structuredBallotsByBotId?: ReadonlyMap<string, CoffeePollStructuredBallot>;
  requireStructuredBallotForVisibleVote?: boolean;
}): CoffeePoll {
  const loaded = loadCoffeePollRows(args.db, args.userId, args.conversationId, args.pollId);
  if (!loaded) {
    throw new Error("Coffee poll not found.");
  }
  const status = normalizeCoffeePollStatus(loaded.poll.status);
  if (status === "cancelled" || status === "closed") {
    return mapCoffeePoll(loaded.poll, loaded.votes);
  }

  const options = parseCoffeePollOptions(loaded.poll.options_json);
  const historyLimit = args.historyLimit ?? 80;
  const history = loadMessages(args.db, args.userId, args.conversationId, historyLimit);
  const transcript = coffeePollScorableTranscript(history);
  const assistantLines = coffeePollAssistantLines(history, args.group);
  const messageCount = history.length;
  const playerVoteRow = loaded.votes.find((vote) => vote.bot_id === COFFEE_POLL_PLAYER_VOTER_ID);
  const playerOptionIndex =
    playerVoteRow && normalizeCoffeePollVoteKind(playerVoteRow.vote_kind) === "option"
      ? playerVoteRow.option_index
      : null;
  const inFinalize = coffeePollIsInFinalizeWindow(args.sessionRemainingMs);
  const forceClose =
    typeof args.sessionRemainingMs === "number" &&
    Number.isFinite(args.sessionRemainingMs) &&
    args.sessionRemainingMs <= 0;
  const now = new Date().toISOString();
  const nextStatus: CoffeePollStatus = forceClose
    ? "closed"
    : inFinalize
      ? "collecting"
      : "open";

  const voteUpsert = args.db.prepare(
    `INSERT INTO coffee_poll_votes
       (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
        explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(user_id, poll_id, bot_id) DO UPDATE SET
       vote_kind = excluded.vote_kind,
       option_index = excluded.option_index,
       explanation = excluded.explanation,
       suggested_option = excluded.suggested_option,
       confidence = excluded.confidence,
       deliberation_json = excluded.deliberation_json,
       updated_at = excluded.updated_at`
  );

  for (const bot of args.group) {
    const existingVote = loaded.votes.find((vote) => vote.bot_id === bot.id);
    const computed = computeCoffeePollDeliberationForBot({
      pollId: args.pollId,
      question: loaded.poll.question,
      options,
      bot,
      transcript,
      assistantLines,
      messageCount,
      sessionRemainingMs: args.sessionRemainingMs,
      now,
      inFinalizeWindow: inFinalize,
      forceClose,
      existingVoteKind: normalizeCoffeePollVoteKind(existingVote?.vote_kind),
      existingOptionIndex: existingVote?.option_index ?? null,
      playerOptionIndex,
      structuredBallot: args.structuredBallotsByBotId?.get(bot.id) ?? null,
      requireStructuredBallotForVisibleVote: args.requireStructuredBallotForVisibleVote,
    });
    voteUpsert.run(
      args.userId,
      args.pollId,
      args.conversationId,
      bot.id,
      computed.voteKind,
      computed.optionIndex,
      computed.explanation,
      computed.confidence,
      JSON.stringify(computed.deliberation),
      now,
      now
    );
  }

  args.db
    .prepare(
      `UPDATE coffee_polls
          SET status = ?,
              closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END,
              updated_at = ?
        WHERE id = ? AND user_id = ? AND conversation_id = ?`
    )
    .run(
      nextStatus,
      nextStatus,
      now,
      now,
      args.pollId,
      args.userId,
      args.conversationId
    );

  const loadedAfter = loadCoffeePollRows(args.db, args.userId, args.conversationId, args.pollId);
  if (!loadedAfter) {
    throw new Error("Coffee poll not found.");
  }
  return mapCoffeePoll(loadedAfter.poll, loadedAfter.votes);
}

export async function collectCoffeePollVotes(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  pollId: string,
  settings: CoffeeTurnSettings,
  options?: {
    structuredBallots?: boolean;
    pollVoteProvider?: LlmProvider | null;
  }
): Promise<{ poll: CoffeePoll }> {
  const { group } = loadCoffeeConversationGroup(db, userId, conversationId);
  const structuredBallotsByBotId =
    options?.structuredBallots === true
      ? await generateCoffeePollStructuredBallots({
          db,
          userId,
          conversationId,
          pollId,
          group,
          settings,
          provider: options.pollVoteProvider,
        })
      : undefined;
  const poll = advanceCoffeePollState({
    db,
    userId,
    conversationId,
    pollId,
    group,
    sessionRemainingMs: settings.sessionRemainingMs,
    structuredBallotsByBotId,
    requireStructuredBallotForVisibleVote: options?.structuredBallots === true,
  });
  return { poll };
}

export function setCoffeePollPlayerVote(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  pollId: string,
  rawOptionIndex: unknown,
  sessionRemainingMs: number | null | undefined = null
): CoffeePoll {
  const loaded = loadCoffeePollRows(db, userId, conversationId, pollId);
  if (!loaded) {
    throw new Error("Coffee poll not found.");
  }
  const status = normalizeCoffeePollStatus(loaded.poll.status);
  if (status === "cancelled" || status === "closed") {
    throw new Error("Coffee poll is closed.");
  }
  const options = parseCoffeePollOptions(loaded.poll.options_json);
  const optionIndex =
    typeof rawOptionIndex === "number" && Number.isFinite(rawOptionIndex)
      ? Math.floor(rawOptionIndex)
      : -1;
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw new Error("Invalid poll option.");
  }
  const now = new Date().toISOString();
  const picked = options[optionIndex] ?? "";
  db.prepare(
    `INSERT INTO coffee_poll_votes
       (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
        explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'option', ?, ?, NULL, 1, ?, ?, ?)
     ON CONFLICT(user_id, poll_id, bot_id) DO UPDATE SET
       vote_kind = excluded.vote_kind,
       option_index = excluded.option_index,
       explanation = excluded.explanation,
       suggested_option = excluded.suggested_option,
       confidence = excluded.confidence,
       deliberation_json = excluded.deliberation_json,
       updated_at = excluded.updated_at`
  ).run(
    userId,
    pollId,
    conversationId,
    COFFEE_POLL_PLAYER_VOTER_ID,
    optionIndex,
    `You picked "${picked}".`,
    JSON.stringify({
      stage: "finalized",
      leaningOptionIndex: optionIndex,
      alternateOptionIndex: null,
      confidence: 1,
      blocker: null,
      note: null,
      updatedAt: now,
    }),
    now,
    now
  );
  const { group } = loadCoffeeConversationGroup(db, userId, conversationId);
  return advanceCoffeePollState({
    db,
    userId,
    conversationId,
    pollId,
    group,
    sessionRemainingMs,
  });
}

export async function createCoffeeTeamsForSession(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  input: CoffeeTeamCreateInput,
  llm?: CoffeeAuxiliaryOptions | null
): Promise<{ conversation: Conversation; teams: CoffeeTeamState }> {
  const { row, group, groupIds } = loadCoffeeConversationGroup(db, userId, conversationId);
  if (parseCoffeeTeamState(row.coffee_team_mode_json)) {
    throw new Error("Coffee Teams already started for this session.");
  }
  if (loadActiveCoffeeSessionPoll(db, userId, conversationId)) {
    throw new Error("Coffee Teams and opening polls are separate start options.");
  }
  const config = normalizeCoffeeTeamSessionConfig(input, groupIds);
  if (!config) throw new Error("Coffee Teams setup is required.");
  const now = new Date().toISOString();
  const teams = buildInitialCoffeeTeamState({
    group,
    config,
    conversationId,
    now,
  });
  const topic = generateCoffeeTeamsTopic(teams);
  db.prepare(
    `UPDATE conversations
        SET coffee_topic = ?,
            title = ?,
            coffee_team_mode_json = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(topic, generateCoffeeTitle(topic, group), serializeCoffeeTeamState(teams), now, conversationId, userId);
  const refreshed = loadConversationRow(db, userId, conversationId) ?? row;
  return {
    conversation: buildConversationResponse({
      row: refreshed,
      messages: loadMessages(db, userId, conversationId, 200),
      lastSpeakerBotId: loadLastSpeakerBotId(db, userId, conversationId),
      socialByBotId: loadCoffeeBotSocialState(db, userId, conversationId, groupIds),
    }),
    teams,
  };
}

export function setCoffeePlayerTeam(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rawTeamId: unknown
): { conversation: Conversation; teams: CoffeeTeamState } {
  const { row, group, groupIds } = loadCoffeeConversationGroup(db, userId, conversationId);
  const state = parseCoffeeTeamState(row.coffee_team_mode_json);
  if (!state) throw new Error("Coffee Teams is not active for this session.");
  if (state.status !== "active") {
    throw new Error("Coffee Teams switching is only available while the debate is active.");
  }
  if (!isCoffeeTeamId(rawTeamId)) throw new Error("Pick left, right, or undecided.");

  const now = new Date().toISOString();
  const previousTeamId = state.player?.currentTeamId ?? "undecided";
  const previousLabel = coffeeAnyTeamName(state, previousTeamId);
  const nextLabel = coffeeAnyTeamName(state, rawTeamId);
  const changed = previousTeamId !== rawTeamId;
  const lastSwitchReason =
    previousTeamId === rawTeamId
      ? state.player?.lastSwitchReason ?? null
      : previousTeamId === "undecided"
        ? `Joined ${nextLabel}.`
      : rawTeamId === "undecided"
        ? `Stepped back from ${previousLabel} to Undecided.`
        : `Switched from ${previousLabel} to ${nextLabel}.`;
  const player: CoffeeTeamPlayerState = {
    originalTeamId: state.player?.originalTeamId ?? rawTeamId,
    currentTeamId: rawTeamId,
    lastSwitchReason,
    updatedAt: now,
  };
  const counts = coffeeTeamCountsFromParticipants(state.bots, player);
  const allCount = group.length + 1;
  const winnerTeamId =
    counts.left === allCount ? "left" : counts.right === allCount ? "right" : null;
  const next: CoffeeTeamState = {
    ...state,
    player,
    counts,
    status: winnerTeamId ? coffeeTeamWinnerStatus(winnerTeamId) : state.status,
    winnerTeamId: winnerTeamId ?? state.winnerTeamId ?? null,
    resolvedAt: winnerTeamId ? now : state.resolvedAt ?? null,
    updatedAt: now,
  };

  if (changed) {
    const actionText =
      previousTeamId === "undecided"
        ? `*joins ${nextLabel}*`
        : rawTeamId === "undecided"
          ? `*steps back to Undecided after leaving ${previousLabel}*`
          : `*switches from ${previousLabel} to ${nextLabel}*`;
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
       VALUES (?, ?, ?, 'user', ?, NULL, ?)`
    ).run(randomId(12), row.id, userId, actionText, now);
  }

  db.prepare(
    `UPDATE conversations
        SET coffee_team_mode_json = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(serializeCoffeeTeamState(next), now, conversationId, userId);

  const refreshed = loadConversationRow(db, userId, conversationId) ?? row;
  return {
    conversation: buildConversationResponse({
      row: refreshed,
      messages: loadMessages(db, userId, conversationId, 200),
      lastSpeakerBotId: loadLastSpeakerBotId(db, userId, conversationId),
      socialByBotId: loadCoffeeBotSocialState(db, userId, conversationId, groupIds),
    }),
    teams: next,
  };
}

export function resolveCoffeeTeamTiebreaker(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rawWinnerTeamId: unknown
): { conversation: Conversation; teams: CoffeeTeamState } {
  const { row, groupIds } = loadCoffeeConversationGroup(db, userId, conversationId);
  const state = parseCoffeeTeamState(row.coffee_team_mode_json);
  if (!state) throw new Error("Coffee Teams is not active for this session.");
  if (!isCoffeeWinningTeamId(rawWinnerTeamId)) throw new Error("Pick left or right to resolve this tie.");
  if (!coffeeTeamsAreTied(state) && state.status !== "tiebreaker") {
    throw new Error("Coffee Teams tiebreaker is only available for tied sessions.");
  }
  const now = new Date().toISOString();
  const next: CoffeeTeamState = {
    ...state,
    status: "tie_resolved",
    winnerTeamId: rawWinnerTeamId,
    tiebreakerPromptedAt: state.tiebreakerPromptedAt ?? now,
    resolvedAt: now,
    updatedAt: now,
  };
  db.prepare(
    `UPDATE conversations
        SET coffee_team_mode_json = ?,
            updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(serializeCoffeeTeamState(next), now, conversationId, userId);
  const refreshed = loadConversationRow(db, userId, conversationId) ?? row;
  return {
    conversation: buildConversationResponse({
      row: refreshed,
      messages: loadMessages(db, userId, conversationId, 200),
      lastSpeakerBotId: loadLastSpeakerBotId(db, userId, conversationId),
      socialByBotId: loadCoffeeBotSocialState(db, userId, conversationId, groupIds),
    }),
    teams: next,
  };
}

/**
 * Pure, unit-testable piece of the speaker provider decision: a bot that
 * the user has marked "Offline only" (`online_enabled = 0` in the DB,
 * `onlineEnabled = false` here) ALWAYS resolves to local, regardless of
 * the session's preferred provider. The picker UI surfaces a "this
 * session will run fully offline" notice driven by the same rule, and the
 * bot editor visually commits to a "🔒 Protected" state — this function
 * is the single point of enforcement on the API side.
 */
export function effectiveCoffeeSpeakerProvider(
  speakerOnlineEnabled: boolean,
  preferred: ProviderName
): ProviderName {
  if (preferred !== "local" && !speakerOnlineEnabled) return "local";
  return preferred;
}

/**
 * Build a `LlmProvider` for the speaker bot, honoring per-bot online
 * gating (a bot with `online_enabled = 0` always falls back to local).
 */
function pickSpeakerProvider(
  speaker: CoffeeBotProfile,
  preferred: ProviderName,
  openAiApiKey: string | undefined,
  secondaryOllamaHost: string | null | undefined,
  anthropicApiKey: string | undefined
): { provider: LlmProvider; effectiveProvider: ProviderName } {
  const effective = effectiveCoffeeSpeakerProvider(speaker.onlineEnabled, preferred);
  const provider = selectProvider(
    effective,
    openAiApiKey,
    secondaryOllamaHost,
    anthropicApiKey
  );
  return { provider, effectiveProvider: effective };
}

function pickSpeakerModel(
  speaker: CoffeeBotProfile,
  effectiveProvider: ProviderName,
  sessionOverride?: string | null
): string | undefined {
  const trimmed =
    typeof sessionOverride === "string" ? sessionOverride.trim() : "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  if (effectiveProvider === "local") {
    return speaker.localModel ?? speaker.defaultModel ?? undefined;
  }
  return speaker.onlineModel ?? speaker.defaultModel ?? undefined;
}

async function ensureCoffeeAboutYouMemory(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer | undefined;
  conversationId: string;
  botId: string;
  sourceMessageId: string | null;
  userDisplayName?: string;
}): Promise<void> {
  const { db, userId, userKey, conversationId, botId, sourceMessageId, userDisplayName } = args;
  if (!userKey) return;
  if (hasAboutYouMemoryForBot(db, userId, botId)) return;
  const aboutYouText = buildInitialAboutYouMemoryText(userDisplayName);
  if (!aboutYouText) return;
  await restoreMemory(db, userId, userKey, {
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

export async function createCoffeeConversation(
  db: DatabaseSync,
  userId: string,
  input: CoffeeSessionCreateInput,
  llm?: (CoffeeAuxiliaryOptions & { autoPickStarterTopic?: boolean; userKey?: Buffer }) | null
): Promise<CoffeeSessionCreateResponse> {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = attachCoffeeBotSemanticFacets(
    db,
    userId,
    loadCoffeeGroupProfiles(db, userId, groupIds),
    llm?.prismDefaultLlmModel
  );
  const initialTeamsConfig = normalizeCoffeeTeamSessionConfig(input.initialTeams, groupIds);
  if (input.initialPoll && initialTeamsConfig) {
    throw new Error("Coffee Teams and opening polls are separate start options.");
  }
  const now = new Date().toISOString();
  const conversationId = randomId(12);
  const durableRelationshipsBySource = loadBotRelationshipsForBots(
    db,
    userId,
    group.map((bot) => bot.id)
  );
  const initialSocialByBotId =
    Object.keys(durableRelationshipsBySource).length > 0
      ? seedCoffeeSocialStateFromRelationships({
          socialByBotId: initializeCoffeeSocialState(group, {}),
          relationshipsBySource: durableRelationshipsBySource,
        })
      : initializeCoffeeSocialState(group, {});
  const sessionSettings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const coffeeSettingsJson = JSON.stringify(sessionSettings);
  const durationMinutes =
    input.durationMinutes === undefined || input.durationMinutes === null
      ? null
      : normalizeCoffeeSessionDurationMinutes(input.durationMinutes);
  const coffeeAbsentBotIds = normalizeCoffeeExcludedBotIds(input.coffeeAbsentBotIds);
  let presetLabel: string | null = null;
  if (typeof input.presetId === "string" && input.presetId.trim().length > 0) {
    try {
      presetLabel = resolveCoffeePreset(db, userId, input.presetId.trim()).name;
    } catch {
      presetLabel = null;
    }
  }
  db.prepare(
    `INSERT INTO conversations
       (id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito,
        coffee_settings, coffee_group_id, coffee_duration_minutes, coffee_preset_id, coffee_topic,
        coffee_absent_bot_ids, coffee_team_mode_json, created_at, updated_at)
     VALUES (?, ?, ?, 'coffee', NULL, ?, 0, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)`
  ).run(
    conversationId,
    userId,
    generateCoffeeTitle("", group),
    JSON.stringify(seatBotIds),
    coffeeSettingsJson,
    input.coffeeGroupId ?? null,
    durationMinutes,
    input.presetId ?? null,
    JSON.stringify(coffeeAbsentBotIds),
    now,
    now
  );
  upsertCoffeeBotSocialState(db, userId, conversationId, initialSocialByBotId, now);
  const provider = coffeeAuxiliaryProvider(llm);
  const attendanceContext = loadCoffeeAttendanceContext({
    db,
    userId,
    conversationId,
    coffeeGroupId: input.coffeeGroupId,
    group,
    absentBotIds: coffeeAbsentBotIds,
  });
  const starterMemoryContext = loadCoffeeStarterMemoryContext({
    db,
    userId,
    userKey: llm?.userKey,
    group,
  });
  const providedStarterTopics = selectCoffeeStarterTopicLabels(
    (input.starterTopics ?? []).map((label) => ({ label })),
    group,
    COFFEE_GROUP_STARTER_TOPIC_MAX
  );
  let coffeeStarterTopics = initialTeamsConfig
    ? []
    : providedStarterTopics.length > 0
      ? providedStarterTopics
      : await inferCoffeeStarterTopics({
          provider,
          group,
          sessionSettings,
          presetLabel,
          memoryContext: starterMemoryContext,
          attendanceContext,
        });
  let persistedTopic: string | null = null;
  let initialTeamsState: CoffeeTeamState | null = null;
  if (llm?.autoPickStarterTopic === true && coffeeStarterTopics.length > 0) {
    persistedTopic =
      coffeeStarterTopics[Math.floor(Math.random() * coffeeStarterTopics.length)] ?? null;
    if (persistedTopic && persistedTopic.trim().length > 0) {
      const topic = persistedTopic.trim();
      db.prepare(
        `UPDATE conversations
            SET coffee_topic = ?, title = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`
      ).run(topic, generateCoffeeTitle(topic, group), now, conversationId, userId);
    }
  }
  if (initialTeamsConfig) {
    initialTeamsState = buildInitialCoffeeTeamState({
      group,
      config: initialTeamsConfig,
      conversationId,
      now,
    });
    const teamTopic = generateCoffeeTeamsTopic(initialTeamsState);
    persistedTopic = teamTopic;
    db.prepare(
      `UPDATE conversations
          SET coffee_topic = ?,
              title = ?,
              coffee_team_mode_json = ?,
              updated_at = ?
        WHERE id = ? AND user_id = ?`
    ).run(
      teamTopic,
      generateCoffeeTitle(teamTopic, group),
      serializeCoffeeTeamState(initialTeamsState),
      now,
      conversationId,
      userId
    );
  }
  const row = loadConversationRow(db, userId, conversationId);
  if (!row) {
    throw new Error("Failed to create Coffee conversation.");
  }
  const response: CoffeeSessionCreateResponse = {
    conversation: buildConversationResponse({
      row,
      messages: [],
      lastSpeakerBotId: null,
      socialByBotId: initialSocialByBotId,
    }),
    arrivalScenario: pickArrivalScenario(conversationId),
  };
  if (!persistedTopic?.trim()) {
    response.coffeeStarterTopics = coffeeStarterTopics;
  }
  if (input.initialPoll) {
    response.poll = createCoffeePoll(db, userId, conversationId, input.initialPoll);
  }
  if (initialTeamsState) {
    response.teams = initialTeamsState;
  }
  return response;
}

export async function createCoffeeConversationFromGroup(
  db: DatabaseSync,
  userId: string,
  groupId: string,
  input: CoffeeGroupSessionCreateInput = {},
  llm?: (CoffeeAuxiliaryOptions & { userKey?: Buffer }) | null
): Promise<CoffeeSessionCreateResponse> {
  const row = loadCoffeeGroupRow(db, userId, groupId);
  if (!row) throw new Error("Coffee group not found.");
  const group = mapCoffeeGroupRow(db, row);
  const requestedPresetId =
    typeof input.presetId === "string" && input.presetId.trim().length > 0
      ? input.presetId.trim()
      : null;
  const shouldAutoPickPreset = requestedPresetId === COFFEE_AUTO_PRESET_ID || group.presetMode === "auto";
  const pickedPreset = shouldAutoPickPreset
    ? pickRandomCoffeePreset(db, userId)
    : requestedPresetId
      ? resolveCoffeePreset(db, userId, requestedPresetId)
      : null;
  const settings = pickedPreset
    ? pickedPreset.settings
    : input.coffeeSettings === undefined
      ? group.coffeeSettings
      : normalizeCoffeeSessionSettings({
          ...group.coffeeSettings,
          ...(input.coffeeSettings && typeof input.coffeeSettings === "object" && !Array.isArray(input.coffeeSettings)
            ? (input.coffeeSettings as Record<string, unknown>)
            : {}),
        });
  const presetId = pickedPreset?.id ?? null;
  const durationMinutes = normalizeCoffeeSessionDurationMinutes(input.durationMinutes);
  const autoPickStarterTopic = group.topicSelectionMode === "auto";
  const { attendingSeatBotIds, absentBotIds } = applyCoffeeGroupSessionExclusions(
    group.coffeeSeatBotIds,
    input.excludedBotIds
  );
  const attendingBotIds = attendingSeatBotIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0
  );
  const attendingGroup = attachCoffeeBotSemanticFacets(
    db,
    userId,
    loadCoffeeGroupProfiles(db, userId, attendingBotIds),
    llm?.prismDefaultLlmModel
  );
  const starterTopics = coffeeGroupStarterTopicsForSession({
    group: attendingGroup,
    starterTopicsByBotId: group.starterTopicsByBotId,
    sessionSettings: settings,
  });
  const result = await createCoffeeConversation(
    db,
    userId,
    {
      groupBotIds: randomizeCoffeeSeatBotIdsForSession(attendingSeatBotIds),
      coffeeSettings: settings,
      coffeeGroupId: group.id,
      coffeeAbsentBotIds: absentBotIds,
      durationMinutes,
      presetId,
      initialPoll: input.initialPoll,
      initialTeams: input.initialTeams,
      starterTopics,
    },
    { ...llm, autoPickStarterTopic }
  );
  const now = new Date().toISOString();
  insertCoffeeGroupEvent(
    db,
    userId,
    group.id,
    "session_created",
    {
      conversationId: result.conversation.id,
      durationMinutes,
      presetId,
      coffeeTopic: result.conversation.coffeeTopic ?? null,
      attendingBotIds: result.conversation.botGroupIds ?? [],
      absentBotIds,
    },
    now
  );
  db.prepare(
    "UPDATE coffee_groups SET updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(now, group.id, userId);
  return result;
}

async function generateCoffeeBotReply(args: {
  db: DatabaseSync;
  userId: string;
  row: ConversationRow;
  group: CoffeeBotProfile[];
  tableFocus: string;
  settings: CoffeeTurnSettings;
  turnKind: CoffeeTurnKind;
  playerInterruption?: CoffeePlayerInterruptionInput;
  userIsComposing?: boolean;
  directedSpeakerBotId?: string;
  staleGuard?: {
    expectedLatestMessageId: string | null;
  };
}): Promise<CoffeeTurnResponse> {
  const {
    db,
    userId,
    row,
    group,
    tableFocus,
    settings,
    turnKind,
    playerInterruption,
    userIsComposing = false,
    directedSpeakerBotId,
    staleGuard,
  } = args;
  const sessionSettings = parseStoredCoffeeSessionSettings(row.coffee_settings);
  const historyLimit = coffeeEffectiveHistoryLimit(sessionSettings);
  const replyCaps = coffeeReplyLengthCaps(sessionSettings);
  const coffeeTeams = parseCoffeeTeamState(row.coffee_team_mode_json);
  const attendanceContext = loadCoffeeAttendanceContext({
    db,
    userId,
    conversationId: row.id,
    coffeeGroupId: row.coffee_group_id,
    group,
    absentBotIds: parseStoredBotGroupIds(row.coffee_absent_bot_ids),
  });
  let history = loadMessages(db, userId, row.id, historyLimit);
  const persistedSocialByBotId = loadCoffeeBotSocialState(
    db,
    userId,
    row.id,
    group.map((bot) => bot.id)
  );
  const durableRelationshipsBySource =
    row.incognito === 1
      ? {}
      : loadBotRelationshipsForBots(
          db,
          userId,
          group.map((bot) => bot.id)
        );
  let socialByBotId = initializeCoffeeSocialState(group, persistedSocialByBotId);
  if (
    Object.keys(persistedSocialByBotId).length === 0 &&
    Object.keys(durableRelationshipsBySource).length > 0
  ) {
    socialByBotId = seedCoffeeSocialStateFromRelationships({
      socialByBotId,
      relationshipsBySource: durableRelationshipsBySource,
    });
  }
  const sessionKickoff = turnKind === "autonomous" && history.length === 0;
  if (Object.keys(persistedSocialByBotId).length < group.length) {
    upsertCoffeeBotSocialState(db, userId, row.id, socialByBotId, new Date().toISOString());
  }
  const playerInterruptionEvent = buildPlayerInterruptionEvent({
    interruptionInput: playerInterruption,
    history,
    group,
    socialByBotId,
  });
  if (
    playerInterruptionEvent?.interruptedMessageId &&
    playerInterruptionEvent.interruptedSnippet
  ) {
    db.prepare("UPDATE messages SET content = ? WHERE id = ? AND user_id = ?")
      .run(
        playerInterruptionEvent.interruptedSnippet,
        playerInterruptionEvent.interruptedMessageId,
        userId
      );
    history = history.map((message) =>
      message.id === playerInterruptionEvent.interruptedMessageId
        ? { ...message, content: playerInterruptionEvent.interruptedSnippet ?? message.content }
        : message
    );
  }
  let preTurnSocialByBotId =
    playerInterruptionEvent && playerInterruptionEvent.socialConsequences.length > 0
      ? applyInterruptionSocialConsequences({
          previousByBotId: socialByBotId,
          consequences: playerInterruptionEvent.socialConsequences,
        })
      : socialByBotId;
  let interruptionEvent: CoffeeInterruptionEvent | undefined = playerInterruptionEvent;
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, row.id);
  const activePoll = loadActiveCoffeeSessionPoll(db, userId, row.id);
  const latestPollSummary =
    activePoll === null ? loadLatestClosedCoffeePollSummary(db, userId, row.id) : null;
  const activePollContext =
    activePoll === null
      ? null
      : formatCoffeeActivePollContext(activePoll, group, settings.sessionRemainingMs);
  const meetingSummary =
    typeof row.coffee_meeting_summary === "string" && row.coffee_meeting_summary.trim().length > 0
      ? row.coffee_meeting_summary.trim()
      : null;
  const meetingSummaryAssistantCount =
    typeof row.coffee_meeting_summary_message_count === "number" &&
      Number.isFinite(row.coffee_meeting_summary_message_count)
      ? Math.max(0, Math.floor(row.coffee_meeting_summary_message_count))
      : null;
  const latestAssistantBeforeTurn = [...history]
    .reverse()
    .find((message): message is ChatMessage => message.role === "assistant") ?? null;
  const seatedBotIds = new Set(group.map((bot) => bot.id));
  const explicitDirectedSpeaker = pickDirectedSpeaker(group, directedSpeakerBotId);
  const userActionOnly = turnKind === "user" && coffeeUserMessageIsActionOnly(tableFocus);
  const currentUserAddressedBotId =
    !explicitDirectedSpeaker && turnKind === "user"
      ? extractLastAddressedBotId({
          line: tableFocus,
          speakerBotId: null,
          seatedBotIds,
        })
      : null;
  const currentUserAddressedSpeaker = currentUserAddressedBotId
    ? group.find((bot) => bot.id === currentUserAddressedBotId) ?? null
    : null;
  const priorAssistantSpeakerBotId = latestAssistantBeforeTurn
    ? resolveAssistantSpeakerBotId(latestAssistantBeforeTurn, group)
    : null;
  const addressedBotId = latestAssistantBeforeTurn
    ? extractLastAddressedBotId({
        line: latestAssistantBeforeTurn.content,
        speakerBotId: priorAssistantSpeakerBotId,
        seatedBotIds,
      })
    : null;
  let pickedBotId: string;
  let routerReason: string;
  let routerDirective: string | null = null;
  if (explicitDirectedSpeaker) {
    pickedBotId = explicitDirectedSpeaker.id;
    routerReason = `Director mode picked ${explicitDirectedSpeaker.name}.`;
    routerDirective = "Start a fresh concrete beat tied to the latest table moment.";
  } else if (currentUserAddressedSpeaker) {
    pickedBotId = currentUserAddressedSpeaker.id;
    routerReason = `Followed current user bot address to ${currentUserAddressedSpeaker.name}.`;
    routerDirective = "Answer the direct call-out first, then add one concrete new angle.";
  } else {
    if (addressedBotId) {
      const addressedSpeaker = group.find((bot) => bot.id === addressedBotId);
      if (addressedSpeaker) {
        pickedBotId = addressedSpeaker.id;
        routerReason = `Followed direct bot address to ${addressedSpeaker.name}.`;
        routerDirective = "Answer the direct call-out first, then add one concrete new angle.";
      } else {
        const fallbackSpeaker = pickFallbackSpeaker(group, lastSpeakerBotId);
        pickedBotId = fallbackSpeaker.id;
        routerReason = ROUTER_FALLBACK_REASON;
      }
    } else {
      const routerProvider = coffeeAuxiliaryProvider(settings);
      const routerMessages = buildRouterPrompt({
        group,
        history,
        userMessage: tableFocus,
        userActionOnly,
        lastSpeakerBotId,
        socialByBotId: preTurnSocialByBotId,
        relationshipsBySource: durableRelationshipsBySource,
        turnKind,
        sessionKickoff,
        sessionSettings,
        coffeeTopic: row.coffee_topic,
        pollSummary: latestPollSummary,
        activePollContext,
        coffeeTeams,
        meetingSummary,
        attendanceContext,
        sessionRemainingMs: settings.sessionRemainingMs,
      });
      try {
        const routerRaw = await routerProvider.generateResponse(routerMessages, {
          maxTokens: ROUTER_MAX_TOKENS,
          temperature: coffeeRouterTemperature(sessionSettings),
        });
        const parsed = parseRouterResponse(routerRaw, group);
        if (parsed) {
          pickedBotId = parsed.botId;
          routerReason = parsed.reason;
          routerDirective = parsed.directive;
        } else {
          const fallbackSpeaker = pickFallbackSpeaker(group, lastSpeakerBotId);
          pickedBotId = fallbackSpeaker.id;
          routerReason = ROUTER_FALLBACK_REASON;
        }
      } catch {
        const fallbackSpeaker = pickFallbackSpeaker(group, lastSpeakerBotId);
        pickedBotId = fallbackSpeaker.id;
        routerReason = ROUTER_FALLBACK_REASON;
      }
    }
  }

  if (!explicitDirectedSpeaker && !currentUserAddressedSpeaker && !addressedBotId) {
    const balanceOverride = pickCoffeeSpeakerBalanceOverride({
      group,
      history,
      pickedBotId,
      sessionSettings,
      coffeeTopic: row.coffee_topic,
      sessionRemainingMs: settings.sessionRemainingMs,
      activePollContext,
    });
    if (balanceOverride) {
      pickedBotId = balanceOverride.id;
      routerReason = `Speaker balance override picked quieter seated bot ${balanceOverride.name}.`;
      routerDirective = `Bring ${balanceOverride.name}'s quieter perspective in with one concrete angle tied to the latest table moment.`;
    }
  }

  const speaker = group.find((bot) => bot.id === pickedBotId) ?? group[0]!;
  const activeSeatBotIds = coffeeActiveSeatBotIdsFromStored(row.bot_group_ids);
  const coffeeCupSeed = coffeeCupSeedForBot({
    conversationId: row.id,
    botId: speaker.id,
    seatBotIds: activeSeatBotIds,
  });
  const departureOpportunity = buildCoffeeDepartureOpportunity({
    conversationId: row.id,
    speaker,
    seatBotIds: activeSeatBotIds,
    history,
    social: preTurnSocialByBotId[speaker.id] ?? DEFAULT_COFFEE_SOCIAL,
    sessionRemainingMs: settings.sessionRemainingMs,
    durationMinutes: row.coffee_duration_minutes,
  });
  const peerAddressByBotId = await loadCoffeePeerAddressPreferences({
    db,
    userId,
    userKey: settings.userKey,
    speakerBotId: speaker.id,
    peers: group.filter((bot) => bot.id !== speaker.id),
  });
  if (!interruptionEvent) {
    const botInterruptionEvent = maybeBuildBotInterruptionEvent({
      turnKind,
      userIsComposing,
      speaker,
      socialByBotId: preTurnSocialByBotId,
      group,
      conversationId: row.id,
      historyLength: history.length,
      sessionSettings,
    });
    if (botInterruptionEvent) {
      interruptionEvent = botInterruptionEvent;
      preTurnSocialByBotId = applyInterruptionSocialConsequences({
        previousByBotId: preTurnSocialByBotId,
        consequences: botInterruptionEvent.socialConsequences,
      });
    }
  }
  const shouldUseFirstContactIntro = !hasAboutYouMemoryForBot(db, userId, speaker.id);
  const { provider: speakerProvider, effectiveProvider } = pickSpeakerProvider(
    speaker,
    settings.preferredProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost,
    settings.anthropicApiKey
  );
  const speakerOptions: GenerateOptions = {};
  const speakerModel = pickSpeakerModel(
    speaker,
    effectiveProvider,
    settings.sessionSpeakerModel
  );
  if (speakerModel) speakerOptions.model = speakerModel;
  if (settings.reasoningEffort) {
    speakerOptions.reasoningEffort = settings.reasoningEffort;
  }
  if (typeof speaker.temperature === "number") {
    speakerOptions.temperature = speaker.temperature;
  }
  speakerOptions.maxTokens = coffeeSpeakerMaxTokensForTurn(
    speaker.maxTokens,
    replyCaps.speakerMaxOutputTokens
  );
  const speakerMessages = buildSpeakerPrompt({
    speaker,
    group,
    history,
    userMessage: tableFocus,
    userActionOnly,
    socialByBotId: preTurnSocialByBotId,
    relationshipsBySource: durableRelationshipsBySource,
    userDisplayName: settings.userDisplayName,
    turnKind,
    sessionKickoff,
    firstContactIntro: turnKind === "user" && shouldUseFirstContactIntro,
    sessionSettings,
    coffeeTopic: row.coffee_topic,
    pollSummary: latestPollSummary,
    activePollContext,
    coffeeTeams,
    meetingSummary,
    attendanceContext,
    directorCue: routerDirective,
    sessionRemainingMs: settings.sessionRemainingMs,
    coffeeSessionDurationMinutes: row.coffee_duration_minutes,
    coffeeCupSeed,
    departureOpportunity,
    peerAddressByBotId,
  });
  let speakerReply = "";
  try {
    speakerReply = await speakerProvider.generateResponse(
      speakerMessages,
      speakerOptions
    );
  } catch (error) {
    if (
      effectiveProvider === "openai" &&
      error instanceof Error &&
      /openai returned an empty response/i.test(error.message)
    ) {
      console.warn(
        `[coffee] speaker returned empty OpenAI response; falling back to emergency line conversation=${row.id} speaker=${speaker.id}`
      );
      speakerReply = "";
    } else {
      throw error;
    }
  }
  // Repair orphan `[Name]` brackets emitted without their `(prism-bot://…)`
  // href before sanitizing — otherwise they leak as visible artifacts on the
  // table (and the visible-length clamp still works correctly because the
  // repaired markdown adds source bytes only).
  const peersForRepair = group.filter((bot) => bot.id !== speaker.id);
  const speakerReplyRepaired =
    typeof speakerReply === "string"
      ? repairBotMentionBrackets(speakerReply, peersForRepair)
      : speakerReply;
  const speakerReplyWasUnfinished =
    typeof speakerReplyRepaired === "string" &&
    coffeeReplyLooksUnfinished(stripCoffeeSpeakerPrefix(speakerReplyRepaired, speaker.name));
  let replyText =
    typeof speakerReplyRepaired === "string"
      ? sanitizeCoffeeTableReply(
          speakerReplyRepaired,
          speaker.name,
          replyCaps.tableReplyMaxChars
        )
      : "";
  if (!replyText && !speakerReplyWasUnfinished && typeof speakerReply === "string") {
    try {
      replyText = await repairCoffeePromptLeak({
        speakerProvider,
        speaker,
        speakerOptions,
        leakedReply: speakerReply,
        maxChars: replyCaps.tableReplyMaxChars,
      });
    } catch {
      // Ignore repair failures and fall through to the emergency fallback.
    }
  }
  if (!replyText) {
    replyText = buildCoffeeEmergencyFallbackReply({
      tableFocus,
      speaker,
      conversationId: row.id,
      historyLength: history.length,
      avoidTexts: recentCoffeeAssistantTexts(history),
      maxChars: replyCaps.tableReplyMaxChars,
      activePoll,
    });
  }
  if (coffeeReplyLooksLikePromptLeak(replyText) || coffeeReplyIsLowValueTableLine(replyText)) {
    replyText = buildCoffeeEmergencyFallbackReply({
      tableFocus,
      speaker,
      conversationId: row.id,
      historyLength: history.length,
      avoidTexts: recentCoffeeAssistantTexts(history),
      maxChars: replyCaps.tableReplyMaxChars,
      activePoll,
    });
  }
  if (
    replyText &&
    (coffeeReplyNeedsRepeatRepair(replyText, history) ||
      coffeeReplyIsLowValueTableLine(replyText))
  ) {
    try {
      replyText = await repairCoffeeRepeatedReply({
        speakerProvider,
        speaker,
        speakerOptions,
        repeatedReply: replyText,
        history,
        tableFocus,
        maxChars: replyCaps.tableReplyMaxChars,
      });
    } catch {
      replyText = "";
    }
  }
  if (
    !replyText ||
    coffeeReplyNeedsRepeatRepair(replyText, history) ||
    coffeeReplyIsLowValueTableLine(replyText)
  ) {
    replyText = buildCoffeeFreshFallbackBeat({
      speaker,
      conversationId: row.id,
      historyLength: history.length,
      tableFocus,
      seedExtra: activePoll ? "poll-repeat" : "repeat",
      avoidTexts: recentCoffeeAssistantTexts(history),
      maxChars: replyCaps.tableReplyMaxChars,
    });
  }
  if (!replyText) {
    throw new Error("Speaker bot returned an empty reply.");
  }
  if (
    staleGuard &&
    coffeeLatestMessageIdChanged(
      db,
      userId,
      row.id,
      staleGuard.expectedLatestMessageId
    )
  ) {
    return buildStaleCoffeeTurnResponse({
      db,
      userId,
      row,
      groupIds: group.map((bot) => bot.id),
    });
  }
  replyText = maybeInjectAutonomousPeerAddress({
    replyText,
    turnKind,
    speaker,
    latestAssistantBeforeTurn,
    group,
    peerAddressByBotId,
  });
  if (!activePoll) {
    replyText = maybeApplyCoffeeOrganicSeed({
      replyText,
      conversationId: row.id,
      speaker,
      historyLength: history.length,
      turnKind,
      avoidTexts: recentCoffeeAssistantTexts(history),
    });
  }
  // Promote any plain `@Name` / bare-name peer references into prism-bot mention
  // markdown so the client renders the chip + lights the notified glyph on the
  // addressed bot's seat. Safe even when the model already used the markdown.
  replyText = autoTagPeerMentionsInCoffeeReply(
    replyText,
    speaker,
    group,
    peerAddressByBotId
  );
  const relationshipSignals = extractCoffeeRelationshipSignals({
    speaker,
    group,
    replyText,
  });
  let nextSocialByBotId = computeNextCoffeeSocialState({
    previousByBotId: preTurnSocialByBotId,
    group,
    speakerBotId: speaker.id,
    turnKind,
    replyText,
  });
  nextSocialByBotId = applyCoffeeRelationshipSocialDeltas({
    previousByBotId: nextSocialByBotId,
    speakerBotId: speaker.id,
    signals: relationshipSignals,
  });

  const assistantNow = new Date().toISOString();
  const nextCoffeeTeams = advanceCoffeeTeamStateAfterReply({
    state: coffeeTeams,
    speaker,
    group,
    replyText,
    now: assistantNow,
  });
  const departurePersistence =
    departureOpportunity && coffeeReplySignalsPoliteDeparture(replyText)
      ? buildCoffeeDeparturePersistence({
          row,
          botId: speaker.id,
          nextCoffeeTeams,
          now: assistantNow,
        })
      : null;
  const coffeeAmbientAction = buildScriptedCoffeeAmbientAction({
    db,
    userId,
    conversationId: row.id,
    speaker,
    replyText,
    historyLength: history.length,
    sessionSettings,
    sessionRemainingMs: settings.sessionRemainingMs,
    durationMinutes: row.coffee_duration_minutes,
    coffeeCupSeed,
    activePoll,
    interruptionEvent,
    departurePersisted: departurePersistence !== null,
  });
  const assistantToolPayload = serializeCoffeeAssistantToolPayload({
    interruptionEvent,
    coffeeAmbientAction,
  });
  const assistantMessageId = randomId(12);
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`
  ).run(
    assistantMessageId,
    row.id,
    userId,
    replyText,
    effectiveProvider,
    speakerModel ?? null,
    speaker.id,
    assistantToolPayload,
    assistantNow
  );
  if (departurePersistence) {
    db.prepare(
      `UPDATE conversations
          SET updated_at = ?,
              bot_group_ids = ?,
              coffee_absent_bot_ids = ?,
              coffee_team_mode_json = ?
        WHERE id = ? AND user_id = ?`
    ).run(
      assistantNow,
      departurePersistence.botGroupIdsJson,
      departurePersistence.absentBotIdsJson,
      departurePersistence.coffeeTeams
        ? serializeCoffeeTeamState(departurePersistence.coffeeTeams)
        : nextCoffeeTeams
          ? serializeCoffeeTeamState(nextCoffeeTeams)
          : row.coffee_team_mode_json,
      row.id,
      userId
    );
    routerReason = `${routerReason} ${speaker.name} politely left the table after finishing coffee.`;
  } else if (nextCoffeeTeams) {
    db.prepare(
      "UPDATE conversations SET updated_at = ?, coffee_team_mode_json = ? WHERE id = ? AND user_id = ?"
    ).run(assistantNow, serializeCoffeeTeamState(nextCoffeeTeams), row.id, userId);
  } else {
    db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(assistantNow, row.id, userId);
  }
  const canPersistDurableCoffeeRelationship = row.incognito !== 1;
  if (canPersistDurableCoffeeRelationship && relationshipSignals.length > 0) {
    for (const signal of relationshipSignals) {
      const existing = readBotRelationship(db, userId, speaker.id, signal.targetBotId);
      const previousScore = existing?.score ?? 50;
      const nextScore = previousScore + signal.delta;
      upsertBotRelationship({
        db,
        userId,
        sourceBotId: speaker.id,
        targetBotId: signal.targetBotId,
        score: nextScore,
        trend: signal.trend,
        lastReason: signal.reason,
        recentReasons: [
          signal.reason,
          ...(existing?.recentReasons ?? []),
        ],
        updatedAt: assistantNow,
      });
    }
  }
  if (
    canPersistDurableCoffeeRelationship &&
    settings.userKey &&
    relationshipSignals.length > 0
  ) {
    const relationshipCandidates = extractCoffeeObserverMemoryCandidates({
      speakerName: speaker.name,
      assistantMessage: replyText,
      seatedBotNames: [
        ...group.map((bot) => bot.name),
        ...(attendanceContext?.currentAbsentBotNames ?? []),
      ],
    }).filter((candidate) => candidate.category === "bot_relation");
    if (relationshipCandidates.length > 0) {
      const validation = await validateMemoryCandidates(
        coffeeAuxiliaryProvider(settings),
        {
          source: "inferred",
          scope: "bot",
          rawContext: replyText,
          candidates: relationshipCandidates,
          userDisplayName: settings.userDisplayName,
        }
      );
      if (validation.candidates.length > 0) {
        await persistMemoryCandidates(
          db,
          userId,
          row.id,
          speaker.id,
          validation.candidates,
          settings.userKey,
          {
            source: "inferred",
            category: "bot_relation",
            tier: "short_term",
            sourceMessageIds: [assistantMessageId],
          }
        );
      }
    }
  }
  if (
    canPersistDurableCoffeeRelationship &&
    settings.userKey &&
    priorAssistantSpeakerBotId &&
    addressedBotId === speaker.id
  ) {
    const preferredAddressCandidates = extractBotPreferredAddressMemoryCandidates({
      assistantMessage: replyText,
      targetBotName: speaker.name,
    });
    if (preferredAddressCandidates.length > 0) {
      const validation = await validateMemoryCandidates(
        coffeeAuxiliaryProvider(settings),
        {
        source: "inferred",
        scope: "bot",
        rawContext: replyText,
        candidates: preferredAddressCandidates,
        userDisplayName: settings.userDisplayName,
        }
      );
      if (validation.candidates.length > 0) {
        await persistMemoryCandidates(
          db,
          userId,
          row.id,
          priorAssistantSpeakerBotId,
          validation.candidates,
          settings.userKey,
          {
            source: "inferred",
            category: "bot_relation",
            tier: "short_term",
            sourceMessageIds: [assistantMessageId],
          }
        );
      }
    }
  }
  upsertCoffeeBotSocialState(db, userId, row.id, nextSocialByBotId, assistantNow);
  if (activePoll) {
    try {
      advanceCoffeePollState({
        db,
        userId,
        conversationId: row.id,
        pollId: activePoll.id,
        group,
        sessionRemainingMs: settings.sessionRemainingMs,
        historyLimit,
      });
    } catch {
      // Poll advancement should never block a Coffee turn.
    }
  }
  if (turnKind === "user") {
    await ensureCoffeeAboutYouMemory({
      db,
      userId,
      userKey: settings.userKey,
      conversationId: row.id,
      botId: speaker.id,
      sourceMessageId: null,
      userDisplayName: settings.userDisplayName,
    });
  }

  const refreshedRow = loadConversationRow(db, userId, row.id) ?? row;
  const finalHistory = loadMessages(db, userId, refreshedRow.id, historyLimit);
  const finalLastSpeakerBotId = loadLastSpeakerBotId(db, userId, refreshedRow.id);
  const finalGroup = departurePersistence
    ? group.filter((bot) => bot.id !== speaker.id)
    : group;
  const finalSocialByBotId = departurePersistence
    ? Object.fromEntries(
        Object.entries(nextSocialByBotId).filter(([botId]) => botId !== speaker.id)
      )
    : nextSocialByBotId;
  void kickoffCoffeeMeetingSummaryRefresh({
    db,
    userId,
    conversationId: refreshedRow.id,
    group: finalGroup,
    history: finalHistory,
    previousSummary: meetingSummary,
    previousSummaryAssistantCount: meetingSummaryAssistantCount,
    activePollContext,
    attendanceContext,
    prismDefaultLlmModel: settings.prismDefaultLlmModel ?? null,
    secondaryOllamaHost: settings.secondaryOllamaHost,
    experimentalDualOllamaEnabled: settings.experimentalDualOllamaEnabled === true,
  });
  return {
    conversation: buildConversationResponse({
      row: refreshedRow,
      messages: finalHistory,
      lastSpeakerBotId: finalLastSpeakerBotId,
      socialByBotId: finalSocialByBotId,
    }),
    speakerBotId: speaker.id,
    routerReason,
    ...(interruptionEvent ? { interruption: interruptionEvent } : {}),
  };
}

/**
 * Persists the chosen Coffee anchor topic before the session timer / autoplay begins.
 */
export async function setCoffeeConversationTopic(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rawTopic: unknown
): Promise<Conversation> {
  const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
  if (topic.length === 0) {
    throw new Error("Coffee topic cannot be empty.");
  }
  if (topic.length > 500) {
    throw new Error("Coffee topic is too long.");
  }
  const row = loadConversationRow(db, userId, conversationId);
  if (!row || row.conversation_mode !== "coffee") {
    throw new Error("Coffee session not found.");
  }
  const existing = row.coffee_topic?.trim() ?? "";
  if (existing.length > 0) {
    throw new Error("This Coffee session already has a topic.");
  }
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE conversations
        SET coffee_topic = ?, title = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`
  ).run(topic, generateCoffeeTitle(topic, []), now, conversationId, userId);
  const refreshed = loadConversationRow(db, userId, conversationId);
  if (!refreshed) {
    throw new Error("Coffee session not found.");
  }
  const { group, groupIds } = loadCoffeeConversationGroup(db, userId, conversationId);
  const sessionSettings = parseStoredCoffeeSessionSettings(refreshed.coffee_settings);
  const historyLimit = coffeeEffectiveHistoryLimit(sessionSettings);
  const messages = loadMessages(db, userId, conversationId, historyLimit);
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, conversationId);
  const persistedSocialByBotId = loadCoffeeBotSocialState(
    db,
    userId,
    conversationId,
    groupIds
  );
  const socialByBotId = initializeCoffeeSocialState(group, persistedSocialByBotId);
  return buildConversationResponse({
    row: refreshed,
    messages,
    lastSpeakerBotId,
    socialByBotId,
  });
}

export async function generateCoffeeSessionSynopsis(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  settings: CoffeeTurnSettings
): Promise<Conversation> {
  const loaded = loadCoffeeConversationGroup(db, userId, conversationId);
  let { row } = loaded;
  const { group, groupIds } = loaded;
  const teamStateAtEnd = parseCoffeeTeamState(row.coffee_team_mode_json);
  const finalizedTeamState = finalizeCoffeeTeamStateForSessionEnd(
    teamStateAtEnd,
    new Date().toISOString(),
    group
  );
  if (
    finalizedTeamState &&
    teamStateAtEnd &&
    serializeCoffeeTeamState(finalizedTeamState) !== serializeCoffeeTeamState(teamStateAtEnd)
  ) {
    db.prepare(
      "UPDATE conversations SET coffee_team_mode_json = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(
      serializeCoffeeTeamState(finalizedTeamState),
      finalizedTeamState.updatedAt,
      row.id,
      userId
    );
    row = loadConversationRow(db, userId, conversationId) ?? row;
  }
  const history = loadMessages(db, userId, row.id, 200);
  const socialByBotId = loadCoffeeBotSocialState(db, userId, row.id, groupIds);
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, row.id);
  const attendanceContext = loadCoffeeAttendanceContext({
    db,
    userId,
    conversationId: row.id,
    coffeeGroupId: row.coffee_group_id,
    group,
    absentBotIds: parseStoredBotGroupIds(row.coffee_absent_bot_ids),
  });
  if (coffeeSessionAlreadyHasSynopsis(history)) {
    return buildConversationResponse({
      row,
      messages: history,
      lastSpeakerBotId,
      socialByBotId,
    });
  }

  const transcriptLines = coffeeMeetingSummarySourceMessages(history)
    .slice(-COFFEE_SESSION_SYNOPSIS_MAX_TRANSCRIPT_LINES)
    .map(formatCoffeeTranscriptLine);
  if (transcriptLines.length === 0) {
    return buildConversationResponse({
      row,
      messages: history,
      lastSpeakerBotId,
      socialByBotId,
    });
  }

  const effectiveProvider = settings.preferredProvider;
  const provider = selectProvider(
    effectiveProvider,
    settings.openAiApiKey,
    settings.secondaryOllamaHost,
    settings.anthropicApiKey
  );
  const options: GenerateOptions = {
    maxTokens: COFFEE_SESSION_SYNOPSIS_MAX_TOKENS,
    temperature: 0.35,
  };
  if (settings.sessionSpeakerModel) options.model = settings.sessionSpeakerModel;
  if (settings.reasoningEffort) options.reasoningEffort = settings.reasoningEffort;

  const raw = await provider.generateResponse(
    buildCoffeeSessionSynopsisMessages({
      group,
      topic: row.coffee_topic ?? null,
      transcriptLines,
      pollLines: buildCoffeePollSynopsisLines(db, userId, row.id),
      teamLines: buildCoffeeTeamSynopsisLines(db, userId, row.id),
      memoryLines: loadCoffeeSessionMemoryChangeLines(
        db,
        userId,
        row.id,
        settings.userKey
      ),
      attendanceContext,
    }),
    options
  );
  const synopsis = typeof raw === "string" ? normalizeCoffeeSessionSynopsis(raw) : null;
  if (!synopsis) {
    return buildConversationResponse({
      row,
      messages: history,
      lastSpeakerBotId,
      socialByBotId,
    });
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
     VALUES (?, ?, ?, 'system', ?, ?, ?, NULL, ?, ?)`
  ).run(
    randomId(12),
    row.id,
    userId,
    synopsis,
    effectiveProvider,
    settings.sessionSpeakerModel ?? null,
    JSON.stringify({ coffeeSynopsis: true }),
    now
  );
  db.prepare(
    "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(now, row.id, userId);

  const refreshedRow = loadConversationRow(db, userId, row.id) ?? row;
  return buildConversationResponse({
    row: refreshedRow,
    messages: loadMessages(db, userId, row.id, 200),
    lastSpeakerBotId: loadLastSpeakerBotId(db, userId, row.id),
    socialByBotId: loadCoffeeBotSocialState(db, userId, row.id, groupIds),
  });
}

/**
 * Main Coffee turn entrypoint.
 *
 * Returns the updated conversation (including the new user + assistant
 * messages) and the speaker bot id chosen by the router.
 */
export async function processCoffeeTurn(
  db: DatabaseSync,
  userId: string,
  input: CoffeeTurnInput,
  settings: CoffeeTurnSettings
): Promise<CoffeeTurnResponse> {
  const message = typeof input.message === "string" ? input.message : "";
  if (message.trim().length === 0) {
    throw new Error("Coffee messages cannot be empty.");
  }

  const now = new Date().toISOString();
  let conversationRow: ConversationRow | undefined;
  let group: CoffeeBotProfile[];
  let groupIds: string[];

  if (input.conversationId) {
    const loaded = loadCoffeeConversationGroup(db, userId, input.conversationId);
    conversationRow = loaded.row;
    groupIds = loaded.groupIds;
    group = loaded.group;
  } else {
    groupIds = normalizeCoffeeGroupBotIds(input.groupBotIds);
    group = loadCoffeeGroupProfiles(db, userId, groupIds);
    const newConversationId = randomId(12);
    db.prepare(
      `INSERT INTO conversations
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito, coffee_settings, coffee_topic, created_at, updated_at)
       VALUES (?, ?, ?, 'coffee', NULL, ?, 0, NULL, NULL, ?, ?)`
    ).run(
      newConversationId,
      userId,
      generateCoffeeTitle(message, group),
      JSON.stringify(groupIds),
      now,
      now
    );
    conversationRow = loadConversationRow(db, userId, newConversationId);
    if (!conversationRow) {
      throw new Error("Failed to create Coffee conversation.");
    }
  }

  const historyPreview = loadMessages(db, userId, conversationRow.id, 1);
  const priorTopic = conversationRow.coffee_topic?.trim() ?? "";
  if (
    conversationRow.conversation_mode === "coffee" &&
    priorTopic.length === 0 &&
    historyPreview.length === 0
  ) {
    const anchor = message.trim();
    db.prepare(
      `UPDATE conversations
          SET coffee_topic = ?, title = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`
    ).run(anchor, generateCoffeeTitle(anchor, group), now, conversationRow.id, userId);
    conversationRow = loadConversationRow(db, userId, conversationRow.id) ?? conversationRow;
  }

  // 1. Persist the user message.
  const userMessageId = randomId(12);
  db.prepare(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
     VALUES (?, ?, ?, 'user', ?, NULL, ?)`
  ).run(userMessageId, conversationRow.id, userId, message, now);

  const pendingImageJob = await maybeQueueCoffeeImageJob({
    db,
    userId,
    conversationId: conversationRow.id,
    userMessage: message,
    settings,
  });
  const turn = await generateCoffeeBotReply({
    db,
    userId,
    row: conversationRow,
    group,
    tableFocus: message,
    settings,
    turnKind: "user",
    playerInterruption: input.playerInterruption,
    directedSpeakerBotId: input.directedSpeakerBotId,
  });
  if (!pendingImageJob) return turn;
  const conciseTurn = applyConcisePreImageLeadToCoffeeTurn({
    db,
    userId,
    turn,
  });
  return {
    ...conciseTurn,
    pendingImageJob,
  };
}

/**
 * Persist updated Coffee session tuning for an existing thread.
 */
export function updateCoffeeConversationSettings(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  rawSettings: unknown
): CoffeeSessionSettings {
  const row = loadConversationRow(db, userId, conversationId);
  if (!row || row.conversation_mode !== "coffee") {
    throw new Error("Coffee session not found.");
  }
  const current = parseStoredCoffeeSessionSettings(row.coffee_settings);
  const mergedUnknown: unknown =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? { ...current, ...(rawSettings as Record<string, unknown>) }
      : rawSettings;
  const normalized = normalizeCoffeeSessionSettings(mergedUnknown);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE conversations SET coffee_settings = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(JSON.stringify(normalized), now, conversationId, userId);
  return normalized;
}

export async function processCoffeeAutonomousTurn(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  settings: CoffeeTurnSettings,
  userIsComposing = false,
  directedSpeakerBotId?: string
): Promise<CoffeeTurnResponse> {
  const { row, group } = loadCoffeeConversationGroup(db, userId, conversationId);
  const topicTrim = row.coffee_topic?.trim() ?? "";
  if (!topicTrim) {
    throw new Error("Pick a Coffee topic for this session before bots can autoplay.");
  }
  const sessionSettings = parseStoredCoffeeSessionSettings(row.coffee_settings);
  const historyLimit = coffeeEffectiveHistoryLimit(sessionSettings);
  const history = loadMessages(db, userId, row.id, historyLimit);
  const latest = history[history.length - 1];
  const expectedLatestMessageId = latest?.id ?? null;
  const tableFocus = latest
    ? latest.role === "assistant" && latest.botName
      ? `${latest.botName} just said: ${latest.content}`
      : latest.content
    : topicTrim
      ? `A brand-new Coffee session is starting around the topic "${topicTrim}". Open naturally with a first line that sets the conversation in motion.`
      : "A brand-new Coffee session is starting. Open naturally with a first line that gets the table conversation moving.";
  return generateCoffeeBotReply({
    db,
    userId,
    row,
    group,
    tableFocus,
    settings,
    turnKind: "autonomous",
    userIsComposing,
    directedSpeakerBotId,
    staleGuard: { expectedLatestMessageId },
  });
}
