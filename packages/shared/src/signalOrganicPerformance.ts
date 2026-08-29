export const SIGNAL_CONVERSATION_REPAIR_VERSION = 1 as const;
export const SIGNAL_STUDIO_INCIDENT_VERSION = 1 as const;
export const SIGNAL_CONVERSATION_REPAIR_MAX_SEQUENCES = 2 as const;
export const SIGNAL_CONVERSATION_REPAIR_COOLDOWN_TURNS = 4 as const;

export type SignalConversationRepairSubtypeV1 =
  | "soft_interruption"
  | "mutual_interruption"
  | "repetition_clarification";
export type SignalConversationRepairPhaseV1 =
  | "planned"
  | "opened"
  | "guest_request"
  | "guest_resumed"
  | "return_invited"
  | "restart_fulfilled"
  | "host_repeat"
  | "follow_up_fulfilled"
  | "guest_answer"
  | "resolved";

/** Public state only. Any unheard/generated intent remains request-local. */
export interface SignalConversationRepairEventV1 {
  v: typeof SIGNAL_CONVERSATION_REPAIR_VERSION;
  name: "signalConversationRepair";
  provenance: "signal_organic_dialogue";
  canonicalImpact: "none";
  sequenceId: string;
  subtype: SignalConversationRepairSubtypeV1;
  phase: SignalConversationRepairPhaseV1;
  triggerMessageId: string;
  hostBotId: string;
  guestBotId: string;
  turnOrdinal: number;
  repeatMode?: "repeat" | "paraphrase";
  sourceMessageId?: string;
  /** Exact public words heard before a mutual collision. Never an unheard suffix. */
  publicHeardContext?: string;
  /** Public fact that an unheard host intent exists; its words remain server-private. */
  latentIntentPending?: true;
  publicReturnInvitation?: string;
  obligationProvenance?: "server_private_latent_intent";
}

export type SignalOrganicInterruptionSubtypeV1 = Extract<
  SignalConversationRepairSubtypeV1,
  "soft_interruption" | "mutual_interruption"
>;

export interface SignalOrganicInterruptionDecisionV1 {
  subtype: SignalOrganicInterruptionSubtypeV1;
  includeReturnInvitation: boolean;
}

export type SignalRepetitionFrictionReasonV1 =
  | "long_scientific_term"
  | "dense_proper_names"
  | "nested_host_question"
  | "audible_interference"
  | "ordinary_baseline";

export interface SignalRepetitionEligibilityPlanV1 {
  reason: SignalRepetitionFrictionReasonV1;
  repeatMode: "repeat" | "paraphrase";
}

export const SIGNAL_STUDIO_INCIDENT_KINDS = [
  "quiet_guest_start",
  "headphone_monitor_correction",
  "booth_object_mishap",
  "shared_laughter_derail",
  "host_loses_place_reset",
] as const;
export type SignalStudioIncidentKindV1 =
  (typeof SIGNAL_STUDIO_INCIDENT_KINDS)[number];

export type SignalStudioIncidentBeatV1 =
  | {
      kind: "gain";
      bus: "primary" | "monitor";
      actorBotId: string;
      atProgress: number;
      gain: number;
      rampMs: number;
    }
  | {
      kind: "foley";
      cue:
        | "chair_shift"
        | "paper_shuffle"
        | "glass_clink"
        | "headphone_rustle"
        | "shared_laughter";
      atProgress: number;
      gain: number;
    }
  | {
      kind: "dialogue";
      speakerRole: "host" | "guest";
      actorBotId: string;
      atProgress: number;
      text: string;
    }
  | {
      kind: "action";
      actorBotId: string;
      atProgress: number;
      action: "lean_in" | "adjust_headphones" | "reset_notes";
    }
  | {
      kind: "pause";
      atProgress: number;
      durationMs: number;
    };

export interface SignalStudioIncidentEventV1 {
  v: typeof SIGNAL_STUDIO_INCIDENT_VERSION;
  name: "signalStudioIncident";
  provenance: "deterministic_studio_bank";
  canonicalImpact: "none";
  incidentId: string;
  kind: SignalStudioIncidentKindV1;
  sourceMessageId: string;
  actorBotId: string;
  turnOrdinal: number;
  audible: boolean;
  caption: string;
  startProgress: number;
  endProgress: number;
  beats: SignalStudioIncidentBeatV1[];
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 160);
  return normalized || null;
}

