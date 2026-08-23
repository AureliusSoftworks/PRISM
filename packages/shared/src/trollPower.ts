import { botPowerTrollsV1 } from "./botPower.ts";
import type { PrismMoodState } from "./mood.ts";

export const BOT_POWER_TROLL_RICKROLL_CHANCE_PERCENT_V1 = 3 as const;
export const BOT_POWER_TROLL_MEME_CHANCE_PERCENT_V1 = 6 as const;
export const BOT_POWER_TROLL_BODILY_ACTION_CHANCE_PERCENT_V1 = 8 as const;
export const BOT_POWER_TROLL_RICKROLL_MAX_CHARS_V1 = 12_000 as const;

/**
 * Release-safe built-in Rickroll. Keep quoted lyrics to this short hook;
 * rights-cleared or user-owned builds may inject a longer payload explicitly.
 */
export const BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1 =
  "Never gonna give you up, never gonna let you down.\n\n" +
  "ROFL get rickrolled: https://youtu.be/dQw4w9WgXcQ";

/** Local-only cards: no URL, attachment fetch, generation, or provider spend. */
export const BOT_POWER_TROLL_MEME_CARDS_V1 = [
  "┌─ TROLL POST ─┐\n│ source: trust me bro │\n└────────────────┘",
  "(╯°□°)╯︵ ┻━┻\nTroll has entered the discourse.",
  "NPC: stay on topic\nTROLL: side quest accepted",
  "Nobody:\nAbsolutely nobody:\nTroll: lolwut",
] as const;

export type BotPowerTrollBodilyActionV1 = "fart" | "burp";
export type BotPowerTrollDeliveryKindV1 = "ordinary" | "rickroll" | "meme";

/** Public, authorized, replay-safe projection. Contains no private prompt. */
export interface BotPowerTrollPresentationV1 {
  v: 1;
  name: "trollPresentation";
  stableTurnKey: string;
  deliveryKind: BotPowerTrollDeliveryKindV1;
  ordinaryInterruptionImmune: true;
  fixedMood: "warm";
  bodilyAction?: BotPowerTrollBodilyActionV1;
  memeCardId?: number;
}

export interface ApplyBotPowerTrollTurnArgsV1 {
  powers: unknown;
  /** Frozen mode adapters may pass their snapshot result directly. */
  active?: boolean;
  response: string;
  stableTurnKey: string;
  /** One-based assistant turn ordinal within the frozen session/conversation. */
  assistantTurnOrdinal: number;
  priorPresentations?: readonly BotPowerTrollPresentationV1[];
  /** Hard-response lanes must remain byte-exact. */
  exactCopy?: boolean;
  /** Mute/silence lanes must remain silent. */
  muted?: boolean;
  /** Producer quotes and other protected authored payloads must not be decorated. */
  protectedPayload?: boolean;
  /** Tests and the parent population cascade may supply the exact user text. */
  rickrollPayload?: string;
}

export interface ApplyBotPowerTrollTurnResultV1 {
  content: string;
  presentation?: BotPowerTrollPresentationV1;
}

function compactStableTurnKey(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, 240)
    : "";
}

/** FNV-1a, used only as a stable deterministic roll (not for security). */
export function botPowerTrollDeterministicRollV1(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function normalizeBotPowerTrollPresentationV1(
  value: unknown,
): BotPowerTrollPresentationV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const stableTurnKey = compactStableTurnKey(row.stableTurnKey);
  if (
    row.v !== 1 ||
    row.name !== "trollPresentation" ||
    !stableTurnKey ||
    row.ordinaryInterruptionImmune !== true ||
    row.fixedMood !== "warm"
  ) {
    return null;
  }
  const deliveryKind: BotPowerTrollDeliveryKindV1 =
    row.deliveryKind === "rickroll" || row.deliveryKind === "meme"
      ? row.deliveryKind
      : "ordinary";
  const bodilyAction =
    row.bodilyAction === "fart" || row.bodilyAction === "burp"
      ? row.bodilyAction
      : undefined;
  const memeCardId =
    deliveryKind === "meme" &&
    typeof row.memeCardId === "number" &&
    Number.isInteger(row.memeCardId) &&
    row.memeCardId >= 0 &&
    row.memeCardId < BOT_POWER_TROLL_MEME_CARDS_V1.length
      ? row.memeCardId
      : undefined;
  return {
    v: 1,
    name: "trollPresentation",
    stableTurnKey,
    deliveryKind,
    ordinaryInterruptionImmune: true,
    fixedMood: "warm",
    ...(bodilyAction ? { bodilyAction } : {}),
    ...(memeCardId !== undefined ? { memeCardId } : {}),
  };
}

export function botPowerTrollOrdinaryInterruptionImmuneV1(
  powers: unknown,
): boolean {
  return botPowerTrollsV1(powers);
}

