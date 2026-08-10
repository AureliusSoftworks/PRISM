import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DebateSourceInspectionError,
  debateSourceAddressIsPublic,
  debateSourceDraftFromDocument,
  inspectDebateSourceUrl,
  type DebateSourceInspectionDependencies,
} from "../debate-source-inspection.ts";

const PUBLIC_ADDRESS = [{ address: "93.184.216.34", family: 4 as const }];

function htmlResponse(
  body: string,
  overrides: Partial<{
    status: number;
    contentType: string;
    location: string | null;
  }> = {},
) {
  return {
    status: overrides.status ?? 200,
    contentType: overrides.contentType ?? "text/html; charset=utf-8",
    location: overrides.location ?? null,
    body: new TextEncoder().encode(body),
  };
}

describe("Debate source URL inspection", () => {
  it("extracts bounded editable metadata from a public HTML page", async () => {
    const result = await inspectDebateSourceUrl(
      "https://example.com/story#top",
      {
        allowNetwork: true,
        dependencies: {
          resolve: async () => PUBLIC_ADDRESS,
          transport: async () =>
            htmlResponse(`
            <html>
              <head>
                <title>Fallback title</title>
                <meta property="og:title" content="A &amp; B">
                <meta name="description" content="A concise public finding.">
                <meta property="article:published_time" content="2026-07-30">
              </head>
              <body><script>private noise</script>Visible body copy.</body>
            </html>
          `),
        },
      },
    );

    assert.equal(result.fetched, true);
    assert.deepEqual(
      {
        title: result.source.title,
        url: result.source.url,
        snippet: result.source.snippet,
        publishedAt: result.source.publishedAt,
      },
      {
        title: "A & B",
        url: "https://example.com/story",
        snippet: "A concise public finding.",
        publishedAt: "2026-07-30",
      },
    );
    assert.equal(result.source.excerptSource, "page");
    assert.equal(result.source.excerptSelection, "sentence-fallback");
    assert.match(result.source.excerptMaterialHash ?? "", /^[a-f0-9]{64}$/u);
  });

  it("uses visible bounded text when metadata is absent", () => {
    const result = debateSourceDraftFromDocument({
      url: new URL("https://example.com/plain"),
      contentType: "text/html",
      body: new TextEncoder().encode(
        `<title>Example</title><style>hidden</style><main>${"Evidence ".repeat(
          200,
        )}</main>`,
      ),
    });
    assert.equal(result.title, "Example");
    assert.ok(result.snippet.length >= 790);
    assert.ok(result.snippet.length <= 800);
    assert.doesNotMatch(result.snippet, /hidden/u);
  });

  it("returns a manual draft without DNS or transport access in LOCAL", async () => {
    let networkCalls = 0;
    const dependencies: DebateSourceInspectionDependencies = {
      resolve: async () => {
        networkCalls += 1;
        return PUBLIC_ADDRESS;
      },
      transport: async () => {
        networkCalls += 1;
        return htmlResponse("unreachable");
      },
    };
    const result = await inspectDebateSourceUrl(
      "https://www.example.com/article",
      { allowNetwork: false, dependencies },
    );
    assert.equal(networkCalls, 0);
    assert.deepEqual(result, {
      fetched: false,
      source: {
        title: "example.com",
        url: "https://www.example.com/article",
        snippet: "",
        publishedAt: null,
        excerptSource: "player",
        excerptSelection: "player",
        excerptModel: null,
      },
    });
  });

  it("revalidates and pins every redirect destination", async () => {
    const resolvedHosts: string[] = [];
    const transportedHosts: string[] = [];
    const result = await inspectDebateSourceUrl("https://example.com/short", {
      allowNetwork: true,
      dependencies: {
        resolve: async (hostname) => {
          resolvedHosts.push(hostname);
          return PUBLIC_ADDRESS;
        },
        transport: async (url, addresses) => {
          transportedHosts.push(`${url.hostname}:${addresses[0]?.address}`);
          return url.hostname === "example.com"
            ? htmlResponse("", {
                status: 302,
                location: "https://news.example.org/report",
              })
            : htmlResponse(
                "<title>Report</title><p>Redirected public evidence.</p>",
              );
        },
      },
    });
    assert.deepEqual(resolvedHosts, ["example.com", "news.example.org"]);
    assert.deepEqual(transportedHosts, [
      "example.com:93.184.216.34",
      "news.example.org:93.184.216.34",
    ]);
    assert.equal(result.source.url, "https://news.example.org/report");
  });

  it("rejects private, mixed, credentialed, and nonstandard destinations", async () => {
    const rejected = [
      "http://localhost/source",
      "http://127.0.0.1/source",
      "https://user:pass@example.com/source",
      "https://example.com:8443/source",
    ];
    for (const url of rejected) {
      await assert.rejects(
        inspectDebateSourceUrl(url, {
          allowNetwork: true,
          dependencies: { resolve: async () => PUBLIC_ADDRESS },
        }),
        DebateSourceInspectionError,
      );
    }
    await assert.rejects(
      inspectDebateSourceUrl("https://example.com/source", {
        allowNetwork: true,
        dependencies: {
          resolve: async () => [
            ...PUBLIC_ADDRESS,
            { address: "10.0.0.8", family: 4 },
          ],
        },
      }),
      /resolve only to public/u,
    );
  });

  it("rejects reserved address families and unsupported or oversized bodies", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.0.1",
      "198.18.0.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:7f00:1",
    ]) {
      assert.equal(debateSourceAddressIsPublic(address), false, address);
    }
    assert.equal(debateSourceAddressIsPublic("93.184.216.34"), true);
    assert.throws(
      () =>
        debateSourceDraftFromDocument({
          url: new URL("https://example.com/image"),
          contentType: "image/png",
          body: new Uint8Array(),
        }),
      /readable web page/u,
    );
    assert.throws(
      () =>
        debateSourceDraftFromDocument({
          url: new URL("https://example.com/huge"),
          contentType: "text/plain",
          body: new Uint8Array(1_048_577),
        }),
      /too large/u,
    );
  });

  it("keeps fetch failures recoverable for manual completion", async () => {
    await assert.rejects(
      inspectDebateSourceUrl("https://example.com/unavailable", {
        allowNetwork: true,
        dependencies: {
          resolve: async () => PUBLIC_ADDRESS,
          transport: async () => {
            throw new Error("offline");
          },
        },
      }),
      /enter its details manually/u,
    );
  });

  it("bounds the entire inspection, including DNS resolution", async () => {
    const startedAt = Date.now();
    await assert.rejects(
      inspectDebateSourceUrl("https://example.com/slow", {
        allowNetwork: true,
        dependencies: {
          resolve: async () => await new Promise<never>(() => undefined),
          timeoutMs: 250,
        },
      }),
      /too long/u,
    );
    assert.ok(Date.now() - startedAt < 1_000);
  });

  it("rejects redirect chains beyond the configured limit", async () => {
    await assert.rejects(
      inspectDebateSourceUrl("https://example.com/1", {
        allowNetwork: true,
        dependencies: {
          resolve: async () => PUBLIC_ADDRESS,
          transport: async (url) =>
            htmlResponse("", {
              status: 302,
              location: `https://example.com/${Number(url.pathname.slice(1)) + 1}`,
            }),
        },
      }),
      /redirected too many times/u,
    );
  });

  it("lets the selected Debate lane choose only an exact page sentence", async () => {
    let generationCalls = 0;
    const result = await inspectDebateSourceUrl(
      "https://example.com/afternoon-study",
      {
        allowNetwork: true,
        motion: "Workplaces should provide paid naps to reduce afternoon errors.",
        generateExcerpt: async (request) => {
          generationCalls += 1;
          assert.match(request.instruction, /copied exactly/iu);
          assert.match(request.materials[0]?.text ?? "", /fewer afternoon errors/u);
          return {
            excerpt: "The controlled trial found fewer afternoon errors.",
            provider: "openai",
            model: "gpt-test",
          };
        },
        dependencies: {
          resolve: async () => PUBLIC_ADDRESS,
          transport: async () =>
            htmlResponse(`
              <title>Afternoon study</title>
              <main>
                The office changed its lunch menu.
                The controlled trial found fewer afternoon errors.
                Participants reported higher alertness.
              </main>
            `),
        },
      },
    );

    assert.equal(generationCalls, 1);
    assert.equal(
      result.source.snippet,
      "The controlled trial found fewer afternoon errors.",
    );
    assert.equal(result.source.excerptSelection, "model");
    assert.deepEqual(result.source.excerptModel, {
      provider: "openai",
      model: "gpt-test",
    });
  });

  it("never fetches or invokes an online excerpt generator in LOCAL", async () => {
    let networkCalls = 0;
    let generationCalls = 0;
    const result = await inspectDebateSourceUrl(
      "https://example.com/local-source",
      {
        allowNetwork: false,
        motion: "A local-only motion",
        generateExcerpt: async () => {
          generationCalls += 1;
          return null;
        },
        dependencies: {
          resolve: async () => {
            networkCalls += 1;
            return PUBLIC_ADDRESS;
          },
          transport: async () => {
            networkCalls += 1;
            return htmlResponse("unreachable");
          },
        },
      },
    );

    assert.equal(networkCalls, 0);
    assert.equal(generationCalls, 0);
    assert.equal(result.fetched, false);
    assert.equal(result.source.excerptSelection, "player");
  });
});
