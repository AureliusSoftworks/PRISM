import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import type { IncomingMessage } from "node:http";

import { HttpError, readJsonBody } from "../utils.http.ts";

function requestFromChunks(
  chunks: Array<string | Buffer>,
  contentLength?: number,
): IncomingMessage {
  const request = Readable.from(chunks) as IncomingMessage;
  request.headers = contentLength === undefined
    ? {}
    : { "content-length": String(contentLength) };
  return request;
}

describe("readJsonBody bounds", () => {
  it("parses a body within the configured transport bound", async () => {
    assert.deepEqual(
      await readJsonBody(requestFromChunks(['{"ok":', "true}"]), 32),
      { ok: true },
    );
  });

  it("rejects oversized declared and streamed bodies with 413", async () => {
    for (const request of [
      requestFromChunks(["{}"], 33),
      requestFromChunks(["1234", "5678"], undefined),
    ]) {
      await assert.rejects(
        readJsonBody(request, 7),
        (error: unknown) =>
          error instanceof HttpError && error.statusCode === 413,
      );
    }
  });
});