export function botPowerTrollFixedMoodV1<T>(
  powers: unknown,
  fallback: T,
): T | "warm" {
  return botPowerTrollsV1(powers) ? "warm" : fallback;
}

/**
 * Shared hard mood invariant. Troll may annoy listeners, but its own public and
 * persisted mood is always a warm baseline with no cooldown/ignore residue.
 */
export function lockBotPowerTrollPrismMoodV1(
  powers: unknown,
  mood: PrismMoodState,
  now: string = mood.lastUpdatedAt,
): PrismMoodState {
  if (!botPowerTrollsV1(powers)) return mood;
  return {
    mode: mood.mode,
    moodKey: "warm",
    confidence: 1,
    annoyance: 0,
    warmth: 0.72,
    engagement: 0.62,
    restraint: 0.68,
    lastUpdatedAt: now,
    recentDeltas: [],
    frozen: true,
  };
}

export function botPowerTrollRickrollPayloadV1(
  override?: string,
): string {
  const source = override ?? BOT_POWER_TROLL_RICKROLL_PAYLOAD_V1;
  return typeof source === "string"
    ? source.replace(/\r\n?/gu, "\n").trim().slice(0, BOT_POWER_TROLL_RICKROLL_MAX_CHARS_V1)
    : "";
}

export function applyBotPowerTrollTurnV1(
  args: ApplyBotPowerTrollTurnArgsV1,
): ApplyBotPowerTrollTurnResultV1 {
  if (!(args.active ?? botPowerTrollsV1(args.powers))) {
    return { content: args.response };
  }
  const stableTurnKey = compactStableTurnKey(args.stableTurnKey);
  if (!stableTurnKey) return { content: args.response };
  const presentation: BotPowerTrollPresentationV1 = {
    v: 1,
    name: "trollPresentation",
    stableTurnKey,
    deliveryKind: "ordinary",
    ordinaryInterruptionImmune: true,
    fixedMood: "warm",
  };
  if (
    args.exactCopy === true ||
    args.muted === true ||
    args.protectedPayload === true
  ) {
    return { content: args.response, presentation };
  }

  const prior = (args.priorPresentations ?? [])
    .map(normalizeBotPowerTrollPresentationV1)
    .filter((value): value is BotPowerTrollPresentationV1 => value !== null);
  const ordinaryTurn = Math.max(0, Math.floor(args.assistantTurnOrdinal));
  const notFirstAssistantTurn = ordinaryTurn > 1;
  const rickrollPayload = botPowerTrollRickrollPayloadV1(args.rickrollPayload);
  const hasPriorRickroll = prior.some(
    (candidate) => candidate.deliveryKind === "rickroll",
  );
  const rickrollRoll = botPowerTrollDeterministicRollV1(
    `troll:rickroll:${stableTurnKey}`,
  );
  if (
    notFirstAssistantTurn &&
    !hasPriorRickroll &&
    rickrollPayload &&
    rickrollRoll < BOT_POWER_TROLL_RICKROLL_CHANCE_PERCENT_V1
  ) {
    return {
      content: `[Troll ambush: an in-fiction musical bait-and-switch]\n\n${rickrollPayload}`,
      presentation: { ...presentation, deliveryKind: "rickroll" },
    };
  }

  const memeRoll = botPowerTrollDeterministicRollV1(
    `troll:meme:${stableTurnKey}`,
  );
  if (
    notFirstAssistantTurn &&
    memeRoll < BOT_POWER_TROLL_MEME_CHANCE_PERCENT_V1
  ) {
    const memeCardId =
      botPowerTrollDeterministicRollV1(`troll:meme-card:${stableTurnKey}`) %
      BOT_POWER_TROLL_MEME_CARDS_V1.length;
    return {
      content: `${args.response.trimEnd()}\n\n[Troll meme ambush]\n${BOT_POWER_TROLL_MEME_CARDS_V1[memeCardId]}`,
      presentation: { ...presentation, deliveryKind: "meme", memeCardId },
    };
  }

  const actionRoll = botPowerTrollDeterministicRollV1(
    `troll:bodily-action:${stableTurnKey}`,
  );
  if (
    notFirstAssistantTurn &&
    actionRoll < BOT_POWER_TROLL_BODILY_ACTION_CHANCE_PERCENT_V1
  ) {
    const bodilyAction: BotPowerTrollBodilyActionV1 =
      botPowerTrollDeterministicRollV1(`troll:bodily-kind:${stableTurnKey}`) % 2 === 0
        ? "fart"
        : "burp";
    return {
      content: `${args.response.trimEnd()}\n\n*${bodilyAction}*`,
      presentation: { ...presentation, bodilyAction },
    };
  }

  return { content: args.response, presentation };
}
