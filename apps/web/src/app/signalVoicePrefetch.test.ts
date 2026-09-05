import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignalVoicePrefetchScheduler } from "./signalVoicePrefetch.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("SignalVoicePrefetchScheduler", () => {
  it("deduplicates paid work and bounds concurrent synthesis", async () => {
    const scheduler = new SignalVoicePrefetchScheduler<string>(2);
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let active = 0;
    let maximumActive = 0;
    let calls = 0;
    const schedule = (index: number) =>
      scheduler.schedule({
        episodeId: "episode-1",
        messageId: `message-${index}`,
        task: async () => {
          calls += 1;
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          const value = await gates[index]!.promise;
          active -= 1;
          return value;
        },
      });

    const first = schedule(0);
    assert.equal(schedule(0), first);
    const second = schedule(1);
    const third = schedule(2);
    await Promise.resolve();
    assert.equal(calls, 2);
    assert.equal(maximumActive, 2);

    gates[0]!.resolve("first");
    assert.equal(await first, "first");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 3);
    gates[1]!.resolve("second");
    gates[2]!.resolve("third");
    assert.equal(await second, "second");
    assert.equal(await third, "third");
  });

  it("invalidates queued and in-flight work without publishing stale audio", async () => {
    const scheduler = new SignalVoicePrefetchScheduler<string>(1);
    const inFlight = deferred<string>();
    let queuedCalls = 0;
    let observedAbort = false;
    const first = scheduler.schedule({
      episodeId: "episode-stale",
      messageId: "message-in-flight",
      task: async (signal) => {
        signal.addEventListener("abort", () => {
          observedAbort = true;
        });
        return inFlight.promise;
      },
    });
    const queued = scheduler.schedule({
      episodeId: "episode-stale",
      messageId: "message-queued",
      task: async () => {
        queuedCalls += 1;
        return "must-not-run";
      },
    });

    scheduler.invalidateEpisode("episode-stale");
    assert.equal(await queued, null);
    assert.equal(queuedCalls, 0);
    assert.equal(observedAbort, true);
    inFlight.resolve("late-paid-audio");
    assert.equal(await first, null);
  });

  it("invalidates only the exact provisional message in its episode", async () => {
    const scheduler = new SignalVoicePrefetchScheduler<string>(2);
    const stale = deferred<string>();
    const current = deferred<string>();
    const staleResult = scheduler.schedule({
      episodeId: "episode-1",
      messageId: "prepared-stale",
      task: async () => stale.promise,
    });
    const currentResult = scheduler.schedule({
      episodeId: "episode-2",
      messageId: "prepared-current",
      task: async () => current.promise,
    });

    scheduler.invalidateMessage("episode-1", "prepared-stale");
    stale.resolve("stale-audio");
    current.resolve("current-audio");
    assert.equal(await staleResult, null);
    assert.equal(await currentResult, "current-audio");
  });
});
