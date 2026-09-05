import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PreparedTurnV1 } from "@localai/shared";

import { waitForSignalTurnPreparation } from "./signalTurnPreparationWait.ts";

function preparing(): PreparedTurnV1 {
  return {
    v: 1,
    id: "preparation-1",
    surface: "signal",
    sessionId: "episode-1",
    stateCursor: {
      revision: 1,
      lastMessageId: "message-1",
      lastEventId: "event-4",
      floorOwnerId: "host-1",
      castHash: "cast-1",
      powersHash: "powers-1",
      promptStateHash: "prompt-1",
    },
    phase: "preparing",
    provisionalUtterances: [],
    speakerBotId: null,
    createdAt: "2026-08-29T17:10:52.677Z",
    updatedAt: "2026-08-29T17:10:52.677Z",
    expiresAt: "2026-08-29T17:22:52.677Z",
    error: null,
    commitResult: null,
  };
}

describe("Signal turn preparation wait", () => {
  it("releases a stalled speculative preparation to foreground recovery", async () => {
    let nowMs = 1_000;
    const requests: string[] = [];
    const result = await waitForSignalTurnPreparation({
      initial: preparing(),
      signal: new AbortController().signal,
      maxWaitMs: 30,
      now: () => nowMs,
      request: async (path) => {
        requests.push(path);
        nowMs += 30;
        return { preparation: preparing() };
      },
    });

    assert.equal(result.timedOut, true);
    assert.equal(result.preparation.phase, "preparing");
    assert.deepEqual(requests, [
      "/api/turn-preparations/preparation-1?waitMs=30",
    ]);
  });

  it("keeps a ready preparation on the fast commit path", async () => {
    const ready = {
      ...preparing(),
      phase: "ready" as const,
      speakerBotId: "host-1",
      provisionalUtterances: [
        {
          id: "message-2",
          speakerBotId: "host-1",
          text: "Recovered before the foreground needed to wait.",
        },
      ],
    };
    const result = await waitForSignalTurnPreparation({
      initial: ready,
      signal: new AbortController().signal,
      request: async () => {
        throw new Error("ready preparations must not poll");
      },
    });

    assert.equal(result.timedOut, false);
    assert.equal(result.preparation, ready);
  });

  it("cancels an in-flight speculative wait without committing its buffer", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const waiting = waitForSignalTurnPreparation({
      initial: preparing(),
      signal: controller.signal,
      request: async (_path, options) => {
        receivedSignal = options?.signal ?? undefined;
        return new Promise<{ preparation: PreparedTurnV1 }>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("preparation cancelled")),
            { once: true },
          );
        });
      },
    });

    controller.abort();
    await assert.rejects(waiting, /preparation cancelled/u);
    assert.equal(receivedSignal, controller.signal);
  });
});