function boundedPublicText(value: unknown, maximum = 1_000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/gu, " ").trim().slice(0, maximum);
  return normalized || null;
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 0x1_0000_0000;
}

const REPAIR_SUBTYPES = new Set<SignalConversationRepairSubtypeV1>([
  "soft_interruption",
  "mutual_interruption",
  "repetition_clarification",
]);
const REPAIR_PHASES = new Set<SignalConversationRepairPhaseV1>([
  "planned",
  "opened",
  "guest_request",
  "guest_resumed",
  "return_invited",
  "restart_fulfilled",
  "host_repeat",
  "follow_up_fulfilled",
  "guest_answer",
  "resolved",
]);

export function normalizeSignalConversationRepairEventV1(
  value: unknown,
): SignalConversationRepairEventV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sequenceId = boundedId(row.sequenceId);
  const triggerMessageId = boundedId(row.triggerMessageId);
  const hostBotId = boundedId(row.hostBotId);
  const guestBotId = boundedId(row.guestBotId);
  const sourceMessageId = row.sourceMessageId === undefined
    ? undefined
    : boundedId(row.sourceMessageId) ?? undefined;
  const publicHeardContext = row.publicHeardContext === undefined
    ? undefined
    : boundedPublicText(row.publicHeardContext, 8_000) ?? undefined;
  const latentIntentPending = row.latentIntentPending === true
    ? true as const
    : undefined;
  const publicReturnInvitation = row.publicReturnInvitation === undefined
    ? undefined
    : boundedPublicText(row.publicReturnInvitation, 160) ?? undefined;
  const obligationProvenance =
    row.obligationProvenance === "server_private_latent_intent"
      ? row.obligationProvenance
      : undefined;
  const turnOrdinal = Number(row.turnOrdinal);
  const subtype = REPAIR_SUBTYPES.has(
      row.subtype as SignalConversationRepairSubtypeV1,
    )
    ? row.subtype as SignalConversationRepairSubtypeV1
    : null;
  const phase = REPAIR_PHASES.has(row.phase as SignalConversationRepairPhaseV1)
    ? row.phase as SignalConversationRepairPhaseV1
    : null;
  const repeatMode = row.repeatMode === "repeat" || row.repeatMode === "paraphrase"
    ? row.repeatMode
    : undefined;
  if (
    row.v !== SIGNAL_CONVERSATION_REPAIR_VERSION ||
    row.name !== "signalConversationRepair" ||
    row.provenance !== "signal_organic_dialogue" ||
    row.canonicalImpact !== "none" ||
    !sequenceId ||
    !subtype ||
    !phase ||
    !triggerMessageId ||
    !hostBotId ||
    !guestBotId ||
    hostBotId === guestBotId ||
    !Number.isInteger(turnOrdinal) ||
    turnOrdinal < 1 ||
    (subtype === "repetition_clarification" &&
      phase !== "opened" &&
      (!repeatMode || !sourceMessageId)) ||
    (subtype !== "repetition_clarification" &&
      (repeatMode !== undefined || sourceMessageId !== undefined)) ||
    (subtype === "repetition_clarification" &&
      (publicHeardContext !== undefined ||
        latentIntentPending !== undefined ||
        publicReturnInvitation !== undefined ||
        obligationProvenance !== undefined)) ||
    (subtype === "mutual_interruption" &&
      (!publicHeardContext ||
        latentIntentPending !== undefined ||
        publicReturnInvitation !== undefined ||
        obligationProvenance !== undefined)) ||
    (subtype === "soft_interruption" &&
      (publicHeardContext !== undefined ||
        ((latentIntentPending === undefined) !==
          (publicReturnInvitation === undefined)) ||
        ((latentIntentPending === undefined) !==
          (obligationProvenance === undefined))))
  ) {
    return null;
  }
  return {
    v: SIGNAL_CONVERSATION_REPAIR_VERSION,
    name: "signalConversationRepair",
    provenance: "signal_organic_dialogue",
    canonicalImpact: "none",
    sequenceId,
    subtype,
    phase,
    triggerMessageId,
    hostBotId,
    guestBotId,
    turnOrdinal,
    ...(repeatMode ? { repeatMode } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(publicHeardContext ? { publicHeardContext } : {}),
    ...(latentIntentPending ? { latentIntentPending } : {}),
    ...(publicReturnInvitation ? { publicReturnInvitation } : {}),
    ...(obligationProvenance ? { obligationProvenance } : {}),
  };
}

