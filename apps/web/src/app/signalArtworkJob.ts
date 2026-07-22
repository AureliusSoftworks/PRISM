export type SignalArtworkAssetKind =
  | "night-studio"
  | "day-studio"
  | "studio-lighting"
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
    studioLightingMs: number | null;
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
  if (kind === "studio-lighting") return "Studio lighting";
  return "Logo";
}

export function signalArtworkJobHeadline(
  job: SignalArtworkJobSnapshot,
): string {
  if (job.status === "cancelling") return "Stopping safely…";
  if (job.status === "completed") {
    if (
      job.assets.some((asset) => asset.kind === "studio-lighting") &&
      !job.assets.some((asset) => asset.kind === "logo")
    ) {
      return "Studio refresh complete";
    }
    return job.totalCount === 1
      ? `${signalArtworkAssetLabel(job.assets[0]!.kind)} ready`
      : "Show look complete";
  }
  if (job.status === "partial") return "Show look partially complete";
  if (job.status === "failed") return "Show look needs attention";
  if (job.status === "cancelled") return "Show look cancelled";
  if (
    job.currentAsset === null &&
    job.assets.some((asset) => asset.status === "waiting")
  ) {
    return "Queued for image generation";
  }
  if (job.currentAsset === "day-studio") {
    return "Relighting the completed Dark studio";
  }
  if (job.currentAsset === "studio-lighting") {
    return "Generating surface-aware Studio lighting";
  }
  if (job.currentAsset) {
    return `Generating ${signalArtworkAssetLabel(job.currentAsset)}`;
  }
  return "Preparing show artwork";
}

export function signalArtworkJobCompletionNotice(
  job: SignalArtworkJobSnapshot,
): string {
  const kinds = new Set(job.assets.map((asset) => asset.kind));
  const hasLighting = kinds.has("studio-lighting");
  const hasLogo = kinds.has("logo");
  const hasNight = kinds.has("night-studio");
  const hasDay = kinds.has("day-studio");
  if (hasLighting && hasNight && hasDay) {
    return hasLogo
      ? "The custom logo, matching Light and Dark studios, and Studio lighting are live."
      : "The matching Light and Dark studios and their Studio lighting are live.";
  }
  if (hasLighting && hasDay) {
    return "The refreshed Light studio and its Studio lighting are live.";
  }
  if (hasLighting && hasNight) {
    return "The refreshed Dark studio and its Studio lighting are live.";
  }
  if (job.assets.length === 1) {
    return `The refreshed ${signalArtworkAssetLabel(job.assets[0]!.kind)} is live.`;
  }
  return "The completed Signal artwork is live.";
}
