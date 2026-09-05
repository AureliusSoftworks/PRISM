import {
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  type BotcastImmersiveVoiceTag,
  type DebateAudiencePressureBand,
  type DebateAudienceReactionV1,
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
  | "ruling"
  | "laugh"
  | "impressed";

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

/**
 * Soft chamber air for Observing / settled gallery — the former stand-in
 * murmur bed. Keeps the room alive without reading as crowd hiss.
 */
export const DEBATE_AUDIENCE_ROOM_BASELINE_URL =
  "/audio/session-atmosphere/default-studio-room-loop.mp3";

/**
 * Classic gallery murmur for Murmuring and hotter bands. Prefer this over the
 * studio room loop once the house is actually murmuring.
 */
export const DEBATE_AUDIENCE_MURMUR_URL =
  "/audio/debate/courtroom-audience-murmur-loop.mp3";

export const DEBATE_AUDIENCE_CROSSTALK_URL =
  "/audio/debate/courtroom-audience-crosstalk-loop.mp3";
export const DEBATE_AUDIENCE_AGITATION_URL =
  "/audio/debate/courtroom-audience-agitation-swell.mp3";

/** Crowd bed once pressure leaves Observing; quiet room air otherwise. */
export function debateAudienceBackgroundUrlForPressureBand(
  band: DebateAudiencePressureBand | null,
): string {
  if (band === null || band === "settled") {
    return DEBATE_AUDIENCE_ROOM_BASELINE_URL;
  }
  return DEBATE_AUDIENCE_MURMUR_URL;
}

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
  laugh: {
    url: "/audio/signal/soundboard/laughter.mp3",
    durationMs: 1_760,
    trim: 0.62,
  },
  impressed: {
    url: "/audio/signal/soundboard/applause.mp3",
    durationMs: 2_200,
    trim: 0.58,
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

export interface DebateDirectedAudiencePlayback {
  kind: "laugh" | "gasp" | "impressed";
  intensity: 1 | 2 | 3;
}

export function debateDirectedAudiencePlayback(
  reaction: DebateAudienceReactionV1 | null | undefined,
): DebateDirectedAudiencePlayback | null {
  if (
    !reaction ||
    reaction.kind === "none" ||
    reaction.intensity < 1 ||
    (reaction.kind !== "laugh" &&
      reaction.kind !== "gasp" &&
      reaction.kind !== "impressed")
  ) {
    return null;
  }
  return {
    kind: reaction.kind,
    intensity: Math.max(1, Math.min(3, reaction.intensity)) as 1 | 2 | 3,
  };
}

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
  const directedReaction = debateDirectedAudiencePlayback(
    event.audienceReaction,
  );
  if (directedReaction?.kind === "laugh") {
    kind = "contention";
    listenerReaction = "divided";
  } else if (directedReaction?.kind === "gasp") {
    kind = "question";
    listenerReaction = "question";
  } else if (directedReaction?.kind === "impressed") {
    kind = "evidence";
    listenerReaction = "evidence";
  }

  const reactingIndices = debateGalleryReactingIndices(
    event.content || publicContent,
    event.sequence,
    seatCount,
  );
  if (directedReaction) {
    for (
      let offset = 1;
      reactingIndices.length < directedReaction.intensity &&
      reactingIndices.length < seatCount;
      offset += 1
    ) {
      const candidate = (event.sequence + offset * 3) % seatCount;
      if (!reactingIndices.includes(candidate)) reactingIndices.push(candidate);
    }
  }
  const defaultMaxSeats = directedReaction
    ? Math.min(seatCount, directedReaction.intensity)
    : kind === "attentive"
      ? 1
      : 2;
  const maxReactingSeats = Math.max(
    1,
    Math.min(
      defaultMaxSeats,
      Math.floor(args.maxReactingSeats ?? defaultMaxSeats),
    ),
  );
  const seatIndices = reactingIndices.slice(0, maxReactingSeats);
  const foleyCue: DebateAudienceReactionKind | null =
    event.kind === "objection" || event.kind === "interjection"
      ? "objection"
      : event.kind === "evidence" || event.kind === "revelation"
        ? "evidence"
        : event.kind === "moderator_ruling" ||
            event.kind === "verdict" ||
            event.kind === "jury_verdict"
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

/**
 * Settle Auto on the Moderator shot before the visual slam arms. Order needs a
 * longer establish after recess Wide; attention (opening bookends) still needs
 * a visible Moderator beat before the first strike.
 */
export const DEBATE_GAVEL_ORDER_CAMERA_SETTLE_MS = 780;
export const DEBATE_GAVEL_ATTENTION_CAMERA_SETTLE_MS = 720;

export function debateModeratorGavelCameraSettleMs(
  kind: DebateModeratorGavelCueKind,
): number {
  return kind === "order"
    ? DEBATE_GAVEL_ORDER_CAMERA_SETTLE_MS
    : DEBATE_GAVEL_ATTENTION_CAMERA_SETTLE_MS;
}

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
  /** Ready breathless: excluded only from soft-inhale / soft-sigh ambient cues. */
  breathless?: boolean;
  hidden: boolean;
}

export function debateVocalFoleyTargetId(args: {
  sessionId: string;
  cueIndex: number;
  kind: SessionAmbientBotVocalizationKind;
  participants: readonly DebateFoleyParticipant[];
}): string | null {
  if (args.kind === "mouth-sound" || args.kind === "lip-smack") return null;
  const breathAmbient =
    args.kind === "soft-inhale" || args.kind === "soft-sigh";
  const eligible = args.participants.filter(
    (participant) =>
      !participant.active &&
      !participant.thinking &&
      !participant.hardMuted &&
      !(breathAmbient && participant.breathless === true) &&
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

/** Staggered silent-deliberation mouth chatter frame duration. */
export const DEBATE_JURY_DELIBERATION_MOUTH_FRAME_MS = 130;

const DEBATE_JURY_DELIBERATION_MOUTH_FRAMES = [
  "speech-closed",
  "open-small",
  "narrow",
  "open-round",
  "dot",
  "open-small",
  "narrow",
  "speech-closed",
] as const;

/**
 * Deterministic, staggered mouth poses for the silent Jury chamber prepare
 * beat — jurors look like they are conferring without audible words.
 */
export function debateJuryDeliberationMouthShape(
  seatIndex: number,
  nowMs: number,
): (typeof DEBATE_JURY_DELIBERATION_MOUTH_FRAMES)[number] {
  const safeSeat = Math.max(0, Math.floor(seatIndex));
  const phase = Math.floor(
    (Math.max(0, nowMs) + safeSeat * 97) / DEBATE_JURY_DELIBERATION_MOUTH_FRAME_MS,
  );
  return DEBATE_JURY_DELIBERATION_MOUTH_FRAMES[
    ((phase % DEBATE_JURY_DELIBERATION_MOUTH_FRAMES.length) +
      DEBATE_JURY_DELIBERATION_MOUTH_FRAMES.length) %
      DEBATE_JURY_DELIBERATION_MOUTH_FRAMES.length
  ]!;
}
