"use client";

import { useEffect } from "react";

import { PrismDomAdaptiveQualityController } from "./prismDomAdaptiveQuality";

export function PrismAdaptiveDomQualityGovernor(): null {
  useEffect(() => {
    const root = document.documentElement;
    const previousQuality = root.dataset.prismAdaptiveQuality;
    const controller = new PrismDomAdaptiveQualityController(performance.now());
    let frameId = 0;
    let previousFrameTime = performance.now();

    const publishQuality = (): void => {
      root.dataset.prismAdaptiveQuality = controller.quality;
    };
    publishQuality();

    const tick = (nowMs: number): void => {
      const result = controller.recordFrame({
        nowMs,
        deltaMs: Math.max(0, nowMs - previousFrameTime),
        foreground: document.visibilityState === "visible",
      });
      previousFrameTime = nowMs;
      if (result.qualityChanged) publishQuality();
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      if (previousQuality === undefined) {
        delete root.dataset.prismAdaptiveQuality;
      } else {
        root.dataset.prismAdaptiveQuality = previousQuality;
      }
    };
  }, []);

  return null;
}
