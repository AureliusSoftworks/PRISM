import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "@localai/shared";

import {
  DEBATE_INTERRUPT_OVERLAP_PROGRESS,
  debateInterruptCutCaption,
  debateInterruptOverlapPair,
  debateInterruptShouldFire,
  debateInterruptTrailOffLine,
} from "./debateInterruptOverlap.ts";

function event(
  partial: Partial<DebateEventV1> &
    Pick<DebateEventV1, "id" | "kind" | "sequence">,
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    phase: "opening",
    stepKey: "opening_against",
    speakerKind: "advocate",
    speakerBotId: "bot-a",
    sideId: "for",
    content: "And that's why all fighters deserve better support.",
    sourceIds: [],
    createdAt: "2026-08-05T00:00:00.000Z",
    ...partial,
  };
}

describe("debateInterruptOverlap", () => {
  it("pairs truncated speech with the following parented objection", () => {
    const speech = event({
      id: "speech-1",
      kind: "speech",
      sequence: 1,
      interrupted: true,
      interruptedBy: "bot",
      content: "And that's why all fighters…",
    });
    const objection = event({
      id: "obj-1",
      kind: "objection",
      sequence: 2,
      speakerBotId: "bot-b",
      sideId: "against",
      parentEventId: "speech-1",
      content: "Objection!",
    });
    const pair = debateInterruptOverlapPair([speech, objection], "speech-1");
    assert.equal(pair?.interrupted.id, "speech-1");
    assert.equal(pair?.interrupter.id, "obj-1");
  });

  it("skips housekeeping between the cut and the shout", () => {
    const speech = event({
      id: "speech-1",
      kind: "speech",
      sequence: 1,
      interrupted: true,
      interruptedBy: "bot",
    });
    const order = event({
      id: "order-1",
      kind: "judge_gavel",
      sequence: 2,
      stepKey: "audience_order",
      speakerKind: "system",
      speakerBotId: null,
      sideId: null,
      content: "",
      gavelReason: "audience_order",
    });
    const objection = event({
      id: "obj-1",
      kind: "objection",
      sequence: 3,
      parentEventId: "speech-1",
      content: "Objection!",
    });
    const pair = debateInterruptOverlapPair(
      [speech, order, objection],
      "speech-1",
    );
    assert.equal(pair?.interrupter.id, "obj-1");
  });

  it("fires the overlap near the end of the interrupted line", () => {
    assert.equal(debateInterruptShouldFire(0, 1_000), false);
    assert.equal(
      debateInterruptShouldFire(
        DEBATE_INTERRUPT_OVERLAP_PROGRESS * 1_000,
        1_000,
      ),
      true,
    );
  });

  it("freezes captions with an em dash and picks a stable trail-off", () => {
    assert.equal(
      debateInterruptCutCaption("And that's why all fi"),
      "And that's why all fi—",
    );
    assert.equal(
      debateInterruptTrailOffLine("speech-1"),
      debateInterruptTrailOffLine("speech-1"),
    );
    assert.match(debateInterruptTrailOffLine("speech-1"), /^…/u);
  });
});
