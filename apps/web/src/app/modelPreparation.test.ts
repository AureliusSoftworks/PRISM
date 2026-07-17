import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelPreparationResponse } from "@localai/shared";
import {
  modelPreparationFailureMessage,
  waitForModelPreparation,
} from "./modelPreparation.ts";

describe("model preparation polling", () => {
  it("polls one server-side preparation without holding an HTTP request open", async () => {
    const statuses: ModelPreparationResponse[] = [
      {
        ok: true,
        state: "warming",
        model: "llama3.2",
        startedAt: "2026-07-17T00:00:00.000Z",
        expiresAt: null,
        retryAfterMs: 0,
        failure: null,
      },
      {
        ok: true,
        state: "ready",
        model: "llama3.2",
        startedAt: null,
        expiresAt: "2026-07-17T00:10:00.000Z",
        retryAfterMs: null,
        failure: null,
      },
    ];
    const bodies: Array<Record<string, unknown>> = [];
    const observed: string[] = [];
    const result = await waitForModelPreparation({
      request: async <T>(_path: string, init?: RequestInit): Promise<T> => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return statuses.shift() as T;
      },
      provider: "local",
      model: "llama3.2",
      experience: "coffee",
      onStatus: (status) => observed.push(status.state),
    });

    assert.equal(result.state, "ready");
    assert.deepEqual(observed, ["warming", "ready"]);
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[0], {
      provider: "local",
      model: "llama3.2",
      experience: "coffee",
    });
  });

  it("uses bounded, actionable failure copy", () => {
    assert.match(
      modelPreparationFailureMessage({ failure: "runtime_unavailable" }),
      /check Ollama/i,
    );
    assert.match(
      modelPreparationFailureMessage({ failure: "timed_out" }),
      /still paused/i,
    );
    assert.equal(
      modelPreparationFailureMessage({ failure: "request_failed" }).includes(
        "%",
      ),
      false,
    );
  });

  it("aborts a pending poll without issuing another request", async () => {
    const controller = new AbortController();
    let requestCount = 0;
    const pending = waitForModelPreparation({
      request: async <T>(): Promise<T> => {
        requestCount += 1;
        controller.abort();
        return {
          ok: true,
          state: "warming",
          model: "llama3.2",
          startedAt: "2026-07-17T00:00:00.000Z",
          expiresAt: null,
          retryAfterMs: 1_000,
          failure: null,
        } as T;
      },
      provider: "local",
      model: "llama3.2",
      experience: "coffee",
      signal: controller.signal,
    });

    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(requestCount, 1);
  });
});
