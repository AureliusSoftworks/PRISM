import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debateFlytingRitualCueForEvent } from "./debateFlytingAudio.ts";

describe("Flyting ritual audio", () => {
  it("maps only bounded public beats to ritual cues", () => {
    assert.equal(
      debateFlytingRitualCueForEvent({ kind: "intro", stepKey: "flyting_intro", content: "Hear me." }),
      "opening",
    );
    assert.equal(
      debateFlytingRitualCueForEvent({ kind: "speech", stepKey: "flyting_challenge_2", content: "A charge." }),
      "challenge",
    );
    assert.equal(
      debateFlytingRitualCueForEvent({ kind: "silence", stepKey: "flyting_rejoinder_2", content: "Yield." }),
      "yield",
    );
    assert.equal(
      debateFlytingRitualCueForEvent({ kind: "ballot", stepKey: "flyting_hall_vote_3", content: "My vote." }),
      "vote",
    );
    assert.equal(
      debateFlytingRitualCueForEvent({ kind: "speech", stepKey: "intro", content: "Ordinary Forum." }),
      null,
    );
  });
});
