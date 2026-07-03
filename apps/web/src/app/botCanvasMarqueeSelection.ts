export type CanvasBotMarqueeSelectionMode = "replace" | "toggle";

export interface CanvasBotMarqueeSelectionInput {
  mode: CanvasBotMarqueeSelectionMode;
  baseSelectedBotIds: ReadonlySet<string>;
  hitBotIds: Iterable<string>;
}

export function resolveCanvasBotMarqueeSelection({
  mode,
  baseSelectedBotIds,
  hitBotIds,
}: CanvasBotMarqueeSelectionInput): Set<string> {
  const uniqueHitBotIds = new Set(hitBotIds);
  if (mode === "replace") {
    return uniqueHitBotIds;
  }

  const nextSelectedBotIds = new Set(baseSelectedBotIds);
  for (const botId of uniqueHitBotIds) {
    if (baseSelectedBotIds.has(botId)) {
      nextSelectedBotIds.delete(botId);
    } else {
      nextSelectedBotIds.add(botId);
    }
  }
  return nextSelectedBotIds;
}

export function resolveInactiveCanvasBotMarqueeSelection(
  mode: CanvasBotMarqueeSelectionMode,
  baseSelectedBotIds: ReadonlySet<string>,
  pressedBotId?: string | null
): Set<string> {
  if (mode === "replace") return new Set();
  const nextSelectedBotIds = new Set(baseSelectedBotIds);
  if (!pressedBotId) return nextSelectedBotIds;
  if (baseSelectedBotIds.has(pressedBotId)) {
    nextSelectedBotIds.delete(pressedBotId);
  } else {
    nextSelectedBotIds.add(pressedBotId);
  }
  return nextSelectedBotIds;
}
