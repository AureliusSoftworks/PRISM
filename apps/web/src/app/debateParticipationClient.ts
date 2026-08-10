import type {
  DebateFormalityId,
  DebateParticipantBallotInfluenceV1,
  DebateParticipantGambitRecordV1,
} from "@localai/shared";

export type DebateParticipationDifficulty =
  | "coach"
  | "standard"
  | "immersive";

export type DebateParticipantChoiceV1 = {
  id: string;
  label: string;
  content: string;
  evidenceSourceIds?: readonly string[];
};

export type DebateParticipationClientState = {
  difficulty?: DebateParticipationDifficulty;
  rhetoricalGambitsEnabled?: boolean;
  gambitRecords?: readonly DebateParticipantGambitRecordV1[];
  participantWindow?: {
    status?: "open" | "paused";
    announcedLimitMs?: number;
    wallLimitMs?: number;
    openedAt?: string;
    deadlineAt?: string;
    remainingMs?: number;
    overtimeMs?: number;
  } | null;
  choiceSet?: {
    choices?: readonly DebateParticipantChoiceV1[];
  } | null;
  choiceError?: string | null;
  favorability?: {
    total?: number;
    entries?: ReadonlyArray<{
      id?: string;
      eventId?: string;
      phase?: string;
      facets?: Record<string, number | undefined>;
      baseImpact?: number;
      phaseWeight?: number;
      delta?: number;
      reasons?: readonly string[];
      evidenceMultiplier?: 1 | 2;
      createdAt?: string;
    }>;
  } | null;
  rowdiness?: {
    patienceBudget?: number;
    patienceRemaining?: number;
    patienceBudgetMs?: number;
    patienceRemainingMs?: number;
    drainModifier?: number;
    outcomes?: ReadonlyArray<{
      eventId?: string;
      baseDrain?: number;
      appliedDrain?: number;
      patienceRemaining?: number;
      kind?:
        | "gavel"
        | "opponent_taunt"
        | "awkward_silence"
        | "recess_denial";
      action?: "tolerated" | "warned" | "interrupted";
      tauntGraceDeadlineAt?: string;
      createdAt?: string;
    }>;
  } | null;
  recess?: {
    used?: number;
    max?: number;
    denials?: number;
    rageRush?: {
      eventId?: string;
      triggeredAt?: string;
      denialCount?: number;
      ballotInfluence?: number;
    } | null;
  } | null;
  turns?: ReadonlyArray<{
    eventId?: string;
    phase?: string;
    opportunityIndex?: number;
    authoredMode?: "guided" | "custom" | "pass";
    choiceId?: string | null;
    choiceTier?: "great" | "okay" | "bad";
    announcedLimitMs?: number;
    wallLimitMs?: number;
    elapsedWallMs?: number;
    overtimeMs?: number;
    authoredCharacterCount?: number;
    heardCharacterCount?: number;
    cutoffReason?:
      | "length"
      | "irrelevant"
      | "absurd"
      | "unsupported_evidence"
      | null;
    facets?: Record<string, number | undefined>;
    baseImpact?: number;
    phaseWeight?: number;
    evidenceMultiplier?: 1 | 2;
    favorabilityDelta?: number;
    createdAt?: string;
  }>;
  finalJuryBallotInfluences?: ReadonlyArray<{
    sideId: "for" | "against";
    participantInfluence: DebateParticipantBallotInfluenceV1 | null;
  }>;
  juryLeaningPips?: readonly ("participant" | "opponent" | "neutral")[];
};

export type DebateParticipantFloorBreakClientState = {
  kind: "objection" | "interjection";
  status: "awaiting_response" | string;
  interruptedEventId: string;
  callEventId?: string | null;
  openedAt?: string;
  deadlineAt?: string;
  activatedAt?: string;
};

export const DEBATE_PARTICIPATION_DEFAULT_DIFFICULTY =
  "standard" as const satisfies DebateParticipationDifficulty;
export const DEBATE_PARTICIPATION_CLOCK_RATE = 1 / 8;
export const DEBATE_PARTICIPANT_FLOOR_BREAK_LIMIT_MS = 30_000;

export const DEBATE_ROWDINESS_PATIENCE_MS = {
  parliamentary: 15_000,
  structured: 22_000,
  plainspoken: 30_000,
  heated: 40_000,
  free_for_all: 50_000,
} as const satisfies Record<DebateFormalityId, number>;

