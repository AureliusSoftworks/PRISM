import {
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  type BotcastImmersiveVoiceTag,
  type DebateEventV1,
  type DebateFormatId,
} from "@localai/shared";
import {
  sessionAmbientBotVocalizationTargetId,
  type SessionAmbientBotVocalizationKind,
} from "./session-atmosphere-audio.ts";
import type { DebateForumRole } from "./DebateForumScene.tsx";
import {
  debateGalleryReactingIndices,
  debateGalleryReaction,
  type DebateGalleryReaction,
} from "./debatePresentation.ts";

/** Ellipsis caption placeholder — heard as Foley, never Proceedings prose. */
export const DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER = "..." as const;

export type DebateModeratorGavelCueKind = "attention" | "order";
export type DebateAudienceReactionKind =
  | "session"
  | "gasp"
  | "order"
  | "objection"
  | "evidence"
  | "question"
  | "concession"
  | "ruling";

export type DebateAudienceBeatKind =
  | "attentive"
  | "contention"
  | "question"
  | "evidence"
  | "concession"
  | "objection"
  | "ruling";

export interface DebateAudienceBeat {
  kind: DebateAudienceBeatKind;
  listenerReaction: DebateGalleryReaction;
  seatIndices: number[];
  foleyCue: DebateAudienceReactionKind | null;
}

export interface DebateModeratorGavelCue {
  eventId: string;
  kind: DebateModeratorGavelCueKind;
  audienceReaction?: DebateAudienceReactionKind;
}

export const DEBATE_AUDIENCE_MURMUR_URL =
  "/audio/debate/courtroom-audience-murmur-loop.mp3";
export const DEBATE_AUDIENCE_CROSSTALK_URL =
  "/audio/debate/courtroom-audience-crosstalk-loop.mp3";
export const DEBATE_AUDIENCE_AGITATION_URL =
  "/audio/debate/courtroom-audience-agitation-swell.mp3";

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
    trim: 1,
  },
  gasp: {
    url: "/audio/signal/soundboard/gasp.mp3",
    durationMs: 1_200,
    trim: 0.72,
  },
  order: {
    url: "/audio/debate/courtroom-audience-order-hush.mp3",
    durationMs: 2_300,
    trim: 0.72,
  },
  objection: {
    url: "/audio/debate/courtroom-audience-order-hush.mp3",
    durationMs: 2_300,
    trim: 0.46,
  },
  evidence: {
    url: "/audio/debate/courtroom-paper-shuffle.mp3",
    durationMs: 1_100,
    trim: 0.62,
  },
  question: {
    url: "/audio/debate/courtroom-chair-shift.mp3",
    durationMs: 1_100,
    trim: 0.5,
  },
  concession: {
    url: "/audio/debate/courtroom-audience-session-settle.mp3",
    durationMs: 3_000,
    trim: 0.54,
  },
  ruling: {
    url: "/audio/debate/courtroom-audience-order-hush.mp3",
    durationMs: 2_300,
    trim: 0.62,
  },
} as const satisfies Record<
  DebateAudienceReactionKind,
  { url: string; durationMs: number; trim: number }
>;

const DEBATE_AUDIENCE_REACTIVE_EVENT_KINDS = new Set<DebateEventV1["kind"]>([
  "speech",
  "testimony",
  "press",
  "objection",
  "evidence",
  "revelation",
  "player_turn",
  "interjection",
  "moderator_ruling",
  "verdict",
  "jury_verdict",
]);

