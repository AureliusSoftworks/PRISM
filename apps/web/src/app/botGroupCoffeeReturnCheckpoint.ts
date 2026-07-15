import {
  BOT_GROUP_WAITING_ROOM_MIN_BOTS,
  botGroupWaitingRoomIsEligible,
  type BotGroupWaitingRoomGroup,
} from "./botGroupWaitingRoom.ts";

export const BOT_GROUP_COFFEE_RETURN_CHECKPOINT_VERSION = 1 as const;
export const BOT_GROUP_COFFEE_RETURN_CHECKPOINT_STORAGE_PREFIX =
  "prism_bot_group_coffee_return_checkpoint_v1:";

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_VISIT_SEED_LENGTH = 1_024;
const MAX_SERIALIZED_CHECKPOINT_LENGTH = 4_096;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

/**
 * Minimal, JSON-safe room identity. The roster is deliberately not persisted:
 * a completed Coffee session returns through a newly seeded room visit.
 */
export interface BotGroupCoffeeReturnCheckpoint {
  version: typeof BOT_GROUP_COFFEE_RETURN_CHECKPOINT_VERSION;
  coffeeSessionId: string;
  sourceGroupId: string;
  sourceRoomVisitSeed: string;
  createdAtMs: number;
}

export interface BotGroupCoffeeReturnSourceGroup
  extends BotGroupWaitingRoomGroup {
  botIds: readonly string[];
}

export type BotGroupCoffeeReturnFallbackReason =
  | "invalid-checkpoint"
  | "missing-source-group"
  | "ineligible-source-group";

export type BotGroupCoffeeReturnOutcome =
  | {
      kind: "fresh-room";
      view: "chat";
      groupFilterId: string;
      groupId: string;
      coffeeSessionId: string;
      invalidatedVisitSeed: string;
      visitSeed: string;
      validBotIds: string[];
    }
  | {
      kind: "chat-all-bots";
      view: "chat";
      groupFilterId: "all";
      reason: BotGroupCoffeeReturnFallbackReason;
    };

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > maxLength ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizeIdentifier(value: unknown): string | null {
  return normalizeBoundedText(value, MAX_IDENTIFIER_LENGTH);
}

