import type {
  DebateFlytingFormatStateV1,
  DebateSideId,
} from "@localai/shared";

export type DebateFlytingHallFireIntensity =
  | "extinguished"
  | "smoldering"
  | "simmering"
  | "burning"
  | "roaring";

// Four full exchanges, four advisory votes, and the Host's final word fill the
// visual prism. This remains presentation-only and cannot decide the bout.
const FLYTING_PRISM_CAPACITY = 31;

export interface DebateFlytingHallPresentation {
  fireIntensity: DebateFlytingHallFireIntensity;
  fireSeatId: DebateSideId | "host";
  galleryIsQuiet: boolean;
  prism: {
    forContribution: number;
    againstContribution: number;
    forPercent: number;
    againstPercent: number;
    leadingSideId: DebateSideId;
    dominance: number;
  };
}

function contributionForResolution(
  resolution: DebateFlytingFormatStateV1["exchanges"][number]["resolution"],
): { rejoinder: number; challenger: number } {
  if (resolution === "turned") return { rejoinder: 3, challenger: 0 };
  if (resolution === "answered") return { rejoinder: 2, challenger: 0 };
  if (resolution === "unanswered") return { rejoinder: 0, challenger: 2 };
  if (resolution === "contested") return { rejoinder: 1, challenger: 1 };
  return { rejoinder: 0, challenger: 0 };
}

/**
 * Presentation-only Hall momentum. It is intentionally derived from the
 * frozen public record, never persisted, and never used to determine a bout.
 */
export function debateFlytingHallPresentation(
  state: DebateFlytingFormatStateV1,
  status: string,
): DebateFlytingHallPresentation {
  let forContribution = 0;
  let againstContribution = 0;
  const add = (sideId: DebateSideId, amount: number): void => {
    if (sideId === "for") forContribution += amount;
    else againstContribution += amount;
  };

  for (const exchange of state.exchanges) {
    if (exchange.boast) add(exchange.boast.sideId, 1);
    if (exchange.challenge) add(exchange.challenge.sideId, 1);
    if (exchange.rejoinder && exchange.challenge) {
      const contribution = contributionForResolution(exchange.resolution);
      add(exchange.rejoinder.sideId, contribution.rejoinder);
      add(exchange.challenge.sideId, contribution.challenger);
    }
  }
  for (const vote of state.hallVotes) add(vote.sideId, 2);
  if (state.hostVerdict?.sideId) add(state.hostVerdict.sideId, 3);

  const total = Math.max(1, forContribution + againstContribution);
  const leadingSideId = forContribution >= againstContribution ? "for" : "against";
  const leadingContribution = leadingSideId === "for" ? forContribution : againstContribution;
  const dominance = Math.round((leadingContribution / total) * 100);
  const hostOwnsFloor =
    state.phase === "intro" ||
    state.phase === "acclamation" ||
    state.phase === "final_acclamation" ||
    state.phase === "verdict";
  const fireSeatId: DebateSideId | "host" = hostOwnsFloor
    ? "host"
    : state.floorSideId ?? state.hostVerdict?.sideId ?? leadingSideId;
  const fireIntensity: DebateFlytingHallFireIntensity =
    status === "completed" || state.phase === "complete"
      ? "extinguished"
      : status === "paused" || state.phase === "intro"
        ? "smoldering"
        : state.phase === "boast" || state.phase === "final_acclamation"
          ? "simmering"
          : state.phase === "challenge" || state.phase === "acclamation" || state.phase === "verdict"
            ? "burning"
            : "roaring";

  return {
    fireIntensity,
    fireSeatId,
    // Only the brief auto-advanced delivery beat quiets the otherwise rowdy Hall.
    galleryIsQuiet: status === "live" && state.expectedAction === "advance",
    prism: {
      forContribution,
      againstContribution,
      forPercent: Math.min(100, Math.round((forContribution / FLYTING_PRISM_CAPACITY) * 100)),
      againstPercent: Math.min(100, Math.round((againstContribution / FLYTING_PRISM_CAPACITY) * 100)),
      leadingSideId,
      dominance,
    },
  };
}
