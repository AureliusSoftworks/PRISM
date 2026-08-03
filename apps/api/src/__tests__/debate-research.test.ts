import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT } from "@localai/shared";
import {
  debateEvidenceSourcesFromWebResults,
  normalizeCrossrefScholarResults,
  searchScholarWithCrossref,
} from "../debate-research.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function crossrefResponse(count: number): unknown {
  return {
    message: {
      items: Array.from({ length: count }, (_, index) => ({
        DOI: `10.1234/work-${index + 1}`,
        title: [`Scholarly work ${index + 1}`],
        author: [{ given: "Ada", family: `Author ${index + 1}` }],
        "container-title": ["Journal of Evidence"],
        abstract: `<jats:p>Abstract ${index + 1} &amp; finding.</jats:p>`,
        issued: { "date-parts": [[2020 + index, 4, 1]] },
      })),
    },
  };
}

describe("Debate source search", () => {
  it("caps Brave evidence imports at the top three usable unique results", () => {
    const results = Array.from({ length: 7 }, (_, index) => ({
      title: `Result ${index + 1}`,
      url: `https://example.com/result-${index + 1}`,
      snippet: `Snippet ${index + 1}`,
      publishedAt: "2026",
    }));
    results.splice(1, 0, { ...results[0] });

    const sources = debateEvidenceSourcesFromWebResults(results);

    assert.equal(sources.length, DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT);
    assert.deepEqual(
      sources.map((source) => source.id),
      ["brave-1", "brave-2", "brave-3"],
    );
    assert.deepEqual(
      sources.map((source) => source.title),
      ["Result 1", "Result 2", "Result 3"],
    );
  });

  it("normalizes the top three Crossref works into DOI-linked evidence", () => {
    const sources = normalizeCrossrefScholarResults(crossrefResponse(5));

    assert.equal(sources.length, DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT);
    assert.deepEqual(sources[0], {
      id: "scholar-1",
      title: "Scholarly work 1",
      url: "https://doi.org/10.1234/work-1",
      snippet: "Abstract 1 & finding.",
      publishedAt: "2020",
    });
  });

  it("falls back to publisher metadata and skips malformed works", () => {
    const sources = normalizeCrossrefScholarResults({
      message: {
        items: [
          { title: ["Missing link"] },
          {
            title: ["A useful book"],
            URL: "https://publisher.example/book",
            author: [{ given: "Grace", family: "Hopper" }],
            publisher: "Example Press",
            "published-online": { "date-parts": [[2024]] },
          },
        ],
      },
    });

    assert.deepEqual(sources, [
      {
        id: "scholar-1",
        title: "A useful book",
        url: "https://publisher.example/book",
        snippet: "Grace Hopper · Example Press",
        publishedAt: "2024",
      },
    ]);
  });

  it("queries Crossref with a three-row result ceiling", async () => {
    let requestUrl = "";
    globalThis.fetch = (async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify(crossrefResponse(1)), { status: 200 });
    }) as typeof fetch;

    const sources = await searchScholarWithCrossref({
      query: "museum repatriation ethics",
    });

    const url = new URL(requestUrl);
    assert.equal(url.hostname, "api.crossref.org");
    assert.equal(
      url.searchParams.get("query.bibliographic"),
      "museum repatriation ethics",
    );
    assert.equal(
      url.searchParams.get("rows"),
      String(DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT),
    );
    assert.equal(sources.length, 1);
  });

  it("surfaces failed and empty Crossref responses", async () => {
    assert.throws(
      () => normalizeCrossrefScholarResults({ message: { items: [] } }),
      /no usable results/iu,
    );
    globalThis.fetch = (async () =>
      new Response("{}", { status: 503 })) as typeof fetch;
    await assert.rejects(
      searchScholarWithCrossref({ query: "housing evidence" }),
      /HTTP 503/u,
    );
  });
});
