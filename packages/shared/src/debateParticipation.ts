import type {
  DebateFormalityId,
  DebateParticipantChoiceGradeV1,
  DebateParticipantChoiceSetV1,
  DebateParticipantChoiceTier,
  DebateParticipantDifficulty,
  DebateParticipantFavorabilityEntryV1,
  DebateParticipantFavorabilityLedgerV1,
  DebateParticipantFavorabilityReason,
  DebateParticipantFloorBreakKind,
  DebateParticipantFloorBreakPreparationV1,
  DebateParticipantFloorBreakStateV1,
  DebateParticipantGambitChoiceV1,
  DebateParticipantGambitGradeV1,
  DebateParticipantGambitImpressionV1,
  DebateParticipantGambitKind,
  DebateParticipantGambitOfferV1,
  DebateParticipantGambitRecordV1,
  DebateParticipantGambitTier,
  DebateParticipantModeratorBiasOverrideV1,
  DebateParticipantProceduralMeritV1,
  DebateParticipantSocialReception,
  DebateParticipantSteeringFidelity,
  DebateParticipantTurnRecordV1,
  DebateParticipantWindowKind,
  DebateParticipantWindowV1,
  DebateParticipationStateV1,
  DebatePhase,
  DebateSideId,
  DebateStatus,
  DebateVoterPredispositionV1,
} from "./debate.js";

// Mirrored literals avoid a runtime debate.ts cycle; shared tests pin parity.
const DEBATE_PARTICIPATION_SCHEMA_VERSION = 1 as const;
const DEBATE_PARTICIPANT_TIME_SCALE = 8 as const;
const DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS = 30_000;
const DEBATE_PARTICIPANT_RECESS_MAX_USES = 3 as const;

const PARTICIPANT_ANNOUNCED_LIMIT_MS = {
  opening: 20_000,
  challenge: 12_000,
  rebuttal: 15_000,
  closing: 15_000,
  objection: DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS,
  interjection: DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS,
} as const satisfies Record<DebateParticipantWindowKind, number>;

const PARTICIPANT_PATIENCE_BY_FORMALITY = {
  free_for_all: 50,
  heated: 40,
  plainspoken: 30,
  structured: 22,
  parliamentary: 15,
} as const satisfies Record<DebateFormalityId, number>;

const PARTICIPANT_CHOICE_IMPACT = {
  great: 12,
  okay: 5,
  bad: -10,
} as const satisfies Record<DebateParticipantChoiceTier, number>;

export const DEBATE_PARTICIPANT_GAMBIT_POOL = [
  { kind: "ad_hominem", label: "Ad hominem", intent: "Attack their credibility" },
  { kind: "non_sequitur", label: "Non sequitur", intent: "Leap somewhere they cannot follow" },
  { kind: "straw_man", label: "Straw man", intent: "Replace their claim with an easier target" },
  { kind: "false_dilemma", label: "False dilemma", intent: "Force the room into only two choices" },
  { kind: "bandwagon", label: "Bandwagon", intent: "Make popularity feel like proof" },
  { kind: "appeal_to_authority", label: "Appeal to authority", intent: "Borrow certainty from a powerful name" },
  { kind: "slippery_slope", label: "Slippery slope", intent: "Turn one step into an alarming chain" },
  { kind: "red_herring", label: "Red herring", intent: "Redirect attention to friendlier ground" },
  { kind: "tu_quoque", label: "Tu quoque", intent: "Make their inconsistency the issue" },
  { kind: "appeal_to_emotion", label: "Appeal to emotion", intent: "Make feeling outrun the record" },
] as const satisfies ReadonlyArray<{
  kind: DebateParticipantGambitKind;
  label: string;
  intent: string;
}>;

const GAMBIT_EXECUTION_SCORE = {
  well_executed: 30,
  shaky: 0,
  exposed: -30,
} as const satisfies Record<DebateParticipantGambitTier, number>;

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maximum)
    : "";
}

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

export function debateParticipantGambitOfferV1(args: {
  sessionId: string;
  eventId: string;
  kind: DebateParticipantFloorBreakKind;
  createdAt?: string;
}): DebateParticipantGambitOfferV1 {
  const choices: DebateParticipantGambitChoiceV1[] = DEBATE_PARTICIPANT_GAMBIT_POOL
    .map((choice) => ({
      choice,
      order: stableUnit(`${args.sessionId}:${args.eventId}:${args.kind}:${choice.kind}`),
    }))
    .sort((left, right) => left.order - right.order)
    .slice(0, 3)
    .map(({ choice }) => ({
      id: `${args.eventId}:gambit:${choice.kind}`,
      kind: choice.kind,
      label: choice.label,
      intent: choice.intent,
    }));
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    eventId: args.eventId,
    kind: args.kind,
    choices,
    createdAt: validIso(args.createdAt) ?? new Date().toISOString(),
  };
}

/** Server-side callers persist these beside the public offer and redact them live. */
export function debateParticipantGambitGradesV1(args: {
  sessionId: string;
  offer: DebateParticipantGambitOfferV1;
}): DebateParticipantGambitGradeV1[] {
  const tiers: DebateParticipantGambitTier[] = [
    "well_executed",
    "shaky",
    "exposed",
  ];
  const offset = Math.floor(
    stableUnit(`${args.sessionId}:${args.offer.eventId}:gambit-grades`) * 3,
  );
  return args.offer.choices.map((choice, index) => ({
    choiceId: choice.id,
    tier: tiers[(index + offset) % tiers.length]!,
  }));
}

export function debateParticipantGambitSocialScore(args: {
  tier: DebateParticipantGambitTier;
  participantBias?: number;
  predispositionConfidence?: number;
  favorability?: number;
}): number {
  return Number(
    (
      GAMBIT_EXECUTION_SCORE[args.tier] +
      clamp(finiteNumber(args.participantBias), -1, 1) *
        clamp(finiteNumber(args.predispositionConfidence, 0.75), 0, 1) *
        35 +
      clamp(finiteNumber(args.favorability), -100, 100) * 0.1
    ).toFixed(3),
  );
}

