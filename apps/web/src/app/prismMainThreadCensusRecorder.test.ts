import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_CENSUS_SAMPLE_INTERVAL_MS,
  PrismCensusRecorder,
  type PrismCensusReading,
} from "./prismMainThreadCensusRecorder.ts";

function harness(
  options: {
    post?: (batch: { samples: PrismCensusReading[] }) => Promise<unknown>;
    flushEvery?: number;
  } = {},
) {
  const batches: PrismCensusReading[][] = [];
  let nowMs = 1_000_000;
  let rafPending = 1;
  const recorder = new PrismCensusRecorder({
    surface: "coffee",
    sessionId: "s-1",
    startedAtMs: nowMs,
    now: () => nowMs,
    readCensus: () => ({
      rafPending,
      intervalsLive: 2,
      timeoutsPending: 3,
      domElements: 1_200,
      animationsRunning: 7,
      heapMb: 40,
      renderRates: [{ name: "home", perSecond: 12 }],
    }),
    readFrameRate: () => ({ fps: 60, busyMsPerSecond: 120 }),
    flushEvery: options.flushEvery ?? 3,
    post: options.post
      ? options.post
      : async (batch) => {
          batches.push(batch.samples);
        },
  });
  return {
    recorder,
    batches,
    advance(ms = PRISM_CENSUS_SAMPLE_INTERVAL_MS) {
      nowMs += ms;
    },
    leak() {
      rafPending += 25;
    },
  };
}

describe("Prism census recorder", () => {
  it("batches readings instead of posting one request each", async () => {
    const { recorder, batches, advance } = harness({ flushEvery: 3 });
    recorder.sample();
    advance();
    recorder.sample();
    assert.equal(batches.length, 0, "posted before the batch was full");

    advance();
    recorder.sample();
    await recorder.flush();
    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.length, 3);
  });

  it("measures elapsed time from the session, not the clock", async () => {
    const { recorder, batches, advance } = harness();
    recorder.sample();
    advance(30_000);
    recorder.sample();
    await recorder.flush();
    assert.deepEqual(
      batches[0]?.map((sample) => sample.elapsedMs),
      [0, 30_000],
    );
  });

  it("carries a growing counter through to the batch", async () => {
    const { recorder, batches, advance, leak } = harness();
    recorder.sample();
    advance();
    leak();
    recorder.sample();
    await recorder.flush();
    assert.deepEqual(
      batches[0]?.map((sample) => sample.rafPending),
      [1, 26],
    );
    assert.equal(batches[0]?.[0]?.busyMsPerSecond, 120);
    assert.deepEqual(batches[0]?.[0]?.renderRates, [
      { name: "home", perSecond: 12 },
    ]);
  });

  it("keeps readings when a flush fails rather than losing the session", async () => {
    let failing = true;
    const delivered: PrismCensusReading[][] = [];
    const { recorder, advance } = harness({
      flushEvery: 2,
      post: async (batch) => {
        if (failing) throw new Error("offline");
        delivered.push(batch.samples);
      },
    });
    recorder.sample();
    advance();
    recorder.sample();
    await recorder.flush();
    assert.equal(delivered.length, 0);
    assert.equal(recorder.bufferedCount, 2, "a failed flush dropped readings");

    failing = false;
    await recorder.flush();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.length, 2);
    assert.equal(recorder.bufferedCount, 0);
  });

  it("flushes what is left when the session ends and then goes quiet", async () => {
    const { recorder, batches, advance } = harness({ flushEvery: 10 });
    recorder.sample();
    advance();
    recorder.sample();
    await recorder.stop();
    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.length, 2);

    recorder.sample();
    await recorder.flush();
    assert.equal(batches.length, 1, "kept sampling after the session ended");
  });
});
