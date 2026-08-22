export interface WhodunnitCastBot {
  id: string;
}

export interface WhodunnitCastAllocation {
  suspectBotIds: string[];
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
  return suspectCount + 2;
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
    prosecutorPartnerBotId: remaining[targetSuspects] ?? "",
    rivalDefenseBotId: remaining[targetSuspects + 1] ?? "",
  };
}
