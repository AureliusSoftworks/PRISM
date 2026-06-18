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
  buildInitialAboutYouMemoryText,
  extractBotPreferredAddressMemoryCandidates,
  hasAboutYouMemoryForBot,
  persistMemoryCandidates,
  retrieveRecentBotMemoriesForStarter,
  retrieveRecentMemoriesForStarter,
  restoreMemory,
} from "./memory.ts";
import { validateMemoryCandidates } from "./memory-validation.ts";
import { composeBotSystemPrompt } from "./bots.ts";
import {
  loadCoffeeBotSocialState,
  upsertCoffeeBotSocialState,
} from "./db.ts";
import type {
  ChatMessage,
  Conversation,
  CoffeeBotSocialSnapshot,
  CoffeeArrivalScenario,
  CoffeeGroup,
  CoffeeGroupModelChoice,
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
  CoffeeTopicSelectionMode,
  CoffeeTurnResponse,
  BotVoicePreset,
} from "@localai/shared";
import {
  COFFEE_POLL_FINALIZE_REMAINING_MS,
  COFFEE_POLL_OPTION_COUNT_MAX,
  COFFEE_POLL_OPTION_COUNT_MIN,
  COFFEE_POLL_PLAYER_VOTER_ID,
  coffeeEffectiveHistoryLimit,
  coffeeReplyLengthCaps,
  coffeeRouterTailMessageCount,
  coffeeRouterTemperature,
  normalizeCoffeeSessionSettings,
  parseStoredBotPrompt,
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

/** Default for new group-owned Coffee Sessions until the player chooses otherwise. */
const DEFAULT_COFFEE_SESSION_DURATION_MINUTES = 5;

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
const COFFEE_IMAGE_MODEL_TAG = "coffee-image-request";

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

function coffeeReplyNeedsRepeatRepair(
  replyText: string,
  history: readonly ChatMessage[]
): boolean {
  return (
    coffeeReplyRepeatsRecentAssistant(replyText, history) ||
    coffeeReplyRepeatsRecentMotifs(replyText, history) ||
    coffeeReplyRepeatsPollFallbackShape(replyText, history)
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
        .replace(
          new RegExp(
            `^\\s*\\*{0,2}${escaped}\\*{0,2}\\s+(?=(?:we|i|you|respond|reply|write|return|length|do\\s+not)\\b)`,
            "i"
          ),
          ""
        )
        .trim();
    }
    if (text === before) break;
  }

  return text;
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
  /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically)\s+)?(?:adjusts?|arches?|blinks?|breathes?|chuckles?|crosses?|drums?|folds?|frowns?|gazes?|gestures?|glances?|grins?|grimaces?|laughs?|leans?|looks?|mutters?|nods?|pauses?|picks?|places?|plucks?|points?|ponders?|pours?|raises?|rolls?|rubs?|scoffs?|scratches?|sets?|shakes?|shrugs?|sighs?|sips?|smiles?|smirks?|snorts?|squints?|stares?|stirs?|straightens?|taps?|tilts?|turns?|waves?|winces?)\b/i;
const COFFEE_STAGE_ACTION_BLOCK_RE = /\*+([^*\n]+?)\*+/g;

function isValidCoffeeStageAction(action: string): boolean {
  const normalized = action.trim();
  if (!normalized) return false;
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 10) return false;
  const lower = normalized.toLowerCase();
  if (COFFEE_STAGE_ACTION_VERB_RE.test(lower)) return true;
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

