import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  relationshipDepthManualBeatTiming,
  relationshipDepthNativeViewTransitionEligible,
  runRelationshipDepthViewTransition,
} from "./relationshipDepthViewTransition.ts";

const never = new Promise<void>(() => undefined);

describe("relationship-depth native View Transition guard", () => {
  it("keeps reduced motion on the native crossfade even for async handoffs", () => {
    assert.equal(
      relationshipDepthNativeViewTransitionEligible({
        supported: true,
        reducedMotion: true,
        asyncHandoffSafe: false,
      }),
      true,
    );
    assert.equal(
      relationshipDepthNativeViewTransitionEligible({
        supported: true,
        reducedMotion: false,
        asyncHandoffSafe: false,
      }),
      false,
    );
    assert.equal(
      relationshipDepthNativeViewTransitionEligible({
        supported: true,
        reducedMotion: false,
        asyncHandoffSafe: true,
      }),
      true,
    );
    assert.equal(
      relationshipDepthNativeViewTransitionEligible({
        supported: false,
        reducedMotion: true,
        asyncHandoffSafe: true,
      }),
      false,
    );
  });

  it("gives a manual reduced-motion crossfade equal 140ms beats", () => {
    assert.deepEqual(
      relationshipDepthManualBeatTiming({
        crossfade: true,
        reducedMotion: true,
      }),
      { sourceMs: 140, destinationMs: 140 },
    );
    assert.deepEqual(
      relationshipDepthManualBeatTiming({
        crossfade: true,
        reducedMotion: false,
      }),
      { sourceMs: 220, destinationMs: 220 },
    );
    assert.deepEqual(
      relationshipDepthManualBeatTiming({
        crossfade: false,
        reducedMotion: false,
      }),
      { sourceMs: 80, destinationMs: 220 },
    );
  });

  it("uses the native callback and commits exactly once", async () => {
    const calls: boolean[] = [];
    await runRelationshipDepthViewTransition({
      startViewTransition: (update) => {
        const updateDone = Promise.resolve(update());
        return { finished: updateDone, updateCallbackDone: updateDone };
      },
      handoff: async (insideNative) => {
        calls.push(insideNative);
      },
      wait: async () => never,
      timeoutMs: 900,
      updateCallbackGraceMs: 120,
      fallbackSettleMs: 220,
    });

    assert.deepEqual(calls, [true]);
  });

  it("skips a stalled snapshot and commits once through the fallback", async () => {
    const calls: boolean[] = [];
    let skipped = 0;
    await runRelationshipDepthViewTransition({
      startViewTransition: () => ({
        finished: never,
        skipTransition: () => {
          skipped += 1;
        },
      }),
      handoff: (insideNative) => {
        calls.push(insideNative);
      },
      wait: async () => undefined,
      timeoutMs: 900,
      updateCallbackGraceMs: 120,
      fallbackSettleMs: 220,
    });

    assert.equal(skipped, 1);
    assert.deepEqual(calls, [false]);
  });

  it("ignores a native callback that arrives after fallback commit", async () => {
    const calls: boolean[] = [];
    const pending: { update?: () => void | Promise<void> } = {};
    await runRelationshipDepthViewTransition({
      startViewTransition: (update) => {
        pending.update = update;
        return { finished: never };
      },
      handoff: (insideNative) => {
        calls.push(insideNative);
      },
      wait: async () => undefined,
      timeoutMs: 900,
      updateCallbackGraceMs: 120,
      fallbackSettleMs: 220,
    });
    assert.ok(pending.update);
    await pending.update();

    assert.deepEqual(calls, [false]);
  });

  it("propagates a rejected update callback without retrying its commit", async () => {
    const calls: boolean[] = [];
    const failure = new Error("destination failed");

    await assert.rejects(
      runRelationshipDepthViewTransition({
        startViewTransition: (update) => {
          const updateDone = Promise.resolve(update());
          return {
            finished: updateDone.then(() => undefined),
            updateCallbackDone: updateDone,
            skipTransition: () => undefined,
          };
        },
        handoff: async (insideNative) => {
          calls.push(insideNative);
          throw failure;
        },
        wait: async () => never,
        timeoutMs: 900,
        updateCallbackGraceMs: 120,
        fallbackSettleMs: 220,
      }),
      failure,
    );

    assert.deepEqual(calls, [true]);
  });

  it("recovers when native setup rejects before invoking the callback", async () => {
    const calls: boolean[] = [];
    let skipped = 0;
    const result = await runRelationshipDepthViewTransition({
      startViewTransition: () => ({
        finished: Promise.reject(new Error("snapshot failed")),
        skipTransition: () => {
          skipped += 1;
        },
      }),
      handoff: (insideNative) => {
        calls.push(insideNative);
      },
      wait: async () => undefined,
      timeoutMs: 900,
      updateCallbackGraceMs: 120,
      fallbackSettleMs: 220,
    });

    assert.equal(result, "fallback");
    assert.equal(skipped, 1);
    assert.deepEqual(calls, [false]);
  });

  it("consumes the ready rejection produced by a deliberately skipped transition", async () => {
    let readyCatchCalls = 0;
    const skippedError = new Error("Transition was skipped");
    const ready = {
      catch: (onRejected: (reason: unknown) => unknown) => {
        readyCatchCalls += 1;
        return Promise.resolve(onRejected(skippedError));
      },
    } as Promise<void>;

    const result = await runRelationshipDepthViewTransition({
      startViewTransition: () => ({
        finished: never,
        ready,
        skipTransition: () => undefined,
      }),
      handoff: () => undefined,
      wait: async () => undefined,
      timeoutMs: 900,
      updateCallbackGraceMs: 120,
      fallbackSettleMs: 220,
    });

    assert.equal(result, "fallback");
    assert.equal(readyCatchCalls, 1);
  });
});