function normalizeCreatedAtMs(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

export function normalizeBotGroupCoffeeReturnCheckpoint(
  value: unknown,
  expectedCoffeeSessionId?: string,
): BotGroupCoffeeReturnCheckpoint | null {
  const record = recordFrom(value);
  if (
    !record ||
    record.version !== BOT_GROUP_COFFEE_RETURN_CHECKPOINT_VERSION
  ) {
    return null;
  }

  const coffeeSessionId = normalizeIdentifier(record.coffeeSessionId);
  const sourceGroupId = normalizeIdentifier(record.sourceGroupId);
  const sourceRoomVisitSeed = normalizeBoundedText(
    record.sourceRoomVisitSeed,
    MAX_VISIT_SEED_LENGTH,
  );
  const createdAtMs = normalizeCreatedAtMs(record.createdAtMs);
  if (
    !coffeeSessionId ||
    !sourceGroupId ||
    !sourceRoomVisitSeed ||
    createdAtMs === null
  ) {
    return null;
  }

  if (expectedCoffeeSessionId !== undefined) {
    const expected = normalizeIdentifier(expectedCoffeeSessionId);
    if (!expected || expected !== coffeeSessionId) return null;
  }

  return {
    version: BOT_GROUP_COFFEE_RETURN_CHECKPOINT_VERSION,
    coffeeSessionId,
    sourceGroupId,
    sourceRoomVisitSeed,
    createdAtMs,
  };
}

export function createBotGroupCoffeeReturnCheckpoint({
  coffeeSessionId,
  sourceGroupId,
  sourceRoomVisitSeed,
  createdAtMs,
}: Omit<BotGroupCoffeeReturnCheckpoint, "version">): BotGroupCoffeeReturnCheckpoint | null {
  return normalizeBotGroupCoffeeReturnCheckpoint({
    version: BOT_GROUP_COFFEE_RETURN_CHECKPOINT_VERSION,
    coffeeSessionId,
    sourceGroupId,
    sourceRoomVisitSeed,
    createdAtMs,
  });
}

export function botGroupCoffeeReturnCheckpointStorageKey(
  coffeeSessionId: string,
): string | null {
  const normalized = normalizeIdentifier(coffeeSessionId);
  if (!normalized) return null;
  try {
    return `${BOT_GROUP_COFFEE_RETURN_CHECKPOINT_STORAGE_PREFIX}${encodeURIComponent(normalized)}`;
  } catch {
    return null;
  }
}

export function serializeBotGroupCoffeeReturnCheckpoint(
  value: unknown,
): string | null {
  const checkpoint = normalizeBotGroupCoffeeReturnCheckpoint(value);
  return checkpoint ? JSON.stringify(checkpoint) : null;
}

export function parseBotGroupCoffeeReturnCheckpoint(
  serialized: string | null | undefined,
  expectedCoffeeSessionId?: string,
): BotGroupCoffeeReturnCheckpoint | null {
  if (
    typeof serialized !== "string" ||
    serialized.length === 0 ||
    serialized.length > MAX_SERIALIZED_CHECKPOINT_LENGTH
  ) {
    return null;
  }
  try {
    return normalizeBotGroupCoffeeReturnCheckpoint(
      JSON.parse(serialized) as unknown,
      expectedCoffeeSessionId,
    );
  } catch {
    return null;
  }
}

function uniqueCurrentGroupBotIds(
  groupBotIds: readonly string[],
  validBotIds: readonly string[],
): string[] {
  const validSet = new Set(
    validBotIds
      .map((botId) => normalizeIdentifier(botId))
      .filter((botId): botId is string => botId !== null),
  );
  const seen = new Set<string>();
  const current: string[] = [];
  for (const value of groupBotIds) {
    const botId = normalizeIdentifier(value);
    if (!botId || !validSet.has(botId) || seen.has(botId)) continue;
    seen.add(botId);
    current.push(botId);
  }
  return current;
}

function freshRoomVisitSeed(
  checkpoint: BotGroupCoffeeReturnCheckpoint,
): string {
  const seed = `coffee-return:${checkpoint.sourceGroupId}:${checkpoint.coffeeSessionId}:${checkpoint.createdAtMs}`;
  return seed === checkpoint.sourceRoomVisitSeed ? `${seed}:fresh` : seed;
}

function fallback(
  reason: BotGroupCoffeeReturnFallbackReason,
): BotGroupCoffeeReturnOutcome {
  return {
    kind: "chat-all-bots",
    view: "chat",
    groupFilterId: "all",
    reason,
  };
}

export function resolveBotGroupCoffeeReturn({
  checkpoint: untrustedCheckpoint,
  groups,
  validBotIds,
}: {
  checkpoint: unknown;
  groups: readonly BotGroupCoffeeReturnSourceGroup[];
  validBotIds: readonly string[];
}): BotGroupCoffeeReturnOutcome {
  const checkpoint = normalizeBotGroupCoffeeReturnCheckpoint(
    untrustedCheckpoint,
  );
  if (!checkpoint) return fallback("invalid-checkpoint");

  const sourceGroup = groups.find(
    (group) => normalizeIdentifier(group.id) === checkpoint.sourceGroupId,
  );
  if (!sourceGroup) return fallback("missing-source-group");

  const currentBotIds = uniqueCurrentGroupBotIds(
    sourceGroup.botIds,
    validBotIds,
  );
  if (
    sourceGroup.builtIn !== false ||
    !botGroupWaitingRoomIsEligible(
      {
        id: checkpoint.sourceGroupId,
        builtIn: sourceGroup.builtIn,
        special: sourceGroup.special,
      },
      currentBotIds,
    ) ||
    currentBotIds.length < BOT_GROUP_WAITING_ROOM_MIN_BOTS
  ) {
    return fallback("ineligible-source-group");
  }

  return {
    kind: "fresh-room",
    view: "chat",
    groupFilterId: checkpoint.sourceGroupId,
    groupId: checkpoint.sourceGroupId,
    coffeeSessionId: checkpoint.coffeeSessionId,
    invalidatedVisitSeed: checkpoint.sourceRoomVisitSeed,
    visitSeed: freshRoomVisitSeed(checkpoint),
    validBotIds: currentBotIds,
  };
}
