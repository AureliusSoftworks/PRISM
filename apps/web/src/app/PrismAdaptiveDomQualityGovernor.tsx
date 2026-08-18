"use client";

import { useEffect } from "react";

import { PrismDomAdaptiveQualityController } from "./prismDomAdaptiveQuality";
import { publishPrismFrameRate } from "./prismFrameRate";

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
          publishPrismFrameRate((fpsWindowFrameCount * 1_000) / elapsedMs);
          fpsWindowStartedAt = nowMs;
          fpsWindowFrameCount = 0;
        }
      } else {
        fpsWindowStartedAt = nowMs;
        fpsWindowFrameCount = 0;
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return null;
}
