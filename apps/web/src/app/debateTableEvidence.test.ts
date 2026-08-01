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

  it("places evidence when cited and keeps it between turns", () => {
    const placed = resolveDebateTableEvidenceStickyId({
      previousStickyId: null,
      activeEvent: event({
        id: "place",
        sequence: 1,
        evidenceSourceId: "exhibit-1",
      }),
      presenting: true,
      evidence,
    });
    assert.equal(placed, "exhibit-1");
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: placed,
        activeEvent: event({
          id: "place",
          sequence: 1,
          evidenceSourceId: "exhibit-1",
        }),
        presenting: false,
        evidence,
      }),
      "exhibit-1",
    );
  });

  it("replaces sticky evidence when a later event cites a different piece", () => {
    assert.equal(
      resolveDebateTableEvidenceStickyId({
        previousStickyId: "exhibit-1",
        activeEvent: event({
          id: "replace",
          sequence: 2,
          evidenceSourceId: "source-1",
        }),
        presenting: true,
        evidence,
      }),
      "source-1",
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
