import type { DebateMotionSlateV1 } from "@localai/shared";

export interface DebateCastSelection {
  moderator: string;
  forAdvocate: string;
  againstAdvocate: string;
}

export function debatePrefilledCast(
  initialBotIds: readonly string[] | undefined,
): DebateCastSelection {
  const ids = [...new Set((initialBotIds ?? []).filter(Boolean))];
  if (ids.length > 3) {
    return { moderator: "", forAdvocate: "", againstAdvocate: "" };
  }
  return {
    moderator: ids[0] ?? "",
    forAdvocate: ids[1] ?? "",
    againstAdvocate: ids[2] ?? "",
  };
}

/**
 * Stage alignment is available before a Duel has frozen its cast. Preserve
 * every valid draft assignment, then fill empty roles with unique Library
 * stand-ins so the three authored podium positions can always be calibrated.
 */
export function debateAlignmentPreviewCast(
  availableBotIds: readonly string[],
  draft: DebateCastSelection,
): DebateCastSelection | null {
  const availableIds = [...new Set(availableBotIds.filter(Boolean))];
  if (availableIds.length < 3) return null;
  const available = new Set(availableIds);
  const used = new Set<string>();
  const preview: DebateCastSelection = {
    moderator: "",
    forAdvocate: "",
    againstAdvocate: "",
  };
  const slots = [
    "moderator",
    "forAdvocate",
    "againstAdvocate",
  ] as const satisfies readonly (keyof DebateCastSelection)[];

  for (const slot of slots) {
    const botId = draft[slot];
    if (!botId || !available.has(botId) || used.has(botId)) continue;
    preview[slot] = botId;
    used.add(botId);
  }
  for (const slot of slots) {
    if (preview[slot]) continue;
    const standIn = availableIds.find((botId) => !used.has(botId));
    if (!standIn) return null;
    preview[slot] = standIn;
    used.add(standIn);
  }
  return preview;
}

/** Selecting a synthesized slate replaces its five editable fields together. */
export function copyDebateMotionSlate(
  slate: DebateMotionSlateV1,
): DebateMotionSlateV1 {
  return {
    ...slate,
    forSide: { ...slate.forSide },
    againstSide: { ...slate.againstSide },
  };
}
