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

  it("keeps URL output for DALL-E image models", async () => {
    let requestBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: [{ url: "https://example.com/generated.png", revised_prompt: "revised" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await generateImage("draw a prism", "sk-test", {
      model: "dall-e-3",
      size: "1536x1024",
      quality: "hd",
    });

    assert.equal(requestBody?.model, "dall-e-3");
    assert.equal(requestBody?.size, "1792x1024");
    assert.equal(requestBody?.quality, "hd");
    assert.equal(requestBody?.response_format, "url");
    assert.equal(result.url, "https://example.com/generated.png");
    assert.equal(result.revisedPrompt, "revised");
    assert.equal(result.imageBytes, undefined);
  });
});
