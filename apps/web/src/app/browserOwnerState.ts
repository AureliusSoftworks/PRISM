"use client";

import {
  browserOwnerVaultCoordinatesV1,
  openBrowserOwnerPayloadV1,
  sealBrowserOwnerPayloadV1,
  type BrowserOwnerVaultRecordV1,
} from "./browserOwnerVault";

const STATE_DATABASE_NAME = "prism-browser-owner-state-v1";
const STATE_DATABASE_VERSION = 1;
const STATE_STORE_NAME = "encrypted-state";
const LOGICAL_STORE = "account-state";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const memoryRecords = new Map<string, BrowserOwnerVaultRecordV1>();

function openStateDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(STATE_DATABASE_NAME, STATE_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE_NAME)) {
        database.createObjectStore(STATE_STORE_NAME, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener("error", () => resolve(null), { once: true });
    request.addEventListener("blocked", () => resolve(null), { once: true });
  });
}

async function readRecord(
  key: string,
): Promise<BrowserOwnerVaultRecordV1 | null> {
  const memory = memoryRecords.get(key);
  if (memory) return memory;
  const database = await openStateDatabase();
  if (!database) return null;
  const record = await new Promise<BrowserOwnerVaultRecordV1 | null>(
    (resolve) => {
      const transaction = database.transaction(STATE_STORE_NAME, "readonly");
      const request = transaction.objectStore(STATE_STORE_NAME).get(key);
      request.addEventListener(
        "success",
        () =>
          resolve(
            (request.result as BrowserOwnerVaultRecordV1 | undefined) ?? null,
          ),
        { once: true },
      );
      request.addEventListener("error", () => resolve(null), { once: true });
    },
  );
  database.close();
  if (record) memoryRecords.set(key, record);
  return record;
}

async function storeRecord(record: BrowserOwnerVaultRecordV1): Promise<void> {
  memoryRecords.set(record.key, record);
  const database = await openStateDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STATE_STORE_NAME, "readwrite");
    transaction.objectStore(STATE_STORE_NAME).put(record);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
  });
  database.close();
}

async function deleteRecord(key: string): Promise<void> {
  memoryRecords.delete(key);
  const database = await openStateDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STATE_STORE_NAME, "readwrite");
    transaction.objectStore(STATE_STORE_NAME).delete(key);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
  });
  database.close();
}

async function readAllRecords(): Promise<BrowserOwnerVaultRecordV1[]> {
  const database = await openStateDatabase();
  if (!database) return [...memoryRecords.values()];
  const records = await new Promise<BrowserOwnerVaultRecordV1[]>((resolve) => {
    const transaction = database.transaction(STATE_STORE_NAME, "readonly");
    const request = transaction.objectStore(STATE_STORE_NAME).getAll();
    request.addEventListener(
      "success",
      () => resolve((request.result as BrowserOwnerVaultRecordV1[]) ?? []),
      { once: true },
    );
    request.addEventListener("error", () => resolve([]), { once: true });
  });
  database.close();
  return records;
}

export async function readBrowserOwnerJsonV1<T>(args: {
  ownerId: string;
  logicalKey: string;
}): Promise<T | null> {
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId: args.ownerId,
    logicalStore: LOGICAL_STORE,
    logicalKey: args.logicalKey,
  });
  if (!coordinates) return null;
  const record = await readRecord(coordinates.key);
  if (!record) return null;
  const plaintext = await openBrowserOwnerPayloadV1({
    ownerId: args.ownerId,
    logicalStore: LOGICAL_STORE,
    logicalKey: args.logicalKey,
    record,
  });
  if (!plaintext) return null;
  try {
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export async function writeBrowserOwnerJsonV1(args: {
  ownerId: string;
  logicalKey: string;
  value: unknown;
}): Promise<boolean> {
  let plaintext: Uint8Array;
  try {
    plaintext = encoder.encode(JSON.stringify(args.value));
  } catch {
    return false;
  }
  const record = await sealBrowserOwnerPayloadV1({
    ownerId: args.ownerId,
    logicalStore: LOGICAL_STORE,
    logicalKey: args.logicalKey,
    plaintext,
  });
  if (!record) return false;
  await storeRecord(record);
  return true;
}

export async function deleteBrowserOwnerJsonV1(args: {
  ownerId: string;
  logicalKey: string;
}): Promise<void> {
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId: args.ownerId,
    logicalStore: LOGICAL_STORE,
    logicalKey: args.logicalKey,
  });
  if (coordinates) await deleteRecord(coordinates.key);
}

export async function deleteAllBrowserOwnerStateV1(
  ownerId: string,
): Promise<void> {
  const coordinates = await browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: LOGICAL_STORE,
    logicalKey: "owner-purge-sentinel",
  });
  if (!coordinates) return;
  const records = await readAllRecords();
  await Promise.all(
    records
      .filter((record) => record.ownerKeyId === coordinates.ownerKeyId)
      .map((record) => deleteRecord(record.key)),
  );
}

/**
 * Imports a legacy plaintext JSON value once, then removes every supplied
 * plaintext key. Existing encrypted state always wins. Invalid legacy content
 * is discarded rather than copied into another account's state.
 */
export async function readOrMigrateBrowserOwnerJsonV1<T>(args: {
  ownerId: string;
  logicalKey: string;
  legacyStorage?: Pick<Storage, "getItem" | "removeItem"> | null;
  legacyKeys?: readonly string[];
}): Promise<T | null> {
  const existing = await readBrowserOwnerJsonV1<T>(args);
  const legacyKeys = args.legacyKeys ?? [];
  if (existing !== null) {
    for (const key of legacyKeys) {
      try {
        args.legacyStorage?.removeItem(key);
      } catch {
        // The encrypted value remains authoritative.
      }
    }
    return existing;
  }

  let migrated: T | null = null;
  for (const key of legacyKeys) {
    try {
      const raw = args.legacyStorage?.getItem(key);
      if (raw && migrated === null) migrated = JSON.parse(raw) as T;
    } catch {
      // Malformed or inaccessible plaintext state is not retained.
    }
  }
  if (migrated !== null) {
    const stored = await writeBrowserOwnerJsonV1({
      ownerId: args.ownerId,
      logicalKey: args.logicalKey,
      value: migrated,
    });
    if (!stored) return migrated;
  }
  for (const key of legacyKeys) {
    try {
      args.legacyStorage?.removeItem(key);
    } catch {
      // Best effort cleanup when browser storage is unavailable.
    }
  }
  return migrated;
}
