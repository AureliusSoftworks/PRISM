import type {
  DebateEventV1,
  DebateFormalityId,
  DebatePlayerRole,
} from "./debate.js";

function estimatedAdvocateSpeakMs(content: string): number {
  const normalized = content.trim().replace(/\s+/gu, " ");
  if (!normalized) return 0;
  const wordCount = normalized.split(" ").length;
  const pauseCount = normalized.match(/[,.!?;:—]/gu)?.length ?? 0;
  return Math.min(
    60_000,
    Math.max(1_400, Math.round(wordCount * 330 + pauseCount * 75)),
  );
}

export type DebateAudiencePressureBand =
  "settled" | "murmuring" | "restless" | "disruptive";

export type DebateAudiencePressureReaction =
  "attentive" | "concession" | "divided" | "evidence" | "question" | null;

export type DebateAudienceModeratorOrderReason =
  | "shock"
  | "disruptive"
  | "sustained";

export interface DebateAudienceModeratorOrderPlan {
  pressure: number;
  reason: DebateAudienceModeratorOrderReason;
}

export const DEBATE_AUDIENCE_INITIAL_PRESSURE = 12;

/**
 * Once the gallery has stayed restless/disruptive this long (estimated spoken
 * ms since the last order), a bot Moderator should pause the floor and call order.
 * Hotter Rowdiness intervenes sooner.
 */
export const DEBATE_AUDIENCE_SUSTAINED_ROWDY_MS = {
  parliamentary: 42_000,
  structured: 30_000,
  plainspoken: 22_000,
  heated: 12_000,
  free_for_all: 7_500,
} as const satisfies Record<DebateFormalityId, number>;

/** Restless floor for sustained-order eligibility (meter band ≥ restless). */
export const DEBATE_AUDIENCE_SUSTAINED_ROWDY_PRESSURE = 45;

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

/** Crowd stays quieter through the body of a live monologue. */
export const DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL = 0.75;
export const DEBATE_AUDIENCE_MONOLOGUE_FULL_BY = 0.92;

/**
 * Hotter Rowdiness lets the gallery start swelling earlier in a live line so
 * Daytime Showdown / free-for-all never feel muted until the last beat.
 */
export const DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL_BY_FORMALITY = {
  parliamentary: 0.82,
  structured: 0.78,
  plainspoken: 0.75,
  heated: 0.62,
  free_for_all: 0.48,
} as const satisfies Record<DebateFormalityId, number>;

export const DEBATE_AUDIENCE_MONOLOGUE_FULL_BY_FORMALITY = {
  parliamentary: 0.94,
  structured: 0.93,
  plainspoken: 0.92,
  heated: 0.88,
  free_for_all: 0.82,
} as const satisfies Record<DebateFormalityId, number>;

/**
 * Never fully mute the gallery under a live line. The late swell still lands,
 * but murmur and seat chatter keep breathing so advocacy never feels alone.
 */
export const DEBATE_AUDIENCE_MONOLOGUE_FLOOR_BY_FORMALITY = {
  parliamentary: 0.42,
  structured: 0.48,
  plainspoken: 0.55,
  heated: 0.64,
  free_for_all: 0.72,
} as const satisfies Record<DebateFormalityId, number>;

export const DEBATE_AUDIENCE_MONOLOGUE_FLOOR = 0.55;

/**
 * While a line is still being heard, keep scored pressure at least in the
 * murmuring band so seat chatter and the murmur bed stay alive under advocacy.
 */
export const DEBATE_AUDIENCE_MONOLOGUE_MIN_PRESSURE_BY_FORMALITY = {
  parliamentary: 20,
  structured: 22,
  plainspoken: 24,
  heated: 28,
  free_for_all: 32,
} as const satisfies Record<DebateFormalityId, number>;

export const DEBATE_AUDIENCE_MONOLOGUE_MIN_PRESSURE = 24;

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

const DEBATE_AUDIENCE_SHOCK_LANGUAGE =
  /\b(?:absurd|atrocious|corrupt|coward|disgrace|disgraceful|fraud|fraudulent|idiot|insane|liar|lying|monstrous|outrage|outrageous|scandal|scandalous|shameful|shocking|stupid|traitor|unbelievable)\b/iu;
