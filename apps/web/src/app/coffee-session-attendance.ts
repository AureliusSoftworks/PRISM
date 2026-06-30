function excludedIdSet(excludedBotIds: ReadonlySet<string> | readonly string[]): Set<string> {
  return excludedBotIds instanceof Set ? new Set(excludedBotIds) : new Set(excludedBotIds);
}

export function coffeeGroupAttendingBotIds(
  groupBotIds: readonly string[],
  excludedBotIds: ReadonlySet<string> | readonly string[]
): string[] {
  const excluded = excludedIdSet(excludedBotIds);
  return groupBotIds.filter((botId) => !excluded.has(botId));
}

export function coffeeGroupSessionExcludedBotIds(
  groupBotIds: readonly string[],
  excludedBotIds: ReadonlySet<string> | readonly string[]
): string[] {
  const groupBotIdSet = new Set(groupBotIds);
  return Array.from(excludedIdSet(excludedBotIds)).filter((botId) => groupBotIdSet.has(botId));
}

export function coffeeGroupAttendanceCanStart(
  groupBotIds: readonly string[],
  excludedBotIds: ReadonlySet<string> | readonly string[],
  minimumAttending = 2
): boolean {
  return coffeeGroupAttendingBotIds(groupBotIds, excludedBotIds).length >= minimumAttending;
}

export function toggleCoffeeExcludedBotId(
  current: ReadonlySet<string>,
  botId: string
): Set<string> {
  const next = new Set(current);
  if (next.has(botId)) {
    next.delete(botId);
  } else {
    next.add(botId);
  }
  return next;
}
