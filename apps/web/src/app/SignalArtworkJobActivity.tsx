"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
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

  if (!job) return null;
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
      cancelConfirmTitle="Stop synthesizing Signal artwork?"
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
    >
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
      {job.errors.length > 0 ? (
        <p className={styles.error} role="alert">
          {job.errors.at(-1)?.message}
        </p>
      ) : null}
    </PrismBlockingLoader>
  );
}
