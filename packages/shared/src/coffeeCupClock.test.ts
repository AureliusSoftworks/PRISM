import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COFFEE_CUP_BASE_LIFETIME_MS,
  COFFEE_CUP_MAX_LIFETIME_MS,
  COFFEE_CUP_MIN_LIFETIME_MS,
  coffeeCupDryForMsV1,
  coffeeCupEmptyAtMsV1,
  coffeeCupIsDryV1,
  coffeeCupLifetimeMsV1,
  coffeeCupPourCadenceMsV1,
  coffeeCupProgressFromElapsedV1,
} from "./coffeeCupClock.ts";

/**
 * The span `coffeeCupConsumptionRate` actually produces — `1.12 + bias * 0.58`
 * scaled by a per-seed tempo. Sampled directly rather than imported, because
 * the barrel re-exports with `.js` specifiers that do not resolve from source,
 * and because the module deliberately takes the rate as a parameter.
 */
const REAL_SEAT_RATES = [0.95, 1.12, 1.35, 1.6, 1.9] as const;

function seatLifetimes(count: number): number[] {
  return REAL_SEAT_RATES.slice(0, count).map((consumptionRate) =>
    coffeeCupLifetimeMsV1({ consumptionRate }),
  );
}

describe("Coffee cup clock", () => {
  it("drains against elapsed time rather than a session countdown", () => {
    const lifetimeMs = 10 * 60_000;
    assert.equal(coffeeCupProgressFromElapsedV1({ elapsedMs: 0, lifetimeMs }), 0);
    assert.equal(
      coffeeCupProgressFromElapsedV1({ elapsedMs: 5 * 60_000, lifetimeMs }),
      0.5,
    );
    assert.equal(
      coffeeCupProgressFromElapsedV1({ elapsedMs: 10 * 60_000, lifetimeMs }),
      1,
    );
    // Past empty stays empty rather than running negative-full.
    assert.equal(
      coffeeCupProgressFromElapsedV1({ elapsedMs: 90 * 60_000, lifetimeMs }),
      1,
    );
  });

  it("gives a faster drinker a shorter cup, not a steeper curve", () => {
    const quick = coffeeCupLifetimeMsV1({ consumptionRate: 1.8 });
    const slow = coffeeCupLifetimeMsV1({ consumptionRate: 1.0 });
    assert.equal(quick < slow, true, "a faster rate did not shorten the cup");
    // The answer is a duration, so "when is this bot dry" has a timestamp.
    const filledAtMs = 1_760_000_000_000;
    assert.equal(
      coffeeCupEmptyAtMsV1({ filledAtMs, lifetimeMs: quick }),
      filledAtMs + quick,
    );
  });

  it("floors a cup so an unlucky seed cannot dissolve a table early", () => {
    // Well past any real consumption rate, and still floored.
    const frantic = coffeeCupLifetimeMsV1({ consumptionRate: 99 });
    assert.equal(frantic, COFFEE_CUP_MIN_LIFETIME_MS);
    const nursing = coffeeCupLifetimeMsV1({ consumptionRate: 0.01 });
    assert.equal(nursing, COFFEE_CUP_MAX_LIFETIME_MS);

    for (const lifetime of seatLifetimes(5)) {
      assert.equal(
        lifetime >= COFFEE_CUP_MIN_LIFETIME_MS &&
          lifetime <= COFFEE_CUP_MAX_LIFETIME_MS,
        true,
        `a real seat produced a ${Math.round(lifetime / 1000)}s cup`,
      );
    }
  });

  it("applies a power modifier on top of the drinker's own pace", () => {
    const plain = coffeeCupLifetimeMsV1({ consumptionRate: 1.2 });
    const nurses = coffeeCupLifetimeMsV1({
      consumptionRate: 1.2,
      powerRateMultiplier: 0.5,
    });
    assert.equal(nurses > plain, true, "a nursing modifier did not extend the cup");
  });

  it("staggers a real table instead of emptying it all at once", () => {
    const lifetimes = seatLifetimes(5);
    const spreadMs = Math.max(...lifetimes) - Math.min(...lifetimes);
    assert.equal(
      spreadMs >= 60_000,
      true,
      `five seats emptied within ${Math.round(spreadMs / 1000)}s of each other`,
    );
  });

  it("keeps the Serve pour cadence in hospitality range, not whack-a-mole", () => {
    const cadenceMs = coffeeCupPourCadenceMsV1(seatLifetimes(5));
    assert.notEqual(cadenceMs, null);
    // The design target: a pour roughly every 60-90s across a five-bot table.
    // Tighter than this and tending the table stops feeling like hosting.
    assert.equal(
      cadenceMs! >= 60_000 && cadenceMs! <= 90_000,
      true,
      `a five-bot table asks for a pour every ${Math.round(cadenceMs! / 1000)}s`,
    );
    assert.equal(coffeeCupPourCadenceMsV1([]), null);
  });

  it("reports how long a bot has been dry, for leave pressure to read", () => {
    const emptyAtMs = 1_760_000_000_000;
    assert.equal(coffeeCupDryForMsV1({ emptyAtMs, nowMs: emptyAtMs - 5_000 }), 0);
    assert.equal(
      coffeeCupDryForMsV1({ emptyAtMs, nowMs: emptyAtMs + 90_000 }),
      90_000,
    );
    assert.equal(coffeeCupIsDryV1(0.99), false);
    assert.equal(coffeeCupIsDryV1(1), true);
  });

  it("treats a nonsense lifetime as an empty cup rather than a full one", () => {
    assert.equal(
      coffeeCupProgressFromElapsedV1({ elapsedMs: 0, lifetimeMs: 0 }),
      1,
    );
    assert.equal(
      coffeeCupProgressFromElapsedV1({
        elapsedMs: Number.NaN,
        lifetimeMs: COFFEE_CUP_BASE_LIFETIME_MS,
      }),
      0,
    );
  });
});