export function signalConversationRepairCanStartV1(args: {
  prior: readonly SignalConversationRepairEventV1[];
  subtype: SignalConversationRepairSubtypeV1;
  turnOrdinal: number;
  /** Latest coordinated studio incident, when one occurred after a repair. */
  lastCoordinatedTurnOrdinal?: number | null;
}): boolean {
  const sequences = new Set(args.prior.map((event) => event.sequenceId));
  const usedSubtypes = new Set(args.prior.map((event) => event.subtype));
  const latestRepairTurn = args.prior.reduce(
    (latest, event) => Math.max(latest, event.turnOrdinal),
    Number.NEGATIVE_INFINITY,
  );
  const latestTurn = Math.max(
    latestRepairTurn,
    typeof args.lastCoordinatedTurnOrdinal === "number"
      ? args.lastCoordinatedTurnOrdinal
      : Number.NEGATIVE_INFINITY,
  );
  return (
    sequences.size < SIGNAL_CONVERSATION_REPAIR_MAX_SEQUENCES &&
    !usedSubtypes.has(args.subtype) &&
    args.turnOrdinal - latestTurn >= SIGNAL_CONVERSATION_REPAIR_COOLDOWN_TURNS
  );
}

/**
 * Organic cut-ins are planned from public turn facts only. A soft cut-in is
 * host-over-guest and lands on roughly six percent of eligible guest answers;
 * the separate mutual roll is intentionally much rarer.
 */
export function planSignalOrganicInterruptionV1(args: {
  episodeId: string;
  messageId: string;
  speakerRole: "host" | "guest";
  wordCount: number;
  eligible?: boolean;
}): SignalOrganicInterruptionDecisionV1 | null {
  if (
    args.eligible === false ||
    !boundedId(args.episodeId) ||
    !boundedId(args.messageId) ||
    !Number.isFinite(args.wordCount) ||
    args.wordCount < 12
  ) return null;
  const seed = `signal-organic-interruption-v1:${args.episodeId}:${args.messageId}`;
  if (stableUnit(`${seed}:mutual`) < 0.008) {
    return { subtype: "mutual_interruption", includeReturnInvitation: false };
  }
  if (
    args.speakerRole === "guest" &&
    stableUnit(`${seed}:soft-host-over-guest`) < 0.06
  ) {
    return {
      subtype: "soft_interruption",
      includeReturnInvitation:
        stableUnit(`${seed}:public-return-invitation`) < 0.42,
    };
  }
  return null;
}

const SIGNAL_PUBLIC_FOLLOW_UP_QUESTIONS = [
  "What feels most important about that in practice?",
  "Where does that leave the real choice?",
  "What should listeners carry forward from that?",
  "Which part of that matters most now?",
] as const;

/**
 * Build the bounded host question kept inside the server-only event seam until
 * it is actually spoken. Public repair state records only that an obligation
 * exists, never these unheard words.
 */
export function buildSignalPrivateFollowUpQuestionV1(args: {
  episodeId: string;
  triggerMessageId: string;
  publicGuestContent: string;
  topic?: string;
}): string {
  const publicSource = boundedPublicText(args.publicGuestContent, 8_000) ?? "";
  const topic = boundedPublicText(args.topic, 120) ?? "";
  const seed = [
    "signal-public-follow-up-v1",
    args.episodeId,
    args.triggerMessageId,
    publicSource.slice(0, 240),
    topic,
  ].join(":");
  return SIGNAL_PUBLIC_FOLLOW_UP_QUESTIONS[
    Math.floor(stableUnit(seed) * SIGNAL_PUBLIC_FOLLOW_UP_QUESTIONS.length) %
      SIGNAL_PUBLIC_FOLLOW_UP_QUESTIONS.length
  ]!;
}

