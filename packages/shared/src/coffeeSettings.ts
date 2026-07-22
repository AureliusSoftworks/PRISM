/**
 * Per-session Coffee table tuning. Persisted on the conversation row and
 * threaded into router/speaker prompts plus client-side rhythm timers.
 */

export type CoffeeResponseLengthPreset = "brief" | "balanced" | "detailed" | "roomy";

export type CoffeeTableEnergy = "still" | "relaxed" | "buzzy" | "theatre" | "afterparty";

export type CoffeeCrossTalkLevel = "rare" | "normal" | "chatty" | "pileup";

/** How much transcript the models may lean on. `recent` is alias for this-session until cross-thread recall exists. */
export type CoffeeMemoryCallbacks = "now" | "this-session" | "recent";

export type CoffeeBarRole = "cup" | "pot";
export type CoffeeBarDrink = "house" | "special";
export type CoffeeBarSpecialImageStatus = "idle" | "generating" | "ready" | "failed";
export type CoffeeFarewellFuseKind = "empty-cup" | "no-vessel";

export interface CoffeeBarServiceBotSnapshot {
  id: string | null;
  name: string;
  color: string | null;
  glyph: string | null;
  fallback: boolean;
}

export interface CoffeePlayerCupState {
  fillId: string;
  filledAt: string;
  topOffCount: number;
  sipCount: number;
}

export interface CoffeeWaiterOfferState {
  id: string;
  offeredAt: string;
  status: "open" | "accepted" | "declined";
}

export interface CoffeeBotWaiterVisitState {
  id: string;
  targetBotId: string;
  targetName: string;
  offeredAt: string;
  afterReplyCount: number;
  status: "accepted" | "declined";
}

export interface CoffeeFarewellFuseState {
  kind: CoffeeFarewellFuseKind;
  fillId: string;
  drainedAt: string;
  createdReplyCount: number;
  dueAfterReplyCount: number;
}

/** Session-only persisted Coffee ritual and physical pacing state. */
export interface CoffeeBarRitualState {
  version: 1;
  serviceBot: CoffeeBarServiceBotSnapshot;
  role: CoffeeBarRole | null;
  drink: CoffeeBarDrink | null;
  orderText: string | null;
  clarificationUsed: boolean;
  generationAttemptId: string | null;
  specialImageStatus: CoffeeBarSpecialImageStatus;
  specialImageId: string | null;
  playerCup: CoffeePlayerCupState | null;
  waiterOffers: number;
  activeWaiterOffer: CoffeeWaiterOfferState | null;
  lastBotWaiterVisit: CoffeeBotWaiterVisitState | null;
  liveStartedAt: string | null;
  hardStopAt: string | null;
  visitStartedAtByBotId: Record<string, string>;
  farewellFusesByBotId: Record<string, CoffeeFarewellFuseState>;
}

export interface CoffeeSessionSettings {
  responseLength: CoffeeResponseLengthPreset;
  /** 0 = slower pauses, 50 = neutral, 100 = snappier (matches UI slider). */
  responseDelayBias: number;
  tableEnergy: CoffeeTableEnergy;
  crossTalk: CoffeeCrossTalkLevel;
  /** 0 = tight spacing, 50 = medium, 100 = loose (matches UI slider). */
  breathingRoom: number;
  /** 0 = steady delivery, 50 = natural, 100 = expressive. */
  humanPacing: number;
  stayOnThread: boolean;
  givePlayerLastWord: boolean;
  memoryCallbacks: CoffeeMemoryCallbacks;
  /** Session-only. Groups and presets omit this ritual snapshot. */
  barRitual?: CoffeeBarRitualState;
}

/** Defaults are the lively middle-ground Coffee table, with chaos still opt-in. */
export const DEFAULT_COFFEE_SESSION_SETTINGS: CoffeeSessionSettings = {
  responseLength: "detailed",
  responseDelayBias: 76,
  tableEnergy: "theatre",
  crossTalk: "chatty",
  breathingRoom: 24,
  humanPacing: 50,
  stayOnThread: true,
  givePlayerLastWord: false,
  memoryCallbacks: "this-session",
};

/** Absolute ceiling for tabletop reply length (layout + latency guardrail). */
export const COFFEE_TABLE_REPLY_MAX_CHARS_HARD = 240;

/** Absolute ceiling for speaker decode tokens. */
export const COFFEE_SPEAKER_REPLY_MAX_OUTPUT_TOKENS_HARD = 180;

