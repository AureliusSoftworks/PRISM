import { extractStageDirections } from "./botMention.ts";
import {
  coffeeCupSipMessageGapForDuration,
  type CoffeeAmbientActionPayload,
} from "@localai/shared";

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
  coffeeAmbientAction?: CoffeeAmbientActionPayload;
}

export interface CoffeeReplayAction {
  action: string;
  messageId: string | null;
  messageIndex: number;
  createdAt?: string;
}

export interface CoffeeActionBotContext {
  name?: string | null;
  systemPrompt?: string | null;
  glyph?: string | null;
}

const COFFEE_ACTION_FACIAL_HAIR_RE = /\b(?:beard|mustache|moustache|goatee)\b/i;
const COFFEE_ACTION_EXPLICIT_NO_FACIAL_HAIR_RE =
  /\b(?:beardless|clean-shaven|no\s+(?:beard|mustache|moustache|goatee))\b/i;
const COFFEE_ACTION_EXPLICIT_FACIAL_HAIR_RE =
  /\b(?:bearded|has\s+(?:a\s+)?(?:beard|mustache|moustache|goatee)|with\s+(?:a\s+)?(?:beard|mustache|moustache|goatee))\b/i;
const COFFEE_ACTION_KNOWN_NO_FACIAL_HAIR_RE =
  /\b(?:mr\.?\s*krabs|eugene\s+krabs|squidward|spongebob|patrick\s+star|sandy\s+cheeks|plankton|sheldon\s+j\.?\s*plankton)\b/i;
export const COFFEE_SIP_ACTION_MIN_MESSAGE_GAP = 5;
const COFFEE_SIP_ACTION_RE =
  /\b(?:sips?|sipping|drinks?|drinking|takes?\s+(?:a\s+)?(?:quick|small|slow|quiet|deliberate|long)?\s*sip|raises?\s+(?:(?:his|her|their|the)\s+)?(?:cup|mug)\s+(?:to|toward)\s+(?:his|her|their|the)?\s*(?:mouth|lips)|lifts?\s+(?:(?:his|her|their|the)\s+)?(?:cup|mug)\s+(?:to|toward)\s+(?:his|her|their|the)?\s*(?:mouth|lips))\b/i;

function coffeeActionContextRejectsFacialHair(
  bot: CoffeeActionBotContext | null | undefined
): boolean {
  const identity = `${bot?.name ?? ""} ${bot?.systemPrompt ?? ""} ${bot?.glyph ?? ""}`.trim();
  if (!identity) return false;
  if (COFFEE_ACTION_EXPLICIT_NO_FACIAL_HAIR_RE.test(identity)) return true;
  if (COFFEE_ACTION_EXPLICIT_FACIAL_HAIR_RE.test(identity)) return false;
  return COFFEE_ACTION_KNOWN_NO_FACIAL_HAIR_RE.test(identity);
}

export function sanitizeCoffeeActionForBot(
  action: string,
  bot?: CoffeeActionBotContext | null
): string {
  const collapsed = action.replace(/\s+/g, " ").trim();
  if (!collapsed || !COFFEE_ACTION_FACIAL_HAIR_RE.test(collapsed)) return collapsed;
  if (!coffeeActionContextRejectsFacialHair(bot)) return collapsed;

  return collapsed
    .replace(
      /\b(?:strokes?|rubs?|scratches?|tugs?(?:\s+at)?|twirls?|smooths?|combs?)\s+(?:(?:his|her|their|the)\s+)?(?:beard|mustache|moustache|goatee)\b/gi,
      "taps the table"
    )
    .replace(/\b(?:his|her|their|the)\s+(?:beard|mustache|moustache|goatee)\b/gi, "the table")
    .replace(/\b(?:beard|mustache|moustache|goatee)\b/gi, "face")
    .replace(/\s+/g, " ")
    .trim();
}

export function coffeeActionIsSip(action: string): boolean {
  return COFFEE_SIP_ACTION_RE.test(action.replace(/\s+/g, " ").trim());
}

export function coffeeActionCanDisplayWhileSpeaking(
  action: string,
  spokenText: string
): boolean {
  return !coffeeActionIsSip(action) || spokenText.trim().length === 0;
}

export function coffeeActionSipMessageGapForDuration(
  durationMinutes?: number | null
): number {
  return coffeeCupSipMessageGapForDuration(
    durationMinutes,
    COFFEE_SIP_ACTION_MIN_MESSAGE_GAP
  );
}

export function coffeeActionPassesSipCadence(
  action: string,
  messageIndex: number,
  previousSipMessageIndex: number | null | undefined,
  minMessageGap = COFFEE_SIP_ACTION_MIN_MESSAGE_GAP
): boolean {
  if (!coffeeActionIsSip(action)) return true;
  if (typeof previousSipMessageIndex !== "number") return true;
  return messageIndex - previousSipMessageIndex >= minMessageGap;
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
    if (message.role === "system") {
      return message.content.trim().length > 0;
    }
    return extractStageDirections(message.content).mainText.trim().length > 0;
  });
}

export function coffeeActionsForMessage(message: CoffeeReplayMessageLike): string[] {
  const actions = extractStageDirections(message.content).actions
    .map((action) => action.replace(/\s+/g, " ").trim())
    .filter((action) => action.length > 0);
  const ambientAction =
    message.coffeeAmbientAction?.source === "scripted"
      ? message.coffeeAmbientAction.action.replace(/\s+/g, " ").trim()
      : "";
  return ambientAction ? [...actions, ambientAction] : actions;
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
    for (const action of coffeeActionsForMessage(message)) {
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
