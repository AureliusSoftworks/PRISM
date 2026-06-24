import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server.js";
import { BACKEND_UNAVAILABLE_CODE } from "./backendUnavailable.ts";
import { GET } from "./api/[[...path]]/route.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Prism API proxy backend-down behavior", () => {
  it("returns a deliberate 503 JSON payload when the upstream API is unreachable", async () => {
    globalThis.fetch = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:18787");
    };

    const response = await GET(new NextRequest("http://127.0.0.1:18788/api/health"), {
      params: Promise.resolve({ path: ["health"] }),
    });
    const text = await response.text();
    const payload = JSON.parse(text) as {
      ok: boolean;
      code?: string;
      error?: string;
      retryable?: boolean;
      detail?: string;
    };

    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(payload.ok, false);
    assert.equal(payload.code, BACKEND_UNAVAILABLE_CODE);
    assert.equal(payload.error, "Prism is waiting for its local API.");
    assert.equal(payload.retryable, true);
    assert.match(payload.detail ?? "", /ECONNREFUSED/);
    assert.doesNotMatch(text, /Internal Server Error|<html/i);
  });
});
