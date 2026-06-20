import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateImage } from "../image-provider.ts";

describe("generateImage", () => {
  it("does not send a response_format override for DALL-E image generation", async () => {
    const originalFetch = globalThis.fetch;
    let sentBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: [{ url: "https://example.test/image.png", revised_prompt: "revised" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const result = await generateImage("paint a stained glass skyline", "sk-test", {
        model: "dall-e-3",
        size: "1024x1024",
        quality: "standard",
      });

      assert.equal(result.url, "https://example.test/image.png");
      assert.equal(result.revisedPrompt, "revised");
      assert.equal(result.model, "dall-e-3");
      assert.equal(sentBody?.model, "dall-e-3");
      assert.equal(sentBody?.prompt, "paint a stained glass skyline");
      assert.equal(sentBody?.n, 1);
      assert.equal(sentBody?.response_format, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
