import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1 } from "@localai/shared";
import {
  debateTurnCheckpointForEventId,
  debateTurnCheckpointsFromSession,
} from "./debateTurnCheckpoints.ts";

function event(
  overrides: Partial<DebateEventV1> &
    Pick<DebateEventV1, "id" | "sequence" | "stepKey">,
): DebateEventV1 {
  return {
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "bot-1",
    content: "A spoken floor line.",
    createdAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  } as DebateEventV1;
}

describe("debateTurnCheckpoints", () => {
  it("anchors one chapter to the first spoken event of each major turn", () => {
    const events = [
      event({
        id: "pause-1",
        sequence: 1,
        stepKey: "pause",
        kind: "moderator_ruling",
        speakerKind: "moderator",
        content: "Recess.",
      }),
      event({
        id: "intro-1",
        sequence: 2,
        stepKey: "intro",
        kind: "intro",
        speakerKind: "moderator",
        content: "Welcome to the Forum.",
      }),
      event({
        id: "opening-for-1",
        sequence: 3,
        stepKey: "opening_for",
        content: "We should flavor the crown.",
      }),
      event({
        id: "opening-for-2",
        sequence: 4,
        stepKey: "opening_for",
        content: "A second for-side beat should not add a chapter.",
      }),
      event({
        id: "opening-against-1",
        sequence: 5,
        stepKey: "opening_against",
        content: "Nonsense.",
      }),
      event({
        id: "challenge-prompt",
        sequence: 6,
        stepKey: "challenge_against_prompt",
        kind: "moderator_ruling",
        speakerKind: "moderator",
        content: "Against, your challenge.",
      }),
      event({
        id: "jury-1",
        sequence: 7,
        stepKey: "jury_deliberation_0",
        kind: "jury_deliberation",
        speakerKind: "juror",
        content: "I am persuaded.",
      }),
    ];
    const checkpoints = debateTurnCheckpointsFromSession({ events });
    assert.deepEqual(
      checkpoints.map((checkpoint) => checkpoint.id),
      ["intro", "opening_for", "opening_against", "challenge_against", "jury"],
    );
    assert.equal(
      checkpoints.find((checkpoint) => checkpoint.id === "challenge_against")
        ?.eventId,
      "challenge-prompt",
    );
  });

  it("selects the latest chapter at or before the viewer bookmark", () => {
    const events = [
      event({ id: "intro-1", sequence: 1, stepKey: "intro" }),
      event({ id: "for-1", sequence: 2, stepKey: "opening_for" }),
      event({ id: "for-2", sequence: 3, stepKey: "opening_for" }),
      event({ id: "against-1", sequence: 4, stepKey: "opening_against" }),
    ];
    const checkpoints = debateTurnCheckpointsFromSession({ events });
    assert.equal(
      debateTurnCheckpointForEventId(checkpoints, "for-2", events)?.id,
      "opening_for",
    );
    assert.equal(
      debateTurnCheckpointForEventId(checkpoints, "against-1", events)?.id,
      "opening_against",
    );
  });
});
