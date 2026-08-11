import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateSessionV1 } from "@localai/shared";
import {
  debateCanRetryStaleAutomaticAdvance,
  debateRequestIsRevisionConflict,
} from "./debateRevisionRecovery.ts";

function session(
  revision: number,
  overrides: Partial<DebateSessionV1> = {},
): DebateSessionV1 {
  return {
    id: "debate-1",
    revision,
    updatedAt: `2026-08-11T12:00:0${revision}.000Z`,
    status: "live",
    phase: "opening",
    stepKey: "opening_for",
    events: [
      {
        id: "event-1",
        sequence: 1,
        kind: "speech",
        speakerKind: "moderator",
        stepKey: "intro",
        content: "The Debate is called to order.",
      },
    ],
    evidence: { exhibits: [] },
    caseBoard: [],
    synopsis: null,
    ...overrides,
  } as DebateSessionV1;
}

describe("Debate revision recovery", () => {
  it("recognizes the API revision-conflict contract", () => {
    assert.equal(
      debateRequestIsRevisionConflict(
        new Error("Debate changed from revision 8 to 11. Refresh and retry."),
      ),
      true,
    );
    assert.equal(
      debateRequestIsRevisionConflict(
        new Error(
          "Debate changed while this turn was being prepared. Refresh and retry.",
        ),
      ),
      true,
    );
    assert.equal(
      debateRequestIsRevisionConflict(new Error("This Debate is paused.")),
      false,
    );
  });

  it("retries metadata-only 8 to 11 drift without resetting presentation", () => {
    const previous = session(8);
    const refreshed = session(11, {
      evidence: {
        ...previous.evidence,
        exhibits: [{ id: "exhibit-1", imageId: "image-1" }],
      },
      caseBoard: [{ id: "card-1", summary: "A refined public claim." }],
    } as Partial<DebateSessionV1>);

    assert.equal(
      debateCanRetryStaleAutomaticAdvance(previous, refreshed),
      true,
    );
  });

  it("adopts a winning floor mutation instead of duplicating its events", () => {
    const previous = session(8);
    const refreshed = session(11, {
      stepKey: "opening_against",
      events: [
        ...previous.events,
        {
          id: "event-2",
          sequence: 2,
          kind: "speech",
          speakerKind: "advocate",
          stepKey: "opening_for",
          content: "The first case is already on the floor.",
        },
      ],
    } as Partial<DebateSessionV1>);

    assert.equal(
      debateCanRetryStaleAutomaticAdvance(previous, refreshed),
      false,
    );
  });
});
