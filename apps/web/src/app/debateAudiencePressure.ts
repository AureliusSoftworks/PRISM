import type {
  DebateEventV1,
  DebateFormalityId,
  DebatePlayerRole,
} from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

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

export const DEBATE_AUDIENCE_INITIAL_PRESSURE = 12;

const DEBATE_AUDIENCE_EVENT_HEAT = {
  parliamentary: 5,
  structured: 9,
  plainspoken: 15,
  heated: 23,
  free_for_all: 30,
} as const satisfies Record<DebateFormalityId, number>;

const DEBATE_AUDIENCE_PRESSURE_MIX = {
  settled: { background: 0.04, grain: 0, foley: 0.34 },
  murmuring: { background: 0.14, grain: 0.06, foley: 0.34 },
  restless: { background: 0.22, grain: 0.32, foley: 0.34 },
  disruptive: { background: 0.3, grain: 0.72, foley: 0.34 },
} as const satisfies Record<DebateAudiencePressureBand, SessionAtmosphereMix>;

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
  const progress = Math.max(
    0,
    Math.min(1, visibleCharacterCount / event.content.length),
  );
  return Math.max(0, Math.min(1, (progress - 0.35) / 0.5));
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

export function debateAudiencePressureMix(
  band: DebateAudiencePressureBand,
): SessionAtmosphereMix {
  return DEBATE_AUDIENCE_PRESSURE_MIX[band];
}

export function debateAudiencePressureScore(args: {
  events: readonly DebateEventV1[];
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  visibleThroughSequence?: number | null;
  activeEventId?: string | null;
  visibleCharacterCount?: number | null;
  resetAfterSequence?: number | null;
  reactionForEvent?: (
    event: DebateEventV1,
  ) => DebateAudiencePressureReaction;
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
    if (
      resetAfterSequence !== null &&
      event.sequence <= resetAfterSequence
    ) {
      continue;
    }
    if (eventResetsAudiencePressure(event)) {
      score = 0;
      continue;
    }
    const heat = eventHeat({
      event,
      formality: args.formality,
      reaction: args.reactionForEvent?.(event) ?? null,
    });
    score +=
      heat *
      eventRevealHeatMultiplier(
        event,
        args.activeEventId ?? null,
        args.visibleCharacterCount ?? null,
      );
  }
  return clampPressure(score);
}

export function debateAudienceTalkerIndices(args: {
  band: DebateAudiencePressureBand;
  count: number;
  seed: string;
}): number[] {
  const count = Math.max(0, Math.floor(args.count));
  const talkerCount =
    args.band === "settled"
      ? 0
      : args.band === "murmuring"
        ? Math.min(2, count)
        : args.band === "restless"
          ? Math.ceil(count / 2)
          : Math.max(0, count - 1);
  return Array.from({ length: count }, (_, index) => index)
    .sort(
      (left, right) =>
        stableHash(`${args.seed}:${left}`) -
        stableHash(`${args.seed}:${right}`),
    )
    .slice(0, talkerCount)
    .sort((left, right) => left - right);
}
