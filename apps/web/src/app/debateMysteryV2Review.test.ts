import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateWhodunnitFormatStateV2 } from "@localai/shared";
import { formatDebateMysteryV2PublicReview } from "./debateMysteryV2Review.ts";

const state = {
  version: 2,
  format: "whodunnit",
  playPhase: "verdict",
  caseTitle: "The Clockwork Alibi",
  fictionLabel: "Fictional, non-canonical case",
  config: {
    difficulty: "classic",
    trialType: "jury",
    playerRole: "participant",
    inspiration: "PRIVATE INSPIRATION",
    nonce: "PRIVATE NONCE",
  },
  victim: { id: "victim-private-id", name: "Avery Vale" },
  suspects: [
    {
      seatId: "suspect-iris",
      botId: "bot-iris",
      exportHash: null,
      name: "Iris",
      color: null,
      glyph: null,
      roomId: "library",
    },
  ],
  rooms: [
    {
      id: "library",
      name: "Library",
      visited: true,
      hotspots: [
        { id: "clock", label: "stopped clock", examined: true },
        { id: "drawer", label: "UNSEEN DRAWER", examined: false },
      ],
    },
  ],
  record: [
    {
      reference: { kind: "evidence", id: "clock-evidence" },
      title: "Stopped clock",
      description: "Its hands stopped at midnight.",
      emoji: "🕰️",
      admitted: true,
      updatedAt: "2026-08-24T20:00:00.000Z",
    },
    {
      reference: { kind: "evidence", id: "sealed-clue" },
      title: "UNADMITTED CLUE",
      description: "This must remain out of the copy.",
      emoji: "🔒",
      admitted: false,
      updatedAt: "2026-08-24T20:00:00.000Z",
    },
  ],
  dialogueHistory: [
    {
      nodeId: "node-1",
      lineId: "line-1",
      visibleText: "The clock was already broken when I arrived.",
      speakerSeatId: "suspect-iris",
      occurredAt: "2026-08-24T20:01:00.000Z",
    },
  ],
  theory: {
    culpritSeatId: "suspect-iris",
    accompliceSeatId: null,
    method: "Clock mechanism",
    motive: "Inheritance",
    opportunity: "Midnight access",
    evidenceIds: ["clock-evidence"],
    testimonyIds: [],
  },
  theoryFiledAt: "2026-08-24T20:02:00.000Z",
  court: {
    statements: [
      {
        statementId: "statement-1",
        versionId: "statement-1-v1",
        witnessSeatId: "suspect-iris",
        version: 1,
        lineId: "line-1",
        visibleText: "I never touched the clock.",
        pressed: true,
      },
    ],
  },
  verdict: {
    legalResult: "guilty",
    classification: "just_conviction",
    sealedCulpritCorrect: true,
    proofGrade: "proved",
    jurorBallots: [
      {
        jurorBotId: "juror-1",
        vote: "guilty",
        reason: "The admitted contradiction proved the charge.",
        powerAffected: false,
      },
    ],
    deliveredAt: "2026-08-24T20:03:00.000Z",
  },
  calloutHistory: [
    {
      id: "callout-1",
      callout: "guilty",
      actorColor: null,
      occurredAt: "2026-08-24T20:03:00.000Z",
    },
  ],
  voicesEnabled: true,
} as unknown as DebateWhodunnitFormatStateV2;

describe("Whodunnit V2 public review", () => {
  it("includes the heard public case while excluding sealed and undiscovered data", () => {
    const review = formatDebateMysteryV2PublicReview(
      state,
      (botId) => (botId === "juror-1" ? "Mira" : null),
    );

    assert.match(review, /The Clockwork Alibi/u);
    assert.match(review, /Iris: The clock was already broken/u);
    assert.match(review, /Stopped clock/u);
    assert.match(review, /I never touched the clock/u);
    assert.match(review, /Mira: guilty/u);
    assert.doesNotMatch(review, /PRIVATE INSPIRATION|PRIVATE NONCE/u);
    assert.doesNotMatch(review, /UNADMITTED CLUE|UNSEEN DRAWER/u);
    assert.doesNotMatch(review, /sealedCulpritCorrect|victim-private-id/u);
  });
});
