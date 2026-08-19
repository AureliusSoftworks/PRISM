/**
 * A running count of the things that can accumulate until the main thread
 * cannot keep up.
 *
 * The FPS badge already answers *whether* frames are missing and `busy ms/s`
 * answers *whether the main thread or the compositor* is at fault. Neither
 * answers **what is piling up**, and Coffee's lag has the signature of a pile:
 * session c2f6eff5 fell 60 → 1 FPS over roughly six minutes and stayed at 1
 * through a two-and-a-half-minute lull with nothing revealing and nobody
 * speaking. Per-frame render cost recovers when the work stops. This does not,
 * so something is being created and never released.
 *
 * Rather than keep guessing at which of them it is across a 149k-line
 * component, count the candidates directly and put them on the badge:
 *
 * - `raf`  — animation-frame callbacks scheduled but not yet fired. A
 *   self-rescheduling loop keeps exactly one outstanding, so this is the count
 *   of *concurrently running loops*. If it climbs with session length, loops
 *   are leaking and that is the whole answer.
 * - `int`  — live intervals. Same reasoning, without the self-reschedule.
 * - `tmo`  — outstanding timeouts. Noisy by nature; a monotonic climb is still
 *   meaningful.
 * - `dom`  — element count. Distinguishes "we keep adding nodes" from "we keep
 *   adding work to the same nodes".
 * - `anim` — running CSS animations (`document.getAnimations()`). Animated
 *   elements cost style recalculation on the main thread every frame whether or
 *   not the compositor does the drawing, so a growing count here explains
 *   high `busy` with no JS loop growth.
 * - `heap` — `performance.memory` where the engine offers it (Chromium only).
 *
 * The counters come from transparent wrappers installed once. They forward
 * every argument and return value untouched; the only work added per call is
 * an integer increment.
 */

export interface PrismMainThreadCensus {
  /** Animation-frame callbacks scheduled and not yet fired. */
  rafPending: number;
  /** Intervals created and not yet cleared. */
  intervalsLive: number;
  /** Timeouts scheduled and not yet fired or cleared. */
  timeoutsPending: number;
  /** `document.getElementsByTagName("*").length`, or null before mount. */
  domElements: number | null;
  /** Running animations/transitions, or null where unsupported. */
  animationsRunning: number | null;
  /** Used JS heap in MB, or null where unsupported. */
  heapMb: number | null;
}

let rafPending = 0;
let intervalsLive = 0;
let timeoutsPending = 0;
let installed = false;

/**
 * Wrap the schedulers so the counts are exact rather than sampled. Idempotent,
 * and a no-op outside the browser.
 */
export function installPrismMainThreadCensus(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const nativeRaf = window.requestAnimationFrame?.bind(window);
  const nativeCancelRaf = window.cancelAnimationFrame?.bind(window);
  if (nativeRaf && nativeCancelRaf) {
    // A pending id must only be counted down once, whether it fired or was
    // cancelled, so track which ids are still outstanding rather than
    // decrementing blind.
    const pendingRafIds = new Set<number>();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nativeRaf((time) => {
        if (pendingRafIds.delete(id)) rafPending -= 1;
        callback(time);
      });
      pendingRafIds.add(id);
      rafPending += 1;
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      if (pendingRafIds.delete(id)) rafPending -= 1;
      nativeCancelRaf(id);
    };
  }

  const nativeSetInterval = window.setInterval;
  const nativeClearInterval = window.clearInterval;
  const liveIntervalIds = new Set<unknown>();
  window.setInterval = ((...args: unknown[]) => {
    const id = (nativeSetInterval as (...a: unknown[]) => unknown).apply(
      window,
      args,
    );
    liveIntervalIds.add(id);
    intervalsLive += 1;
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = ((id?: unknown) => {
    if (liveIntervalIds.delete(id)) intervalsLive -= 1;
    (nativeClearInterval as (...a: unknown[]) => void).call(window, id);
  }) as typeof window.clearInterval;

  const nativeSetTimeout = window.setTimeout;
  const nativeClearTimeout = window.clearTimeout;
  const pendingTimeoutIds = new Set<unknown>();
  window.setTimeout = ((handler: unknown, timeout?: unknown, ...rest: unknown[]) => {
    let id: unknown;
    const wrapped =
      typeof handler === "function"
        ? (...callbackArgs: unknown[]) => {
            if (pendingTimeoutIds.delete(id)) timeoutsPending -= 1;
            return (handler as (...a: unknown[]) => unknown)(...callbackArgs);
          }
        : handler;
    id = (nativeSetTimeout as (...a: unknown[]) => unknown).apply(window, [
      wrapped,
      timeout,
      ...rest,
    ]);
    pendingTimeoutIds.add(id);
    timeoutsPending += 1;
    return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: unknown) => {
    if (pendingTimeoutIds.delete(id)) timeoutsPending -= 1;
    (nativeClearTimeout as (...a: unknown[]) => void).call(window, id);
  }) as typeof window.clearTimeout;
}

function readHeapMb(): number | null {
  if (typeof performance === "undefined") return null;
  const memory = (
    performance as Performance & { memory?: { usedJSHeapSize?: number } }
  ).memory;
  const used = memory?.usedJSHeapSize;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  return Math.round(used / 1_048_576);
}

function readRunningAnimations(): number | null {
  if (typeof document === "undefined") return null;
  const getAnimations = (
    document as Document & { getAnimations?: () => readonly Animation[] }
  ).getAnimations;
  if (typeof getAnimations !== "function") return null;
  try {
    return getAnimations
      .call(document)
      .filter((animation) => animation.playState === "running").length;
  } catch {
    return null;
  }
}

export function prismMainThreadCensus(): PrismMainThreadCensus {
  return {
    rafPending,
    intervalsLive,
    timeoutsPending,
    domElements:
      typeof document === "undefined"
        ? null
        : document.getElementsByTagName("*").length,
    animationsRunning: readRunningAnimations(),
    heapMb: readHeapMb(),
  };
}

/**
 * Badge-sized rendering. Deliberately terse — it sits after `busy Nms/s` on one
 * line, and the reader is watching it climb, not reading it once.
 */
export function formatPrismMainThreadCensus(
  census: PrismMainThreadCensus,
): string {
  const parts = [
    `raf ${census.rafPending}`,
    `int ${census.intervalsLive}`,
    `tmo ${census.timeoutsPending}`,
  ];
  if (census.domElements !== null) {
    parts.push(
      census.domElements >= 1000
        ? `dom ${(census.domElements / 1000).toFixed(1)}k`
        : `dom ${census.domElements}`,
    );
  }
  if (census.animationsRunning !== null) {
    parts.push(`anim ${census.animationsRunning}`);
  }
  if (census.heapMb !== null) parts.push(`heap ${census.heapMb}MB`);
  return parts.join(" · ");
}

export function resetPrismMainThreadCensusCountersForTests(): void {
  rafPending = 0;
  intervalsLive = 0;
  timeoutsPending = 0;
  // Also clear the install latch so a test can wrap a fresh fake window. In the
  // app this is never called and the wrappers are installed exactly once.
  installed = false;
}
