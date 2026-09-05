"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import {
  SIGNAL_ARTWORK_JOB_EVENT,
  signalArtworkAssetLabel,
  signalArtworkJobHeadline,
  signalArtworkJobIsActive,
  signalArtworkJobSoftSynthesisCount,
  type SignalArtworkJobSnapshot,
} from "./signalArtworkJob";
import { registerPrismSoftSynthesisJobs } from "./prismSoftSynthesisUi.ts";
import styles from "./signalArtworkJobActivity.module.css";

type SignalArtworkJobActivityProps = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  theme: "light" | "dark";
  onOpenSignal: () => void;
};

function isActiveArtworkAssetStatus(
  status: SignalArtworkJobSnapshot["assets"][number]["status"],
): boolean {
  return status === "generating" || status === "attaching";
}

function isQueuedArtworkAssetStatus(
  status: SignalArtworkJobSnapshot["assets"][number]["status"],
): boolean {
  return status === "waiting" || status === "waiting-for-night";
}

export function SignalArtworkJobActivity({
  request,
  theme,
  onOpenSignal,
}: SignalArtworkJobActivityProps): React.JSX.Element | null {
  const [job, setJob] = useState<SignalArtworkJobSnapshot | null>(null);
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

  const activeAssets = useMemo(
    () => assetSummary.filter((asset) => isActiveArtworkAssetStatus(asset.status)),
    [assetSummary],
  );
  const queuedAssets = useMemo(
    () => assetSummary.filter((asset) => isQueuedArtworkAssetStatus(asset.status)),
    [assetSummary],
  );

  const softJobCount = useMemo(() => {
    if (!job) return 0;
    return signalArtworkJobSoftSynthesisCount(
      job,
      activeAssets.length,
      queuedAssets.length,
    );
  }, [activeAssets.length, job, queuedAssets.length]);

  useEffect(() => {
    registerPrismSoftSynthesisJobs("signal-artwork", softJobCount);
    return () => registerPrismSoftSynthesisJobs("signal-artwork", 0);
  }, [softJobCount]);

  // A successful receipt remains available to Signal's own poller, but it is
  // no longer queue work and must not reappear when another source expands
  // the shared Synthesis panel.
  if (!job || softJobCount === 0) return null;
  const active = signalArtworkJobIsActive(job);
  const progress =
    job.totalCount > 0 ? job.completedCount / job.totalCount : null;
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
    <PrismBlockingLoader
      open
      placement="docked"
      theme={theme}
      eyebrow={`Signal · ${job.showName}`}
      title={signalArtworkJobHeadline(job)}
      detail={`${job.completedCount} asset${job.completedCount === 1 ? "" : "s"} complete`}
      stepLabel={
        active
          ? job.status === "cancelling"
            ? "Stopping artwork…"
            : "Synthesizing artwork"
          : "Artwork ready"
      }
      progress={progress}
      startedAt={job.startedAt}
      footer={
        active
          ? "Soft prepare — keep using PRISM while assets land one at a time."
          : "Artwork finished. Open Signal or dismiss this card."
      }
      cancelLabel="Cancel artwork synthesis"
      cancelConfirmTitle="Cancel synthesizing Signal artwork?"
      cancelConfirmDetail="Finished assets stay. Anything still rendering will stop."
      onCancel={
        active
          ? () => {
              void cancel();
            }
          : undefined
      }
      footerActions={
        active ? undefined : (
          <>
            <button type="button" onClick={onOpenSignal}>
              View Signal
            </button>
            <button
              type="button"
              onClick={() => void dismiss()}
              disabled={actionBusy}
            >
              Dismiss
            </button>
          </>
        )
      }
      activeChildren={
        active && activeAssets.length > 0 ? (
          <ul
            className={styles.assets}
            data-signal-artwork-activity="true"
            data-job-section-list="active"
            aria-label={`Active Signal artwork for ${job.showName}`}
          >
            {activeAssets.map((asset) => (
              <li key={asset.kind} data-status={asset.status}>
                <span aria-hidden="true" />
                <b>{asset.label}</b>
                <small>
                  {asset.status === "attaching"
                    ? "Saving to show"
                    : asset.status.replaceAll("-", " ")}
                </small>
                <button
                  type="button"
                  data-soft-job-action="stop"
                  onClick={() => void cancel()}
                  disabled={actionBusy || job.status === "cancelling"}
                  aria-label={`Stop synthesizing ${asset.label}`}
                >
                  Stop
                </button>
              </li>
            ))}
          </ul>
        ) : undefined
      }
      queuedChildren={
        active && queuedAssets.length > 0 ? (
          <ul
            className={styles.assets}
            data-signal-artwork-activity="true"
            data-job-section-list="queued"
            aria-label={`Queued Signal artwork for ${job.showName}`}
          >
            {queuedAssets.map((asset) => (
              <li key={asset.kind} data-status={asset.status}>
                <span aria-hidden="true" />
                <b>{asset.label}</b>
                <small>
                  {asset.status === "waiting-for-night"
                    ? "Waiting for Dark studio"
                    : "Queued"}
                </small>
              </li>
            ))}
          </ul>
        ) : undefined
      }
    >
      {!active ? (
        <ul
          className={styles.assets}
          data-signal-artwork-activity="true"
          aria-label={`Signal artwork for ${job.showName}`}
        >
          {assetSummary.map((asset) => (
            <li key={asset.kind} data-status={asset.status}>
              <span aria-hidden="true" />
              <b>{asset.label}</b>
              <small>
                {asset.status === "waiting-for-night"
                  ? "Waiting for Dark studio"
                  : asset.status === "attaching"
                    ? "Saving to show"
                    : asset.status.replaceAll("-", " ")}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
      {job.errors.length > 0 ? (
        <p className={styles.error} role="alert">
          {job.errors.at(-1)?.message}
        </p>
      ) : null}
    </PrismBlockingLoader>
  );
}
