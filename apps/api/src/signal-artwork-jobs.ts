import { randomUUID } from "node:crypto";

export type SignalArtworkAssetKind =
  | "night-studio"
  | "day-studio"
  | "logo";

export type SignalArtworkAssetStatus =
  | "waiting"
  | "waiting-for-night"
  | "generating"
  | "attaching"
  | "complete"
  | "failed"
  | "skipped";

export type SignalArtworkJobStatus =
  | "running"
  | "cancelling"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type SignalArtworkAssetState = {
  kind: SignalArtworkAssetKind;
  status: SignalArtworkAssetStatus;
  error: string | null;
  imageId: string | null;
};

export type SignalArtworkJobTimings = {
  identityMs: number | null;
  nightStudioMs: number | null;
  dayRelightMs: number | null;
  logoMs: number | null;
  downloadMs: number;
  localPersistenceMs: number;
  attachmentMs: number;
};

export type SignalArtworkJobSnapshot = {
  id: string;
  showId: string;
  showName: string;
  status: SignalArtworkJobStatus;
  currentAsset: SignalArtworkAssetKind | null;
  completedCount: number;
  totalCount: 3;
  assets: SignalArtworkAssetState[];
  errors: Array<{ asset: SignalArtworkAssetKind; message: string }>;
  timings: SignalArtworkJobTimings;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type SignalArtworkGeneratedAsset = {
  imageId: string;
  imageUrl: string;
  timings?: {
    downloadMs?: number;
    localPersistenceMs?: number;
  };
};

export type SignalArtworkJobStart = {
  userId: string;
  showId: string;
  showName: string;
  identityMs?: number | null;
  controller?: AbortController;
  releaseSlot: () => Promise<void>;
  generate: (
    kind: SignalArtworkAssetKind,
    sourceNightImageId: string | null,
    signal: AbortSignal,
  ) => Promise<SignalArtworkGeneratedAsset>;
  attach: (
    kind: SignalArtworkAssetKind,
    asset: SignalArtworkGeneratedAsset,
  ) => Promise<void>;
};

type SignalArtworkJobRecord = {
  userId: string;
  snapshot: SignalArtworkJobSnapshot;
  controller: AbortController;
  start: SignalArtworkJobStart;
};

function isTerminal(status: SignalArtworkJobStatus): boolean {
  return (
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  );
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Signal artwork generation failed.";
}

function timingKey(
  kind: SignalArtworkAssetKind,
): "nightStudioMs" | "dayRelightMs" | "logoMs" {
  if (kind === "night-studio") return "nightStudioMs";
  if (kind === "day-studio") return "dayRelightMs";
  return "logoMs";
}

export class SignalArtworkJobManager {
  private readonly jobs = new Map<string, SignalArtworkJobRecord>();
  private readonly latestJobIdByUser = new Map<string, string>();
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    now: () => Date = () => new Date(),
    id: () => string = () => randomUUID(),
  ) {
    this.now = now;
    this.id = id;
  }

  start(input: SignalArtworkJobStart): SignalArtworkJobSnapshot {
    const current = this.getLatestRecord(input.userId);
    if (current && !isTerminal(current.snapshot.status)) {
      throw new Error("A Signal artwork job is already running.");
    }
    if (current) this.jobs.delete(current.snapshot.id);

    const timestamp = this.now().toISOString();
    const snapshot: SignalArtworkJobSnapshot = {
      id: this.id(),
      showId: input.showId,
      showName: input.showName,
      status: "running",
      currentAsset: "night-studio",
      completedCount: 0,
      totalCount: 3,
      assets: [
        { kind: "night-studio", status: "waiting", error: null, imageId: null },
        {
          kind: "day-studio",
          status: "waiting-for-night",
          error: null,
          imageId: null,
        },
        { kind: "logo", status: "waiting", error: null, imageId: null },
      ],
      errors: [],
      timings: {
        identityMs:
          typeof input.identityMs === "number" && Number.isFinite(input.identityMs)
            ? Math.max(0, Math.round(input.identityMs))
            : null,
        nightStudioMs: null,
        dayRelightMs: null,
        logoMs: null,
        downloadMs: 0,
        localPersistenceMs: 0,
        attachmentMs: 0,
      },
      startedAt: timestamp,
      updatedAt: timestamp,
      finishedAt: null,
    };
    const record: SignalArtworkJobRecord = {
      userId: input.userId,
      snapshot,
      controller: input.controller ?? new AbortController(),
      start: input,
    };
    this.jobs.set(snapshot.id, record);
    this.latestJobIdByUser.set(input.userId, snapshot.id);
    void this.run(record);
    return this.clone(snapshot);
  }

  getLatest(userId: string): SignalArtworkJobSnapshot | null {
    const record = this.getLatestRecord(userId);
    return record ? this.clone(record.snapshot) : null;
  }

  get(userId: string, jobId: string): SignalArtworkJobSnapshot | null {
    const record = this.jobs.get(jobId);
    return record?.userId === userId ? this.clone(record.snapshot) : null;
  }

  hasActiveJobForShow(userId: string, showId: string): boolean {
    const record = this.getLatestRecord(userId);
    return Boolean(
      record &&
        record.snapshot.showId === showId &&
        !isTerminal(record.snapshot.status),
    );
  }

  cancel(userId: string, jobId: string): SignalArtworkJobSnapshot | null {
    const record = this.jobs.get(jobId);
    if (!record || record.userId !== userId) return null;
    if (!isTerminal(record.snapshot.status)) {
      record.snapshot.status = "cancelling";
      this.touch(record);
      record.controller.abort();
    }
    return this.clone(record.snapshot);
  }

  dismiss(userId: string, jobId: string): boolean {
    const record = this.jobs.get(jobId);
    if (!record || record.userId !== userId || !isTerminal(record.snapshot.status)) {
      return false;
    }
    this.jobs.delete(jobId);
    if (this.latestJobIdByUser.get(userId) === jobId) {
      this.latestJobIdByUser.delete(userId);
    }
    return true;
  }

  private getLatestRecord(userId: string): SignalArtworkJobRecord | null {
    const id = this.latestJobIdByUser.get(userId);
    return id ? this.jobs.get(id) ?? null : null;
  }

  private asset(
    record: SignalArtworkJobRecord,
    kind: SignalArtworkAssetKind,
  ): SignalArtworkAssetState {
    const asset = record.snapshot.assets.find((item) => item.kind === kind);
    if (!asset) throw new Error(`Unknown Signal artwork asset: ${kind}`);
    return asset;
  }

  private touch(record: SignalArtworkJobRecord): void {
    record.snapshot.updatedAt = this.now().toISOString();
  }

  private clone(snapshot: SignalArtworkJobSnapshot): SignalArtworkJobSnapshot {
    return structuredClone(snapshot);
  }

  private async run(record: SignalArtworkJobRecord): Promise<void> {
    let canonicalNightImageId: string | null = null;
    const signal = record.controller.signal;
    try {
      for (const kind of [
        "night-studio",
        "day-studio",
        "logo",
      ] as const) {
        if (signal.aborted) break;
        const asset = this.asset(record, kind);
        if (kind === "day-studio" && !canonicalNightImageId) {
          asset.status = "skipped";
          asset.error = "The Dark studio did not finish, so the Light relight could not start.";
          record.snapshot.errors.push({ asset: kind, message: asset.error });
          this.touch(record);
          continue;
        }

        record.snapshot.currentAsset = kind;
        asset.status = "generating";
        this.touch(record);
        const assetStartedAt = this.now().getTime();
        try {
          const generated = await record.start.generate(
            kind,
            kind === "day-studio" ? canonicalNightImageId : null,
            signal,
          );
          if (signal.aborted) break;
          asset.imageId = generated.imageId;
          record.snapshot.timings.downloadMs += Math.max(
            0,
            Math.round(generated.timings?.downloadMs ?? 0),
          );
          record.snapshot.timings.localPersistenceMs += Math.max(
            0,
            Math.round(generated.timings?.localPersistenceMs ?? 0),
          );
          if (kind === "night-studio") {
            canonicalNightImageId = generated.imageId;
            this.asset(record, "day-studio").status = "waiting";
          }

          asset.status = "attaching";
          this.touch(record);
          const attachStartedAt = this.now().getTime();
          try {
            await record.start.attach(kind, generated);
          } finally {
            record.snapshot.timings.attachmentMs += Math.max(
              0,
              this.now().getTime() - attachStartedAt,
            );
          }
          if (signal.aborted) break;
          asset.status = "complete";
          record.snapshot.completedCount += 1;
        } catch (error) {
          if (isAbortError(error, signal)) break;
          asset.status = "failed";
          asset.error = errorMessage(error);
          record.snapshot.errors.push({ asset: kind, message: asset.error });
        } finally {
          record.snapshot.timings[timingKey(kind)] = Math.max(
            0,
            this.now().getTime() - assetStartedAt,
          );
          this.touch(record);
        }
      }

      record.snapshot.currentAsset = null;
      if (signal.aborted) {
        record.snapshot.status = "cancelled";
        for (const asset of record.snapshot.assets) {
          if (
            asset.status === "waiting" ||
            asset.status === "waiting-for-night" ||
            asset.status === "generating" ||
            asset.status === "attaching"
          ) {
            asset.status = "skipped";
          }
        }
      } else if (record.snapshot.errors.length === 0) {
        record.snapshot.status = "completed";
      } else if (record.snapshot.completedCount > 0) {
        record.snapshot.status = "partial";
      } else {
        record.snapshot.status = "failed";
      }
    } catch (error) {
      record.snapshot.currentAsset = null;
      record.snapshot.status = signal.aborted ? "cancelled" : "failed";
      if (!signal.aborted) {
        record.snapshot.errors.push({
          asset: "night-studio",
          message: errorMessage(error),
        });
      }
    } finally {
      record.snapshot.finishedAt = this.now().toISOString();
      this.touch(record);
      console.info("[signal-artwork] background job finished", {
        jobId: record.snapshot.id,
        showId: record.snapshot.showId,
        status: record.snapshot.status,
        completedCount: record.snapshot.completedCount,
        errorCount: record.snapshot.errors.length,
        timings: record.snapshot.timings,
      });
      try {
        await record.start.releaseSlot();
      } catch (error) {
        console.error("[signal-artwork] could not release image slot", error);
      }
    }
  }
}
