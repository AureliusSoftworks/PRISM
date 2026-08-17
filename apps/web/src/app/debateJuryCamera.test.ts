import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import {
  debateEventUsesJuryCamera,
  debateJuryChamberStepActive,
  debateJuryDeliberationStepActive,
  debateJuryEventCanPresent,
  debateJuryEventIsPubliclyAudible,
  debateJuryPresentationKeepsForumCamera,
  debateJuryPresentationUsesChamber,
  debateLiveCameraViewWithJuryLock,
} from "./debateJuryCamera.ts";

function session(
  stepKey = "closing_for",
): Pick<DebateSessionV1, "jury" | "stepKey"> {
  return {
    stepKey,
    jury: {
      jurors: [{ id: "juror-1" }],
    },
  } as Pick<DebateSessionV1, "jury" | "stepKey">;
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
    assert.equal(
      debateEventUsesJuryCamera(
        event({
          kind: "ballot",
          speakerKind: "moderator",
          speakerBotId: "moderator-1",
          stepKey: "jury_moderator_ballot",
        }),
      ),
      true,
    );
  });

  it("keeps jurors silent until a formal chamber beat", () => {
    assert.equal(
      debateJuryEventIsPubliclyAudible(
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
      debateJuryEventIsPubliclyAudible(
        event({
          kind: "reaction",
          speakerKind: "juror",
          speakerBotId: "juror-1",
          stepKey: "persona_reaction_2",
        }),
      ),
      false,
    );
    assert.equal(
      debateJuryEventIsPubliclyAudible(
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
      debateJuryEventIsPubliclyAudible(
        event({
          kind: "speech",
          speakerKind: "moderator",
          speakerBotId: "moderator-1",
          stepKey: "intro",
        }),
      ),
      true,
    );
  });

  it("keeps inter-round Jury sidebar commentary out of the chamber", () => {
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

  it("stays in the chamber while the next juror warms up during deliberation", () => {
    const deliberation = event({
      kind: "jury_deliberation",
      speakerKind: "juror",
      speakerBotId: "juror-1",
      stepKey: "jury_deliberation_0",
    });
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_1"), {
        presenting: true,
        event: deliberation,
        preparingSpeakerBotId: "juror-2",
      }),
      false,
    );
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_1"), {
        presenting: true,
        event: null,
        preparingSpeakerBotId: "juror-2",
      }),
      false,
    );
  });

  it("locks the live camera to Jury over Forum coverage, mute glances, and pause-Wide", () => {
    assert.equal(
      debateLiveCameraViewWithJuryLock({
        juryCameraActive: true,
        forumView: "wide",
      }),
      "jury",
    );
    assert.equal(
      debateLiveCameraViewWithJuryLock({
        juryCameraActive: true,
        forumView: "left",
      }),
      "jury",
    );
    assert.equal(
      debateLiveCameraViewWithJuryLock({
        juryCameraActive: false,
        forumView: "moderator",
      }),
      "moderator",
    );
    assert.equal(
      debateJuryDeliberationStepActive(session("jury_deliberation_2")),
      true,
    );
    assert.equal(debateJuryDeliberationStepActive(session("jury_final_0")), false);
    assert.equal(debateJuryChamberStepActive(session("jury_initial_0")), true);
    assert.equal(debateJuryChamberStepActive(session("jury_final_1")), true);
    assert.equal(
      debateJuryChamberStepActive(session("jury_moderator_ballot")),
      true,
    );
    assert.equal(
      debateJuryChamberStepActive(session("jury_aftermath_for")),
      false,
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
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_0"), {
        presenting: false,
        event: event(),
        preparingSpeakerBotId: null,
      }),
      true,
    );
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_0"), {
        presenting: false,
        event: null,
        preparingSpeakerBotId: null,
      }),
      false,
    );
  });

  it("keeps the Forum for a Moderator re-intro even from a Jury bookmark", () => {
    const deliberation = event({
      kind: "jury_deliberation",
      speakerKind: "juror",
      speakerBotId: "juror-1",
      stepKey: "jury_deliberation_0",
    });
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_0"), {
        presenting: false,
        event: null,
        preparingSpeakerBotId: "moderator-1",
        resumeCeremonyActive: true,
        bookmarkEvent: deliberation,
      }),
      true,
    );
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_deliberation_0"), {
        presenting: false,
        event: null,
        preparingSpeakerBotId: null,
        bookmarkEvent: event(),
      }),
      true,
    );
  });

  it("keeps the Moderator's last ballot inside the Jury chamber", () => {
    const moderatorBallot = event({
      kind: "ballot",
      speakerKind: "moderator",
      speakerBotId: "moderator-1",
      stepKey: "jury_moderator_ballot",
    });
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_moderator_ballot"), {
        presenting: true,
        event: moderatorBallot,
        preparingSpeakerBotId: null,
      }),
      false,
    );
    assert.equal(
      debateJuryPresentationUsesChamber(session("jury_moderator_ballot"), {
        presenting: true,
        event: moderatorBallot,
        preparingSpeakerBotId: null,
      }),
      true,
    );
  });

  it("stays in the chamber while the next juror prepares a final ballot", () => {
    assert.equal(
      debateJuryPresentationKeepsForumCamera(session("jury_final_1"), {
        presenting: true,
        event: null,
        preparingSpeakerBotId: "juror-2",
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
