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

import type { DatabaseSync } from "node:sqlite";
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
  CoffeeInterruptionEvent,
  CoffeeInterruptionSocialDelta,
  CoffeePlayerInterruptionInput,
  CoffeeSessionCreateResponse,
  CoffeeSessionSettings,
  CoffeeTurnResponse,
} from "@localai/shared";
import {
  coffeeEffectiveHistoryLimit,
  coffeeReplyLengthCaps,
  coffeeRouterTailMessageCount,
  coffeeRouterTemperature,
  normalizeCoffeeSessionSettings,
} from "@localai/shared";

/** Coffee groups must have at least 2 and at most 5 bots. */
export const COFFEE_GROUP_MIN_SIZE = 2;
export const COFFEE_GROUP_MAX_SIZE = 5;

/** Default tabletop cap when callers omit an explicit limit (tests + legacy). */
export const COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS = 48;

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
const COFFEE_PLAYER_INTERRUPT_BASE_DISPOSITION_DELTA = -0.03;
const COFFEE_PLAYER_INTERRUPT_BASE_FRICTION_DELTA = 0.03;
const COFFEE_PLAYER_INTERRUPT_THIRD_PARTY_FRICTION_DELTA = 0.012;
const COFFEE_BOT_INTERRUPT_BASE_CHANCE = 0.03;
const COFFEE_BOT_INTERRUPT_MAX_CHANCE = 0.16;

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
        .trim();
    }
    if (text === before) break;
  }

  return text;
}

/**
 * Collapse whitespace and trim Coffee replies so the live table stays a tiny
 * card; prefer ending on sentence punctuation when clipping is required.
 */
export function clampCoffeeTableReplyText(
  raw: string,
  maxChars: number = COFFEE_TABLE_REPLY_DEFAULT_MAX_CHARS
): string {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const slice = normalized.slice(0, maxChars);
  const minSentenceCut = Math.floor(maxChars * 0.42);
  for (let index = slice.length - 1; index >= minSentenceCut; index -= 1) {
    const char = slice[index];
    if (char === "." || char === "!" || char === "?") {
      const next = slice[index + 1];
      if (!next || /\s/u.test(next)) {
        return slice.slice(0, index + 1).trim();
      }
    }
  }

  const wordTrimmed = normalized.slice(0, maxChars - 1);
  const space = wordTrimmed.lastIndexOf(" ");
  if (space >= minSentenceCut) {
    return `${wordTrimmed.slice(0, space).trim()}…`;
  }
  return `${wordTrimmed.trim()}…`;
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
}

export interface CoffeeTurnInput {
  conversationId?: string;
  groupBotIds?: Array<string | null>;
  message: string;
  playerInterruption?: CoffeePlayerInterruptionInput;
}

