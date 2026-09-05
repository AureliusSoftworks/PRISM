export type FocusedBotConversationMode = "bot-first" | "user-first";

export interface FocusedBotConversationOpenContext {
  origin: "default" | "library" | "group-room";
  returnFocusBotId?: string | null;
  groupId?: string | null;
  promotedBotId?: string | null;
}

export interface FocusedBotRoomReturnCheckpoint {
  groupId: string;
  promotedBotId: string | null;
  returnFocusBotId: string;
}

export interface FocusedBotConversationLaunch {
  botId: string;
  mode: FocusedBotConversationMode;
  message: string;
  roomReturnCheckpoint: FocusedBotRoomReturnCheckpoint | null;
}

export type FocusedBotRoomReturnResolution =
  | { kind: "wait" }
  | { kind: "discard"; reason: "missing-focus-bot" }
  | {
      kind: "restore";
      promotedBotId: string | null;
      returnFocusBotId: string;
    };

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const MAX_IDENTIFIER_LENGTH = 256;

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_IDENTIFIER_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizedBotIdSet(botIds: readonly string[]): Set<string> {
  return new Set(
    botIds
      .map((botId) => normalizeIdentifier(botId))
      .filter((botId): botId is string => botId !== null),
  );
}

/**
 * Captures an exact fresh-conversation target plus the optional club-room
 * return location. Room focus and promotion are only retained when they refer
 * to the same bot that owns the focused panel, preventing stale panel context
 * from targeting or restoring a different member.
 */
export function createFocusedBotConversationLaunch({
  botId: rawBotId,
  mode,
  message: rawMessage = "",
  context,
  validGroupBotIds,
}: {
  botId: string;
  mode: FocusedBotConversationMode;
  message?: string;
  context: FocusedBotConversationOpenContext;
  validGroupBotIds: readonly string[];
}): FocusedBotConversationLaunch | null {
  const botId = normalizeIdentifier(rawBotId);
  if (!botId) return null;
  const message = rawMessage.trim();
  if (mode === "user-first" && message.length === 0) return null;

  let roomReturnCheckpoint: FocusedBotRoomReturnCheckpoint | null = null;
  if (context.origin === "group-room") {
    const groupId = normalizeIdentifier(context.groupId);
    const returnFocusBotId = normalizeIdentifier(context.returnFocusBotId);
    const promotedBotId = normalizeIdentifier(context.promotedBotId);
    const validBotIds = normalizedBotIdSet(validGroupBotIds);
    if (
      groupId &&
      validBotIds.has(botId) &&
      returnFocusBotId === botId
    ) {
      roomReturnCheckpoint = {
        groupId,
        returnFocusBotId: botId,
        promotedBotId:
          promotedBotId === botId && validBotIds.has(promotedBotId)
            ? botId
            : null,
      };
    }
  }

  return {
    botId,
    mode,
    message: mode === "user-first" ? message : "",
    roomReturnCheckpoint,
  };
}

/**
 * Waits until the exact saved club is visible, then returns the minimal room
 * state needed to restore its compact avatar and keyboard focus. No navigation
 * or avatar-surface decision is made here.
 */
export function resolveFocusedBotRoomReturn({
  checkpoint,
  visibleGroupId: rawVisibleGroupId,
  validGroupBotIds,
  roomVisible,
  roomLod,
}: {
  checkpoint: FocusedBotRoomReturnCheckpoint | null;
  visibleGroupId: string | null | undefined;
  validGroupBotIds: readonly string[];
  roomVisible: boolean;
  roomLod: "mini" | "micro";
}): FocusedBotRoomReturnResolution {
  if (!checkpoint || !roomVisible) return { kind: "wait" };
  const visibleGroupId = normalizeIdentifier(rawVisibleGroupId);
  if (!visibleGroupId || visibleGroupId !== checkpoint.groupId) {
    return { kind: "wait" };
  }
  const validBotIds = normalizedBotIdSet(validGroupBotIds);
  if (!validBotIds.has(checkpoint.returnFocusBotId)) {
    return { kind: "discard", reason: "missing-focus-bot" };
  }
  return {
    kind: "restore",
    returnFocusBotId: checkpoint.returnFocusBotId,
    promotedBotId:
      roomLod === "micro" &&
      checkpoint.promotedBotId === checkpoint.returnFocusBotId &&
      validBotIds.has(checkpoint.promotedBotId)
        ? checkpoint.promotedBotId
        : null,
  };
}
