"use client";

const KEY_DATABASE_NAME = "prism-browser-owner-vault-v1";
const KEY_DATABASE_VERSION = 1;
const KEY_STORE_NAME = "owner-keys";
const OWNER_KEY_DOMAIN = "prism-browser-owner-key-v1";
const RECORD_KEY_DOMAIN = "prism-browser-owner-record-v1";
const PAYLOAD_AAD_DOMAIN = "prism-browser-owner-payload-v1";
const AES_GCM_IV_BYTES = 12;

interface StoredBrowserOwnerKeyV1 {
  keyId: string;
  key: CryptoKey;
}

export interface BrowserOwnerVaultRecordV1 {
  v: 1;
  key: string;
  ownerKeyId: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  lastAccessedAt: number;
}

export interface BrowserOwnerVaultCoordinatesV1 {
  key: string;
  ownerKeyId: string;
}

const encoder = new TextEncoder();
const memoryOwnerKeys = new Map<string, CryptoKey>();
const ownerKeyPromises = new Map<string, Promise<CryptoKey | null>>();

function subtleCrypto(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

function nonEmpty(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Browser owner vault binding is empty.");
  return normalized;
}

function arrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function sha256Opaque(value: string): Promise<string | null> {
  const subtle = subtleCrypto();
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", encoder.encode(value));
  return base64Url(new Uint8Array(digest));
}

function openOwnerKeyDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(KEY_DATABASE_NAME, KEY_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) {
        database.createObjectStore(KEY_STORE_NAME, { keyPath: "keyId" });
      }
    });
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener("error", () => resolve(null), { once: true });
    request.addEventListener("blocked", () => resolve(null), { once: true });
  });
}

async function readPersistedOwnerKey(keyId: string): Promise<CryptoKey | null> {
  const database = await openOwnerKeyDatabase();
  if (!database) return null;
  const stored = await new Promise<StoredBrowserOwnerKeyV1 | null>((resolve) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readonly");
    const request = transaction.objectStore(KEY_STORE_NAME).get(keyId);
    request.addEventListener(
      "success",
      () => resolve((request.result as StoredBrowserOwnerKeyV1 | undefined) ?? null),
      { once: true },
    );
    request.addEventListener("error", () => resolve(null), { once: true });
  });
  database.close();
  return stored?.key ?? null;
}

async function addPersistedOwnerKey(
  keyId: string,
  key: CryptoKey,
): Promise<CryptoKey> {
  const database = await openOwnerKeyDatabase();
  if (!database) return key;
  const inserted = await new Promise<boolean>((resolve) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    const request = transaction.objectStore(KEY_STORE_NAME).add({ keyId, key });
    request.addEventListener("success", () => resolve(true), { once: true });
    request.addEventListener("error", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resolve(false);
    }, { once: true });
    transaction.addEventListener("abort", () => resolve(false), { once: true });
  });
  database.close();
  if (inserted) return key;
  return (await readPersistedOwnerKey(keyId)) ?? key;
}

async function ownerKeyId(ownerId: string): Promise<string | null> {
  return sha256Opaque(`${OWNER_KEY_DOMAIN}\u0000${nonEmpty(ownerId)}`);
}

async function getOrCreateOwnerKey(ownerId: string): Promise<CryptoKey | null> {
  const subtle = subtleCrypto();
  if (!subtle) return null;
  const keyId = await ownerKeyId(ownerId);
  if (!keyId) return null;
  const memory = memoryOwnerKeys.get(keyId);
  if (memory) return memory;
  const existingPromise = ownerKeyPromises.get(keyId);
  if (existingPromise) return existingPromise;
  const pending = (async (): Promise<CryptoKey | null> => {
    const persisted = await readPersistedOwnerKey(keyId);
    if (persisted) {
      memoryOwnerKeys.set(keyId, persisted);
      return persisted;
    }
    const generated = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const canonical = await addPersistedOwnerKey(keyId, generated);
    memoryOwnerKeys.set(keyId, canonical);
    return canonical;
  })().catch(() => null);
  ownerKeyPromises.set(keyId, pending);
  try {
    return await pending;
  } finally {
    ownerKeyPromises.delete(keyId);
  }
}

