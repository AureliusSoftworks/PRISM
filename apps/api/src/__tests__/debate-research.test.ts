import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEBATE_EVIDENCE_SEARCH_RESULT_LIMIT } from "@localai/shared";
import {
  completeSentenceDebateEvidenceExcerpt,
  debateEvidenceSourcesFromWebResults,
  enrichDebateEvidenceSourceExcerpt,
  normalizeCrossrefScholarResults,
  searchScholarWithCrossref,
  selectGroundedDebateEvidenceExcerpt,
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
    assert.deepEqual(
      {
        id: sources[0]?.id,
        title: sources[0]?.title,
        url: sources[0]?.url,
        snippet: sources[0]?.snippet,
        publishedAt: sources[0]?.publishedAt,
      },
      {
      id: "scholar-1",
      title: "Scholarly work 1",
      url: "https://doi.org/10.1234/work-1",
      snippet: "Abstract 1 & finding.",
      publishedAt: "2020",
      },
    );
    assert.equal(sources[0]?.excerptSource, "crossref");
    assert.equal(sources[0]?.excerptSelection, "sentence-fallback");
    assert.match(sources[0]?.excerptMaterialHash ?? "", /^[a-f0-9]{64}$/u);
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

    assert.equal(sources.length, 1);
    assert.deepEqual(
      {
        id: sources[0]?.id,
        title: sources[0]?.title,
        url: sources[0]?.url,
        snippet: sources[0]?.snippet,
        publishedAt: sources[0]?.publishedAt,
      },
      {
        id: "scholar-1",
        title: "A useful book",
        url: "https://publisher.example/book",
        snippet: "Grace Hopper · Example Press",
        publishedAt: "2024",
      },
    );
    assert.equal(sources[0]?.excerptSource, "metadata");
    assert.equal(sources[0]?.excerptSelection, "metadata-only");
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

  it("bounds display excerpts at complete sentences instead of mid-word", () => {
    const excerpt = completeSentenceDebateEvidenceExcerpt(
      `${"A useful opening sentence. ".repeat(20)}ThisShouldNeverBeClippedMidWord`,
      90,
    );

    assert.equal(excerpt, "A useful opening sentence. A useful opening sentence. A useful opening sentence.");
    assert.match(excerpt, /\.$/u);
    assert.doesNotMatch(excerpt, /ThisShould/u);
  });

  it("accepts only exact contiguous model-selected source sentences", () => {
    const material =
      "Nap policies can improve alertness. The controlled trial found fewer afternoon errors. Participants also reported better morale.";
    const selected = selectGroundedDebateEvidenceExcerpt({
      motion: "Workplaces should provide paid afternoon naps to reduce errors.",
      materials: [{ id: "page-1", kind: "page", text: material }],
      modelSelection: {
        excerpt: "The controlled trial found fewer afternoon errors.",
        provider: "openai",
        model: "gpt-test",
      },
    });

    assert.equal(
      selected.excerpt,
      "The controlled trial found fewer afternoon errors.",
    );
    assert.equal(selected.selection, "model");
    assert.deepEqual(selected.model, {
      provider: "openai",
      model: "gpt-test",
    });
  });

  it("rejects paraphrases and noncontiguous joins, then ranks a grounded fallback", () => {
    const material =
      "Nap policies can improve alertness. A cafeteria renovation changed lunch traffic. The controlled trial found fewer afternoon errors.";
    for (const excerpt of [
      "The trial proved that naps prevent mistakes.",
      "Nap policies can improve alertness. The controlled trial found fewer afternoon errors.",
    ]) {
      const selected = selectGroundedDebateEvidenceExcerpt({
        motion: "Workplaces should provide paid afternoon naps to reduce errors.",
        materials: [{ id: "page-1", kind: "page", text: material }],
        modelSelection: {
          excerpt,
          provider: "openai",
          model: "gpt-test",
        },
      });
      assert.equal(
        selected.excerpt,
        "The controlled trial found fewer afternoon errors.",
      );
      assert.equal(selected.selection, "sentence-fallback");
      assert.equal(selected.model, null);
    }
  });

  it("keeps the enrichment seam bounded and performs no model call without a generator", async () => {
    let modelCalls = 0;
    const source = {
      id: "brave-1",
      title: "A report",
      url: "https://example.com/report",
      snippet: "Provider fragment",
      publishedAt: null,
    };
    const localResult = await enrichDebateEvidenceSourceExcerpt({
      source,
      motion: "A motion about afternoon errors",
      materials: [
        {
          id: "provider-1",
          kind: "provider",
          text: "The report documents fewer afternoon errors.",
        },
      ],
    });
    assert.equal(modelCalls, 0);
    assert.equal(localResult.excerptSelection, "sentence-fallback");

    const generatedResult = await enrichDebateEvidenceSourceExcerpt({
      source,
      motion: "A motion about afternoon errors",
      materials: [
        {
          id: "page-1",
          kind: "page",
          text: `${"bounded ".repeat(4_000)}The report documents fewer afternoon errors.`,
        },
      ],
      generate: async (request) => {
        modelCalls += 1;
        assert.equal(request.materials.length, 1);
        assert.ok(request.materials[0]!.text.length <= 20_000);
        return {
          excerpt: "The report documents fewer afternoon errors.",
          provider: "openai",
          model: "gpt-test",
        };
      },
    });
    assert.equal(modelCalls, 1);
    assert.equal(generatedResult.excerptSelection, "sentence-fallback");
    assert.equal(generatedResult.excerptModel, null);

    const failedGeneration = await enrichDebateEvidenceSourceExcerpt({
      source,
      motion: "A motion about afternoon errors",
      materials: [{
        id: "provider-2",
        kind: "provider",
        text: "The report documents fewer afternoon errors.",
      }],
      generate: async () => {
        throw new Error("lane timed out");
      },
    });
    assert.equal(failedGeneration.snippet, "The report documents fewer afternoon errors.");
    assert.equal(failedGeneration.excerptSelection, "sentence-fallback");
    assert.equal(failedGeneration.excerptModel, null);
  });
});