export function coffeeReplyIsLowValueTableLine(raw: string): boolean {
  const visible = visibleCoffeeSpeechForValueScan(raw).replace(/[“”]/g, "\"");
  const normalized = visible.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (COFFEE_META_TABLE_MANAGEMENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (normalized.length > 72) return false;
  return COFFEE_LOW_VALUE_TABLE_LINE_PATTERNS.some((pattern) => pattern.test(normalized));
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
  const withStageActionsSanitized = sanitizeCoffeeStageActions(stripped);
  if (coffeeReplyLooksLikePromptLeak(withStageActionsSanitized)) return "";
  if (coffeeReplyBreaksCharacterImmersion(withStageActionsSanitized)) return "";
  if (coffeeReplyIsLowValueTableLine(withStageActionsSanitized)) return "";
  return clampCoffeeTableReplyText(withStageActionsSanitized, maxChars);
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
  seedExtra?: string;
  avoidTexts?: readonly string[];
  maxChars: number;
}): string {
  const options = [
    "*pauses, weighing the table* There is a better angle here than repeating the same claim.",
    "*taps the cup once* Someone needs to add evidence, not just another lean.",
    "*glances around the table* The interesting part is what everyone is dodging.",
    "*sits back for a beat* That answer needs a sharper reason before I buy it.",
    "*stirs the coffee slowly* The cleaner point is the one nobody wants to test out loud.",
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
    args.settings.tableEnergy === "theatre" ||
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
  if (coffeeReplyLooksLikePromptLeak(withoutFence)) return null;
  if (coffeeReplyBreaksCharacterImmersion(withoutFence)) return null;
  if (withoutFence.length < 24) return null;
  if (withoutFence.length <= COFFEE_MEETING_SUMMARY_MAX_CHARS) return withoutFence;
  return `${withoutFence.slice(0, COFFEE_MEETING_SUMMARY_MAX_CHARS - 3).trimEnd()}...`;
}

function normalizeCoffeeSessionSynopsis(raw: string): string | null {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const withoutFence = collapsed.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!withoutFence) return null;
  if (coffeeReplyLooksLikePromptLeak(withoutFence)) return null;
  if (withoutFence.length < 40) return null;
  const prefixed = withoutFence.startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX)
    ? withoutFence
    : `${COFFEE_SESSION_SYNOPSIS_PREFIX} ${withoutFence}`;
  if (prefixed.length <= COFFEE_SESSION_SYNOPSIS_MAX_CHARS) return prefixed;
  return `${prefixed.slice(0, COFFEE_SESSION_SYNOPSIS_MAX_CHARS - 3).trimEnd()}...`;
}

