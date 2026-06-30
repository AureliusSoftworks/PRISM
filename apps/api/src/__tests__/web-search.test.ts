import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBraveWebSearchPayload,
  searchWebWithBrave,
} from "../web-search.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function braveResponse(count: number): unknown {
  return {
    web: {
      results: Array.from({ length: count }, (_, index) => ({
        title: `Result ${index + 1}`,
        url: `https://example.com/result-${index + 1}`,
        description: `Snippet ${index + 1}`,
        extra_snippets: [`Extra ${index + 1}`],
        profile: {
          name: `Source ${index + 1}`,
          img: `https://example.com/favicon-${index + 1}.ico`,
        },
        thumbnail: {
          src: `https://example.com/thumb-${index + 1}.jpg`,
        },
        meta_url: {
          hostname: "example.com",
          path: `/result-${index + 1}`,
          favicon: `https://example.com/favicon-${index + 1}.ico`,
        },
        age: "2 hours ago",
      })),
    },
  };
}

describe("WebSearch Brave service", () => {
  it("normalizes Brave results and caps visible results at five", () => {
    const payload = normalizeBraveWebSearchPayload(
      "  current prism news  ",
      braveResponse(7),
      "2026-06-29T20:00:00.000Z"
    );

    assert.equal(payload.provider, "brave");
    assert.equal(payload.query, "current prism news");
    assert.equal(payload.fetchedAt, "2026-06-29T20:00:00.000Z");
    assert.equal(payload.results.length, 5);
    assert.deepEqual(payload.results[0], {
      title: "Result 1",
      url: "https://example.com/result-1",
      displayUrl: "/result-1",
      source: "Source 1",
      snippet: "Snippet 1",
      thumbnailUrl: "https://example.com/thumb-1.jpg",
      faviconUrl: "https://example.com/favicon-1.ico",
      publishedAt: "2 hours ago",
    });
  });

  it("reads array extra_snippets when description is absent", () => {
    const payload = normalizeBraveWebSearchPayload("q", {
      web: {
        results: [
          {
            title: "Only extras",
            url: "https://example.com/extra",
            extra_snippets: ["First", "Second"],
          },
        ],
      },
    });

    assert.equal(payload.results[0]?.snippet, "First Second");
  });

  it("requires BRAVE_SEARCH_API_KEY before making a network call", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await assert.rejects(
      searchWebWithBrave({ query: "news", apiKey: "" }),
      /BRAVE_SEARCH_API_KEY/
    );
    assert.equal(called, false);
  });

  it("sends the Brave request with bounded count and API key header", async () => {
    let requestUrl = "";
    let token = "";
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      token = String(init?.headers && (init.headers as Record<string, string>)["X-Subscription-Token"]);
      return new Response(JSON.stringify(braveResponse(1)), { status: 200 });
    }) as typeof fetch;

    const payload = await searchWebWithBrave({
      query: "latest live debate",
      apiKey: "test-key",
    });

    const url = new URL(requestUrl);
    assert.equal(url.hostname, "api.search.brave.com");
    assert.equal(url.searchParams.get("q"), "latest live debate");
    assert.equal(url.searchParams.get("count"), "5");
    assert.equal(token, "test-key");
    assert.equal(payload.results.length, 1);
  });

  it("surfaces failed upstream responses", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "nope" }), { status: 503 })) as typeof fetch;

    await assert.rejects(
      searchWebWithBrave({ query: "news", apiKey: "test-key" }),
      /HTTP 503/
    );
  });

  it("rejects responses without usable results", () => {
    assert.throws(
      () =>
        normalizeBraveWebSearchPayload("news", {
          web: { results: [{ title: "Missing URL" }] },
        }),
      /no usable results/i
    );
  });
});
