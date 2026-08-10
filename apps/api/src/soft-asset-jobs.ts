import { randomUUID } from "node:crypto";
import {
  SOFT_ASSET_JOB_SCHEMA_VERSION,
  softAssetJobIsActive,
  type SoftAssetJobAppletV1,
  type SoftAssetJobDestinationV1,
  type SoftAssetJobSnapshotV1,
} from "@localai/shared";

export type SoftAssetGeneratedImageV1 = {
  imageId: string;
};

export type SoftAssetJobStartV1 = {
  userId: string;
  requestId: string;
  applet: SoftAssetJobAppletV1;
  title: string;
  destinationLabel: string;
  destination: SoftAssetJobDestinationV1;
  controller?: AbortController;
  acquire?: (signal: AbortSignal) => Promise<void>;
  generate: (signal: AbortSignal) => Promise<SoftAssetGeneratedImageV1>;
  attach: (
    image: SoftAssetGeneratedImageV1,
    signal: AbortSignal,
  ) => Promise<void>;
  release?: () => Promise<void>;
};

type SoftAssetJobRecord = {
  userId: string;
  snapshot: SoftAssetJobSnapshotV1;
  controller: AbortController;
  start: SoftAssetJobStartV1;
};

const TERMINAL_JOB_LIMIT_PER_USER = 24;

function destinationKey(destination: SoftAssetJobDestinationV1): string {
  return `${destination.kind}:${destination.sessionId}:${destination.exhibitId}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Asset synthesis failed.";
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export class SoftAssetJobConflictError extends Error {
  readonly job: SoftAssetJobSnapshotV1;

  constructor(message: string, job: SoftAssetJobSnapshotV1) {
    super(message);
    this.name = "SoftAssetJobConflictError";
    this.job = structuredClone(job);
  }
}

export class SoftAssetJobManager {
  private readonly jobs = new Map<string, SoftAssetJobRecord>();
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    now: () => Date = () => new Date(),
    id: () => string = () => randomUUID(),
  ) {
    this.now = now;
    this.id = id;
  }

  start(input: SoftAssetJobStartV1): SoftAssetJobSnapshotV1 {
    const idempotent = this.recordsForUser(input.userId).find(
      (record) => record.snapshot.requestId === input.requestId,
    );
    if (idempotent) return this.clone(idempotent.snapshot);

    const key = destinationKey(input.destination);
    const activeForDestination = this.recordsForUser(input.userId).find(
      (record) =>
        softAssetJobIsActive(record.snapshot) &&
        destinationKey(record.snapshot.destination) === key,
    );
    if (activeForDestination) {
      throw new SoftAssetJobConflictError(
        "That asset is already synthesizing softly with Prism.",
        activeForDestination.snapshot,
      );
    }

    this.trimTerminalJobs(input.userId);
    const timestamp = this.now().toISOString();
    const snapshot: SoftAssetJobSnapshotV1 = {
      version: SOFT_ASSET_JOB_SCHEMA_VERSION,
      id: this.id(),
      requestId: input.requestId,
      applet: input.applet,
      title: input.title,
      destinationLabel: input.destinationLabel,
      destination: structuredClone(input.destination),
      status: "queued",
      imageId: null,
      error: null,
      startedAt: timestamp,
      updatedAt: timestamp,
      finishedAt: null,
    };
    const record: SoftAssetJobRecord = {
      userId: input.userId,
      snapshot,
      controller: input.controller ?? new AbortController(),
      start: input,
    };
    this.jobs.set(snapshot.id, record);
    void this.run(record);
    return this.clone(snapshot);
  }

  list(userId: string): SoftAssetJobSnapshotV1[] {
    return this.recordsForUser(userId)
      .map((record) => this.clone(record.snapshot))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  get(userId: string, jobId: string): SoftAssetJobSnapshotV1 | null {
    const record = this.jobs.get(jobId);
    return record?.userId === userId ? this.clone(record.snapshot) : null;
  }

  cancel(userId: string, jobId: string): SoftAssetJobSnapshotV1 | null {
    const record = this.jobs.get(jobId);
    if (!record || record.userId !== userId) return null;
    if (softAssetJobIsActive(record.snapshot)) {
      record.snapshot.status = "cancelling";
      this.touch(record);
      record.controller.abort();
    }
    return this.clone(record.snapshot);
  }

  dismiss(userId: string, jobId: string): boolean {
    const record = this.jobs.get(jobId);
    if (
      !record ||
      record.userId !== userId ||
      softAssetJobIsActive(record.snapshot)
    ) {
      return false;
    }
    this.jobs.delete(jobId);
    return true;
  }

  private recordsForUser(userId: string): SoftAssetJobRecord[] {
    return [...this.jobs.values()].filter((record) => record.userId === userId);
  }

  private trimTerminalJobs(userId: string): void {
    const terminal = this.recordsForUser(userId)
      .filter((record) => !softAssetJobIsActive(record.snapshot))
      .sort((left, right) =>
        right.snapshot.updatedAt.localeCompare(left.snapshot.updatedAt),
      );
    for (const record of terminal.slice(TERMINAL_JOB_LIMIT_PER_USER - 1)) {
      this.jobs.delete(record.snapshot.id);
    }
  }

  private touch(record: SoftAssetJobRecord): void {
    record.snapshot.updatedAt = this.now().toISOString();
  }

  private clone(snapshot: SoftAssetJobSnapshotV1): SoftAssetJobSnapshotV1 {
    return structuredClone(snapshot);
  }

  private async run(record: SoftAssetJobRecord): Promise<void> {
    const signal = record.controller.signal;
    let acquired = record.start.acquire == null;
    let attached = false;
    try {
      if (record.start.acquire) {
        await record.start.acquire(signal);
        acquired = true;
      }
      if (signal.aborted) {
        throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      }
      record.snapshot.status = "generating";
      this.touch(record);
      const image = await record.start.generate(signal);
      record.snapshot.imageId = image.imageId;
      if (signal.aborted) {
        throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      }
      record.snapshot.status = "attaching";
      this.touch(record);
      await record.start.attach(image, signal);
      attached = true;
      record.snapshot.status = "succeeded";
    } catch (error) {
      if (isAbortError(error, signal) && !attached) {
        record.snapshot.status = "cancelled";
      } else {
        record.snapshot.status = "failed";
        record.snapshot.error = errorMessage(error);
      }
    } finally {
      record.snapshot.finishedAt = this.now().toISOString();
      this.touch(record);
      if (acquired && record.start.release) {
        try {
          await record.start.release();
        } catch (error) {
          console.error("[soft-asset-jobs] could not release image slot", error);
        }
      }
    }
  }
}
