import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CoffeeTurnJobStatus } from "@localai/shared";
import { coffeeTurnRecoveryDecision } from "./coffee-turn-recovery.ts";

function failedJob(args: {
  selectionKind: "auto" | "fixed";
  ordinal?: number;
  speakerBotId?: string | null;
}): CoffeeTurnJobStatus {
  const retry =
    args.ordinal === undefined
      ? undefined
      : {
          v: 1 as const,
          retryOfJobId: "previous",
          expectedLatestMessageCursor: "message-1",
          ordinal: args.ordinal,
        };
  return {
    id: `job-${args.ordinal ?? 0}`,
    conversationId: "coffee-1",
    phase: "failed",
    speakerBotId: args.speakerBotId ?? "mira",
    startedAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:01.000Z",
    interruptEligibleAt: null,
    ...(retry ? { retry } : {}),
    failure: {
      v: 1,
      code: "provider_unavailable",
      selectionKind: args.selectionKind,
      attempts: [],
      speakerBotId: args.speakerBotId ?? "mira",
      latestMessageCursor: "message-1",
      retry: retry ?? null,
      retryable: true,
    },
  };
}

describe("Coffee bounded turn recovery", () => {
  it("retries a fixed model once and then pauses without substitution", () => {
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({ selectionKind: "fixed" }),
        turnKind: "autonomous",
      }),
      { kind: "retry" },
    );
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({ selectionKind: "fixed", ordinal: 1 }),
        turnKind: "autonomous",
      }),
      { kind: "pause" },
    );
  });

  it("lets Auto retry, skip one autonomous speaker, then pauses", () => {
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({ selectionKind: "auto" }),
        turnKind: "autonomous",
      }),
      { kind: "retry" },
    );
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({
          selectionKind: "auto",
          ordinal: 1,
          speakerBotId: "sol",
        }),
        turnKind: "autonomous",
      }),
      { kind: "retry_excluding_speaker", speakerBotId: "sol" },
    );
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({ selectionKind: "auto", ordinal: 2 }),
        turnKind: "autonomous",
      }),
      { kind: "pause" },
    );
  });

  it("never skips a speaker for a player-authored turn", () => {
    assert.deepEqual(
      coffeeTurnRecoveryDecision({
        failedJob: failedJob({ selectionKind: "auto", ordinal: 1 }),
        turnKind: "user",
      }),
      { kind: "pause" },
    );
  });
});
