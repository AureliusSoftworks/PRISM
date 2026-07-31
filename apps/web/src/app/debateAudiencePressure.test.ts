import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEventV1,
  type DebateFormalityId,
} from "@localai/shared";
import {
  DEBATE_AUDIENCE_MIX_BED_CEILING,
  debateAudiencePressureBand,
  debateAudiencePressureMix,
  debateAudiencePressureScore,
  debateAudienceTalkerIndices,
  debateAudienceVisualPressureBand,
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
      background: 0.3,
      grain: 0.4,
      foley: 0.3,
    });
    for (const band of [
      "settled",
      "murmuring",
      "restless",
      "disruptive",
    ] as const) {
      const mix = debateAudiencePressureMix(band);
      assert.ok(
        mix.background + mix.grain <= DEBATE_AUDIENCE_MIX_BED_CEILING,
      );
      assert.ok(mix.background + mix.grain + mix.foley <= 1);
    }
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

  it("keeps the gallery quiet through most of a live monologue, then murmurs near the end", () => {
    const speech = event("ramping", 1);
    const prior = event("prior", 0, {
      content: "Earlier argument that already heated the room.",
    });
    const scoreAt = (visibleCharacterCount: number): number =>
      debateAudiencePressureScore({
        events: [prior, speech],
        formality: "heated",
        playerRole: "judge",
        activeEventId: speech.id,
        visibleCharacterCount,
      });
    // Prior heat is fully suppressed while the current bot is still talking.
    assert.equal(scoreAt(0), 0);
    assert.equal(scoreAt(Math.floor(speech.content.length * 0.5)), 0);
    assert.equal(scoreAt(Math.floor(speech.content.length * 0.74)), 0);
    assert.ok(
      scoreAt(Math.floor(speech.content.length * 0.85)) >
        scoreAt(Math.floor(speech.content.length * 0.75)),
    );
    assert.equal(
      scoreAt(speech.content.length),
      debateAudiencePressureScore({
        events: [prior, speech],
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

  it("caps visual pressure under reduced material quality", () => {
    assert.equal(
      debateAudienceVisualPressureBand("disruptive", "full"),
      "disruptive",
    );
    assert.equal(
      debateAudienceVisualPressureBand("disruptive", "balanced"),
      "murmuring",
    );
    assert.equal(
      debateAudienceVisualPressureBand("restless", "minimal"),
      "murmuring",
    );
    assert.equal(
      debateAudienceVisualPressureBand("settled", "minimal"),
      "settled",
    );
  });
});
