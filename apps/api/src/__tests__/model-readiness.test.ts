import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  prepareLocalModel,
  resetModelReadinessForTests,
} from "../model-readiness.ts";
import { SECONDARY_OLLAMA_MODEL_PREFIX } from "../providers.ts";

const originalFetch = globalThis.fetch;

async function eventuallyReady(model: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await prepareLocalModel({ model });
    if (status.state === "ready") return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("model never became ready");
}

describe("local model readiness", () => {
  beforeEach(() => resetModelReadinessForTests());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetModelReadinessForTests();
  });

  it("returns ready without generating when /api/ps reports a live model", async () => {
    let chatCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [{
            name: "llama3.2:latest",
            digest: "sha256:warm",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }],
        });
      }
      chatCalls += 1;
      return Response.json({ message: { content: "" } });
    }) as typeof fetch;

    const status = await prepareLocalModel({ model: "llama3.2" });

    assert.equal(status.state, "ready");
    assert.equal(chatCalls, 0);
  });

  it("shares one empty preparation request across concurrent callers", async () => {
    let resident = false;
    let chatCalls = 0;
    let releaseChat!: () => void;
    const chatGate = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: resident
            ? [{
                model: "llama3.2",
                digest: "sha256:loaded",
                expires_at: new Date(Date.now() + 60_000).toISOString(),
              }]
            : [],
        });
      }
      assert.equal(url.endsWith("/api/chat"), true);
      chatCalls += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.deepEqual(body.messages, []);
      assert.equal(body.keep_alive, "10m");
      await chatGate;
      resident = true;
      return Response.json({ done: true });
    }) as typeof fetch;

    const [first, second] = await Promise.all([
      prepareLocalModel({ model: "llama3.2" }),
      prepareLocalModel({ model: "llama3.2" }),
    ]);

    assert.equal(first.state, "warming");
    assert.equal(second.state, "warming");
    assert.equal(first.startedAt, second.startedAt);
    assert.equal(chatCalls, 1);
    releaseChat();
    await eventuallyReady("llama3.2");
  });

  it("treats expired residency as cold", async () => {
    let chatCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [{
            model: "llama3.2",
            digest: "sha256:expired",
            expires_at: new Date(Date.now() - 1_000).toISOString(),
          }],
        });
      }
      chatCalls += 1;
      return Response.json({ done: true });
    }) as typeof fetch;

    const status = await prepareLocalModel({ model: "llama3.2" });

    assert.equal(status.state, "warming");
    assert.equal(chatCalls, 1);
  });

  it("uses the paired host for explicitly paired models", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrls.push(String(input));
      return Response.json({
        models: [{
          model: "llama3.2",
          digest: "sha256:paired",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        }],
      });
    }) as typeof fetch;

    const status = await prepareLocalModel({
      model: `${SECONDARY_OLLAMA_MODEL_PREFIX}llama3.2`,
      options: { secondaryOllamaHost: "http://192.168.1.22:11434" },
    });

    assert.equal(status.state, "ready");
    assert.equal(requestedUrls[0], "http://192.168.1.22:11434/api/ps");
    assert.equal(status.model, "llama3.2");
  });

  it("turns an overlong preparation into a timed-out failure", async () => {
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (String(input).endsWith("/api/ps")) {
        return Response.json({ models: [] });
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    }) as typeof fetch;

    const first = await prepareLocalModel({
      model: "slow-model",
      timeoutMs: 5,
    });
    assert.equal(first.state, "warming");
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    const failed = await prepareLocalModel({ model: "slow-model" });

    assert.equal(failed.state, "unavailable");
    assert.equal(failed.failure, "timed_out");
  });

  it("reports a missing model without exposing Ollama response details", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/ps")) {
        return Response.json({ models: [] });
      }
      return new Response(
        "model not found at http://private-ollama.internal:11434",
        { status: 404 },
      );
    }) as typeof fetch;

    const first = await prepareLocalModel({ model: "missing-model" });
    assert.equal(first.state, "warming");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const failed = await prepareLocalModel({ model: "missing-model" });

    assert.equal(failed.state, "unavailable");
    assert.equal(failed.failure, "model_unavailable");
    assert.equal(JSON.stringify(failed).includes("private-ollama"), false);
  });
});
