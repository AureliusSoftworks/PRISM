import {
  sessionAmbientBotVocalizationTargetId,
  type SessionAmbientBotVocalizationKind,
} from "./session-atmosphere-audio.ts";
import type { DebateEventV1, DebateFormatId } from "@localai/shared";
import type { DebateForumRole } from "./DebateForumScene.tsx";

export type DebateModeratorGavelCueKind = "attention" | "order";

export interface DebateModeratorGavelCue {
  eventId: string;
  kind: DebateModeratorGavelCueKind;
}

export const DEBATE_GAVEL_FOLEY_URLS = {
  attention: "/audio/debate/gavel-attention-v2.wav",
  order: "/audio/debate/gavel-order-v2.wav",
} as const satisfies Record<DebateModeratorGavelCueKind, string>;

export const DEBATE_GAVEL_IMPACT_DELAYS_MS = {
  attention: 220,
  order: 272,
} as const satisfies Record<DebateModeratorGavelCueKind, number>;

export function debateModeratorGavelSpeechLeadMs(
  kind: DebateModeratorGavelCueKind,
): number {
  return kind === "order" ? 1_450 : 680;
}

export function debateModeratorGavelCue(args: {
  format: DebateFormatId;
  event: DebateEventV1 | null;
  moderatorBotId: string;
}): DebateModeratorGavelCue | null {
  const { event } = args;
  if (!event) return null;

  if (event.kind === "moderator_ruling") {
    return { eventId: event.id, kind: "order" };
  }
  if (event.kind === "verdict" && event.speakerKind !== "player") {
    return { eventId: event.id, kind: "order" };
  }
  if (
    event.kind === "silence" &&
    (event.speakerBotId === args.moderatorBotId ||
      event.speakerKind === "moderator")
  ) {
    return { eventId: event.id, kind: "attention" };
  }
  if (event.kind === "intro") {
    return { eventId: event.id, kind: "attention" };
  }
  if (
    args.format === "turnabout" &&
    (event.kind === "phase" ||
      event.kind === "objection" ||
      event.kind === "revelation")
  ) {
    return { eventId: event.id, kind: "attention" };
  }
  return null;
}

export interface DebateFoleyParticipant {
  id: string;
  role: DebateForumRole;
  active: boolean;
  thinking: boolean;
  hardMuted: boolean;
  hidden: boolean;
}

export function debateVocalFoleyTargetId(args: {
  sessionId: string;
  cueIndex: number;
  kind: SessionAmbientBotVocalizationKind;
  participants: readonly DebateFoleyParticipant[];
}): string | null {
  if (args.kind === "mouth-sound" || args.kind === "lip-smack") return null;
  const eligible = args.participants.filter(
    (participant) =>
      !participant.active &&
      !participant.thinking &&
      !participant.hardMuted &&
      !participant.hidden,
  );
  const preferred =
    args.kind === "soft-inhale"
      ? eligible.filter((participant) => participant.role === "moderator")
      : args.kind === "soft-sigh"
        ? eligible.filter((participant) => participant.role !== "moderator")
        : eligible.filter((participant) => participant.role === "moderator");
  const candidates = preferred.length > 0 ? preferred : eligible;
  return sessionAmbientBotVocalizationTargetId(
    `${args.sessionId}:debate:${args.kind}`,
    args.cueIndex,
    candidates.map((participant) => participant.id),
  );
}
