import assert from "node:assert/strict";
import test from "node:test";
import {
  appendDebateParticipantFavorability,
  createDebateParticipantWindowV1,
  debateParticipantBallotScore,
  debateParticipantBallotSide,
  debateParticipantFacetBaseImpact,
  debateParticipantFavorabilityDelta,
  debateParticipantGambitClarificationRequired,
  debateParticipantGambitGradesV1,
  debateParticipantGambitOfferV1,
  debateParticipantGambitReception,
  debateParticipantGambitSocialScore,
  debateParticipantModeratorBiasOverride,
  debateParticipantPatienceBudget,
  debateParticipantPatienceOutcome,
  debateParticipantRecessDenialPatience,
  debateParticipantPhaseWeight,
  debateParticipantOvertimeFavorabilityDelta,
  defaultDebateParticipationStateV1,
  normalizeDebateParticipantDifficulty,
  normalizeDebateParticipantFloorBreakStateV1,
  normalizeDebateParticipationStateV1,
} from "./debateParticipation.ts";
import {
  DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS,
  DEBATE_PARTICIPANT_RECESS_MAX_USES,
} from "./debate.ts";

test("Participant difficulty defaults to Standard and preserves versioned choices", () => {
  assert.equal(normalizeDebateParticipantDifficulty(undefined), "standard");
  assert.equal(normalizeDebateParticipantDifficulty("coach"), "coach");
  assert.equal(normalizeDebateParticipantDifficulty("immersive"), "immersive");
  assert.equal(normalizeDebateParticipantDifficulty("unknown"), "standard");
});

test("Participant windows give ordinary floors eight times the announced limit", () => {
  const openedAt = "2026-08-09T12:00:00.000Z";
  const opening = createDebateParticipantWindowV1({ kind: "opening", openedAt });
  assert.equal(opening.announcedLimitMs, 20_000);
  assert.equal(opening.wallLimitMs, 160_000);
  assert.equal(opening.timeScale, 8);
  assert.equal(opening.deadlineAt, "2026-08-09T12:02:40.000Z");
  assert.equal(opening.elapsedWallMs, 0);
  assert.equal(opening.overtimeMs, 0);

  const objection = createDebateParticipantWindowV1({ kind: "objection", openedAt });
  assert.equal(objection.announcedLimitMs, DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS);
  assert.equal(objection.wallLimitMs, DEBATE_PARTICIPANT_FLOOR_BREAK_DEADLINE_MS);
});

test("rowdiness patience follows room formality and persona bias modifies drain", () => {
  assert.deepEqual(
    ["free_for_all", "heated", "plainspoken", "structured", "parliamentary"].map(
      (formality) => debateParticipantPatienceBudget(formality as never),
    ),
    [50, 40, 30, 22, 15],
  );
  const friendly = debateParticipantPatienceOutcome({
    patienceRemaining: 10,
    patienceBudget: 15,
    baseDrain: 4,
    participantBias: 1,
  });
  const hostile = debateParticipantPatienceOutcome({
    patienceRemaining: 4,
    patienceBudget: 15,
    baseDrain: 4,
    participantBias: -1,
  });
  assert.equal(friendly.appliedDrain, 3);
  assert.equal(friendly.action, "tolerated");
  assert.equal(hostile.appliedDrain, 5);
  assert.equal(hostile.action, "interrupted");
  assert.equal(hostile.kind, "gavel");
  const taunt = debateParticipantPatienceOutcome({
    patienceRemaining: 8,
    patienceBudget: 15,
    baseDrain: 4,
    kind: "opponent_taunt",
    createdAt: "2026-08-09T12:00:00.000Z",
  });
  assert.equal(taunt.tauntGraceDeadlineAt, "2026-08-09T12:00:10.000Z");
});

test("denied recesses consume future overtime reserve and escalate to exhaustion", () => {
  const first = debateParticipantRecessDenialPatience({
    patienceRemaining: 30,
    patienceBudget: 30,
    priorDenials: 0,
    moderatorModifier: 1,
  });
  const second = debateParticipantRecessDenialPatience({
    patienceRemaining: first.patienceRemaining,
    patienceBudget: 30,
    priorDenials: 1,
    moderatorModifier: 1,
  });
  const final = debateParticipantRecessDenialPatience({
    patienceRemaining: second.patienceRemaining,
    patienceBudget: 30,
    priorDenials: 2,
    moderatorModifier: 1,
  });
  assert.deepEqual(
    [first.baseDrain, second.baseDrain, final.baseDrain],
    [8, 12, 16],
  );
  assert.equal(first.patienceRemaining, 22);
  assert.equal(second.patienceRemaining, 10);
  assert.equal(final.patienceRemaining, 0);
  assert.equal(final.action, "interrupted");
  assert.equal(final.exhausted, true);

  const patient = debateParticipantRecessDenialPatience({
    patienceRemaining: 15,
    patienceBudget: 15,
    priorDenials: 0,
    moderatorModifier: 0.75,
  });
  const strict = debateParticipantRecessDenialPatience({
    patienceRemaining: 15,
    patienceBudget: 15,
    priorDenials: 0,
    moderatorModifier: 1.25,
  });
  assert.equal(patient.appliedDrain, 6);
  assert.equal(strict.appliedDrain, 10);
});

