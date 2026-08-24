export interface WhodunnitCastBot {
  id: string;
}

export interface WhodunnitCastAllocation {
  suspectBotIds: string[];
  judgeBotId: string;
  prosecutorPartnerBotId: string;
  rivalDefenseBotId: string;
}

export function distinctWhodunnitCastBotIds(
  bots: readonly WhodunnitCastBot[],
): string[] {
  const ids = new Set<string>();
  for (const bot of bots) {
    const normalized = bot.id.trim();
    if (normalized) ids.add(normalized);
  }
  return [...ids];
}

export function minimumWhodunnitBotsForCast(suspectCount: number): number {
  return suspectCount + 3;
}

/**
 * Fill newly added or invalid suspect seats without consuming an explicit
 * blank. A blank is the editable "Surprise me" state left by removing a bot.
 */
export function fillWhodunnitSuspectSeats(
  bots: readonly WhodunnitCastBot[],
  current: readonly string[],
  suspectCount: number,
  excluded: readonly string[] = [],
): string[] {
  const targetSuspects = Math.max(0, Math.min(8, Math.round(suspectCount)));
  const candidates = distinctWhodunnitCastBotIds(bots);
  const allowed = new Set(candidates);
  const blocked = new Set(excluded.map((id) => id.trim()).filter(Boolean));
  const seated = new Set<string>();
  const seats: Array<string | null> = Array.from(
    { length: targetSuspects },
    (_, index) => {
      const raw = current[index];
      if (raw === "") return "";
      const botId = raw?.trim() ?? "";
      if (
        !botId ||
        !allowed.has(botId) ||
        blocked.has(botId) ||
        seated.has(botId)
      ) {
        return null;
      }
      seated.add(botId);
      return botId;
    },
  );

  for (const botId of candidates) {
    if (blocked.has(botId) || seated.has(botId)) continue;
    const openIndex = seats.indexOf(null);
    if (openIndex < 0) break;
    seats[openIndex] = botId;
    seated.add(botId);
  }

  return seats.map((botId) => botId ?? "");
}

/** Choose a fresh, unused bot for one editable Whodunnit seat. */
export function surpriseWhodunnitSeatBotId(
  bots: readonly WhodunnitCastBot[],
  occupiedBotIds: readonly string[],
  currentBotId = "",
  random: () => number = Math.random,
): string | null {
  const occupied = new Set(
    occupiedBotIds.map((id) => id.trim()).filter(Boolean),
  );
  const eligible = distinctWhodunnitCastBotIds(bots).filter(
    (botId) => !occupied.has(botId),
  );
  if (eligible.length === 0) return null;
  const normalizedCurrentBotId = currentBotId.trim();
  const fresh = eligible.filter((botId) => botId !== normalizedCurrentBotId);
  const pool = fresh.length > 0 ? fresh : eligible;
  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  );
  return pool[index] ?? null;
}

export function randomizeWhodunnitCast(
  bots: readonly WhodunnitCastBot[],
  suspectCount: number,
  random: () => number = Math.random,
): WhodunnitCastAllocation | null {
  const targetSuspects = Math.max(0, Math.min(8, Math.round(suspectCount)));
  const candidates = distinctWhodunnitCastBotIds(bots);
  const required = minimumWhodunnitBotsForCast(targetSuspects);
  if (candidates.length < required) return null;

  const remaining = [...candidates];
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(
      Math.min(index, Math.max(0, random()) * (index + 1)),
    );
    [remaining[index], remaining[randomIndex]] = [remaining[randomIndex], remaining[index]];
  }

  return {
    suspectBotIds: remaining.slice(0, targetSuspects),
    judgeBotId: remaining[targetSuspects] ?? "",
    prosecutorPartnerBotId: remaining[targetSuspects + 1] ?? "",
    rivalDefenseBotId: remaining[targetSuspects + 2] ?? "",
  };
}

/**
 * Populate every Whodunnit role while guaranteeing that a bot captured from
 * the suspect grid remains one of the suspects.
 */
export function randomizeWhodunnitCastAroundBot(
  bots: readonly WhodunnitCastBot[],
  suspectCount: number,
  anchorBotId: string,
  random: () => number = Math.random,
): WhodunnitCastAllocation | null {
  const normalizedAnchorBotId = anchorBotId.trim();
  const candidates = distinctWhodunnitCastBotIds(bots);
  if (!normalizedAnchorBotId || !candidates.includes(normalizedAnchorBotId)) {
    return null;
  }
  const targetSuspects = Math.max(0, Math.min(8, Math.round(suspectCount)));
  if (targetSuspects < 1) return null;
  const remainingAllocation = randomizeWhodunnitCast(
    candidates
      .filter((botId) => botId !== normalizedAnchorBotId)
      .map((id) => ({ id })),
    targetSuspects - 1,
    random,
  );
  if (!remainingAllocation) return null;
  return {
    ...remainingAllocation,
    suspectBotIds: [
      normalizedAnchorBotId,
      ...remainingAllocation.suspectBotIds,
    ],
  };
}
