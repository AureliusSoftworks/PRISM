import {
  sessionAmbientBotVocalizationTargetId,
  type SessionAmbientBotVocalizationKind,
} from "./session-atmosphere-audio.ts";
import type { DebateEventV1, DebateFormatId } from "@localai/shared";
import type { DebateForumRole } from "./DebateForumScene.tsx";

export type DebateModeratorGavelCueKind = "attention" | "order";
export type DebateAudienceReactionKind = "session" | "order";

export interface DebateModeratorGavelCue {
  eventId: string;
  kind: DebateModeratorGavelCueKind;
  audienceReaction?: DebateAudienceReactionKind;
}

export const DEBATE_AUDIENCE_MURMUR_URL =
  "/audio/debate/courtroom-audience-murmur-loop.mp3";

export const DEBATE_AUDIENCE_FOLEY_URLS = [
  "/audio/debate/courtroom-chair-shift.mp3",
  "/audio/debate/courtroom-paper-shuffle.mp3",
  "/audio/debate/courtroom-cough-01.mp3",
  "/audio/debate/courtroom-cough-02.mp3",
] as const;

export const DEBATE_AUDIENCE_REACTIONS = {
  session: {
    url: "/audio/debate/courtroom-audience-session-settle.mp3",
    durationMs: 3_000,
    trim: 0.82,
  },
  order: {
    url: "/audio/debate/courtroom-audience-order-hush.mp3",
    durationMs: 2_300,
    trim: 0.42,
  },
} as const satisfies Record<
  DebateAudienceReactionKind,
  { url: string; durationMs: number; trim: number }
>;

export const DEBATE_GAVEL_FOLEY_URLS = {
  attention: "/audio/debate/gavel-attention-v3.wav",
  order: "/audio/debate/gavel-order-v3.wav",
} as const satisfies Record<DebateModeratorGavelCueKind, string>;

export const DEBATE_GAVEL_FOLEY_TRIM = {
  attention: 0.86,
  order: 0.92,
} as const satisfies Record<DebateModeratorGavelCueKind, number>;

export const DEBATE_GAVEL_VISUAL_IMPACT_MS = {
  attention: 220,
  order: 272,
} as const satisfies Record<DebateModeratorGavelCueKind, number>;

export const DEBATE_GAVEL_ORDER_CAMERA_CUT_MS = 420;

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

  if (event.kind === "judge_gavel") {
    return {
      eventId: event.id,
      kind:
        event.gavelReason === "intervention" || event.gavelReason === "resume"
          ? "order"
          : "attention",
      audienceReaction: "order",
    };
  }
  if (event.kind === "moderator_ruling") {
    return {
      eventId: event.id,
      kind: "order",
      audienceReaction: "order",
    };
  }
  if (event.kind === "interjection") {
    return {
      eventId: event.id,
      kind: "order",
      audienceReaction: "order",
    };
  }
  if (event.kind === "verdict" && event.speakerKind !== "player") {
    return { eventId: event.id, kind: "order" };
  }
  if (
    event.kind === "silence" &&
    (event.speakerBotId === args.moderatorBotId ||
      event.speakerKind === "moderator")
  ) {
    return {
      eventId: event.id,
      kind: event.stepKey === "pause" ? "order" : "attention",
    };
  }
  if (event.kind === "intro" || event.kind === "phase") {
    return {
      eventId: event.id,
      kind: "attention",
      ...(event.kind === "intro"
        ? { audienceReaction: "session" as const }
        : {}),
    };
  }
  if (
    args.format === "turnabout" &&
    (event.kind === "objection" || event.kind === "revelation")
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
