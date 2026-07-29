import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEBATE_SCHEMA_VERSION, type DebateEventV1 } from "@localai/shared";
import {
  DEBATE_GAVEL_FOLEY_URLS,
  debateModeratorGavelCue,
  debateModeratorGavelSpeechLeadMs,
  debateVocalFoleyTargetId,
  type DebateFoleyParticipant,
} from "./debateFoley.ts";

const participants = [
  {
    id: "for",
    role: "for",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
  {
    id: "moderator",
    role: "moderator",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
  {
    id: "against",
    role: "against",
    active: false,
    thinking: false,
    hardMuted: false,
    hidden: false,
  },
] as const satisfies readonly DebateFoleyParticipant[];

function debateEvent(
  kind: DebateEventV1["kind"],
  overrides: Partial<DebateEventV1> = {},
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: `event:${kind}`,
    sequence: 1,
    phase: "opening",
    stepKey: kind,
    kind,
    speakerKind: "system",
    speakerBotId: null,
    sideId: null,
    content: kind,
    sourceIds: [],
    createdAt: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("Debate vocal Foley", () => {
  it("keeps casual mouth sounds out of the formal Forum", () => {
    for (const kind of ["mouth-sound", "lip-smack"] as const) {
      assert.equal(
        debateVocalFoleyTargetId({
          sessionId: "debate-1",
          cueIndex: 0,
          kind,
          participants,
        }),
        null,
      );
    }
  });

  it("prefers the moderator for an inhale or throat-clear", () => {
    for (const kind of ["soft-inhale", "throat-clear"] as const) {
      assert.equal(
        debateVocalFoleyTargetId({
          sessionId: "debate-1",
          cueIndex: 0,
          kind,
          participants,
        }),
        "moderator",
      );
    }
  });

  it("gives a sigh to a listening advocate", () => {
    const target = debateVocalFoleyTargetId({
      sessionId: "debate-1",
      cueIndex: 0,
      kind: "soft-sigh",
      participants: participants.map((participant) => ({
        ...participant,
        active: participant.id === "for",
      })),
    });
    assert.equal(target, "against");
  });

  it("never targets the floor holder, thinker, hidden bot, or hard mute", () => {
    assert.equal(
      debateVocalFoleyTargetId({
        sessionId: "debate-1",
        cueIndex: 2,
        kind: "throat-clear",
        participants: [
          { ...participants[0], active: true },
          { ...participants[1], hardMuted: true },
          { ...participants[2], hidden: true, thinking: true },
        ],
      }),
      null,
    );
  });
});

describe("Debate moderator gavel", () => {
  it("opens either format with one restrained attention strike", () => {
    for (const format of ["forum", "turnabout"] as const) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format,
          event: debateEvent("intro"),
          moderatorBotId: "moderator",
        }),
        { eventId: "event:intro", kind: "attention" },
      );
    }
  });

  it("lets a canonically silent moderator signal without speech", () => {
    assert.deepEqual(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("silence", {
          speakerKind: "moderator",
          speakerBotId: "moderator",
        }),
        moderatorBotId: "moderator",
      }),
      { eventId: "event:silence", kind: "attention" },
    );
  });

  it("uses the gavel more often for Turnabout procedure", () => {
    for (const kind of ["phase", "objection", "revelation"] as const) {
      assert.equal(
        debateModeratorGavelCue({
          format: "forum",
          event: debateEvent(kind),
          moderatorBotId: "moderator",
        }),
        null,
      );
      assert.deepEqual(
        debateModeratorGavelCue({
          format: "turnabout",
          event: debateEvent(kind),
          moderatorBotId: "moderator",
        }),
        { eventId: `event:${kind}`, kind: "attention" },
      );
    }
  });

  it("calls the room to order for moderator rulings and bot verdicts", () => {
    for (const event of [
      debateEvent("moderator_ruling", {
        speakerKind: "moderator",
        speakerBotId: "moderator",
      }),
      debateEvent("verdict"),
    ]) {
      assert.deepEqual(
        debateModeratorGavelCue({
          format: "forum",
          event,
          moderatorBotId: "moderator",
        }),
        { eventId: event.id, kind: "order" },
      );
    }
    assert.equal(
      debateModeratorGavelCue({
        format: "turnabout",
        event: debateEvent("verdict", { speakerKind: "player" }),
        moderatorBotId: "moderator",
      }),
      null,
    );
  });

  it("keeps ordinary speeches quiet and gives order a longer procedural beat", () => {
    assert.equal(
      debateModeratorGavelCue({
        format: "forum",
        event: debateEvent("speech", {
          speakerKind: "advocate",
          speakerBotId: "for",
        }),
        moderatorBotId: "moderator",
      }),
      null,
    );
    assert.ok(
      debateModeratorGavelSpeechLeadMs("order") >
        debateModeratorGavelSpeechLeadMs("attention"),
    );
    assert.equal(
      DEBATE_GAVEL_FOLEY_URLS.attention,
      "/audio/debate/gavel-attention.mp3",
    );
    assert.equal(
      DEBATE_GAVEL_FOLEY_URLS.order,
      "/audio/debate/gavel-order.mp3",
    );
  });
});
