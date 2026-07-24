import type {
  ReplayManifest,
  ReplayManifestV2,
  ReplayPremiumSegmentV1,
  ReplayRecordingV1,
  ReplayVoiceTakeRecordV1,
  ReplayVoiceTakeV1,
} from "@localai/shared";
import type { ReplayAudioMasterCaptureResult } from "./replayAudioMasterCapture.ts";
import {
  discardPendingFaithfulReplayCapture,
  pendingFaithfulReplayCaptures,
  retainPendingFaithfulReplayCapture,
} from "./replayPendingCapture.ts";

const NATIVE_SESSION_STORAGE_KEY = "prism_native_session_token";
const CLIENT_ACCESS_STORAGE_KEY = "prism_client_access_token";

export function replayAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const nativeSessionToken = window.localStorage.getItem(
      NATIVE_SESSION_STORAGE_KEY,
    );
    const clientAccessToken = window.localStorage.getItem(
      CLIENT_ACCESS_STORAGE_KEY,
    );
    return {
      ...(nativeSessionToken
        ? { authorization: `Bearer ${nativeSessionToken}` }
        : {}),
      ...(clientAccessToken
        ? { "x-prism-client-access": clientAccessToken }
        : {}),
    };
  } catch {
    return {};
  }
}

export async function replayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(new URL(path, window.location.origin), {
    credentials: "include",
    ...init,
    headers: {
      ...replayAuthHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

async function replayJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await replayFetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Replay request failed (${response.status}).`);
  }
  return payload;
}

const replayTakePromises = new Map<string, Promise<ReplayVoiceTakeRecordV1>>();

export function captureReplayVoiceTake(args: {
  surface: "signal" | "coffee";
  sourceId: string;
  snapshot: ReplayVoiceTakeV1;
}): Promise<ReplayVoiceTakeRecordV1> {
  const key = `${args.surface}:${args.sourceId}:${args.snapshot.sourceKey}`;
  const existing = replayTakePromises.get(key);
  if (existing) return existing;
  const pending = replayJson<{ ok: true; take: ReplayVoiceTakeRecordV1 }>(
    "/api/replays/takes",
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  ).then((result) => result.take);
  replayTakePromises.set(key, pending);
  void pending.catch(() => {
    if (replayTakePromises.get(key) === pending) replayTakePromises.delete(key);
  });
  return pending;
}

export async function updateCapturedReplayVoiceTake(
  takePromise: Promise<ReplayVoiceTakeRecordV1>,
  patch: {
    durationMs?: number | null;
    resolvedEngine?: string | null;
    alignment?: ReplayVoiceTakeV1["alignment"];
    sourceMessageId?: string | null;
  },
): Promise<ReplayVoiceTakeRecordV1> {
  const take = await takePromise;
  const result = await replayJson<{ ok: true; take: ReplayVoiceTakeRecordV1 }>(
    `/api/replays/${encodeURIComponent(take.recordingId)}/takes/${encodeURIComponent(take.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return result.take;
}

export async function storeCapturedReplayVoiceAudio(args: {
  takePromise: Promise<ReplayVoiceTakeRecordV1>;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs?: number | null;
  resolvedEngine?: string | null;
  alignment?: ReplayVoiceTakeV1["alignment"];
}): Promise<ReplayVoiceTakeRecordV1> {
  let take = await args.takePromise;
  if (
    args.durationMs !== undefined ||
    args.resolvedEngine !== undefined ||
    args.alignment !== undefined
  ) {
    take = await updateCapturedReplayVoiceTake(Promise.resolve(take), {
      durationMs: args.durationMs,
      resolvedEngine: args.resolvedEngine,
      alignment: args.alignment,
    });
  }
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(take.recordingId)}/takes/${encodeURIComponent(take.id)}/audio`,
    {
      method: "POST",
      headers: { "content-type": args.contentType },
      body: args.bytes,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; take: ReplayVoiceTakeRecordV1; error?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Replay audio capture failed (${response.status}).`);
  }
  return payload.take;
}

export async function queueReplayManifest(
  manifest: ReplayManifest,
  options: { render?: boolean } = {},
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    "/api/replays/queue",
    {
      method: "POST",
      body: JSON.stringify({ manifest, render: options.render !== false }),
    },
  );
  return result.recording;
}

