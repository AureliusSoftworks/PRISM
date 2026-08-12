import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import {
  debateEventUsesJuryCamera,
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
  it("limits automatic chamber ownership to formal Jury record beats", () => {
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "jury_deliberation",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_deliberation_0",
        }),
      ),
      true,
    );
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "ballot",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_final_0",
        }),
      ),
      true,
    );
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "jury_verdict",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_aftermath_for",
        }),
      ),
      true,
    );
  });

  it("keeps inter-round Jury sidebar commentary and the moderator ballot out of the chamber", () => {
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "jury_deliberation",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_sidebar_2",
        }),
      ),
      false,
    );
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "reaction",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_sidebar_2",
        }),
      ),
      false,
    );
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "ballot",
          speakerKind: "moderator",
          speakerBotId: "moderator-1",
          stepKey: "jury_moderator_ballot",
        }),
      ),
      false,
    );
  });

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

  it("keeps the Forum while a juror prepares before deliberation is visible", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: event(),
        preparingSpeakerBotId: "juror-1",
      }),
      true,
    );
  });

  it("keeps ordinary ballots on the Forum and leaves an idle Jury step alone", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: event({
          kind: "ballot",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "ordinary_ballot",
        }),
        preparingSpeakerBotId: null,
      }),
      true,
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

  it("cuts back to the Moderator camera for the fifth and final ballot", () => {
    const moderatorBallot = event({
      kind: "ballot",
      speakerKind: "moderator",
      speakerBotId: "moderator-1",
      stepKey: "jury_moderator_ballot",
    });
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session(), {
        presenting: true,
        event: moderatorBallot,
        preparingSpeakerBotId: null,
      }),
      true,
    );
    assert.equal(
      debateJuryPresentationUsesChamber(session(), {
        presenting: true,
        event: moderatorBallot,
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

  it("lets only presented formal Jury beats own the chamber after server completion", () => {
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
        event: event({
          kind: "ballot",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_final_0",
        }),
        preparingSpeakerBotId: null,
      }),
      true,
    );
    assert.equal(
      debateJuryPresentationUsesChamber(session(), {
        presenting: true,
        event: event({
          kind: "jury_deliberation",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "jury_sidebar_2",
        }),
        preparingSpeakerBotId: null,
      }),
      false,
    );
  });
});
