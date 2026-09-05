"use client";

import { useEffect, useMemo } from "react";
import type { GraphicsQuality } from "@localai/shared";
import { prismSceneQualityCeilingForGraphicsQuality } from "./graphicsQuality";
import {
  publishPrismSceneDiagnostics,
  removePrismSceneDiagnostics,
} from "./prismSceneDiagnostics";
import {
  PrismAdaptiveQualityController,
  type PrismSceneQuality,
  type PrismSceneTimingWindow,
} from "./prismSceneRuntime";

const DEBATE_DOM_SCENE_ID = "debate-live-dom";

function publishDebateDomDiagnostics(args: {
  quality: PrismSceneQuality;
  frameWindow?: PrismSceneTimingWindow;
  foreground: boolean;
  objectCount: number;
  tickCount: number;
}): void {
  const dpr =
    typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio);
  publishPrismSceneDiagnostics(DEBATE_DOM_SCENE_ID, {
    rendererStatus: "dom",
    lifecycle: args.foreground ? "interactive" : "suspended",
    quality: args.quality,
    targetFps: args.foreground ? 60 : 0,
    observedFps: args.frameWindow?.observedFps ?? 0,
    p50FrameIntervalMs: args.frameWindow?.p50FrameIntervalMs ?? 0,
    p95FrameIntervalMs: args.frameWindow?.p95FrameIntervalMs ?? 0,
    missedFramePercentage: args.frameWindow?.missedFramePercentage ?? 0,
    effectiveDpr: dpr,
    objectCount: args.objectCount,
    particleCount: 0,
    contextLossCount: 0,
    tickCount: args.tickCount,
    updatedAtMs: performance.now(),
  });
}

export function useDebateDomPerformance(options: {
  active: boolean;
  graphicsQuality: GraphicsQuality;
  objectCount: number;
}): PrismSceneQuality {
  const renderedQuality = prismSceneQualityCeilingForGraphicsQuality(
    options.graphicsQuality,
  );
  const controller = useMemo(() => {
    return new PrismAdaptiveQualityController(0, renderedQuality);
  }, [renderedQuality]);

  useEffect(() => {
    if (!options.active) {
      removePrismSceneDiagnostics(DEBATE_DOM_SCENE_ID);
      return;
    }

    let frameId = 0;
    let previousNow = performance.now();
    let tickCount = 0;
    const foreground = (): boolean => document.visibilityState === "visible";
    publishDebateDomDiagnostics({
      quality: renderedQuality,
      foreground: foreground(),
      objectCount: options.objectCount,
      tickCount,
    });

    const frame = (now: number): void => {
      const deltaMs = now - previousNow;
      previousNow = now;
      tickCount += 1;
      const result = controller.recordFrame({
        nowMs: now,
        deltaMs,
        activity: "interactive",
        foreground: foreground(),
      });
      if (result.window) {
        publishDebateDomDiagnostics({
          // Frame pressure is diagnostic only. The player-selected quality is
          // the sole rendered tier.
          quality: renderedQuality,
          frameWindow: result.window,
          foreground: foreground(),
          objectCount: options.objectCount,
          tickCount,
        });
      }
      frameId = window.requestAnimationFrame(frame);
    };

    const handleVisibility = (): void => {
      const now = performance.now();
      controller.noteDiscontinuity(now);
      previousNow = now;
      publishDebateDomDiagnostics({
        quality: renderedQuality,
        foreground: foreground(),
        objectCount: options.objectCount,
        tickCount,
      });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    frameId = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibility);
      removePrismSceneDiagnostics(DEBATE_DOM_SCENE_ID);
    };
  }, [controller, options.active, options.objectCount, renderedQuality]);

  return renderedQuality;
}
