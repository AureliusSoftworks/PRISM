export const ZEN_PERSONA_DEFAULT_INK_COLOR = "transparent";

export interface ZenPersonaInkMessage {
  id: string;
  role: "user" | "assistant";
  botId?: string | null;
  botColor?: string | null;
}

export interface ZenPersonaInkTarget {
  botId: string | null;
  color?: string | null;
}

export interface ZenPersonaInkOptions {
  trailingUserTarget?: ZenPersonaInkTarget | null;
}

export interface ZenPersonaInkSegment {
  messageId: string;
  role: "user" | "assistant";
  botId: string | null;
  color: string;
  variant: "persona" | "default";
}

function normalizeTargetBotId(botId: string | null | undefined): string | null {
  const trimmed = botId?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTargetColor(color: string | null | undefined): string {
  return color?.trim() || ZEN_PERSONA_DEFAULT_INK_COLOR;
}

function targetFromMessage(message: ZenPersonaInkMessage): ZenPersonaInkTarget {
  return {
    botId: normalizeTargetBotId(message.botId),
    color: message.botColor,
  };
}

function hasOwnBotId(message: ZenPersonaInkMessage): boolean {
  return Object.prototype.hasOwnProperty.call(message, "botId");
}

function nextAssistantTarget(
  messages: readonly ZenPersonaInkMessage[],
  index: number
): ZenPersonaInkTarget | null {
  const next = messages[index + 1];
  if (!next || next.role !== "assistant") return null;
  return targetFromMessage(next);
}

function segmentFromTarget(
  message: ZenPersonaInkMessage,
  target: ZenPersonaInkTarget
): ZenPersonaInkSegment {
  const botId = normalizeTargetBotId(target.botId);
  return {
    messageId: message.id,
    role: message.role,
    botId,
    color: normalizeTargetColor(target.color),
    variant: botId ? "persona" : "default",
  };
}

function targetForUserMessage(
  messages: readonly ZenPersonaInkMessage[],
  index: number,
  options: ZenPersonaInkOptions
): ZenPersonaInkTarget {
  const message = messages[index]!;
  const explicitTarget = hasOwnBotId(message) ? targetFromMessage(message) : null;
  const replyTarget = nextAssistantTarget(messages, index);

  if (explicitTarget) {
    if (
      explicitTarget.botId &&
      (explicitTarget.color?.trim() ?? "").length === 0 &&
      replyTarget?.botId === explicitTarget.botId
    ) {
      return replyTarget;
    }
    return explicitTarget;
  }

  if (replyTarget) return replyTarget;
  if (index === messages.length - 1 && options.trailingUserTarget !== undefined) {
    return options.trailingUserTarget ?? { botId: null };
  }
  return { botId: null };
}

export function buildZenPersonaInkSegments(
  messages: readonly ZenPersonaInkMessage[],
  options: ZenPersonaInkOptions = {}
): ZenPersonaInkSegment[] {
  return messages.map((message, index) =>
    segmentFromTarget(
      message,
      message.role === "assistant"
        ? targetFromMessage(message)
        : targetForUserMessage(messages, index, options)
    )
  );
}

export function buildZenPersonaInkSegmentMap(
  messages: readonly ZenPersonaInkMessage[],
  options: ZenPersonaInkOptions = {}
): ReadonlyMap<string, ZenPersonaInkSegment> {
  return new Map(
    buildZenPersonaInkSegments(messages, options).map((segment) => [
      segment.messageId,
      segment,
    ])
  );
}

export function countZenPrismUserMessages(
  messages: readonly ZenPersonaInkMessage[],
  options: ZenPersonaInkOptions = {}
): number {
  return buildZenPersonaInkSegments(messages, options).filter(
    (segment) => segment.role === "user" && segment.variant === "default"
  ).length;
}
