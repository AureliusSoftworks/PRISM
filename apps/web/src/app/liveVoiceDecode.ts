"use client";

export interface LiveVoicePcm {
  sampleRate: number;
  frameCount: number;
  channels: ArrayBuffer[];
}

export interface OwnedLiveVoiceDecodeResult {
  pcm: LiveVoicePcm | null;
  /** Returned only when a transferred source could not be decoded. */
  fallbackBytes: ArrayBuffer | null;
}

type LiveVoiceDecodeReply =
  | ({ id: number; ok: true } & LiveVoicePcm)
  | { id: number; ok: false; error: string; bytes?: ArrayBuffer };

interface PendingLiveVoiceDecode {
  resolve: (result: OwnedLiveVoiceDecodeResult) => void;
  fallbackBytes: ArrayBuffer | null;
  timeout: number;
}

const LIVE_VOICE_DECODE_TIMEOUT_MS = 12_000;
const LIVE_VOICE_DECODE_MAX_BYTES = 24 * 1024 * 1024;

let decoderWorker: Worker | null = null;
let decoderRequestId = 0;
const pendingDecodes = new Map<number, PendingLiveVoiceDecode>();

function settlePendingDecode(
  id: number,
  pcm: LiveVoicePcm | null,
  returnedBytes: ArrayBuffer | null = null,
): void {
  const pending = pendingDecodes.get(id);
  if (!pending) return;
  pendingDecodes.delete(id);
  window.clearTimeout(pending.timeout);
  pending.resolve({
    pcm,
    fallbackBytes: pcm
      ? null
      : returnedBytes ?? pending.fallbackBytes,
  });
}

function failAllPendingDecodes(): void {
  for (const id of [...pendingDecodes.keys()]) settlePendingDecode(id, null);
}

function liveVoiceDecoderWorker(): Worker | null {
  if (decoderWorker) return decoderWorker;
  if (typeof Worker !== "function") return null;
  try {
    const worker = new Worker(
      new URL("./liveVoiceDecodeWorker.ts", import.meta.url),
      { type: "module", name: "prism-live-voice-decoder" },
    );
    worker.addEventListener("message", (event: MessageEvent<LiveVoiceDecodeReply>) => {
      const reply = event.data;
      if (!reply || typeof reply.id !== "number") return;
      settlePendingDecode(
        reply.id,
        reply.ok
          ? {
              sampleRate: reply.sampleRate,
              frameCount: reply.frameCount,
              channels: reply.channels,
            }
          : null,
        reply.ok ? null : reply.bytes ?? null,
      );
    });
    worker.addEventListener("error", () => {
      failAllPendingDecodes();
      worker.terminate();
      if (decoderWorker === worker) decoderWorker = null;
    });
    decoderWorker = worker;
    return worker;
  } catch {
    decoderWorker = null;
    return null;
  }
}

/**
 * Decode a bounded voice clip away from the UI thread. The returned channel
 * buffers are transferred, not cloned, so installing them into Web Audio is a
 * short copy rather than a browser media/decode lifecycle on the live stage.
 */
export function decodeLiveVoicePcm(
  bytes: ArrayBuffer,
): Promise<LiveVoicePcm | null> {
  return requestLiveVoicePcm(bytes, false).then((result) => result.pcm);
}

/**
 * Transfer a one-shot live clip into the decoder instead of cloning it on the
 * renderer. Decode failures transfer the original bytes back for the media
 * fallback; successful calls leave only transferable PCM channel buffers.
 */
export function decodeLiveVoicePcmOwned(
  bytes: ArrayBuffer,
): Promise<OwnedLiveVoiceDecodeResult> {
  return requestLiveVoicePcm(bytes, true);
}

function requestLiveVoicePcm(
  bytes: ArrayBuffer,
  transferOwnership: boolean,
): Promise<OwnedLiveVoiceDecodeResult> {
  if (bytes.byteLength <= 0 || bytes.byteLength > LIVE_VOICE_DECODE_MAX_BYTES) {
    return Promise.resolve({ pcm: null, fallbackBytes: bytes });
  }
  const worker = liveVoiceDecoderWorker();
  if (!worker) return Promise.resolve({ pcm: null, fallbackBytes: bytes });
  const id = ++decoderRequestId;
  const transferableBytes = transferOwnership ? bytes : bytes.slice(0);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(
      () => settlePendingDecode(id, null),
      LIVE_VOICE_DECODE_TIMEOUT_MS,
    );
    pendingDecodes.set(id, {
      resolve,
      fallbackBytes: transferOwnership ? null : bytes,
      timeout,
    });
    try {
      worker.postMessage({ id, bytes: transferableBytes }, [transferableBytes]);
    } catch {
      settlePendingDecode(
        id,
        null,
        transferableBytes.byteLength > 0 ? transferableBytes : null,
      );
    }
  });
}
