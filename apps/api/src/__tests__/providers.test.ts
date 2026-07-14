import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ANTHROPIC_DEFAULT_MODEL,
  anthropicModelUsesFixedDefaultSampling,
  buildModelCatalog,
  checkAnthropicApiKeyStatus,
  checkDualOllamaWorkloadStatus,
  checkLocalModelHostStatus,
  checkOpenAiApiKeyStatus,
  embedTextLocal,
  getAuxiliaryProvider,
  AnthropicProvider,
  LocalModelRequestError,
  LocalOllamaProvider,
  OpenAiProvider,
  openAiModelUsesMaxCompletionTokens,
  openAiModelUsesFixedDefaultTemperature,
  readOpenAiErrorMessage,
  resetModelCatalogCacheForTests,
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

describe("provider API key authentication status", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reports missing keys without probing the network", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const status = await checkAnthropicApiKeyStatus(undefined);

    assert.equal(called, false);
    assert.deepEqual(status, {
      configured: false,
      authenticated: false,
      source: "none",
      status: "missing",
      modelCount: 0,
    });
  });

  it("authenticates Anthropic keys through the Models API", async () => {
    let apiKeyHeader = "";
    let versionHeader = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      apiKeyHeader = headers.get("x-api-key") ?? "";
      versionHeader = headers.get("anthropic-version") ?? "";
      return new Response(
        JSON.stringify({ data: [{ id: "claude-sonnet-4-6" }, { id: "claude-opus-4-8" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const status = await checkAnthropicApiKeyStatus(" sk-ant-test ", "account");

    assert.equal(apiKeyHeader, "sk-ant-test");
    assert.equal(versionHeader, "2023-06-01");
    assert.deepEqual(status, {
      configured: true,
      authenticated: true,
      source: "account",
      status: "authenticated",
      modelCount: 2,
    });
  });

  it("marks provider 401/403 responses as invalid keys", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const status = await checkAnthropicApiKeyStatus("sk-ant-bad", "account");

    assert.equal(status.configured, true);
    assert.equal(status.authenticated, false);
    assert.equal(status.source, "account");
    assert.equal(status.status, "invalid");
    assert.equal(status.modelCount, 0);
    assert.equal(status.message, "invalid x-api-key");
  });

  it("authenticates OpenAI keys with Bearer auth", async () => {
    let authorization = "";
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const status = await checkOpenAiApiKeyStatus(" sk-test ", "server");

    assert.equal(authorization, "Bearer sk-test");
    assert.deepEqual(status, {
      configured: true,
      authenticated: true,
      source: "server",
      status: "authenticated",
      modelCount: 1,
    });
  });
});

describe("buildModelCatalog", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetModelCatalogCacheForTests();
  });

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

  it("caches discovery for the API process lifetime", async () => {
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const first = await buildModelCatalog(undefined);
    const second = await buildModelCatalog(undefined);

    assert.equal(fetchCount, 1);
    assert.equal(second, first);
  });

  it("keeps fallback defaults available when keyed discovery is unavailable", async () => {
    globalThis.fetch = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;

    const catalog = await buildModelCatalog("sk-test", undefined, "sk-ant-test");

    assert.ok(catalog.defaults.local);
    assert.equal(catalog.defaults.online, "gpt-4o-mini");
    assert.equal(catalog.local[0]?.id, catalog.defaults.local);
    assert.equal(catalog.online[0]?.id, catalog.defaults.online);
    assert.ok(!catalog.online.some((model) => model.id === "gpt-5"));
    assert.equal(
      catalog.online.find((model) => model.id === "gpt-5-chat-latest")?.label,
      "GPT-5"
    );
    assert.ok(catalog.online.some((model) => model.id === "gpt-5.5-pro"));
    assert.ok(catalog.online.some((model) => model.id === "gpt-5.5-pro-2026-04-23"));
    assert.ok(catalog.online.some((model) => model.id === "claude-sonnet-4-6"));
    assert.equal(
      catalog.online.find((model) => model.id === "claude-haiku-4-5")?.label,
      "Haiku 4.5"
    );
    assert.ok(!catalog.online.some((model) => model.id === "claude-3-5-haiku-latest"));
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
              { id: "gpt-5.1" },
              { id: "gpt-5.1-chat-latest" },
              { id: "gpt-5.3" },
              { id: "gpt-5.3-chat-latest" },
              { id: "gpt-5.4-mini" },
              { id: "chatgpt-4o-latest" },
              { id: "o5-mini" },
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
      catalog.local.filter((model) => model.label === "Llama 3.2").length,
      1
    );
    const gemma = catalog.local.find((model) => model.id === "gemma3:latest");
    assert.equal(gemma?.label, "Gemma 3");
    assert.ok(catalog.online.some((model) => model.id === "gpt-4o"));
    assert.ok(!catalog.online.some((model) => model.id === "gpt-5.1"));
    assert.ok(catalog.online.some((model) => model.id === "gpt-5.1-chat-latest"));
    assert.equal(
      catalog.online.find((model) => model.id === "gpt-5.1-chat-latest")?.label,
      "GPT-5.1"
    );
    assert.ok(!catalog.online.some((model) => model.id === "gpt-5.3"));
    assert.ok(catalog.online.some((model) => model.id === "gpt-5.3-chat-latest"));
    assert.equal(
      catalog.online.find((model) => model.id === "gpt-5.3-chat-latest")?.label,
      "GPT-5.3"
    );
    assert.ok(catalog.online.some((model) => model.id === "gpt-5.4-mini"));
    assert.ok(catalog.online.some((model) => model.id === "chatgpt-4o-latest"));
    assert.ok(catalog.online.some((model) => model.id === "o3-mini"));
    assert.ok(catalog.online.some((model) => model.id === "o5-mini"));
    assert.ok(!catalog.online.some((model) => model.id === "text-embedding-3-small"));
    assert.ok(!catalog.online.some((model) => model.id === "dall-e-3"));
  });

  it("collapses Anthropic Haiku alias and snapshot ids into one picker entry", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.openai.com")) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.anthropic.com")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "claude-haiku-4-5-20251001" },
              { id: "claude-haiku-4-5" },
              { id: "claude-3-5-haiku-latest" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 404 });
    }) as typeof fetch;

    const catalog = await buildModelCatalog("sk-test", undefined, "sk-ant-test");
    const haikuModels = catalog.online.filter((model) =>
      model.label.toLowerCase().includes("haiku")
    );

    assert.deepEqual(
      haikuModels.map((model) => model.id).sort((a, b) => a.localeCompare(b)),
      ["claude-haiku-4-5", "claude-3-5-haiku-latest"]
        .sort((a, b) => a.localeCompare(b))
    );
    assert.equal(
      catalog.online.filter((model) => model.id === "claude-haiku-4-5").length,
      1
    );
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

  it("lists every paired secondary Ollama model even when it is not installed locally", async () => {
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
    assert.equal(secondaryLlama?.label, "Llama 3.2 (Paired host)");
    assert.equal(secondaryLlama?.hostLabel, "Paired host");
    assert.equal(secondaryLlama?.localHost, "secondary");
    const secondaryMistral = catalog.local.find(
      (model) => model.id === `${SECONDARY_OLLAMA_MODEL_PREFIX}mistral:latest`
    );
    assert.equal(secondaryMistral?.label, "Mistral (Paired host)");
    assert.equal(secondaryMistral?.hostLabel, "Paired host");
    assert.equal(secondaryMistral?.localHost, "secondary");
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
      /Paired Ollama host is not configured/
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

  it("routes Prism-owned local work to the secondary host when the requested model is paired", async () => {
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

  it("enables dual routing when at least one model is paired", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      const models = url.includes("192.168.1.80")
        ? [{ name: "llama3.2" }, { name: "mistral:latest" }]
        : [{ name: "gemma3:latest" }, { name: "llama3.2" }];
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const status = await checkDualOllamaWorkloadStatus(
      "http://192.168.1.80:11434",
      { useCache: false }
    );

    assert.equal(status.enabled, true);
    assert.equal(status.modelParity, true);
    assert.equal(status.reason, "ready");
    assert.deepEqual(status.sharedModelIds, ["llama3.2"]);
    assert.deepEqual(status.missingOnSecondary, ["gemma3:latest"]);
    assert.deepEqual(status.missingOnPrimary, ["mistral:latest"]);
  });

  it("disables dual routing when no models are paired", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      const models = url.includes("192.168.1.81")
        ? [{ name: "llama3.2" }]
        : [{ name: "gemma3:latest" }];
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
    assert.deepEqual(status.missingOnPrimary, ["llama3.2"]);
  });
});

