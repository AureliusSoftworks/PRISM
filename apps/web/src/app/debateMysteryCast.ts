export interface WhodunnitCastBot {
  id: string;
}

export interface WhodunnitCastAllocation {
  suspectBotIds: string[];
  judgeBotId: string;
  prosecutorBotId: string;
  rivalDefenseBotId: string;
}

export interface WhodunnitFullCastAllocation extends WhodunnitCastAllocation {
  jurorBotIds: string[];
}

export interface WhodunnitCastDraft {
  suspectBotIds: readonly (string | null | undefined)[];
  judgeBotId?: string | null;
  prosecutorBotId?: string | null;
  rivalDefenseBotId?: string | null;
  jurorBotIds?: readonly (string | null | undefined)[];
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
 * Normalize suspect seats without consuming an open or newly added seat.
 * A blank is the editable "Surprise me" state resolved only at compile time.
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
      if (raw === undefined || raw === "") return "";
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
    prosecutorBotId: remaining[targetSuspects + 1] ?? "",
    rivalDefenseBotId: remaining[targetSuspects + 2] ?? "",
  };
}

/**
 * The one-click Whodunnit path seats the entire durable Jury as well as the
 * mansion and court. Keep this separate from the base allocator so V1 and
 * per-seat setup can continue to use their existing role-only contract.
 */
export function randomizeWhodunnitFullCast(
  bots: readonly WhodunnitCastBot[],
  suspectCount: number,
  jurorCount: number,
  random: () => number = Math.random,
): WhodunnitFullCastAllocation | null {
  const targetSuspects = Math.max(0, Math.min(8, Math.round(suspectCount)));
  const targetJurors = Math.max(0, Math.round(jurorCount));
  const candidates = distinctWhodunnitCastBotIds(bots);
  const required = minimumWhodunnitBotsForCast(targetSuspects) + targetJurors;
  if (candidates.length < required) return null;

  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(
      Math.min(index, Math.max(0, random()) * (index + 1)),
    );
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return {
    suspectBotIds: shuffled.slice(0, targetSuspects),
    judgeBotId: shuffled[targetSuspects] ?? "",
    prosecutorBotId: shuffled[targetSuspects + 1] ?? "",
    rivalDefenseBotId: shuffled[targetSuspects + 2] ?? "",
    jurorBotIds: shuffled.slice(
      targetSuspects + 3,
      targetSuspects + 3 + targetJurors,
    ),
  };
}

/**
 * Freeze a mixed manual/Surprise cast. Valid manual seats keep their exact
 * position; blanks, stale ids, and duplicate selections are filled from a
 * shuffled pool of unused Library bots immediately before compilation.
 */
export function resolveWhodunnitSurpriseCast(
  bots: readonly WhodunnitCastBot[],
  draft: WhodunnitCastDraft,
  suspectCount: number,
  jurorCount: number,
  random: () => number = Math.random,
): WhodunnitFullCastAllocation | null {
  const targetSuspects = Math.max(0, Math.min(8, Math.round(suspectCount)));
  const targetJurors = Math.max(0, Math.round(jurorCount));
  const candidates = distinctWhodunnitCastBotIds(bots);
  const required = minimumWhodunnitBotsForCast(targetSuspects) + targetJurors;
  if (candidates.length < required) return null;

  const allowed = new Set(candidates);
  const occupied = new Set<string>();
  const authoredSeats: Array<string | null | undefined> = [
    ...Array.from({ length: targetSuspects }, (_, index) =>
      draft.suspectBotIds[index]),
    draft.judgeBotId,
    draft.prosecutorBotId,
    draft.rivalDefenseBotId,
    ...Array.from({ length: targetJurors }, (_, index) =>
      draft.jurorBotIds?.[index]),
  ];
  const resolvedSeats = authoredSeats.map((value) => {
    const botId = value?.trim() ?? "";
    if (!botId || !allowed.has(botId) || occupied.has(botId)) return null;
    occupied.add(botId);
    return botId;
  });
  const remaining = candidates.filter((botId) => !occupied.has(botId));
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(
      Math.min(index, Math.max(0, random()) * (index + 1)),
    );
    [remaining[index], remaining[randomIndex]] = [remaining[randomIndex], remaining[index]];
  }
  for (let index = 0; index < resolvedSeats.length; index += 1) {
    if (resolvedSeats[index]) continue;
    resolvedSeats[index] = remaining.shift() ?? null;
  }
  if (resolvedSeats.some((botId) => !botId)) return null;

  const courtOffset = targetSuspects;
  const jurorOffset = courtOffset + 3;
  return {
    suspectBotIds: resolvedSeats.slice(0, targetSuspects) as string[],
    judgeBotId: resolvedSeats[courtOffset]!,
    prosecutorBotId: resolvedSeats[courtOffset + 1]!,
    rivalDefenseBotId: resolvedSeats[courtOffset + 2]!,
    jurorBotIds: resolvedSeats.slice(jurorOffset, jurorOffset + targetJurors) as string[],
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
