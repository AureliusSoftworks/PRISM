export type SignalArtworkAssetKind =
  | "night-studio"
  | "day-studio"
  | "logo";

export type SignalArtworkJobStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type SignalArtworkJobSnapshot = {
  id: string;
  showId: string;
  showName: string;
  status: SignalArtworkJobStatus;
  currentAsset: SignalArtworkAssetKind | null;
  completedCount: number;
  totalCount: number;
  assets: Array<{
    kind: SignalArtworkAssetKind;
    status:
      | "waiting"
      | "waiting-for-night"
      | "generating"
      | "attaching"
      | "complete"
      | "failed"
      | "skipped";
    error: string | null;
    imageId: string | null;
  }>;
  errors: Array<{ asset: SignalArtworkAssetKind; message: string }>;
  timings: {
    identityMs: number | null;
    nightStudioMs: number | null;
    dayRelightMs: number | null;
    logoMs: number | null;
    downloadMs: number;
    localPersistenceMs: number;
    attachmentMs: number;
  };
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export const SIGNAL_ARTWORK_JOB_EVENT = "prism:signal-artwork-job";

export function announceSignalArtworkJob(job: SignalArtworkJobSnapshot): void {
  window.dispatchEvent(
    new CustomEvent<SignalArtworkJobSnapshot>(SIGNAL_ARTWORK_JOB_EVENT, {
      detail: job,
    }),
  );
}

export function signalArtworkJobIsActive(
  job: SignalArtworkJobSnapshot | null,
): boolean {
  return job?.status === "running" || job?.status === "cancelling";
}

export function signalArtworkAssetLabel(kind: SignalArtworkAssetKind): string {
  if (kind === "night-studio") return "Dark studio";
  if (kind === "day-studio") return "Light relight";
  return "Logo";
}

export function signalArtworkJobHeadline(
  job: SignalArtworkJobSnapshot,
): string {
  if (job.status === "cancelling") return "Stopping safely…";
  if (job.status === "completed") {
    return job.totalCount === 1
      ? `${signalArtworkAssetLabel(job.assets[0]!.kind)} ready`
      : "Show look complete";
  }
  if (job.status === "partial") return "Show look partially complete";
  if (job.status === "failed") return "Show look needs attention";
  if (job.status === "cancelled") return "Show look cancelled";
  if (job.currentAsset === "day-studio") {
    return "Relighting the completed Dark studio";
  }
  if (job.currentAsset) {
    return `Generating ${signalArtworkAssetLabel(job.currentAsset)}`;
  }
  return "Preparing show artwork";
}
