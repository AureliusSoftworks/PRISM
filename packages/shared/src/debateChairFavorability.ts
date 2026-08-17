import {
  debateEventIsAtmosphericVocalFoley,
  debateEventIsCanonicalSilence,
  debateEventIsTranscriptHousekeeping,
  debateSpokenText,
  type DebateEventV1,
  type DebatePhase,
} from "./debate.ts";

/** Signed For advantage, matching the Coach favor bar's -100..100 range. */
export const DEBATE_CHAIR_FAVOR_MIN = -100;
export const DEBATE_CHAIR_FAVOR_MAX = 100;

const CHAIR_FAVOR_EVENT_CLAMP = 12;
const CHAIR_FAVOR_SPOKEN_BASE = 2;
const CHAIR_FAVOR_SILENCE = -4;
const CHAIR_FAVOR_THIN_REPLY = -2;
const CHAIR_FAVOR_HELD_FLOOR = 2;
const CHAIR_FAVOR_EVIDENCE = 5;
const CHAIR_FAVOR_OVERTIME = -4;
const CHAIR_FAVOR_IMPRESSED = 2;
const CHAIR_FAVOR_LAUGH = 2;
const CHAIR_FAVOR_GASP = 1;
const CHAIR_FAVOR_THIN_WORD_LIMIT = 8;
const CHAIR_FAVOR_HELD_FLOOR_WORD_LIMIT = 40;
const CHAIR_FAVOR_INTERRUPTED_WEIGHT = 0.6;

const CHAIR_FAVOR_PHASE_WEIGHT: Record<DebatePhase, number> = {
  opening: 0.75,
  challenge: 1,
  rebuttal: 1.1,
  closing: 1.35,
  verdict: 0.4,
};

export interface DebateChairFavorabilityV1 {
  /** Positive leans For; negative leans Against. */
  total: number;
  latestReason: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function spokenWordCount(content: string): number {
  const spoken = debateSpokenText(content);
  if (!spoken) return 0;
  return spoken.split(" ").filter(Boolean).length;
}

function eventsThroughPlayhead(
  events: readonly DebateEventV1[],
  playheadEventId: string | null,
): DebateEventV1[] | null {
  if (!playheadEventId) return [];
  const heard = events.find((event) => event.id === playheadEventId);
  if (!heard) return null;
  return events.filter((event) => event.sequence <= heard.sequence);
}

function scoreAdvocateTurn(event: DebateEventV1): {
  impact: number;
  reasons: string[];
} | null {
  if (event.speakerKind !== "advocate") return null;
  if (event.sideId !== "for" && event.sideId !== "against") return null;
  if (
    event.kind !== "speech" &&
    event.kind !== "silence" &&
    event.kind !== "player_turn"
  ) {
    return null;
  }
  if (debateEventIsTranscriptHousekeeping(event)) return null;
  if (debateEventIsAtmosphericVocalFoley(event)) return null;

  const reasons: string[] = [];
  let impact = 0;
  if (debateEventIsCanonicalSilence(event)) {
    impact += CHAIR_FAVOR_SILENCE;
    reasons.push("Silent turn");
  } else {
    impact += CHAIR_FAVOR_SPOKEN_BASE;
    const words = spokenWordCount(event.content);
    if (words > 0 && words < CHAIR_FAVOR_THIN_WORD_LIMIT) {
      impact += CHAIR_FAVOR_THIN_REPLY;
      reasons.push("Thin reply");
    } else if (words >= CHAIR_FAVOR_HELD_FLOOR_WORD_LIMIT) {
      impact += CHAIR_FAVOR_HELD_FLOOR;
      reasons.push("Held the floor");
    }
    if (event.sourceIds.length > 0) {
      impact += CHAIR_FAVOR_EVIDENCE;
      reasons.push("Cited evidence");
    }
    const reaction = event.audienceReaction;
    if (reaction && reaction.intensity > 0 && reaction.kind !== "none") {
      if (reaction.kind === "impressed") {
        impact += CHAIR_FAVOR_IMPRESSED * reaction.intensity;
        reasons.push("The room was impressed");
      } else if (reaction.kind === "laugh") {
        impact += CHAIR_FAVOR_LAUGH * reaction.intensity;
        reasons.push("The room laughed");
      } else if (reaction.kind === "gasp") {
        impact += CHAIR_FAVOR_GASP * reaction.intensity;
        reasons.push("The room gasped");
      }
    }
    if (event.timing?.status === "overtime") {
      impact += CHAIR_FAVOR_OVERTIME;
      reasons.push("Overtime");
    }
  }

  const phaseWeight = CHAIR_FAVOR_PHASE_WEIGHT[event.phase] ?? 1;
  const interruptedWeight = event.interrupted
    ? CHAIR_FAVOR_INTERRUPTED_WEIGHT
    : 1;
  const signed = event.sideId === "against" ? -impact : impact;
  return {
    impact: clamp(
      Math.round(signed * phaseWeight * interruptedWeight),
      -CHAIR_FAVOR_EVENT_CLAMP,
      CHAIR_FAVOR_EVENT_CLAMP,
    ),
    reasons,
  };
}

/**
 * Spectator chair lean from the public record already heard.
 * Future bake-ahead events past the playhead never move the needle.
 */
export function debateChairFavorabilityAtPlayhead(args: {
  events: readonly DebateEventV1[];
  playheadEventId: string | null;
}): DebateChairFavorabilityV1 {
  const heard = eventsThroughPlayhead(args.events, args.playheadEventId);
  if (!heard) {
    return { total: 0, latestReason: null };
  }

  let total = 0;
  let latestReason: string | null = null;
  for (const event of heard) {
    const scored = scoreAdvocateTurn(event);
    if (!scored || scored.impact === 0) continue;
    total = clamp(
      total + scored.impact,
      DEBATE_CHAIR_FAVOR_MIN,
      DEBATE_CHAIR_FAVOR_MAX,
    );
    latestReason = scored.reasons.length > 0 ? scored.reasons.join(" · ") : null;
  }

  return { total, latestReason };
}
