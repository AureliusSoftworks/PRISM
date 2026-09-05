import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS,
  debateModeratorLookAtRole,
} from "./debateModeratorGaze.ts";

describe("debateModeratorLookAtRole", () => {
  it("keeps looking at the floor holder when the Moderator is not speaking", () => {
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "for",
        moderatorTalking: false,
        speechElapsedMs: 4_000,
      }),
      "for",
    );
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "against",
        moderatorTalking: true,
        speechElapsedMs: 4_000,
      }),
      "against",
    );
  });

  it("returns null while the Moderator owns the floor but is not speaking", () => {
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "moderator",
        moderatorTalking: false,
        speechElapsedMs: 0,
      }),
      null,
    );
  });

  it("alternates left and right podiums during a Moderator monologue", () => {
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "moderator",
        moderatorTalking: true,
        speechElapsedMs: 0,
      }),
      "for",
    );
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "moderator",
        moderatorTalking: true,
        speechElapsedMs: DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS - 1,
      }),
      "for",
    );
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "moderator",
        moderatorTalking: true,
        speechElapsedMs: DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS,
      }),
      "against",
    );
    assert.equal(
      debateModeratorLookAtRole({
        turnOwnerRole: "moderator",
        moderatorTalking: true,
        speechElapsedMs: DEBATE_MODERATOR_MONOLOGUE_LOOK_SIDE_MS * 2,
      }),
      "for",
    );
  });
});