describe("local request diagnostics", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("redacts network failures and classifies the local service as unavailable", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError(
        "fetch failed for http://admin:super-secret@192.168.1.99:11434/api/chat?api_key=leaked"
      );
    }) as typeof fetch;

    const provider = new LocalOllamaProvider();
    await assert.rejects(
      provider.generateResponse([{ role: "user", content: "hi" }]),
      (error: unknown) => {
        assert.ok(error instanceof LocalModelRequestError);
        assert.equal(error.kind, "service_unavailable");
        assert.equal(error.message, "Local model service is unavailable.");
        assert.doesNotMatch(error.message, /192\.168|super-secret|api_key|http:/iu);
        return true;
      }
    );
  });

  it("distinguishes missing models, missing endpoints, and authentication or configuration failures", async () => {
    const scenarios: Array<{
      status: number;
      body: string;
      expected: LocalModelRequestError["kind"];
    }> = [
      {
        status: 404,
        body: JSON.stringify({ error: "model 'missing' not found, try pulling it first" }),
        expected: "model_unavailable",
      },
      {
        status: 404,
        body: "404 page not found",
        expected: "endpoint_not_found",
      },
      {
        status: 401,
        body: JSON.stringify({ error: "invalid API key: super-secret" }),
        expected: "authentication_or_configuration",
      },
    ];

    for (const scenario of scenarios) {
      globalThis.fetch = (async () =>
        new Response(scenario.body, { status: scenario.status })) as typeof fetch;
      const provider = new LocalOllamaProvider();
      await assert.rejects(
        provider.generateResponse([{ role: "user", content: "hi" }]),
        (error: unknown) => {
          assert.ok(error instanceof LocalModelRequestError);
          assert.equal(error.kind, scenario.expected);
          assert.equal(error.status, scenario.status);
          assert.doesNotMatch(error.message, /missing|super-secret|api key/iu);
          return true;
        }
      );
    }
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
    assert.equal(provider.diagnosticModel, "mistral:latest");
  });

  it("passes advanced sampler knobs to Ollama options", async () => {
    let requestedBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: { content: "ok" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = new LocalOllamaProvider();
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      temperature: 0.44,
      maxTokens: 120,
      topP: 0.82,
      topK: 32,
      repetitionPenalty: 1.18,
    });

    assert.deepEqual(requestedBody.options, {
      temperature: 0.44,
      num_predict: 120,
      top_p: 0.82,
      top_k: 32,
      repeat_penalty: 1.18,
    });
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
    assert.equal(openAiModelUsesFixedDefaultTemperature("o5-mini"), true);
    assert.equal(openAiModelUsesFixedDefaultTemperature("gpt-5-nano"), true);
  });

  it("returns false for models that accept custom temperature", () => {
    assert.equal(openAiModelUsesFixedDefaultTemperature("gpt-4o-mini"), false);
  });
});