export function debateParticipantGambitReception(
  socialScore: number,
): DebateParticipantSocialReception {
  return socialScore >= 15
    ? "receptive"
    : socialScore <= -15
      ? "hostile"
      : "uncertain";
}

export function debateParticipantModeratorBiasOverride(args: {
  seed: string;
  participantBias?: number;
  confidence?: number;
  proceduralRuling: "sustained" | "overruled" | "not_applicable";
}): DebateParticipantModeratorBiasOverrideV1 {
  const signedBias = clamp(finiteNumber(args.participantBias), -1, 1);
  const confidence = clamp(finiteNumber(args.confidence, 0), 0, 1);
  const pressure = Math.abs(signedBias * confidence);
  const chance = Number(
    (
      pressure < 0.6
        ? 0
        : 0.1 + clamp((pressure - 0.6) / 0.4, 0, 1) * 0.55
    ).toFixed(3),
  );
  const roll = Number(stableUnit(`${args.seed}:moderator-bias`).toFixed(3));
  const direction =
    signedBias > 0 ? "participant" : signedBias < 0 ? "opponent" : "none";
  const applied =
    args.proceduralRuling !== "not_applicable" &&
    direction !== "none" &&
    chance > 0 &&
    roll < chance;
  return {
    applied,
    direction,
    chance,
    roll,
    justification: applied
      ? direction === "participant"
        ? "The Moderator's frozen predisposition displaced the procedural baseline in the Participant's favor."
        : "The Moderator's frozen predisposition displaced the procedural baseline against the Participant."
      : null,
  };
}

export function debateParticipantGambitClarificationRequired(args: {
  seed: string;
  tier: DebateParticipantGambitTier;
  moderatorReception: DebateParticipantSocialReception;
}): boolean {
  return (
    args.tier === "shaky" &&
    args.moderatorReception === "uncertain" &&
    stableUnit(`${args.seed}:clarification`) < 0.5
  );
}

export function normalizeDebateParticipantDifficulty(
  value: unknown,
): DebateParticipantDifficulty {
  return value === "coach" || value === "immersive" ? value : "standard";
}

export function debateParticipantAnnouncedLimitMs(
  kind: DebateParticipantWindowKind,
): number {
  return PARTICIPANT_ANNOUNCED_LIMIT_MS[kind];
}

export function createDebateParticipantWindowV1(args: {
  kind: DebateParticipantWindowKind;
  openedAt?: string;
}): DebateParticipantWindowV1 {
  const openedAt = validIso(args.openedAt) ?? new Date().toISOString();
  const announcedLimitMs = debateParticipantAnnouncedLimitMs(args.kind);
  const wallLimitMs =
    args.kind === "objection" || args.kind === "interjection"
      ? DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS
      : announcedLimitMs * DEBATE_PARTICIPANT_TIME_SCALE;
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    kind: args.kind,
    status: "open",
    announcedLimitMs,
    wallLimitMs,
    timeScale: DEBATE_PARTICIPANT_TIME_SCALE,
    openedAt,
    deadlineAt: new Date(Date.parse(openedAt) + wallLimitMs).toISOString(),
    elapsedWallMs: 0,
    overtimeMs: 0,
  };
}

export function normalizeDebateParticipantWindowV1(
  value: unknown,
): DebateParticipantWindowV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = row.kind;
  if (
    kind !== "opening" &&
    kind !== "challenge" &&
    kind !== "rebuttal" &&
    kind !== "closing" &&
    kind !== "objection" &&
    kind !== "interjection"
  ) {
    return null;
  }
  const openedAt = validIso(row.openedAt);
  const deadlineAt = validIso(row.deadlineAt);
  if (!openedAt || !deadlineAt) return null;
  const canonical = createDebateParticipantWindowV1({ kind, openedAt });
  const remainingMs = clamp(Math.floor(finiteNumber(row.remainingMs)), 0, canonical.wallLimitMs);
  return {
    ...canonical,
    status: row.status === "paused" ? "paused" : "open",
    deadlineAt,
    elapsedWallMs: clamp(
      finiteNumber(row.elapsedWallMs),
      0,
      canonical.wallLimitMs * 4,
    ),
    overtimeMs: Math.max(0, finiteNumber(row.overtimeMs)),
    ...(row.status === "paused" ? { remainingMs } : {}),
  };
}

export function debateParticipantPatienceBudget(
  formality: DebateFormalityId,
): number {
  return PARTICIPANT_PATIENCE_BY_FORMALITY[formality];
}

/** Favorable personas drain 25% slower; hostile personas drain 25% faster. */
export function debateParticipantPatienceDrain(args: {
  baseDrain: number;
  participantBias?: number;
  moderatorModifier?: number;
}): number {
  if (typeof args.moderatorModifier === "number" && Number.isFinite(args.moderatorModifier)) {
    return Math.max(0, args.baseDrain * clamp(args.moderatorModifier, 0.75, 1.25));
  }
  const bias = clamp(finiteNumber(args.participantBias), -1, 1);
  return Math.max(0, args.baseDrain * (1 - bias * 0.25));
}

