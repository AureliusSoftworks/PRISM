import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  debateMysteryRoomCasekeeperNarrationTextV2,
  debateMysteryRoomIntroductionGestureV2,
  debateMysteryRoomIntroductionShouldAutoCompleteV2,
} from "./debateMysteryRoomIntroduction.ts";

describe("Whodunnit room introduction presentation", () => {
  it("uses two Casekeeper gestures before handing off to the persona", () => {
    assert.equal(
      debateMysteryRoomIntroductionGestureV2({
        casekeeperNarrationVisible: false,
        phase: "casekeeper",
      }),
      "reveal_casekeeper_narration",
    );
    assert.equal(
      debateMysteryRoomIntroductionGestureV2({
        casekeeperNarrationVisible: true,
        phase: "casekeeper",
      }),
      "advance_to_persona",
    );
    assert.equal(
      debateMysteryRoomIntroductionGestureV2({
        casekeeperNarrationVisible: true,
        phase: "persona",
      }),
      "finish_dialogue",
    );
  });

  it("auto-completes only a naturally settled persona beat", () => {
    assert.equal(debateMysteryRoomIntroductionShouldAutoCompleteV2({
      busy: false,
      hasActiveAudio: false,
      hasHeldDialogue: false,
      hasQueuedDialogue: false,
      phase: "persona",
    }), true);
    assert.equal(debateMysteryRoomIntroductionShouldAutoCompleteV2({
      busy: false,
      hasActiveAudio: false,
      hasHeldDialogue: true,
      hasQueuedDialogue: false,
      phase: "persona",
    }), false, "a skipped line remains until its explicit dismissal");
    assert.equal(debateMysteryRoomIntroductionShouldAutoCompleteV2({
      busy: false,
      hasActiveAudio: false,
      hasHeldDialogue: false,
      hasQueuedDialogue: true,
      phase: "persona",
    }), false);
    assert.equal(debateMysteryRoomIntroductionShouldAutoCompleteV2({
      busy: false,
      hasActiveAudio: false,
      hasHeldDialogue: false,
      hasQueuedDialogue: false,
      phase: "casekeeper",
    }), false);
  });

  it("narrates the visible persona anonymously before their entrance", () => {
    const narration = debateMysteryRoomCasekeeperNarrationTextV2({
      personaName: "Jesus Christ",
      appearance: {
        description: "Middle Eastern Jewish man of first-century Judea, weathered by travel, often seen among crowds",
        presence: "calm yet intense; gentle with the wounded",
      },
      fixtureLabels: ["bathtub", "window", "mirror"],
    });
    assert.equal(
      narration,
      "A Middle Eastern Jewish man of first-century Judea, weathered by travel, stares solemnly through the window—calm yet intense.",
    );
    assert.doesNotMatch(narration, /Jesus|Christ|occupant/iu);
  });

  it("prefers the frozen Casekeeper tableau over mutable profile cues", () => {
    assert.equal(
      debateMysteryRoomCasekeeperNarrationTextV2({
        personaName: "Phoenix Wright",
        appearance: { description: "Spiky dark hair" },
        fixtureLabels: ["window"],
        persistedNarration: "A blue-suited figure studies the rain beyond the glass.",
      }),
      "A blue-suited figure studies the rain beyond the glass.",
    );
  });

  it("never revives a legacy named occupant card as narration", () => {
    const narration = debateMysteryRoomCasekeeperNarrationTextV2({
      personaName: "Phoenix Wright",
      appearance: {
        description: "Spiky dark hair, sharp brown eyes, a wrinkled blue suit",
        presence: "restless and alert",
      },
      fixtureLabels: ["window"],
      persistedNarration: "Phoenix waits by the window while Wright’s sigil glows.",
    });
    assert.doesNotMatch(narration, /Phoenix|Wright|color|sigil/iu);
    assert.match(narration, /^A figure with spiky dark hair/iu);
  });
});