test("favorability uses facets, doubles evidence, and decays by phase", () => {
  const baseImpact = debateParticipantFacetBaseImpact({
    argumentStrength: 1,
    humor: 0.5,
    confidence: 1,
    opponentPressure: 0.5,
    subjectKnowledge: 1,
  });
  assert.equal(baseImpact, 16);
  assert.deepEqual(
    debateParticipantFavorabilityDelta({ baseImpact, phase: "opening", evidenceUsed: true }),
    { delta: 30, evidenceMultiplier: 2 },
  );
  assert.deepEqual(
    debateParticipantFavorabilityDelta({
      baseImpact,
      phase: "closing",
      opportunityIndex: 4,
    }),
    { delta: 4, evidenceMultiplier: 1 },
  );
  assert.equal(debateParticipantPhaseWeight(0), 1);
  assert.equal(debateParticipantPhaseWeight(1), 0.72);
  assert.equal(debateParticipantPhaseWeight(99), 0.25);
  assert.equal(debateParticipantOvertimeFavorabilityDelta(4_999), 0);
  assert.equal(debateParticipantOvertimeFavorabilityDelta(15_000), -3);
  assert.equal(debateParticipantOvertimeFavorabilityDelta(999_000), -12);
  const ledger = appendDebateParticipantFavorability(
    { version: 1, total: 90, entries: [] },
    {
      id: "entry-1",
      eventId: "event-1",
      phase: "opening",
      facets: { argumentStrength: 1 },
      baseImpact: 20,
      phaseWeight: 1,
      delta: 30,
      reasons: ["argument_strength"],
      evidenceMultiplier: 2,
      createdAt: "2026-08-09T12:00:00.000Z",
    },
  );
  assert.equal(ledger.total, 100);
});

test("favorability influences but cannot dominate bounded ballot math", () => {
  const adjusted = debateParticipantBallotScore({
    baseScore: -80,
    participantBias: 1,
    favorability: 100,
  });
  assert.equal(adjusted.predispositionInfluence, 40);
  assert.equal(adjusted.favorabilityInfluence, 20);
  assert.equal(adjusted.score, -20);
  assert.equal(
    debateParticipantBallotSide({
      baseScore: -80,
      participantBias: 1,
      favorability: 100,
      participantSideId: "for",
      baseSideId: "against",
    }),
    "against",
  );
  assert.equal(
    debateParticipantBallotScore({
      baseScore: 0,
      participantBias: 1,
      predispositionConfidence: 0.2,
      favorability: 0,
    }).predispositionInfluence,
    10,
  );
  assert.equal(
    debateParticipantBallotSide({
      baseScore: 0,
      participantBias: 0,
      favorability: 0,
      participantSideId: "for",
      baseSideId: "against",
    }),
    "against",
  );
});

test("Participant state normalization restores budgets and recess cap", () => {
  const state = normalizeDebateParticipationStateV1(
    {
      difficulty: "coach",
      rowdiness: { patienceRemaining: 999 },
      recess: {
        used: 9,
        denials: 2,
        rageRush: {
          eventId: "event-rage",
          triggeredAt: "2026-08-09T18:16:00.000Z",
          denialCount: 3,
          ballotInfluence: -80,
        },
        checkpoint: {
          createdAt: "2026-08-09T18:15:00.000Z",
          revision: 12,
          phase: "rebuttal",
          stepKey: "rebuttal_participant",
          pausedPresentationEventId: "event-12",
        },
      },
    },
    "heated",
  );
  assert.equal(state.difficulty, "coach");
  assert.equal(state.rowdiness.patienceBudget, 40);
  assert.equal(state.rowdiness.patienceRemaining, 40);
  assert.equal(state.recess.used, DEBATE_PARTICIPANT_RECESS_MAX_USES);
  assert.equal(state.recess.denials, 2);
  assert.deepEqual(state.recess.rageRush, {
    version: 1,
    eventId: "event-rage",
    triggeredAt: "2026-08-09T18:16:00.000Z",
    denialCount: 3,
    ballotInfluence: -80,
  });
  assert.deepEqual(state.recess.checkpoint, {
    version: 1,
    createdAt: "2026-08-09T18:15:00.000Z",
    revision: 12,
    phase: "rebuttal",
    stepKey: "rebuttal_participant",
    pausedPresentationEventId: "event-12",
  });
  assert.deepEqual(defaultDebateParticipationStateV1("free_for_all").recess, {
    version: 1,
    used: 0,
    max: 3,
    denials: 0,
  });
});