export function debateParticipantPatienceOutcome(args: {
  patienceRemaining: number;
  patienceBudget: number;
  baseDrain: number;
  participantBias?: number;
  moderatorModifier?: number;
  kind?: "gavel" | "opponent_taunt" | "awkward_silence";
  createdAt?: string;
}): {
  appliedDrain: number;
  patienceRemaining: number;
  action: "tolerated" | "warned" | "interrupted";
  drainModifier: number;
  kind: "gavel" | "opponent_taunt" | "awkward_silence";
  tauntGraceDeadlineAt?: string;
} {
  const appliedDrain = debateParticipantPatienceDrain(args);
  const patienceRemaining = clamp(
    args.patienceRemaining - appliedDrain,
    0,
    args.patienceBudget,
  );
  const ratio =
    args.patienceBudget > 0 ? patienceRemaining / args.patienceBudget : 0;
  const kind = args.kind ??
    (patienceRemaining <= 0
      ? "gavel"
      : ratio <= 0.3
        ? "opponent_taunt"
        : "awkward_silence");
  const createdAt = validIso(args.createdAt) ?? new Date().toISOString();
  return {
    appliedDrain,
    patienceRemaining,
    action:
      patienceRemaining <= 0
        ? "interrupted"
        : ratio <= 0.3
          ? "warned"
          : "tolerated",
    drainModifier: args.baseDrain > 0 ? appliedDrain / args.baseDrain : 1,
    kind,
    ...(kind === "opponent_taunt"
      ? {
          tauntGraceDeadlineAt: new Date(
            Date.parse(createdAt) + 10_000,
          ).toISOString(),
        }
      : {}),
  };
}

/**
 * Repeated requests after the last recess consume the same persisted reserve
 * that supplies future Participant overtime. The escalating base drain makes
 * the consequence legible without letting a single accidental click end play.
 */
export function debateParticipantRecessDenialPatience(args: {
  patienceRemaining: number;
  patienceBudget: number;
  priorDenials: number;
  moderatorModifier?: number;
}): {
  baseDrain: number;
  appliedDrain: number;
  patienceRemaining: number;
  drainModifier: number;
  action: "warned" | "interrupted";
  exhausted: boolean;
} {
  const baseDrain = Math.min(
    24,
    8 + Math.max(0, Math.floor(finiteNumber(args.priorDenials))) * 4,
  );
  const appliedDrain = debateParticipantPatienceDrain({
    baseDrain,
    moderatorModifier: args.moderatorModifier,
  });
  const patienceRemaining = clamp(
    finiteNumber(args.patienceRemaining) - appliedDrain,
    0,
    Math.max(0, finiteNumber(args.patienceBudget)),
  );
  return {
    baseDrain,
    appliedDrain,
    patienceRemaining,
    drainModifier: baseDrain > 0 ? appliedDrain / baseDrain : 1,
    action: patienceRemaining <= 0 ? "interrupted" : "warned",
    exhausted: patienceRemaining <= 0,
  };
}

export function normalizeDebateParticipantChoiceSetV1(
  value: unknown,
): DebateParticipantChoiceSetV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.phase !== "opening" &&
    row.phase !== "challenge" &&
    row.phase !== "rebuttal" &&
    row.phase !== "closing"
  ) {
    return null;
  }
  const createdAt = validIso(row.createdAt);
  if (!createdAt || !Array.isArray(row.choices)) return null;
  const seen = new Set<string>();
  const choices = row.choices.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const choice = value as Record<string, unknown>;
    const id = text(choice.id, 120);
    const content = text(choice.content, 4_000);
    if (!id || seen.has(id) || !content) return [];
    seen.add(id);
    return [{
      id,
      label: text(choice.label, 80) || "Answer",
      content,
      evidenceSourceIds: Array.isArray(choice.evidenceSourceIds)
        ? [...new Set(choice.evidenceSourceIds.map((id) => text(id, 48)).filter(Boolean))]
        : [],
    }];
  }).slice(0, 3);
  if (choices.length === 0) return null;
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    phase: row.phase,
    promptEventId: text(row.promptEventId, 160) || null,
    choices,
    createdAt,
  };
}

export function normalizeDebateParticipantChoiceGradesV1(
  value: unknown,
  choiceSet: DebateParticipantChoiceSetV1 | null,
): DebateParticipantChoiceGradeV1[] {
  if (!choiceSet || !Array.isArray(value)) return [];
  const choiceIds = new Set(choiceSet.choices.map((choice) => choice.id));
  return value.flatMap((entry): DebateParticipantChoiceGradeV1[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const choiceId = text(row.choiceId, 120);
    const tier = row.tier;
    if (
      !choiceIds.has(choiceId) ||
      (tier !== "great" && tier !== "okay" && tier !== "bad")
    ) return [];
    return [{
      choiceId,
      tier,
      baseImpact: PARTICIPANT_CHOICE_IMPACT[tier],
      evidenceIntegrated: row.evidenceIntegrated === true,
    }];
  });
}

function normalizeGambitTier(value: unknown): DebateParticipantGambitTier | null {
  return value === "well_executed" || value === "shaky" || value === "exposed"
    ? value
    : null;
}

function normalizeSteeringFidelity(
  value: unknown,
): DebateParticipantSteeringFidelity | undefined {
  return value === "verbatim" ||
    value === "near_verbatim" ||
    value === "steered" ||
    value === "confused"
    ? value
    : undefined;
}

function normalizeSocialReception(
  value: unknown,
): DebateParticipantSocialReception | undefined {
  return value === "receptive" || value === "uncertain" || value === "hostile"
    ? value
    : undefined;
}

export function normalizeDebateParticipantGambitOfferV1(
  value: unknown,
): DebateParticipantGambitOfferV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const eventId = text(row.eventId, 160);
  const createdAt = validIso(row.createdAt);
  const kind = row.kind;
  if (
    !eventId ||
    !createdAt ||
    (kind !== "objection" && kind !== "interjection") ||
    !Array.isArray(row.choices)
  ) return null;
  const seen = new Set<DebateParticipantGambitKind>();
  const choices = row.choices.flatMap((entry): DebateParticipantGambitChoiceV1[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const definition = DEBATE_PARTICIPANT_GAMBIT_POOL.find(
      (item) => item.kind === candidate.kind,
    );
    const id = text(candidate.id, 200);
    if (!definition || !id || seen.has(definition.kind)) return [];
    seen.add(definition.kind);
    return [{
      id,
      kind: definition.kind,
      label: definition.label,
      intent: definition.intent,
    }];
  });
  if (choices.length !== 3) return null;
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    eventId,
    kind,
    choices,
    createdAt,
  };
}

