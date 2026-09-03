"use client";

import { useEffect } from "react";

import { PrismDomAdaptiveQualityController } from "./prismDomAdaptiveQuality";
import { PrismFrameGapSampler, prismSlowFrameBreakdown, publishPrismFrameRate, type PrismSlowFrame } from "./prismFrameRate";
import { nudgePrismRenderThrottleRecovery } from "./replayAudioMasterCapture";

/** Gaps beyond this are machine suspensions (sleep, debugger, tab thaw), not
 * slow frames; they reset the window instead of polluting the average. */
const PRISM_FRAME_RATE_SUSPENSION_GAP_MS = 10_000;

export function PrismAdaptiveDomQualityGovernor(): null {
  useEffect(() => {
    const controller = new PrismDomAdaptiveQualityController(performance.now());
    const qualityTarget = document.documentElement;
    const applyRuntimeQuality = (): void => {
      qualityTarget.dataset.prismRuntimeQuality = controller.currentQuality();
    };
    applyRuntimeQuality();
    let frameId = 0;
    let previousFrameTime = performance.now();
    let fpsWindowStartedAt = previousFrameTime;
    let fpsWindowFrameCount = 0;
    const frameGapSampler = new PrismFrameGapSampler();
    let visibleSinceMs = previousFrameTime;
    const slowFrames: { atMs: number; frame: PrismSlowFrame }[] = [];
    let slowFrameObserver: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== "undefined" &&
      (PerformanceObserver.supportedEntryTypes ?? []).includes("long-animation-frame")) {
      try {
        slowFrameObserver = new PerformanceObserver((list) => {
          if (document.visibilityState !== "visible") return;
          for (const entry of list.getEntries()) {
            if (entry.startTime < visibleSinceMs || entry.duration > PRISM_FRAME_RATE_SUSPENSION_GAP_MS) continue;
            slowFrames.push({ atMs: entry.startTime + entry.duration, frame: prismSlowFrameBreakdown(entry) });
          }
          slowFrames.splice(0, Math.max(0, slowFrames.length - 8));
        });
        slowFrameObserver.observe({ type: "long-animation-frame", buffered: false });
      } catch {
        slowFrameObserver?.disconnect();
        slowFrameObserver = null;
      }
    }
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

    // Measure the delay from real user input to the next paint. Live Coffee
    // and Signal already start at the minimum cosmetic workload; this catches
    // unexpected pressure elsewhere without doing React work in the handler.
    let inputPaintFrameId = 0;
    let earliestPendingInputAtMs: number | null = null;
    const noteUserInput = (event: Event): void => {
      const nowMs = performance.now();
      const eventTimeMs =
        Number.isFinite(event.timeStamp) &&
        event.timeStamp > 0 &&
        Math.abs(nowMs - event.timeStamp) < 60_000
          ? event.timeStamp
          : nowMs;
      earliestPendingInputAtMs = Math.min(
        earliestPendingInputAtMs ?? eventTimeMs,
        eventTimeMs,
      );
      if (inputPaintFrameId !== 0) return;
      inputPaintFrameId = window.requestAnimationFrame((paintedAtMs) => {
        inputPaintFrameId = 0;
        const startedAtMs = earliestPendingInputAtMs;
        earliestPendingInputAtMs = null;
        if (startedAtMs === null) return;
        const result = controller.recordInteractionDelay(
          Math.max(0, paintedAtMs - startedAtMs),
        );
        if (result.qualityChanged) applyRuntimeQuality();
      });
    };
    window.addEventListener("pointerdown", noteUserInput, true);
    window.addEventListener("keydown", noteUserInput, true);
    window.addEventListener("beforeinput", noteUserInput, true);

    // rAF can stop entirely while hidden. Reset on the transition itself,
    // otherwise a short background interval looks like a visible stall.
    const resetVisibleClock = (): void => {
      const nowMs = performance.now();
      visibleSinceMs = nowMs;
      controller.noteDiscontinuity(nowMs);
      previousFrameTime = nowMs;
      fpsWindowStartedAt = nowMs;
      fpsWindowFrameCount = 0;
      longTaskMsInWindow = 0;
      loopLagMsInWindow = 0;
      lastLagProbeAtMs = nowMs;
      frameGapSampler.reset();
      slowFrames.length = 0;
      slowFrameObserver?.takeRecords();
      longTaskObserver?.takeRecords();
      earliestPendingInputAtMs = null;
      if (inputPaintFrameId !== 0) {
        window.cancelAnimationFrame(inputPaintFrameId);
        inputPaintFrameId = 0;
      }
    };
    document.addEventListener("visibilitychange", resetVisibleClock);

    const tick = (nowMs: number): void => {
      const deltaMs = Math.max(0, nowMs - previousFrameTime);
      const foreground = document.visibilityState === "visible";
      const qualityResult = controller.recordFrame({
        nowMs,
        deltaMs,
        foreground,
      });
      if (qualityResult.qualityChanged) applyRuntimeQuality();
      previousFrameTime = nowMs;
      // Long frames are real frames: a 300ms main-thread stall is exactly the
      // signal this meter exists to report, so it counts with its full
      // duration. Discarding slow frames (and publishing single-frame instant
      // rates on resume) made a 3 FPS room read as 33 — and once as 240 —
      // which also kept the FPS-gated load sheds from ever engaging.
      if (foreground && deltaMs > 0 && deltaMs <= PRISM_FRAME_RATE_SUSPENSION_GAP_MS) {
        fpsWindowFrameCount += 1;
        frameGapSampler.record(nowMs, deltaMs);
        const elapsedMs = nowMs - fpsWindowStartedAt;
        if (elapsedMs >= 200) {
          while (slowFrames[0] && slowFrames[0].atMs < nowMs - 5_000) slowFrames.shift();
          const windowFps = (fpsWindowFrameCount * 1_000) / elapsedMs;
          const busyMsPerSecond = longTaskObserver
            ? (longTaskMsInWindow * 1_000) / elapsedMs
            : (loopLagMsInWindow * 1_000) / elapsedMs;
          publishPrismFrameRate(
            windowFps,
            new Date().toISOString(),
            busyMsPerSecond,
            frameGapSampler.snapshot(nowMs),
            slowFrameObserver ? slowFrames.map(({ frame }) => frame) : undefined,
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
        frameGapSampler.reset();
        slowFrames.length = 0;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (inputPaintFrameId !== 0) {
        window.cancelAnimationFrame(inputPaintFrameId);
      }
      longTaskObserver?.disconnect();
      slowFrameObserver?.disconnect();
      window.clearInterval(lagProbeId);
      window.removeEventListener("pointerdown", noteUserInput, true);
      window.removeEventListener("keydown", noteUserInput, true);
      window.removeEventListener("beforeinput", noteUserInput, true);
      document.removeEventListener("visibilitychange", resetVisibleClock);
      delete qualityTarget.dataset.prismRuntimeQuality;
    };
  }, []);

  return null;
}
