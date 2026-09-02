import {
  LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import type { EnglishVoiceSynthesisClip } from "./englishVoice";
import {
  browserOwnerVaultCoordinatesV1,
  openBrowserOwnerPayloadV1,
  sealBrowserOwnerPayloadV1,
  type BrowserOwnerVaultRecordV1,
} from "./browserOwnerVault.ts";

const RESPONSE_CUE_DB_NAME = "prism-response-cues-v1";
const RESPONSE_CUE_STORE = "clips";
const RESPONSE_CUE_DB_VERSION = 2;
const RESPONSE_CUE_VAULT_STORE = "response-cue-clips-v2";
const RESPONSE_CUE_CACHE_MAX_ENTRIES = 48;

export interface ResponseCueVoiceCacheKeyInput {
  ownerId: string;
  botId: string;
  voiceProfile: BotAudioVoiceProfileV1;
  engine: string;
  model?: string | null;
  phrase: string;
  deliverySettings?: Record<string, unknown>;
}

interface SerializedResponseCueClip {
  alignment: EnglishVoiceSynthesisClip["alignment"];
  audioContentType: string;
  engineUsed: string | null;
  localEngine?: string | null;
  modelHash?: string | null;
  notice?: string | null;
  resolvedPronunciation?: EnglishVoiceSynthesisClip["resolvedPronunciation"];
  resolvedSpeechprint?: EnglishVoiceSynthesisClip["resolvedSpeechprint"];
}

const memoryFallback = new Map<string, BrowserOwnerVaultRecordV1>();
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function responseCueVoiceCacheKey(
  input: ResponseCueVoiceCacheKeyInput,
): string {
  return stableJson({
    v: 2,
    ownerId: input.ownerId,
    botId: input.botId,
    voiceProfile: normalizeBotAudioVoiceProfileV1(input.voiceProfile),
    speechprintRuleset: LOCAL_VOICE_SPEECHPRINT_RULESET_SHA256,
    engine: input.engine,
    model: input.model ?? null,
    phrase: input.phrase.replace(/\s+/gu, " ").trim(),
    deliverySettings: input.deliverySettings ?? {},
  });
}

function openResponseCueDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(RESPONSE_CUE_DB_NAME, RESPONSE_CUE_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (
        (event as IDBVersionChangeEvent).oldVersion < RESPONSE_CUE_DB_VERSION &&
        database.objectStoreNames.contains(RESPONSE_CUE_STORE)
      ) {
        database.deleteObjectStore(RESPONSE_CUE_STORE);
      }
      if (!database.objectStoreNames.contains(RESPONSE_CUE_STORE)) {
        database.createObjectStore(RESPONSE_CUE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function serializeResponseCueClip(clip: EnglishVoiceSynthesisClip): Uint8Array {
  const metadata: SerializedResponseCueClip = {
    alignment: clip.alignment,
    audioContentType: clip.audioContentType,
    engineUsed: clip.engineUsed,
    localEngine: clip.localEngine,
    modelHash: clip.modelHash,
    notice: clip.notice,
    resolvedPronunciation: clip.resolvedPronunciation,
    resolvedSpeechprint: clip.resolvedSpeechprint,
  };
  const metadataBytes = encoder.encode(JSON.stringify(metadata));
  const bytes = new Uint8Array(clip.bytes);
  const serialized = new Uint8Array(4 + metadataBytes.length + bytes.length);
  new DataView(serialized.buffer).setUint32(0, metadataBytes.length, false);
  serialized.set(metadataBytes, 4);
  serialized.set(bytes, 4 + metadataBytes.length);
  return serialized;
}

function deserializeResponseCueClip(
  plaintext: Uint8Array,
): EnglishVoiceSynthesisClip | null {
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
    ) as SerializedResponseCueClip;
    const bytes = plaintext.subarray(4 + metadataLength);
    return {
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      alignment: metadata.alignment,
      audioContentType: metadata.audioContentType,
      engineUsed: metadata.engineUsed,
      localEngine: metadata.localEngine,
      modelHash: metadata.modelHash,
      notice: metadata.notice,
      resolvedPronunciation: metadata.resolvedPronunciation,
      resolvedSpeechprint: metadata.resolvedSpeechprint,
    };
  } catch {
    return null;
  }
}

async function storedClipAsEnglishClip(args: {
  ownerId: string;
  key: string;
  stored: BrowserOwnerVaultRecordV1;
}): Promise<EnglishVoiceSynthesisClip | null> {
  const plaintext = await openBrowserOwnerPayloadV1({
    ownerId: args.ownerId,
    logicalStore: RESPONSE_CUE_VAULT_STORE,
    logicalKey: args.key,
    record: args.stored,
  });
  return plaintext ? deserializeResponseCueClip(plaintext) : null;
}

async function responseCueRecordCoordinates(ownerId: string, key: string) {
  return browserOwnerVaultCoordinatesV1({
    ownerId,
    logicalStore: RESPONSE_CUE_VAULT_STORE,
    logicalKey: key,
  });
}

function memoryKey(record: BrowserOwnerVaultRecordV1): string {
  return `${record.ownerKeyId}:${record.key}`;
}

function touchStoredRecord(
  stored: BrowserOwnerVaultRecordV1,
): BrowserOwnerVaultRecordV1 {
  return {
    ...stored,
    lastAccessedAt: Date.now(),
  };
}

export async function readResponseCueVoiceClip(
  ownerId: string,
  key: string,
): Promise<EnglishVoiceSynthesisClip | null> {
  const coordinates = await responseCueRecordCoordinates(ownerId, key);
  if (!coordinates) return null;
  const fallbackKey = `${coordinates.ownerKeyId}:${coordinates.key}`;
  const fallback = memoryFallback.get(fallbackKey);
  if (fallback) {
    const touched = touchStoredRecord(fallback);
    memoryFallback.set(fallbackKey, touched);
    return storedClipAsEnglishClip({ ownerId, key, stored: touched });
  }
  const database = await openResponseCueDatabase();
  if (!database) return null;
  const stored = await new Promise<BrowserOwnerVaultRecordV1 | null>((resolve) => {
    const transaction = database.transaction(RESPONSE_CUE_STORE, "readonly");
    const store = transaction.objectStore(RESPONSE_CUE_STORE);
    const request = store.get(coordinates.key);
    request.onsuccess = () =>
      resolve((request.result as BrowserOwnerVaultRecordV1 | undefined) ?? null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
  });
  if (!stored) return null;
  const touched = touchStoredRecord(stored);
  const clip = await storedClipAsEnglishClip({ ownerId, key, stored: touched });
  const updateDatabase = await openResponseCueDatabase();
  if (updateDatabase) {
    await new Promise<void>((resolve) => {
      const transaction = updateDatabase.transaction(
        RESPONSE_CUE_STORE,
        "readwrite",
      );
      const store = transaction.objectStore(RESPONSE_CUE_STORE);
      if (clip) store.put(touched);
      else store.delete(coordinates.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
    updateDatabase.close();
  }
  if (!clip) return null;
  memoryFallback.set(fallbackKey, touched);
  return clip;
}

export async function storeResponseCueVoiceClip(
  ownerId: string,
  key: string,
  clip: EnglishVoiceSynthesisClip,
): Promise<void> {
  const stored = await sealBrowserOwnerPayloadV1({
    ownerId,
    logicalStore: RESPONSE_CUE_VAULT_STORE,
    logicalKey: key,
    plaintext: serializeResponseCueClip(clip),
  });
  if (!stored) return;
  memoryFallback.set(memoryKey(stored), stored);
  const ownerMemoryRecords = [...memoryFallback.values()]
    .filter((record) => record.ownerKeyId === stored.ownerKeyId)
    .sort(
      (left, right) => left.lastAccessedAt - right.lastAccessedAt,
    );
  for (const oldest of ownerMemoryRecords.slice(
    0,
    Math.max(0, ownerMemoryRecords.length - RESPONSE_CUE_CACHE_MAX_ENTRIES),
  )) {
    memoryFallback.delete(memoryKey(oldest));
  }
  const database = await openResponseCueDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(RESPONSE_CUE_STORE, "readwrite");
    const store = transaction.objectStore(RESPONSE_CUE_STORE);
    store.put(stored);
    const all = store.getAll();
    all.onsuccess = () => {
      const records = (all.result as BrowserOwnerVaultRecordV1[])
        .filter((record) => record.ownerKeyId === stored.ownerKeyId)
        .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt);
      for (const stale of records.slice(RESPONSE_CUE_CACHE_MAX_ENTRIES)) {
        store.delete(stale.key);
      }
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      resolve();
    };
  });
}

export async function getOrPrepareResponseCueVoiceClip(
  ownerId: string,
  key: string,
  synthesize: () => Promise<EnglishVoiceSynthesisClip>,
): Promise<EnglishVoiceSynthesisClip | null> {
  const cached = await readResponseCueVoiceClip(ownerId, key);
  if (cached) return cached;
  try {
    const clip = await synthesize();
    await storeResponseCueVoiceClip(ownerId, key, clip);
    return clip;
  } catch {
    return null;
  }
}

export async function purgeResponseCueVoiceClipsForOwner(
  ownerId: string,
): Promise<void> {
  const coordinates = await responseCueRecordCoordinates(ownerId, "owner-purge");
  if (!coordinates) return;
  for (const [key, record] of memoryFallback.entries()) {
    if (record.ownerKeyId === coordinates.ownerKeyId) memoryFallback.delete(key);
  }
  const database = await openResponseCueDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(RESPONSE_CUE_STORE, "readwrite");
    const store = transaction.objectStore(RESPONSE_CUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const record of request.result as BrowserOwnerVaultRecordV1[]) {
        if (record.ownerKeyId === coordinates.ownerKeyId) store.delete(record.key);
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
  database.close();
}
