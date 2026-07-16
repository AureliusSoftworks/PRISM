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
      className={`${styles.devToolsCard} ${styles.devToolsCardWide}`}
      aria-label="Rendering diagnostics"
      data-prism-rendering-diagnostics="true"
    >
      <div className={styles.devToolsCardHeader}>
        <span>Rendering</span>
        <strong>{fallback ? "CSS fallback" : snapshot.rendererStatus}</strong>
      </div>
      <p className={styles.devToolsSectionHint}>
        In-memory scene metrics from this device only. Nothing is persisted or
        transmitted.
      </p>
      <div className={styles.devToolsStatGrid}>
        <span className={styles.devToolsStat}>
          <small>Lifecycle</small>
          <strong>{snapshot.lifecycle}</strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Quality</small>
          <strong>{snapshot.quality}</strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>FPS target / observed</small>
          <strong>
            {snapshot.targetFps} / {formatMetric(snapshot.observedFps)}
          </strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Frame p50 / p95</small>
          <strong>
            {formatMetric(snapshot.p50FrameIntervalMs)} / {" "}
            {formatMetric(snapshot.p95FrameIntervalMs)} ms
          </strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Missed frames</small>
          <strong>{formatMetric(snapshot.missedFramePercentage)}%</strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Effective DPR</small>
          <strong>{formatMetric(snapshot.effectiveDpr, 2)}</strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Particles / objects</small>
          <strong>
            {snapshot.particleCount} / {snapshot.objectCount}
          </strong>
        </span>
        <span className={styles.devToolsStat}>
          <small>Context loss / ticks</small>
          <strong>
            {snapshot.contextLossCount} / {snapshot.tickCount}
          </strong>
        </span>
      </div>
    </section>
  );
}