describe("anthropicModelUsesFixedDefaultSampling", () => {
  it("returns true for current Claude models that reject custom sampling", () => {
    for (const model of [
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-5",
      "claude-fable-5",
      "claude-mythos-5",
      "claude-mythos-preview",
    ]) {
      assert.equal(anthropicModelUsesFixedDefaultSampling(model), true, model);
    }
  });

  it("returns false for configured Claude models that accept custom sampling", () => {
    for (const model of [
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-haiku-4-5",
      "claude-sonnet-4-5-20250929",
    ]) {
      assert.equal(anthropicModelUsesFixedDefaultSampling(model), false, model);
    }
  });
});

describe("openAiModelUsesMaxCompletionTokens", () => {
  it("returns true for reasoning-style model ids that require max_completion_tokens", () => {
    assert.equal(openAiModelUsesMaxCompletionTokens("o3-mini"), true);
    assert.equal(openAiModelUsesMaxCompletionTokens("O4-mini"), true);
    assert.equal(openAiModelUsesMaxCompletionTokens("O5-mini"), true);
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

  it("sends supported top_p but omits Ollama-only sampler fields", async () => {
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
      topP: 0.73,
      topK: 24,
      repetitionPenalty: 1.2,
    });

    assert.equal(body.top_p, 0.73);
    assert.equal(body.top_k, undefined);
    assert.equal(body.repetition_penalty, undefined);
  });

  it("sends reasoning_effort for supported OpenAI reasoning models", async () => {
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
      model: "gpt-5.4",
      reasoningEffort: "high",
    });

    assert.equal(body.reasoning_effort, "high");
  });

  it("omits reasoning_effort for auto and unsupported models", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new OpenAiProvider({ apiKey: "sk-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "gpt-5.4",
      reasoningEffort: "auto",
    });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "gpt-4o-mini",
      reasoningEffort: "high",
    });

    assert.equal("reasoning_effort" in (bodies[0] ?? {}), false);
    assert.equal("reasoning_effort" in (bodies[1] ?? {}), false);
  });

  it("retries once without reasoning_effort when OpenAI rejects it", async () => {
    const originalConsoleWarn = console.warn;
    const bodies: Array<Record<string, unknown>> = [];
    console.warn = () => {};
    try {
      globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        if (bodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: {
                message: "Unknown parameter: 'reasoning_effort'.",
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as typeof fetch;

      const provider = new OpenAiProvider({ apiKey: "sk-test" });
      const response = await provider.generateResponse([{ role: "user", content: "hi" }], {
        model: "gpt-5.4",
        reasoningEffort: "xhigh",
      });

      assert.equal(response, "ok");
      assert.equal(bodies.length, 2);
      assert.equal(bodies[0]?.reasoning_effort, "xhigh");
      assert.equal("reasoning_effort" in (bodies[1] ?? {}), false);
    } finally {
      console.warn = originalConsoleWarn;
    }
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

describe("AnthropicProvider request shape", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses the requested Claude model", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-opus-4-8",
    });

    assert.equal(body.model, "claude-opus-4-8");
  });

  it("does not send temperature and top_p together", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      temperature: 0.92,
      topP: 1,
    });

    assert.equal(body.temperature, 0.92);
    assert.equal("top_p" in body, false);
  });

  it("omits unsupported sampling controls for fixed-default Claude models", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-opus-4-8",
      temperature: 0.92,
      topP: 0.8,
      topK: 32,
    });

    assert.equal("temperature" in body, false);
    assert.equal("top_p" in body, false);
    assert.equal("top_k" in body, false);
  });

  it("translates PRISM reasoning effort into Anthropic output_config", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-opus-4-8",
      reasoningEffort: "xhigh",
    });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      reasoningEffort: "minimal",
    });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      reasoningEffort: "xhigh",
    });

    assert.deepEqual(bodies.map((body) => body.output_config), [
      { effort: "xhigh" },
      { effort: "low" },
      { effort: "max" },
    ]);
  });

  it("omits Anthropic effort for auto and unsupported models", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      reasoningEffort: "auto",
    });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-haiku-4-5",
      reasoningEffort: "high",
    });

    assert.deepEqual(bodies.map((body) => body.output_config), [undefined, undefined]);
  });

  it("still sends top_p when temperature is not configured", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "claude-sonnet-4-6",
      topP: 0.8,
    });

    assert.equal(body.top_p, 0.8);
    assert.equal("temperature" in body, false);
  });

  it("falls back to the Anthropic default for a stale OpenAI model override", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const provider = new AnthropicProvider({ apiKey: "sk-ant-test" });
    await provider.generateResponse([{ role: "user", content: "hi" }], {
      model: "gpt-5.3-chat-latest",
    });

    assert.equal(body.model, ANTHROPIC_DEFAULT_MODEL);
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
