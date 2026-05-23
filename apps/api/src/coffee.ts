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
import { randomId } from "./security.ts";
import {
  getAuxiliaryProvider,
  selectProvider,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";
import {
  buildInitialAboutYouMemoryText,
  hasAboutYouMemoryForBot,
  restoreMemory,
} from "./memory.ts";
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
  CoffeePreset,
  CoffeePresetMode,
  CoffeeSessionDurationMinutes,
  CoffeeSessionCreateResponse,
  CoffeeSessionSettings,
  CoffeeTopicSelectionMode,
  CoffeeTurnResponse,
} from "@localai/shared";
import {
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

/** Coffee groups must have at least 2 and at most 5 bots. */
export const COFFEE_GROUP_MIN_SIZE = 2;
export const COFFEE_GROUP_MAX_SIZE = 5;

/** Default tabletop cap when callers omit an explicit limit (tests + legacy). */
export const COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS = 110;

/** When the timer is this close to done, bots should naturally wind down. */
export const COFFEE_WRAP_UP_REMAINING_MS = 20_000;

/** Default for new group-owned Coffee Sessions until the player chooses otherwise. */
const DEFAULT_COFFEE_SESSION_DURATION_MINUTES = 5;

/** Router LLM call budget — keep low so latency stays acceptable. */
const ROUTER_MAX_TOKENS = 80;

/** Fallback when router output cannot be parsed. */
const ROUTER_FALLBACK_REASON = "Router fallback (unparseable response)";

type CoffeeTurnKind = "user" | "autonomous";

type RouterAllowedBot = string | Pick<CoffeeBotProfile, "id" | "name">;

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
  /^(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?(?:produce|write|return|provide|create)\b/i,
  /^write only\b/i,
  /^return only\b/i,
  /^length\s*:/i,
  /^respond as\b/i,
  /^reply as\b/i,
  /^you are sitting at coffee mode\b/i,
  /^the user says\b/i,
  /^the user wants\b/i,
  /^the user needs\b/i,
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
  /\bone line\b/i,
  /\bone clause\b/i,
  /\bsingle clause\b/i,
  /\bsingle line\b/i,
  /\bno line breaks\b/i,
  /\bhard tabletop cap\b/i,
  /\bdo not include a speaker label\b/i,
  /\brecent table transcript\b/i,
  /\bthe user says\b/i,
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
  /\b(?:we|i)\s+(?:must|need|should|have\s+to)\s+(?:to\s+)?(?:produce|write|return|provide|create)\s+(?:a\s+)?(?:single\s+)?(?:line|clause|reply|response|utterance)\b/i,
  /\bthe user (?:wants|needs|asked for|requested)\s+(?:a\s+)?(?:single\s+)?(?:line|clause|reply|response|utterance)\b/i,
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
  /^(?:adjusts?|blinks?|breathes?|chuckles?|crosses?|drums?|folds?|frowns?|gazes?|gestures?|glances?|grins?|grimaces?|laughs?|leans?|looks?|mutters?|nods?|pauses?|picks?|places?|points?|pours?|raises?|rolls?|rubs?|scoffs?|scratches?|shakes?|shrugs?|sighs?|sips?|smiles?|smirks?|snorts?|stares?|stirs?|straightens?|taps?|tilts?|turns?|waves?|winces?)\b/i;
const COFFEE_STAGE_ACTION_BLOCK_RE = /\*+([^*\n]+?)\*+/g;

function isValidCoffeeStageAction(action: string): boolean {
  const normalized = action.trim();
  if (!normalized) return false;
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  if (tokenCount > 6) return false;
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
    !coffeeReplyRepeatsRecentMotifs(visible, args.history)
    ? visible
    : "";
}

function buildCoffeeEmergencyFallbackReply(args: {
  tableFocus: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  conversationId: string;
  historyLength: number;
  seedExtra?: string;
  avoidTexts?: readonly string[];
  maxChars: number;
}): string {
  const options = /\?\s*$/.test(args.tableFocus.trim())
    ? [
        "Could be.",
        "I hear the angle.",
        "Maybe, with one tweak.",
        "That checks out for now.",
        "Fair question.",
      ]
    : [
        "Let's ground it.",
        "Hold that thought.",
        "I hear the point.",
        "Okay, keep it moving.",
        "Let's pivot to something concrete.",
        "Noted. One beat at a time.",
        "Let's keep this simple.",
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

/** Settings forwarded from the HTTP route. */
export interface CoffeeTurnSettings {
  preferredProvider: "local" | "openai";
  openAiApiKey?: string;
  secondaryOllamaHost?: string | null;
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
    preferredProvider: args.settings.preferredProvider,
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

function interruptedSnippetFromTokenCount(fullText: string, visibleTokenCount: number): string {
  const tokens = fullText.match(/\S+\s*/g) ?? [];
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
  if (raw === 1 || raw === 5 || raw === 10) return raw;
  throw new Error("Coffee Sessions can be 1, 5, or 10 minutes.");
}

function normalizeCoffeePresetMode(raw: unknown): CoffeePresetMode {
  return raw === "auto" ? "auto" : "manual";
}

function normalizeCoffeeTopicSelectionMode(raw: unknown): CoffeeTopicSelectionMode {
  return raw === "auto" ? "auto" : "manual";
}

/**
 * Normalize a free-form `model_choice` value into a sanitized
 * `{ local?, openai? }` map. Drops empty/`auto` strings so picker hydration on
 * the client treats those as "Auto".
 */
export function normalizeCoffeeGroupModelChoice(raw: unknown): CoffeeGroupModelChoice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: CoffeeGroupModelChoice = {};
  for (const provider of ["local", "openai"] as const) {
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
    COFFEE_PLAYER_INTERRUPT_BASE_DISPOSITION_DELTA -
    (1 - interruptedSocial.restraint) * 0.035 * severity;
  const interruptedFrictionDelta =
    COFFEE_PLAYER_INTERRUPT_BASE_FRICTION_DELTA +
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
              online_enabled, flirt_enabled, temperature, max_tokens
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
    });
  }
  return profiles;
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
  const group = loadCoffeeGroupProfiles(db, userId, groupIds);
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
  llm?: { prismDefaultLlmModel?: string | null } | null
): Promise<CoffeeGroup> {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = loadCoffeeGroupProfiles(db, userId, groupIds);
  const requestedName = typeof input.name === "string" ? input.name : null;
  if (!shouldGenerateCoffeeGroupNameFromInput(requestedName, group)) {
    return createCoffeeGroup(db, userId, input);
  }
  const fallbackName = buildDeterministicCoffeeGroupName(group);
  const provider = getAuxiliaryProvider(llm?.prismDefaultLlmModel ?? undefined);
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
    for (const provider of ["local", "openai"] as const) {
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

const COFFEE_STARTER_TOPIC_INFER_MAX_TOKENS = 220;
const COFFEE_STARTER_TOPIC_INFER_TEMPERATURE = 0.55;
const COFFEE_GROUP_NAME_INFER_MAX_TOKENS = 140;
const COFFEE_GROUP_NAME_INFER_TEMPERATURE = 0.7;
const COFFEE_GROUP_NAME_INFER_ATTEMPTS = 2;
const COFFEE_TOPIC_HINT_MAX_WORDS = 5;
const COFFEE_TOPIC_HINT_MAX_CHARS = 48;

function parseCoffeeStarterTopicsPayload(raw: string): string[] {
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
      const topics = (parsed as { topics?: unknown }).topics;
      if (!Array.isArray(topics)) continue;
      const strings = topics
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (strings.length >= 3) return strings.slice(0, 3);
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

function collectCoffeeGroupNameKeywords(group: CoffeeBotProfile[]): Set<string> {
  const keywords = new Set<string>();
  const stopwords = new Set([
    "the",
    "and",
    "with",
    "for",
    "from",
    "mode",
    "coffee",
    "group",
    "bot",
  ]);
  for (const bot of group) {
    const nameTokens = bot.name.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    for (const token of nameTokens) {
      if (token.length < 3) continue;
      if (stopwords.has(token)) continue;
      keywords.add(token);
    }
    const hints = collectCoffeeBotTopicHints(bot);
    for (const hint of hints) {
      const hintTokens = hint.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
      for (const token of hintTokens) {
        if (token.length < 4) continue;
        if (stopwords.has(token)) continue;
        keywords.add(token);
      }
    }
  }
  return keywords;
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
  keywords: ReadonlySet<string>
): number {
  if (coffeeLooksLikeParticipantListName(name, group)) return -100;
  if (coffeeNameLooksPlaceholder(name)) return -20;
  const normalized = name.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) score += 4;
  }
  if (/\b(philo|smart|bean|bikini|krusty|jellyfish|stoic|mercy|power|debug)\b/i.test(normalized)) {
    score += 6;
  }
  if (name.split(/\s+/).length <= 4) score += 2;
  if (/[^a-z0-9\s'-]/i.test(name)) score += 1;
  return score;
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
    .flatMap((bot) => collectCoffeeBotTopicHints(bot))
    .join(" ")
    .toLowerCase();
  const seed = group.map((bot) => bot.name).join("|") || hints || "coffee";
  const pick = (options: readonly string[]): string => options[hashCoffeeNameSeed(seed) % options.length]!;
  if (/\b(philosoph|stoic|ethic|wisdom|metaphysic|logic|reason)\b/.test(hints)) {
    return pick([
      "Philosophicoffee",
      "Smart Beans",
      "Idea Roast Society",
      "The Smart Guys",
    ]);
  }
  if (/\b(power|empire|command|control|strategy)\b/.test(hints)) {
    return pick([
      "Power Pour Society",
      "Dark Roast Doctrine",
      "Command and Caffeine",
      "The Authority Blend",
    ]);
  }
  if (/\b(compassion|forgive|mercy|grace|spirit|faith|hope|love)\b/.test(hints)) {
    return pick([
      "Grace Grounds",
      "Mercy Mocha Circle",
      "Kindness Over Coffee",
      "Soulful Sips Society",
    ]);
  }
  if (/\b(engineer|debug|code|system|build|logic)\b/.test(hints)) {
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
  return summaryParts.join("; ");
}

export async function inferCoffeeGroupName(args: {
  provider: LlmProvider;
  group: CoffeeBotProfile[];
  fallbackName: string;
}): Promise<string> {
  const { provider, group, fallbackName } = args;
  const deterministicFallback = buildDeterministicCoffeeGroupName(group);
  const keywords = collectCoffeeGroupNameKeywords(group);
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
        "Avoid generic names like 'Coffee Group' unless there is no signal.",
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
          score: scoreCoffeeGroupNameCandidate(candidate, group, keywords),
        }))
        .sort((a, b) => b.score - a.score);
      const winner = ranked[0];
      if (winner && winner.score >= 0) {
        return normalizeCoffeeGroupName(winner.candidate, fallbackName);
      }
      const parsedSingle = parseCoffeeGroupNamePayload(raw);
      if (
        parsedSingle &&
        !coffeeLooksLikeParticipantListName(parsedSingle, group) &&
        !coffeeNameLooksPlaceholder(parsedSingle)
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
  sessionSettings: CoffeeSessionSettings
): string[] {
  const names = group.map((bot) => bot.name).filter((name) => name.trim().length > 0);
  const rosterPair =
    names.length >= 2 ? `${names[0]} and ${names[1]}` : names.length === 1 ? names[0]! : "the table";
  const energyWord =
    sessionSettings.tableEnergy === "theatre"
      ? "bold"
      : sessionSettings.tableEnergy === "still"
        ? "quiet"
        : "warm";
  const collectedHints = group
    .flatMap((bot) => collectCoffeeBotTopicHints(bot))
    .filter((hint) => hint.length > 0);
  const topicA = collectedHints[0] ?? "small moments that reveal character";
  const topicB = collectedHints[1] ?? "how values shape hard choices";
  const topicC = collectedHints[2] ?? "what feels worth protecting today";
  return [
    `${energyWord} angle on ${topicA}`,
    `${rosterPair} on ${topicB}`,
    `When ${topicC} meets real life`,
  ];
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
}): Promise<string[]> {
  const { provider, group, sessionSettings, presetLabel } = args;
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
        'Respond with compact JSON exactly in this shape: {"topics":["...","...","..."]}',
        "Include exactly three strings.",
        "Each string is a TOPIC THE GROUP EXPLORES together (not a user quick-reply, not a question directed only at the player).",
        "Each topic must be 2–8 words, concrete, safe, single-line UTF-8; no numbering or prefixes inside strings.",
        "Ground every topic in the seated bots' stated interests, values, purpose, roles, or productive contrasts between them.",
        "Avoid generic filler like 'check-in', 'worth unpacking', or bland universal agreement phrasing.",
        "Topics should differ in emotional angle (e.g. reflective vs playful vs practical) while fitting the same table energy.",
      ].join("\n"),
    },
  ];
  try {
    const raw = await provider.generateResponse(messages, {
      temperature: COFFEE_STARTER_TOPIC_INFER_TEMPERATURE,
      maxTokens: COFFEE_STARTER_TOPIC_INFER_MAX_TOKENS,
    });
    const parsed = parseCoffeeStarterTopicsPayload(raw);
    if (parsed.length === 3) return parsed;
  } catch {
    // Non-fatal — deterministic fallback below.
  }
  return buildDeterministicCoffeeStarterTopics(group, sessionSettings);
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

const COFFEE_ORGANIC_SEED_LINES = [
  "I know, right?",
  "Wait, what was that you just said? Sorry, it went over my head.",
  "No offense, but this is boring.",
  "Honestly, that tracks.",
  "Okay, that's actually kind of wild.",
  "Huh. Didn't see that coming.",
] as const;

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

function maybeApplyCoffeeOrganicSeed(args: {
  replyText: string;
  conversationId: string;
  speaker: Pick<CoffeeBotProfile, "id" | "name">;
  historyLength: number;
  turnKind: CoffeeTurnKind;
  avoidTexts: readonly string[];
}): string {
  const { replyText, conversationId, speaker, historyLength, turnKind, avoidTexts } = args;
  if (!replyText) return replyText;
  const seed = stableUnitValue(
    `${conversationId}:${speaker.id}:${historyLength}:${turnKind}:organic-seed`
  );
  if (seed > 0.3) return replyText;
  const startIndex =
    Math.floor(
      stableUnitValue(`${conversationId}:${speaker.id}:${historyLength}:organic-line`) *
        COFFEE_ORGANIC_SEED_LINES.length
    ) % COFFEE_ORGANIC_SEED_LINES.length;
  const avoid = new Set(avoidTexts.map(coffeeReplyRepeatKey).filter(Boolean));
  let picked = COFFEE_ORGANIC_SEED_LINES[startIndex] ?? COFFEE_ORGANIC_SEED_LINES[0]!;
  for (let offset = 0; offset < COFFEE_ORGANIC_SEED_LINES.length; offset += 1) {
    const candidate =
      COFFEE_ORGANIC_SEED_LINES[(startIndex + offset) % COFFEE_ORGANIC_SEED_LINES.length] ?? picked;
    if (!avoid.has(coffeeReplyRepeatKey(candidate))) {
      picked = candidate;
      break;
    }
  }
  // Keep the "seeded" line infrequent and varied in shape.
  if (seed <= 0.1) return picked;
  if (seed <= 0.2) return `${picked} ${replyText}`.trim();
  return `${replyText} ${picked}`.trim();
}

function maybeInjectAutonomousPeerAddress(args: {
  replyText: string;
  turnKind: CoffeeTurnKind;
  speaker: CoffeeBotProfile;
  latestAssistantBeforeTurn: ChatMessage | null;
  group: readonly CoffeeBotProfile[];
}): string {
  const { replyText, turnKind, speaker, latestAssistantBeforeTurn, group } = args;
  if (turnKind !== "autonomous") return replyText;
  if (!latestAssistantBeforeTurn || latestAssistantBeforeTurn.role !== "assistant") return replyText;
  const priorSpeakerId = resolveAssistantSpeakerBotId(latestAssistantBeforeTurn, group);
  if (!priorSpeakerId || priorSpeakerId === speaker.id) return replyText;
  const priorSpeaker = group.find((bot) => bot.id === priorSpeakerId);
  if (!priorSpeaker) return replyText;
  const alreadyAddressesPeer =
    replyText.includes("prism-bot://") ||
    new RegExp(`\\b${escapeRegExp(priorSpeaker.name)}\\b`, "i").test(replyText);
  if (alreadyAddressesPeer) return replyText;
  // Encourage direct bot-to-bot texture on most autonomous turns.
  if (Math.random() > 0.65) return replyText;
  const mention = formatBotMentionMarkdownInline(priorSpeaker);
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
  group: readonly { id: string; name: string }[]
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
    const escaped = peer.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      const replacement = formatBotMentionMarkdownInline(peer);
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
  return out;
}

function formatBotMentionMarkdownInline(bot: { id: string; name: string }): string {
  const safeName = bot.name.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
  return `[${safeName}](prism-bot://${encodeURIComponent(bot.id)})`;
}

/** Mirrors `formatBotMentionMarkdown` in apps/web — kept in sync by hand. */
function coffeeFormatBotMentionMarkdown(bot: { id: string; name: string }): string {
  const label = bot.name.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
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
  peers: readonly { id: string; name: string }[]
): string | null {
  const usable = peers.filter((p) => p.id.trim().length > 0 && p.name.trim().length > 0);
  if (usable.length === 0) return null;
  const rosterLines = usable.map((p) => `- ${p.name} → ${coffeeFormatBotMentionMarkdown(p)}`);
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
 * (must match one of the group ids) and `reason` (a short rationale).
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
    `  - Schema: {"botId": "<one of the listed ids>", "reason": "<one short sentence>"}`,
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
 * Parse the router LLM response into a `{ botId, reason }` pair.
 * Validates that `botId` is one of the allowed group ids; otherwise
 * returns null so the caller can fall back to the next bot in rotation.
 */
export function parseRouterResponse(
  raw: string,
  allowedBots: RouterAllowedBot[]
): { botId: string; reason: string } | null {
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
      const obj = parsed as { botId?: unknown; botName?: unknown; name?: unknown; reason?: unknown };
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
      return { botId, reason };
    } catch {
      // try the next candidate
    }
  }
  return null;
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
  /** Client-side timer snapshot for natural session wrap-up prompting. */
  sessionRemainingMs?: number | null;
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
    sessionRemainingMs,
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
  const speakerMentionRosterAppendix = buildCoffeeSpeakerMentionRosterAppendix(peers);
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

  const groupContextLines = [
    "You are sitting at Coffee Mode: an ambiguous coffee shop table inside PRISM.",
    history.length < 3
      ? "This table is still warming up. You can see the other participants' names, but do not act as if you already know them unless the transcript proves it."
      : "Use the current table transcript as your shared history with the user and the other bots.",
    ...topicLines,
    ...pollLines,
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
    "When another bot just spoke, often respond to that bot directly by name in second person before expanding your thought.",
    "Reply as one line of plain prose (no line breaks). Prefer one or two short sentences max, and vary your rhythm across turns so the table doesn't sound templated.",
    "Do not keep the same line length every turn. Mix very short reactions, medium lines, and occasional longer lines so the table breathes like a real conversation.",
    "Occasionally use casual conversational beats when natural for your persona (for example: \"I know, right?\", \"Wait, what was that you just said? Sorry, it went over my head.\", or \"No offense, but this is boring.\"). Use sparingly.",
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
              coffee_topic, incognito, created_at, updated_at
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
    ...(row.coffee_duration_minutes === 1 ||
    row.coffee_duration_minutes === 5 ||
    row.coffee_duration_minutes === 10
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
    throw new Error("Coffee polls need at least two options.");
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
    if (options.length >= 6) break;
  }
  if (options.length < 2) {
    throw new Error("Coffee polls need at least two options.");
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

function mapCoffeePoll(row: CoffeePollRow, voteRows: CoffeePollVoteRow[]): CoffeePoll {
  const options = parseCoffeePollOptions(row.options_json);
  const votes: CoffeePollVote[] = voteRows.map((vote): CoffeePollVote => ({
    botId: vote.bot_id,
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

function deterministicCoffeePollVote(args: {
  pollId: string;
  question: string;
  options: readonly string[];
  bot: CoffeeBotProfile;
  now: string;
}): {
  optionIndex: number;
  explanation: string;
  confidence: number;
  deliberation: CoffeePollDeliberation;
} {
  const optionIndex = Math.floor(
    stableUnitValue(`${args.pollId}:${args.bot.id}:${args.question}`) * args.options.length
  ) % args.options.length;
  const confidence = Math.round(
    (0.55 + stableUnitValue(`${args.pollId}:${args.bot.id}:confidence`) * 0.35) * 100
  ) / 100;
  const option = args.options[optionIndex] ?? args.options[0] ?? "";
  return {
    optionIndex,
    confidence,
    explanation: `${args.bot.name} leans toward "${option}" for this table prompt.`,
    deliberation: {
      stage: "finalized",
      leaningOptionIndex: optionIndex,
      alternateOptionIndex: null,
      confidence,
      blocker: null,
      note: null,
      updatedAt: args.now,
    },
  };
}

export async function collectCoffeePollVotes(
  db: DatabaseSync,
  userId: string,
  conversationId: string,
  pollId: string,
  _settings: CoffeeTurnSettings
): Promise<{ poll: CoffeePoll }> {
  const { group } = loadCoffeeConversationGroup(db, userId, conversationId);
  const loadedBefore = loadCoffeePollRows(db, userId, conversationId, pollId);
  if (!loadedBefore) {
    throw new Error("Coffee poll not found.");
  }
  const status = normalizeCoffeePollStatus(loadedBefore.poll.status);
  if (status === "cancelled") {
    throw new Error("Coffee poll has been cancelled.");
  }
  const options = parseCoffeePollOptions(loadedBefore.poll.options_json);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE coffee_polls
        SET status = 'collecting', updated_at = ?
      WHERE id = ? AND user_id = ? AND conversation_id = ?`
  ).run(now, pollId, userId, conversationId);
  const voteUpsert = db.prepare(
    `INSERT INTO coffee_poll_votes
       (user_id, poll_id, conversation_id, bot_id, vote_kind, option_index,
        explanation, suggested_option, confidence, deliberation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'option', ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(user_id, poll_id, bot_id) DO UPDATE SET
       vote_kind = excluded.vote_kind,
       option_index = excluded.option_index,
       explanation = excluded.explanation,
       suggested_option = excluded.suggested_option,
       confidence = excluded.confidence,
       deliberation_json = excluded.deliberation_json,
       updated_at = excluded.updated_at`
  );
  for (const bot of group) {
    const vote = deterministicCoffeePollVote({
      pollId,
      question: loadedBefore.poll.question,
      options,
      bot,
      now,
    });
    voteUpsert.run(
      userId,
      pollId,
      conversationId,
      bot.id,
      vote.optionIndex,
      vote.explanation,
      vote.confidence,
      JSON.stringify(vote.deliberation),
      now,
      now
    );
  }
  db.prepare(
    `UPDATE coffee_polls
        SET status = 'closed', closed_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND conversation_id = ?`
  ).run(now, now, pollId, userId, conversationId);
  const loadedAfter = loadCoffeePollRows(db, userId, conversationId, pollId);
  if (!loadedAfter) {
    throw new Error("Coffee poll not found.");
  }
  return { poll: mapCoffeePoll(loadedAfter.poll, loadedAfter.votes) };
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
  preferred: "local" | "openai"
): "local" | "openai" {
  if (preferred === "openai" && !speakerOnlineEnabled) return "local";
  return preferred;
}

/**
 * Build a `LlmProvider` for the speaker bot, honoring per-bot online
 * gating (a bot with `online_enabled = 0` always falls back to local).
 */
function pickSpeakerProvider(
  speaker: CoffeeBotProfile,
  preferred: "local" | "openai",
  openAiApiKey: string | undefined,
  secondaryOllamaHost: string | null | undefined
): { provider: LlmProvider; effectiveProvider: "local" | "openai" } {
  const effective = effectiveCoffeeSpeakerProvider(speaker.onlineEnabled, preferred);
  const provider = selectProvider(effective, openAiApiKey, secondaryOllamaHost);
  return { provider, effectiveProvider: effective };
}

function pickSpeakerModel(
  speaker: CoffeeBotProfile,
  effectiveProvider: "local" | "openai",
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
  llm?: { prismDefaultLlmModel?: string | null; autoPickStarterTopic?: boolean } | null
): Promise<CoffeeSessionCreateResponse> {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = loadCoffeeGroupProfiles(db, userId, groupIds);
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
  const provider = getAuxiliaryProvider(llm?.prismDefaultLlmModel ?? undefined);
  let coffeeStarterTopics = await inferCoffeeStarterTopics({
    provider,
    group,
    sessionSettings,
    presetLabel,
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
  llm?: { prismDefaultLlmModel?: string | null } | null
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
  const history = loadMessages(db, userId, row.id, historyLimit);
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
  const latestPollSummary = loadLatestClosedCoffeePollSummary(db, userId, row.id);
  const latestAssistantBeforeTurn = [...history]
    .reverse()
    .find((message): message is ChatMessage => message.role === "assistant") ?? null;
  let pickedBotId: string;
  let routerReason: string;
  if (directedSpeaker) {
    pickedBotId = directedSpeaker.id;
    routerReason = `Director mode picked ${directedSpeaker.name}.`;
  } else {
    const seatedBotIds = new Set(group.map((bot) => bot.id));
    const addressedBotId = latestAssistantBeforeTurn
      ? extractLastAddressedBotId({
          line: latestAssistantBeforeTurn.content,
          speakerBotId: resolveAssistantSpeakerBotId(latestAssistantBeforeTurn, group),
          seatedBotIds,
        })
      : null;
    if (addressedBotId) {
      const addressedSpeaker = group.find((bot) => bot.id === addressedBotId);
      if (addressedSpeaker) {
        pickedBotId = addressedSpeaker.id;
        routerReason = `Followed direct bot address to ${addressedSpeaker.name}.`;
      } else {
        const fallbackSpeaker = pickFallbackSpeaker(group, lastSpeakerBotId);
        pickedBotId = fallbackSpeaker.id;
        routerReason = ROUTER_FALLBACK_REASON;
      }
    } else {
      const routerProvider = getAuxiliaryProvider(settings.prismDefaultLlmModel ?? undefined);
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
    settings.secondaryOllamaHost
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
    sessionRemainingMs: settings.sessionRemainingMs,
  });
  const speakerReply = await speakerProvider.generateResponse(
    speakerMessages,
    speakerOptions
  );
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
    });
  }
  if (coffeeReplyLooksLikePromptLeak(replyText)) {
    replyText = buildCoffeeEmergencyFallbackReply({
      tableFocus,
      speaker,
      conversationId: row.id,
      historyLength: history.length,
      avoidTexts: recentCoffeeAssistantTexts(history),
      maxChars: replyCaps.tableReplyMaxChars,
    });
  }
  if (
    replyText &&
    (coffeeReplyRepeatsRecentAssistant(replyText, history) ||
      coffeeReplyRepeatsRecentMotifs(replyText, history))
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
    coffeeReplyRepeatsRecentAssistant(replyText, history) ||
    coffeeReplyRepeatsRecentMotifs(replyText, history)
  ) {
    replyText = buildCoffeeEmergencyFallbackReply({
      tableFocus,
      speaker,
      conversationId: row.id,
      historyLength: history.length,
      seedExtra: "repeat",
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
  });
  replyText = maybeApplyCoffeeOrganicSeed({
    replyText,
    conversationId: row.id,
    speaker,
    historyLength: history.length,
    turnKind,
    avoidTexts: recentCoffeeAssistantTexts(history),
  });
  // Promote any plain `@Name` / bare-name peer references into prism-bot mention
  // markdown so the client renders the chip + lights the notified glyph on the
  // addressed bot's seat. Safe even when the model already used the markdown.
  replyText = autoTagPeerMentionsInCoffeeReply(replyText, speaker, group);
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
  upsertCoffeeBotSocialState(db, userId, row.id, nextSocialByBotId, assistantNow);
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