export async function startReplayRecordingDraft(args: {
  surface: "signal" | "coffee";
  sourceId: string;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    "/api/replays/start",
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
  return result.recording;
}

export async function finalizeReplayRecording(args: {
  recordingId: string;
  manifest: ReplayManifestV2;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(args.recordingId)}/finalize`,
    {
      method: "POST",
      body: JSON.stringify({ manifest: args.manifest }),
    },
  );
  return result.recording;
}

export async function saveFaithfulReplaySession(args: {
  surface: "signal" | "coffee";
  sourceId: string;
  manifest: ReplayManifestV2;
  capture: ReplayAudioMasterCaptureResult | null;
}): Promise<ReplayRecordingV1> {
  await retainPendingFaithfulReplayCapture({
    surface: args.surface,
    sourceId: args.sourceId,
    recordingId: null,
    bytes: args.capture?.bytes ?? null,
    contentType: args.capture?.contentType ?? null,
    durationMs: args.capture?.durationMs ?? null,
    manifest: args.manifest,
  });
  const draft = await startReplayRecordingDraft({
    surface: args.surface,
    sourceId: args.sourceId,
  });
  await retainPendingFaithfulReplayCapture({
    surface: args.surface,
    sourceId: args.sourceId,
    recordingId: draft.id,
    bytes: args.capture?.bytes ?? null,
    contentType: args.capture?.contentType ?? null,
    durationMs: args.capture?.durationMs ?? null,
    manifest: args.manifest,
  });
  if (args.capture) {
    await uploadReplayFaithfulAudio({
      recordingId: draft.id,
      bytes: args.capture.bytes,
      contentType: args.capture.contentType,
      durationMs: args.capture.durationMs,
    });
  }
  const recording = await finalizeReplayRecording({
    recordingId: draft.id,
    manifest: args.manifest,
  });
  await discardPendingFaithfulReplayCapture(args.surface, args.sourceId);
  return recording;
}

export async function retryPendingFaithfulReplaySessions(): Promise<number> {
  const pending = await pendingFaithfulReplayCaptures();
  let completed = 0;
  for (const capture of pending) {
    try {
      const recordingId =
        capture.recordingId ??
        (
          await startReplayRecordingDraft({
            surface: capture.surface,
            sourceId: capture.sourceId,
          })
        ).id;
      if (
        capture.bytes &&
        capture.contentType &&
        capture.durationMs !== null
      ) {
        await uploadReplayFaithfulAudio({
          recordingId,
          bytes: capture.bytes,
          contentType: capture.contentType,
          durationMs: capture.durationMs,
        });
      }
      await finalizeReplayRecording({
        recordingId,
        manifest: capture.manifest,
      });
      await discardPendingFaithfulReplayCapture(
        capture.surface,
        capture.sourceId,
      );
      completed += 1;
    } catch {
      // Keep the durable capture for the next authenticated retry.
    }
  }
  return completed;
}

export async function replayRecordingForSource(
  surface: "signal" | "coffee",
  sourceId: string,
): Promise<ReplayRecordingV1 | null> {
  const result = await replayJson<{
    ok: true;
    recordings: ReplayRecordingV1[];
  }>(
    `/api/replays?surface=${surface}&sourceId=${encodeURIComponent(sourceId)}`,
  );
  return result.recordings[0] ?? null;
}

export async function replayRecordingDetail(recordingId: string): Promise<{
  recording: ReplayRecordingV1;
  takes: ReplayVoiceTakeRecordV1[];
  premiumSegments: ReplayPremiumSegmentV1[];
}> {
  const result = await replayJson<{
    ok: true;
    recording: ReplayRecordingV1;
    takes: ReplayVoiceTakeRecordV1[];
    premiumSegments: ReplayPremiumSegmentV1[];
  }>(`/api/replays/${encodeURIComponent(recordingId)}`);
  return {
    recording: result.recording,
    takes: result.takes,
    premiumSegments: result.premiumSegments,
  };
}

export async function uploadReplayFaithfulAudio(args: {
  recordingId: string;
  bytes: ArrayBuffer;
  contentType: string;
  durationMs: number;
}): Promise<ReplayRecordingV1> {
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(args.recordingId)}/audio`,
    {
      method: "POST",
      headers: {
        "content-type": args.contentType,
        "x-prism-audio-duration-ms": String(Math.max(1, args.durationMs)),
      },
      body: args.bytes,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { ok: true; recording: ReplayRecordingV1; error?: string }
    | null;
  if (!response.ok || !payload) {
    throw new Error(
      payload?.error ?? `Faithful replay audio upload failed (${response.status}).`,
    );
  }
  return payload.recording;
}

export async function deleteReplayRecording(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ confirm: "delete-recording" }),
    },
  );
  return result.recording;
}
