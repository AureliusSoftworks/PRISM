import type { CoffeeReplayEventPayload } from "@localai/shared";

export type CoffeeSeatLayoutEntry<Bot> = {
  botId: string;
  seatIndex: number;
  layoutIndex: number;
  bot: Bot;
};

/** Rebuild the authored review roster after live departures left empty seats. */
export function restoreCoffeeReviewSeatBotIds(
  seatBotIds: readonly (string | null | undefined)[],
  replayEvents: readonly CoffeeReplayEventPayload[],
): Array<string | null> {
  const restored = seatBotIds.map((botId) =>
    typeof botId === "string" && botId.trim() ? botId.trim() : null,
  );
  for (const event of replayEvents) {
    if (event.kind !== "botDeparture") continue;
    while (restored.length <= event.seatIndex) restored.push(null);
    if (!restored.includes(event.botId)) {
      restored[event.seatIndex] = event.botId;
    }
  }
  return restored;
}

/**
 * Preserve the session's authored seat order while compacting empty or stale
 * seats into the visual slots for the number of participants we can render.
 * This keeps review/replay deterministic without leaving clustered gaps.
 */
export function buildCoffeeSeatLayoutEntries<Bot>(
  seatBotIds: readonly (string | null | undefined)[],
  botsById: ReadonlyMap<string, Bot>,
): CoffeeSeatLayoutEntry<Bot>[] {
  const entries: CoffeeSeatLayoutEntry<Bot>[] = [];
  const seenBotIds = new Set<string>();

  seatBotIds.forEach((rawBotId, seatIndex) => {
    const botId = typeof rawBotId === "string" ? rawBotId.trim() : "";
    if (!botId || seenBotIds.has(botId)) return;
    const bot = botsById.get(botId);
    if (!bot) return;
    seenBotIds.add(botId);

    entries.push({
      botId,
      seatIndex,
      layoutIndex: entries.length,
      bot,
    });
  });

  return entries;
}
