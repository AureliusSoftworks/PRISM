"use client";

import type { ReplayManifestV2, ReplaySurfaceV1 } from "@localai/shared";

export interface PendingFaithfulReplayCapture {
  key: string;
  surface: ReplaySurfaceV1;
  sourceId: string;
  recordingId: string | null;
  bytes: ArrayBuffer | null;
  contentType: string | null;
  durationMs: number | null;
  manifest: ReplayManifestV2;
  updatedAt: string;
}

const DATABASE_NAME = "prism-faithful-replays";
const DATABASE_VERSION = 1;
const STORE_NAME = "pending-captures";
const memoryFallback = new Map<string, PendingFaithfulReplayCapture>();

function pendingCaptureKey(
  surface: ReplaySurfaceV1,
  sourceId: string,
): string {
  return `${surface}:${sourceId}`;
}

function openPendingCaptureDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener("error", () => resolve(null), { once: true });
    request.addEventListener("blocked", () => resolve(null), { once: true });
  });
}

export async function retainPendingFaithfulReplayCapture(args: {
  surface: ReplaySurfaceV1;
  sourceId: string;
  recordingId: string | null;
  bytes: ArrayBuffer | null;
  contentType: string | null;
  durationMs: number | null;
  manifest: ReplayManifestV2;
}): Promise<PendingFaithfulReplayCapture> {
  const pending: PendingFaithfulReplayCapture = {
    ...args,
    key: pendingCaptureKey(args.surface, args.sourceId),
    bytes: args.bytes?.slice(0) ?? null,
    updatedAt: new Date().toISOString(),
  };
  memoryFallback.set(pending.key, pending);
  const database = await openPendingCaptureDatabase();
  if (!database) return pending;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(pending);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
  return pending;
}

export async function pendingFaithfulReplayCaptures(): Promise<
  PendingFaithfulReplayCapture[]
> {
  const database = await openPendingCaptureDatabase();
  if (!database) return [...memoryFallback.values()];
  const rows = await new Promise<PendingFaithfulReplayCapture[]>((resolve) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.addEventListener(
      "success",
      () => resolve(request.result as PendingFaithfulReplayCapture[]),
      { once: true },
    );
    request.addEventListener("error", () => resolve([]), { once: true });
  });
  database.close();
  for (const row of rows) memoryFallback.set(row.key, row);
  return rows;
}

export async function discardPendingFaithfulReplayCapture(
  surface: ReplaySurfaceV1,
  sourceId: string,
): Promise<void> {
  const key = pendingCaptureKey(surface, sourceId);
  memoryFallback.delete(key);
  const database = await openPendingCaptureDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
}
