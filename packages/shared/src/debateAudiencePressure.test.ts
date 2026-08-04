import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "./debate.ts";
import {
  debateAudienceEventIsShocking,
  debateAudienceModeratorOrderPlan,
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

describe("Debate audience pressure", () => {
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
        events: [
          ...events,
          {
            ...order,
            kind: "moderator_ruling",
            speakerKind: "moderator",
            speakerBotId: "moderator",
            stepKey: "opening_for",
            gavelReason: "audience_order",
            gavelStrikeCount: 1,
          },
        ],
        formality: "free_for_all",
        playerRole: "spectator",
      }),
      0,
    );
    assert.equal(
      debateAudiencePressureScore({
        events: [...events, order],
        formality: "heated",
        playerRole: "judge",
      }),
      0,
    );
  });

  it("keeps the gallery alive outside the player-Judge perspective", () => {
    assert.ok(
      debateAudiencePressureScore({
        events: [speech("spectator-floor", 1)],
        formality: "free_for_all",
        playerRole: "spectator",
      }) > 0,
    );
  });

  it("recognizes shock language and gives bot Moderators sparse order plans", () => {
    const shocking: DebateEventV1 = {
      ...speech("shock-1", 1),
      content: "That is an outrageous lie, and you are wrong!",
    };
    assert.equal(debateAudienceEventIsShocking(shocking), true);
    assert.equal(
      debateAudienceEventIsShocking({
        ...shocking,
        content: "*shouts* The painting uses a different composition.",
      }),
      false,
    );
    assert.equal(
      debateAudienceEventIsShocking({
        ...shocking,
        speakerKind: "moderator",
      }),
      false,
    );
    assert.equal(
      debateAudienceModeratorOrderPlan({
        events: [shocking],
        formality: "free_for_all",
        playerRole: "spectator",
        triggerEvent: shocking,
      })?.reason,
      "shock",
    );
    assert.equal(
      debateAudienceModeratorOrderPlan({
        events: [shocking],
        formality: "free_for_all",
        playerRole: "judge",
        triggerEvent: shocking,
      }),
      null,
    );

    const order: DebateEventV1 = {
      ...speech("order-1", 2),
      kind: "moderator_ruling",
      speakerKind: "moderator",
      stepKey: "audience_order",
      content: "Order!",
    };
    const immediateRepeat: DebateEventV1 = {
      ...speech("shock-2", 3),
      content: "Another outrageous lie, and still wrong!",
    };
    assert.equal(
      debateAudienceModeratorOrderPlan({
        events: [shocking, order, immediateRepeat],
        formality: "free_for_all",
        playerRole: "spectator",
        triggerEvent: immediateRepeat,
      }),
      null,
    );

    const testimony = {
      ...shocking,
      id: "shock-testimony",
      kind: "testimony" as const,
    };
    assert.equal(
      debateAudienceModeratorOrderPlan({
        events: [testimony],
        formality: "free_for_all",
        playerRole: "spectator",
        triggerEvent: testimony,
      })?.reason,
      "shock",
    );
  });
});
