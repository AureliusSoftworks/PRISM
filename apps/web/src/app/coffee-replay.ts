import { extractStageDirections } from "./botMention.ts";

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