export function normalizeDebateParticipantGambitGradesV1(
  value: unknown,
  offer: DebateParticipantGambitOfferV1 | null,
): DebateParticipantGambitGradeV1[] {
  if (!offer || !Array.isArray(value)) return [];
  const choiceIds = new Set(offer.choices.map((choice) => choice.id));
  const seenChoices = new Set<string>();
  const seenTiers = new Set<DebateParticipantGambitTier>();
  const grades = value.flatMap((entry): DebateParticipantGambitGradeV1[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const choiceId = text(row.choiceId, 200);
    const tier = normalizeGambitTier(row.tier);
    if (
      !choiceIds.has(choiceId) ||
      !tier ||
      seenChoices.has(choiceId) ||
      seenTiers.has(tier)
    ) return [];
    seenChoices.add(choiceId);
    seenTiers.add(tier);
    return [{ choiceId, tier }];
  });
  return grades.length === 3 ? grades : [];
}

function normalizeGambitImpressions(
  value: unknown,
): DebateParticipantGambitImpressionV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const impressions = value.flatMap((entry): DebateParticipantGambitImpressionV1[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const botId = text(row.botId, 160);
    const role = row.role;
    const reception = normalizeSocialReception(row.reception);
    if (
      !botId ||
      !reception ||
      (role !== "moderator" && role !== "opponent" && role !== "juror")
    ) return [];
    return [{
      botId,
      role,
      socialScore: clamp(finiteNumber(row.socialScore), -100, 100),
      reception,
      ballotAdjustment: role === "juror"
        ? clamp(finiteNumber(row.ballotAdjustment), -12, 12)
        : 0,
    }];
  }).slice(0, 7);
  return impressions.length > 0 ? impressions : undefined;
}

function normalizeProceduralMerit(
  value: unknown,
): DebateParticipantProceduralMeritV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const ruling = row.ruling;
  if (
    ruling !== "sustained" &&
    ruling !== "overruled" &&
    ruling !== "not_applicable"
  ) return undefined;
  return {
    ruling,
    confidence: clamp(finiteNumber(row.confidence), 0, 1),
    rationale: text(row.rationale, 800),
  };
}

function normalizeModeratorBiasOverride(
  value: unknown,
): DebateParticipantModeratorBiasOverrideV1 | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const direction = row.direction;
  if (direction !== "participant" && direction !== "opponent" && direction !== "none") {
    return undefined;
  }
  return {
    applied: row.applied === true,
    direction,
    chance: clamp(finiteNumber(row.chance), 0, 0.65),
    roll: clamp(finiteNumber(row.roll), 0, 1),
    justification: text(row.justification, 800) || null,
  };
}

export function normalizeDebateParticipantFloorBreakPreparationV1(
  value: unknown,
): DebateParticipantFloorBreakPreparationV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id, 160);
  const interruptedEventId = text(row.interruptedEventId, 160);
  const callEventId = text(row.callEventId, 160);
  const responseEventId = text(row.responseEventId, 160);
  const reactionEventId = text(row.reactionEventId, 160);
  const createdAt = validIso(row.createdAt);
  const expiresAt = validIso(row.expiresAt);
  const kind = row.kind;
  const selectionMode = row.selectionMode;
  const performedText = text(row.performedText, 4_000) || null;
  const status = row.status === "drafting" ? "drafting" : "ready";
  if (
    !id ||
    !interruptedEventId ||
    !callEventId ||
    !responseEventId ||
    !reactionEventId ||
    !createdAt ||
    !expiresAt ||
    (status === "ready" && !performedText) ||
    (kind !== "objection" && kind !== "interjection") ||
    (selectionMode !== "gambit" && selectionMode !== "steering")
  ) return null;
  const selectedGambitId = text(row.selectedGambitId, 200) || null;
  const gambitTier = normalizeGambitTier(row.gambitTier);
  const steeringFidelity = normalizeSteeringFidelity(row.steeringFidelity);
  const roomReception = normalizeSocialReception(row.roomReception);
  const impressions = normalizeGambitImpressions(row.impressions);
  const proceduralMerit = normalizeProceduralMerit(row.proceduralMerit);
  const moderatorBiasOverride = normalizeModeratorBiasOverride(row.moderatorBiasOverride);
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    id,
    status,
    kind,
    interruptedEventId,
    initialHeardCharacterCount: Math.max(0, Math.floor(finiteNumber(row.initialHeardCharacterCount))),
    selectionMode,
    selectedGambitId,
    selectedEvidenceSourceIds: Array.isArray(row.selectedEvidenceSourceIds)
      ? [...new Set(row.selectedEvidenceSourceIds.map((sourceId) => text(sourceId, 64)).filter(Boolean))].slice(0, 3)
      : [],
    fixedCall: kind === "objection" ? "Objection!" : "Hold on—",
    callEventId,
    responseEventId,
    reactionEventId,
    counterEventId: text(row.counterEventId, 160) || null,
    rulingEventId: text(row.rulingEventId, 160) || null,
    continuationEventId: text(row.continuationEventId, 160) || null,
    performedText,
    counterText: text(row.counterText, 2_000) || null,
    rulingText: text(row.rulingText, 2_000) || null,
    continuationText: text(row.continuationText, 4_000) || null,
    roomReaction:
      row.roomReaction && typeof row.roomReaction === "object" && !Array.isArray(row.roomReaction)
        ? {
            kind:
              (row.roomReaction as Record<string, unknown>).kind === "laugh" ||
              (row.roomReaction as Record<string, unknown>).kind === "gasp" ||
              (row.roomReaction as Record<string, unknown>).kind === "impressed"
                ? (row.roomReaction as { kind: "laugh" | "gasp" | "impressed" }).kind
                : "none",
            intensity: clamp(
              Math.round(finiteNumber((row.roomReaction as Record<string, unknown>).intensity)),
              0,
              3,
            ) as 0 | 1 | 2 | 3,
            source: "director",
          }
        : { kind: "none", intensity: 0, source: "fallback" },
    createdAt,
    expiresAt,
    ...(text(row.producerCue, 4_000) ? { producerCue: text(row.producerCue, 4_000) } : {}),
    ...(steeringFidelity ? { steeringFidelity } : {}),
    ...(gambitTier ? { gambitTier } : {}),
    ...(row.evidenceIntegrated === true ? { evidenceIntegrated: true } : {}),
    ...(row.evidenceMisused === true ? { evidenceMisused: true } : {}),
    ...(impressions ? { impressions } : {}),
    ...(roomReception ? { roomReception } : {}),
    ...(Number.isFinite(row.favorabilityDelta)
      ? { favorabilityDelta: clamp(Math.round(finiteNumber(row.favorabilityDelta)), -30, 30) }
      : {}),
    ...(proceduralMerit ? { proceduralMerit } : {}),
    ...(moderatorBiasOverride ? { moderatorBiasOverride } : {}),
    ...(row.clarificationRequired === true ? { clarificationRequired: true } : {}),
  };
}

