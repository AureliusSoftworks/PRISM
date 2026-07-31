import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalDebateUrlEvidenceUrl,
  debateUrlEvidenceSourceFromDraft,
  emptyDebateUrlEvidenceDraft,
} from "./debateUrlEvidence.ts";

describe("Debate URL evidence", () => {
  it("normalizes an editable draft into the next stable URL source", () => {
    const result = debateUrlEvidenceSourceFromDraft({
      draft: {
        ...emptyDebateUrlEvidenceDraft(),
        url: "https://example.com/report/#finding",
        title: "  Public   report ",
        snippet: "  A useful   bounded finding. ",
        publishedAt: "2026-07-30",
      },
      current: [
        {
          id: "url-1",
          title: "Earlier",
          url: "https://example.org",
          snippet: "Earlier evidence.",
          publishedAt: null,
        },
      ],
      itemLimitReached: false,
    });
    assert.deepEqual(result, {
      source: {
        id: "url-2",
        title: "Public report",
        url: "https://example.com/report",
        snippet: "A useful bounded finding.",
        publishedAt: "2026-07-30",
      },
      error: null,
    });
  });

  it("rejects malformed, credentialed, duplicate, and incomplete drafts", () => {
    assert.equal(canonicalDebateUrlEvidenceUrl("file:///tmp/source"), null);
    assert.equal(
      canonicalDebateUrlEvidenceUrl("https://user:pass@example.com"),
      null,
    );
    const current = [
      {
        id: "brave-1",
        title: "Existing",
        url: "https://example.com/report#old",
        snippet: "Existing evidence.",
        publishedAt: null,
      },
    ];
    const duplicate = debateUrlEvidenceSourceFromDraft({
      draft: {
        ...emptyDebateUrlEvidenceDraft(),
        url: "https://example.com/report/",
        title: "Duplicate",
        snippet: "Duplicate.",
      },
      current,
      itemLimitReached: false,
    });
    assert.match(duplicate.error ?? "", /already/u);
    const incomplete = debateUrlEvidenceSourceFromDraft({
      draft: {
        ...emptyDebateUrlEvidenceDraft(),
        url: "https://example.net",
        title: "Manual source",
      },
      current,
      itemLimitReached: false,
    });
    assert.match(incomplete.error ?? "", /Summarize/u);
  });

  it("respects the shared evidence item cap before committing", () => {
    const result = debateUrlEvidenceSourceFromDraft({
      draft: {
        ...emptyDebateUrlEvidenceDraft(),
        url: "https://example.com",
        title: "Example",
        snippet: "Example evidence.",
      },
      current: [],
      itemLimitReached: true,
    });
    assert.match(result.error ?? "", /Remove an evidence item/u);
  });
});
