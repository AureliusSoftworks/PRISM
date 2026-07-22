import { randomUUID } from "node:crypto";

export type SignalArtworkAssetKind =
  | "night-studio"
  | "day-studio"
  | "studio-lighting"
  | "logo";

export type SignalArtworkGenerationKind = Exclude<
  SignalArtworkAssetKind,
  "studio-lighting"
>;

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
  studioLightingMs: number | null;
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
  totalCount: number;
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
  kinds?: readonly SignalArtworkGenerationKind[];
  studioLightingOnly?: boolean;
  sourceNightImageId?: string | null;
  parallelIndependentAssets?: boolean;
  controller?: AbortController;
  acquireSlot?: (signal: AbortSignal) => Promise<void>;
  releaseSlot: () => Promise<void>;
  generate?: (
    kind: SignalArtworkGenerationKind,
    sourceNightImageId: string | null,
    signal: AbortSignal,
  ) => Promise<SignalArtworkGeneratedAsset>;
  attach?: (
    kind: SignalArtworkGenerationKind,
    asset: SignalArtworkGeneratedAsset,
  ) => Promise<void>;
  refreshStudioLighting?: (
    signal: AbortSignal,
  ) => Promise<SignalArtworkGeneratedAsset>;
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

export const SIGNAL_ARTWORK_ASSET_ORDER: readonly SignalArtworkGenerationKind[] =
  ["night-studio", "day-studio", "logo"];

export function normalizeSignalArtworkAssetKinds(
  kinds: unknown,
): SignalArtworkGenerationKind[] {
  if (kinds === undefined) return [...SIGNAL_ARTWORK_ASSET_ORDER];
  if (!Array.isArray(kinds)) return [];
  const requested = new Set(kinds);
  return SIGNAL_ARTWORK_ASSET_ORDER.filter((kind) => requested.has(kind));
}

