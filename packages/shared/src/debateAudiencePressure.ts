import type {
  DebateEventV1,
  DebateFormalityId,
  DebatePlayerRole,
} from "./debate.js";

export type DebateAudiencePressureBand =
  | "settled"
  | "murmuring"
  | "restless"
  | "disruptive";

export type DebateAudiencePressureReaction =
  | "attentive"
  | "concession"
  | "divided"
  | "evidence"
  | "question"
  | null;

export type DebateAudienceDeliveryCue =
  | "*speaks loudly*"
  | "*yells over the crowd*";

export const DEBATE_AUDIENCE_INITIAL_PRESSURE = 12;

const DEBATE_AUDIENCE_EVENT_HEAT = {
  parliamentary: 5,
  structured: 9,
  plainspoken: 15,
  heated: 23,
  free_for_all: 30,
} as const satisfies Record<DebateFormalityId, number>;

const DEBATE_AUDIENCE_HEAT_EVENT_KINDS = new Set<DebateEventV1["kind"]>([
  "evidence",
  "interjection",
  "objection",
  "press",
  "reaction",
  "revelation",
  "speech",
  "testimony",
]);

/** Crowd stays quiet through the body of a live monologue. */
export const DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL = 0.75;
export const DEBATE_AUDIENCE_MONOLOGUE_FULL_BY = 0.92;

function stableHash(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function debateAudienceReactionForContent(
  content: string,
): Exclude<DebateAudiencePressureReaction, null> {
  const normalized = content.toLowerCase();
  if (/\[\[(?:source|exhibit):[^\]]+\]\]/u.test(normalized)) {
    return "evidence";
  }
  if (
    /\b(?:i concede|we concede|fair point|grant that|acknowledge)\b/u.test(
      normalized,
    )
  ) {
    return "concession";
  }
  if (content.includes("?")) return "question";
  if (/\b(?:but|however|instead|yet|cannot|wrong|reject)\b/u.test(normalized)) {
    return "divided";
  }
  return "attentive";
}

export function debateAudienceMonologueSilenceGate(progress: number): number {
  const span =
    DEBATE_AUDIENCE_MONOLOGUE_FULL_BY - DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL;
  if (span <= 0) return progress >= DEBATE_AUDIENCE_MONOLOGUE_FULL_BY ? 1 : 0;
  return clampUnit(
    (clampUnit(progress) - DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL) / span,
  );
}

function eventReactionBonus(
  event: DebateEventV1,
  reaction: DebateAudiencePressureReaction,
): number {
  if (event.kind === "objection" || event.kind === "interjection") return 12;
  if (
    event.kind === "evidence" ||
    event.kind === "revelation" ||
    reaction === "divided" ||
    reaction === "evidence" ||
    reaction === "question"
  ) {
    return 8;
  }
  return 0;
}

function eventHeat(args: {
  event: DebateEventV1;
  formality: DebateFormalityId;
  reaction: DebateAudiencePressureReaction;
}): number {
  const { event } = args;
  if (
    event.speakerKind !== "advocate" ||
    !DEBATE_AUDIENCE_HEAT_EVENT_KINDS.has(event.kind) ||
    !event.content.trim() ||
    event.content.trim() === "..."
  ) {
    return 0;
  }
  const variation = (stableHash(event.id) % 7) - 3;
  return Math.max(
    0,
    DEBATE_AUDIENCE_EVENT_HEAT[args.formality] +
      variation +
      eventReactionBonus(event, args.reaction),
  );
}

function eventRevealHeatMultiplier(
  event: DebateEventV1,
  activeEventId: string | null,
  visibleCharacterCount: number | null,
): number {
  if (event.id !== activeEventId || visibleCharacterCount === null) return 1;
  if (event.content.length === 0) return 0;
  return debateAudienceMonologueSilenceGate(
    visibleCharacterCount / event.content.length,
  );
}

function liveMonologueAudienceSilenceFactor(args: {
  events: readonly DebateEventV1[];
  activeEventId: string | null;
  visibleCharacterCount: number | null;
}): number {
  if (!args.activeEventId || args.visibleCharacterCount === null) return 1;
  const activeEvent = args.events.find(
    (event) => event.id === args.activeEventId,
  );
  if (!activeEvent || activeEvent.content.length === 0) return 1;
  return debateAudienceMonologueSilenceGate(
    args.visibleCharacterCount / activeEvent.content.length,
  );
}

function eventResetsAudiencePressure(event: DebateEventV1): boolean {
  return (
    event.kind === "judge_gavel" ||
    event.stepKey === "audience_order" ||
    event.stepKey === "pause" ||
    event.stepKey === "resume"
  );
}

export function debateAudiencePressureBand(
  score: number,
): DebateAudiencePressureBand {
  const pressure = clampPressure(score);
  if (pressure >= 70) return "disruptive";
  if (pressure >= 45) return "restless";
  if (pressure >= 20) return "murmuring";
  return "settled";
}

export function debateAudiencePressureScore(args: {
  events: readonly DebateEventV1[];
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  visibleThroughSequence?: number | null;
  activeEventId?: string | null;
  visibleCharacterCount?: number | null;
  resetAfterSequence?: number | null;
  reactionForEvent?: (event: DebateEventV1) => DebateAudiencePressureReaction;
}): number {
  if (args.playerRole !== "judge") return 0;
  const visibleThroughSequence =
    args.visibleThroughSequence === null ||
    args.visibleThroughSequence === undefined
      ? Number.POSITIVE_INFINITY
      : args.visibleThroughSequence;
  const resetAfterSequence = args.resetAfterSequence ?? null;
  let score =
    resetAfterSequence === null ? DEBATE_AUDIENCE_INITIAL_PRESSURE : 0;
  for (const event of [...args.events].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    if (event.sequence > visibleThroughSequence) break;
    if (resetAfterSequence !== null && event.sequence <= resetAfterSequence) {
      continue;
    }
    if (eventResetsAudiencePressure(event)) {
      score = 0;
      continue;
    }
    const heat = eventHeat({
      event,
      formality: args.formality,
      reaction:
        args.reactionForEvent?.(event) ??
        debateAudienceReactionForContent(event.content),
    });
    score +=
      heat *
      eventRevealHeatMultiplier(
        event,
        args.activeEventId ?? null,
        args.visibleCharacterCount ?? null,
      );
  }
  return clampPressure(
    score *
      liveMonologueAudienceSilenceFactor({
        events: args.events,
        activeEventId: args.activeEventId ?? null,
        visibleCharacterCount: args.visibleCharacterCount ?? null,
      }),
  );
}

/** Deterministic actor direction for the next advocate facing a rowdy gallery. */
export function debateAudienceDeliveryCue(
  score: number,
): DebateAudienceDeliveryCue | null {
  const band = debateAudiencePressureBand(score);
  if (band === "disruptive") return "*yells over the crowd*";
  if (band === "restless") return "*speaks loudly*";
  return null;
}

export function applyDebateAudienceDeliveryCue(
  content: string,
  score: number,
): string {
  const cue = debateAudienceDeliveryCue(score);
  const trimmed = content.trim();
  if (
    !cue ||
    !trimmed ||
    trimmed === "..." ||
    /^\*{1,3}[^*\r\n]{1,240}\*{1,3}/u.test(trimmed) ||
    /^objection\b/iu.test(trimmed)
  ) {
    return content;
  }
  return `${cue} ${trimmed}`;
}
