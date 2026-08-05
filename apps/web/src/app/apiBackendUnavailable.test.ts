import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server.js";
import { BACKEND_UNAVAILABLE_CODE } from "./backendUnavailable.ts";
import { GET, POST } from "./api/[[...path]]/route.ts";

type MockHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer
) => void | Promise<void>;

let mockServer: http.Server | null = null;
let previousApiOrigin: string | undefined;

async function startMockApi(handler: MockHandler): Promise<string> {
  mockServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      void Promise.resolve(handler(req, res, Buffer.concat(chunks))).catch(
        (err) => {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : "mock error");
        }
      );
    });
  });
  await new Promise<void>((resolve) => {
    mockServer!.listen(0, "127.0.0.1", () => resolve());
  });
  const address = mockServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  previousApiOrigin = process.env.LOCALAI_API_ORIGIN;
  process.env.LOCALAI_API_ORIGIN = origin;
  return origin;
}

afterEach(async () => {
  if (previousApiOrigin === undefined) {
    delete process.env.LOCALAI_API_ORIGIN;
  } else {
    process.env.LOCALAI_API_ORIGIN = previousApiOrigin;
  }
  previousApiOrigin = undefined;
  if (mockServer) {
    const server = mockServer;
    mockServer = null;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe("Prism API proxy backend-down behavior", () => {
  it("returns a deliberate 503 JSON payload when the upstream API is unreachable", async () => {
    previousApiOrigin = process.env.LOCALAI_API_ORIGIN;
    // Bind nothing on this port — connection must refuse.
    process.env.LOCALAI_API_ORIGIN = "http://127.0.0.1:9";

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

  it("buffers POST bodies and preserves a delayed API error response", async () => {
    await startMockApi(async (req, res, body) => {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/api/voices/synthesize");
      assert.equal(body.toString("utf8"), JSON.stringify({ text: "Preview Sheldon" }));
      // Simulate a slow local backend that still eventually answers.
      await new Promise((resolve) => setTimeout(resolve, 25));
      res.statusCode = 429;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: "ElevenLabs does not have enough voice credits.",
        })
      );
    });

    const response = await POST(
      new NextRequest("http://127.0.0.1:18788/api/voices/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Preview Sheldon" }),
      }),
      { params: Promise.resolve({ path: ["voices", "synthesize"] }) },
    );

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "ElevenLabs does not have enough voice credits.",
    });
  });

  it("does not report a cancelled browser request as an API outage", async () => {
    await startMockApi((_req, res) => {
      res.statusCode = 200;
      res.end("should not matter");
    });
    const controller = new AbortController();
    controller.abort();

    const response = await GET(
      new NextRequest("http://127.0.0.1:18788/api/voices/synthesize", {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ path: ["voices", "synthesize"] }) },
    );

    assert.equal(response.status, 499);
    assert.equal(await response.text(), "");
  });
});
