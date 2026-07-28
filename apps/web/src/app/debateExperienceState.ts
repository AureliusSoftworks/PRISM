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