function normalizeGambitRecords(value: unknown): DebateParticipantGambitRecordV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DebateParticipantGambitRecordV1[] => {
    const preparation = normalizeDebateParticipantFloorBreakPreparationV1(entry);
    if (
      !preparation ||
      preparation.status !== "ready" ||
      !preparation.performedText ||
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) return [];
    const row = entry as Record<string, unknown>;
    const committedAt = validIso(row.committedAt);
    if (!committedAt) return [];
    const { status: _status, ...record } = preparation;
    return [{
      ...record,
      finalHeardCharacterCount: Math.max(
        preparation.initialHeardCharacterCount,
        Math.floor(finiteNumber(row.finalHeardCharacterCount)),
      ),
      committedAt,
    }];
  }).slice(-32);
}

export function debateParticipantPhaseWeight(opportunityIndex: number): number {
  return Math.max(0.25, 0.72 ** Math.max(0, Math.floor(opportunityIndex)));
}

export function debateParticipantFavorabilityDelta(args: {
  tier?: DebateParticipantChoiceTier;
  baseImpact?: number;
  phase: Exclude<DebatePhase, "verdict"> | "procedural";
  opportunityIndex?: number;
  evidenceUsed?: boolean;
}): { delta: number; evidenceMultiplier: 1 | 2 } {
  const base = args.tier
    ? PARTICIPANT_CHOICE_IMPACT[args.tier]
    : clamp(finiteNumber(args.baseImpact), -20, 20);
  const evidenceMultiplier = args.evidenceUsed === true ? 2 : 1;
  return {
    delta: clamp(
      Math.round(
        base *
          debateParticipantPhaseWeight(args.opportunityIndex ?? 0) *
          evidenceMultiplier,
      ),
      -30,
      30,
    ),
    evidenceMultiplier,
  };
}

export function debateParticipantFacetBaseImpact(
  facets: Partial<
    Record<
      | "argumentStrength"
      | "humor"
      | "confidence"
      | "opponentPressure"
      | "subjectKnowledge",
      number
    >
  >,
): number {
  return clamp(
    clamp(finiteNumber(facets.argumentStrength), -1, 1) * 4 +
      clamp(finiteNumber(facets.humor), -1, 1) * 4 +
      clamp(finiteNumber(facets.confidence), -1, 1) * 4 +
      clamp(finiteNumber(facets.opponentPressure), -1, 1) * 4 +
      clamp(finiteNumber(facets.subjectKnowledge), -1, 1) * 4,
    -20,
    20,
  );
}

export function appendDebateParticipantFavorability(
  ledger: DebateParticipantFavorabilityLedgerV1,
  entry: DebateParticipantFavorabilityEntryV1,
): DebateParticipantFavorabilityLedgerV1 {
  const normalizedEntry = { ...entry, delta: clamp(Math.round(entry.delta), -30, 30) };
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    total: clamp(ledger.total + normalizedEntry.delta, -100, 100),
    entries: [...ledger.entries, normalizedEntry].slice(-64),
  };
}

export function debateVoterPredispositionFromSeed(
  voterBotId: string,
): DebateVoterPredispositionV1 {
  let hash = 2166136261;
  for (const character of voterBotId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 0xffffffff;
  // Recovery only: keep an opaque deterministic seed mild and low-confidence.
  // Rich predispositions should be generated from the frozen public persona.
  const participantBias = Number(((unit * 0.3) - 0.15).toFixed(3));
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    voterBotId,
    direction:
      participantBias > 0.05
        ? "participant"
        : participantBias < -0.05
          ? "opponent"
          : "neutral",
    strength: Number(Math.abs(participantBias).toFixed(3)),
    confidence: Number((0.22 + unit * 0.18).toFixed(3)),
    rationale:
      "Low-confidence recovery estimate; the public Debate record remains decisive.",
    participantBias,
  };
}

/** Exact deterministic Participant ballot seam on a signed -100..100 record. */
export function debateParticipantBallotScore(args: {
  baseScore: number;
  participantBias: number;
  predispositionConfidence?: number;
  favorability: number;
}): { score: number; favorabilityInfluence: number; predispositionInfluence: number } {
  const favorabilityInfluence = clamp(args.favorability * 0.2, -20, 20);
  const predispositionCap =
    clamp(finiteNumber(args.predispositionConfidence, 1), 0, 1) < 0.5
      ? 10
      : 40;
  const predispositionInfluence = clamp(
    args.participantBias * 40,
    -predispositionCap,
    predispositionCap,
  );
  return {
    score: clamp(
      args.baseScore + favorabilityInfluence + predispositionInfluence,
      -100,
      100,
    ),
    favorabilityInfluence,
    predispositionInfluence,
  };
}

