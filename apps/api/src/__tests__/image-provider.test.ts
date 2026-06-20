import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateImage } from "../image-provider.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("generateImage", () => {
  it("uses GPT Image base64 output without response_format=url", async () => {
    let requestBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await generateImage("draw a prism", "sk-test", {
      model: "gpt-image-2",
      size: "1536x1024",
      quality: "hd",
    });

    assert.equal(requestBody?.model, "gpt-image-2");
    assert.equal(requestBody?.size, "1536x1024");
    assert.equal(requestBody?.quality, "high");
    assert.equal(requestBody?.output_format, "png");
    assert.equal("response_format" in (requestBody ?? {}), false);
    assert.equal(result.url, "");
    assert.deepEqual(result.imageBytes, Buffer.from("png-bytes"));
  });

  it("falls stale DALL-E preferences back to GPT Image requests", async () => {
    let requestBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: [
            {
              b64_json: Buffer.from("fallback-png-bytes").toString("base64"),
              revised_prompt: "revised",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await generateImage("draw a prism", "sk-test", {
      model: "dall-e-2",
      size: "1536x1024",
      quality: "hd",
    });

    assert.equal(requestBody?.model, "gpt-image-2");
    assert.equal(requestBody?.size, "1536x1024");
    assert.equal(requestBody?.quality, "high");
    assert.equal(requestBody?.output_format, "png");
    assert.equal("response_format" in (requestBody ?? {}), false);
    assert.equal(result.url, "");
    assert.equal(result.revisedPrompt, "revised");
    assert.deepEqual(result.imageBytes, Buffer.from("fallback-png-bytes"));
  });
});