function coffeeSessionAlreadyHasSynopsis(history: readonly ChatMessage[]): boolean {
  return history.some(
    (message) =>
      message.role === "system" &&
      message.content.trim().startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX)
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
}): ProviderMessage[] {
  const participantNames = args.group.map((bot) => bot.name).join(", ");
  const previousSummary = args.previousSummary?.trim() ?? "";
  const pollLine = args.activePollContext?.trim() ?? "";
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
        pollLine ? `Active poll context: ${pollLine}` : "",
        "Latest transcript slice:",
        ...args.transcriptLines,
        "",
        "Write one compact paragraph (max 420 chars) capturing:",
        "- the current point of disagreement or momentum",
        "- what the next bot should react to immediately",
        "- one unresolved thread worth advancing",
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

function loadCoffeeSessionMemoryChangeLines(
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
    try {
      const payload = decryptJson(
        { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag },
        userKey
      ) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.replace(/\s+/g, " ").trim() : "";
      if (!text) continue;
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
  memoryLines: readonly string[];
}): ProviderMessage[] {
  const participants = args.group.map((bot) => bot.name).join(", ");
  const topic = args.topic?.trim() || "unspecified";
  const memoryLines =
    args.memoryLines.length > 0
      ? args.memoryLines
      : ["- No explicit saved/changed memories were recorded for this Coffee session."];
  return [
    {
      role: "system",
      content:
        "Write a concise end-of-session Coffee table synopsis for the user. Be concrete, observant, and natural. Do not mention prompts or hidden rules.",
    },
    {
      role: "user",
      content: [
        `Participants: ${participants}`,
        `Topic: ${topic}`,
        "Transcript:",
        ...args.transcriptLines,
        "",
        "Memory changes recorded during this session:",
        ...memoryLines,
        "",
        "Write 2-4 short sentences. Cover how the conversation went, highlights or lows, and include the memory changes if any exist.",
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
  durationMinutes?: unknown;
  presetId?: string | null;
  initialPoll?: CoffeePollCreateInput;
}

export interface CoffeeGroupCreateInput {
  name?: unknown;
  groupBotIds?: Array<string | null>;
  coffeeSettings?: unknown;
  modelChoiceByProvider?: unknown;
}

export interface CoffeeGroupUpdateInput {
  name?: unknown;
  groupBotIds?: Array<string | null>;
  coffeeSettings?: unknown;
  presetMode?: unknown;
  topicSelectionMode?: unknown;
  modelChoiceByProvider?: unknown;
}

export interface CoffeeGroupSessionCreateInput {
  coffeeSettings?: unknown;
  durationMinutes?: unknown;
  presetId?: unknown;
  initialPoll?: CoffeePollCreateInput;
}

export interface CoffeePollCreateInput {
  question?: unknown;
  options?: unknown;
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
  if (raw === 2 || raw === 3 || raw === 5) return raw;
  throw new Error("Coffee Sessions can be 2, 3, or 5 minutes.");
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
}): CoffeeInterruptionEvent | undefined {
  if (args.turnKind !== "autonomous" || !args.userIsComposing) return undefined;
  const speakerSocial = args.socialByBotId[args.speaker.id] ?? DEFAULT_COFFEE_SOCIAL;
  const chance = Math.min(
    COFFEE_BOT_INTERRUPT_MAX_CHANCE,
    COFFEE_BOT_INTERRUPT_BASE_CHANCE +
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
      `SELECT id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, mood_summary, archived_at, created_at, updated_at
         FROM coffee_groups
        WHERE id = ? AND user_id = ? AND archived_at IS NULL`
    )
    .get(groupId, userId) as CoffeeGroupRow | undefined;
}

export function listCoffeeGroups(db: DatabaseSync, userId: string): CoffeeGroup[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, mood_summary, archived_at, created_at, updated_at
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
  db.prepare(
    `INSERT INTO coffee_groups
       (id, user_id, name, coffee_settings, preset_mode, coffee_topic_mode, model_choice, mood_summary, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'manual', 'manual', ?, '{}', NULL, ?, ?)`
  ).run(groupId, userId, name, JSON.stringify(settings), JSON.stringify(modelChoice), now, now);
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
  if (!shouldGenerateCoffeeGroupNameFromInput(requestedName, group)) {
    return createCoffeeGroup(db, userId, input);
  }
  const fallbackName = buildDeterministicCoffeeGroupName(group);
  const provider = coffeeAuxiliaryProvider(llm);
  const generatedName = await inferCoffeeGroupName({
    provider,
    group,
    fallbackName,
  });
  return createCoffeeGroup(db, userId, {
    ...input,
    name: generatedName,
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

  if (input.name !== undefined) {
    const name = normalizeCoffeeGroupName(input.name, row.name);
    updates.push("name = ?");
    values.push(name);
    if (name !== row.name) {
      insertCoffeeGroupEvent(db, userId, groupId, "renamed", { from: row.name, to: name }, now);
    }
  }
  if (input.coffeeSettings !== undefined) {
    const current = parseStoredCoffeeSessionSettings(row.coffee_settings);
    const mergedUnknown: unknown =
      input.coffeeSettings && typeof input.coffeeSettings === "object" && !Array.isArray(input.coffeeSettings)
        ? { ...current, ...(input.coffeeSettings as Record<string, unknown>) }
        : input.coffeeSettings;
    const settings = normalizeCoffeeSessionSettings(mergedUnknown);
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
    loadCoffeeGroupProfiles(db, userId, groupIds);
    upsertCoffeeGroupSeats(db, userId, groupId, seatBotIds, now);
    insertCoffeeGroupEvent(
      db,
      userId,
      groupId,
      "roster_updated",
      { botGroupIds: groupIds, coffeeSeatBotIds: seatBotIds },
      now
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
          : "The table may feel lively — bolder speaker picks are okay when they fit the moment.";

  const crossLine =
    settings.crossTalk === "rare"
      ? "Prefer one clear voice at a time; avoid rapid ping-pong between bots unless unavoidable."
      : settings.crossTalk === "chatty"
        ? "Bot-to-bot riffing is welcome when it stays grounded in the last few lines."
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
          : "Big personality is okay — still respect the tabletop cap.";

  const crossLine =
    settings.crossTalk === "rare"
      ? "Prefer addressing the last line or the shared topic without forcing a pile-on."
      : settings.crossTalk === "chatty"
        ? "You may bounce off the last bot when it fits your character."
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

function coffeeStarterTopicMentionsMultipleBots(label: string, group: CoffeeBotProfile[]): boolean {
  const normalized = label.toLowerCase();
  const matches = group
    .map((bot) => bot.name.trim().toLowerCase())
    .filter((name) => name.length > 0 && normalized.includes(name));
  return matches.length >= 2;
}

function selectCoffeeStarterTopicLabels(
  candidates: readonly CoffeeStarterTopicCandidate[],
  group: CoffeeBotProfile[]
): string[] {
  const selected: string[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of candidates) {
    const label = normalizeCoffeeStarterTopicLabel(candidate.label);
    if (!label) continue;
    if (coffeeStarterTopicMentionsMultipleBots(label, group)) continue;
    const key = coffeeStarterTopicSimilarityKey(label);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    selected.push(label);
    if (selected.length >= 3) break;
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
}): Promise<string[]> {
  const { provider, group, sessionSettings, presetLabel, memoryContext } = args;
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
        'Respond with compact JSON exactly in this shape: {"topics":[{"label":"...","kind":"reflective","rationale":"..."},{"label":"...","kind":"tension","rationale":"..."},{"label":"...","kind":"scenario","rationale":"..."}]}',
        "Include exactly three candidate objects in this order: reflective/shared curiosity, productive disagreement or tension, concrete dilemma/scenario.",
        "Each label is a TOPIC THE GROUP EXPLORES together (not a user quick-reply, not a question directed only at the player).",
        "Each label must be 2–8 words, concrete, safe, single-line UTF-8; no numbering or prefixes inside strings.",
        "Ground every topic in the seated bots' stated interests, values, purpose, roles, memories, or productive contrasts between them.",
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

function extractLastAddressedBotId(args: {
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
  "Only use single asterisks for a complete non-verbal action, gesture, or aside (anything that isn't spoken dialogue), like `*pours coffee*` or `*glances at the door*`. Do not put ordinary sentence words inside asterisks.",
  "If your turn has both action and speech, format it as `*action* Spoken line.` Never leave non-spoken narration unwrapped at the start/end of the line (for example: `Marcus picks up a cup and says...`).",
  "Asterisk-wrapped actions are presented separately from your spoken line, so keep them short, in third person, and self-contained. The bulk of your reply should still be one short spoken line in plain prose with no Markdown styling.",
  "Keep stage directions name-free and ambient (`*nods slowly*`, `*stirs cream*`, `*winces*`). Do NOT name another bot inside a `*…*` block — directed asides like `*glares at Squidward*` aren't allowed; if you genuinely want to address someone, do it in spoken text instead.",
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
  lastSpeakerBotId: string | null;
  socialByBotId?: Record<string, CoffeeBotSocialSnapshot>;
  turnKind?: CoffeeTurnKind;
  sessionKickoff?: boolean;
  sessionSettings?: CoffeeSessionSettings;
  /** When set, router should prefer speakers who can advance this shared subject. */
  coffeeTopic?: string | null;
  /** Optional closed opening-poll result, used to pick a speaker who can analyze it. */
  pollSummary?: string | null;
  /** Active in-session poll context while bots are still deliberating. */
  activePollContext?: string | null;
  /** Optional rolling background summary used to reduce local echo loops. */
  meetingSummary?: string | null;
  /** Optional router-provided per-turn direction to reduce local echo loops. */
  directorCue?: string | null;
  /** Client-side timer snapshot for natural session wrap-up prompting. */
  sessionRemainingMs?: number | null;
}): ProviderMessage[] {
  const {
    group,
    history,
    userMessage,
    lastSpeakerBotId,
    socialByBotId = {},
    turnKind = "user",
    sessionKickoff = false,
    sessionSettings,
    coffeeTopic,
    pollSummary,
    activePollContext,
    meetingSummary,
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

  const personaLines = group.map((bot) => {
    const contextSummary = formatCoffeeBotContextSummary(bot);
    return `- id="${bot.id}" name="${bot.name}"${contextSummary ? ` context=${contextSummary}` : ""}`;
  });

  const recencyHint =
    settings.crossTalk === "rare"
      ? lastSpeakerBotId
        ? `The last bot to speak was id="${lastSpeakerBotId}". Prefer letting that line land before handing the mic elsewhere unless another bot is clearly a better fit.`
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
      ? "This table is still warming up. Bots know the visible names at the table, but should not imply prior friendship, shared memories, or deep familiarity unless the transcript establishes it."
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
    ...meetingSummaryLines,
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
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
  userDisplayName?: string;
  turnKind?: CoffeeTurnKind;
  sessionKickoff?: boolean;
  firstContactIntro?: boolean;
  sessionSettings?: CoffeeSessionSettings;
  coffeeTopic?: string | null;
  pollSummary?: string | null;
  /** Active in-session poll context while bots are still deliberating. */
  activePollContext?: string | null;
  /** Optional rolling background summary used to reduce local echo loops. */
  meetingSummary?: string | null;
  /** Optional router-provided per-turn direction to reduce local echo loops. */
  directorCue?: string | null;
  /** Client-side timer snapshot for natural session wrap-up prompting. */
  sessionRemainingMs?: number | null;
  /** Speaker-scoped preferred display labels for peers, keyed by peer bot id. */
  peerAddressByBotId?: ReadonlyMap<string, string>;
}): ProviderMessage[] {
  const {
    speaker,
    group,
    history,
    userMessage,
    socialByBotId,
    userDisplayName,
    turnKind = "user",
    sessionKickoff = false,
    firstContactIntro = false,
    sessionSettings,
    coffeeTopic,
    pollSummary,
    activePollContext,
    meetingSummary,
    directorCue,
    sessionRemainingMs,
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
  const directorCueTrim = typeof directorCue === "string" ? directorCue.trim() : "";
  const directorCueLines =
    directorCueTrim.length > 0
      ? [
          "",
          `Silent moderator cue for this turn: ${directorCueTrim}`,
          "Use this as your turn-level objective while staying fully in character. Do not mention any moderator, system, or behind-the-scenes guidance.",
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

  const groupContextLines = [
    "You are sitting at Coffee Mode: an ambiguous coffee shop table inside PRISM.",
    history.length < 3
      ? "This table is still warming up. You can see the other participants' names, but do not act as if you already know them unless the transcript proves it."
      : "Use the current table transcript as your shared history with the user and the other bots.",
    ...topicLines,
    ...pollLines,
    ...activePollLines,
    ...meetingSummaryLines,
    ...directorCueLines,
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
    "Avoid generic motivational platitudes and repetitive metaphor chains. It's okay to disagree, challenge, or redirect with warmth.",
    "When another bot just spoke, you may respond to the idea directly. Use second-person name callouts only when the address truly matters; otherwise keep the line flowing without a chip.",
    "Reply as one line of plain prose (no line breaks). Prefer one or two short sentences max, and vary your rhythm across turns so the table doesn't sound templated.",
    "Do not keep the same line length every turn. Mix very short reactions, medium lines, and occasional longer lines so the table breathes like a real conversation.",
    buildCoffeeTransitionalBeatPromptLine(speaker),
    `Aim for a soft target around ${tableReplyMaxChars} characters including spaces; brevity reads best on the table. The server no longer truncates, so a slightly longer line is fine, but please don't ramble — keep the table feeling like a single quick exchange.`,
    "Make the line concrete: pull one small image, opinion, object, motive, or emotional beat from your persona or the latest table moment.",
    "Never repeat a recent table line exactly; if the table keeps circling the same nouns or joke shape, change the concrete detail or social motion instead.",
    "Questions are allowed when they naturally move the table; avoid reflexively ending every line with one.",
    "Do not write as if you are cutting off another bot mid-sentence. Coffee only presents cutoffs when the app has explicit interruption metadata.",
    "Avoid long monologues; the table should feel like a shared room, not a speech.",
    "Leave room for another bot or the user to respond after a natural pause.",
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
      content: `The user's preferred name is "${userDisplayName.trim()}". Use it naturally when it helps, but do not overuse it.`,
    });
  }
  if (firstContactIntro) {
    messages.push({
      role: "system",
      content:
        "First meeting with this user: fit a tiny self-intro plus how-they-like-to-be-addressed in the same tabletop limit — prefer one short sentence; two very short ones only if necessary.",
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
    name: "Theatre Night",
    builtIn: true,
    settings: normalizeCoffeeSessionSettings({
      responseLength: "detailed",
      responseDelayBias: 100,
      tableEnergy: "theatre",
      crossTalk: "chatty",
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
              coffee_topic, coffee_meeting_summary, coffee_meeting_summary_message_count,
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
    .map((row, index): ChatMessage => ({
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
    }));
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
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: "coffee",
    botId: row.bot_id ?? null,
    ...(groupIds.length > 0 ? { botGroupIds: groupIds } : {}),
    coffeeGroupId: row.coffee_group_id ?? null,
    ...(seatBotIds.some((id) => id !== null) ? { coffeeSeatBotIds: seatBotIds } : {}),
    ...(socialByBotId && Object.keys(socialByBotId).length > 0
      ? { coffeeBotSocialById: socialByBotId }
      : {}),
    coffeeSettings: parseStoredCoffeeSessionSettings(row.coffee_settings),
    ...(row.coffee_duration_minutes === 2 ||
    row.coffee_duration_minutes === 3 ||
    row.coffee_duration_minutes === 5
      ? { coffeeSessionDurationMinutes: row.coffee_duration_minutes }
      : {}),
    ...(typeof row.coffee_topic === "string" && row.coffee_topic.trim().length > 0
      ? { coffeeTopic: row.coffee_topic.trim() }
      : {}),
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

function coffeeBooleanPollOptionIndices(options: readonly string[]): {
  trueIndex: number;
  falseIndex: number;
} | null {
  const normalized = options.map((option) => option.trim().toLowerCase());
  const trueIndex = normalized.findIndex((option) => option === "true" || option === "yes");
  const falseIndex = normalized.findIndex((option) => option === "false" || option === "no");
  return trueIndex >= 0 && falseIndex >= 0 ? { trueIndex, falseIndex } : null;
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

function coffeePollPersonaOptionPrior(args: {
  question: string;
  option: string;
  bot: CoffeeBotProfile;
}): number {
  const botName = args.bot.name.toLowerCase();
  const question = args.question.toLowerCase();
  const option = args.option.toLowerCase();
  if (
    /\bkrabs\b/u.test(botName) &&
    /\b(?:krabby|patty|formula|secret)\b/u.test(question)
  ) {
    if (/\bsecret\b/u.test(option)) return 4.2;
    if (/\bcrab\b/u.test(option)) return -3.2;
  }
  return 0;
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
  const baseIndex =
    Math.floor(stableUnitValue(`${args.pollId}:${args.bot.id}`) * args.options.length) %
    args.options.length;
  const scores: number[] = args.options.map((_, index) => (index === baseIndex ? 2.5 : 0.5));
  const booleanOptionIndices = coffeeBooleanPollOptionIndices(args.options);
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
}): { commit: boolean; optionIndex: number | null; revote: boolean } {
  const hasLockedVote =
    args.existingVoteKind === "option" && typeof args.existingOptionIndex === "number";

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
}): {
  voteKind: CoffeePollVoteKind;
  optionIndex: number | null;
  explanation: string | null;
  confidence: number | null;
  deliberation: CoffeePollDeliberation;
} {
  const scores = scoreCoffeePollOptionsForBot({
    pollId: args.pollId,
    question: args.question,
    options: args.options,
    bot: args.bot,
    transcript: args.transcript,
    assistantLines: args.assistantLines,
    playerOptionIndex: args.playerOptionIndex,
  });
  const ranked = scores
    .map((score, optionIndex) => ({ score, optionIndex }))
    .sort((left, right) => right.score - left.score);
  const top = ranked[0] ?? { score: 0, optionIndex: 0 };
  const second = ranked[1] ?? { score: 0, optionIndex: top.optionIndex };
  const leaningOptionIndex = top.optionIndex;
  const alternateOptionIndex =
    second.score > 0 && top.score - second.score < 1.25 ? second.optionIndex : null;
  const scoreTotal = scores.reduce((sum, score) => sum + score, 0);
  const confidence =
    Math.round((0.35 + (top.score / Math.max(1, scoreTotal)) * 0.55) * 100) / 100;
  const leaningLabel = args.options[leaningOptionIndex] ?? args.options[0] ?? "";
  const alternateLabel =
    alternateOptionIndex === null ? null : args.options[alternateOptionIndex] ?? null;
  const existingVoteKind = args.existingVoteKind ?? "pending";
  const existingOptionIndex = args.existingOptionIndex ?? null;
  const voteDecision = resolveCoffeePollBotVote({
    forceClose: args.forceClose,
    inFinalizeWindow: args.inFinalizeWindow,
    leaningOptionIndex,
    existingVoteKind,
    existingOptionIndex,
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

  const note =
    stage === "teetering" && alternateLabel
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
      leaningOptionIndex,
      alternateOptionIndex,
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
  settings: CoffeeTurnSettings
): Promise<{ poll: CoffeePoll }> {
  const { group } = loadCoffeeConversationGroup(db, userId, conversationId);
  const poll = advanceCoffeePollState({
    db,
    userId,
    conversationId,
    pollId,
    group,
    sessionRemainingMs: settings.sessionRemainingMs,
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
  const now = new Date().toISOString();
  const conversationId = randomId(12);
  const initialSocialByBotId = initializeCoffeeSocialState(group, {});
  const sessionSettings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const coffeeSettingsJson = JSON.stringify(sessionSettings);
  const durationMinutes =
    input.durationMinutes === undefined || input.durationMinutes === null
      ? null
      : normalizeCoffeeSessionDurationMinutes(input.durationMinutes);
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
        coffee_settings, coffee_group_id, coffee_duration_minutes, coffee_preset_id, coffee_topic, created_at, updated_at)
     VALUES (?, ?, ?, 'coffee', NULL, ?, 0, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    conversationId,
    userId,
    generateCoffeeTitle("", group),
    JSON.stringify(seatBotIds),
    coffeeSettingsJson,
    input.coffeeGroupId ?? null,
    durationMinutes,
    input.presetId ?? null,
    now,
    now
  );
  upsertCoffeeBotSocialState(db, userId, conversationId, initialSocialByBotId, now);
  const provider = coffeeAuxiliaryProvider(llm);
  const starterMemoryContext = loadCoffeeStarterMemoryContext({
    db,
    userId,
    userKey: llm?.userKey,
    group,
  });
  let coffeeStarterTopics = await inferCoffeeStarterTopics({
    provider,
    group,
    sessionSettings,
    presetLabel,
    memoryContext: starterMemoryContext,
  });
  let persistedTopic: string | null = null;
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
  const result = await createCoffeeConversation(
    db,
    userId,
    {
      groupBotIds: group.coffeeSeatBotIds,
      coffeeSettings: settings,
      coffeeGroupId: group.id,
      durationMinutes,
      presetId,
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
  } = args;
  const sessionSettings = parseStoredCoffeeSessionSettings(row.coffee_settings);
  const historyLimit = coffeeEffectiveHistoryLimit(sessionSettings);
  const replyCaps = coffeeReplyLengthCaps(sessionSettings);
  let history = loadMessages(db, userId, row.id, historyLimit);
  const persistedSocialByBotId = loadCoffeeBotSocialState(
    db,
    userId,
    row.id,
    group.map((bot) => bot.id)
  );
  const socialByBotId = initializeCoffeeSocialState(group, persistedSocialByBotId);
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
  const directedSpeaker = pickDirectedSpeaker(group, directedSpeakerBotId);
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
  if (directedSpeaker) {
    pickedBotId = directedSpeaker.id;
    routerReason = `Director mode picked ${directedSpeaker.name}.`;
    routerDirective = "Start a fresh concrete beat tied to the latest table moment.";
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
        lastSpeakerBotId,
        socialByBotId: preTurnSocialByBotId,
        turnKind,
        sessionKickoff,
        sessionSettings,
        coffeeTopic: row.coffee_topic,
        pollSummary: latestPollSummary,
        activePollContext,
        meetingSummary,
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

  const speaker = group.find((bot) => bot.id === pickedBotId) ?? group[0]!;
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
  if (typeof speaker.temperature === "number") {
    speakerOptions.temperature = speaker.temperature;
  }
  speakerOptions.maxTokens = Math.min(
    typeof speaker.maxTokens === "number" ? speaker.maxTokens : replyCaps.speakerMaxOutputTokens,
    replyCaps.speakerMaxOutputTokens
  );
  const speakerMessages = buildSpeakerPrompt({
    speaker,
    group,
    history,
    userMessage: tableFocus,
    socialByBotId: preTurnSocialByBotId,
    userDisplayName: settings.userDisplayName,
    turnKind,
    sessionKickoff,
    firstContactIntro: turnKind === "user" && shouldUseFirstContactIntro,
    sessionSettings,
    coffeeTopic: row.coffee_topic,
    pollSummary: latestPollSummary,
    activePollContext,
    meetingSummary,
    directorCue: routerDirective,
    sessionRemainingMs: settings.sessionRemainingMs,
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
  let replyText =
    typeof speakerReplyRepaired === "string"
      ? sanitizeCoffeeTableReply(
          speakerReplyRepaired,
          speaker.name,
          replyCaps.tableReplyMaxChars
        )
      : "";
  if (!replyText && typeof speakerReply === "string") {
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
      seedExtra: activePoll ? "poll-repeat" : "repeat",
      avoidTexts: recentCoffeeAssistantTexts(history),
      maxChars: replyCaps.tableReplyMaxChars,
    });
  }
  if (!replyText) {
    throw new Error("Speaker bot returned an empty reply.");
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
  const nextSocialByBotId = computeNextCoffeeSocialState({
    previousByBotId: preTurnSocialByBotId,
    group,
    speakerBotId: speaker.id,
    turnKind,
    replyText,
  });

  const assistantNow = new Date().toISOString();
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
    interruptionEvent ? JSON.stringify({ coffeeInterruption: interruptionEvent }) : null,
    assistantNow
  );
  db.prepare(
    "UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(assistantNow, row.id, userId);
  if (settings.userKey && priorAssistantSpeakerBotId && addressedBotId === speaker.id) {
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
  void kickoffCoffeeMeetingSummaryRefresh({
    db,
    userId,
    conversationId: refreshedRow.id,
    group,
    history: finalHistory,
    previousSummary: meetingSummary,
    previousSummaryAssistantCount: meetingSummaryAssistantCount,
    activePollContext,
    prismDefaultLlmModel: settings.prismDefaultLlmModel ?? null,
    secondaryOllamaHost: settings.secondaryOllamaHost,
    experimentalDualOllamaEnabled: settings.experimentalDualOllamaEnabled === true,
  });
  return {
    conversation: buildConversationResponse({
      row: refreshedRow,
      messages: finalHistory,
      lastSpeakerBotId: finalLastSpeakerBotId,
      socialByBotId: nextSocialByBotId,
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
  const { row, group, groupIds } = loadCoffeeConversationGroup(db, userId, conversationId);
  const history = loadMessages(db, userId, row.id, 200);
  const socialByBotId = loadCoffeeBotSocialState(db, userId, row.id, groupIds);
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, row.id);
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

  const raw = await provider.generateResponse(
    buildCoffeeSessionSynopsisMessages({
      group,
      topic: row.coffee_topic ?? null,
      transcriptLines,
      memoryLines: loadCoffeeSessionMemoryChangeLines(
        db,
        userId,
        row.id,
        settings.userKey
      ),
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
  });
}