export function debateParticipantBallotSide(args: {
  baseScore: number;
  participantBias: number;
  predispositionConfidence?: number;
  favorability: number;
  participantSideId: DebateSideId;
  baseSideId: DebateSideId;
}): DebateSideId {
  const adjusted = debateParticipantBallotScore(args).score;
  if (Math.abs(adjusted) < 0.0001) return args.baseSideId;
  return adjusted > 0
    ? args.participantSideId
    : args.participantSideId === "for" ? "against" : "for";
}

/** -1 favorability per complete five wall seconds, capped at -12. */
export function debateParticipantOvertimeFavorabilityDelta(
  overtimeWallMs: number,
): number {
  const units = Math.min(12, Math.floor(Math.max(0, overtimeWallMs) / 5_000));
  return units === 0 ? 0 : -units;
}

export function defaultDebateParticipationStateV1(
  formality: DebateFormalityId,
  difficulty: DebateParticipantDifficulty = "standard",
  rhetoricalGambitsEnabled = false,
): DebateParticipationStateV1 {
  const patienceBudget = debateParticipantPatienceBudget(formality);
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    difficulty: normalizeDebateParticipantDifficulty(difficulty),
    participantWindow: null,
    choiceSet: null,
    rhetoricalGambitsEnabled,
    gambitOffer: null,
    gambitRecords: [],
    moderatorConductAdjustment: 0,
    favorability: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      total: 0,
      entries: [],
    },
    rowdiness: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      patienceBudget,
      patienceRemaining: patienceBudget,
      drainModifier: 1,
      moderatorDisposition: {
        temperament: "balanced",
        drainModifier: 1,
        confidence: 0.35,
        rationale: "No strong public Persona patience signal was available.",
      },
      outcomes: [],
    },
    recess: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      used: 0,
      max: DEBATE_PARTICIPANT_RECESS_MAX_USES,
      denials: 0,
    },
    turns: [],
  };
}

