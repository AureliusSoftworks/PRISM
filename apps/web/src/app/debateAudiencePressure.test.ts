import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEventV1,
  type DebateFormalityId,
} from "@localai/shared";
import {
  debateAudiencePressureBand,
  debateAudiencePressureMix,
  debateAudiencePressureScore,
  debateAudienceTalkerIndices,
} from "./debateAudiencePressure.ts";

function event(
  id: string,
  sequence: number,
  overrides: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id,
    sequence,
    phase: "opening",
    stepKey: "opening_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "bot-for",
    sideId: "for",
    content: "A sufficiently long public argument for deterministic pressure.",
    sourceIds: [],
    createdAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("Debate audience pressure", () => {
  it("uses the approved four pressure bands and mixes", () => {
    assert.equal(debateAudiencePressureBand(0), "settled");
    assert.equal(debateAudiencePressureBand(19), "settled");
    assert.equal(debateAudiencePressureBand(20), "murmuring");
    assert.equal(debateAudiencePressureBand(44), "murmuring");
    assert.equal(debateAudiencePressureBand(45), "restless");
    assert.equal(debateAudiencePressureBand(69), "restless");
    assert.equal(debateAudiencePressureBand(70), "disruptive");
    assert.equal(debateAudiencePressureBand(100), "disruptive");
    assert.deepEqual(debateAudiencePressureMix("disruptive"), {
      background: 0.68,
      grain: 0.92,
      foley: 0.34,
    });
  });

  it("orders event heat by the frozen Rowdiness choice", () => {
    const scores = (
      [
        "parliamentary",
        "structured",
        "plainspoken",
        "heated",
        "free_for_all",
      ] as const satisfies readonly DebateFormalityId[]
    ).map((formality) =>
      debateAudiencePressureScore({
        events: [event("same-event", 1)],
        formality,
        playerRole: "judge",
      }),
    );
    assert.deepEqual(
      [...scores].sort((a, b) => a - b),
      scores,
    );
    assert.ok(new Set(scores).size === scores.length);
  });

  it("ramps heat only across the middle of the live reveal", () => {
    const speech = event("ramping", 1);
    const scoreAt = (visibleCharacterCount: number): number =>
      debateAudiencePressureScore({
        events: [speech],
        formality: "heated",
        playerRole: "judge",
        activeEventId: speech.id,
        visibleCharacterCount,
      });
    assert.equal(scoreAt(0), 12);
    assert.equal(scoreAt(Math.floor(speech.content.length * 0.35)), 12);
    assert.ok(
      scoreAt(Math.floor(speech.content.length * 0.6)) >
        scoreAt(Math.floor(speech.content.length * 0.35)),
    );
    assert.equal(
      scoreAt(speech.content.length),
      debateAudiencePressureScore({
        events: [speech],
        formality: "heated",
        playerRole: "judge",
      }),
    );
  });

  it("uses the strongest event reaction bonus and resets on saved order", () => {
    const speech = event("speech", 1);
    const objection = event("objection", 2, { kind: "objection" });
    const order = event("order", 3, {
      kind: "judge_gavel",
      speakerKind: "player",
      stepKey: "audience_order",
      gavelReason: "audience_order",
      parentEventId: objection.id,
      gavelHeardCharacterCount: objection.content.length,
    });
    const beforeOrder = debateAudiencePressureScore({
      events: [speech, objection],
      formality: "plainspoken",
      playerRole: "judge",
      reactionForEvent: () => "divided",
    });
    assert.ok(beforeOrder >= 45);
    assert.equal(
      debateAudiencePressureScore({
        events: [speech, objection, order],
        formality: "plainspoken",
        playerRole: "judge",
      }),
      0,
    );
    assert.ok(
      debateAudiencePressureScore({
        events: [speech, objection, order, event("new-floor", 4)],
        formality: "plainspoken",
        playerRole: "judge",
      }) > 0,
    );
  });

  it("keeps non-Judge sessions settled and selects stable band-sized talkers", () => {
    assert.equal(
      debateAudiencePressureScore({
        events: [event("spectator", 1)],
        formality: "free_for_all",
        playerRole: "spectator",
      }),
      0,
    );
    const first = debateAudienceTalkerIndices({
      band: "restless",
      count: 15,
      seed: "session-1",
    });
    const second = debateAudienceTalkerIndices({
      band: "restless",
      count: 15,
      seed: "session-1",
    });
    assert.deepEqual(first, second);
    assert.equal(first.length, 8);
    assert.equal(
      debateAudienceTalkerIndices({
        band: "settled",
        count: 15,
        seed: "session-1",
      }).length,
      0,
    );
    assert.equal(
      debateAudienceTalkerIndices({
        band: "murmuring",
        count: 15,
        seed: "session-1",
      }).length,
      2,
    );
    assert.equal(
      debateAudienceTalkerIndices({
        band: "disruptive",
        count: 15,
        seed: "session-1",
      }).length,
      14,
    );
  });
});
