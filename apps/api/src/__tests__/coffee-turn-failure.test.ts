import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutoFallbackExhaustedError } from "../auto-fallback.ts";
import { coffeeTurnJobFailureV1 } from "../coffee-turn-failure.ts";

describe("Coffee turn job failure contract", () => {
  it("projects Auto exhaustion into safe structured traces", () => {
    const failure = coffeeTurnJobFailureV1({
      error: new AutoFallbackExhaustedError([
        {
          provider: "openai",
          model: "gpt-test",
          durationMs: 123.6,
          outcome: "failed",
          reason: "provider_error",
        },
      ]),
      selectionKind: "auto",
      speakerBotId: "mira",
      latestMessageCursor: "message-7",
    });
    assert.equal(failure.code, "auto_fallback_exhausted");
    assert.equal(failure.retryable, true);
    assert.equal(failure.selectionKind, "auto");
    assert.deepEqual(failure.attempts, [
      {
        provider: "openai",
        model: "gpt-test",
        durationMs: 124,
        outcome: "failed",
        reason: "provider_error",
      },
    ]);
  });

  it("keeps a fixed-model provider failure fixed", () => {
    const failure = coffeeTurnJobFailureV1({
      error: new Error("Selected provider is unavailable."),
      selectionKind: "fixed",
      speakerBotId: "sol",
      latestMessageCursor: null,
      retry: {
        v: 1,
        retryOfJobId: "job-1",
        expectedLatestMessageCursor: null,
        ordinal: 1,
      },
    });
    assert.equal(failure.code, "provider_unavailable");
    assert.equal(failure.selectionKind, "fixed");
    assert.equal(failure.retry?.retryOfJobId, "job-1");
  });
});
