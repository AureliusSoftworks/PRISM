"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SIGNAL_ARTWORK_JOB_EVENT,
  signalArtworkAssetLabel,
  signalArtworkJobHeadline,
  signalArtworkJobIsActive,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import styles from "./signalArtworkJobActivity.module.css";

type SignalArtworkJobActivityProps = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  theme: "light" | "dark";
  onOpenSignal: () => void;
};

function elapsedLabel(startedAt: string, nowMs: number): string {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((nowMs - new Date(startedAt).getTime()) / 1_000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function assetStatusLabel(
  asset: SignalArtworkJobSnapshot["assets"][number],
): string {
  if (asset.status === "waiting-for-night") return "Waiting for Dark studio";
  if (asset.kind === "studio-lighting" && asset.status === "waiting") {
    return "Waiting for the image queue";
  }
  if (asset.kind === "studio-lighting" && asset.status === "generating") {
    return "Mapping real Studio surfaces";
  }
  if (asset.status === "attaching") return "Saving to show";
  return asset.status.replaceAll("-", " ");
}

export function SignalArtworkJobActivity({
  request,
  theme,
  onOpenSignal,
}: SignalArtworkJobActivityProps): React.JSX.Element | null {
  const [job, setJob] = useState<SignalArtworkJobSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [actionBusy, setActionBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await request<{ job: SignalArtworkJobSnapshot | null }>(
        "/api/botcast/artwork-jobs/active",
      );
      setJob(response.job);
    } catch {
      // A temporary disconnect must not erase the last honest job state.
    }
  }, [request]);

  useEffect(() => {
    void refresh();
    const onStarted = (event: Event): void => {
      setJob((event as CustomEvent<SignalArtworkJobSnapshot>).detail);
    };
    window.addEventListener(SIGNAL_ARTWORK_JOB_EVENT, onStarted);
    return () => window.removeEventListener(SIGNAL_ARTWORK_JOB_EVENT, onStarted);
  }, [refresh]);

  useEffect(() => {
    if (!job || !signalArtworkJobIsActive(job)) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
      void request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/artwork-jobs/${encodeURIComponent(job.id)}`,
      )
        .then((response) => setJob(response.job))
        .catch(() => undefined);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [job, request]);

  const assetSummary = useMemo(
    () =>
      job?.assets.map((asset) => ({
        ...asset,
        label: signalArtworkAssetLabel(asset.kind),
      })) ?? [],
    [job],
  );

  if (!job) return null;
  const active = signalArtworkJobIsActive(job);
  const elapsed = elapsedLabel(job.startedAt, job.finishedAt ? new Date(job.finishedAt).getTime() : nowMs);
  const cancel = async (): Promise<void> => {
    if (!active || job.status === "cancelling") return;
    setJob((current) => (current ? { ...current, status: "cancelling" } : current));
    setActionBusy(true);
    try {
      const response = await request<{ job: SignalArtworkJobSnapshot }>(
        `/api/botcast/artwork-jobs/${encodeURIComponent(job.id)}/cancel`,
        { method: "POST" },
      );
      setJob(response.job);
    } catch {
      await refresh();
    } finally {
      setActionBusy(false);
    }
  };
  const dismiss = async (): Promise<void> => {
    setActionBusy(true);
    try {
      await request(`/api/botcast/artwork-jobs/${encodeURIComponent(job.id)}`, {
        method: "DELETE",
      });
      setJob(null);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <aside
      className={styles.activity}
      data-theme={theme}
      data-active={active ? "true" : undefined}
      data-status={job.status}
      data-signal-artwork-activity="true"
      data-dev-panel-safe-area="bottom"
      aria-live="polite"
      aria-label={`Signal artwork for ${job.showName}`}
    >
      <span className={styles.spectrum} aria-hidden="true" />
      <header>
        <div>
          <span className={styles.eyebrow}>Signal · {job.showName}</span>
          <strong>{signalArtworkJobHeadline(job)}</strong>
        </div>
        <span className={styles.count}>{job.completedCount}/{job.totalCount}</span>
      </header>
      <div className={styles.track} data-active={active ? "true" : undefined} aria-hidden="true">
        <span />
      </div>
      <div className={styles.meta}>
        <span>{job.completedCount} asset{job.completedCount === 1 ? "" : "s"} complete</span>
        <span>Elapsed {elapsed}</span>
      </div>
      <ul className={styles.assets}>
        {assetSummary.map((asset) => (
          <li key={asset.kind} data-status={asset.status}>
            <span aria-hidden="true" />
            <b>{asset.label}</b>
            <small>{assetStatusLabel(asset)}</small>
          </li>
        ))}
      </ul>
      {job.errors.length > 0 ? (
        <p className={styles.error} role="alert">{job.errors.at(-1)?.message}</p>
      ) : null}
      <footer>
        {active ? (
          <button
            type="button"
            onClick={() => void cancel()}
            disabled={actionBusy || job.status === "cancelling"}
          >
            {job.status === "cancelling" ? "Stopping…" : "Cancel"}
          </button>
        ) : (
          <>
            <button type="button" onClick={onOpenSignal}>View Signal</button>
            <button type="button" onClick={() => void dismiss()} disabled={actionBusy}>
              Dismiss
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