export function signalPendingInterruptionRepairV1(
  prior: readonly SignalConversationRepairEventV1[],
): SignalConversationRepairEventV1 | null {
  const bySequence = new Map<string, SignalConversationRepairEventV1>();
  for (const event of prior) {
    if (
      event.subtype === "soft_interruption" ||
      event.subtype === "mutual_interruption"
    ) {
      bySequence.set(event.sequenceId, event);
    }
  }
  const latest = [...bySequence.values()].at(-1) ?? null;
  return latest && latest.phase !== "resolved" ? latest : null;
}

const SIGNAL_LONG_SCIENTIFIC_TERM =
  /\b(?:[\p{L}]{13,}(?:ology|omics|ization|isation|ivity|escence|dynamics|synthesis|magnetism|mechanics)|deoxyribonucleic|electromagnetic|photosynthesis|superconduct\w*)\b/iu;
const SIGNAL_QUESTION_WORD = /\b(?:how|what|why|which|where|when|who)\b/giu;
const SIGNAL_PROPER_NAME_SEQUENCE =
  /\b[A-Z][\p{L}'’.-]+(?:\s+(?:de|da|del|van|von|of|the|[A-Z][\p{L}'’.-]+)){1,4}\b/gu;

export function signalRepetitionFrictionReasonV1(
  hostQuestion: string,
): Exclude<SignalRepetitionFrictionReasonV1, "ordinary_baseline"> | null {
  const source = hostQuestion.replace(/\s+/gu, " ").trim();
  if (!source) return null;
  if (SIGNAL_LONG_SCIENTIFIC_TERM.test(source)) return "long_scientific_term";
  const properNameMatches = [...source.matchAll(SIGNAL_PROPER_NAME_SEQUENCE)]
    .map((match) => match[0])
    .filter((match) =>
      !/^(?:What|Which|Who|When|Where|Why|How)\b/u.test(match)
    );
  const properNameWords = properNameMatches.reduce(
    (total, match) => total + match.split(/\s+/u).length,
    0,
  );
  if (properNameMatches.length >= 2 || properNameWords >= 4) {
    return "dense_proper_names";
  }
  const questionMarks = source.match(/\?/gu)?.length ?? 0;
  const questionWords = source.match(SIGNAL_QUESTION_WORD)?.length ?? 0;
  if (
    questionMarks >= 2 ||
    (questionMarks >= 1 &&
      questionWords >= 2 &&
      /\b(?:and|but|while|then|as well as)\b/iu.test(source))
  ) {
    return "nested_host_question";
  }
  return null;
}

/**
 * Planned re-asks are reserved for an observable source of friction. Ordinary,
 * clear questions may still receive an organic model-authored clarification,
 * but Signal must not manufacture a canned one from a baseline dice roll.
 */
export function planSignalRepetitionEligibilityV1(args: {
  episodeId: string;
  sourceMessageId: string;
  hostQuestion: string;
  audibleInterference?: boolean;
  eligible?: boolean;
}): SignalRepetitionEligibilityPlanV1 | null {
  if (
    args.eligible === false ||
    !boundedId(args.episodeId) ||
    !boundedId(args.sourceMessageId) ||
    !args.hostQuestion.trim().endsWith("?")
  ) return null;
  const friction = args.audibleInterference
    ? "audible_interference" as const
    : signalRepetitionFrictionReasonV1(args.hostQuestion);
  if (!friction) return null;
  const seed = `signal-repetition-plan-v1:${args.episodeId}:${args.sourceMessageId}`;
  if (stableUnit(`${seed}:eligibility`) >= 0.14) return null;
  return {
    reason: friction,
    repeatMode:
      stableUnit(`${seed}:mode`) < 0.5 ? "repeat" : "paraphrase",
  };
}

const SIGNAL_PARAPHRASE_ACKNOWLEDGEMENT_PREFIX =
  /^(?:of course|sure|yes|absolutely)[,!.]\s*/iu;

