import { extractStageDirections } from "./botMention.ts";

const COFFEE_SESSION_SYNOPSIS_PREFIX = "Session synopsis:";

export function coffeeTextMentionsInternalAccountMetadata(text: string): boolean {
  return /\b(?:your\s+)?account\s+(?:display\s+name\s+is|has\s+not\s+provided\s+a\s+display\s+name\s+yet)\b/i.test(
    text
  );
}

export function coffeeSystemSynopsisIsDisplayable(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed.startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX) &&
    !coffeeTextMentionsInternalAccountMetadata(trimmed)
  );
}

export interface CoffeeReplayMessageLike {
  id?: string;
  role: string;
  content: string;
  botName?: string;
  createdAt?: string;
}

export interface CoffeeReplayAction {
  action: string;
  messageId: string | null;
  messageIndex: number;
  createdAt?: string;
}

export function clampCoffeeReplayMessageIndex(messageCount: number, index: number): number {
  if (!Number.isFinite(messageCount) || messageCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(messageCount - 1, Math.floor(index)));
}

export function coffeeReplayVisibleMessages<T>(
  messages: readonly T[],
  replayMessageIndex: number
): T[] {
  if (messages.length === 0) return [];
  const clampedIndex = clampCoffeeReplayMessageIndex(messages.length, replayMessageIndex);
  return messages.slice(0, clampedIndex + 1);
}

export function coffeeTranscriptVisibleMessages<T extends { role: string; content: string }>(
  messages: readonly T[]
): T[] {
  return messages.filter((message) => {
    if (
      message.role === "system" &&
      message.content.trim().startsWith(COFFEE_SESSION_SYNOPSIS_PREFIX) &&
      !coffeeSystemSynopsisIsDisplayable(message.content)
    ) {
      return false;
    }
    if (message.role !== "assistant") {
      return message.content.trim().length > 0;
    }
    return extractStageDirections(message.content).mainText.trim().length > 0;
  });
}

export function collectCoffeeReplayActionsForBot(
  messages: readonly CoffeeReplayMessageLike[],
  botName: string
): CoffeeReplayAction[] {
  const normalizedBotName = botName.trim();
  if (!normalizedBotName) return [];
  const out: CoffeeReplayAction[] = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant" || message.botName !== normalizedBotName) return;
    const { actions } = extractStageDirections(message.content);
    for (const action of actions) {
      const trimmed = action.replace(/\s+/g, " ").trim();
      if (!trimmed) continue;
      out.push({
        action: trimmed,
        messageId: message.id ?? null,
        messageIndex,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      });
    }
  });
  return out;
}
