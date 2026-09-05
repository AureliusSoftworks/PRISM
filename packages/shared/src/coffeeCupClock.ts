/**
 * The coffee cup as the session clock.
 *
 * Coffee's cup used to be a readout of a hidden timer: progress was
 * `1 - remaining / duration`, so the visible object on the table only ever
 * described `coffee_duration_minutes`. This inverts that. A cup drains against
 * the wall clock at its drinker's own pace, and the session lasts as long as
 * there is coffee — which is what makes "everyone's cup ran dry and nobody
 * refilled" an ending a table can actually reach.
 *
 * Everything here is a pure function of stored facts plus `now`, deliberately:
 * the server must be able to answer "how full is this cup" at any instant with
 * no client in the loop. That single property is what lets a session survive
 * the player switching applets, closing the lane, or force-quitting entirely.
 *
 * The per-bot rate is passed in rather than computed here, so this module stays
 * free of session-duration concepts. Callers pass
 * `coffeeCupConsumptionRate(seed, null)` from the shared barrel.
 */

/**
 * A full cup for an average drinker, before per-bot pace is applied.
 *
 * Tuned to the Serve pour cadence rather than picked for roundness: across the
 * real spread of consumption rates, eight minutes puts a five-bot table at a
 * pour roughly every 74s, in the middle of the 60-90s hospitality target.
 * `coffeeCupPourCadenceMsV1` and its test hold that honest.
 */
export const COFFEE_CUP_BASE_LIFETIME_MS = 8 * 60_000;

/**
 * No cup empties faster than this. Pace varies by nearly 2x between the
 * fastest and slowest drinker, and without a floor an unlucky seed could dry a
 * table out before the conversation has found its feet.
 */
export const COFFEE_CUP_MIN_LIFETIME_MS = 4 * 60_000;

/** Nor slower than this, so one nurser cannot hold a table open forever. */
export const COFFEE_CUP_MAX_LIFETIME_MS = 18 * 60_000;

/** Progress runs 0 (full) to 1 (dry), matching the existing cup helpers. */
function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * How long this bot's full cup lasts.
 *
 * A faster drinker gets a shorter cup rather than a steeper curve, so the
 * question "when is this bot dry?" has a timestamp answer — which is what a
 * clock has to provide.
 */
export function coffeeCupLifetimeMsV1(args: {
  /** `coffeeCupConsumptionRate(seed, null)`; higher drinks faster. */
  consumptionRate: number;
  /** Power modifier, e.g. a bot that nurses a cup. 1 is unmodified. */
  powerRateMultiplier?: number | null;
  baseLifetimeMs?: number | null;
}): number {
  const rate = Math.max(0.05, finiteOr(args.consumptionRate, 1));
  const multiplier = Math.max(
    0.05,
    Math.min(3, finiteOr(args.powerRateMultiplier, 1)),
  );
  const base = Math.max(1, finiteOr(args.baseLifetimeMs, COFFEE_CUP_BASE_LIFETIME_MS));
  return Math.round(
    Math.max(
      COFFEE_CUP_MIN_LIFETIME_MS,
      Math.min(COFFEE_CUP_MAX_LIFETIME_MS, base / (rate * multiplier)),
    ),
  );
}

/** Where a cup sits after `elapsedMs` of its `lifetimeMs`. */
export function coffeeCupProgressFromElapsedV1(args: {
  elapsedMs: number;
  lifetimeMs: number;
}): number {
  const lifetimeMs = finiteOr(args.lifetimeMs, 0);
  if (lifetimeMs <= 0) return 1;
  return clampProgress(Math.max(0, finiteOr(args.elapsedMs, 0)) / lifetimeMs);
}

/**
 * The moment this cup runs dry, as a timestamp. Top-offs move it later, which
 * is the whole of Serve: the player buys the table more time by pouring.
 */
export function coffeeCupEmptyAtMsV1(args: {
  filledAtMs: number;
  lifetimeMs: number;
}): number {
  return (
    finiteOr(args.filledAtMs, 0) + Math.max(0, finiteOr(args.lifetimeMs, 0))
  );
}

/** True once there is nothing left to drink. */
export function coffeeCupIsDryV1(progress: number): boolean {
  return clampProgress(progress) >= 1;
}

/**
 * How long a bot has been dry, which is what escalating leave pressure reads.
 * Zero while there is still coffee.
 */
export function coffeeCupDryForMsV1(args: {
  emptyAtMs: number;
  nowMs: number;
}): number {
  return Math.max(0, finiteOr(args.nowMs, 0) - finiteOr(args.emptyAtMs, 0));
}

/**
 * Average seconds between pours a Serve player faces to hold a table open.
 *
 * Serve's whole loop is pouring, so this is a design constraint rather than an
 * emergent accident: too short and hospitality becomes whack-a-mole. Exposed so
 * a test can hold the tuning to its target instead of trusting the constants to
 * stay honest on their own.
 */
export function coffeeCupPourCadenceMsV1(
  lifetimesMs: readonly number[],
): number | null {
  const usable = lifetimesMs.filter(
    (lifetime) => Number.isFinite(lifetime) && lifetime > 0,
  );
  if (usable.length === 0) return null;
  // Each cup needs one pour per lifetime, so pours arrive at the sum of the
  // individual rates: the table's mean lifetime divided by the number of cups.
  const meanLifetimeMs =
    usable.reduce((total, lifetime) => total + lifetime, 0) / usable.length;
  return Math.round(meanLifetimeMs / usable.length);
}
