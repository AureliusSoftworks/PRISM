import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { interruptRelationshipDepthReturn } from "./relationshipDepthReturnInterruption.ts";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("relationship-depth return interruption", () => {
  it("settles a pending reply before stopping audio and completing its reveal", async () => {
    const settlement = deferred();
    const events: string[] = [];
    const interruption = interruptRelationshipDepthReturn({
      cancelQueuedAndFollowupWork: () => events.push("cancel-queued"),
      cancelStarterWork: () => events.push("cancel-starter"),
      clearStarterReplyCache: () => events.push("clear-starter-cache"),
      pendingReplyVisible: true,
      stopPendingReply: () => events.push("stop-pending"),
      pendingReplySettled: settlement.promise,
      waitForPendingReplyRender: async () => {
        events.push("render-settled");
      },
      stopResponseAudio: () => events.push("stop-audio"),
      finishResponseReveal: () => events.push("finish-reveal"),
    });

    await Promise.resolve();
    assert.deepEqual(events, [
      "cancel-queued",
      "cancel-starter",
      "clear-starter-cache",
      "stop-pending",
    ]);

    settlement.resolve();
    await interruption;
    assert.deepEqual(events, [
      "cancel-queued",
      "cancel-starter",
      "clear-starter-cache",
      "stop-pending",
      "render-settled",
      "stop-audio",
      "finish-reveal",
    ]);
  });

  it("stops active response audio and reveal without inventing a pending wait", async () => {
    const events: string[] = [];
    await interruptRelationshipDepthReturn({
      cancelQueuedAndFollowupWork: () => events.push("cancel-queued"),
      cancelStarterWork: () => events.push("cancel-starter"),
      clearStarterReplyCache: () => events.push("clear-starter-cache"),
      pendingReplyVisible: false,
      stopPendingReply: () => events.push("unexpected-stop"),
      pendingReplySettled: null,
      waitForPendingReplyRender: async () => {
        events.push("unexpected-render-wait");
      },
      stopResponseAudio: () => events.push("stop-audio"),
      finishResponseReveal: () => events.push("finish-reveal"),
    });

    assert.deepEqual(events, [
      "cancel-queued",
      "cancel-starter",
      "clear-starter-cache",
      "stop-audio",
      "finish-reveal",
    ]);
  });
});
