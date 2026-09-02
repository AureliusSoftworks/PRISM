"use client";

import type { ReplayManifestV2, ReplaySurfaceV1 } from "@localai/shared";
import {
  browserOwnerVaultCoordinatesV1,
  openEnumeratedBrowserOwnerPayloadV1,
  sealBrowserOwnerPayloadV1,
  type BrowserOwnerVaultRecordV1,
} from "./browserOwnerVault.ts";

export interface PendingFaithfulReplayCapture {
  ownerId: string;
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
const DATABASE_VERSION = 2;
const STORE_NAME = "pending-captures";
const REPLAY_CAPTURE_VAULT_STORE = "pending-faithful-replays-v2";
const memoryFallback = new Map<string, BrowserOwnerVaultRecordV1>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function pendingCaptureKey(
  surface: ReplaySurfaceV1,
  sourceId: string,
): string {
  return `${surface}:${sourceId}`;
}

interface SerializedPendingFaithfulReplayCapture {
  ownerId: string;
  surface: ReplaySurfaceV1;
  sourceId: string;
  recordingId: string | null;
  contentType: string | null;
  durationMs: number | null;
  manifest: ReplayManifestV2;
  updatedAt: string;
}

function serializePendingCapture(
  pending: PendingFaithfulReplayCapture,
): Uint8Array {
  const metadata: SerializedPendingFaithfulReplayCapture = {
    ownerId: pending.ownerId,
    surface: pending.surface,
    sourceId: pending.sourceId,
    recordingId: pending.recordingId,
    contentType: pending.contentType,
    durationMs: pending.durationMs,
    manifest: pending.manifest,
    updatedAt: pending.updatedAt,
  };
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const audioBytes = pending.bytes ? new Uint8Array(pending.bytes) : null;
  const serialized = new Uint8Array(
    4 + metadataBytes.byteLength + (audioBytes?.byteLength ?? 0),
  );
  new DataView(serialized.buffer).setUint32(0, metadataBytes.byteLength, false);
  serialized.set(metadataBytes, 4);
  if (audioBytes) serialized.set(audioBytes, 4 + metadataBytes.byteLength);
  return serialized;
}

function deserializePendingCapture(
  ownerId: string,
  plaintext: Uint8Array,
): PendingFaithfulReplayCapture | null {
  if (plaintext.byteLength < 4) return null;
  const metadataLength = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  ).getUint32(0, false);
  if (metadataLength > plaintext.byteLength - 4) return null;
  try {
    const metadata = JSON.parse(
      decoder.decode(plaintext.subarray(4, 4 + metadataLength)),
    ) as SerializedPendingFaithfulReplayCapture;
    if (
      metadata.ownerId !== ownerId
    ) {
      return null;
    }
    const key = pendingCaptureKey(metadata.surface, metadata.sourceId);
    const bytes = plaintext.subarray(4 + metadataLength);
    return {
      ...metadata,
      key,
      bytes:
        bytes.byteLength > 0
          ? (bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer)
          : null,
    };
  } catch {
    return null;
  }
}

function memoryKey(record: BrowserOwnerVaultRecordV1): string {
  return `${record.ownerKeyId}:${record.key}`;
}

function openPendingCaptureDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", (event) => {
      const database = request.result;
      if (
        (event as IDBVersionChangeEvent).oldVersion < DATABASE_VERSION &&
        database.objectStoreNames.contains(STORE_NAME)
      ) {
        // V1 records had no owner. They cannot be assigned safely, so fail closed.
        database.deleteObjectStore(STORE_NAME);
      }
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
  ownerId: string;
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
  const stored = await sealBrowserOwnerPayloadV1({
    ownerId: args.ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    logicalKey: pending.key,
    plaintext: serializePendingCapture(pending),
  });
  if (!stored) return pending;
  memoryFallback.set(memoryKey(stored), stored);
  const database = await openPendingCaptureDatabase();
  if (!database) return pending;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(stored);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
  return pending;
}

export async function pendingFaithfulReplayCaptures(ownerId: string): Promise<
  PendingFaithfulReplayCapture[]
> {
  const ownerCoordinates = await browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    logicalKey: "owner-probe",
  });
  if (!ownerCoordinates) return [];
  const database = await openPendingCaptureDatabase();
  const persistedRows = database
    ? await new Promise<BrowserOwnerVaultRecordV1[]>((resolve) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.addEventListener(
      "success",
          () => resolve(request.result as BrowserOwnerVaultRecordV1[]),
      { once: true },
    );
    request.addEventListener("error", () => resolve([]), { once: true });
      })
    : [];
  database?.close();
  const storedRows = new Map<string, BrowserOwnerVaultRecordV1>();
  for (const stored of [...persistedRows, ...memoryFallback.values()]) {
    storedRows.set(memoryKey(stored), stored);
  }
  const rows: PendingFaithfulReplayCapture[] = [];
  for (const stored of storedRows.values()) {
    if (stored.ownerKeyId !== ownerCoordinates.ownerKeyId) continue;
    const memoryStored = memoryFallback.get(memoryKey(stored)) ?? stored;
    const logicalCandidates = await pendingCaptureLogicalKeysForOwnerRecord(
      ownerId,
      memoryStored,
    );
    if (!logicalCandidates) continue;
    memoryFallback.set(memoryKey(memoryStored), memoryStored);
    rows.push(logicalCandidates);
  }
  return rows;
}

async function pendingCaptureLogicalKeysForOwnerRecord(
  ownerId: string,
  stored: BrowserOwnerVaultRecordV1,
): Promise<PendingFaithfulReplayCapture | null> {
  const wrapper = await openEnumeratedBrowserOwnerPayloadV1({
    ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    record: stored,
  });
  if (!wrapper) return null;
  const pending = deserializePendingCapture(ownerId, wrapper);
  if (!pending) return null;
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    logicalKey: pending.key,
  });
  return coordinates?.key === stored.key ? pending : null;
}

export async function discardPendingFaithfulReplayCapture(
  ownerId: string,
  surface: ReplaySurfaceV1,
  sourceId: string,
): Promise<void> {
  const key = pendingCaptureKey(surface, sourceId);
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    logicalKey: key,
  });
  if (!coordinates) return;
  memoryFallback.delete(`${coordinates.ownerKeyId}:${coordinates.key}`);
  const database = await openPendingCaptureDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(coordinates.key);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
}

export async function purgePendingFaithfulReplayCapturesForOwner(
  ownerId: string,
): Promise<void> {
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: REPLAY_CAPTURE_VAULT_STORE,
    logicalKey: "owner-purge",
  });
  if (!coordinates) return;
  for (const [key, record] of memoryFallback.entries()) {
    if (record.ownerKeyId === coordinates.ownerKeyId) memoryFallback.delete(key);
  }
  const database = await openPendingCaptureDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.addEventListener("success", () => {
      for (const record of request.result as BrowserOwnerVaultRecordV1[]) {
        if (record.ownerKeyId === coordinates.ownerKeyId) store.delete(record.key);
      }
    }, { once: true });
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
}