export function normalizeDebateParticipationStateV1(
  value: unknown,
  formality: DebateFormalityId,
): DebateParticipationStateV1 {
  const fallback = defaultDebateParticipationStateV1(formality);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const row = value as Record<string, unknown>;
  const choiceSet = normalizeDebateParticipantChoiceSetV1(row.choiceSet);
  const gambitOffer = normalizeDebateParticipantGambitOfferV1(row.gambitOffer);
  const gambitGrades = normalizeDebateParticipantGambitGradesV1(
    row.gambitGrades,
    gambitOffer,
  );
  const ledgerRow = row.favorability && typeof row.favorability === "object" && !Array.isArray(row.favorability)
    ? row.favorability as Record<string, unknown>
    : {};
  const entries = Array.isArray(ledgerRow.entries)
    ? ledgerRow.entries.flatMap((entry): DebateParticipantFavorabilityEntryV1[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const candidate = entry as Record<string, unknown>;
        const phase = candidate.phase;
        if (phase !== "opening" && phase !== "challenge" && phase !== "rebuttal" && phase !== "closing" && phase !== "procedural") return [];
        const reasons = Array.isArray(candidate.reasons)
          ? candidate.reasons.filter((reason): reason is DebateParticipantFavorabilityReason =>
              typeof reason === "string" && [
                "argument_strength", "humor", "confidence", "opponent_pressure",
                "subject_knowledge", "evidence_use", "irrelevant", "absurd",
                "unsupported_evidence", "overtime", "recess_denied",
                "floor_break_timeout", "rhetorical_gambit",
                "moderator_bias_callout", "clarification_failure",
                "rage_rush",
              ].includes(reason))
          : [];
        const createdAt = validIso(candidate.createdAt);
        const id = text(candidate.id, 160);
        if (!createdAt || !id) return [];
        return [{
          id,
          eventId: text(candidate.eventId, 160) || null,
          phase,
          facets:
            candidate.facets &&
            typeof candidate.facets === "object" &&
            !Array.isArray(candidate.facets)
              ? Object.fromEntries(
                  Object.entries(candidate.facets as Record<string, unknown>)
                    .filter(([key]) =>
                      [
                        "argumentStrength",
                        "humor",
                        "confidence",
                        "opponentPressure",
                        "subjectKnowledge",
                      ].includes(key),
                    )
                    .map(([key, value]) => [
                      key,
                      clamp(finiteNumber(value), -1, 1),
                    ]),
                )
              : {},
          baseImpact: clamp(finiteNumber(candidate.baseImpact), -20, 20),
          phaseWeight: clamp(
            finiteNumber(candidate.phaseWeight, 1),
            0,
            1,
          ),
          delta: clamp(Math.round(finiteNumber(candidate.delta)), -30, 30),
          reasons,
          evidenceMultiplier: candidate.evidenceMultiplier === 2 ? 2 : 1,
          createdAt,
        }];
      }).slice(-64)
    : [];
  const rowdiness = row.rowdiness && typeof row.rowdiness === "object" && !Array.isArray(row.rowdiness)
    ? row.rowdiness as Record<string, unknown>
    : {};
  const moderatorDisposition =
    rowdiness.moderatorDisposition &&
    typeof rowdiness.moderatorDisposition === "object" &&
    !Array.isArray(rowdiness.moderatorDisposition)
      ? rowdiness.moderatorDisposition as Record<string, unknown>
      : {};
  const recess = row.recess && typeof row.recess === "object" && !Array.isArray(row.recess)
    ? row.recess as Record<string, unknown>
    : {};
  const recessCheckpoint =
    recess.checkpoint &&
    typeof recess.checkpoint === "object" &&
    !Array.isArray(recess.checkpoint)
      ? (recess.checkpoint as Record<string, unknown>)
      : null;
  const turns = Array.isArray(row.turns)
    ? row.turns.flatMap((entry): DebateParticipantTurnRecordV1[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const candidate = entry as Record<string, unknown>;
        const eventId = text(candidate.eventId, 160);
        const createdAt = validIso(candidate.createdAt);
        const phase = candidate.phase;
        const authoredMode = candidate.authoredMode;
        const cutoffReason = candidate.cutoffReason;
        if (
          !eventId ||
          !createdAt ||
          (phase !== "opening" && phase !== "challenge" && phase !== "rebuttal" && phase !== "closing") ||
          (authoredMode !== "guided" && authoredMode !== "custom" && authoredMode !== "pass") ||
          (cutoffReason !== null &&
            cutoffReason !== "length" &&
            cutoffReason !== "irrelevant" &&
            cutoffReason !== "absurd" &&
            cutoffReason !== "unsupported_evidence")
        ) return [];
        const choiceTier = candidate.choiceTier;
        const facets = candidate.facets && typeof candidate.facets === "object" && !Array.isArray(candidate.facets)
          ? Object.fromEntries(
              Object.entries(candidate.facets as Record<string, unknown>)
                .filter(([key]) => [
                  "argumentStrength",
                  "humor",
                  "confidence",
                  "opponentPressure",
                  "subjectKnowledge",
                ].includes(key))
                .map(([key, value]) => [key, clamp(finiteNumber(value), -1, 1)]),
            )
          : {};
        return [{
          eventId,
          phase,
          opportunityIndex: Math.max(0, Math.floor(finiteNumber(candidate.opportunityIndex))),
          authoredMode,
          choiceId: text(candidate.choiceId, 120) || null,
          ...(choiceTier === "great" || choiceTier === "okay" || choiceTier === "bad"
            ? { choiceTier }
            : {}),
          announcedLimitMs: Math.max(0, Math.floor(finiteNumber(candidate.announcedLimitMs))),
          wallLimitMs: Math.max(0, Math.floor(finiteNumber(candidate.wallLimitMs))),
          elapsedWallMs: Math.max(0, Math.floor(finiteNumber(candidate.elapsedWallMs))),
          overtimeMs: Math.max(0, Math.floor(finiteNumber(candidate.overtimeMs))),
          authoredCharacterCount: Math.max(0, Math.floor(finiteNumber(candidate.authoredCharacterCount))),
          heardCharacterCount: Math.max(0, Math.floor(finiteNumber(candidate.heardCharacterCount))),
          cutoffReason,
          facets,
          baseImpact: clamp(finiteNumber(candidate.baseImpact), -20, 20),
          phaseWeight: clamp(finiteNumber(candidate.phaseWeight, 1), 0.25, 1),
          evidenceMultiplier: candidate.evidenceMultiplier === 2 ? 2 : 1,
          favorabilityDelta: clamp(Math.round(finiteNumber(candidate.favorabilityDelta)), -30, 30),
          createdAt,
        }];
      }).slice(-64)
    : [];
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    difficulty: normalizeDebateParticipantDifficulty(row.difficulty),
    participantWindow: normalizeDebateParticipantWindowV1(row.participantWindow),
    choiceSet,
    rhetoricalGambitsEnabled: row.rhetoricalGambitsEnabled === true,
    gambitOffer,
    ...(gambitGrades.length === 3 ? { gambitGrades } : {}),
    gambitRecords: normalizeGambitRecords(row.gambitRecords),
    moderatorConductAdjustment: clamp(
      finiteNumber(row.moderatorConductAdjustment),
      -1,
      1,
    ),
    ...(text(row.choiceError, 240) ? { choiceError: text(row.choiceError, 240) } : {}),
    ...(normalizeDebateParticipantChoiceGradesV1(row.choiceGrades, choiceSet).length > 0
      ? { choiceGrades: normalizeDebateParticipantChoiceGradesV1(row.choiceGrades, choiceSet) }
      : {}),
    favorability: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      total: clamp(entries.reduce((total, entry) => total + entry.delta, 0), -100, 100),
      entries,
    },
    rowdiness: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      patienceBudget: fallback.rowdiness.patienceBudget,
      patienceRemaining: clamp(
        finiteNumber(rowdiness.patienceRemaining, fallback.rowdiness.patienceBudget),
        0,
        fallback.rowdiness.patienceBudget,
      ),
      drainModifier: clamp(finiteNumber(rowdiness.drainModifier, 1), 0.5, 1.5),
      moderatorDisposition: {
        temperament:
          moderatorDisposition.temperament === "strict" ||
          moderatorDisposition.temperament === "patient"
            ? moderatorDisposition.temperament
            : "balanced",
        drainModifier: clamp(
          finiteNumber(moderatorDisposition.drainModifier, 1),
          0.75,
          1.25,
        ),
        confidence: clamp(finiteNumber(moderatorDisposition.confidence, 0.35), 0, 1),
        rationale:
          text(moderatorDisposition.rationale, 240) ||
          "No strong public Persona patience signal was available.",
      },
      outcomes: Array.isArray(rowdiness.outcomes)
        ? rowdiness.outcomes
            .flatMap((outcome) => {
              if (
                !outcome ||
                typeof outcome !== "object" ||
                Array.isArray(outcome)
              ) {
                return [];
              }
              const candidate = outcome as Record<string, unknown>;
              const createdAt = validIso(candidate.createdAt);
              if (!createdAt) return [];
              const action: "tolerated" | "warned" | "interrupted" =
                candidate.action === "warned" ||
                candidate.action === "interrupted"
                  ? candidate.action
                  : "tolerated";
              const kind:
                | "gavel"
                | "opponent_taunt"
                | "awkward_silence"
                | "recess_denial" =
                candidate.kind === "gavel" ||
                candidate.kind === "opponent_taunt" ||
                candidate.kind === "recess_denial"
                  ? candidate.kind
                  : "awkward_silence";
              const tauntGraceDeadlineAt = validIso(
                candidate.tauntGraceDeadlineAt,
              );
              return [{
                eventId: text(candidate.eventId, 160) || null,
                baseDrain: Math.max(0, finiteNumber(candidate.baseDrain)),
                appliedDrain: Math.max(0, finiteNumber(candidate.appliedDrain)),
                patienceRemaining: clamp(
                  finiteNumber(candidate.patienceRemaining),
                  0,
                  fallback.rowdiness.patienceBudget,
                ),
                kind,
                action,
                ...(kind === "opponent_taunt" && tauntGraceDeadlineAt
                  ? { tauntGraceDeadlineAt }
                  : {}),
                createdAt,
              }];
            })
            .slice(-32)
        : [],
    },
    recess: {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      used: clamp(Math.floor(finiteNumber(recess.used)), 0, DEBATE_PARTICIPANT_RECESS_MAX_USES),
      max: DEBATE_PARTICIPANT_RECESS_MAX_USES,
      denials: Math.max(0, Math.floor(finiteNumber(recess.denials))),
      ...(recessCheckpoint &&
      validIso(recessCheckpoint.createdAt) &&
      Number.isInteger(recessCheckpoint.revision) &&
      finiteNumber(recessCheckpoint.revision) >= 1 &&
      (recessCheckpoint.phase === "opening" ||
        recessCheckpoint.phase === "challenge" ||
        recessCheckpoint.phase === "rebuttal" ||
        recessCheckpoint.phase === "closing" ||
        recessCheckpoint.phase === "verdict") &&
      text(recessCheckpoint.stepKey, 160)
        ? {
            checkpoint: {
              version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
              createdAt: validIso(recessCheckpoint.createdAt)!,
              revision: Math.floor(finiteNumber(recessCheckpoint.revision)),
              phase: recessCheckpoint.phase,
              stepKey: text(recessCheckpoint.stepKey, 160),
              pausedPresentationEventId:
                text(recessCheckpoint.pausedPresentationEventId, 160) || null,
            },
          }
        : {}),
      ...(recess.rageRush &&
      typeof recess.rageRush === "object" &&
      !Array.isArray(recess.rageRush) &&
      text((recess.rageRush as Record<string, unknown>).eventId, 160) &&
      validIso((recess.rageRush as Record<string, unknown>).triggeredAt)
        ? {
            rageRush: {
              version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
              eventId: text(
                (recess.rageRush as Record<string, unknown>).eventId,
                160,
              ),
              triggeredAt: validIso(
                (recess.rageRush as Record<string, unknown>).triggeredAt,
              )!,
              denialCount: Math.max(
                1,
                Math.floor(
                  finiteNumber(
                    (recess.rageRush as Record<string, unknown>).denialCount,
                    1,
                  ),
                ),
              ),
              ballotInfluence: clamp(
                finiteNumber(
                  (recess.rageRush as Record<string, unknown>).ballotInfluence,
                  -60,
                ),
                -100,
                0,
              ),
            },
          }
        : {}),
    },
    turns,
    ...(Array.isArray(row.juryLeaningPips)
      ? {
          juryLeaningPips: row.juryLeaningPips
            .filter(
              (pip): pip is "participant" | "opponent" | "neutral" =>
                pip === "participant" ||
                pip === "opponent" ||
                pip === "neutral",
            )
            .slice(0, 5),
        }
      : {}),
  };
}

