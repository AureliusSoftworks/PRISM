"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import styles from "./page.module.css";
import {
  buildPrismFlightTrace,
  clearPrismFlightEvents,
  getPrismFlightEvents,
  recordPrismFlightEvent,
  subscribePrismFlightEvents,
} from "./prismFlightRecorderTraceStore";
import { writeDiagnosticClipboard } from "./webDiagnostics";
import { getPrismSceneDiagnosticsSnapshot, subscribePrismSceneDiagnostics } from "./prismSceneDiagnostics";

export function PrismFlightRecorderCapture({ surface, panel }: { surface: string; panel: string | null }): null {
  useEffect(() => {
    recordPrismFlightEvent({ area: "surface", name: "opened", detail: { surface } });
  }, [surface]);
  useEffect(() => {
    if (panel) recordPrismFlightEvent({ area: "panel", name: "opened", detail: { panel } });
  }, [panel]);
  useEffect(() => {
    let prior = "";
    return subscribePrismSceneDiagnostics(() => {
      const next = getPrismSceneDiagnosticsSnapshot();
      const key = `${next.sceneId}|${next.lifecycle}|${next.quality}|${Math.round(next.observedFps)}`;
      if (key === prior) return;
      prior = key;
      recordPrismFlightEvent({ area: "render", name: "scene-state", detail: { scene: next.sceneId ?? "none", lifecycle: next.lifecycle, quality: next.quality, fps: Math.round(next.observedFps), targetFps: next.targetFps } });
    });
  }, []);
  useEffect(() => {
    const onError = () => recordPrismFlightEvent({ area: "runtime", name: "window-error", level: "error" });
    const onRejection = () => recordPrismFlightEvent({ area: "runtime", name: "unhandled-rejection", level: "error" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}

export function PrismFlightRecorderCard({ onSummarize }: { onSummarize: (trace: string) => Promise<{ summary: string; model: string }> }): React.JSX.Element {
  const events = useSyncExternalStore(subscribePrismFlightEvents, getPrismFlightEvents, getPrismFlightEvents);
  const [feedback, setFeedback] = useState("");
  const [summary, setSummary] = useState("");
  const trace = useMemo(() => buildPrismFlightTrace(events), [events]);
  const download = (): void => {
    const blob = new Blob([trace], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `prism-flight-recorder-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Safe trace downloaded.");
  };
  return <section className={styles.helpToolGroup} aria-label="Flight Recorder" data-prism-flight-recorder="true">
    <header className={styles.helpToolGroupHeader}><div><span>Local trace</span><h5>Flight Recorder</h5></div><span className={styles.helpStatusPill} data-status="connected">{events.length} events</span></header>
    <p>A local, per-session event timeline for troubleshooting. Copying is always deliberate; private content is excluded before an event is stored.</p>
    <pre style={{ maxHeight: 200, overflow: "auto", margin: "0 0 .75rem", whiteSpace: "pre-wrap", fontSize: ".68rem" }} aria-label="Flight Recorder event log">{trace}</pre>
    <div className={styles.helpToolActions}>
      <button type="button" className={styles.settingsInfoButton} onClick={() => void writeDiagnosticClipboard(trace).then(() => setFeedback("Safe trace copied.")).catch(() => setFeedback("Could not copy the trace."))}><strong>Copy safe trace</strong><span>Paste this into a support conversation.</span></button>
      <button type="button" className={styles.settingsInfoButton} onClick={download}><strong>Download safe trace</strong><span>Save the same redacted text file.</span></button>
      <button type="button" className={styles.settingsInfoButton} onClick={() => void onSummarize(trace).then(({ summary: next, model }) => { setSummary(next); setFeedback(`Summarized locally with ${model}.`); }).catch(() => setFeedback("Local trace summary is unavailable."))}><strong>Ask Prism to summarize</strong><span>Uses your configured local auxiliary model.</span></button>
      <button type="button" className={styles.settingsInfoButton} onClick={() => { clearPrismFlightEvents(); setSummary(""); setFeedback("Local trace cleared."); }}><strong>Clear local trace</strong><span>Removes this window’s events.</span></button>
    </div>
    {feedback ? <p aria-live="polite">{feedback}</p> : null}
    {summary ? <p><strong>Prism’s reading</strong><br />{summary}</p> : null}
  </section>;
}
