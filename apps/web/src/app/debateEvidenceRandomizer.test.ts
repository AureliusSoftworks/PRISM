import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_EVIDENCE_QUERY_LENSES,
  randomDebateEvidenceQuery,
} from "./debateEvidenceRandomizer.ts";

describe("Debate evidence query randomizer", () => {
  it("varies a real-source research lens around the current motion", () => {
    const first = randomDebateEvidenceQuery(
      "This house would build.",
      "",
      () => 0,
    );
    const last = randomDebateEvidenceQuery(
      "This house would build.",
      "",
      () => 0.999,
    );

    assert.equal(
      first,
      `This house would build. ${DEBATE_EVIDENCE_QUERY_LENSES[0]}`,
    );
    assert.equal(
      last,
      `This house would build. ${DEBATE_EVIDENCE_QUERY_LENSES.at(-1)}`,
    );
    assert.notEqual(first, last);
  });

  it("falls back to the topic and refuses to invent a subject", () => {
    assert.equal(
      randomDebateEvidenceQuery("", "  Housing   near transit  ", () => 0),
      `Housing near transit ${DEBATE_EVIDENCE_QUERY_LENSES[0]}`,
    );
    assert.equal(
      randomDebateEvidenceQuery("  ", "  ", () => 0),
      "",
    );
  });

  it("keeps generated Brave queries within the API limit", () => {
    assert.equal(
      randomDebateEvidenceQuery("x".repeat(700), "", () => 0).length,
      500,
    );
  });
});
