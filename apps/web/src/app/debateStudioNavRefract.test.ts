import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID,
  DEBATE_STUDIO_NAV_CAST_REFRACT_ID,
  DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID,
  DEBATE_STUDIO_NAV_MOTION_REFRACT_ID,
  DEBATE_STUDIO_NAV_REFRACT_IDS,
  DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID,
  debateStudioNavArchiveNotice,
  debateStudioNavCastCanRandomize,
  debateStudioNavCastMinimumBots,
  debateStudioNavMotionSeed,
  nextDebateArchiveHighlightId,
} from "./debateStudioNavRefract.ts";

describe("debateStudioNavRefract", () => {
  it("registers every Shape the Debate rail item as a Refract target id", () => {
    assert.deepEqual(DEBATE_STUDIO_NAV_REFRACT_IDS, [
      DEBATE_STUDIO_NAV_MOTION_REFRACT_ID,
      DEBATE_STUDIO_NAV_CAST_REFRACT_ID,
      DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID,
      DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID,
      DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID,
    ]);
    assert.equal(DEBATE_STUDIO_NAV_MOTION_REFRACT_ID, "debate:studio-nav-motion");
    assert.equal(DEBATE_STUDIO_NAV_CAST_REFRACT_ID, "debate:studio-nav-cast");
    assert.equal(
      DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID,
      "debate:studio-nav-evidence",
    );
    assert.equal(
      DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID,
      "debate:studio-nav-archive",
    );
    assert.equal(
      DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID,
      "debate:studio-nav-stage-layout",
    );
  });

  it("seeds Motion from the live idea, then the motion, then a local roll", () => {
    assert.equal(
      debateStudioNavMotionSeed({
        topic: "  Free transit  ",
        motion: "This house would ban cars.",
        randomTerritory: () => "Celebrity defaults",
      }),
      "Free transit",
    );
    assert.equal(
      debateStudioNavMotionSeed({
        topic: "   ",
        motion: "  Should AI art count as art?  ",
        randomTerritory: () => "Celebrity defaults",
      }),
      "Should AI art count as art?",
    );
    assert.equal(
      debateStudioNavMotionSeed({
        topic: "",
        motion: "",
        randomTerritory: (current) => `rolled:${current}`,
      }),
      "rolled:",
    );
  });

  it("requires three Library bots only when the player is a Spectator", () => {
    assert.equal(debateStudioNavCastMinimumBots("judge"), 2);
    assert.equal(debateStudioNavCastMinimumBots("participant"), 2);
    assert.equal(debateStudioNavCastMinimumBots("spectator"), 3);
    assert.equal(debateStudioNavCastCanRandomize(2, "judge"), true);
    assert.equal(debateStudioNavCastCanRandomize(2, "spectator"), false);
    assert.equal(debateStudioNavCastCanRandomize(3, "spectator"), true);
  });

  it("highlights a different Archive proceeding without wiping the list", () => {
    assert.equal(nextDebateArchiveHighlightId([], null, () => 0), null);
    assert.equal(
      nextDebateArchiveHighlightId(["only"], "only", () => 0.9),
      "only",
    );
    assert.equal(
      nextDebateArchiveHighlightId(["a", "b", "c"], "b", () => 0),
      "a",
    );
    assert.equal(
      nextDebateArchiveHighlightId(["a", "b", "c"], "b", () => 0.99),
      "c",
    );
    assert.equal(
      nextDebateArchiveHighlightId(["a", "b"], null, () => 0.6),
      "b",
    );
  });

  it("explains Archive as a safe record when there is nothing to generate", () => {
    assert.deepEqual(
      debateStudioNavArchiveNotice({
        highlightedId: null,
        sessionCount: 0,
        alreadyExpanded: false,
      }),
      {
        title: "Archive is a record",
        detail:
          "There are no proceedings to highlight yet. Prism will not invent or erase Archive history.",
      },
    );
    assert.match(
      debateStudioNavArchiveNotice({
        highlightedId: "a",
        sessionCount: 3,
        alreadyExpanded: false,
      }).detail,
      /different saved proceeding/u,
    );
    assert.match(
      debateStudioNavArchiveNotice({
        highlightedId: "only",
        sessionCount: 1,
        alreadyExpanded: true,
      }).detail,
      /only saved proceeding/u,
    );
  });
});