export function normalizeDebateParticipantFloorBreakStateV1(
  value: unknown,
): DebateParticipantFloorBreakStateV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    (row.kind !== "objection" && row.kind !== "interjection") ||
    row.status !== "awaiting_response"
  ) return null;
  const interruptedEventId = text(row.interruptedEventId, 160);
  const callEventId = text(row.callEventId, 160);
  const interruptedBotId = text(row.interruptedBotId, 200);
  const openedAt = validIso(row.openedAt);
  const deadlineAt = validIso(row.deadlineAt);
  const activatedAt = validIso(row.activatedAt);
  const statuses: DebateStatus[] = ["live", "waiting_for_player", "paused", "completed", "cancelled", "failed"];
  const phases: DebatePhase[] = ["opening", "challenge", "rebuttal", "closing", "verdict"];
  if (
    !interruptedEventId || !callEventId || !interruptedBotId || !openedAt || !deadlineAt ||
    !Number.isInteger(row.heardCharacterCount) ||
    !statuses.includes(row.resumeStatus as DebateStatus) ||
    !phases.includes(row.resumePhase as DebatePhase) ||
    !text(row.resumeStepKey, 200)
  ) return null;
  return {
    version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
    kind: row.kind,
    status: "awaiting_response",
    interruptedEventId,
    heardCharacterCount: Math.max(0, row.heardCharacterCount as number),
    callEventId,
    fixedCall: row.kind === "objection" ? "Objection!" : "Hold on—",
    interruptedBotId,
    resumeStatus: row.resumeStatus as DebateStatus,
    resumePhase: row.resumePhase as DebatePhase,
    resumeStepKey: text(row.resumeStepKey, 200),
    openedAt,
    deadlineAt,
    ...(activatedAt ? { activatedAt } : {}),
  };
}

export function normalizeDebateVoterPredispositionsV1(
  value: unknown,
  voterBotIds: readonly string[],
): DebateVoterPredispositionV1[] {
  const records = Array.isArray(value) ? value : [];
  const supplied = new Map(records.flatMap((entry): Array<[string, DebateVoterPredispositionV1]> => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const voterBotId = text(row.voterBotId, 200);
    if (!voterBotId) return [];
    const participantBias = clamp(finiteNumber(row.participantBias), -1, 1);
    return [[voterBotId, {
      version: DEBATE_PARTICIPATION_SCHEMA_VERSION,
      voterBotId,
      direction:
        row.direction === "participant" || row.direction === "opponent"
          ? row.direction
          : Math.abs(participantBias) <= 0.05
            ? "neutral"
            : participantBias > 0
              ? "participant"
              : "opponent",
      strength: clamp(finiteNumber(row.strength, Math.abs(participantBias)), 0, 1),
      confidence: clamp(finiteNumber(row.confidence, 0.75), 0, 1),
      rationale: text(row.rationale, 500) || "Normalized legacy Participant predisposition.",
      participantBias,
    }]];
  }));
  return [...new Set(voterBotIds)].map((voterBotId) =>
    supplied.get(voterBotId) ?? debateVoterPredispositionFromSeed(voterBotId));
}
