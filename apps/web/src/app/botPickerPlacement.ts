export interface RandomBotPickerPlacementsInput {
  /** Bot ids currently visible to the placement grid. */
  visibleBotIds: readonly string[];
  /** Number of independently selectable placements to fill. */
  placementCount: number;
  /** Ids reserved by another fixed placement. */
  excludedBotIds?: readonly string[];
  random?: () => number;
}

/**
 * Shared Refract placement rule: only bots actually visible in the active
 * grid may be seated, and no result may duplicate a fixed or sibling seat.
 */
export function randomBotPickerPlacements(
  input: RandomBotPickerPlacementsInput,
): string[] | null {
  if (!Number.isSafeInteger(input.placementCount) || input.placementCount < 1) {
    return null;
  }
  const excluded = new Set(input.excludedBotIds?.filter(Boolean) ?? []);
  const candidates = [
    ...new Set(input.visibleBotIds.filter((botId) => Boolean(botId) && !excluded.has(botId))),
  ];
  if (candidates.length < input.placementCount) return null;

  const random = input.random ?? Math.random;
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const sampled = random();
    const normalized = Number.isFinite(sampled)
      ? Math.min(Math.max(sampled, 0), 0.999_999_999_999)
      : 0;
    const swapIndex = Math.floor(normalized * (index + 1));
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex]!,
      candidates[index]!,
    ];
  }
  return candidates.slice(0, input.placementCount);
}
