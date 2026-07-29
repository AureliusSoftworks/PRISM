import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
