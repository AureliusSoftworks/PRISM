import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelCatalog,
  checkDualOllamaWorkloadStatus,
  checkLocalModelHostStatus,
  embedTextLocal,
  getAuxiliaryProvider,
  AnthropicProvider,
  LocalOllamaProvider,
  OpenAiProvider,
  openAiModelUsesMaxCompletionTokens,
  openAiModelUsesFixedDefaultTemperature,
  readOpenAiErrorMessage,
  SECONDARY_OLLAMA_MODEL_PREFIX,
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

  describe("ANTHROPIC mode", () => {
    it("throws with a clear message when no key is available", () => {
      assert.throws(
        () => selectProvider("anthropic"),
        /Anthropic is selected but no API key is available/
      );
    });

    it("returns AnthropicProvider when a key is present", () => {
      const provider = selectProvider("anthropic", undefined, undefined, "sk-ant-test-key");
      assert.ok(provider instanceof AnthropicProvider);
      assert.equal(provider.name, "anthropic");
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

describe("buildModelCatalog", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("does not advertise online providers without matching API keys", async () => {
    globalThis.fetch = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;

    const catalog = await buildModelCatalog(undefined);

    assert.ok(catalog.defaults.local);
    assert.equal(catalog.defaults.online, "gpt-4o-mini");
    assert.equal(catalog.local[0]?.id, catalog.defaults.local);
    assert.deepEqual(catalog.online, []);
  });

  it("keeps fallback defaults available when keyed discovery is unavailable", async () => {
    globalThis.fetch = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;

    const catalog = await buildModelCatalog("sk-test", undefined, "sk-ant-test");

    assert.ok(catalog.defaults.local);
    assert.equal(catalog.defaults.online, "gpt-4o-mini");
    assert.equal(catalog.local[0]?.id, catalog.defaults.local);
    assert.equal(catalog.online[0]?.id, catalog.defaults.online);
    assert.ok(catalog.online.some((model) => model.id === "claude-sonnet-4-6"));
  });

  it("discovers Ollama models and filters OpenAI to chat-capable models", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [
              { name: "llama3.2" },
              { name: "llama3.2:latest" },
              { name: "gemma3:latest" },
              { name: "llama3.2" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "gpt-4o" },
              { id: "text-embedding-3-small" },
              { id: "dall-e-3" },
              { id: "o3-mini" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const catalog = await buildModelCatalog("sk-test");

    assert.ok(catalog.local.some((model) => model.id === "llama3.2"));
    assert.equal(
      catalog.local.filter((model) => model.label === "Llama3.2").length,
      1
    );
    const gemma = catalog.local.find((model) => model.id === "gemma3:latest");
    assert.equal(gemma?.label, "Gemma3");
    assert.ok(catalog.online.some((model) => model.id === "gpt-4o"));
    assert.ok(catalog.online.some((model) => model.id === "o3-mini"));
    assert.ok(!catalog.online.some((model) => model.id === "text-embedding-3-small"));
    assert.ok(!catalog.online.some((model) => model.id === "dall-e-3"));
  });

  it("falls back to IPv4 loopback when catalog discovery hits unreachable localhost", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("http://localhost:11434/")) {
        throw new Error("ECONNREFUSED ::1:11434");
      }
      if (url.startsWith("http://127.0.0.1:11434/")) {
        return new Response(
          JSON.stringify({
            models: [{ name: "gemma3:latest" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const catalog = await buildModelCatalog(undefined);

    assert.ok(catalog.local.some((model) => model.id === "gemma3:latest"));
    assert.ok(
      requestedUrls.includes("http://127.0.0.1:11434/api/tags"),
      `expected IPv4 loopback fallback, got ${JSON.stringify(requestedUrls)}`
    );
  });

  it("merges secondary Ollama host models while preferring primary duplicate names", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("192.168.1.50") && url.includes("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [
              { name: "llama3.2" },
              { name: "mistral:latest" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.includes("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [
              { name: "llama3.2" },
              { name: "gemma3:latest" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const catalog = await buildModelCatalog(undefined, "http://192.168.1.50:11434");

    assert.ok(catalog.local.some((model) => model.id === "llama3.2"));
    const secondaryLlama = catalog.local.find(
      (model) => model.id === `${SECONDARY_OLLAMA_MODEL_PREFIX}llama3.2`
    );
    assert.equal(secondaryLlama, undefined);
    assert.ok(catalog.local.some((model) => model.id === `${SECONDARY_OLLAMA_MODEL_PREFIX}mistral:latest`));
  });
});

describe("LocalOllamaProvider secondary routing", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("routes encoded secondary model ids to the secondary host with the raw model name", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ message: { content: "hello from secondary" } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new LocalOllamaProvider({
      secondaryOllamaHost: "http://192.168.1.50:11434",
    });
    const response = await provider.generateResponse(
      [{ role: "user", content: "hi" }],
      { model: `${SECONDARY_OLLAMA_MODEL_PREFIX}mistral:latest` }
    );

    assert.equal(response, "hello from secondary");
    assert.equal(requestedUrl, "http://192.168.1.50:11434/api/chat");
    assert.equal(requestedBody.model, "mistral:latest");
    assert.equal(requestedBody.think, false);
  });

  it("sends think:false and falls back to message.thinking when content is empty", async () => {
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          message: { content: "", thinking: "  final answer via thinking field  " },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new LocalOllamaProvider();
    const response = await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "qwen3:latest",
    });
    assert.equal(requestedBody.think, false);
    assert.equal(response, "final answer via thinking field");
  });

  it("asks Ollama for JSON object output when jsonMode is enabled", async () => {
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ message: { content: '{"ok":true}' } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new LocalOllamaProvider();
    await provider.generateResponse([{ role: "user", content: "json" }], {
      model: "llama3.2",
      jsonMode: true,
    });

    assert.equal(requestedBody.format, "json");
  });

  it("sends JSON Schema to Ollama when provided", async () => {
    let requestedBody: Record<string, unknown> = {};
    const schema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
    };
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ message: { content: '{"ok":true}' } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new LocalOllamaProvider();
    await provider.generateResponse([{ role: "user", content: "json" }], {
      model: "llama3.2",
      jsonMode: true,
      jsonSchema: schema,
    });

    assert.deepEqual(requestedBody.format, schema);
  });

  it("throws a clear error when the model returns only tool_calls", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          message: {
            content: "",
            tool_calls: [{ function: { name: "noop", arguments: "{}" } }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const provider = new LocalOllamaProvider();
    await assert.rejects(
      () => provider.generateResponse([{ role: "user", content: "hi" }]),
      /tool calls instead of assistant text/
    );
  });

  it("does not silently route stale secondary model ids to the primary host", async () => {
    const provider = new LocalOllamaProvider();

    await assert.rejects(
      () =>
        provider.generateResponse(
          [{ role: "user", content: "hi" }],
          { model: `${SECONDARY_OLLAMA_MODEL_PREFIX}mistral:latest` }
        ),
      /Second Ollama host is not configured/
    );
  });

  it("does not automatically route to the secondary host when dual routing is off", async () => {
    let requestedChatUrl = "";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/tags")) {
        return new Response(
          JSON.stringify({ models: [{ name: "llama3.2" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      requestedChatUrl = url;
      assert.ok(init?.body);
      return new Response(JSON.stringify({ message: { content: "primary ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = new LocalOllamaProvider({
      secondaryOllamaHost: "http://192.168.1.77:11434",
    });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "llama3.2",
    });

    assert.ok(requestedChatUrl.endsWith("/api/chat"));
    assert.ok(!requestedChatUrl.startsWith("http://192.168.1.77:11434/"));
  });

  it("routes Prism-owned local work to the secondary host when exact model parity is available", async () => {
    let requestedChatUrl = "";
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/tags")) {
        return new Response(
          JSON.stringify({
            models: [
              { name: "llama3.2" },
              { name: "nomic-embed-text" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      requestedChatUrl = url;
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: "secondary ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = getAuxiliaryProvider("llama3.2", {
      secondaryOllamaHost: "http://192.168.1.78:11434",
      experimentalDualOllama: true,
    });
    const response = await provider.generateResponse([{ role: "user", content: "title this" }]);

    assert.equal(response, "secondary ok");
    assert.equal(requestedChatUrl, "http://192.168.1.78:11434/api/chat");
    assert.equal(requestedBody.model, "llama3.2");
  });
});

describe("checkDualOllamaWorkloadStatus", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("enables dual routing only when primary and secondary model sets match exactly", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: "llama3.2" },
            { name: "nomic-embed-text" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    const status = await checkDualOllamaWorkloadStatus(
      "http://192.168.1.80:11434",
      { useCache: false }
    );

    assert.equal(status.enabled, true);
    assert.equal(status.modelParity, true);
    assert.equal(status.reason, "ready");
    assert.deepEqual(status.sharedModelIds, ["llama3.2", "nomic-embed-text"]);
  });

  it("disables dual routing and reports missing models when catalogs differ", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      const models = url.includes("192.168.1.81")
        ? [{ name: "llama3.2" }]
        : [{ name: "gemma3:latest" }, { name: "llama3.2" }];
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const status = await checkDualOllamaWorkloadStatus(
      "http://192.168.1.81:11434",
      { useCache: false }
    );

    assert.equal(status.enabled, false);
    assert.equal(status.modelParity, false);
    assert.equal(status.reason, "model_mismatch");
    assert.deepEqual(status.missingOnSecondary, ["gemma3:latest"]);
    assert.deepEqual(status.missingOnPrimary, []);
  });
});

describe("system-owned local lanes", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("pins auxiliary generation to llama3.2 even when a caller supplies a different model", async () => {
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: "aux ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = getAuxiliaryProvider();
    const response = await provider.generateResponse(
      [{ role: "user", content: "title this" }],
      { model: "gpt-4o", temperature: 0.2, maxTokens: 40 }
    );

    assert.equal(response, "aux ok");
    assert.equal(provider.name, "local");
    assert.equal(requestedBody.model, "llama3.2");
    assert.equal(requestedBody.think, false);
    assert.deepEqual(requestedBody.options, { temperature: 0.2, num_predict: 40 });
  });

  it("honors a per-user Prism auxiliary override when supplied", async () => {
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: "aux ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = getAuxiliaryProvider("mistral:latest");
    await provider.generateResponse([{ role: "user", content: "title this" }], {
      model: "gpt-4o",
      temperature: 0.1,
      maxTokens: 20,
    });
    assert.equal(requestedBody.model, "mistral:latest");
  });

  it("pins local embeddings to nomic-embed-text", async () => {
    let requestedUrl = "";
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = input instanceof Request ? input.url : String(input);
      const parsedBody = init?.body
        ? JSON.parse(String(init.body)) as Record<string, unknown>
        : input instanceof Request
          ? await input.clone().json() as Record<string, unknown>
          : {};
      if (parsedBody.model) {
        requestedBody = parsedBody;
      }
      return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const embedding = await embedTextLocal("hello");

    assert.ok(requestedUrl.endsWith("/api/embeddings"));
    assert.equal(requestedBody.model, "nomic-embed-text");
    assert.equal(requestedBody.prompt, "hello");
    assert.deepEqual(embedding, [0.1, 0.2, 0.3]);
  });

  it("keeps OpenAI embeddings on the local embedding lane", async () => {
    let requestedUrl = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ embedding: [0.4, 0.5] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    const embedding = await provider.embedText("hello");

    assert.ok(requestedUrl.endsWith("/api/embeddings"));
    assert.ok(!requestedUrl.includes("api.openai.com"));
    assert.deepEqual(embedding, [0.4, 0.5]);
  });
});

describe("checkLocalModelHostStatus", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports an unconfigured secondary host without probing the network", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const status = await checkLocalModelHostStatus("");

    assert.deepEqual(status, { configured: false, reachable: false, modelCount: 0 });
    assert.equal(called, false);
  });

  it("distinguishes a reachable host with no models from a failed host", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    assert.deepEqual(await checkLocalModelHostStatus("http://192.168.1.50:11434"), {
      configured: true,
      reachable: true,
      modelCount: 0,
    });

    globalThis.fetch = (async () => new Response("offline", { status: 503 })) as typeof fetch;
    assert.deepEqual(await checkLocalModelHostStatus("http://192.168.1.50:11434"), {
      configured: true,
      reachable: false,
      modelCount: 0,
    });
  });

  it("falls back to IPv4 loopback when localhost resolves to an unreachable address", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);
      if (url.startsWith("http://localhost:11434/")) {
        throw new Error("ECONNREFUSED ::1:11434");
      }
      if (url.startsWith("http://127.0.0.1:11434/")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("offline", { status: 503 });
    }) as typeof fetch;

    assert.deepEqual(await checkLocalModelHostStatus("http://localhost:11434"), {
      configured: true,
      reachable: true,
      modelCount: 1,
    });
    assert.deepEqual(requestedUrls, [
      "http://localhost:11434/api/tags",
      "http://127.0.0.1:11434/api/tags",
    ]);
  });
});

describe("openAiModelUsesFixedDefaultTemperature", () => {
  it("returns true for reasoning-style models (temperature must be omitted)", () => {
    assert.equal(openAiModelUsesFixedDefaultTemperature("o3-mini"), true);
    assert.equal(openAiModelUsesFixedDefaultTemperature("gpt-5-nano"), true);
  });

  it("returns false for models that accept custom temperature", () => {
    assert.equal(openAiModelUsesFixedDefaultTemperature("gpt-4o-mini"), false);
  });
});

describe("openAiModelUsesMaxCompletionTokens", () => {
  it("returns true for reasoning-style model ids that require max_completion_tokens", () => {
    assert.equal(openAiModelUsesMaxCompletionTokens("o3-mini"), true);
    assert.equal(openAiModelUsesMaxCompletionTokens("O4-mini"), true);
    assert.equal(openAiModelUsesMaxCompletionTokens("gpt-5-nano"), true);
  });

  it("returns false for classic chat models that accept max_tokens", () => {
    assert.equal(openAiModelUsesMaxCompletionTokens("gpt-4o-mini"), false);
    assert.equal(openAiModelUsesMaxCompletionTokens("gpt-4.1"), false);
  });
});

describe("OpenAiProvider request shape", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends max_tokens for gpt-4o-class models", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "gpt-4o-mini",
      maxTokens: 100,
    });

    assert.equal(body.max_tokens, 100);
    assert.equal(body.max_completion_tokens, undefined);
  });

  it("sends max_completion_tokens for o-series models", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "o3-mini",
      maxTokens: 2000,
    });

    assert.equal(body.max_completion_tokens, 2000);
    assert.equal(body.max_tokens, undefined);
  });

  it("omits temperature for o-series models even when a custom value is set", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "o3-mini",
      temperature: 0.91,
    });

    assert.equal(body.temperature, undefined);
  });

  it("sends temperature for gpt-4o-class models when provided", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "gpt-4o-mini",
      temperature: 0.91,
    });

    assert.equal(body.temperature, 0.91);
  });

  it("requests JSON object output when jsonMode is enabled", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "json" }], {
      model: "gpt-4o-mini",
      jsonMode: true,
    });

    assert.deepEqual(body.response_format, { type: "json_object" });
  });

  it("requests JSON Schema output when a schema is provided", async () => {
    let body: Record<string, unknown> = {};
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
    };
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "json" }], {
      model: "gpt-4o-mini",
      jsonMode: true,
      jsonSchema: schema,
      jsonSchemaName: "test_schema",
    });

    assert.deepEqual(body.response_format, {
      type: "json_schema",
      json_schema: {
        name: "test_schema",
        strict: true,
        schema,
      },
    });
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

});