export function debateParticipationState(
  session: unknown,
): DebateParticipationClientState | null {
  if (!session || typeof session !== "object") return null;
  const value = (session as { participation?: unknown }).participation;
  return value && typeof value === "object"
    ? (value as DebateParticipationClientState)
    : null;
}

export function debateParticipantFloorBreakState(
  session: unknown,
): DebateParticipantFloorBreakClientState | null {
  if (!session || typeof session !== "object") return null;
  const value = (session as { participantFloorBreak?: unknown })
    .participantFloorBreak;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DebateParticipantFloorBreakClientState>;
  return candidate.kind && candidate.status && candidate.interruptedEventId
    ? (candidate as DebateParticipantFloorBreakClientState)
    : null;
}

export function debateParticipationDifficulty(
  session: unknown,
): DebateParticipationDifficulty {
  const difficulty = debateParticipationState(session)?.difficulty;
  return difficulty === "coach" ||
    difficulty === "standard" ||
    difficulty === "immersive"
    ? difficulty
    : DEBATE_PARTICIPATION_DEFAULT_DIFFICULTY;
}

export function debateParticipationInputIsSlowed(session: unknown): boolean {
  const participation = debateParticipationState(session);
  const floorBreak = debateParticipantFloorBreakState(session);
  const status = (session as { status?: unknown } | null)?.status;
  if (floorBreak?.status === "awaiting_response") {
    return Boolean(floorBreak.activatedAt);
  }
  return (
    status === "waiting_for_player" &&
    participation?.participantWindow?.status === "open"
  );
}

export function debateParticipationClockRate(session: unknown): number {
  return debateParticipationInputIsSlowed(session)
    ? DEBATE_PARTICIPATION_CLOCK_RATE
    : 1;
}

export function debateParticipationDeadlineMs(
  session: unknown,
): number | null {
  const participation = debateParticipationState(session);
  const floorBreak = debateParticipantFloorBreakState(session);
  const deadline = floorBreak
    ? floorBreak.activatedAt
      ? floorBreak.deadlineAt
      : null
    : participation?.participantWindow?.deadlineAt;
  if (!deadline) return null;
  const value = Date.parse(deadline);
  return Number.isFinite(value) ? value : null;
}

export function debateParticipationPatience(args: {
  session: unknown;
  formality: DebateFormalityId;
}): {
  budgetMs: number;
  remainingMs: number;
  ratio: number;
  drainModifier: number;
} {
  const rowdiness = debateParticipationState(args.session)?.rowdiness;
  const budgetRaw =
    rowdiness?.patienceBudgetMs ??
    (rowdiness?.patienceBudget === undefined
      ? undefined
      : rowdiness.patienceBudget * 1_000);
  const remainingRaw =
    rowdiness?.patienceRemainingMs ??
    (rowdiness?.patienceRemaining === undefined
      ? undefined
      : rowdiness.patienceRemaining * 1_000);
  const fallback = DEBATE_ROWDINESS_PATIENCE_MS[args.formality];
  const parsedBudget = Number(budgetRaw);
  const budgetMs = Math.max(
    1,
    Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : fallback,
  );
  const parsedRemaining = Number(remainingRaw);
  const remainingMs = Math.min(
    budgetMs,
    Math.max(
      0,
      Number.isFinite(parsedRemaining) && remainingRaw !== undefined
        ? parsedRemaining
        : budgetMs,
    ),
  );
  const parsedModifier = Number(rowdiness?.drainModifier);
  const drainModifier =
    Number.isFinite(parsedModifier) && parsedModifier > 0 ? parsedModifier : 1;
  return {
    budgetMs,
    remainingMs,
    ratio: remainingMs / budgetMs,
    drainModifier,
  };
}

export function debateParticipationPatienceExpiryMs(args: {
  inputDeadlineMs: number;
  remainingMs: number;
  drainModifier: number;
}): number {
  const remainingMs = Math.max(0, Number(args.remainingMs) || 0);
  const parsedModifier = Number(args.drainModifier);
  const drainModifier =
    Number.isFinite(parsedModifier) && parsedModifier > 0 ? parsedModifier : 1;
  return args.inputDeadlineMs + remainingMs / drainModifier;
}

