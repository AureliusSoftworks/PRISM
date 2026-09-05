/* Paste into the focused LOCAL app's DevTools. Auto-stops after 60 seconds.
 * No API calls, DOM scans, text capture, storage writes, or scheduler wrapping.
 * Read window.__prismLagSpikeProbe.snapshot(); stop early with .stop().
 */
(() => {
  window.__prismLagSpikeProbe?.stop();
  const frameGaps = [];
  const inputToFrame = [];
  const longTasks = [];
  let previous = null;
  let frameId = 0;
  let stopped = false;
  let hiddenTransitions = 0;
  const pendingInput = [];
  const startedAt = performance.now();
  const summary = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (p) => Number((sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0).toFixed(2));
    return { samples: values.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: percentile(1), over16_7Ms: values.filter((ms) => ms > 16.7).length, over33_3Ms: values.filter((ms) => ms > 33.3).length, over50Ms: values.filter((ms) => ms > 50).length };
  };
  const input = () => { if (!document.hidden) pendingInput.push(performance.now()); };
  const visibility = () => { previous = null; pendingInput.length = 0; hiddenTransitions++; };
  const tick = (now) => {
    if (stopped) return;
    if (!document.hidden) {
      if (previous !== null) frameGaps.push(now - previous);
      previous = now;
      for (const at of pendingInput.splice(0)) inputToFrame.push(Math.max(0, now - at));
    } else previous = null;
    frameId = requestAnimationFrame(tick);
  };
  let observer = null;
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    observer = new PerformanceObserver((list) => {
      if (!document.hidden) for (const entry of list.getEntries()) longTasks.push(entry.duration);
    });
    observer.observe({ type: "longtask" });
  }
  document.addEventListener("keydown", input, true);
  document.addEventListener("pointerdown", input, true);
  document.addEventListener("visibilitychange", visibility);
  const snapshot = () => ({
    kind: "visible browser rAF intervals; input-handler-to-next-rAF (not physical key-to-photon)",
    elapsedMs: Math.round(performance.now() - startedAt), stopped, hiddenTransitions,
    frameGaps: summary(frameGaps), inputToNextFrame: summary(inputToFrame),
    longTasks: observer ? summary(longTasks) : null,
  });
  const stop = () => {
    if (!stopped) {
      stopped = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("keydown", input, true);
      document.removeEventListener("pointerdown", input, true);
      document.removeEventListener("visibilitychange", visibility);
    }
    return snapshot();
  };
  const timer = setTimeout(stop, 60_000);
  window.__prismLagSpikeProbe = { snapshot, stop };
  frameId = requestAnimationFrame(tick);
})();
