import type {
  ReplayManifest,
  ReplayManifestV2,
  ReplayPremiumSegmentV1,
  ReplayRecordingV1,
  ReplayStudioCutEligibilityV1,
  ReplayPremiumAudioActionV1,
  ReplayTimelineV1,
  ReplayVoiceTakeRecordV1,
  ReplayVoiceTakeV1,
} from "@localai/shared";
import type { ReplayAudioMasterCaptureResult } from "./replayAudioMasterCapture.ts";
import {
  discardPendingFaithfulReplayCapture,
  pendingFaithfulReplayCaptures,
  retainPendingFaithfulReplayCapture,
} from "./replayPendingCapture.ts";

/** Browser replay requests authenticate only through HttpOnly cookies. */
export function replayAuthHeaders(): Record<string, string> {
  return {};
}

export async function replayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(new URL(path, window.location.origin), {
    credentials: "include",
    ...init,
    headers: {
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
  ownerId: string;
  surface: "signal" | "coffee";
  sourceId: string;
  snapshot: ReplayVoiceTakeV1;
}): Promise<ReplayVoiceTakeRecordV1> {
  const key = `${args.ownerId}:${args.surface}:${args.sourceId}:${args.snapshot.sourceKey}`;
  const existing = replayTakePromises.get(key);
  if (existing) return existing;
  const requestBody = {
    surface: args.surface,
    sourceId: args.sourceId,
    snapshot: args.snapshot,
  };
  const pending = replayJson<{ ok: true; take: ReplayVoiceTakeRecordV1 }>(
    "/api/replays/takes",
    {
      method: "POST",
      body: JSON.stringify(requestBody),
    },
  ).then((result) => result.take);
  replayTakePromises.set(key, pending);
  void pending.finally(() => {
    if (replayTakePromises.get(key) === pending) replayTakePromises.delete(key);
  }).catch(() => undefined);
  return pending;
}

export async function updateCapturedReplayVoiceTake(
  takePromise: Promise<ReplayVoiceTakeRecordV1>,
  patch: {
    durationMs?: number | null;
    resolvedEngine?: string | null;
    alignment?: ReplayVoiceTakeV1["alignment"];
    sourceMessageId?: string | null;
    resolvedModelHash?: string | null;
    resolvedPronunciation?: ReplayVoiceTakeV1["resolvedPronunciation"];
    resolvedSpeechprint?: ReplayVoiceTakeV1["resolvedSpeechprint"];
    segmentTimings?: ReplayVoiceTakeV1["segmentTimings"];
    heardCompletion?: ReplayVoiceTakeV1["heardCompletion"];
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
  resolvedModelHash?: string | null;
  resolvedPronunciation?: ReplayVoiceTakeV1["resolvedPronunciation"];
  resolvedSpeechprint?: ReplayVoiceTakeV1["resolvedSpeechprint"];
  alignment?: ReplayVoiceTakeV1["alignment"];
}): Promise<ReplayVoiceTakeRecordV1> {
  let take = await args.takePromise;
  if (
    args.durationMs !== undefined ||
    args.resolvedEngine !== undefined ||
    args.resolvedModelHash !== undefined ||
    args.resolvedPronunciation !== undefined ||
    args.resolvedSpeechprint !== undefined ||
    args.alignment !== undefined
  ) {
    take = await updateCapturedReplayVoiceTake(Promise.resolve(take), {
      durationMs: args.durationMs,
      resolvedEngine: args.resolvedEngine,
      resolvedModelHash: args.resolvedModelHash,
      resolvedPronunciation: args.resolvedPronunciation,
      resolvedSpeechprint: args.resolvedSpeechprint,
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

export async function loadCapturedReplayVoiceAudio(args: {
  surface: "signal" | "coffee";
  sourceId: string;
  sourceKey: string;
}): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  resolvedEngine: string | null;
  alignment: ReplayVoiceTakeV1["alignment"];
} | null> {
  const recording = await replayRecordingForSource(args.surface, args.sourceId);
  if (!recording) return null;
  const detail = await replayRecordingDetail(recording.id);
  const take = detail.takes.find(
    (candidate) =>
      candidate.snapshot.sourceKey === args.sourceKey &&
      candidate.status === "captured" &&
      candidate.audioUrl,
  );
  if (!take) return null;
  const response = await replayFetch(
    `/api/replays/${encodeURIComponent(take.recordingId)}/takes/${encodeURIComponent(take.id)}/audio`,
  );
  if (!response.ok) return null;
  return {
    bytes: await response.arrayBuffer(),
    contentType:
      response.headers.get("content-type") ??
      take.audioContentType ??
      "application/octet-stream",
    resolvedEngine: take.snapshot.resolvedEngine,
    alignment: take.snapshot.alignment,
  };
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
  ownerId: string;
  surface: "signal" | "coffee";
  sourceId: string;
  manifest: ReplayManifestV2;
  capture: ReplayAudioMasterCaptureResult | null;
}): Promise<ReplayRecordingV1> {
  await retainPendingFaithfulReplayCapture({
    ownerId: args.ownerId,
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
    ownerId: args.ownerId,
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
  await discardPendingFaithfulReplayCapture(
    args.ownerId,
    args.surface,
    args.sourceId,
  );
  return recording;
}

export async function retryPendingFaithfulReplaySessions(
  ownerId: string,
): Promise<number> {
  const pending = await pendingFaithfulReplayCaptures(ownerId);
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
        ownerId,
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

export async function replayStudioCutEligibility(
  recordingId: string,
): Promise<ReplayStudioCutEligibilityV1> {
  const result = await replayJson<{
    ok: true;
    eligibility: ReplayStudioCutEligibilityV1;
  }>(
    `/api/replays/${encodeURIComponent(recordingId)}/studio-cut/eligibility`,
  );
  return result.eligibility;
}

export async function startReplayStudioCut(
  recordingId: string,
  intent: ReplayPremiumAudioActionV1,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{
    ok: true;
    recording: ReplayRecordingV1;
  }>(`/api/replays/${encodeURIComponent(recordingId)}/studio-cut`, {
    method: "POST",
    body: JSON.stringify({
      confirm: "send-to-elevenlabs",
      intent,
    }),
  });
  window.dispatchEvent(new CustomEvent("prism:replay-recording-changed"));
  return result.recording;
}

export async function resumeReplayStudioCut(recordingId: string): Promise<void> {
  await replayJson(
    `/api/replays/${encodeURIComponent(recordingId)}/studio-cut/resume`,
    { method: "POST", body: "{}" },
  );
}

export async function claimReplayStudioCutMix(recordingId: string): Promise<{
  recording: ReplayRecordingV1;
  takes: ReplayVoiceTakeRecordV1[];
  premiumSegments: ReplayPremiumSegmentV1[];
  renderToken: string;
} | null> {
  const result = await replayJson<{
    ok: true;
    claimed: {
      recording: ReplayRecordingV1;
      takes: ReplayVoiceTakeRecordV1[];
      premiumSegments: ReplayPremiumSegmentV1[];
      renderToken: string;
    } | null;
  }>(
    `/api/replays/${encodeURIComponent(recordingId)}/studio-cut/mix/claim`,
    { method: "POST", body: "{}" },
  );
  return result.claimed;
}

export async function retryReplayStudioCutMix(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}/studio-cut/mix/retry`,
    { method: "POST", body: "{}" },
  );
  window.dispatchEvent(new CustomEvent("prism:replay-recording-changed"));
  return result.recording;
}

export async function completeReplayStudioCutMix(args: {
  recordingId: string;
  renderToken: string;
  durationMs: number;
  timeline: ReplayTimelineV1;
  manifest: ReplayManifestV2;
  warning?: string | null;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(args.recordingId)}/studio-cut/mix/complete`,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
  window.dispatchEvent(new CustomEvent("prism:replay-recording-changed"));
  return result.recording;
}

export async function failReplayStudioCutMix(args: {
  recordingId: string;
  renderToken: string;
  error: string;
}): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(args.recordingId)}/studio-cut/mix/fail`,
    {
      method: "POST",
      body: JSON.stringify(args),
    },
  );
  window.dispatchEvent(new CustomEvent("prism:replay-recording-changed"));
  return result.recording;
}

export async function removeReplayStudioCut(
  recordingId: string,
): Promise<ReplayRecordingV1> {
  const result = await replayJson<{ ok: true; recording: ReplayRecordingV1 }>(
    `/api/replays/${encodeURIComponent(recordingId)}/studio-cut`,
    {
      method: "DELETE",
      body: JSON.stringify({ confirm: "delete-studio-cut" }),
    },
  );
  window.dispatchEvent(new CustomEvent("prism:replay-recording-changed"));
  return result.recording;
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
