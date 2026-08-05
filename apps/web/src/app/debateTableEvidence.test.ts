import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEventV1,
  type DebateEvidencePacketV1,
} from "@localai/shared";
import {
  debateEventEvidenceIds,
  debateEventIsAdvocateDiscussion,
  debateEventPrimaryTableEvidenceId,
  debateVisibleEvidenceIds,
  resolveDebateTableEvidenceStickyId,
} from "./debateTableEvidence.ts";

function event(
  overrides: Partial<DebateEventV1> & Pick<DebateEventV1, "id" | "sequence">,
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    phase: "opening",
    stepKey: "opening_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "bot-for",
    sideId: "for",
    content: "The faulty hinge proves the door was forced.",
    sourceIds: [],
    createdAt: "2026-07-31T16:00:00.000Z",
    ...overrides,
  };
}

const evidence: DebateEvidencePacketV1 = {
  version: DEBATE_SCHEMA_VERSION,
  notes: "",
  sources: [
    {
      id: "source-1",
      title: "Inspectors report",
      url: "https://example.com/inspectors",
      snippet: "The hinge failed under ordinary use.",
      publishedAt: null,
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      title: "Faulty hinge",
      adjective: "Faulty",
      object: "hinge",
      observation: "Rusted and corroded.",
      emoji: "🔧",
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
    },
    {
      id: "exhibit-2",
      title: "Bent key",
      adjective: "Bent",
      object: "key",
      observation: "Scratched along one edge.",
      emoji: "🔑",
      visualKind: "emoji",
      imageId: null,
      createdBy: "prism",
    },
  ],
  frozenAt: null,
};

describe("Debate table evidence sticky placement", () => {
  it("prefers evidenceSourceId, then unique sourceIds", () => {
    assert.deepEqual(
      debateEventEvidenceIds(
        event({
          id: "a",
          sequence: 1,
          evidenceSourceId: "exhibit-1",
          sourceIds: ["source-1", "exhibit-1"],
        }),
      ),
      ["exhibit-1", "source-1"],
    );
    assert.equal(
      debateEventIsAdvocateDiscussion(
        event({ id: "b", sequence: 2, speakerKind: "moderator" }),
      ),
      false,
    );
    assert.equal(
      debateEventIsAdvocateDiscussion(
        event({
          id: "c",
          sequence: 3,
          kind: "judge_gavel",
          speakerKind: "player",
        }),
      ),
      false,
    );
  });

  it("places the first content marker at turn arm, not metadata-only ids", () => {
    const cited = event({
      id: "place",
      sequence: 1,
      content: "The hinge [[exhibit:exhibit-1]] proves the door was forced.",
      evidenceSourceId: "exhibit-1",
      sourceIds: ["exhibit-1"],
    });
    assert.equal(
      debateEventPrimaryTableEvidenceId(cited, evidence),
      "exhibit-1",
    );
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: null,
        activeEvent: cited,
        presenting: true,
        evidence,
      }),
      "exhibit-1",
    );
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: cited,
        presenting: false,
        evidence,
      }),
      "exhibit-1",
    );
    assert.equal(
      debateEventPrimaryTableEvidenceId(
        event({
          id: "meta-only",
          sequence: 2,
          evidenceSourceId: "exhibit-1",
          sourceIds: ["exhibit-1"],
          content: "I object to that claim.",
        }),
        evidence,
      ),
      null,
    );
  });

  it("replaces sticky evidence when a later turn cites a different piece", () => {
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: event({
          id: "replace",
          sequence: 2,
          content: "The inspectors [[source:source-1]] disagree.",
          evidenceSourceId: "source-1",
          sourceIds: ["source-1"],
        }),
        presenting: true,
        evidence,
      }),
      "source-1",
    );
  });

  it("keeps the first cited piece for the whole turn — no mid-line table swap", () => {
    const cited = event({
      id: "two-exhibits",
      sequence: 3,
      content:
        "First the hinge [[exhibit:exhibit-1]], then the key [[exhibit:exhibit-2]].",
      sourceIds: ["exhibit-1", "exhibit-2"],
    });
    assert.deepEqual(
      debateVisibleEvidenceIds(
        "First the hinge [[exhibit:exhibit-1]], then the key [[exhibit:exhibit-2]].",
      ),
      ["exhibit-1", "exhibit-2"],
    );
    assert.equal(
      debateEventPrimaryTableEvidenceId(cited, evidence),
      "exhibit-1",
    );
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: null,
        activeEvent: cited,
        presenting: true,
        evidence,
        visibleContent: "First the hinge [[exhibit:exhibit-1]], then the key",
      }),
      "exhibit-1",
    );
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: cited,
        presenting: true,
        evidence,
        visibleContent: cited.content,
      }),
      "exhibit-1",
    );
  });

  it("clears sticky evidence when the next advocate turn no longer cites it", () => {
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: event({
          id: "moved-on",
          sequence: 3,
          content: "Forget the hinge; look at the timeline.",
          sourceIds: [],
        }),
        presenting: true,
        evidence,
      }),
      null,
    );
  });

  it("keeps sticky evidence through moderator and Judge gavel beats", () => {
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: event({
          id: "mod",
          sequence: 4,
          kind: "speech",
          speakerKind: "moderator",
          content: "Thank you. Next argument.",
          sourceIds: [],
        }),
        presenting: true,
        evidence,
      }),
      "exhibit-1",
    );
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: event({
          id: "gavel",
          sequence: 5,
          kind: "judge_gavel",
          speakerKind: "player",
          content: "Order.",
          sourceIds: [],
        }),
        presenting: true,
        evidence,
      }),
      "exhibit-1",
    );
  });
});
