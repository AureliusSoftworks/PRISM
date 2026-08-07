import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateSessionV1,
  type DebateSetupSuggestionV1,
} from "@localai/shared";
import {
  applyDebateSetupSuggestion,
  emptyPreferredJurorBotIds,
  preferredJurorBotIdsFromSession,
} from "./debateExperienceState.ts";

function baseExhibits(): DebateSetupSuggestionV1["exhibits"] {
  return [
    {
      id: "exhibit-1",
      adjective: "Mossy",
      object: "brick",
      title: "Mossy brick",
      observation: "Moss covers one face.",
      emoji: "🧱",
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
    },
    {
      id: "exhibit-2",
      adjective: "Folded",
      object: "permit",
      title: "Folded permit",
      observation: "The stamp is unsigned.",
      emoji: "📄",
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
    },
  ];
}

describe("applyDebateSetupSuggestion", () => {
  it("maps a Judge New Duel draft into Studio-ready fields", () => {
    const suggestion: DebateSetupSuggestionV1 = {
      topic: "Urban wildlife",
      motion: {
        version: DEBATE_SCHEMA_VERSION,
        id: "setup-1",
        title: "Wild Lots",
        motion: "Cities should rewild vacant lots.",
        forSide: {
          label: "Rewild",
          brief: "Habitat restores local ecology.",
        },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      format: "forum",
      formality: "parliamentary",
      forumRoundMode: "auto",
      forumRoundCount: 1,
      juryEnabled: false,
      setupPresetId: "classic-duel",
      playerRole: "judge",
      playerSideId: null,
      moderatorBotId: null,
      moderatorTitle: "Keeper of the Lots",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      notes: "Keep props playful.",
      exhibits: baseExhibits(),
      sources: [
        {
          id: "brave-1",
          title: "Lot study",
          url: "https://example.com/lots",
          snippet: "Vacant lots store carbon.",
          publishedAt: null,
        },
      ],
      researchMeta: {
        webQuery: "urban rewilding",
        scholarQuery: "vacant lot ecology",
        sourcesSkippedReason: "local",
      },
    };

    const applied = applyDebateSetupSuggestion(suggestion);
    assert.equal(applied.playerRole, "judge");
    assert.equal(applied.playerSideId, "for");
    assert.equal(applied.moderatorTitle, "Keeper of the Lots");
    assert.equal(applied.cast.moderator, "");
    assert.equal(applied.cast.forAdvocate, "bot-a");
    assert.equal(applied.cast.againstAdvocate, "bot-b");
    assert.equal(applied.selectedPresetId, "classic-duel");
    assert.equal(applied.evidence.exhibits?.length, 2);
    assert.equal(applied.evidence.sources.length, 1);
    assert.equal(applied.researchQuery, "urban rewilding");
    assert.match(applied.sourcesSkippedNotice ?? "", /LOCAL mode/u);
  });

  it("keeps Spectator Jury + moderator cast from Prism", () => {
    const suggestion: DebateSetupSuggestionV1 = {
      topic: "Urban wildlife",
      motion: {
        version: DEBATE_SCHEMA_VERSION,
        id: "setup-2",
        title: "Wild Lots",
        motion: "Cities should rewild vacant lots.",
        forSide: { label: "Rewild", brief: "Habitat restores local ecology." },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      format: "forum",
      formality: "plainspoken",
      forumRoundMode: "auto",
      forumRoundCount: 2,
      juryEnabled: true,
      setupPresetId: "public-forum",
      playerRole: "spectator",
      playerSideId: null,
      moderatorBotId: "bot-c",
      moderatorTitle: "Town Hall Host",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      notes: "",
      exhibits: baseExhibits(),
      sources: [],
      researchMeta: {
        webQuery: "",
        scholarQuery: "",
        sourcesSkippedReason: null,
      },
    };

    const applied = applyDebateSetupSuggestion(suggestion);
    assert.equal(applied.playerRole, "spectator");
    assert.equal(applied.juryEnabled, true);
    assert.equal(applied.selectedPresetId, "public-forum");
    assert.equal(applied.moderatorTitle, "Town Hall Host");
    assert.equal(applied.cast.moderator, "bot-c");
    assert.equal(applied.cast.forAdvocate, "bot-a");
    assert.equal(applied.cast.againstAdvocate, "bot-b");
  });

  it("clears the player's Crossfire seat while keeping the opponent", () => {
    const suggestion: DebateSetupSuggestionV1 = {
      topic: "Urban wildlife",
      motion: {
        version: DEBATE_SCHEMA_VERSION,
        id: "setup-3",
        title: "Wild Lots",
        motion: "Cities should rewild vacant lots.",
        forSide: { label: "Rewild", brief: "Habitat restores local ecology." },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      format: "forum",
      formality: "heated",
      forumRoundMode: "fixed",
      forumRoundCount: 2,
      juryEnabled: false,
      setupPresetId: "take-the-floor",
      playerRole: "participant",
      playerSideId: "against",
      moderatorBotId: "bot-c",
      moderatorTitle: "Crossfire Marshal",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      notes: "",
      exhibits: baseExhibits(),
      sources: [],
      researchMeta: {
        webQuery: "",
        scholarQuery: "",
        sourcesSkippedReason: null,
      },
    };

    const applied = applyDebateSetupSuggestion(suggestion);
    assert.equal(applied.playerRole, "participant");
    assert.equal(applied.playerSideId, "against");
    assert.equal(applied.selectedPresetId, "take-the-floor");
    assert.equal(applied.moderatorTitle, "Crossfire Marshal");
    assert.equal(applied.cast.moderator, "bot-c");
    assert.equal(applied.cast.forAdvocate, "bot-a");
    assert.equal(applied.cast.againstAdvocate, "");
  });
});

describe("preferred Jury seat helpers", () => {
  it("starts every seat on Surprise", () => {
    assert.deepEqual(emptyPreferredJurorBotIds(), [
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("restores library pins and leaves generic seats on Surprise", () => {
    const session = {
      jury: {
        enabled: true,
        jurors: [
          { id: "juror-a", source: "library" },
          { id: "prism-juror:evidence", source: "generic" },
          { id: "juror-b", source: "library" },
          { id: "missing", source: "library" },
          { id: "juror-c", source: "library" },
        ],
      },
    } as unknown as DebateSessionV1;
    assert.deepEqual(
      preferredJurorBotIdsFromSession(session, ["juror-a", "juror-b", "juror-c"]),
      ["juror-a", null, "juror-b", null, "juror-c"],
    );
  });
});