function signalParaphraseTermsV1(value: string): Set<string> {
  return new Set(
    value
      .normalize("NFKD")
      .toLocaleLowerCase("en-US")
      .replace(/\p{M}+/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/u)
      .filter((term) => term.length >= 3),
  );
}

/**
 * A paraphrase must change the shape of the public question, not merely add an
 * acknowledgement or a "let me rephrase" wrapper around the same words.
 * Semantic fidelity remains a prompt responsibility; this guard owns the
 * deterministic, observable non-duplication boundary.
 */
export function signalParaphraseMateriallyReframesV1(args: {
  sourceContent: string;
  candidateContent: string;
}): boolean {
  const source = args.sourceContent.replace(/\s+/gu, " ").trim();
  const candidate = args.candidateContent
    .replace(/\s+/gu, " ")
    .trim()
    .replace(SIGNAL_PARAPHRASE_ACKNOWLEDGEMENT_PREFIX, "")
    .trim();
  if (!source || !candidate.endsWith("?")) return false;

  const normalizedSource = [...signalParaphraseTermsV1(source)].join(" ");
  const normalizedCandidate = [...signalParaphraseTermsV1(candidate)].join(" ");
  if (
    !normalizedSource ||
    !normalizedCandidate ||
    normalizedSource === normalizedCandidate ||
    normalizedCandidate.includes(normalizedSource)
  ) {
    return false;
  }

  const sourceTerms = signalParaphraseTermsV1(source);
  const candidateTerms = signalParaphraseTermsV1(candidate);
  const sharedTermCount = [...sourceTerms].filter((term) =>
    candidateTerms.has(term),
  ).length;
  const novelTermCount = [...candidateTerms].filter(
    (term) => !sourceTerms.has(term),
  ).length;
  const sourceCoverage = sharedTermCount / sourceTerms.size;

  if (sourceTerms.size === 1) {
    return sharedTermCount === 0 && novelTermCount >= 1;
  }
  return sourceCoverage <= 0.72 && novelTermCount >= 1;
}

export function signalPendingRepetitionRepairV1(
  prior: readonly SignalConversationRepairEventV1[],
): SignalConversationRepairEventV1 | null {
  const bySequence = new Map<string, SignalConversationRepairEventV1>();
  for (const event of prior) {
    if (event.subtype === "repetition_clarification") {
      bySequence.set(event.sequenceId, event);
    }
  }
  const latest = [...bySequence.values()].at(-1) ?? null;
  return latest && latest.phase !== "resolved" ? latest : null;
}

const INCIDENT_CAPTIONS: Record<
  SignalStudioIncidentKindV1,
  { audible: boolean; caption: string }
> = {
  quiet_guest_start: {
    audible: true,
    caption: "*the guest's low mic comes up as the room leans closer*",
  },
  headphone_monitor_correction: {
    audible: true,
    caption: "*the headphone mix shifts, then settles*",
  },
  booth_object_mishap: {
    audible: true,
    caption: "*something harmless skitters in the booth*",
  },
  shared_laughter_derail: {
    audible: true,
    caption: "*the room breaks into laughter, then finds the thread again*",
  },
  host_loses_place_reset: {
    audible: true,
    caption: "*the host loses the line, breathes, and resets*",
  },
};

const INCIDENT_FOLEY_CUES = new Set<
  Extract<SignalStudioIncidentBeatV1, { kind: "foley" }>["cue"]
>([
  "chair_shift",
  "paper_shuffle",
  "glass_clink",
  "headphone_rustle",
  "shared_laughter",
]);
const INCIDENT_ACTIONS = new Set<
  Extract<SignalStudioIncidentBeatV1, { kind: "action" }>["action"]
>(["lean_in", "adjust_headphones", "reset_notes"]);

function normalizeIncidentProgress(value: unknown): number | null {
  const progress = Number(value);
  return Number.isFinite(progress) && progress >= 0 && progress <= 1
    ? Number(progress.toFixed(3))
    : null;
}