/** Public, deterministic signal that a line plausibly earns an audible gasp. */
export function debateAudienceEventIsShocking(
  event: Pick<DebateEventV1, "content" | "kind" | "speakerKind">,
): boolean {
  if (
    event.speakerKind !== "advocate" ||
    !DEBATE_AUDIENCE_HEAT_EVENT_KINDS.has(event.kind)
  ) {
    return false;
  }
  const content = event.content.trim();
  if (!content || content === "...") return false;
  const exclamationCount = content.match(/!/gu)?.length ?? 0;
  const allCapsWords = content.match(/\b[A-Z]{4,}\b/gu)?.length ?? 0;
  return (
    DEBATE_AUDIENCE_SHOCK_LANGUAGE.test(content) ||
    (exclamationCount >= 2 && allCapsWords >= 2)
  );
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

export function debateAudienceMonologueSilenceGate(
  progress: number,
  formality: DebateFormalityId = "plainspoken",
): number {
  const quietUntil =
    DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL_BY_FORMALITY[formality] ??
    DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL;
  const fullBy =
    DEBATE_AUDIENCE_MONOLOGUE_FULL_BY_FORMALITY[formality] ??
    DEBATE_AUDIENCE_MONOLOGUE_FULL_BY;
  const floor =
    DEBATE_AUDIENCE_MONOLOGUE_FLOOR_BY_FORMALITY[formality] ??
    DEBATE_AUDIENCE_MONOLOGUE_FLOOR;
  const span = fullBy - quietUntil;
  const raw =
    span <= 0
      ? clampUnit(progress) >= fullBy
        ? 1
        : 0
      : clampUnit((clampUnit(progress) - quietUntil) / span);
  return Math.max(floor, raw);
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
  formality: DebateFormalityId,
): number {
  if (event.id !== activeEventId || visibleCharacterCount === null) return 1;
  if (event.content.length === 0) return 0;
  return debateAudienceMonologueSilenceGate(
    visibleCharacterCount / event.content.length,
    formality,
  );
}

function liveMonologueAudienceSilenceFactor(args: {
  events: readonly DebateEventV1[];
  activeEventId: string | null;
  visibleCharacterCount: number | null;
  formality: DebateFormalityId;
}): number {
  if (!args.activeEventId || args.visibleCharacterCount === null) return 1;
  const activeEvent = args.events.find(
    (event) => event.id === args.activeEventId,
  );
  if (!activeEvent || activeEvent.content.length === 0) return 1;
  return debateAudienceMonologueSilenceGate(
    args.visibleCharacterCount / activeEvent.content.length,
    args.formality,
  );
}

function eventIsAudienceOrderReset(event: DebateEventV1): boolean {
  return (
    event.gavelReason === "audience_order" ||
    event.stepKey === "audience_order"
  );
}

function eventResetsAudiencePressure(event: DebateEventV1): boolean {
  return (
    event.kind === "judge_gavel" ||
    eventIsAudienceOrderReset(event) ||
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
  /**
   * Keep gallery heat through an in-progress call-to-order so the bed stays
   * rowdy under the moderator instead of collapsing to silence.
   */
  holdThroughOrder?: boolean;
  reactionForEvent?: (event: DebateEventV1) => DebateAudiencePressureReaction;
}): number {
  // The public gallery reacts in every perspective; player role determines
  // who owns the gavel, not whether the room has a pulse.
  const galleryActive =
    args.playerRole === "judge" ||
    args.playerRole === "participant" ||
    args.playerRole === "spectator";
  if (!galleryActive) return 0;
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
    if (event.stepKey === "pause" || event.stepKey === "resume") {
      score = 0;
      continue;
    }
    if (eventResetsAudiencePressure(event)) {
      if (args.holdThroughOrder && eventIsAudienceOrderReset(event)) {
        continue;
      }
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
        args.formality,
      );
  }
  const silence = liveMonologueAudienceSilenceFactor({
    events: args.events,
    activeEventId: args.activeEventId ?? null,
    visibleCharacterCount: args.visibleCharacterCount ?? null,
    formality: args.formality,
  });
  const gated = score * silence;
  // Active monologue with a living duck: never drop into "settled" — that
  // zeroes talker seats and ambient vocal Foley even when the murmur bed is on.
  if (
    args.activeEventId &&
    args.visibleCharacterCount !== null &&
    silence < 1
  ) {
    const minPressure =
      DEBATE_AUDIENCE_MONOLOGUE_MIN_PRESSURE_BY_FORMALITY[args.formality] ??
      DEBATE_AUDIENCE_MONOLOGUE_MIN_PRESSURE;
    return clampPressure(Math.max(gated, minPressure));
  }
  return clampPressure(gated);
}

