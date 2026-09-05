import assert from "node:assert/strict";
import test from "node:test";
import type { BotcastReplayEvent } from "@localai/shared";
import {
  SIGNAL_DEGRADED_SESSION_TURN_THRESHOLD,
  signalDegradedSessionTurnCount,
  signalSessionIsDegraded,
} from "./signalDegradedSession.ts";

test("Signal warns after three distinct repaired or rerouted turns", () => {
  const events = Array.from(
    { length: SIGNAL_DEGRADED_SESSION_TURN_THRESHOLD },
    (_, index) => ({
      id: `event-${index}`,
      episodeId: "episode-1",
      sequence: index + 1,
      kind: "utterance" as const,
      payload: {
        messageId: `message-${index}`,
        provider: index === 2 ? "deterministic" : "openai",
        autoRecovery:
          index < 2
            ? { attempts: [{ outcome: "failed" }, { outcome: "succeeded" }] }
            : undefined,
      },
      occurredAt: "2026-08-29T00:00:00.000Z",
    }),
  ) as BotcastReplayEvent[];

  assert.equal(signalDegradedSessionTurnCount(events), 3);
  assert.equal(signalSessionIsDegraded(events), true);
  assert.equal(signalSessionIsDegraded(events.slice(0, 2)), false);
});

test("Signal counts same-route provider redrafts as visible recovery", () => {
  const events = Array.from({ length: 3 }, (_, index) => ({
    id: `redraft-${index}`,
    episodeId: "episode-redraft",
    sequence: index + 1,
    kind: "utterance" as const,
    payload: {
      messageId: `redraft-message-${index}`,
      provider: "openai",
      providerRecovery: {
        attempts: [{ outcome: "rejected" }, { outcome: "succeeded" }],
      },
    },
    occurredAt: "2026-08-29T00:00:00.000Z",
  })) as BotcastReplayEvent[];

  assert.equal(signalDegradedSessionTurnCount(events), 3);
  assert.equal(signalSessionIsDegraded(events), true);
});