function normalizeSignalStudioIncidentBeatV1(
  value: unknown,
): SignalStudioIncidentBeatV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const atProgress = normalizeIncidentProgress(row.atProgress);
  if (atProgress === null) return null;
  if (row.kind === "gain") {
    const actorBotId = boundedId(row.actorBotId);
    const gain = Number(row.gain);
    const rampMs = Number(row.rampMs);
    const bus = row.bus === "primary" || row.bus === "monitor" ? row.bus : null;
    if (
      !actorBotId ||
      !bus ||
      !Number.isFinite(gain) ||
      gain < 0.2 ||
      gain > 1 ||
      !Number.isInteger(rampMs) ||
      rampMs < 0 ||
      rampMs > 2_000
    ) return null;
    return { kind: "gain", bus, actorBotId, atProgress, gain, rampMs };
  }
  if (row.kind === "foley") {
    const gain = Number(row.gain);
    if (
      !INCIDENT_FOLEY_CUES.has(
        row.cue as Extract<SignalStudioIncidentBeatV1, { kind: "foley" }>["cue"],
      ) ||
      !Number.isFinite(gain) ||
      gain <= 0 ||
      gain > 0.6
    ) return null;
    return {
      kind: "foley",
      cue: row.cue as Extract<
        SignalStudioIncidentBeatV1,
        { kind: "foley" }
      >["cue"],
      atProgress,
      gain: Number(gain.toFixed(3)),
    };
  }
  if (row.kind === "dialogue") {
    const actorBotId = boundedId(row.actorBotId);
    const text = boundedPublicText(row.text, 160);
    const speakerRole = row.speakerRole === "host" || row.speakerRole === "guest"
      ? row.speakerRole
      : null;
    if (!actorBotId || !text || !speakerRole) return null;
    return { kind: "dialogue", speakerRole, actorBotId, atProgress, text };
  }
  if (row.kind === "action") {
    const actorBotId = boundedId(row.actorBotId);
    if (
      !actorBotId ||
      !INCIDENT_ACTIONS.has(
        row.action as Extract<
          SignalStudioIncidentBeatV1,
          { kind: "action" }
        >["action"],
      )
    ) return null;
    return {
      kind: "action",
      actorBotId,
      atProgress,
      action: row.action as Extract<
        SignalStudioIncidentBeatV1,
        { kind: "action" }
      >["action"],
    };
  }
  if (row.kind === "pause") {
    const durationMs = Number(row.durationMs);
    if (
      !Number.isInteger(durationMs) ||
      durationMs < 120 ||
      durationMs > 3_000
    ) return null;
    return { kind: "pause", atProgress, durationMs };
  }
  return null;
}

export function normalizeSignalStudioIncidentEventV1(
  value: unknown,
): SignalStudioIncidentEventV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const incidentId = boundedId(row.incidentId);
  const sourceMessageId = boundedId(row.sourceMessageId);
  const actorBotId = boundedId(row.actorBotId);
  const kind = (SIGNAL_STUDIO_INCIDENT_KINDS as readonly unknown[]).includes(
      row.kind,
    )
    ? row.kind as SignalStudioIncidentKindV1
    : null;
  const turnOrdinal = Number(row.turnOrdinal);
  const startProgress = normalizeIncidentProgress(row.startProgress);
  const endProgress = normalizeIncidentProgress(row.endProgress);
  const beats = Array.isArray(row.beats)
    ? row.beats.map(normalizeSignalStudioIncidentBeatV1)
    : [];
  if (
    row.v !== SIGNAL_STUDIO_INCIDENT_VERSION ||
    row.name !== "signalStudioIncident" ||
    row.provenance !== "deterministic_studio_bank" ||
    row.canonicalImpact !== "none" ||
    !incidentId ||
    !kind ||
    !sourceMessageId ||
    !actorBotId ||
    !Number.isInteger(turnOrdinal) ||
    turnOrdinal < 1 ||
    row.audible !== INCIDENT_CAPTIONS[kind].audible ||
    row.caption !== INCIDENT_CAPTIONS[kind].caption ||
    startProgress === null ||
    endProgress === null ||
    endProgress <= startProgress ||
    beats.length < 1 ||
    beats.length > 8 ||
    beats.some((beat) => !beat) ||
    beats.some((beat) =>
      beat!.atProgress < startProgress || beat!.atProgress > endProgress
    ) ||
    (kind === "quiet_guest_start" &&
      (!beats.some(
        (beat) => beat?.kind === "gain" && beat.gain === 0.55,
      ) ||
        !beats.some(
          (beat) => beat?.kind === "gain" && beat.gain === 1,
        ))) ||
    (kind === "headphone_monitor_correction" &&
      !beats.some(
        (beat) => beat?.kind === "gain" && beat.bus === "monitor",
      )) ||
    (kind === "shared_laughter_derail" &&
      !beats.some(
        (beat) => beat?.kind === "foley" && beat.cue === "shared_laughter",
      )) ||
    (kind === "host_loses_place_reset" &&
      beats.filter((beat) => beat?.kind === "dialogue").length < 2)
  ) {
    return null;
  }
  return {
    v: SIGNAL_STUDIO_INCIDENT_VERSION,
    name: "signalStudioIncident",
    provenance: "deterministic_studio_bank",
    canonicalImpact: "none",
    incidentId,
    kind,
    sourceMessageId,
    actorBotId,
    turnOrdinal,
    audible: row.audible,
    caption: row.caption,
    startProgress,
    endProgress,
    beats: beats as SignalStudioIncidentBeatV1[],
  };
}