export function debateParticipantWindowExpirySchedule(args: {
  session: unknown;
  formality: DebateFormalityId;
}): { stage: "deadline" | "taunt_grace"; expiresAtMs: number } | null {
  const participation = debateParticipationState(args.session);
  const window = participation?.participantWindow;
  if (!window || window.status !== "open" || !window.deadlineAt) return null;
  const deadlineMs = Date.parse(window.deadlineAt);
  if (!Number.isFinite(deadlineMs)) return null;

  const latestOutcome = participation?.rowdiness?.outcomes?.at(-1);
  const graceDeadlineMs = latestOutcome?.tauntGraceDeadlineAt
    ? Date.parse(latestOutcome.tauntGraceDeadlineAt)
    : Number.NaN;
  const windowOpenedMs = window.openedAt
    ? Date.parse(window.openedAt)
    : Number.NaN;
  const outcomeCreatedMs = latestOutcome?.createdAt
    ? Date.parse(latestOutcome.createdAt)
    : Number.NaN;
  const activeTauntGrace =
    latestOutcome?.kind === "opponent_taunt" &&
    Number.isFinite(graceDeadlineMs) &&
    graceDeadlineMs === deadlineMs &&
    (!Number.isFinite(windowOpenedMs) ||
      !Number.isFinite(outcomeCreatedMs) ||
      outcomeCreatedMs >= windowOpenedMs);
  if (activeTauntGrace) {
    return { stage: "taunt_grace", expiresAtMs: graceDeadlineMs };
  }

  // Once the server has recorded overtime, deadlineAt is already the next
  // authoritative patience checkpoint. Initial windows still need their full
  // Rowdiness-driven patience allowance added after the speaking deadline.
  if ((window.overtimeMs ?? 0) > 0) {
    return { stage: "deadline", expiresAtMs: deadlineMs };
  }
  const patience = debateParticipationPatience(args);
  return {
    stage: "deadline",
    expiresAtMs: debateParticipationPatienceExpiryMs({
      inputDeadlineMs: deadlineMs,
      remainingMs: patience.remainingMs,
      drainModifier: patience.drainModifier,
    }),
  };
}

export function debateFavorabilityPosition(total: number | undefined): number {
  return (100 - Math.max(-100, Math.min(100, Number(total) || 0))) / 2;
}

export function debateFavorabilityLatestReason(session: unknown): string | null {
  const entry = debateParticipationState(session)?.favorability?.entries?.at(-1);
  const reasons = entry?.reasons?.filter((reason) => reason.trim());
  return reasons && reasons.length > 0 ? reasons.join(" · ") : null;
}

export function debateParticipantChoices(
  session: unknown,
): readonly DebateParticipantChoiceV1[] {
  const choices = debateParticipationState(session)?.choiceSet?.choices;
  if (!Array.isArray(choices)) return [];
  return choices.filter(
    (choice) =>
      choice &&
      typeof choice.id === "string" &&
      typeof choice.label === "string" &&
      typeof choice.content === "string",
  );
}

export type DebateParticipantTurnSubmission =
  | { choiceId: string; content?: never }
  | { choiceId?: never; content: string };

/**
 * Resolve the exact payload represented by the Participant producer console.
 * Keeping this shared between the button state and form submission prevents a
 * selected guided response from looking committable while posting a blank
 * custom response (or vice versa).
 */
export function debateParticipantTurnSubmission(args: {
  choices: readonly DebateParticipantChoiceV1[];
  selectedChoiceId: string | null;
  customComposerOpen: boolean;
  content: string;
}): DebateParticipantTurnSubmission | null {
  if (!args.customComposerOpen) {
    const selected = args.choices.find(
      (choice) => choice.id === args.selectedChoiceId,
    );
    if (selected) return { choiceId: selected.id };
  }
  const content = args.content.trim();
  return content ? { content } : null;
}

export function debateParticipantRecessState(session: unknown): {
  used: number;
  max: number;
  remaining: number;
  denials: number;
  denied: boolean;
  rageRush: boolean;
} {
  const recess = debateParticipationState(session)?.recess;
  const max = Math.max(1, Math.floor(Number(recess?.max) || 3));
  const used = Math.min(max, Math.max(0, Math.floor(Number(recess?.used) || 0)));
  const denials = Math.max(0, Math.floor(Number(recess?.denials) || 0));
  return {
    used,
    max,
    remaining: max - used,
    denials,
    denied: denials > 0 || used >= max,
    rageRush: Boolean(recess?.rageRush?.eventId),
  };
}

export function debateScaledElapsedMs(args: {
  accumulatedMs: number;
  runningSinceMs: number | null;
  nowMs: number;
  rate: number;
}): number {
  return (
    Math.max(0, args.accumulatedMs) +
    (args.runningSinceMs === null
      ? 0
      : Math.max(0, args.nowMs - args.runningSinceMs) *
        Math.max(0, args.rate))
  );
}
