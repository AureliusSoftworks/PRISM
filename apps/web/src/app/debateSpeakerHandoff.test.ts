import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "@localai/shared";
import {
  DEBATE_SPEAKER_HANDOFF_TIMING,
  debatePreviousStageSpeakerEvent,
  debateSpeakerHandoffPlan,
} from "./debateSpeakerHandoff.ts";

function event(
  overrides: Partial<DebateEventV1> & Pick<DebateEventV1, "id" | "sequence">,
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    phase: "opening",
    stepKey: "opening_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "for",
    sideId: "for",
    content: "The floor is mine.",
    sourceIds: [],
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("Debate speaker handoff choreography", () => {
  it("stages a moderator-to-advocate floor assignment before speech", () => {
    const moderator = event({
      id: "intro",
      sequence: 1,
      kind: "intro",
      speakerKind: "moderator",
      speakerBotId: "moderator",
      sideId: null,
    });
    const advocate = event({
      id: "opening-for",
      sequence: 2,
      sourceIds: ["source-1"],
    });
    const plan = debateSpeakerHandoffPlan({
      sessionId: "session-1",
      previousEvent: moderator,
      nextEvent: advocate,
      automaticCamera: true,
      juryCameraActive: false,
      gavelLed: false,
      hasEvidence: true,
      speakerCanFoley: true,
    });

    assert.deepEqual(plan, {
      previousEventId: "intro",
      nextEventId: "opening-for",
      hasEvidence: true,
      foleyKind: plan?.foleyKind,
    });
    assert.ok(
      plan?.foleyKind === "soft-inhale" || plan?.foleyKind === "throat-clear",
    );
    assert.ok(DEBATE_SPEAKER_HANDOFF_TIMING.wideAudienceMs >= 2_000);
    assert.ok(DEBATE_SPEAKER_HANDOFF_TIMING.quietReadyMs >= 500);
    assert.ok(DEBATE_SPEAKER_HANDOFF_TIMING.cameraSettleMs >= 900);
  });

  it("looks past system distillation and atmospheric reactions", () => {
    const moderator = event({
      id: "moderator",
      sequence: 1,
      speakerKind: "moderator",
      speakerBotId: "moderator",
      sideId: null,
    });
    const caseBoard = event({
      id: "case-board",
      sequence: 2,
      kind: "case_board",
      speakerKind: "system",
      speakerBotId: null,
      sideId: null,
    });
    const reaction = event({
      id: "foley",
      sequence: 3,
      kind: "reaction",
      speakerKind: "advocate",
      speakerBotId: "against",
      sideId: "against",
      stepKey: "persona_reaction_2",
    });
    const next = event({ id: "next", sequence: 4 });

    assert.equal(
      debatePreviousStageSpeakerEvent(
        [moderator, caseBoard, reaction, next],
        next,
      )?.id,
      moderator.id,
    );
  });

  it("does not slow same-speaker continuations, interruptions, gavel leads, or manual cameras", () => {
    const first = event({ id: "first", sequence: 1 });
    const sameSpeaker = event({ id: "same", sequence: 2 });
    const interruption = event({
      id: "interrupt",
      sequence: 3,
      kind: "interjection",
      speakerBotId: "against",
      sideId: "against",
    });
    const base = {
      sessionId: "session-1",
      previousEvent: first,
      automaticCamera: true,
      juryCameraActive: false,
      gavelLed: false,
      hasEvidence: false,
      speakerCanFoley: true,
    } as const;

    assert.equal(
      debateSpeakerHandoffPlan({ ...base, nextEvent: sameSpeaker }),
      null,
    );
    assert.equal(
      debateSpeakerHandoffPlan({ ...base, nextEvent: interruption }),
      null,
    );
    assert.equal(
      debateSpeakerHandoffPlan({
        ...base,
        nextEvent: event({
          id: "against",
          sequence: 4,
          speakerBotId: "against",
          sideId: "against",
        }),
        gavelLed: true,
      }),
      null,
    );
    assert.equal(
      debateSpeakerHandoffPlan({
        ...base,
        nextEvent: event({
          id: "manual",
          sequence: 5,
          speakerBotId: "against",
          sideId: "against",
        }),
        automaticCamera: false,
      }),
      null,
    );
  });
});
