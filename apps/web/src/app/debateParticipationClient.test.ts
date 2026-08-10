import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_ROWDINESS_PATIENCE_MS,
  debateFavorabilityPosition,
  debateParticipantChoices,
  debateParticipantRecessState,
  debateParticipantTurnSubmission,
  debateParticipantWindowExpirySchedule,
  debateParticipationClockRate,
  debateParticipationDifficulty,
  debateParticipationPatience,
  debateParticipationPatienceExpiryMs,
  debateScaledElapsedMs,
} from "./debateParticipationClient.ts";

test("Participant input always slows the clock by eight independent of difficulty", () => {
  for (const difficulty of ["coach", "standard", "immersive"] as const) {
    assert.equal(
      debateParticipationClockRate({
        status: "waiting_for_player",
        participation: { difficulty, participantWindow: { status: "open" } },
      }),
      1 / 8,
    );
  }
  assert.equal(debateParticipationClockRate({ status: "live" }), 1);
  assert.equal(
    debateParticipationClockRate({ status: "waiting_for_player" }),
    1,
  );
  assert.equal(
    debateParticipationClockRate({
      status: "waiting_for_player",
      participation: { participantWindow: { status: "open" } },
      participantFloorBreak: {
        kind: "objection",
        status: "awaiting_response",
        interruptedEventId: "speech-1",
      },
    }),
    1,
  );
  assert.equal(
    debateParticipationClockRate({
      status: "waiting_for_player",
      participantFloorBreak: {
        kind: "objection",
        status: "awaiting_response",
        interruptedEventId: "speech-1",
        activatedAt: "2026-08-09T20:00:00.000Z",
      },
    }),
    1 / 8,
  );
});

test("Standard is the compatibility default", () => {
  assert.equal(debateParticipationDifficulty({}), "standard");
  assert.equal(
    debateParticipationDifficulty({ participation: { difficulty: "coach" } }),
    "coach",
  );
});

test("Rowdiness monotonically increases the moderator patience budget", () => {
  assert.deepEqual(Object.values(DEBATE_ROWDINESS_PATIENCE_MS), [
    15_000, 22_000, 30_000, 40_000, 50_000,
  ]);
  assert.equal(
    debateParticipationPatience({
      session: { participation: { difficulty: "immersive" } },
      formality: "heated",
    }).budgetMs,
    40_000,
  );
  assert.deepEqual(
    debateParticipationPatience({
      session: {
        participation: {
          rowdiness: { patienceBudget: 40, patienceRemaining: 0 },
        },
      },
      formality: "heated",
    }),
    { budgetMs: 40_000, remainingMs: 0, ratio: 0, drainModifier: 1 },
  );
});

test("Moderator patience expires after the allowance and bias-adjusted drain", () => {
  assert.equal(
    debateParticipationPatienceExpiryMs({
      inputDeadlineMs: 10_000,
      remainingMs: 40_000,
      drainModifier: 0.8,
    }),
    60_000,
  );
  assert.equal(
    debateParticipationPatienceExpiryMs({
      inputDeadlineMs: 10_000,
      remainingMs: 40_000,
      drainModifier: 1.25,
    }),
    42_000,
  );
});

test("Participant expiry ignores stale taunt grace from an older floor", () => {
  const initial = debateParticipantWindowExpirySchedule({
    session: {
      participation: {
        participantWindow: {
          status: "open",
          openedAt: "2026-08-09T20:00:00.000Z",
          deadlineAt: "2026-08-09T20:01:00.000Z",
          overtimeMs: 0,
        },
        rowdiness: {
          patienceBudget: 30,
          patienceRemaining: 30,
          drainModifier: 1,
          outcomes: [
            {
              kind: "opponent_taunt",
              createdAt: "2026-08-09T19:58:00.000Z",
              tauntGraceDeadlineAt: "2026-08-09T19:58:10.000Z",
            },
          ],
        },
      },
    },
    formality: "plainspoken",
  });
  assert.deepEqual(initial, {
    stage: "deadline",
    expiresAtMs: Date.parse("2026-08-09T20:01:30.000Z"),
  });

  const activeGrace = debateParticipantWindowExpirySchedule({
    session: {
      participation: {
        participantWindow: {
          status: "open",
          openedAt: "2026-08-09T20:00:00.000Z",
          deadlineAt: "2026-08-09T20:01:10.000Z",
          overtimeMs: 30_000,
        },
        rowdiness: {
          outcomes: [
            {
              kind: "opponent_taunt",
              createdAt: "2026-08-09T20:01:00.000Z",
              tauntGraceDeadlineAt: "2026-08-09T20:01:10.000Z",
            },
          ],
        },
      },
    },
    formality: "plainspoken",
  });
  assert.deepEqual(activeGrace, {
    stage: "taunt_grace",
    expiresAtMs: Date.parse("2026-08-09T20:01:10.000Z"),
  });
});

test("overtime windows use the server's next patience checkpoint", () => {
  assert.deepEqual(
    debateParticipantWindowExpirySchedule({
      session: {
        participation: {
          participantWindow: {
            status: "open",
            openedAt: "2026-08-09T20:00:00.000Z",
            deadlineAt: "2026-08-09T20:01:05.000Z",
            overtimeMs: 5_000,
          },
        },
      },
      formality: "heated",
    }),
    {
      stage: "deadline",
      expiresAtMs: Date.parse("2026-08-09T20:01:05.000Z"),
    },
  );
});

test("Favorability and scaled elapsed values are clamped", () => {
  assert.equal(debateFavorabilityPosition(-200), 100);
  assert.equal(debateFavorabilityPosition(0), 50);
  assert.equal(debateFavorabilityPosition(200), 0);
  assert.equal(
    debateScaledElapsedMs({
      accumulatedMs: 1_000,
      runningSinceMs: 10_000,
      nowMs: 18_000,
      rate: 1 / 8,
    }),
    2_000,
  );
});

test("Guided choice tiers are not part of the live client contract", () => {
  const choices = debateParticipantChoices({
    participation: {
      choiceSet: {
        choices: [
          { id: "a", label: "Lead with the contradiction", content: "A" },
          { id: "b", label: "Return to the evidence", content: "B" },
          { id: "c", label: "Challenge the premise", content: "C" },
        ],
      },
    },
  });
  assert.equal(choices.length, 3);
  assert.equal("tier" in choices[0]!, false);
});

test("a selected guided response resolves to one committable choice payload", () => {
  const choices = [
    { id: "a", label: "Option A", content: "First response" },
    { id: "b", label: "Option B", content: "Second response" },
  ];
  assert.deepEqual(
    debateParticipantTurnSubmission({
      choices,
      selectedChoiceId: "b",
      customComposerOpen: false,
      content: "",
    }),
    { choiceId: "b" },
  );
  assert.equal(
    debateParticipantTurnSubmission({
      choices,
      selectedChoiceId: "missing",
      customComposerOpen: false,
      content: "",
    }),
    null,
  );
  assert.deepEqual(
    debateParticipantTurnSubmission({
      choices,
      selectedChoiceId: "b",
      customComposerOpen: true,
      content: "  My own case.  ",
    }),
    { content: "My own case." },
  );
});

test("recess state exposes denied-request pressure and the terminal rush", () => {
  assert.deepEqual(
    debateParticipantRecessState({
      participation: {
        recess: {
          used: 3,
          max: 3,
          denials: 2,
          rageRush: { eventId: "rage-1" },
        },
      },
    }),
    {
      used: 3,
      max: 3,
      remaining: 0,
      denials: 2,
      denied: true,
      rageRush: true,
    },
  );
});
