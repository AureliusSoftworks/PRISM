import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachWebRequestDiagnostic,
  buildWebDiagnosticReport,
  sanitizeDiagnosticValue,
} from "./webDiagnostics.ts";

describe("web diagnostics", () => {
  it("redacts sensitive keys and values with bounded recursive output", () => {
    const sanitized = sanitizeDiagnosticValue({
      apiKey: "sk-private-key",
      transcript: "private conversation",
      nested: {
        authorization: "Bearer private-token",
        safe: "Bearer should-not-survive",
      },
      error: new Error("server echoed private message text"),
      many: Array.from({ length: 40 }, (_, index) => index),
    }) as Record<string, unknown>;

    assert.equal(sanitized.apiKey, "[redacted]");
    assert.equal(sanitized.transcript, "[redacted]");
    assert.deepEqual(sanitized.nested, {
      authorization: "[redacted]",
      safe: "[redacted]",
    });
    const sanitizedError = sanitized.error as {
      name: string;
      message: string;
      stackFrames: string[];
    };
    assert.equal(sanitizedError.name, "Error");
    assert.equal(sanitizedError.message, "[redacted]");
    assert.ok(
      sanitizedError.stackFrames.length > 0,
    );
    assert.doesNotMatch(
      sanitizedError.stackFrames.join("\n"),
      /\/Users\/jared/u,
    );
    assert.equal((sanitized.many as unknown[]).length, 24);
  });

  it("formats request context without a body, query string, or raw error message", () => {
    const error = new Error("Transcript: this must never be copied");
    Object.assign(error, { code: "SIGNAL_SYNTHESIS_FAILED" });
    attachWebRequestDiagnostic(error, {
      method: "post",
      path: "/api/botcast/episodes/episode-1/advance?token=private",
      status: 502,
    });
    const report = buildWebDiagnosticReport({
      app: "PRISM",
      appVersion: "0.11.0",
      surface: "Signal",
      operation: "Advance Signal episode",
      stage: "request",
      summary: "Signal request failed.",
      error,
      timestamp: "2026-07-19T12:34:56.000Z",
    });

    assert.match(report, /timestamp: 2026-07-19T12:34:56.000Z/u);
    assert.match(report, /appVersion: \d+\.\d+\.\d+/u);
    assert.match(report, /method: POST/u);
    assert.match(report, /path: \/api\/botcast\/episodes\/episode-1\/advance/u);
    assert.match(report, /httpStatus: 502/u);
    assert.match(report, /message": "\[redacted\]"/u);
    assert.match(report, /code": "SIGNAL_SYNTHESIS_FAILED"/u);
    assert.match(report, /stackFrames/u);
    assert.doesNotMatch(report, /token=private|private message/iu);
  });
});