function signalStudioIncidentBeatsV1(args: {
  kind: SignalStudioIncidentKindV1;
  seed: string;
  actorBotId: string;
  hostBotId: string;
  guestBotId: string;
}): Pick<SignalStudioIncidentEventV1, "startProgress" | "endProgress" | "beats"> {
  if (args.kind === "quiet_guest_start") {
    const hostLeans = stableUnit(`${args.seed}:quiet-correction`) < 0.5;
    const hostLine = hostLeans
      ? "You're a little quiet—lean in toward the mic for me."
      : "Can we bring the guest microphone up a little?";
    return {
      startProgress: 0,
      endProgress: 0.5,
      beats: [
        {
          kind: "gain",
          bus: "primary",
          actorBotId: args.guestBotId,
          atProgress: 0,
          gain: 0.55,
          rampMs: 80,
        },
        ...(hostLeans
          ? [{
              kind: "action" as const,
              actorBotId: args.hostBotId,
              atProgress: 0.06,
              action: "lean_in" as const,
            }]
          : [{
              kind: "foley" as const,
              cue: "headphone_rustle" as const,
              atProgress: 0.08,
              gain: 0.09,
            }]),
        {
          kind: "dialogue",
          speakerRole: "host",
          actorBotId: args.hostBotId,
          atProgress: 0.13,
          text: hostLine,
        },
        {
          kind: "gain",
          bus: "primary",
          actorBotId: args.guestBotId,
          atProgress: 0.44,
          gain: 1,
          rampMs: 180,
        },
      ],
    };
  }
  if (args.kind === "headphone_monitor_correction") {
    return {
      startProgress: 0.2,
      endProgress: 0.52,
      beats: [
        {
          kind: "gain",
          bus: "monitor",
          actorBotId: args.actorBotId,
          atProgress: 0.2,
          gain: 0.72,
          rampMs: 90,
        },
        {
          kind: "action",
          actorBotId: args.actorBotId,
          atProgress: 0.24,
          action: "adjust_headphones",
        },
        {
          kind: "foley",
          cue: "headphone_rustle",
          atProgress: 0.25,
          gain: 0.09,
        },
        { kind: "pause", atProgress: 0.31, durationMs: 360 },
        {
          kind: "gain",
          bus: "monitor",
          actorBotId: args.actorBotId,
          atProgress: 0.5,
          gain: 1,
          rampMs: 140,
        },
      ],
    };
  }
  if (args.kind === "booth_object_mishap") {
    const cue = (["paper_shuffle", "glass_clink", "chair_shift"] as const)[
      Math.floor(stableUnit(`${args.seed}:booth-object`) * 3) % 3
    ]!;
    return {
      startProgress: 0.4,
      endProgress: 0.62,
      beats: [{ kind: "foley", cue, atProgress: 0.44, gain: 0.12 }],
    };
  }
  if (args.kind === "shared_laughter_derail") {
    return {
      startProgress: 0.32,
      endProgress: 0.76,
      beats: [
        {
          kind: "foley",
          cue: "shared_laughter",
          atProgress: 0.34,
          gain: 0.18,
        },
        { kind: "pause", atProgress: 0.43, durationMs: 720 },
        {
          kind: "dialogue",
          speakerRole: "host",
          actorBotId: args.hostBotId,
          atProgress: 0.62,
          text: "Okay—we completely lost the thread there.",
        },
        {
          kind: "dialogue",
          speakerRole: "guest",
          actorBotId: args.guestBotId,
          atProgress: 0.72,
          text: "We did. Back to it.",
        },
      ],
    };
  }
  return {
    startProgress: 0.28,
    endProgress: 0.72,
    beats: [
      {
        kind: "action",
        actorBotId: args.hostBotId,
        atProgress: 0.28,
        action: "reset_notes",
      },
      {
        kind: "dialogue",
        speakerRole: "host",
        actorBotId: args.hostBotId,
        atProgress: 0.32,
        text: "I lost my place for a second.",
      },
      { kind: "pause", atProgress: 0.44, durationMs: 560 },
      {
        kind: "dialogue",
        speakerRole: "host",
        actorBotId: args.hostBotId,
        atProgress: 0.62,
        text: "All right—back to it.",
      },
    ],
  };
}