/** Max messages loaded from DB / forwarded window (plan: cap at 32). */
export const COFFEE_HISTORY_WINDOW_HARD_CAP = 32;

const RESPONSE_LENGTH_SET = new Set<CoffeeResponseLengthPreset>([
  "brief",
  "balanced",
  "detailed",
  "roomy",
]);

const TABLE_ENERGY_SET = new Set<CoffeeTableEnergy>([
  "still",
  "relaxed",
  "buzzy",
  "theatre",
  "afterparty",
]);

const CROSS_TALK_SET = new Set<CoffeeCrossTalkLevel>(["rare", "normal", "chatty", "pileup"]);

const MEMORY_SET = new Set<CoffeeMemoryCallbacks>(["now", "this-session", "recent"]);

export const COFFEE_AUTO_HARD_CAP_MS = 30 * 60 * 1000;
export const COFFEE_BAR_ORDER_MAX_LENGTH = 240;

function compactText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maxLength)
    : "";
}

function isoString(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeCoffeeBarRitual(value: unknown): CoffeeBarRitualState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const serviceRaw = raw.serviceBot && typeof raw.serviceBot === "object" && !Array.isArray(raw.serviceBot)
    ? raw.serviceBot as Record<string, unknown>
    : {};
  const serviceBot: CoffeeBarServiceBotSnapshot = {
    id: compactText(serviceRaw.id, 180) || null,
    name: compactText(serviceRaw.name, 100) || "PRISM Barista",
    color: compactText(serviceRaw.color, 40) || null,
    glyph: compactText(serviceRaw.glyph, 80) || null,
    fallback: serviceRaw.fallback === true,
  };
  const role = raw.role === "cup" || raw.role === "pot" ? raw.role : null;
  const drink = raw.drink === "house" || raw.drink === "special" ? raw.drink : null;
  const specialImageStatus = raw.specialImageStatus === "generating" ||
    raw.specialImageStatus === "ready" || raw.specialImageStatus === "failed"
    ? raw.specialImageStatus
    : "idle";
  const playerCupRaw = raw.playerCup && typeof raw.playerCup === "object" && !Array.isArray(raw.playerCup)
    ? raw.playerCup as Record<string, unknown>
    : null;
  const playerCup = playerCupRaw && compactText(playerCupRaw.fillId, 180) && isoString(playerCupRaw.filledAt)
    ? {
        fillId: compactText(playerCupRaw.fillId, 180),
        filledAt: isoString(playerCupRaw.filledAt)!,
        topOffCount: Math.max(0, Math.min(100, Math.floor(Number(playerCupRaw.topOffCount) || 0))),
        sipCount: Math.max(0, Math.min(100, Math.floor(Number(playerCupRaw.sipCount) || 0))),
      }
    : null;
  const waiterRaw = raw.activeWaiterOffer && typeof raw.activeWaiterOffer === "object" && !Array.isArray(raw.activeWaiterOffer)
    ? raw.activeWaiterOffer as Record<string, unknown>
    : null;
  const activeWaiterOffer: CoffeeWaiterOfferState | null = waiterRaw && compactText(waiterRaw.id, 180) && isoString(waiterRaw.offeredAt)
    ? {
        id: compactText(waiterRaw.id, 180),
        offeredAt: isoString(waiterRaw.offeredAt)!,
        status: waiterRaw.status === "accepted" || waiterRaw.status === "declined"
          ? waiterRaw.status
          : "open",
      }
    : null;
  const botVisitRaw = raw.lastBotWaiterVisit && typeof raw.lastBotWaiterVisit === "object" && !Array.isArray(raw.lastBotWaiterVisit)
    ? raw.lastBotWaiterVisit as Record<string, unknown>
    : null;
  const lastBotWaiterVisit: CoffeeBotWaiterVisitState | null = botVisitRaw &&
    compactText(botVisitRaw.id, 180) && compactText(botVisitRaw.targetBotId, 180) &&
    compactText(botVisitRaw.targetName, 100) && isoString(botVisitRaw.offeredAt)
    ? {
        id: compactText(botVisitRaw.id, 180),
        targetBotId: compactText(botVisitRaw.targetBotId, 180),
        targetName: compactText(botVisitRaw.targetName, 100),
        offeredAt: isoString(botVisitRaw.offeredAt)!,
        afterReplyCount: Math.max(0, Math.floor(Number(botVisitRaw.afterReplyCount) || 0)),
        status: botVisitRaw.status === "declined" ? "declined" : "accepted",
      }
    : null;
  const farewellFusesByBotId: Record<string, CoffeeFarewellFuseState> = {};
  const visitStartedAtByBotId: Record<string, string> = {};
  const visitStartRaw = raw.visitStartedAtByBotId && typeof raw.visitStartedAtByBotId === "object" && !Array.isArray(raw.visitStartedAtByBotId)
    ? raw.visitStartedAtByBotId as Record<string, unknown>
    : {};
  for (const [rawBotId, value] of Object.entries(visitStartRaw).slice(0, 12)) {
    const botId = compactText(rawBotId, 180);
    const startedAt = isoString(value);
    if (botId && startedAt) visitStartedAtByBotId[botId] = startedAt;
  }
  const fuseRaw = raw.farewellFusesByBotId && typeof raw.farewellFusesByBotId === "object" && !Array.isArray(raw.farewellFusesByBotId)
    ? raw.farewellFusesByBotId as Record<string, unknown>
    : {};
  for (const [rawBotId, value] of Object.entries(fuseRaw).slice(0, 12)) {
    const botId = compactText(rawBotId, 180);
    if (!botId || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const fuse = value as Record<string, unknown>;
    const fillId = compactText(fuse.fillId, 180);
    const drainedAt = isoString(fuse.drainedAt);
    const createdReplyCount = Math.max(0, Math.floor(Number(fuse.createdReplyCount) || 0));
    const dueAfterReplyCount = Math.max(createdReplyCount + 1, Math.floor(Number(fuse.dueAfterReplyCount) || 0));
    if (!fillId || !drainedAt) continue;
    farewellFusesByBotId[botId] = {
      kind: fuse.kind === "no-vessel" ? "no-vessel" : "empty-cup",
      fillId,
      drainedAt,
      createdReplyCount,
      dueAfterReplyCount: Math.min(createdReplyCount + 2, dueAfterReplyCount),
    };
  }
  return {
    version: 1,
    serviceBot,
    role,
    drink,
    orderText: compactText(raw.orderText, COFFEE_BAR_ORDER_MAX_LENGTH) || null,
    clarificationUsed: raw.clarificationUsed === true,
    generationAttemptId: compactText(raw.generationAttemptId, 180) || null,
    specialImageStatus,
    specialImageId: compactText(raw.specialImageId, 180) || null,
    playerCup,
    waiterOffers: Math.max(0, Math.min(100, Math.floor(Number(raw.waiterOffers) || 0))),
    activeWaiterOffer,
    lastBotWaiterVisit,
    liveStartedAt: isoString(raw.liveStartedAt),
    hardStopAt: isoString(raw.hardStopAt),
    visitStartedAtByBotId,
    farewellFusesByBotId,
  };
}

export function coffeeFarewellReplyDelay(seed: string): 2 | 3 {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? 2 : 3;
}

/** Removes session ritual state before settings are saved as a reusable group/preset. */
export function coffeeReusableSessionSettings(
  settings: CoffeeSessionSettings,
): CoffeeSessionSettings {
  const { barRitual: _barRitual, ...reusable } = settings;
  return reusable;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Parse and clamp a Coffee settings payload from JSON or API bodies.
 * Unknown fields fall back to {@link DEFAULT_COFFEE_SESSION_SETTINGS}.
 */
export function normalizeCoffeeSessionSettings(raw: unknown): CoffeeSessionSettings {
  const base = DEFAULT_COFFEE_SESSION_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;

  const responseLength =
    typeof o.responseLength === "string" && RESPONSE_LENGTH_SET.has(o.responseLength as CoffeeResponseLengthPreset)
      ? (o.responseLength as CoffeeResponseLengthPreset)
      : base.responseLength;

  let responseDelayBias = base.responseDelayBias;
  if (typeof o.responseDelayBias === "number") {
    responseDelayBias = clampInt(o.responseDelayBias, 0, 100);
  }

  const tableEnergy =
    typeof o.tableEnergy === "string" && TABLE_ENERGY_SET.has(o.tableEnergy as CoffeeTableEnergy)
      ? (o.tableEnergy as CoffeeTableEnergy)
      : base.tableEnergy;

  const crossTalk =
    typeof o.crossTalk === "string" && CROSS_TALK_SET.has(o.crossTalk as CoffeeCrossTalkLevel)
      ? (o.crossTalk as CoffeeCrossTalkLevel)
      : base.crossTalk;

  let breathingRoom = base.breathingRoom;
  if (typeof o.breathingRoom === "number") {
    breathingRoom = clampInt(o.breathingRoom, 0, 100);
  }

  let humanPacing = base.humanPacing;
  if (typeof o.humanPacing === "number") {
    humanPacing = clampInt(o.humanPacing, 0, 100);
  }

  const stayOnThread = typeof o.stayOnThread === "boolean" ? o.stayOnThread : base.stayOnThread;
  const givePlayerLastWord =
    typeof o.givePlayerLastWord === "boolean" ? o.givePlayerLastWord : base.givePlayerLastWord;

  let memoryCallbacks = base.memoryCallbacks;
  if (typeof o.memoryCallbacks === "string" && MEMORY_SET.has(o.memoryCallbacks as CoffeeMemoryCallbacks)) {
    memoryCallbacks = o.memoryCallbacks as CoffeeMemoryCallbacks;
  }

  return {
    responseLength,
    responseDelayBias,
    tableEnergy,
    crossTalk,
    breathingRoom,
    humanPacing,
    stayOnThread,
    givePlayerLastWord,
    memoryCallbacks,
    ...(normalizeCoffeeBarRitual(o.barRitual)
      ? { barRitual: normalizeCoffeeBarRitual(o.barRitual) }
      : {}),
  };
}

/** Effective memory mode: `recent` behaves like `this-session` until cross-thread recall ships. */
export function coffeeEffectiveMemoryCallbacks(settings: CoffeeSessionSettings): "now" | "this-session" {
  if (settings.memoryCallbacks === "now") return "now";
  return "this-session";
}

/**
 * Table card character target and speaker decode headroom from response length
 * preset, clamped to hard ceilings. The character cap is prompt-side guidance;
 * the token cap should leave enough room for the model to finish a sentence.
 */
export function coffeeReplyLengthCaps(settings: CoffeeSessionSettings): {
  tableReplyMaxChars: number;
  speakerMaxOutputTokens: number;
} {
  const preset = settings.responseLength;
  let tableReplyMaxChars: number;
  let speakerMaxOutputTokens: number;
  switch (preset) {
    case "brief":
      tableReplyMaxChars = 60;
      speakerMaxOutputTokens = 72;
      break;
    case "detailed":
      tableReplyMaxChars = 160;
      speakerMaxOutputTokens = 132;
      break;
    case "roomy":
      tableReplyMaxChars = 220;
      speakerMaxOutputTokens = 180;
      break;
    case "balanced":
    default:
      tableReplyMaxChars = 110;
      speakerMaxOutputTokens = 104;
      break;
  }
  return {
    tableReplyMaxChars: Math.min(COFFEE_TABLE_REPLY_MAX_CHARS_HARD, tableReplyMaxChars),
    speakerMaxOutputTokens: Math.min(
      COFFEE_SPEAKER_REPLY_MAX_OUTPUT_TOKENS_HARD,
      speakerMaxOutputTokens
    ),
  };
}

/** Messages loaded from DB for router + speaker (capped). */
export function coffeeEffectiveHistoryLimit(settings: CoffeeSessionSettings): number {
  const mem = coffeeEffectiveMemoryCallbacks(settings);
  if (mem === "now") return Math.min(COFFEE_HISTORY_WINDOW_HARD_CAP, 6);
  return Math.min(COFFEE_HISTORY_WINDOW_HARD_CAP, 24);
}

/** How many recent transcript lines the router sees (subset of loaded history). */
export function coffeeRouterTailMessageCount(settings: CoffeeSessionSettings): number {
  const mem = coffeeEffectiveMemoryCallbacks(settings);
  if (mem === "now") return 3;
  const cross = settings.crossTalk;
  if (cross === "pileup") return Math.min(12, coffeeEffectiveHistoryLimit(settings));
  if (cross === "chatty") return Math.min(10, coffeeEffectiveHistoryLimit(settings));
  if (cross === "rare") return 5;
  return 8;
}

const ROUTER_TEMPERATURE_BASE = 0.2;

/**
 * Nudge router temperature slightly from delay bias (snappier = a touch higher).
 */
export function coffeeRouterTemperature(settings: CoffeeSessionSettings): number {
  const bias = (settings.responseDelayBias - 50) / 50;
  const delayDelta = bias * 0.08;
  const crossTalkDelta =
    settings.crossTalk === "pileup"
      ? 0.06
      : settings.crossTalk === "chatty"
        ? 0.03
        : settings.crossTalk === "rare"
          ? -0.02
          : 0;
  return Math.min(
    0.45,
    Math.max(0.05, ROUTER_TEMPERATURE_BASE + delayDelta + crossTalkDelta)
  );
}
