import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";
import type { EnglishVoiceSynthesisClip } from "./englishVoice";

const RESPONSE_CUE_DB_NAME = "prism-response-cues-v1";
const RESPONSE_CUE_STORE = "clips";
const RESPONSE_CUE_CACHE_MAX_ENTRIES = 48;

export interface ResponseCueVoiceCacheKeyInput {
  botId: string;
  voiceProfile: BotAudioVoiceProfileV1;
  engine: string;
  model?: string | null;
  phrase: string;
  deliverySettings?: Record<string, unknown>;
}

interface StoredResponseCueClip {
  key: string;
  bytes: ArrayBuffer;
  alignment: EnglishVoiceSynthesisClip["alignment"];
  audioContentType: string;
  engineUsed: string | null;
  lastAccessedAt: number;
}

const memoryFallback = new Map<string, StoredResponseCueClip>();

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
    v: 1,
    botId: input.botId,
    voiceProfile: normalizeBotAudioVoiceProfileV1(input.voiceProfile),
    engine: input.engine,
    model: input.model ?? null,
    phrase: input.phrase.replace(/\s+/gu, " ").trim(),
    deliverySettings: input.deliverySettings ?? {},
  });
}

function openResponseCueDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(RESPONSE_CUE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RESPONSE_CUE_STORE)) {
        database.createObjectStore(RESPONSE_CUE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function storedClipAsEnglishClip(
  stored: StoredResponseCueClip,
): EnglishVoiceSynthesisClip {
  return {
    bytes: stored.bytes.slice(0),
    alignment: stored.alignment,
    audioContentType: stored.audioContentType,
    engineUsed: stored.engineUsed,
  };
}

export async function readResponseCueVoiceClip(
  key: string,
): Promise<EnglishVoiceSynthesisClip | null> {
  const fallback = memoryFallback.get(key);
  if (fallback) {
    fallback.lastAccessedAt = Date.now();
    return storedClipAsEnglishClip(fallback);
  }
  const database = await openResponseCueDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const transaction = database.transaction(RESPONSE_CUE_STORE, "readwrite");
    const store = transaction.objectStore(RESPONSE_CUE_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const stored = request.result as StoredResponseCueClip | undefined;
      if (!stored) {
        resolve(null);
        return;
      }
      stored.lastAccessedAt = Date.now();
      store.put(stored);
      memoryFallback.set(key, stored);
      resolve(storedClipAsEnglishClip(stored));
    };
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
  });
}

export async function storeResponseCueVoiceClip(
  key: string,
  clip: EnglishVoiceSynthesisClip,
): Promise<void> {
  const stored: StoredResponseCueClip = {
    key,
    bytes: clip.bytes.slice(0),
    alignment: clip.alignment,
    audioContentType: clip.audioContentType,
    engineUsed: clip.engineUsed,
    lastAccessedAt: Date.now(),
  };
  memoryFallback.set(key, stored);
  while (memoryFallback.size > RESPONSE_CUE_CACHE_MAX_ENTRIES) {
    const oldest = [...memoryFallback.values()].sort(
      (left, right) => left.lastAccessedAt - right.lastAccessedAt,
    )[0];
    if (!oldest) break;
    memoryFallback.delete(oldest.key);
  }
  const database = await openResponseCueDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(RESPONSE_CUE_STORE, "readwrite");
    const store = transaction.objectStore(RESPONSE_CUE_STORE);
    store.put(stored);
    const all = store.getAll();
    all.onsuccess = () => {
      const records = (all.result as StoredResponseCueClip[]).sort(
        (left, right) => right.lastAccessedAt - left.lastAccessedAt,
      );
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
  key: string,
  synthesize: () => Promise<EnglishVoiceSynthesisClip>,
): Promise<EnglishVoiceSynthesisClip | null> {
  const cached = await readResponseCueVoiceClip(key);
  if (cached) return cached;
  try {
    const clip = await synthesize();
    await storeResponseCueVoiceClip(key, clip);
    return clip;
  } catch {
    return null;
  }
}
