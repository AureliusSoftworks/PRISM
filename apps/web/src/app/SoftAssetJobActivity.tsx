"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import {
  announcePrismSoftAssetJob,
  PRISM_SOFT_ASSET_JOB_EVENT,
  softAssetJobIsActive,
  type PrismSoftAssetJobSnapshot,
} from "./softAssetJob";
import { registerPrismSoftSynthesisJobs } from "./prismSoftSynthesisUi.ts";
import styles from "./softAssetJobActivity.module.css";

type SoftAssetJobActivityProps = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  theme: "light" | "dark";
  onOpenDebate: () => void;
};

function upsertJob(
  jobs: readonly PrismSoftAssetJobSnapshot[],
  next: PrismSoftAssetJobSnapshot,
): PrismSoftAssetJobSnapshot[] {
  return [next, ...jobs.filter((job) => job.id !== next.id)].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
}

function jobStatusLabel(job: PrismSoftAssetJobSnapshot): string {
  if (job.status === "queued") return "Queued";
  if (job.status === "generating") return "Synthesizing";
  if (job.status === "attaching") return "Saving to Debate";
  if (job.status === "cancelling") return "Stopping";
  if (job.status === "succeeded") return "Ready in Debate";
  if (job.status === "cancelled") return "Cancelled";
  return "Needs attention";
}

export function SoftAssetJobActivity({
  request,
  theme,
  onOpenDebate,
}: SoftAssetJobActivityProps): React.JSX.Element | null {
  const [jobs, setJobs] = useState<PrismSoftAssetJobSnapshot[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await request<{ jobs: PrismSoftAssetJobSnapshot[] }>(
        "/api/soft-asset-jobs",
      );
      setJobs(response.jobs);
      for (const job of response.jobs) announcePrismSoftAssetJob(job);
    } catch {
      // Preserve the last honest state through a temporary app/API disconnect.
    }
  }, [request]);

  useEffect(() => {
    void refresh();
    const onJob = (event: Event): void => {
      const next = (event as CustomEvent<PrismSoftAssetJobSnapshot>).detail;
      if (!next?.id) return;
      setJobs((current) => upsertJob(current, next));
    };
    window.addEventListener(PRISM_SOFT_ASSET_JOB_EVENT, onJob);
    return () => window.removeEventListener(PRISM_SOFT_ASSET_JOB_EVENT, onJob);
  }, [refresh]);

  const activeJobs = useMemo(
    () => jobs.filter((job) => softAssetJobIsActive(job)),
    [jobs],
  );
  const terminalJobs = useMemo(
    () => jobs.filter((job) => !softAssetJobIsActive(job)),
    [jobs],
  );

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = window.setInterval(() => void refresh(), 1_500);
    return () => window.clearInterval(interval);
  }, [activeJobs.length, refresh]);

  useEffect(() => {
    registerPrismSoftSynthesisJobs("durable-soft-assets", jobs.length);
    return () => registerPrismSoftSynthesisJobs("durable-soft-assets", 0);
  }, [jobs.length]);

  if (jobs.length === 0) return null;
  const completedCount = jobs.filter((job) => job.status === "succeeded").length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const active = activeJobs.length > 0;

  const cancelActive = async (): Promise<void> => {
    if (!active || actionBusy) return;
    setActionBusy(true);
    try {
      const settled = await Promise.allSettled(
        activeJobs.map((job) =>
          request<{ job: PrismSoftAssetJobSnapshot }>(
            `/api/soft-asset-jobs/${encodeURIComponent(job.id)}/cancel`,
            { method: "POST" },
          ),
        ),
      );
      setJobs((current) => {
        let next = [...current];
        for (const result of settled) {
          if (result.status === "fulfilled") {
            next = upsertJob(next, result.value.job);
          }
        }
        return next;
      });
      await refresh();
    } finally {
      setActionBusy(false);
    }
  };

  const dismissFinished = async (): Promise<void> => {
    if (terminalJobs.length === 0 || actionBusy) return;
    setActionBusy(true);
    try {
      await Promise.allSettled(
        terminalJobs.map((job) =>
          request(`/api/soft-asset-jobs/${encodeURIComponent(job.id)}`, {
            method: "DELETE",
          }),
        ),
      );
      await refresh();
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <PrismBlockingLoader
      open
      placement="docked"
      theme={theme}
      eyebrow="Prism · Soft Asset Delivery"
      title={
        active
          ? `Preparing ${activeJobs.length} Debate ${activeJobs.length === 1 ? "asset" : "assets"}`
          : failedCount > 0
            ? `${completedCount} ready · ${failedCount} need attention`
            : `${completedCount} Debate ${completedCount === 1 ? "asset is" : "assets are"} ready`
      }
      detail={
        active
          ? "Assets will attach to their saved exhibits wherever you go in PRISM."
          : "The finished sprites are already attached to their saved Debate exhibits."
      }
      stepLabel={active ? "Synthesizing in the background" : "Delivery complete"}
      progress={jobs.length > 0 ? terminalJobs.length / jobs.length : null}
      startedAt={jobs[0]?.startedAt ?? null}
      footer={
        active
          ? "Hit it and forget it — keep using any PRISM applet while assets land."
          : "Open Debate to see the attached assets, or dismiss this card."
      }
      cancelLabel="Cancel soft asset synthesis"
      cancelConfirmTitle="Cancel background asset synthesis?"
      cancelConfirmDetail="Completed sprites stay attached. Anything still rendering will stop."
      onCancel={active ? () => void cancelActive() : undefined}
      footerActions={
        active ? undefined : (
          <>
            <button type="button" onClick={onOpenDebate}>
              View Debate
            </button>
            <button
              type="button"
              onClick={() => void dismissFinished()}
              disabled={actionBusy}
            >
              Dismiss
            </button>
          </>
        )
      }
    >
      <ul className={styles.jobs} aria-label="Soft synthesized assets">
        {jobs.map((job) => (
          <li key={job.id} data-status={job.status}>
            <span aria-hidden="true" />
            <b>{job.title}</b>
            <small>{jobStatusLabel(job)}</small>
          </li>
        ))}
      </ul>
      {jobs.some((job) => job.error) ? (
        <p className={styles.error} role="status">
          {jobs.find((job) => job.error)?.error}
        </p>
      ) : null}
    </PrismBlockingLoader>
  );
}
