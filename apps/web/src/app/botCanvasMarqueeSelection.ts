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
  baseSelectedBotIds: ReadonlySet<string>
): Set<string> {
  return mode === "replace" ? new Set() : new Set(baseSelectedBotIds);
}