function payloadAad(
  ownerId: string,
  logicalStore: string,
  opaqueRecordKey: string,
): Uint8Array {
  return encoder.encode(
    `${PAYLOAD_AAD_DOMAIN}\u0000${nonEmpty(ownerId)}\u0000${nonEmpty(logicalStore)}\u0000${nonEmpty(opaqueRecordKey)}`,
  );
}

export async function browserOwnerVaultCoordinatesV1(args: {
  ownerId: string;
  logicalStore: string;
  logicalKey: string;
}): Promise<BrowserOwnerVaultCoordinatesV1 | null> {
  const normalizedOwnerId = nonEmpty(args.ownerId);
  const normalizedStore = nonEmpty(args.logicalStore);
  const normalizedKey = nonEmpty(args.logicalKey);
  const [keyId, recordId] = await Promise.all([
    ownerKeyId(normalizedOwnerId),
    sha256Opaque(
      `${RECORD_KEY_DOMAIN}\u0000${normalizedOwnerId}\u0000${normalizedStore}\u0000${normalizedKey}`,
    ),
  ]);
  if (!keyId || !recordId) return null;
  return { key: recordId, ownerKeyId: keyId };
}

export async function sealBrowserOwnerPayloadV1(args: {
  ownerId: string;
  logicalStore: string;
  logicalKey: string;
  plaintext: Uint8Array;
  lastAccessedAt?: number;
}): Promise<BrowserOwnerVaultRecordV1 | null> {
  const subtle = subtleCrypto();
  const [key, coordinates] = await Promise.all([
    getOrCreateOwnerKey(args.ownerId),
    browserOwnerVaultCoordinatesV1(args),
  ]);
  if (!subtle || !key || !coordinates) return null;
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: arrayBufferCopy(
        payloadAad(args.ownerId, args.logicalStore, coordinates.key),
      ),
    },
    key,
    arrayBufferCopy(args.plaintext),
  );
  return {
    v: 1,
    ...coordinates,
    iv: arrayBufferCopy(iv),
    ciphertext,
    lastAccessedAt: args.lastAccessedAt ?? Date.now(),
  };
}

export async function openBrowserOwnerPayloadV1(args: {
  ownerId: string;
  logicalStore: string;
  logicalKey: string;
  record: BrowserOwnerVaultRecordV1;
}): Promise<Uint8Array | null> {
  if (args.record.v !== 1) return null;
  const subtle = subtleCrypto();
  const [key, coordinates] = await Promise.all([
    getOrCreateOwnerKey(args.ownerId),
    browserOwnerVaultCoordinatesV1(args),
  ]);
  if (
    !subtle ||
    !key ||
    !coordinates ||
    coordinates.key !== args.record.key ||
    coordinates.ownerKeyId !== args.record.ownerKeyId
  ) {
    return null;
  }
  try {
    const plaintext = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(args.record.iv),
        additionalData: arrayBufferCopy(
          payloadAad(args.ownerId, args.logicalStore, coordinates.key),
        ),
      },
      key,
      args.record.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

export async function openEnumeratedBrowserOwnerPayloadV1(args: {
  ownerId: string;
  logicalStore: string;
  record: BrowserOwnerVaultRecordV1;
}): Promise<Uint8Array | null> {
  if (args.record.v !== 1) return null;
  const subtle = subtleCrypto();
  const [key, expectedOwnerKeyId] = await Promise.all([
    getOrCreateOwnerKey(args.ownerId),
    ownerKeyId(args.ownerId),
  ]);
  if (
    !subtle ||
    !key ||
    !expectedOwnerKeyId ||
    expectedOwnerKeyId !== args.record.ownerKeyId
  ) {
    return null;
  }
  try {
    const plaintext = await subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(args.record.iv),
        additionalData: arrayBufferCopy(
          payloadAad(args.ownerId, args.logicalStore, args.record.key),
        ),
      },
      key,
      args.record.ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

export async function deleteBrowserOwnerVaultKeyV1(ownerId: string): Promise<void> {
  const keyId = await ownerKeyId(ownerId);
  if (!keyId) return;
  const pending = ownerKeyPromises.get(keyId);
  if (pending) await pending.catch(() => null);
  ownerKeyPromises.delete(keyId);
  memoryOwnerKeys.delete(keyId);
  const database = await openOwnerKeyDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(KEY_STORE_NAME, "readwrite");
    transaction.objectStore(KEY_STORE_NAME).delete(keyId);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("error", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => resolve(), { once: true });
  });
  database.close();
}
