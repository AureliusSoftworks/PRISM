import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "./debate.ts";
import {
  applyDebateAudienceDeliveryCue,
  debateAudienceDeliveryCue,
  debateAudiencePressureScore,
} from "./debateAudiencePressure.ts";

function speech(id: string, sequence: number): DebateEventV1 {
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
    content: "However, this frozen evidence proves the contention.",
    sourceIds: [],
    createdAt: "2026-07-31T12:00:00.000Z",
  };
}

describe("Debate audience delivery pressure", () => {
  it("adds stronger actor directions as the gallery grows rowdy", () => {
    assert.equal(debateAudienceDeliveryCue(44), null);
    assert.equal(debateAudienceDeliveryCue(45), "*speaks loudly*");
    assert.equal(debateAudienceDeliveryCue(70), "*yells over the crowd*");
    assert.equal(
      applyDebateAudienceDeliveryCue("The record is clear.", 45),
      "*speaks loudly* The record is clear.",
    );
    assert.equal(
      applyDebateAudienceDeliveryCue("The record is clear.", 70),
      "*yells over the crowd* The record is clear.",
    );
  });

  it("preserves authored delivery and objections", () => {
    assert.equal(
      applyDebateAudienceDeliveryCue("*whispers* Listen.", 100),
      "*whispers* Listen.",
    );
    assert.equal(
      applyDebateAudienceDeliveryCue("Objection! That misstates it.", 100),
      "Objection! That misstates it.",
    );
  });

  it("settles after a saved order strike", () => {
    const events = [speech("one", 1), speech("two", 2)];
    const hot = debateAudiencePressureScore({
      events,
      formality: "heated",
      playerRole: "judge",
    });
    assert.ok(hot >= 45);
    const order: DebateEventV1 = {
      ...speech("order", 3),
      kind: "judge_gavel",
      speakerKind: "player",
      speakerBotId: null,
      sideId: null,
      stepKey: "audience_order",
      content: "Order.",
      gavelReason: "audience_order",
    };
    assert.equal(
      debateAudiencePressureScore({
        events: [...events, order],
        formality: "heated",
        playerRole: "judge",
      }),
      0,
    );
  });
});
