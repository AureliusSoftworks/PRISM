import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  claimLiveLocalModelLane,
  keepAuxiliaryLocalModelWarm,
  prepareLocalModel,
  releaseLiveLocalModelLane,
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

  it("leaves warming as soon as a concurrent real request makes the model resident", async () => {
    let resident = false;
    let chatCalls = 0;
    let releaseChat!: () => void;
    const chatGate = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    globalThis.fetch = (async (
      input: string | URL | Request,
    ) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: resident
            ? [
                {
                  model: "llama3.2",
                  digest: "sha256:loaded-by-real-turn",
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                },
              ]
            : [],
        });
      }
      assert.equal(url.endsWith("/api/chat"), true);
      chatCalls += 1;
      await chatGate;
      return Response.json({ done: true });
    }) as typeof fetch;

    const warming = await prepareLocalModel({ model: "llama3.2" });
    assert.equal(warming.state, "warming");
    assert.equal(chatCalls, 1);

    resident = true;
    const ready = await prepareLocalModel({ model: "llama3.2" });
    assert.equal(ready.state, "ready");
    assert.equal(ready.expiresAt !== null, true);
    assert.equal(chatCalls, 1);

    releaseChat();
    await eventuallyReady("llama3.2");
  });

  it("recovers a cached warmup failure when a real request made the model resident", async () => {
    let resident = false;
    let chatCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: resident
            ? [
                {
                  model: "llama3.2:latest",
                  digest: "sha256:loaded-after-warmup-failure",
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                },
              ]
            : [],
        });
      }
      assert.equal(url.endsWith("/api/chat"), true);
      chatCalls += 1;
      return new Response("warmup failed", { status: 500 });
    }) as typeof fetch;

    const warming = await prepareLocalModel({ model: "llama3.2" });
    assert.equal(warming.state, "warming");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const failed = await prepareLocalModel({ model: "llama3.2" });
    assert.equal(failed.state, "unavailable");
    assert.equal(failed.failure, "request_failed");

    resident = true;
    const ready = await prepareLocalModel({ model: "llama3.2" });
    assert.equal(ready.state, "ready");
    assert.equal(ready.expiresAt !== null, true);
    assert.equal(chatCalls, 1);
  });

  it("coalesces persistent auxiliary warms and uses indefinite residency", async () => {
    let resident = false;
    let chatCalls = 0;
    let releaseChat!: () => void;
    const chatGate = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/api/ps")) {
        return Response.json({
          models: resident
            ? [{
                model: "auxiliary-override",
                digest: "sha256:auxiliary",
                expires_at: null,
              }]
            : [],
        });
      }
      chatCalls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      assert.deepEqual(body.messages, []);
      assert.equal(body.model, "auxiliary-override");
      assert.equal(body.keep_alive, -1);
      await chatGate;
      resident = true;
      return Response.json({ done: true });
    }) as typeof fetch;

    const first = keepAuxiliaryLocalModelWarm({ model: "auxiliary-override" });
    const second = keepAuxiliaryLocalModelWarm({ model: "auxiliary-override" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(chatCalls, 1);
    releaseChat();
    const [firstReady, secondReady] = await Promise.all([first, second]);
    assert.equal(firstReady.state, "ready");
    assert.equal(secondReady.state, "ready");
  });

  it("gives live sessions one residency lane without evicting another live owner", async () => {
    let running = ["coffee-model", "auxiliary-model", "stale-model"];
    const unloaded: string[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: running.map((model) => ({ model, digest: `sha256:${model}` })),
        });
      }
      assert.equal(url.endsWith("/api/generate"), true);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      assert.equal(body.keep_alive, 0);
      assert.equal(body.prompt, "");
      unloaded.push(String(body.model));
      running = running.filter((model) => model !== body.model);
      return Response.json({ done: true });
    }) as typeof fetch;

    assert.equal(
      await claimLiveLocalModelLane({
        owner: "coffee:user:session",
        model: "coffee-model",
      }),
      true,
    );
    assert.deepEqual(unloaded, ["auxiliary-model", "stale-model"]);

    running.push("signal-model", "new-stale-model");
    assert.equal(
      await claimLiveLocalModelLane({
        owner: "signal:user:episode",
        model: "signal-model",
      }),
      true,
    );
    assert.deepEqual(unloaded, [
      "auxiliary-model",
      "stale-model",
      "new-stale-model",
    ]);
  });

  it("suppresses auxiliary residency while a live session owns that host", async () => {
    let chatCalls = 0;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [{ model: "coffee-model", digest: "sha256:coffee" }],
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      if (url.endsWith("/api/chat")) chatCalls += 1;
      return Response.json({ model: body.model, done: true });
    }) as typeof fetch;

    await claimLiveLocalModelLane({
      owner: "coffee:user:session",
      model: "coffee-model",
    });
    const status = await keepAuxiliaryLocalModelWarm({
      model: "auxiliary-model",
    });

    assert.equal(status.state, "not_applicable");
    assert.equal(chatCalls, 0);
  });

  it("pauses an in-flight auxiliary warmup without unloading its residency", async () => {
    let warmupAborted = false;
    let auxResident = false;
    const unloaded: string[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [
            { model: "coffee-model", digest: "sha256:coffee" },
            ...(auxResident
              ? [{ model: "auxiliary-model", digest: "sha256:aux" }]
              : []),
          ],
        });
      }
      if (url.endsWith("/api/chat")) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              warmupAborted = true;
              auxResident = true;
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      unloaded.push(String(body.model));
      auxResident = false;
      return Response.json({ done: true });
    }) as typeof fetch;

    const warmup = keepAuxiliaryLocalModelWarm({ model: "auxiliary-model" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await claimLiveLocalModelLane({
      owner: "coffee:user:session",
      model: "coffee-model",
      quiesceOtherModels: true,
    });
    await warmup;

    assert.equal(warmupAborted, true);
    assert.deepEqual(unloaded, []);
  });

  it("releases a finished live model only after its final owner exits", async () => {
    const unloaded: string[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.endsWith("/api/ps")) {
        return Response.json({
          models: [{ model: "shared-live-model", digest: "sha256:shared" }],
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      unloaded.push(String(body.model));
      return Response.json({ done: true });
    }) as typeof fetch;

    await claimLiveLocalModelLane({ owner: "coffee:a", model: "shared-live-model" });
    await claimLiveLocalModelLane({ owner: "signal:b", model: "shared-live-model" });
    await releaseLiveLocalModelLane("coffee:a");
    assert.deepEqual(unloaded, []);
    await releaseLiveLocalModelLane("signal:b");
    assert.deepEqual(unloaded, ["shared-live-model"]);
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
