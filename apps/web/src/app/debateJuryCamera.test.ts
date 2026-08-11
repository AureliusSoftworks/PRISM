import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import {
  debateJuryEventCanPresent,
  debateJuryPresentationKeepsForumCamera,
  debateJuryPresentationUsesChamber,
} from "./debateJuryCamera.ts";

function session(): Pick<DebateSessionV1, "jury"> {
  return {
    jury: {
      jurors: [{ id: "juror-1" }],
    },
  } as Pick<DebateSessionV1, "jury">;
}

function event(
  overrides: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    kind: "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: "moderator-1",
    stepKey: "closing_for",
    ...overrides,
  } as DebateEventV1;
}

describe("Debate Jury camera handoff", () => {
  it("keeps the closing moderator handoff in the Forum while it presents", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: event(),
        preparingSpeakerBotId: null,
      }),
      true,
    );
  });

  it("also holds the Forum while a queued moderator line prepares its voice", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: null,
        preparingSpeakerBotId: "moderator-1",
      }),
      true,
    );
  });

  it("lets the preparing speaker supersede the previously presented event", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: event(),
        preparingSpeakerBotId: "juror-1",
      }),
      false,
    );
  });

  it("allows Jury events and an idle Jury step to use the chamber", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: event({
          kind: "ballot",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_final_0",
        }),
        preparingSpeakerBotId: null,
      }),
      false,
    );
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: false,
        event: event(),
        preparingSpeakerBotId: null,
      }),
      false,
    );
  });

  it("keeps unheard Jury events presentable after a Spectator bake completes", () => {
    const bakedSpectator = {
      ...session(),
      playerRole: "spectator" as const,
      jury: { ...session().jury, enabled: true },
    };
    const deliberation = event({
      kind: "jury_deliberation",
      speakerKind: "juror",
      speakerBotId: "juror-1",
      stepKey: "jury_deliberation_0",
    });
    const ballot = event({
      kind: "ballot",
      speakerKind: "juror",
      speakerBotId: "juror-1",
      stepKey: "jury_final_0",
    });

    assert.equal(debateJuryEventCanPresent(bakedSpectator, deliberation), true);
    assert.equal(debateJuryEventCanPresent(bakedSpectator, ballot), true);
    assert.equal(
      debateJuryEventCanPresent(
        { ...bakedSpectator, playerRole: "participant" },
        deliberation,
      ),
      false,
    );
  });

  it("lets the presented Jury event own the chamber after server completion", () => {
    assert.equal(
      debateJuryPresentationUsesChamber(session(), {
        presenting: true,
        event: event({
          kind: "jury_deliberation",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_deliberation_0",
        }),
        preparingSpeakerBotId: null,
      }),
      true,
    );
    assert.equal(
      debateJuryPresentationUsesChamber(session(), {
        presenting: true,
        event: null,
        preparingSpeakerBotId: "juror-1",
      }),
      true,
    );
  });
});