export interface CoffeeSessionCreateInput {
  groupBotIds?: Array<string | null>;
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

function quantizeDelta(value: number): number {
  return Math.round(value * 1000) / 1000;
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
  group: readonly CoffeeBotProfile[];
  socialByBotId: Record<string, CoffeeBotSocialSnapshot>;
}): CoffeeInterruptionSocialDelta[] {
  const interruptedSocial = args.socialByBotId[args.interruptedBotId] ?? DEFAULT_COFFEE_SOCIAL;
  const normalizedVisibleTokens = Math.min(
    COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP,
    Math.max(COFFEE_INTERRUPTION_MIN_VISIBLE_TOKENS, args.visibleTokenCount)
  );
  const severity = normalizedVisibleTokens / COFFEE_INTERRUPTION_VISIBLE_TOKEN_SOFT_CAP;
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

  const consequences: CoffeeInterruptionSocialDelta[] = [
    {
      botId: args.speaker.id,
      dispositionDelta: quantizeDelta(-0.01),
      valuesFrictionDelta: quantizeDelta(0.018),
    },
  ];
  for (const bot of args.group) {
    if (bot.id === args.speaker.id) continue;
    consequences.push({
      botId: bot.id,
      dispositionDelta: quantizeDelta(-0.003),
      valuesFrictionDelta: quantizeDelta(0.008),
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
              online_enabled, temperature, max_tokens
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
    });
  }
  return profiles;
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
    "Coffee style cues (the tabletop cap below overrides everything):",
    energyLine,
    crossLine,
    `Hard tabletop cap for this session: ${tableReplyMaxChars} characters including spaces.`,
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

function coffeeTranscriptContainsPrismBotMention(
  userMessage: string,
  history: readonly { content: string }[]
): boolean {
  if (userMessage.includes("prism-bot://")) return true;
  return history.some((m) => m.content.includes("prism-bot://"));
}

/** Router/speaker appendix only when table text includes prism-bot markdown links. */
const PRISM_BOT_MENTION_COFFEE_APPENDIX =
  "The user may @-mention bots with markdown like [Label](prism-bot://botId) (botId may be URL-encoded). Prefer the mentioned bot as the next speaker when that fits the table.";

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
  sessionSettings?: CoffeeSessionSettings;
}): ProviderMessage[] {
  const {
    group,
    history,
    userMessage,
    lastSpeakerBotId,
    socialByBotId = {},
    turnKind = "user",
    sessionSettings,
  } = args;
  const settings = sessionSettings ?? normalizeCoffeeSessionSettings(undefined);

  const personaLines = group.map((bot) => {
    const personaSnippet = summarizePersonaForRouter(bot.systemPrompt);
    return `- id="${bot.id}" name="${bot.name}"${personaSnippet ? ` persona=${personaSnippet}` : ""}`;
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

  const prismBotMentionHint = coffeeTranscriptContainsPrismBotMention(userMessage, history);

  const systemContent = [
    "You are the silent moderator of Coffee Mode, a calm live conversation around an ambiguous coffee table inside PRISM.",
    "There are several bots in this group, each with a distinct personality. They may speak to the user or to each other.",
    "For each table moment, choose EXACTLY ONE bot from the group to respond next, based on which bot's personality, interests, current energy, and fit for the recent conversation make them the most natural speaker.",
    "The user is one participant at the table, not the center of every turn.",
    "When the latest table moment comes from another bot, it is okay for the next bot to respond, add a small observation, let the topic breathe, or gently change topics.",
    "Do not force every bot to answer everything that is on the table. Pick the next voice only when a short contribution would feel welcome.",
    "The bots should never talk over each other. Choose one voice and leave room for natural pauses.",
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
  firstContactIntro?: boolean;
  sessionSettings?: CoffeeSessionSettings;
}): ProviderMessage[] {
  const {
    speaker,
    group,
    history,
    userMessage,
    socialByBotId,
    userDisplayName,
    turnKind = "user",
    firstContactIntro = false,
    sessionSettings,
  } = args;
  const settings = sessionSettings ?? normalizeCoffeeSessionSettings(undefined);
  const { tableReplyMaxChars } = coffeeReplyLengthCaps(settings);
  const speakerSystemPrompt = composeBotSystemPrompt(
    speaker.name,
    speaker.systemPrompt
  );
  const peerLines = group
    .filter((bot) => bot.id !== speaker.id)
    .map((bot) => `- ${bot.name}`);
  const speakerSocial = socialByBotId[speaker.id] ?? DEFAULT_COFFEE_SOCIAL;

  const prismBotMentionHint = coffeeTranscriptContainsPrismBotMention(userMessage, history);

  const groupContextLines = [
    "You are sitting at Coffee Mode: an ambiguous coffee shop table inside PRISM.",
    history.length < 3
      ? "This table is still warming up. You can see the other participants' names, but do not act as if you already know them unless the transcript proves it."
      : "Use the current table transcript as your shared history with the user and the other bots.",
    "You are participating in a live group conversation with the user and the following other bots:",
    ...peerLines,
    "",
    "Stay in character. Respond as yourself only — do NOT speak on behalf of the other bots, do NOT include their names as speakers, and do NOT prefix your reply with your own name.",
    "You may react directly to what another bot just said, agree, disagree, add one concrete thought, pause into a softer observation, or gently shift the topic when that fits your personality.",
    "The user is present, but Coffee should feel like a group conversation. Do not turn every reply back toward the user.",
    "Reply as one line of plain prose (no line breaks). ONE clause only — a single short utterance, like a reaction bark or one breath. No second sentence, no semicolon piles, no em dash add-ons.",
    `Hard tabletop cap: ${tableReplyMaxChars} characters including spaces. Anything longer is clipped and looks broken.`,
    `Examples: "Hey Patrick!" "Wild shift, huh?" "Yeah, I get that." If you're tempted to type more, stop sooner (cap is ${tableReplyMaxChars} chars).`,
    "No asterisk stage directions (like *excitedly*), no parenthetical acting notes.",
    "Do not end with a question by default. Ask a question only when it is genuinely the most natural next move; otherwise end with a statement, observation, or small offer.",
    "Do not write as if you are cutting off another bot mid-sentence. Coffee only presents cutoffs when the app has explicit interruption metadata.",
    "Avoid long monologues; the table should feel like a shared room, not a speech.",
    "Leave room for another bot or the user to respond after a natural pause.",
    "",
    "Hidden social metrics for this moment (0..1):",
    `- You (${speaker.name}): disposition=${speakerSocial.disposition.toFixed(2)}, valuesFriction=${speakerSocial.valuesFriction.toFixed(2)}, restraint=${speakerSocial.restraint.toFixed(2)}, engagement=${speakerSocial.engagement.toFixed(2)}, leavePressure=${speakerSocial.leavePressure.toFixed(2)}`,
    "- If your valuesFriction and restraint are both high, set calm boundaries, be brief, or politely step back. Avoid insults or hostile escalation.",
    "- If leavePressure is high, prefer short grounded replies and occasional gentle withdrawal language.",
    ...(prismBotMentionHint ? ["", PRISM_BOT_MENTION_COFFEE_APPENDIX] : []),
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
            "Continue the table conversation in your own voice.",
            `Latest table moment: ${userMessage}`,
            `Respond as ${speaker.name} to the latest bot, the shared topic, or a natural topic shift. Only address the user if that is truly the natural next move.`,
            `Length: one clause only — hard cap ${tableReplyMaxChars} characters including spaces.`,
            "Do not end with a question unless the moment truly needs one.",
            "Do not include a speaker label.",
          ].join("\n"),
        }
      : {
          role: "user",
          content: [
            `The user says: ${userMessage}`,
            "Reply naturally as part of the table conversation. You may answer the user directly or open the topic to another bot.",
            `Length: one clause only — hard cap ${tableReplyMaxChars} characters including spaces.`,
            "Do not end with a question unless the moment truly needs one.",
            "Do not include a speaker label.",
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
  incognito: number;
  created_at: string;
  updated_at: string;
}

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
      `SELECT id, user_id, title, conversation_mode, bot_id, bot_group_ids, coffee_settings, incognito, created_at, updated_at
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
  return rowsDesc
    .slice()
    .reverse()
    .map((row): ChatMessage => ({
      id: row.id,
      role: row.role,
      content: row.content,
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
    ...(seatBotIds.some((id) => id !== null) ? { coffeeSeatBotIds: seatBotIds } : {}),
    ...(socialByBotId && Object.keys(socialByBotId).length > 0
      ? { coffeeBotSocialById: socialByBotId }
      : {}),
    coffeeSettings: parseStoredCoffeeSessionSettings(row.coffee_settings),
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

function parseStoredBotGroupIds(raw: string | null): string[] {
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

function parseStoredCoffeeSeatBotIds(raw: string | null): Array<string | null> {
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
  let effective: "local" | "openai" = preferred;
  if (preferred === "openai" && !speaker.onlineEnabled) {
    effective = "local";
  }
  const provider = selectProvider(effective, openAiApiKey, secondaryOllamaHost);
  return { provider, effectiveProvider: effective };
}

function pickSpeakerModel(
  speaker: CoffeeBotProfile,
  effectiveProvider: "local" | "openai"
): string | undefined {
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

export function createCoffeeConversation(
  db: DatabaseSync,
  userId: string,
  input: CoffeeSessionCreateInput
): CoffeeSessionCreateResponse {
  const seatBotIds = normalizeCoffeeSeatBotIds(input.groupBotIds);
  const groupIds = seatBotIds.filter((id): id is string => typeof id === "string");
  const group = loadCoffeeGroupProfiles(db, userId, groupIds);
  const now = new Date().toISOString();
  const conversationId = randomId(12);
  const initialSocialByBotId = initializeCoffeeSocialState(group, {});
  const sessionSettings = normalizeCoffeeSessionSettings(input.coffeeSettings);
  const coffeeSettingsJson = JSON.stringify(sessionSettings);
  db.prepare(
    `INSERT INTO conversations
       (id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito, coffee_settings, created_at, updated_at)
     VALUES (?, ?, ?, 'coffee', NULL, ?, 0, ?, ?, ?)`
  ).run(
    conversationId,
    userId,
    generateCoffeeTitle("", group),
    JSON.stringify(seatBotIds),
    coffeeSettingsJson,
    now,
    now
  );
  upsertCoffeeBotSocialState(db, userId, conversationId, initialSocialByBotId, now);
  const row = loadConversationRow(db, userId, conversationId);
  if (!row) {
    throw new Error("Failed to create Coffee conversation.");
  }
  return {
    conversation: buildConversationResponse({
      row,
      messages: [],
      lastSpeakerBotId: null,
      socialByBotId: initialSocialByBotId,
    }),
    arrivalScenario: pickArrivalScenario(conversationId),
  };
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
  const lastSpeakerBotId = loadLastSpeakerBotId(db, userId, row.id);
  const persistedSocialByBotId = loadCoffeeBotSocialState(
    db,
    userId,
    row.id,
    group.map((bot) => bot.id)
  );
  const socialByBotId = initializeCoffeeSocialState(group, persistedSocialByBotId);
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
  let pickedBotId: string;
  let routerReason: string;
  if (directedSpeaker) {
    pickedBotId = directedSpeaker.id;
    routerReason = `Director mode picked ${directedSpeaker.name}.`;
  } else {
    const routerProvider = getAuxiliaryProvider();
    const routerMessages = buildRouterPrompt({
      group,
      history,
      userMessage: tableFocus,
      lastSpeakerBotId,
      socialByBotId: preTurnSocialByBotId,
      turnKind,
      sessionSettings,
    });
    try {
      const routerRaw = await routerProvider.generateResponse(routerMessages, {
        temperature: coffeeRouterTemperature(sessionSettings),
        maxTokens: ROUTER_MAX_TOKENS,
      });
      const parsed = parseRouterResponse(routerRaw, group);
      if (parsed) {
        pickedBotId = parsed.botId;
        routerReason = parsed.reason;
      } else {
        const fallback = pickFallbackSpeaker(group, lastSpeakerBotId);
        pickedBotId = fallback.id;
        routerReason = ROUTER_FALLBACK_REASON;
      }
    } catch {
      const fallback = pickFallbackSpeaker(group, lastSpeakerBotId);
      pickedBotId = fallback.id;
      routerReason = "Router error (fell back to round-robin)";
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
  const speakerModel = pickSpeakerModel(speaker, effectiveProvider);
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
    firstContactIntro: turnKind === "user" && shouldUseFirstContactIntro,
    sessionSettings,
  });
  const speakerReply = await speakerProvider.generateResponse(
    speakerMessages,
    speakerOptions
  );
  const replyText =
    typeof speakerReply === "string"
      ? clampCoffeeTableReplyText(
          stripCoffeeSpeakerPrefix(speakerReply, speaker.name),
          replyCaps.tableReplyMaxChars
        )
      : "";
  if (!replyText) {
    throw new Error("Speaker bot returned an empty reply.");
  }
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
         (id, user_id, title, conversation_mode, bot_id, bot_group_ids, incognito, coffee_settings, created_at, updated_at)
       VALUES (?, ?, ?, 'coffee', NULL, ?, 0, NULL, ?, ?)`
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

  // 1. Persist the user message.
  const userMessageId = randomId(12);
  db.prepare(
    `INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at)
     VALUES (?, ?, ?, 'user', ?, NULL, ?)`
  ).run(userMessageId, conversationRow.id, userId, message, now);

  return generateCoffeeBotReply({
    db,
    userId,
    row: conversationRow,
    group,
    tableFocus: message,
    settings,
    turnKind: "user",
    playerInterruption: input.playerInterruption,
  });
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
  const sessionSettings = parseStoredCoffeeSessionSettings(row.coffee_settings);
  const historyLimit = coffeeEffectiveHistoryLimit(sessionSettings);
  const history = loadMessages(db, userId, row.id, historyLimit);
  const latest = history[history.length - 1];
  const tableFocus = latest
    ? latest.role === "assistant" && latest.botName
      ? `${latest.botName} just said: ${latest.content}`
      : latest.content
    : "The user has just arrived at the PRISM coffee table. Begin naturally, as if everyone is settling in with coffee.";
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