export function debateAudienceBeatForEvent(args: {
  event: DebateEventV1 | null;
  publicContent: string;
  seatCount: number;
  /** Cap concurrent visual reactors; defaults to the legacy attentive=1 / else=2. */
  maxReactingSeats?: number;
}): DebateAudienceBeat | null {
  const { event } = args;
  const publicContent = args.publicContent.trim();
  const seatCount = Math.max(0, Math.floor(args.seatCount));
  if (
    !event ||
    !publicContent ||
    seatCount === 0 ||
    !DEBATE_AUDIENCE_REACTIVE_EVENT_KINDS.has(event.kind) ||
    event.speakerKind === "system" ||
    (event.speakerKind === "juror" && event.kind !== "jury_verdict")
  ) {
    return null;
  }

  let listenerReaction = debateGalleryReaction(publicContent);
  let kind: DebateAudienceBeatKind =
    listenerReaction === "divided" ? "contention" : listenerReaction;

  if (event.kind === "objection" || event.kind === "interjection") {
    kind = "objection";
    listenerReaction = "divided";
  } else if (event.kind === "evidence" || event.kind === "revelation") {
    kind = "evidence";
    listenerReaction = "evidence";
  } else if (
    event.kind === "moderator_ruling" ||
    event.kind === "verdict" ||
    event.kind === "jury_verdict"
  ) {
    kind = "ruling";
  }

  const reactingIndices = debateGalleryReactingIndices(
    event.content || publicContent,
    event.sequence,
    seatCount,
  );
  const defaultMaxSeats = kind === "attentive" ? 1 : 2;
  const maxReactingSeats = Math.max(
    1,
    Math.min(
      defaultMaxSeats,
      Math.floor(args.maxReactingSeats ?? defaultMaxSeats),
    ),
  );
  const seatIndices = reactingIndices.slice(0, maxReactingSeats);
  const foleyCue: DebateAudienceReactionKind | null =
    kind === "objection"
      ? "objection"
      : kind === "evidence"
        ? "evidence"
        : kind === "ruling"
          ? "ruling"
          : null;

  return { kind, listenerReaction, seatIndices, foleyCue };
}

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
        event.gavelReason === "intervention" ||
        event.gavelReason === "resume" ||
        event.gavelReason === "audience_order"
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
  if (args.format === "turnabout" && event.kind === "revelation") {
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

/** Human label for ambient vocal Foley shown above Debate bots (Signal-style). */
export function debateAmbientVocalFoleyTagText(
  kind: SessionAmbientBotVocalizationKind,
): string | null {
  switch (kind) {
    case "throat-clear":
      return "Clears throat";
    case "soft-sigh":
      return "Sighs";
    case "soft-inhale":
      return "Inhales";
    case "mouth-sound":
    case "lip-smack":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Prefer the live ambient cue label; otherwise use a persona-surprise
 * reaction’s short Foley phrase while that bot owns the beat.
 */
export function resolveDebateVocalFoleyTagText(args: {
  ambientKind?: SessionAmbientBotVocalizationKind | null;
  personaReactionContent?: string | null;
}): string | null {
  if (args.ambientKind) {
    const ambient = debateAmbientVocalFoleyTagText(args.ambientKind);
    if (ambient) return ambient;
  }
  const persona = args.personaReactionContent?.trim();
  return persona && persona.length > 0 ? persona : null;
}

/** Map ambient room cue kinds onto ElevenLabs immersive vocal tags. */
export function debateAmbientKindToImmersiveVoiceTag(
  kind: SessionAmbientBotVocalizationKind,
): BotcastImmersiveVoiceTag | null {
  switch (kind) {
    case "throat-clear":
      return "clears throat";
    case "soft-sigh":
      return "sighs";
    case "soft-inhale":
      return "exhales";
    case "mouth-sound":
    case "lip-smack":
      return null;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function normalizeDebateVocalFoleyPhrase(value: string): string {
  return value
    .trim()
    .replace(/^\*+|\*+$/gu, "")
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

/**
 * Resolve a short Foley phrase to an immersive voice tag when possible.
 * Freeform surprise lines still speak, but captions stay ellipsis-only.
 */
export function debateVocalFoleyImmersiveTag(
  content: string,
): BotcastImmersiveVoiceTag | null {
  const normalized = normalizeDebateVocalFoleyPhrase(content);
  if (!normalized) return null;
  for (const tag of BOTCAST_IMMERSIVE_VOICE_TAGS) {
    if (normalized === tag || normalized === `*${tag}*`) return tag;
  }
  // Allow light paraphrase matches used in overhead tags.
  if (normalized === "clears throat" || normalized === "clear throat") {
    return "clears throat";
  }
  if (normalized === "sighs" || normalized === "sigh") return "sighs";
  if (
    normalized === "inhales" ||
    normalized === "inhale" ||
    normalized === "exhales" ||
    normalized === "exhale"
  ) {
    return "exhales";
  }
  if (normalized === "breathes deeply" || normalized === "breathe deeply") {
    return "breathes deeply";
  }
  if (normalized === "chuckles" || normalized === "chuckle") return "chuckles";
  if (normalized === "coughs" || normalized === "cough") return "coughs";
  return null;
}

/** Signal-style spoken placeholder + ElevenLabs performance for Debate Foley. */
export function debateVocalFoleyVoicePerformance(content: string): {
  spokenText: typeof DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER;
  voicePerformanceText: string;
} {
  const tag = debateVocalFoleyImmersiveTag(content);
  if (tag) {
    return {
      spokenText: DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER,
      voicePerformanceText: `[${tag}] ${DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER}`,
    };
  }
  const trimmed = content.trim();
  return {
    spokenText: DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER,
    voicePerformanceText: trimmed
      ? `${trimmed} ${DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER}`
      : DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER,
  };
}

export function debateAmbientVocalFoleyVoicePerformance(
  kind: SessionAmbientBotVocalizationKind,
): {
  spokenText: typeof DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER;
  voicePerformanceText: string;
} | null {
  const tag = debateAmbientKindToImmersiveVoiceTag(kind);
  if (!tag) return null;
  return {
    spokenText: DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER,
    voicePerformanceText: `[${tag}] ${DEBATE_VOCAL_FOLEY_SPOKEN_PLACEHOLDER}`,
  };
}