/**
 * Sparse automatic room control for a bot Moderator. Human Judges retain the
 * decision to strike their own gavel.
 */
export function debateAudienceModeratorOrderPlan(args: {
  events: readonly DebateEventV1[];
  formality: DebateFormalityId;
  playerRole: DebatePlayerRole;
  triggerEvent: DebateEventV1;
}): DebateAudienceModeratorOrderPlan | null {
  const { triggerEvent } = args;
  if (
    args.playerRole === "judge" ||
    triggerEvent.speakerKind !== "advocate" ||
    !DEBATE_AUDIENCE_HEAT_EVENT_KINDS.has(triggerEvent.kind) ||
    triggerEvent.interrupted === true ||
    !triggerEvent.content.trim() ||
    triggerEvent.content.trim() === "..."
  ) {
    return null;
  }

  const automaticOrders = args.events.filter(
    (event) =>
      (event.stepKey === "audience_order" ||
        event.gavelReason === "audience_order") &&
      event.speakerKind === "moderator",
  );
  if (automaticOrders.length >= 3) return null;

  const lastOrderSequence = automaticOrders.at(-1)?.sequence ?? null;
  if (lastOrderSequence !== null) {
    const advocateTurnsSinceOrder = args.events.filter(
      (event) =>
        event.sequence > lastOrderSequence &&
        event.sequence <= triggerEvent.sequence &&
        event.speakerKind === "advocate" &&
        DEBATE_AUDIENCE_HEAT_EVENT_KINDS.has(event.kind) &&
        event.interrupted !== true,
    ).length;
    if (advocateTurnsSinceOrder < 2) return null;
  }

  const pressure = debateAudiencePressureScore({
    events: args.events,
    formality: args.formality,
    playerRole: args.playerRole,
    visibleThroughSequence: triggerEvent.sequence,
  });
  const pressureBefore = debateAudiencePressureScore({
    events: args.events,
    formality: args.formality,
    playerRole: args.playerRole,
    visibleThroughSequence: triggerEvent.sequence - 1,
  });
  const shocking = debateAudienceEventIsShocking(triggerEvent);
  if (shocking && pressure >= 40) {
    return { pressure, reason: "shock" };
  }
  if (pressureBefore < 70 && pressure >= 70) {
    return { pressure, reason: "disruptive" };
  }

  // Already rowdy and staying rowdy: intervene after enough estimated speak-time
  // so Daytime Showdown cannot sit loud forever without a call to order.
  if (pressure >= DEBATE_AUDIENCE_SUSTAINED_ROWDY_PRESSURE) {
    const sinceSequence = lastOrderSequence ?? 0;
    const restlessSpeakMs = args.events
      .filter(
        (event) =>
          event.sequence > sinceSequence &&
          event.sequence <= triggerEvent.sequence &&
          event.speakerKind === "advocate" &&
          DEBATE_AUDIENCE_HEAT_EVENT_KINDS.has(event.kind) &&
          event.interrupted !== true,
      )
      .reduce(
        (sum, event) => sum + estimatedAdvocateSpeakMs(event.content),
        0,
      );
    if (restlessSpeakMs >= DEBATE_AUDIENCE_SUSTAINED_ROWDY_MS[args.formality]) {
      return { pressure, reason: "sustained" };
    }
  }
  return null;
}
