import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateEvidencePacketV1,
} from "@localai/shared";
import {
  commitDebateEvidenceMentionAtCaret,
  composeEvidenceMentionTabPlainTextAction,
  debateEvidenceMentionPicks,
  filterEvidenceForMentionQuery,
  formatDebateEvidenceMentionMarker,
  normalizeDebateEvidenceMentionQuery,
  parseDebateEvidenceMentionQuery,
} from "./debateEvidenceMention.ts";

const PACKET: DebateEvidencePacketV1 = {
  version: DEBATE_SCHEMA_VERSION,
  notes: "",
  sources: [
    {
      id: "brave-1",
      title: "Phone distraction study",
      url: "https://example.com/brave",
      snippet: "Classroom phones divert attention.",
      publishedAt: null,
    },
    {
      id: "scholar-2",
      title: "Adolescent contact needs",
      url: "https://example.com/scholar",
      snippet: "Family access remains salient.",
      publishedAt: "2020",
    },
    {
      id: "url-1",
      title: "District handbook",
      url: "https://example.com/handbook",
      snippet: "Local policy excerpt.",
      publishedAt: null,
    },
  ],
  exhibits: [
    {
      id: "exhibit-1",
      adjective: "Locked",
      object: "phone pouch",
      title: "Locked phone pouch",
      observation: "A fabric pouch sealed until the bell.",
      emoji: "📱",
      visualKind: "emoji",
      imageId: null,
      createdBy: "player",
    },
  ],
  frozenAt: "2026-08-07T12:00:00.000Z",
};

describe("debateEvidenceMention", () => {
  const picks = debateEvidenceMentionPicks(PACKET);

  it("builds picks for exhibits, Brave, Scholar, and URL sources", () => {
    assert.deepEqual(
      picks.map((pick) => [pick.propKind, pick.id, pick.markerKind]),
      [
        ["brave", "brave-1", "source"],
        ["scholar", "scholar-2", "source"],
        ["url", "url-1", "source"],
        ["exhibit", "exhibit-1", "exhibit"],
      ],
    );
  });

  it("formats citation markers for the frozen wire format", () => {
    assert.equal(
      formatDebateEvidenceMentionMarker({
        markerKind: "exhibit",
        id: "exhibit-1",
      }),
      "[[exhibit:exhibit-1]]",
    );
    assert.equal(
      formatDebateEvidenceMentionMarker({
        markerKind: "source",
        id: "brave-1",
      }),
      "[[source:brave-1]]",
    );
  });

  it("filters by exhibit / brave / scholar path queries and typos", () => {
    assert.equal(normalizeDebateEvidenceMentionQuery("[Exibit/Brave]-#"), "exibit/brave");
    assert.deepEqual(
      [...(parseDebateEvidenceMentionQuery("[exhibit/scholar]").propKinds ?? [])].sort(),
      ["exhibit", "scholar"],
    );
    assert.deepEqual(
      filterEvidenceForMentionQuery(picks, "brave").map((pick) => pick.id),
      ["brave-1"],
    );
    assert.deepEqual(
      filterEvidenceForMentionQuery(picks, "exibit").map((pick) => pick.id),
      ["exhibit-1"],
    );
    assert.deepEqual(
      filterEvidenceForMentionQuery(picks, "scholar-2").map((pick) => pick.id),
      ["scholar-2"],
    );
    assert.deepEqual(
      filterEvidenceForMentionQuery(picks, "pouch").map((pick) => pick.id),
      ["exhibit-1"],
    );
  });

  it("commits the highlighted evidence marker over the active @ token", () => {
    const draft = "Look at @brav";
    const caret = draft.length;
    const tab = composeEvidenceMentionTabPlainTextAction(
      draft,
      caret,
      picks,
      0,
    );
    assert.equal(tab.kind, "insert");
    if (tab.kind !== "insert") return;
    assert.equal(tab.replacement, "Look at [[source:brave-1]]");
    assert.equal(tab.caret, "Look at [[source:brave-1]]".length);

    const click = commitDebateEvidenceMentionAtCaret(
      "Cite @",
      6,
      picks.find((pick) => pick.id === "exhibit-1")!,
    );
    assert.equal(click.kind, "insert");
    if (click.kind !== "insert") return;
    assert.equal(click.replacement, "Cite [[exhibit:exhibit-1]]");
  });
});
