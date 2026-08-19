import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import {
  MAX_CENSUS_SAMPLES_PER_BATCH,
  listAppletMainThreadCensusSamples,
  readAppletMainThreadCensusSample,
  recordAppletMainThreadCensusSamples,
  summarizeAppletMainThreadCensus,
} from "../applet-main-thread-census-samples.ts";
import { initializeDatabase } from "../db.ts";

function fixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'census@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  return db;
}

function sample(
  elapsedMs: number,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    elapsedMs,
    capturedAt: new Date(1_760_000_000_000 + elapsedMs).toISOString(),
    fps: 60,
    rafPending: 1,
    intervalsLive: 2,
    timeoutsPending: 3,
    domElements: 1_000,
    animationsRunning: 4,
    heapMb: 12.5,
    renderRates: [{ name: "home", perSecond: 5 }],
    ...overrides,
  };
}

describe("Applet main-thread census samples", () => {
  it("round-trips a session's series in elapsed order", () => {
    const db = fixture();
    try {
      const parsed = [sample(30_000), sample(0), sample(15_000)]
        .map(readAppletMainThreadCensusSample)
        .filter((entry) => entry !== null);
      assert.equal(parsed.length, 3);
      assert.equal(
        recordAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1", parsed),
        3,
      );

      const stored = listAppletMainThreadCensusSamples(
        db,
        "user-1",
        "coffee",
        "s-1",
      );
      assert.deepEqual(
        stored.map((entry) => entry.elapsedMs),
        [0, 15_000, 30_000],
      );
      assert.deepEqual(stored[0]?.renderRates, [{ name: "home", perSecond: 5 }]);
      assert.equal(stored[0]?.heapMb, 12.5);
    } finally {
      db.close();
    }
  });

  it("keeps one session's series out of another's", () => {
    const db = fixture();
    try {
      const one = readAppletMainThreadCensusSample(sample(0));
      assert.ok(one);
      recordAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1", [one]);
      recordAppletMainThreadCensusSamples(db, "user-1", "signal", "s-1", [one]);
      assert.equal(
        listAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-2").length,
        0,
      );
      assert.equal(
        listAppletMainThreadCensusSamples(db, "user-1", "signal", "s-1").length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("ignores a resent sample rather than duplicating the reading", () => {
    const db = fixture();
    try {
      const one = readAppletMainThreadCensusSample(sample(5_000));
      assert.ok(one);
      recordAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1", [one]);
      recordAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1", [one]);
      assert.equal(
        listAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1").length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("rejects a sample with no usable elapsed reading", () => {
    assert.equal(readAppletMainThreadCensusSample(null), null);
    assert.equal(readAppletMainThreadCensusSample({ elapsedMs: -1 }), null);
    assert.equal(readAppletMainThreadCensusSample({ fps: 60 }), null);
    const missingOptionals = readAppletMainThreadCensusSample({ elapsedMs: 0 });
    assert.equal(missingOptionals?.fps, null);
    assert.equal(missingOptionals?.rafPending, 0);
    assert.deepEqual(missingOptionals?.renderRates, []);
  });

  it("caps a flooded batch", () => {
    const db = fixture();
    try {
      const flood = Array.from(
        { length: MAX_CENSUS_SAMPLES_PER_BATCH + 50 },
        (_unused, index) => readAppletMainThreadCensusSample(sample(index)),
      ).filter((entry) => entry !== null);
      assert.equal(
        recordAppletMainThreadCensusSamples(db, "user-1", "coffee", "s-1", flood),
        MAX_CENSUS_SAMPLES_PER_BATCH,
      );
    } finally {
      db.close();
    }
  });

  it("summarizes a leak as growth that never recovers", () => {
    const parsed = [
      sample(0, { fps: 60, rafPending: 1, animationsRunning: 4 }),
      sample(60_000, { fps: 22, rafPending: 40, animationsRunning: 120 }),
      sample(120_000, { fps: 6, rafPending: 91, animationsRunning: 260 }),
    ]
      .map(readAppletMainThreadCensusSample)
      .filter((entry) => entry !== null);

    const summary = summarizeAppletMainThreadCensus(parsed);
    assert.ok(summary);
    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.spanMs, 120_000);
    assert.equal(summary.fpsFirst, 60);
    assert.equal(summary.fpsLast, 6);
    assert.equal(summary.fpsMin, 6);
    const raf = summary.growth.find((entry) => entry.name === "rafPending");
    assert.deepEqual(raf, { name: "rafPending", first: 1, last: 91, peak: 91 });
    assert.equal(summarizeAppletMainThreadCensus([]), null);
  });
});
