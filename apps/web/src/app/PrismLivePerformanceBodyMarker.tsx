"use client";

import { useEffect } from "react";

let activeLivePerformanceSurfaces = 0;
const PRISM_LIVE_PERFORMANCE_RELEASE_DELAY_MS = 1_200;

function publishLivePerformanceState(): void {
  if (activeLivePerformanceSurfaces > 0) {
    document.body.dataset.prismLivePerformanceActive = "true";
  } else {
    delete document.body.dataset.prismLivePerformanceActive;
  }
}

/** Mirrors live Coffee/Signal presence onto body without a relational :has()
 * selector that must be reconsidered after every transcript DOM mutation. */
export function PrismLivePerformanceBodyMarker({
  active,
  releaseDelayMs = PRISM_LIVE_PERFORMANCE_RELEASE_DELAY_MS,
}: {
  active: boolean;
  releaseDelayMs?: number;
}): null {
  useEffect(() => {
    if (!active) return;
    activeLivePerformanceSurfaces += 1;
    publishLivePerformanceState();
    return () => {
      // Keep the performance floor across the exit transition. Restoring all
      // shell/companion motion in the same task as the live scene teardown can
      // otherwise turn one click into a visible long frame.
      window.setTimeout(() => {
        activeLivePerformanceSurfaces = Math.max(
          0,
          activeLivePerformanceSurfaces - 1,
        );
        publishLivePerformanceState();
      }, Math.max(0, releaseDelayMs));
    };
  }, [active, releaseDelayMs]);

  return null;
}
