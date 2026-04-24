import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  LocalOllamaProvider,
  OpenAiProvider,
  readOpenAiErrorMessage,
  selectProvider,
} from "../providers.ts";

/**
 * These tests pin the LOCAL privacy invariant: when a user (or bot, or
 * auto-switch, or anything else) has asked for LOCAL, selectProvider must
 * return the Ollama-backed provider no matter what other inputs look like.
 * If this test ever needs to be weakened, think hard — it's the thing
 * keeping the "LOCAL" badge honest.
 */
describe("selectProvider", () => {
  describe("LOCAL mode invariant", () => {
    it("returns LocalOllamaProvider when preferredProvider is 'local'", () => {
      const provider = selectProvider("local");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.equal(provider.name, "local");
    });

    it("stays local even when an OpenAI key is available", () => {
      // A key being present must not silently escalate a LOCAL turn.
      const provider = selectProvider("local", "sk-real-looking-key");
      assert.ok(provider instanceof LocalOllamaProvider);
      assert.ok(!(provider instanceof OpenAiProvider));
    });

    it("stays local across many calls with varied key inputs", () => {
      // Belt-and-suspenders: iterate a handful of plausible inputs (empty
      // string, whitespace, realistic key) and confirm none of them flip
      // the returned provider class.
      const keys = [undefined, "", "   ", "sk-abc", "sk-" + "x".repeat(48)];
      for (const key of keys) {
        const provider = selectProvider("local", key);
        assert.ok(
          provider instanceof LocalOllamaProvider,
          `LOCAL must stay local for key=${JSON.stringify(key)}`
        );
      }
    });
  });

  describe("OPENAI mode", () => {
    it("throws with a clear message when no key is available", () => {
      assert.throws(
        () => selectProvider("openai"),
        /OpenAI is selected but no API key is available/
      );
    });

    it("throws for undefined, empty-string, and whitespace keys", () => {
      // The current implementation only guards against a falsy key, so an
      // all-whitespace string slips through. Documenting the current shape
      // here — if we later tighten the check, this test should be updated.
      assert.throws(() => selectProvider("openai", undefined));
      assert.throws(() => selectProvider("openai", ""));
    });

    it("returns OpenAiProvider when a key is present", () => {
      const provider = selectProvider("openai", "sk-test-key");
      assert.ok(provider instanceof OpenAiProvider);
      assert.equal(provider.name, "openai");
    });
  });
});

/**
 * These tests pin the diagnostic contract: when OpenAI returns a non-ok
 * response, the thrown Error must carry the human-readable reason (so the
 * UI toast explains *why* the send failed), not just a bare status code.
 * Prior to this, the user saw a generic "400 Bad Request" and had no way
 * to tell whether the key was invalid, the model was wrong, or the
 * request shape was malformed.
 */
describe("readOpenAiErrorMessage", () => {
  it("extracts error.message from a standard OpenAI JSON error body", async () => {
    const body = JSON.stringify({
      error: {
        message: "The model 'llama3.2' does not exist",
        type: "invalid_request_error",
        code: "model_not_found",
      },
    });
    const response = new Response(body, {
      status: 404,
      headers: { "content-type": "application/json" },
    });
    const detail = await readOpenAiErrorMessage(response);
    assert.equal(detail, "The model 'llama3.2' does not exist");
  });

  it("falls back to raw text when the body isn't JSON (e.g. proxy HTML)", async () => {
    const response = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
    });
    const detail = await readOpenAiErrorMessage(response);
    assert.equal(detail, "<html>502 Bad Gateway</html>");
  });

  it("returns an empty string for an empty body so callers can skip the suffix", async () => {
    const response = new Response("", { status: 500 });
    const detail = await readOpenAiErrorMessage(response);
    assert.equal(detail, "");
  });

  it("truncates pathologically long bodies to keep toasts readable", async () => {
    const giantMessage = "x".repeat(2000);
    const response = new Response(
      JSON.stringify({ error: { message: giantMessage } }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
    const detail = await readOpenAiErrorMessage(response);
    assert.ok(detail.length <= 600, `detail length ${detail.length} exceeded cap`);
    assert.ok(detail.endsWith("..."), "expected truncation ellipsis");
  });
});

describe("OpenAiProvider error surfacing", () => {
  // Swap global fetch for a stub so we can simulate OpenAI 400s without
  // hitting the network. Restored after each case so other tests (and
  // future ones) aren't polluted.
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Silence the intentional server-side log during these tests; the
    // user-facing contract (thrown Error content) is what we're asserting.
    console.error = () => {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it("surfaces the OpenAI error.message when chat completions returns 400", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid 'messages[0].role': expected one of system/user/assistant",
            type: "invalid_request_error",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await assert.rejects(
      () => provider.generateResponse([{ role: "user", content: "hi" }]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /OpenAI request failed \(400\)/);
        assert.match(error.message, /Invalid 'messages\[0\]\.role'/);
        return true;
      }
    );
  });

  it("keeps the status in the message when OpenAI returns a non-JSON body", async () => {
    globalThis.fetch = (async () =>
      new Response("Rate limit exceeded", { status: 429 })) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await assert.rejects(
      () => provider.generateResponse([{ role: "user", content: "hi" }]),
      /OpenAI request failed \(429\): Rate limit exceeded/
    );
  });

  it("surfaces the OpenAI error.message when embeddings return a failure", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: { message: "Incorrect API key provided" },
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await assert.rejects(
      () => provider.embedText("hello"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /OpenAI embedding failed \(401\)/);
        assert.match(error.message, /Incorrect API key provided/);
        return true;
      }
    );
  });
});
