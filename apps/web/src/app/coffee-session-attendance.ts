function excludedIdSet(excludedBotIds: ReadonlySet<string> | readonly string[]): Set<string> {
  return excludedBotIds instanceof Set ? new Set(excludedBotIds) : new Set(excludedBotIds);
}

export function sanitizeCoffeeSeatBotIdsForAvailableBots(
  seatBotIds: readonly (string | null | undefined)[],
  availableBotIds: Iterable<string>
): Array<string | null> {
  const available = new Set(availableBotIds);
  const seen = new Set<string>();
  return seatBotIds.map((seatBotId) => {
    if (typeof seatBotId !== "string") return null;
    const botId = seatBotId.trim();
    if (!botId || !available.has(botId) || seen.has(botId)) return null;
    seen.add(botId);
    return botId;
  });
}

export function toggleCoffeeSeatBotId(
  current: Array<string | null>,
  rawBotId: string,
  randomUnit: () => number = Math.random
): Array<string | null> {
  const botId = rawBotId.trim();
  if (!botId) return current;

  const existingIndex = current.findIndex((id) => id === botId);
  if (existingIndex >= 0) {
    return current.map((id, index) => (index === existingIndex ? null : id));
  }

  const emptyIndexes = current
    .map((id, index) => (id === null ? index : -1))
    .filter((index) => index >= 0);
  if (emptyIndexes.length === 0) return current;

  const rawUnit = randomUnit();
  const boundedUnit = Number.isFinite(rawUnit)
    ? Math.min(0.999999999, Math.max(0, rawUnit))
    : 0;
  const nextSeatIndex =
    emptyIndexes[Math.floor(boundedUnit * emptyIndexes.length)] ?? emptyIndexes[0]!;
  return current.map((id, index) => (index === nextSeatIndex ? botId : id));
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
