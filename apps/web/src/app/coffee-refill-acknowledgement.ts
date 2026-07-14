export type CoffeeRefillAcknowledgement = {
  key: string;
  text: string;
  visibleMs: number;
};

const COFFEE_REFILL_ACKNOWLEDGEMENT_CHANCE = 0.42;
export const COFFEE_REFILL_ACKNOWLEDGEMENT_VISIBLE_MS = 3_600;

const COFFEE_REFILL_ACKNOWLEDGEMENT_LINES = [
  "Ah—thank you.",
  "Perfect timing.",
  "Much appreciated.",
  "Thanks—that's better.",
  "Lovely. Thank you.",
  "Just what I needed.",
] as const;

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/**
 * Pick an occasional, client-only refill acknowledgement. The top-off timestamp
 * makes the result stable for the response while allowing a later refill to
 * make a fresh decision. Nothing here creates or mutates a transcript turn.
 */
export function coffeeRefillAcknowledgement(args: {
  conversationId: string;
  botId: string;
  toppedOffAt: string;
}): CoffeeRefillAcknowledgement | null {
  const conversationId = args.conversationId.trim();
  const botId = args.botId.trim();
  const toppedOffAt = args.toppedOffAt.trim();
  if (!conversationId || !botId || !Number.isFinite(Date.parse(toppedOffAt))) {
    return null;
  }

  const key = `${conversationId}:${botId}:${toppedOffAt}`;
  if (
    stableUnitValue(`${key}:coffee-refill-acknowledgement-roll`) >=
    COFFEE_REFILL_ACKNOWLEDGEMENT_CHANCE
  ) {
    return null;
  }

  const lineIndex = Math.floor(
    stableUnitValue(`${key}:coffee-refill-acknowledgement-copy`) *
      COFFEE_REFILL_ACKNOWLEDGEMENT_LINES.length,
  );
  return {
    key,
    text: COFFEE_REFILL_ACKNOWLEDGEMENT_LINES[lineIndex]!,
    visibleMs: COFFEE_REFILL_ACKNOWLEDGEMENT_VISIBLE_MS,
  };
}