test("unified floor breaks retain the audible cutoff and fixed call", () => {
  const floorBreak = normalizeDebateParticipantFloorBreakStateV1({
    kind: "interjection",
    status: "awaiting_response",
    interruptedEventId: "event-1",
    heardCharacterCount: 42,
    callEventId: "event-2",
    interruptedBotId: "bot-1",
    resumeStatus: "live",
    resumePhase: "rebuttal",
    resumeStepKey: "rebuttal_against",
    openedAt: "2026-08-09T12:00:00.000Z",
    deadlineAt: "2026-08-09T12:00:30.000Z",
  });
  assert.equal(floorBreak?.heardCharacterCount, 42);
  assert.equal(floorBreak?.fixedCall, "Hold on—");
});

test("rhetorical gambit decks are unique, sealed, and replay-stable", () => {
  const first = debateParticipantGambitOfferV1({
    sessionId: "session-1",
    eventId: "event-1",
    kind: "objection",
    createdAt: "2026-08-09T12:00:00.000Z",
  });
  const replay = debateParticipantGambitOfferV1({
    sessionId: "session-1",
    eventId: "event-1",
    kind: "objection",
    createdAt: "2026-08-09T12:00:00.000Z",
  });
  assert.deepEqual(replay, first);
  assert.equal(first.choices.length, 3);
  assert.equal(new Set(first.choices.map((choice) => choice.kind)).size, 3);
  assert.ok(first.choices.every((choice) => choice.label && choice.intent));
  assert.ok(first.choices.every((choice) => !("tier" in choice)));

  const grades = debateParticipantGambitGradesV1({
    sessionId: "session-1",
    offer: first,
  });
  assert.deepEqual(
    new Set(grades.map((grade) => grade.tier)),
    new Set(["well_executed", "shaky", "exposed"]),
  );
});

test("persona persuasion and Moderator bias remain bounded and deterministic", () => {
  assert.equal(
    debateParticipantGambitSocialScore({
      tier: "well_executed",
      participantBias: 1,
      predispositionConfidence: 1,
      favorability: 100,
    }),
    75,
  );
  assert.equal(debateParticipantGambitReception(15), "receptive");
  assert.equal(debateParticipantGambitReception(-15), "hostile");
  assert.equal(debateParticipantGambitReception(0), "uncertain");

  const override = debateParticipantModeratorBiasOverride({
    seed: "batman-v-joker",
    participantBias: 1,
    confidence: 1,
    proceduralRuling: "overruled",
  });
  assert.equal(override.chance, 0.65);
  assert.deepEqual(
    debateParticipantModeratorBiasOverride({
      seed: "batman-v-joker",
      participantBias: 1,
      confidence: 1,
      proceduralRuling: "overruled",
    }),
    override,
  );
  assert.equal(
    debateParticipantModeratorBiasOverride({
      seed: "mild",
      participantBias: 0.59,
      confidence: 1,
      proceduralRuling: "overruled",
    }).chance,
    0,
  );
  assert.equal(
    debateParticipantModeratorBiasOverride({
      seed: "threshold",
      participantBias: 0.6,
      confidence: 1,
      proceduralRuling: "overruled",
    }).chance,
    0.1,
  );
  assert.equal(
    debateParticipantGambitClarificationRequired({
      seed: "replay-stable",
      tier: "well_executed",
      moderatorReception: "uncertain",
    }),
    false,
  );
});

test("legacy Participation keeps gambits off while new sessions can freeze them on", () => {
  assert.equal(
    normalizeDebateParticipationStateV1({}, "plainspoken")
      .rhetoricalGambitsEnabled,
    false,
  );
  assert.equal(
    defaultDebateParticipationStateV1("plainspoken", "standard", true)
      .rhetoricalGambitsEnabled,
    true,
  );
});
