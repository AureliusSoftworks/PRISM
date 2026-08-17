"use client";

import { useEffect } from "react";

import { PrismDomAdaptiveQualityController } from "./prismDomAdaptiveQuality";
import { publishPrismFrameRate } from "./prismFrameRate";

export function PrismAdaptiveDomQualityGovernor(): null {
  useEffect(() => {
    const controller = new PrismDomAdaptiveQualityController(performance.now());
    let frameId = 0;
    let previousFrameTime = performance.now();
    let fpsWindowStartedAt = previousFrameTime;
    let fpsWindowFrameCount = 0;
    let hasPublishedFps = false;

    const tick = (nowMs: number): void => {
      const deltaMs = Math.max(0, nowMs - previousFrameTime);
      const foreground = document.visibilityState === "visible";
      controller.recordFrame({
        nowMs,
        deltaMs,
        foreground,
      });
      previousFrameTime = nowMs;
      if (foreground && deltaMs > 0 && deltaMs <= 250) {
        fpsWindowFrameCount += 1;
        const elapsedMs = nowMs - fpsWindowStartedAt;
        if (!hasPublishedFps) {
          publishPrismFrameRate(1_000 / deltaMs);
          hasPublishedFps = true;
        } else if (elapsedMs >= 200) {
          publishPrismFrameRate((fpsWindowFrameCount * 1_000) / elapsedMs);
          fpsWindowStartedAt = nowMs;
          fpsWindowFrameCount = 0;
        }
      } else {
        fpsWindowStartedAt = nowMs;
        fpsWindowFrameCount = 0;
        hasPublishedFps = false;
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
