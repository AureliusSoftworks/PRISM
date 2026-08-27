import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debateMysteryRoomNarrationTextV2 } from "./debateMysteryV2.ts";

describe("Whodunnit Casekeeper room narration", () => {
  it("turns public appearance and a visible fixture into an anonymous tableau", () => {
    const narration = debateMysteryRoomNarrationTextV2({
      personaName: "Jesus Christ",
      appearance: {
        description: "Middle Eastern Jewish man of first-century Judea, weathered by travel, often seen among crowds",
        style: "simple tunic and mantle with sandals",
        presence: "calm yet intense; gentle with the wounded",
        pronouns: "he/him",
      },
      fixtureLabels: ["bathtub", "window", "mirror"],
    });

    assert.equal(
      narration,
      "A Middle Eastern Jewish man of first-century Judea, weathered by travel, stares solemnly through the window—calm yet intense.",
    );
    assert.doesNotMatch(narration, /Jesus|Christ|victim|evidence|culprit/iu);
  });

  it("uses a neutral name-free fallback when no appearance survived", () => {
    assert.equal(
      debateMysteryRoomNarrationTextV2({
        personaName: "Phoenix Wright",
        fixtureLabels: ["closed door"],
      }),
      "A solitary figure waits near the closed door, listening to the house breathe.",
    );
  });

  it("removes first-name and possessive identity cues from authored appearance", () => {
    const narration = debateMysteryRoomNarrationTextV2({
      personaName: "Phoenix Wright",
      appearance: {
        description: "Phoenix is a spiky-haired attorney, with Wright’s blue suit rumpled from work",
        presence: "restless and alert",
      },
      fixtureLabels: ["window"],
    });

    assert.doesNotMatch(narration, /Phoenix|Wright/iu);
    assert.match(narration, /spiky-haired attorney/iu);
  });

  it("removes short identity tokens as strictly as full names", () => {
    const narration = debateMysteryRoomNarrationTextV2({
      personaName: "Al Li",
      appearance: {
        description: "Al is a suited man, with Li’s silver tie carefully knotted",
        presence: "quiet and composed",
      },
      fixtureLabels: ["door"],
    });

    assert.doesNotMatch(narration, /\b(?:Al|Li)\b/u);
    assert.match(narration, /suited man/iu);
  });
});
