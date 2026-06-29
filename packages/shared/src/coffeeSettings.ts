/**
 * Per-session Coffee table tuning. Persisted on the conversation row and
 * threaded into router/speaker prompts plus client-side rhythm timers.
 */

export type CoffeeResponseLengthPreset = "brief" | "balanced" | "detailed" | "roomy";

export type CoffeeTableEnergy = "still" | "relaxed" | "buzzy" | "theatre";

export type CoffeeCrossTalkLevel = "rare" | "normal" | "chatty";

/** How much transcript the models may lean on. `recent` is alias for this-session until cross-thread recall exists. */
export type CoffeeMemoryCallbacks = "now" | "this-session" | "recent";

export interface CoffeeSessionSettings {
  responseLength: CoffeeResponseLengthPreset;
  /** 0 = slower pauses, 50 = neutral, 100 = snappier (matches UI slider). */
  responseDelayBias: number;
  tableEnergy: CoffeeTableEnergy;
  crossTalk: CoffeeCrossTalkLevel;
  /** 0 = tight spacing, 50 = medium, 100 = loose (matches UI slider). */
  breathingRoom: number;
  stayOnThread: boolean;
  givePlayerLastWord: boolean;
  memoryCallbacks: CoffeeMemoryCallbacks;
}

/** Defaults match the pre-settings Coffee pipeline and the UI mock defaults. */
export const DEFAULT_COFFEE_SESSION_SETTINGS: CoffeeSessionSettings = {
  responseLength: "balanced",
  responseDelayBias: 38,
  tableEnergy: "relaxed",
  crossTalk: "normal",
  breathingRoom: 48,
  stayOnThread: true,
  givePlayerLastWord: true,
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

const TABLE_ENERGY_SET = new Set<CoffeeTableEnergy>(["still", "relaxed", "buzzy", "theatre"]);

const CROSS_TALK_SET = new Set<CoffeeCrossTalkLevel>(["rare", "normal", "chatty"]);

const MEMORY_SET = new Set<CoffeeMemoryCallbacks>(["now", "this-session", "recent"]);

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
    stayOnThread,
    givePlayerLastWord,
    memoryCallbacks,
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
  const delta = bias * 0.08;
  return Math.min(0.45, Math.max(0.05, ROUTER_TEMPERATURE_BASE + delta));
}
