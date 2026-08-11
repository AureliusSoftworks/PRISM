"use client";

import { useSyncExternalStore } from "react";
import styles from "./page.module.css";
import {
  getPrismSceneDiagnosticsSnapshot,
  subscribePrismSceneDiagnostics,
} from "./prismSceneDiagnostics";

function formatMetric(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}

export function PrismRenderingDiagnosticsCard(): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    subscribePrismSceneDiagnostics,
    getPrismSceneDiagnosticsSnapshot,
    getPrismSceneDiagnosticsSnapshot,
  );
  const fallback =
    snapshot.rendererStatus === "fallback" ||
    snapshot.rendererStatus === "context-lost";
  return (
    <section
      className={styles.helpToolGroup}
      aria-label="Rendering diagnostics"
      data-prism-rendering-diagnostics="true"
    >
      <header className={styles.helpToolGroupHeader}>
        <div>
          <span>Display</span>
          <h5>Rendering health</h5>
        </div>
        <span
          className={styles.helpStatusPill}
          data-status={fallback ? "error" : "connected"}
        >
          {fallback ? "CSS fallback" : snapshot.rendererStatus}
        </span>
      </header>
      <p>
        In-memory scene metrics from this device only. Nothing is persisted or
        transmitted.
      </p>
      <div className={styles.helpMetricGrid}>
        <span>
          <small>Lifecycle</small>
          <strong>{snapshot.lifecycle}</strong>
        </span>
        <span>
          <small>Quality</small>
          <strong>{snapshot.quality}</strong>
        </span>
        <span>
          <small>FPS target / observed</small>
          <strong>
            {snapshot.targetFps} / {formatMetric(snapshot.observedFps)}
          </strong>
        </span>
        <span>
          <small>Frame p50 / p95</small>
          <strong>
            {formatMetric(snapshot.p50FrameIntervalMs)} / {" "}
            {formatMetric(snapshot.p95FrameIntervalMs)} ms
          </strong>
        </span>
        <span>
          <small>Missed frames</small>
          <strong>{formatMetric(snapshot.missedFramePercentage)}%</strong>
        </span>
        <span>
          <small>Effective DPR</small>
          <strong>{formatMetric(snapshot.effectiveDpr, 2)}</strong>
        </span>
        <span>
          <small>Particles / objects</small>
          <strong>
            {snapshot.particleCount} / {snapshot.objectCount}
          </strong>
        </span>
        <span>
          <small>Context loss / ticks</small>
          <strong>
            {snapshot.contextLossCount} / {snapshot.tickCount}
          </strong>
        </span>
      </div>
    </section>
  );
}
