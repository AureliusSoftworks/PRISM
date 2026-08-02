import type { DebateEventV1 } from "@localai/shared";
import type { SessionAmbientBotVocalizationKind } from "./session-atmosphere-audio.ts";

export type DebateSpeakerHandoffPhase =
  "wide" | "evidence" | "speaker" | "foley";

export const DEBATE_SPEAKER_HANDOFF_TIMING = {
  /** Camera travel plus a short hold to read the gallery. */
  wideAudienceMs: 2_000,
  /** Time for a newly cited table item to register before the close shot. */
  evidenceMs: 1_350,
  /** One render boundary when no evidence needs a dedicated hold. */
  eventArmMs: 120,
  /** Matches the Forum camera's authored 900 ms travel with a small handle. */
  cameraSettleMs: 1_020,
  /** Quiet physical readiness even when audio is unavailable or inappropriate. */
  quietReadyMs: 520,
} as const;

const DEBATE_STAGE_SPEAKER_KINDS = new Set<DebateEventV1["speakerKind"]>([
  "moderator",
  "advocate",
  "player",
]);

const DEBATE_HANDOFF_DESTINATION_KINDS = new Set<DebateEventV1["kind"]>([
  "speech",
  "testimony",
  "press",
  "evidence",
  "revelation",
  "player_turn",
]);

function debateStageSpeakerIdentity(event: DebateEventV1): string | null {
  if (!DEBATE_STAGE_SPEAKER_KINDS.has(event.speakerKind)) return null;
  if (event.speakerBotId) return event.speakerBotId;
  return event.speakerKind === "player"
    ? `player:${event.sideId ?? "neutral"}`
    : null;
}

function stableHandoffIndex(seed: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

/** Nearest prior floor voice, ignoring system distillation and atmospheric reactions. */
export function debatePreviousStageSpeakerEvent(
  events: readonly DebateEventV1[],
  nextEvent: DebateEventV1,
): DebateEventV1 | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index]!;
    if (candidate.sequence >= nextEvent.sequence) continue;
    if (!debateStageSpeakerIdentity(candidate)) continue;
    if (
      candidate.kind === "reaction" ||
      candidate.kind === "silence" ||
      candidate.speakerKind === "juror"
    ) {
      continue;
    }
    return candidate;
  }
  return null;
}

export interface DebateSpeakerHandoffPlan {
  previousEventId: string;
  nextEventId: string;
  hasEvidence: boolean;
  foleyKind: Extract<
    SessionAmbientBotVocalizationKind,
    "soft-inhale" | "throat-clear"
  > | null;
}

/**
 * Presentation-only choreography for a genuinely new floor holder.
 * Gavel-led turns retain their existing ceremonial lead, and objections keep
 * their deliberately abrupt interruption timing.
 */
export function debateSpeakerHandoffPlan(args: {
  sessionId: string;
  previousEvent: DebateEventV1 | null;
  nextEvent: DebateEventV1;
  automaticCamera: boolean;
  juryCameraActive: boolean;
  gavelLed: boolean;
  hasEvidence: boolean;
  speakerCanFoley: boolean;
}): DebateSpeakerHandoffPlan | null {
  const previousIdentity = args.previousEvent
    ? debateStageSpeakerIdentity(args.previousEvent)
    : null;
  const nextIdentity = debateStageSpeakerIdentity(args.nextEvent);
  if (
    !args.automaticCamera ||
    args.juryCameraActive ||
    args.gavelLed ||
    !previousIdentity ||
    !nextIdentity ||
    previousIdentity === nextIdentity ||
    !DEBATE_HANDOFF_DESTINATION_KINDS.has(args.nextEvent.kind) ||
    args.nextEvent.kind === "objection" ||
    args.nextEvent.kind === "interjection"
  ) {
    return null;
  }

  const foleyKinds = ["soft-inhale", "soft-inhale", "throat-clear"] as const;
  const foleyKind = args.speakerCanFoley
    ? foleyKinds[
        stableHandoffIndex(
          `${args.sessionId}:${args.nextEvent.id}:speaker-ready`,
          foleyKinds.length,
        )
      ]!
    : null;

  return {
    previousEventId: args.previousEvent!.id,
    nextEventId: args.nextEvent.id,
    hasEvidence: args.hasEvidence,
    foleyKind,
  };
}