function timingKey(
  kind: SignalArtworkGenerationKind,
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

    const studioLightingOnly = input.studioLightingOnly === true;
    const kinds = studioLightingOnly
      ? []
      : normalizeSignalArtworkAssetKinds(input.kinds);
    if (kinds.length === 0 && !studioLightingOnly) {
      throw new Error("Choose at least one Signal artwork asset.");
    }
    if (studioLightingOnly && !input.refreshStudioLighting) {
      throw new Error("Studio lighting refresh is not configured.");
    }
    const timestamp = this.now().toISOString();
    const waitsForNewNight =
      kinds.includes("day-studio") &&
      kinds.includes("night-studio") &&
      !input.sourceNightImageId;
    const includesStudioLighting =
      Boolean(input.refreshStudioLighting) &&
      (studioLightingOnly ||
        kinds.includes("night-studio") ||
        kinds.includes("day-studio"));
    const assets: SignalArtworkAssetKind[] = studioLightingOnly
      ? ["studio-lighting"]
      : includesStudioLighting
        ? [
          ...kinds.filter((kind) => kind !== "logo"),
          "studio-lighting",
          ...kinds.filter((kind) => kind === "logo"),
          ]
        : kinds;
    const snapshot: SignalArtworkJobSnapshot = {
      id: this.id(),
      showId: input.showId,
      showName: input.showName,
      status: "running",
      currentAsset: input.acquireSlot
        ? null
        : studioLightingOnly
          ? "studio-lighting"
          : kinds[0] ?? null,
      completedCount: 0,
      totalCount: assets.length,
      assets: assets.map((kind) => ({
        kind,
        status:
          kind === "day-studio" && waitsForNewNight
            ? "waiting-for-night"
            : "waiting",
        error: null,
        imageId: null,
      })),
      errors: [],
      timings: {
        identityMs:
          typeof input.identityMs === "number" && Number.isFinite(input.identityMs)
            ? Math.max(0, Math.round(input.identityMs))
            : null,
        nightStudioMs: null,
        dayRelightMs: null,
        studioLightingMs: null,
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

  hasActiveJobForUser(userId: string): boolean {
    const record = this.getLatestRecord(userId);
    return Boolean(record && !isTerminal(record.snapshot.status));
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

  private refreshCurrentAsset(record: SignalArtworkJobRecord): void {
    record.snapshot.currentAsset =
      record.snapshot.assets.find(
        (asset) => asset.status === "generating" || asset.status === "attaching",
      )?.kind ?? null;
  }

  private async run(record: SignalArtworkJobRecord): Promise<void> {
    const requestedKinds = new Set(
      record.snapshot.assets
        .map((asset) => asset.kind)
        .filter(
          (kind): kind is SignalArtworkGenerationKind =>
            kind !== "studio-lighting",
        ),
    );
    let canonicalNightImageId = record.start.sourceNightImageId ?? null;
    const signal = record.controller.signal;
    let slotAcquired = !record.start.acquireSlot;
    try {
      if (record.start.acquireSlot) {
        await record.start.acquireSlot(signal);
        slotAcquired = true;
      }
      if (signal.aborted) return;
      const runAsset = async (
        kind: SignalArtworkGenerationKind,
        sourceNightImageId: string | null,
      ): Promise<SignalArtworkGeneratedAsset | null> => {
        if (signal.aborted) return null;
        const asset = this.asset(record, kind);
        asset.status = "generating";
        this.refreshCurrentAsset(record);
        this.touch(record);
        const assetStartedAt = this.now().getTime();
        let generated: SignalArtworkGeneratedAsset | null = null;
        try {
          if (!record.start.generate || !record.start.attach) {
            throw new Error("Signal artwork generation is not configured.");
          }
          generated = await record.start.generate(
            kind,
            sourceNightImageId,
            signal,
          );
          if (signal.aborted) return generated;
          asset.imageId = generated.imageId;
          record.snapshot.timings.downloadMs += Math.max(
            0,
            Math.round(generated.timings?.downloadMs ?? 0),
          );
          record.snapshot.timings.localPersistenceMs += Math.max(
            0,
            Math.round(generated.timings?.localPersistenceMs ?? 0),
          );
          asset.status = "attaching";
          this.refreshCurrentAsset(record);
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
          if (signal.aborted) return generated;
          asset.status = "complete";
          record.snapshot.completedCount += 1;
        } catch (error) {
          if (!isAbortError(error, signal)) {
            asset.status = "failed";
            asset.error = errorMessage(error);
            record.snapshot.errors.push({ asset: kind, message: asset.error });
          }
        } finally {
          record.snapshot.timings[timingKey(kind)] = Math.max(
            0,
            this.now().getTime() - assetStartedAt,
          );
          this.refreshCurrentAsset(record);
          this.touch(record);
        }
        return generated;
      };

      const runStudioChain = async (): Promise<void> => {
        if (requestedKinds.has("night-studio")) {
          const generatedNight = await runAsset("night-studio", null);
          canonicalNightImageId = generatedNight?.imageId ?? null;
          const dayAsset = record.snapshot.assets.find(
            (asset) => asset.kind === "day-studio",
          );
          if (canonicalNightImageId && dayAsset?.status === "waiting-for-night") {
            dayAsset.status = "waiting";
            this.touch(record);
          }
        }
        if (requestedKinds.has("day-studio") && !signal.aborted) {
          if (!canonicalNightImageId) {
            const asset = this.asset(record, "day-studio");
            asset.status = "skipped";
            asset.error =
              "The Dark studio did not finish, so the Light relight could not start.";
            record.snapshot.errors.push({
              asset: "day-studio",
              message: asset.error,
            });
            this.touch(record);
          } else {
            await runAsset("day-studio", canonicalNightImageId);
          }
        }

        if (!record.start.refreshStudioLighting || signal.aborted) return;
        const completedStudioCount = record.snapshot.assets.filter(
          (asset) =>
            (asset.kind === "night-studio" || asset.kind === "day-studio") &&
            asset.status === "complete",
        ).length;
        const lightingAsset = this.asset(record, "studio-lighting");
        if (!record.start.studioLightingOnly && completedStudioCount === 0) {
          lightingAsset.status = "skipped";
          this.touch(record);
          return;
        }
        lightingAsset.status = "generating";
        this.refreshCurrentAsset(record);
        this.touch(record);
        const lightingStartedAt = this.now().getTime();
        try {
          const lighting = await record.start.refreshStudioLighting(signal);
          if (signal.aborted) return;
          lightingAsset.imageId = lighting.imageId;
          lightingAsset.status = "complete";
          record.snapshot.completedCount += 1;
        } catch (error) {
          if (!isAbortError(error, signal)) {
            lightingAsset.status = "failed";
            lightingAsset.error = record.start.studioLightingOnly
              ? `Studio lighting could not be rebuilt: ${errorMessage(error)}`
              : `Studio artwork is ready, but its lighting map could not be rebuilt: ${errorMessage(error)}`;
            record.snapshot.errors.push({
              asset: "studio-lighting",
              message: lightingAsset.error,
            });
          }
        } finally {
          record.snapshot.timings.studioLightingMs = Math.max(
            0,
            this.now().getTime() - lightingStartedAt,
          );
          this.refreshCurrentAsset(record);
          this.touch(record);
        }
      };

      const hasStudioWork =
        record.start.studioLightingOnly === true ||
        requestedKinds.has("night-studio") ||
        requestedKinds.has("day-studio");
      const hasLogoWork = requestedKinds.has("logo");
      if (
        record.start.parallelIndependentAssets &&
        hasStudioWork &&
        hasLogoWork
      ) {
        await Promise.all([runStudioChain(), runAsset("logo", null)]);
      } else {
        if (hasStudioWork) await runStudioChain();
        if (hasLogoWork && !signal.aborted) await runAsset("logo", null);
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
      if (signal.aborted) {
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
      }
      if (!signal.aborted) {
        record.snapshot.errors.push({
          asset: record.snapshot.assets[0]?.kind ?? "logo",
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
      if (slotAcquired) {
        try {
          await record.start.releaseSlot();
        } catch (error) {
          console.error("[signal-artwork] could not release image slot", error);
        }
      }
    }
  }
}
