import type { DebatePlayerRole } from "@localai/shared";

export const DEBATE_STUDIO_NAV_MOTION_REFRACT_ID = "debate:studio-nav-motion";
export const DEBATE_STUDIO_NAV_CAST_REFRACT_ID = "debate:studio-nav-cast";
export const DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID = "debate:studio-nav-evidence";
export const DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID = "debate:studio-nav-archive";
export const DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID =
  "debate:studio-nav-stage-layout";

export const DEBATE_STUDIO_NAV_REFRACT_IDS = [
  DEBATE_STUDIO_NAV_MOTION_REFRACT_ID,
  DEBATE_STUDIO_NAV_CAST_REFRACT_ID,
  DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID,
  DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID,
  DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID,
] as const;

export type DebateStudioNavRefractId =
  (typeof DEBATE_STUDIO_NAV_REFRACT_IDS)[number];

/**
 * Seed for rebuilding the Motion section. Prefer the live idea, then the
 * current motion text, then a local territory roll so Build the debate always
 * has something to synthesize.
 */
export function debateStudioNavMotionSeed(input: {
  topic: string;
  motion: string;
  randomTerritory: (current: string) => string;
}): string {
  const topic = input.topic.trim();
  if (topic) return topic;
  const motion = input.motion.trim();
  if (motion) return motion;
  return input.randomTerritory("").trim();
}

export function debateStudioNavCastMinimumBots(
  playerRole: DebatePlayerRole,
): number {
  return playerRole === "spectator" ? 3 : 2;
}

export function debateStudioNavCastCanRandomize(
  botCount: number,
  playerRole: DebatePlayerRole,
): boolean {
  return botCount >= debateStudioNavCastMinimumBots(playerRole);
}

/**
 * Pick another Archive proceeding to expand. Never deletes or loads a setup.
 * A single record stays highlighted; an empty list returns null.
 */
export function nextDebateArchiveHighlightId(
  sessionIds: readonly string[],
  currentId: string | null,
  random: () => number = Math.random,
): string | null {
  const ids = sessionIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0]!;
  const others = currentId ? ids.filter((id) => id !== currentId) : ids;
  const pool = others.length > 0 ? others : ids;
  const sample = random();
  const roll = Number.isFinite(sample)
    ? Math.min(0.999_999_999, Math.max(0, sample))
    : 0;
  return pool[Math.floor(roll * pool.length)] ?? null;
}

export function debateStudioNavArchiveNotice(input: {
  highlightedId: string | null;
  sessionCount: number;
  alreadyExpanded: boolean;
}): { title: string; detail: string } {
  if (!input.highlightedId || input.sessionCount < 1) {
    return {
      title: "Archive is a record",
      detail:
        "There are no proceedings to highlight yet. Prism will not invent or erase Archive history.",
    };
  }
  if (input.sessionCount === 1 && input.alreadyExpanded) {
    return {
      title: "Archive refreshed",
      detail:
        "This is the only saved proceeding. Prism opened it without changing the record.",
    };
  }
  return {
    title: "Archive refreshed",
    detail:
      "Prism opened a different saved proceeding. The records themselves are unchanged.",
  };
}
