import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "./debate.ts";
import {
  debateAudienceEventIsShocking,
  debateAudienceModeratorOrderPlan,
  debateAudienceMonologueSilenceGate,
  debateAudiencePressureBand,
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

  it("calls order after sustained rowdiness, not only on the rising edge", () => {
    const longLine =
      "This is a long heated exchange that keeps the gallery restless while the advocate continues to press the same combative point without yielding the floor back to calm. ".repeat(
        4,
      );
    const first = {
      ...speech("sustain-1", 1),
      content: longLine,
    };
    const second = {
      ...speech("sustain-2", 2),
      content: longLine,
    };
    const third = {
      ...speech("sustain-3", 3),
      content: longLine,
    };
    const plan = debateAudienceModeratorOrderPlan({
      events: [first, second, third],
      formality: "free_for_all",
      playerRole: "spectator",
      triggerEvent: third,
    });
    assert.ok(plan);
    assert.ok(plan?.reason === "sustained" || plan?.reason === "disruptive");
    assert.ok((plan?.pressure ?? 0) >= 70);
  });

  it("does not mint sustained order while the gallery is only restless", () => {
    const longLine =
      "Phones interrupt every lesson, and locking them away until the final bell protects attention without inventing a crisis. ".repeat(
        3,
      );
    const opening = {
      ...speech("plain-1", 1),
      content: longLine,
    };
    const plan = debateAudienceModeratorOrderPlan({
      events: [opening],
      formality: "plainspoken",
      playerRole: "spectator",
      triggerEvent: opening,
    });
    assert.equal(plan, null);
    const pressure = debateAudiencePressureScore({
      events: [opening],
      formality: "plainspoken",
      playerRole: "spectator",
      visibleThroughSequence: opening.sequence,
    });
    assert.ok(pressure >= 20);
    assert.ok(pressure < 70);
  });

  it("keeps a living gallery bed under a live monologue instead of full mute", () => {
    const prior = speech("prior", 1);
    const live = {
      ...speech("live", 2),
      content: "A long enough contention that progress can be measured carefully.",
    };
    const midLine = debateAudiencePressureScore({
      events: [prior, live],
      formality: "plainspoken",
      playerRole: "judge",
      activeEventId: live.id,
      visibleCharacterCount: Math.floor(live.content.length * 0.2),
    });
    const betweenBeats = debateAudiencePressureScore({
      events: [prior, live],
      formality: "plainspoken",
      playerRole: "judge",
    });
    assert.ok(midLine > 0);
    assert.ok(midLine < betweenBeats);
    // Prior unresected heat may still murmur; the duck keeps the live body quieter.
    assert.ok(debateAudienceMonologueSilenceGate(0, "plainspoken") >= 0.4);
    assert.equal(debateAudienceMonologueSilenceGate(0, "free_for_all"), 0.72);
    assert.ok(debateAudienceMonologueSilenceGate(0.95, "plainspoken") > 0.55);
  });

  it("returns to observing after a successful call to order", () => {
    const heated = {
      ...speech("hot-1", 1),
      content:
        "An outrageous shocking scandal of corrupt fraud and disgraceful lies that should rile the gallery!",
    };
    const order: DebateEventV1 = {
      ...speech("order-1", 2),
      kind: "judge_gavel",
      speakerKind: "moderator",
      stepKey: "audience_order",
      gavelReason: "audience_order",
      content: "Order!",
    };
    const next = speech("calm-1", 3);
    const afterOrder = debateAudiencePressureScore({
      events: [heated, order],
      formality: "plainspoken",
      playerRole: "spectator",
    });
    assert.equal(afterOrder, 0);
    assert.equal(debateAudiencePressureBand(afterOrder), "settled");
    const earlyNext = debateAudiencePressureScore({
      events: [heated, order, next],
      formality: "plainspoken",
      playerRole: "spectator",
      activeEventId: next.id,
      visibleCharacterCount: Math.floor(next.content.length * 0.2),
    });
    assert.equal(debateAudiencePressureBand(earlyNext), "settled");
    assert.ok(earlyNext < 20);
  });
});
