"use client";

import { useEffect } from "react";

import { PrismDomAdaptiveQualityController } from "./prismDomAdaptiveQuality";
import { publishPrismFrameRate } from "./prismFrameRate";
import { nudgePrismRenderThrottleRecovery } from "./replayAudioMasterCapture";

/** Gaps beyond this are machine suspensions (sleep, debugger, tab thaw), not
 * slow frames; they reset the window instead of polluting the average. */
const PRISM_FRAME_RATE_SUSPENSION_GAP_MS = 10_000;

export function PrismAdaptiveDomQualityGovernor(): null {
  useEffect(() => {
    const controller = new PrismDomAdaptiveQualityController(performance.now());
    let frameId = 0;
    let previousFrameTime = performance.now();
    let fpsWindowStartedAt = previousFrameTime;
    let fpsWindowFrameCount = 0;
    // Long-task accounting rides along with each published FPS window so a
    // degraded session records WHY frames are missing (main-thread busy time),
    // not just that they are. Sessions 09fc81db/6d6f1239 hit 1 FPS with no
    // way to tell render cost from timer starvation after the fact.
    let longTaskMsInWindow = 0;
    let longTaskObserver: PerformanceObserver | null = null;
    // Ask the registry, never a try/catch: `observe()` does NOT throw on an
    // unsupported entry type — the Performance Timeline spec says to abort
    // with a console warning — so catching could never detect WebKit's
    // missing longtask API. The observer stayed non-null there, the lag
    // fallback below was unreachable, and the meter printed `busy 0ms/s` in
    // every desktop session no matter the load (reviews f1e340d8, 60ac2faf).
    const supportsLongTask =
      typeof PerformanceObserver !== "undefined" &&
      (PerformanceObserver.supportedEntryTypes ?? []).includes("longtask");
    if (supportsLongTask) {
      try {
        longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTaskMsInWindow += entry.duration;
          }
        });
        longTaskObserver.observe({ type: "longtask", buffered: false });
      } catch {
        longTaskObserver = null;
      }
    }
    // WebKit (the desktop app's webview) has no longtask API, so fall back to
    // event-loop lag: a timer that fires late by N ms proves the main thread
    // was busy for N ms. Crucially this also separates the two failure modes —
    // low FPS with near-zero busy means the compositor/GPU is the bottleneck,
    // not scripting.
    const LAG_PROBE_INTERVAL_MS = 125;
    let loopLagMsInWindow = 0;
    let lastLagProbeAtMs = performance.now();
    const lagProbeId = window.setInterval(() => {
      const now = performance.now();
      const overageMs = now - lastLagProbeAtMs - LAG_PROBE_INTERVAL_MS;
      lastLagProbeAtMs = now;
      if (overageMs > 8) loopLagMsInWindow += overageMs;
    }, LAG_PROBE_INTERVAL_MS);

    const tick = (nowMs: number): void => {
      const deltaMs = Math.max(0, nowMs - previousFrameTime);
      const foreground = document.visibilityState === "visible";
      controller.recordFrame({
        nowMs,
        deltaMs,
        foreground,
      });
      previousFrameTime = nowMs;
      // Long frames are real frames: a 300ms main-thread stall is exactly the
      // signal this meter exists to report, so it counts with its full
      // duration. Discarding slow frames (and publishing single-frame instant
      // rates on resume) made a 3 FPS room read as 33 — and once as 240 —
      // which also kept the FPS-gated load sheds from ever engaging.
      if (foreground && deltaMs > 0 && deltaMs <= PRISM_FRAME_RATE_SUSPENSION_GAP_MS) {
        fpsWindowFrameCount += 1;
        const elapsedMs = nowMs - fpsWindowStartedAt;
        if (elapsedMs >= 200) {
          const windowFps = (fpsWindowFrameCount * 1_000) / elapsedMs;
          const busyMsPerSecond = longTaskObserver
            ? (longTaskMsInWindow * 1_000) / elapsedMs
            : (loopLagMsInWindow * 1_000) / elapsedMs;
          publishPrismFrameRate(
            windowFps,
            new Date().toISOString(),
            busyMsPerSecond,
          );
          // Visible + starved frames + idle main thread = WebKit render
          // throttling that failed to lift (App Nap / occlusion). Audio is
          // the documented exemption, so nudge with an inaudible tone.
          if (windowFps < 2.5 && busyMsPerSecond < 150) {
            nudgePrismRenderThrottleRecovery();
          }
          fpsWindowStartedAt = nowMs;
          fpsWindowFrameCount = 0;
          longTaskMsInWindow = 0;
          loopLagMsInWindow = 0;
        }
      } else {
        fpsWindowStartedAt = nowMs;
        fpsWindowFrameCount = 0;
        longTaskMsInWindow = 0;
        loopLagMsInWindow = 0;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      longTaskObserver?.disconnect();
      window.clearInterval(lagProbeId);
    };
  }, []);

  return null;
}