/** Exactly one-in-six episodes are eligible; each show rotates incident kind. */
export function buildSignalStudioIncidentEventV1(args: {
  episodeId: string;
  showId: string;
  sourceMessageId: string;
  actorBotId: string;
  hostBotId?: string;
  guestBotId?: string;
  speakerRole?: "host" | "guest";
  turnOrdinal: number;
  alreadyOccurred: boolean;
  lastCoordinationTurnOrdinal?: number | null;
  recentShowKinds?: readonly SignalStudioIncidentKindV1[];
}): SignalStudioIncidentEventV1 | null {
  const targetTurn = 2 + Math.floor(
    stableUnit(`signal-studio-incident-turn:${args.episodeId}`) * 3,
  );
  if (
    args.alreadyOccurred ||
    args.turnOrdinal < targetTurn ||
    (typeof args.lastCoordinationTurnOrdinal === "number" &&
      args.turnOrdinal - args.lastCoordinationTurnOrdinal <
        SIGNAL_CONVERSATION_REPAIR_COOLDOWN_TURNS) ||
    Math.floor(stableUnit(`signal-studio-incident:${args.episodeId}`) * 6) !== 0
  ) {
    return null;
  }
  const hostBotId = boundedId(args.hostBotId) ?? args.actorBotId;
  const guestBotId = boundedId(args.guestBotId) ?? args.actorBotId;
  const recent = new Set(args.recentShowKinds ?? []);
  const applicable = SIGNAL_STUDIO_INCIDENT_KINDS.filter((kind) =>
    (kind !== "quiet_guest_start" ||
      (args.speakerRole === "guest" && args.turnOrdinal <= 3)) &&
    (kind !== "host_loses_place_reset" || args.speakerRole === "host")
  );
  const fresh = applicable.filter((kind) => !recent.has(kind));
  const choices = fresh.length > 0 ? fresh : applicable;
  if (choices.length === 0) return null;
  const kind = choices[
    Math.floor(
      stableUnit(`signal-studio-incident-kind:${args.showId}:${args.episodeId}`) *
        choices.length,
    ) % choices.length
  ]!;
  const timing = signalStudioIncidentBeatsV1({
    kind,
    seed: `signal-studio-incident:${args.episodeId}:${kind}`,
    actorBotId: args.actorBotId,
    hostBotId,
    guestBotId,
  });
  return {
    v: SIGNAL_STUDIO_INCIDENT_VERSION,
    name: "signalStudioIncident",
    provenance: "deterministic_studio_bank",
    canonicalImpact: "none",
    incidentId: `incident:${args.episodeId}:${kind}`,
    kind,
    sourceMessageId: args.sourceMessageId,
    actorBotId: args.actorBotId,
    turnOrdinal: args.turnOrdinal,
    ...INCIDENT_CAPTIONS[kind],
    ...timing,
  };
}
